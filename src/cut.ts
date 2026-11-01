/**
 * The one cut: keep recent user turns, cap the retained tail, and never start
 * the live tail with an orphan tool result.
 *
 * The cut only selects what Pi keeps verbatim. The capsule is always rebuilt
 * from the full effective history, so a short tail never hides user intent.
 * Positions are raw branch entries; editing and projection happen afterwards.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  estimateMessageChars,
  estimateTokensFromChars,
  tailTokenLimit,
} from "./budget";
import type { SourceSnapshot } from "./source";

/** keep:N in free-form /compact instructions; the rest is query material. */
const KEEP_INSTRUCTION_RE = /(?:^|\s)keep:(\d+)(?=\s|$)/i;

export interface ParsedCompactionInstructions {
  /** Explicit keep:N, when the user typed one. */
  keep?: number;
  /** The instructions with the keep token removed, trimmed. */
  instructions: string;
}

export const parseCompactionInstructions = (
  customInstructions?: string,
): ParsedCompactionInstructions => {
  const raw = customInstructions ?? "";
  const match = KEEP_INSTRUCTION_RE.exec(raw);
  if (!match || match.index === undefined || match[1] === undefined) {
    return { instructions: raw.trim() };
  }
  const keep = Number(match[1]);
  const withoutKeep = (
    raw.slice(0, match.index) + raw.slice(match.index + match[0].length)
  )
    .replace(/\s+/g, " ")
    .trim();
  return Number.isFinite(keep)
    ? { keep: Math.max(0, Math.floor(keep)), instructions: withoutKeep }
    : { instructions: withoutKeep };
};

export type CutReason =
  | "keep-turns"
  | "tail-budget"
  | "overflow-budget"
  | "compact-all";

export interface Cut {
  /** Host-facing start of the retained tail; empty string means compact all. */
  readonly firstKeptEntryId: string;
  /** Branch index of the first kept entry, or branch.length for compact-all. */
  readonly cutIndex: number;
  readonly reason: CutReason;
  /** keep:N the caller asked for, before any budget adjustment. */
  readonly requestedKeep: number;
  /** User turns actually retained in the tail. */
  readonly keptUserTurns: number;
  /** User turns present in the current context window. */
  readonly totalUserTurns: number;
  /** Estimated tokens in the retained tail. */
  readonly tailTokens: number;
  /** The cap that applied to this cut. */
  readonly tailTokenLimit: number;
}

export type CutFailureReason = "nothing_to_compact";

export type CutResult =
  | { ok: true; cut: Cut }
  | { ok: false; reason: CutFailureReason };

export interface ChooseCutInput {
  readonly snapshot: SourceSnapshot;
  /** Effective keep count: explicit keep:N or the saved setting. */
  readonly keepUserTurns: number;
  readonly reason: "manual" | "threshold" | "overflow";
  readonly contextWindow: number;
}

/**
 * Start of the current context window: the retained range of the newest
 * compaction node, or the whole branch before any compaction. Counting user
 * turns from the whole raw branch would cut inside already-summarized history.
 */
export const liveWindowStartIndex = (
  branch: readonly SessionEntry[],
): number => {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (!entry || entry.type !== "compaction") continue;
    const kept = entry.firstKeptEntryId;
    if (!kept) return index + 1;
    const keptIndex = branch.findIndex((candidate) => candidate.id === kept);
    if (keptIndex < 0 || keptIndex >= index) return index + 1;
    return keptIndex;
  }
  return 0;
};

const isTurnStart = (entry: SessionEntry): boolean =>
  entry.type === "message" && entry.message.role === "user";

/**
 * Boundaries Pi can safely start a retained tail at. Tool results need their
 * call in context, system entries carry prompt state rather than conversation,
 * and derived summary messages are not a turn boundary.
 */
export const isValidTailBoundary = (entry: SessionEntry): boolean => {
  if (entry.type === "custom_message") return true;
  if (entry.type !== "message") return false;
  const role = entry.message.role;
  return role !== "toolResult" && role !== "system";
};

/** True when the entry can contribute conversation text to a summary. */
const isContextMessage = (entry: SessionEntry): boolean => {
  if (entry.type === "custom_message") return true;
  if (entry.type !== "message") return false;
  const message = entry.message;
  if (message.role === "system") return false;
  if (message.role === "bashExecution" && message.excludeFromContext) {
    return false;
  }
  return true;
};

/** Chars a branch entry contributes to model context. */
const entryChars = (entry: SessionEntry): number => {
  if (entry.type === "message") return estimateMessageChars(entry.message);
  if (entry.type === "custom_message") {
    return estimateMessageChars({ role: "custom", content: entry.content });
  }
  return 0;
};

const countMessageEntries = (
  branch: readonly SessionEntry[],
  start: number,
  end: number,
): number => {
  let count = 0;
  for (let index = start; index < end; index++) {
    const entry = branch[index];
    if (entry && isContextMessage(entry)) count++;
  }
  return count;
};

const normalizeKeep = (keep: number): number =>
  Number.isFinite(keep) ? Math.max(0, Math.floor(keep)) : 0;

/**
 * Choose the retained tail. Returns a failure only when no meaningful prefix
 * can be summarized; returning nothing from the hook would let Pi call its
 * model summarizer, so callers turn this into cancel:true.
 */
export const chooseCut = (input: ChooseCutInput): CutResult => {
  const branch = input.snapshot.branch;
  if (branch.length === 0) return { ok: false, reason: "nothing_to_compact" };

  const windowStart = liveWindowStartIndex(branch);
  const maxTokens = tailTokenLimit(input.contextWindow, input.reason);
  const requestedKeep = normalizeKeep(input.keepUserTurns);

  const userIndices: number[] = [];
  for (let index = windowStart; index < branch.length; index++) {
    const entry = branch[index];
    if (entry && isTurnStart(entry)) userIndices.push(index);
  }

  // Suffix token estimates once, so every candidate boundary is O(1).
  const suffixTokens = new Array<number>(branch.length + 1).fill(0);
  for (let index = branch.length - 1; index >= windowStart; index--) {
    const entry = branch[index];
    const chars = entry ? entryChars(entry) : 0;
    suffixTokens[index] =
      (suffixTokens[index + 1] ?? 0) + estimateTokensFromChars(chars);
  }

  const keptUserTurnsFrom = (cutIndex: number): number =>
    userIndices.filter((index) => index >= cutIndex).length;

  const cutAt = (index: number, reason: CutReason): CutResult => ({
    ok: true,
    cut: {
      firstKeptEntryId: branch[index]?.id ?? "",
      cutIndex: index,
      reason,
      requestedKeep,
      keptUserTurns: keptUserTurnsFrom(index),
      totalUserTurns: userIndices.length,
      tailTokens: suffixTokens[index] ?? 0,
      tailTokenLimit: maxTokens,
    },
  });

  const compactAll = (): CutResult => ({
    ok: true,
    cut: {
      firstKeptEntryId: "",
      cutIndex: branch.length,
      reason: "compact-all",
      requestedKeep,
      keptUserTurns: 0,
      totalUserTurns: userIndices.length,
      tailTokens: 0,
      tailTokenLimit: maxTokens,
    },
  });

  if (requestedKeep <= 0) return compactAll();

  const hasPrefixAt = (index: number): boolean =>
    countMessageEntries(branch, windowStart, index) > 0;

  const firstBoundaryAtOrAfter = (from: number): number => {
    for (let index = Math.max(0, from); index < branch.length; index++) {
      const entry = branch[index];
      if (entry && isValidTailBoundary(entry)) return index;
    }
    return -1;
  };

  // The first boundary that fits the cap and leaves a summarizable prefix.
  const firstFittingBoundary = (from: number): number => {
    for (let index = from; index < branch.length; index++) {
      const entry = branch[index];
      if (!entry || !isValidTailBoundary(entry)) continue;
      if ((suffixTokens[index] ?? 0) > maxTokens) continue;
      if (!hasPrefixAt(index)) continue;
      return index;
    }
    return -1;
  };

  const latestBoundary = (from: number): number => {
    for (let index = branch.length - 1; index >= from; index--) {
      const entry = branch[index];
      if (entry && isValidTailBoundary(entry) && hasPrefixAt(index)) return index;
    }
    return -1;
  };

  let candidate: number;
  if (userIndices.length === 0) {
    // No user anchor: keep the newest valid boundary by budget only.
    candidate = firstBoundaryAtOrAfter(windowStart);
  } else {
    const target = userIndices.length - requestedKeep;
    candidate = target >= 0 ? (userIndices[target] ?? windowStart) : (userIndices[0] ?? windowStart);
  }
  if (candidate < 0) return { ok: false, reason: "nothing_to_compact" };

  const candidateTokens = suffixTokens[candidate] ?? 0;
  const hasPrefix = hasPrefixAt(candidate);

  if (candidateTokens <= maxTokens) {
    // The requested tail fits. Without a summarizable prefix there is nothing
    // this compaction could replace, so cancel instead of storing a no-op.
    if (!hasPrefix) return { ok: false, reason: "nothing_to_compact" };
    return cutAt(candidate, userIndices.length === 0 ? "tail-budget" : "keep-turns");
  }

  // Over the cap: move forward to the nearest boundary whose tail fits and
  // whose prefix still renders. This is also the rescue for one oversized
  // turn, where the requested keep by itself leaves no prefix.
  const budgetReason: CutReason =
    input.reason === "overflow" ? "overflow-budget" : "tail-budget";
  const fitting = firstFittingBoundary(candidate + 1);
  if (fitting >= 0) return cutAt(fitting, budgetReason);

  // Nothing fits; cut as far forward as still leaves a prefix. A single
  // over-budget message may remain: there is no smaller legal tail.
  const latest = latestBoundary(candidate + 1);
  if (latest >= 0) return cutAt(latest, budgetReason);

  return { ok: false, reason: "nothing_to_compact" };
};
