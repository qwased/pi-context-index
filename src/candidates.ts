/**
 * Capsule candidates: a fixed set before any budget is spent.
 *
 * U quotes user instructions (first non-empty, the three most recent non-live,
 * up to four lexically related older users). W quotes recent assistant work
 * and the latest errors/command results per recent turn. N is operation
 * navigation plus counted result lines. Every candidate is a Span into a saved
 * field; live records are never duplicated.
 */

import type { Chunk, Span, TextField } from "./model";
import { chunkField, type ExcludedRange } from "./chunks";
import { fitGraphemePrefix } from "./reader";
import { Bm25Index, tokenize } from "./search";
import {
  effectiveFields,
  primaryEffectiveField,
  selfEchoRanges,
  type EffectiveHistory,
  type EffectiveRecord,
} from "./source";
import {
  extractObservations,
  observationResultField,
  type ObservationSet,
  type ReviewedObservation,
} from "./observations";

export const CAPSULE_U_TARGET_CHARS = 3_000;
export const CAPSULE_W_ASSISTANT_TARGET_CHARS = 4_000;
export const CAPSULE_W_RESULT_TARGET_CHARS = 800;
export const CAPSULE_MIN_USER_CHARS = 160;
export const CAPSULE_MIN_ASSISTANT_CHARS = 256;
export const CAPSULE_MIN_ERROR_CHARS = 128;
export const CAPSULE_RELATED_USERS = 4;
export const CAPSULE_RECENT_USERS = 3;
export const CAPSULE_W_ASSISTANTS = 2;
export const CAPSULE_W_ERRORS = 2;
export const CAPSULE_W_COMMANDS = 1;
export const CAPSULE_N_OPERATIONS = 12;
export const CAPSULE_N_COUNTS = 4;
export const CAPSULE_QUERY_TERMS = 64;
export const CAPSULE_QUERY_EDGE_CHARS = 1_000;
/** Smallest accepted content increase for a long excerpt. */
export const CAPSULE_UPGRADE_CHARS = 192;

const isExcludedStart = (
  offset: number,
  ranges: readonly ExcludedRange[],
): boolean =>
  ranges.some((range) => offset >= range.start && offset < range.end);

/** Visible [start,end) segments of one field after trimming echo ranges. */
export const visibleSegments = (
  textLength: number,
  exclude: readonly ExcludedRange[],
): Array<{ start: number; end: number }> => {
  const sorted = exclude
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const segments: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const range of sorted) {
    const start = Math.max(0, Math.min(textLength, range.start));
    const end = Math.max(start, Math.min(textLength, range.end));
    if (start > cursor) segments.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < textLength) segments.push({ start: cursor, end: textLength });
  return segments;
};

const spanOf = (
  field: TextField,
  start: number,
  end: number,
): Span => ({
  ownerId: field.ownerId,
  storageId: field.storageId,
  field: field.path,
  start,
  end,
});

const spanChars = (spans: readonly Span[]): number => {
  let total = 0;
  for (const span of spans) total += Math.max(0, span.end - span.start);
  return total;
};

const mergeSpans = (spans: readonly Span[]): Span[] => {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [];
  for (const span of sorted) {
    if (span.end <= span.start) continue;
    const previous = merged.at(-1);
    if (
      previous &&
      previous.ownerId === span.ownerId &&
      previous.storageId === span.storageId &&
      previous.field === span.field &&
      span.start <= previous.end
    ) {
      previous.end = Math.max(previous.end, span.end);
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
};

/** Prefix spans covering at most maxChars of visible text, cluster-aligned. */
const prefixSpans = (
  field: TextField,
  maxChars: number,
  segments: readonly { start: number; end: number }[],
): Span[] => {
  let remaining = maxChars;
  const spans: Span[] = [];
  for (const segment of segments) {
    if (remaining <= 0) break;
    const text = field.text.slice(segment.start, segment.end);
    const take = fitGraphemePrefix(text, remaining);
    if (take > 0) {
      spans.push(spanOf(field, segment.start, segment.start + take));
      remaining -= take;
    }
    if (take < text.length) break;
  }
  return spans;
};

/** Suffix spans covering at most maxChars, aligned down to a cluster start. */
const suffixSpans = (
  field: TextField,
  maxChars: number,
  segments: readonly { start: number; end: number }[],
): Span[] => {
  let remaining = maxChars;
  const spans: Span[] = [];
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    if (!segment || remaining <= 0) break;
    const text = field.text.slice(segment.start, segment.end);
    if (text.length <= remaining) {
      spans.push(spanOf(field, segment.start, segment.end));
      remaining -= text.length;
      continue;
    }
    const wanted = text.length - remaining;
    const boundary = fitGraphemePrefix(text, wanted);
    const start = boundary >= wanted ? boundary : wanted;
    const actual = field.text.slice(segment.start + start, segment.end);
    if (actual.length > 0) {
      spans.push(spanOf(field, segment.start + start, segment.end));
      remaining -= actual.length;
    }
    break;
  }
  return spans;
};

const maxScore = (scores: Map<string, number>): number => {
  let peak = 0;
  for (const score of scores.values()) if (score > peak) peak = score;
  return peak;
};

const chunkLength = (chunk: Chunk): number => {
  let length = 0;
  for (const count of chunk.terms.values()) length += count;
  return length;
};

/**
 * Order middle chunks: score by normalized BM25 plus heading/list bonuses,
 * round-robin across sections. Without any lexical or heading signal, sample
 * evenly by paragraph order.
 */
export const orderMiddleChunks = (
  chunks: readonly Chunk[],
  queryTerms: readonly string[],
  capacity: number,
  sourceText = "",
): Chunk[] => {
  if (chunks.length === 0) return [];
  const index = new Bm25Index(
    chunks.map((chunk) => ({
      key: String(chunk.ordinal),
      terms: chunk.terms,
      length: chunkLength(chunk),
    })),
  );
  const scores = index.score(queryTerms);
  const peak = maxScore(scores);
  const hasHeading = chunks.some((chunk) => chunk.heading !== undefined);

  if (peak <= 0 && !hasHeading) {
    const picks: Chunk[] = [];
    const take = Math.min(capacity, chunks.length);
    if (take >= chunks.length) return [...chunks];
    for (let step = 0; step < take; step++) {
      const position = Math.round(
        ((step + 1) * (chunks.length + 1)) / (take + 1) - 1,
      );
      const chunk = chunks[Math.max(0, Math.min(chunks.length - 1, position))];
      if (chunk) picks.push(chunk);
    }
    return picks;
  }

  const scoreOf = (chunk: Chunk): number => {
    const raw = scores.get(String(chunk.ordinal)) ?? 0;
    const normalized = peak > 0 ? raw / peak : 0;
    const headingBonus = chunk.heading ? 0.25 : 0;
    const chunkText = sourceText.slice(chunk.span.start, chunk.span.end);
    const listBonus = /^\s*(?:[-*+]|\d{1,4}[.)])\s+/.test(chunkText)
      ? 0.15
      : 0;
    return normalized + headingBonus + listBonus;
  };

  const sections = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const key = chunk.heading ? String(chunk.heading.start) : "-";
    const group = sections.get(key);
    if (group) group.push(chunk);
    else sections.set(key, [chunk]);
  }
  for (const group of sections.values()) {
    group.sort((a, b) => scoreOf(b) - scoreOf(a) || a.ordinal - b.ordinal);
  }

  const ordered: Chunk[] = [];
  const keys = [...sections.keys()];
  let round = 0;
  while (ordered.length < capacity) {
    let added = false;
    for (const key of keys) {
      const group = sections.get(key);
      const chunk = group?.[round];
      if (!chunk) continue;
      ordered.push(chunk);
      added = true;
      if (ordered.length >= capacity) break;
    }
    if (!added) break;
    round++;
  }
  return ordered;
};

export type CapsuleGroup = "U" | "W" | "N";

export interface ObservationRef {
  callId: string;
  resultId?: string;
  nestedIndex?: number;
}

export interface ExcerptPlan {
  kind: "excerpt";
  group: "U" | "W";
  marker: "U" | "A" | "R";
  record: EffectiveRecord;
  field: TextField;
  /** Command or tool label used on an R line. */
  detail?: string;
  /** Source span set at each depth; strictly increasing in content. */
  levels: readonly Span[][];
  /** Level 0 is a required minimum that rollback may never remove. */
  minimum: boolean;
  /** Deepening order inside the group; lower first. */
  priority: number;
  /** A count sentence is shown in the label; body stays empty. */
  reported?: string;
  /** Observation this block was built from, for details only. */
  observation?: ObservationRef;
}

export interface LinePlan {
  kind: "line";
  group: "N";
  text: string;
  priority: number;
  observation?: ObservationRef;
}

export type CapsulePlan = ExcerptPlan | LinePlan;

export interface CandidateSet {
  plans: readonly CapsulePlan[];
  query: string[];
  observations: ObservationSet;
}

const observationRefOf = (reviewed: ReviewedObservation): ObservationRef => ({
  callId: reviewed.observation.callId,
  ...(reviewed.observation.resultId
    ? { resultId: reviewed.observation.resultId }
    : {}),
  ...(reviewed.observation.nestedIndex !== undefined
    ? { nestedIndex: reviewed.observation.nestedIndex }
    : {}),
});

const excerptLevels = (input: {
  field: TextField;
  maxChars: number;
  minimumChars: number;
  query: readonly string[];
  mode: "chunks" | "ends";
  exclude: readonly ExcludedRange[];
}): { levels: Span[][]; minimum: boolean } | undefined => {
  const { field, maxChars, minimumChars, query, mode, exclude } = input;
  const text = field.text;
  if (text.length === 0) return undefined;
  const segments = visibleSegments(text.length, exclude);
  if (segments.length === 0) return undefined;
  const visibleChars = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);

  const levels: Span[][] = [];
  const pushLevel = (spans: Span[]): void => {
    const merged = mergeSpans(spans);
    if (merged.length === 0) return;
    const previous = levels.at(-1);
    if (
      previous &&
      previous.length === merged.length &&
      previous.every(
        (span, index) =>
          span.start === merged[index]?.start && span.end === merged[index]?.end,
      )
    ) {
      return;
    }
    levels.push(merged);
  };

  if (visibleChars <= maxChars && exclude.length === 0) {
    if (minimumChars > 0 && text.length > minimumChars) {
      pushLevel(prefixSpans(field, minimumChars, segments));
    }
    pushLevel([spanOf(field, 0, text.length)]);
    return { levels, minimum: minimumChars > 0 };
  }

  if (minimumChars > 0) {
    pushLevel(prefixSpans(field, minimumChars, segments));
  }

  if (mode === "ends") {
    // Result texts: keep both edges so counts at the end are not lost. The
    // minimum prefix (when present) is merged into the same level so a deeper
    // level never shows less source than the floor.
    const edge = Math.max(1, Math.floor(maxChars / 2));
    const head = prefixSpans(field, edge, segments);
    const tail = suffixSpans(field, maxChars - spanChars(head), segments);
    const floor = levels.at(-1) ?? [];
    pushLevel(mergeSpans([...floor, ...head, ...tail]));
    const all = segments.map((segment) => spanOf(field, segment.start, segment.end));
    if (spanChars(all) <= maxChars) pushLevel(all);
    return { levels, minimum: minimumChars > 0 };
  }

  const chunks = chunkField(field, { exclude });
  if (chunks.length === 0) return { levels, minimum: minimumChars > 0 };
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  const floor = levels.at(-1) ?? [];
  const base = mergeSpans([
    ...floor,
    ...(first ? [{ ...first.span }] : []),
    ...(last && last !== first ? [{ ...last.span }] : []),
  ]);
  if (spanChars(base) <= maxChars) pushLevel(base);

  const reserved = new Set<number>();
  if (first) reserved.add(first.ordinal);
  if (last) reserved.add(last.ordinal);
  const middle = chunks.filter((chunk) => !reserved.has(chunk.ordinal));
  // Sample enough middle chunks for the remaining budget, then let the
  // allocator stop at a 192-char slice instead of a whole chunk.
  const middleChars = middle.reduce(
    (sum, chunk) => sum + spanChars([chunk.span]),
    0,
  );
  const average = middle.length > 0 ? middleChars / middle.length : 1;
  const slots = Math.min(
    middle.length,
    Math.max(
      1,
      Math.ceil(Math.max(0, maxChars - spanChars(base)) / Math.max(1, average)) + 2,
    ),
  );
  const ordered = orderMiddleChunks(middle, query, slots, field.text);

  let selected = base.length > 0 ? base : [...floor];
  for (const chunk of ordered) {
    let offset = chunk.span.start;
    while (offset < chunk.span.end) {
      const remaining = maxChars - spanChars(selected);
      if (remaining <= 0) break;
      const wanted = Math.min(
        CAPSULE_UPGRADE_CHARS,
        chunk.span.end - offset,
        remaining,
      );
      const take = fitGraphemePrefix(field.text.slice(offset), wanted);
      if (take <= 0) break;
      selected = mergeSpans([
        ...selected,
        spanOf(field, offset, offset + take),
      ]);
      pushLevel(selected);
      offset += take;
    }
    if (maxChars - spanChars(selected) <= 0) break;
  }

  return { levels, minimum: minimumChars > 0 };
};

const echoExclude = (field: TextField): ExcludedRange[] => selfEchoRanges(field.text);

const makeExcerpt = (input: {
  group: "U" | "W";
  marker: "U" | "A" | "R";
  record: EffectiveRecord;
  field: TextField;
  maxChars: number;
  minimumChars: number;
  minimum: boolean;
  query: readonly string[];
  priority: number;
  mode: "chunks" | "ends";
  detail?: string;
  reported?: string;
  observation?: ObservationRef;
}): ExcerptPlan | undefined => {
  const built = excerptLevels({
    field: input.field,
    maxChars: input.maxChars,
    minimumChars: input.minimumChars,
    query: input.query,
    mode: input.mode,
    exclude: echoExclude(input.field),
  });
  if (!built || built.levels.length === 0) return undefined;
  return {
    kind: "excerpt",
    group: input.group,
    marker: input.marker,
    record: input.record,
    field: input.field,
    ...(input.detail ? { detail: input.detail } : {}),
    levels: built.levels,
    minimum: input.minimum && built.minimum,
    priority: input.priority,
    ...(input.reported !== undefined ? { reported: input.reported } : {}),
    ...(input.observation ? { observation: input.observation } : {}),
  };
};

const makeResultPlan = (input: {
  entry: ReviewedObservation;
  detail: string;
  minimum: boolean;
  priority: number;
  query: readonly string[];
}): ExcerptPlan | undefined => {
  const result = observationResultField(input.entry);
  if (!result) return undefined;
  const observation = observationRefOf(input.entry);
  const lines = countLinesFrom(result.field);
  const line = lines[0];
  if (line) {
    return {
      kind: "excerpt",
      group: "W",
      marker: "R",
      record: result.record,
      field: result.field,
      detail: input.detail,
      levels: [[line.span]],
      minimum: input.minimum,
      priority: input.priority,
      reported: line.text,
      observation,
    };
  }
  return makeExcerpt({
    group: "W",
    marker: "R",
    record: result.record,
    field: result.field,
    maxChars: CAPSULE_W_RESULT_TARGET_CHARS,
    minimumChars: input.minimum ? CAPSULE_MIN_ERROR_CHARS : 0,
    minimum: input.minimum,
    query: input.query,
    priority: input.priority,
    mode: "ends",
    detail: input.detail,
    observation,
  });
};

const recentUserRecords = (history: EffectiveHistory): EffectiveRecord[] =>
  history.history.filter(
    (record) =>
      record.info.role === "user" &&
      (primaryEffectiveField(record)?.text.trim().length ?? 0) > 0,
  );

/** Most recent non-live user turns, as user-turn indices. */
const historicalUserTurns = (
  history: EffectiveHistory,
  observations: ObservationSet,
): number[] => {
  const turns: number[] = [];
  for (const record of history.history) {
    if (record.info.role !== "user") continue;
    const turn = observations.turnOfRecordId.get(record.info.id);
    if (turn !== undefined && turn >= 0) turns.push(turn);
  }
  return [...new Set(turns)];
};

/**
 * Working query terms (§8.1): recent user text edges, compact instructions and
 * recent tool paths/commands, deduplicated to 64 terms.
 */
export const buildWorkingQuery = (
  history: EffectiveHistory,
  observations: ObservationSet,
  instructions = "",
): string[] => {
  const users = history.records.filter((record) => record.info.role === "user");
  const recent = users.slice(-CAPSULE_RECENT_USERS);
  const substantive = recent.filter((record) => {
    const field = primaryEffectiveField(record);
    return (field?.text ?? "").trim().length >= 32;
  });
  const chosen = substantive.length > 0 ? substantive : recent;
  const terms: string[] = [];
  for (const record of chosen) {
    const field = primaryEffectiveField(record);
    if (!field) continue;
    const text = field.text;
    const edges =
      text.length <= CAPSULE_QUERY_EDGE_CHARS * 2
        ? text
        : text.slice(0, CAPSULE_QUERY_EDGE_CHARS) +
          "\n" +
          text.slice(-CAPSULE_QUERY_EDGE_CHARS);
    terms.push(...tokenize(edges));
  }

  const turns = historicalUserTurns(history, observations);
  const recentTurns = new Set(turns.slice(-CAPSULE_RECENT_USERS));
  for (const entry of observations.entries) {
    if (!recentTurns.has(entry.turn)) continue;
    if (entry.observation.path) terms.push(...tokenize(entry.observation.path));
    if (entry.observation.command) terms.push(...tokenize(entry.observation.command));
  }

  if (instructions.trim().length > 0) terms.push(...tokenize(instructions));

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    if (seen.has(term)) continue;
    seen.add(term);
    unique.push(term);
    if (unique.length >= CAPSULE_QUERY_TERMS) break;
  }
  return unique;
};

const relatedUsers = (
  users: readonly EffectiveRecord[],
  selectedIds: ReadonlySet<string>,
  query: readonly string[],
): EffectiveRecord[] => {
  if (query.length === 0) return [];
  const candidates = users.filter((record) => !selectedIds.has(record.info.id));
  const documents = [];
  const byKey = new Map<string, EffectiveRecord>();
  for (const record of candidates) {
    const field = primaryEffectiveField(record);
    if (!field) continue;
    const terms = new Map<string, number>();
    for (const token of tokenize(field.text)) {
      terms.set(token, (terms.get(token) ?? 0) + 1);
    }
    let length = 0;
    for (const count of terms.values()) length += count;
    if (length === 0) continue;
    const key = record.info.id;
    documents.push({ key, terms, length });
    byKey.set(key, record);
  }
  if (documents.length === 0) return [];
  const index = new Bm25Index(documents);
  const scores = index.score(query);
  const ranked = [...scores.entries()]
    .map(([key, score]) => ({ record: byKey.get(key), score }))
    .filter((entry): entry is { record: EffectiveRecord; score: number } => Boolean(entry.record))
    .sort((a, b) => b.score - a.score || b.record.info.order - a.record.info.order);
  return ranked.slice(0, CAPSULE_RELATED_USERS).map((entry) => entry.record);
};

const operationLine = (reviewed: ReviewedObservation): string | undefined => {
  const observation = reviewed.observation;
  if (observation.nestedIndex === undefined && !observation.operation) return undefined;
  const target =
    observation.path ??
    observation.command ??
    observation.tool;
  const label = observation.operation ?? "call";
  const callRef = observation.ownerId + (observation.nestedIndex !== undefined ? "#" + observation.nestedIndex : "");
  const resultRef = observation.resultId ?? observation.ownerId;
  if (observation.argumentsBytes !== undefined && !observation.path) {
    return `${label} 参数已省略（${observation.argumentsBytes} 字节） x1 | call=e:${callRef} result=e:${resultRef}`;
  }
  return `${label} ${target} | call=e:${callRef} result=e:${resultRef}`;
};

const countLinePattern =
  /(?:\d[\d,]*\s+pass(?:ed)?)|(?:\d[\d,]*\s+fail(?:ed)?)/i;

const countLinesFrom = (field: TextField): Array<{ text: string; span: Span }> => {
  const lines: Array<{ text: string; span: Span }> = [];
  const text = field.text;
  let offset = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (countLinePattern.test(line)) {
      lines.push({
        text: line.trim(),
        span: {
          ownerId: field.ownerId,
          storageId: field.storageId,
          field: field.path,
          start: offset,
          end: offset + line.length,
        },
      });
    }
    offset += rawLine.length + 1;
  }
  return lines;
};

const headingLine = (reviewed: ReviewedObservation, history: EffectiveHistory): string | undefined => {
  const record = reviewed.result;
  if (!record) return undefined;
  const field = primaryEffectiveField(record);
  if (!field || field.text.length <= CAPSULE_U_TARGET_CHARS) return undefined;
  const chunks = chunkField(field, { exclude: selfEchoRanges(field.text) });
  const headings: string[] = [];
  const seen = new Set<number>();
  for (const chunk of chunks) {
    if (!chunk.heading || seen.has(chunk.heading.start)) continue;
    seen.add(chunk.heading.start);
    const text = field.text.slice(chunk.heading.start, chunk.heading.end).trim();
    if (text.length === 0) continue;
    headings.push(`${text} @${chunk.heading.start}`);
    if (headings.length >= 3) break;
  }
  if (headings.length === 0) return undefined;
  return `长文 e:${record.info.id}：${headings.join("；")}`;
};

/**
 * Build the fixed candidate set. No budget is applied here; the allocator
 * deepens levels and may roll back upgrades, never minima.
 */
export const makeCandidates = (
  history: EffectiveHistory,
  instructions = "",
): CandidateSet => {
  const observations = extractObservations(history);
  const query = buildWorkingQuery(history, observations, instructions);
  const plans: CapsulePlan[] = [];

  const users = recentUserRecords(history);
  const selectedUserIds = new Set<string>();
  const firstUser = users[0];
  const recent = users.slice(-CAPSULE_RECENT_USERS);
  for (const record of recent) selectedUserIds.add(record.info.id);
  if (firstUser) selectedUserIds.add(firstUser.info.id);

  const userPriority = new Map<string, number>();
  recent.forEach((record, index) => {
    // Newest of the recent three deepens first.
    userPriority.set(record.info.id, 10 + (recent.length - 1 - index));
  });
  if (firstUser && !userPriority.has(firstUser.info.id)) {
    userPriority.set(firstUser.info.id, 20);
  }

  const addUserPlan = (
    record: EffectiveRecord,
    minimum: boolean,
    priority: number,
  ): void => {
    const field = primaryEffectiveField(record);
    if (!field) return;
    const plan = makeExcerpt({
      group: "U",
      marker: "U",
      record,
      field,
      maxChars: CAPSULE_U_TARGET_CHARS,
      minimumChars: minimum ? CAPSULE_MIN_USER_CHARS : 0,
      minimum,
      query,
      priority,
      mode: "chunks",
    });
    if (plan) plans.push(plan);
  };

  if (firstUser) addUserPlan(firstUser, true, userPriority.get(firstUser.info.id) ?? 20);
  for (const record of recent) {
    if (record.info.id === firstUser?.info.id) continue;
    addUserPlan(record, true, userPriority.get(record.info.id) ?? 10);
  }
  const related = relatedUsers(users, selectedUserIds, query);
  related.forEach((record, index) => {
    addUserPlan(record, false, 30 + index);
  });

  // W: recent assistant text, then results in the last three user turns.
  const assistants = history.history
    .filter((record) => record.info.role === "assistant")
    .filter((record) => (primaryEffectiveField(record)?.text.trim().length ?? 0) > 0)
    .slice(-CAPSULE_W_ASSISTANTS);
  assistants.forEach((record, index) => {
    const field = primaryEffectiveField(record);
    if (!field) return;
    const isNewest = index === assistants.length - 1;
    const plan = makeExcerpt({
      group: "W",
      marker: "A",
      record,
      field,
      maxChars: CAPSULE_W_ASSISTANT_TARGET_CHARS,
      minimumChars: isNewest ? CAPSULE_MIN_ASSISTANT_CHARS : 0,
      minimum: isNewest,
      query,
      priority: isNewest ? 0 : 4,
      mode: "chunks",
    });
    if (plan) plans.push(plan);
  });

  const turns = historicalUserTurns(history, observations);
  const recentTurns = new Set(turns.slice(-CAPSULE_RECENT_USERS));
  const resultEntries = observations.entries.filter((entry) => {
    if (!recentTurns.has(entry.turn)) return false;
    if (!entry.result) return false;
    return observationResultField(entry) !== undefined;
  });
  const errors = resultEntries
    .filter((entry) => entry.observation.isError)
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .slice(0, CAPSULE_W_ERRORS);
  const commands = resultEntries
    .filter(
      (entry) =>
        !entry.observation.isError &&
        (entry.observation.operation === "command" ||
          entry.observation.tool.toLowerCase() === "bash" ||
          entry.observation.tool.toLowerCase() === "codemode"),
    )
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .slice(0, CAPSULE_W_COMMANDS);

  errors.forEach((entry, index) => {
    const plan = makeResultPlan({
      entry,
      detail: entry.observation.tool,
      minimum: index === 0,
      priority: 1 + index,
      query,
    });
    if (plan) plans.push(plan);
  });
  commands.forEach((entry, index) => {
    // The same parent result can carry a nested error and the aggregate
    // command output; both address different stored fields, so keep both.
    const plan = makeResultPlan({
      entry,
      detail: entry.observation.command ?? entry.observation.tool,
      minimum: false,
      priority: 3 + index,
      query,
    });
    if (plan) plans.push(plan);
  });

  // N: merged operations (non-live scope), counted source lines and long-text
  // heading navigation.
  const historyIds = new Set(history.history.map((record) => record.info.id));
  const scoped = observations.entries.filter((entry) => {
    const id = entry.observation.resultId ?? entry.observation.ownerId;
    return historyIds.has(id);
  });
  const groups = new Map<
    string,
    {
      operation?: string;
      target: string;
      count: number;
      latest: ReviewedObservation;
      queryHit: boolean;
    }
  >();
  const querySet = new Set(query);
  for (const entry of scoped) {
    const observation = entry.observation;
    if (!observation.operation && observation.nestedIndex === undefined) continue;
    const target = observation.path ?? observation.command ?? observation.tool;
    const label = observation.operation ?? "call";
    // Merge by (operation, path/command), independent of which tool ran it.
    const key = [label, observation.path ?? observation.command ?? ""].join("\u0000");
    const existing = groups.get(key);
    const queryHit =
      tokenize(target).some((token) => querySet.has(token)) ||
      tokenize(observation.tool).some((token) => querySet.has(token));
    if (existing) {
      existing.count++;
      if (entry.sortOrder >= existing.latest.sortOrder) existing.latest = entry;
      existing.queryHit = existing.queryHit || queryHit;
    } else {
      groups.set(key, {
        ...(observation.operation ? { operation: observation.operation } : {}),
        target,
        count: 1,
        latest: entry,
        queryHit,
      });
    }
  }
  const operationRows = [...groups.values()]
    .sort(
      (a, b) =>
        Number(b.queryHit) - Number(a.queryHit) ||
        b.latest.sortOrder - a.latest.sortOrder,
    )
    .slice(0, CAPSULE_N_OPERATIONS);
  operationRows.forEach((row, index) => {
    const observation = row.latest.observation;
    const callRef =
      observation.ownerId +
      (observation.nestedIndex !== undefined ? "#" + observation.nestedIndex : "");
    const resultRef = observation.resultId ?? observation.ownerId;
    const errorMark = observation.isError ? " (error)" : "";
    const text =
      observation.argumentsBytes !== undefined && !observation.path
        ? `${row.operation ?? "call"} 参数已省略（${observation.argumentsBytes} 字节） x${row.count}${errorMark} | call=e:${callRef} result=e:${resultRef}`
        : `${row.operation ?? "call"} ${row.target} x${row.count}${errorMark} | call=e:${callRef} result=e:${resultRef}`;
    plans.push({
      kind: "line",
      group: "N",
      text,
      priority: 10 + index,
      observation: observationRefOf(row.latest),
    });
  });

  const counted: Array<{ text: string; span: Span }> = [];
  const countedObservation = new Map<string, ReviewedObservation>();
  const countedResults = new Set<string>();
  // A result already shown as a W line is not repeated as an N count.
  const wResultIds = new Set<string>();
  for (const entry of [...errors, ...commands]) {
    if (entry.result) wResultIds.add(entry.result.info.id);
  }
  for (const entry of [...scoped].sort((a, b) => b.sortOrder - a.sortOrder)) {
    const result = observationResultField(entry);
    if (!result) continue;
    if (countedResults.has(result.record.info.id)) continue;
    if (wResultIds.has(result.record.info.id)) continue;
    const lines = countLinesFrom(result.field);
    if (lines.length === 0) continue;
    countedResults.add(result.record.info.id);
    const line = lines[0];
    if (line) {
      const callRef =
        entry.observation.ownerId +
        (entry.observation.nestedIndex !== undefined
          ? "#" + entry.observation.nestedIndex
          : "");
      counted.push({
        text: `R e:${result.record.info.id} | call=e:${callRef} | ${entry.observation.command ?? entry.observation.tool} | reported: ${line.text}`,
        span: line.span,
      });
      countedObservation.set(result.record.info.id, entry);
    }
    if (counted.length >= CAPSULE_N_COUNTS) break;
  }
  counted.forEach((line, index) => {
    const resultId = /^R e:([^ |]+)/.exec(line.text)?.[1];
    const entry = resultId ? countedObservation.get(resultId) : undefined;
    plans.push({
      kind: "line",
      group: "N",
      text: line.text,
      priority: 30 + index,
      ...(entry ? { observation: observationRefOf(entry) } : {}),
    });
  });

  const longUsers = plans.filter(
    (plan): plan is ExcerptPlan =>
      plan.kind === "excerpt" &&
      plan.group === "U" &&
      plan.field.text.length > CAPSULE_U_TARGET_CHARS,
  );
  const seenLong = new Set<string>();
  let headingPriority = 40;
  for (const plan of longUsers) {
    if (seenLong.has(plan.record.info.id)) continue;
    seenLong.add(plan.record.info.id);
    const reviewed: ReviewedObservation = {
      observation: {
        ownerId: plan.record.info.id,
        callId: plan.record.info.id,
        tool: "text",
        sources: [],
      },
      turn: -1,
      sortOrder: plan.record.info.order,
      owner: plan.record,
      result: plan.record,
    };
    const line = headingLine(reviewed, history);
    if (line) plans.push({ kind: "line", group: "N", text: line, priority: headingPriority++ });
  }

  return { plans, query, observations };
};
