/**
 * Source snapshot and effective history.
 *
 * One capture fixes the entry array, the branch path, the leaf and the file
 * watermark. Raw records remain the archive; the effective branch is what the
 * capsule and search work on. Context edits are applied through Pi's own
 * buildSessionProjection after compaction nodes are replaced by no-text custom
 * nodes, so projection semantics (replacement:null, tail edits, checkpoint
 * edits) match the host exactly.
 *
 * Identity is native: e:<entryId>. Order is presentation only.
 */

import {
  buildSessionProjection,
  type ContextEditEntry,
  type SessionEntry,
  type SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import {
  editableContentBase,
  fieldList,
  primaryFieldOf,
  primaryFieldPath,
} from "./fields";
import type {
  ExclusionReason,
  RecordInfo,
  Span,
  TextField,
} from "./model";
import type { Cut } from "./cut";

type SessionMessage = SessionMessageEntry["message"];

/** Test/host seam: the subset of Pi's ReadonlySessionManager we read. */
export interface SourceManagerLike {
  getEntries(): SessionEntry[];
  getBranch(fromId?: string): SessionEntry[];
  getSessionId(): string;
  getLeafId(): string | null;
  getSessionFile?(): string | undefined;
}

export const SHADOW_COMPACTION_TYPE = "pi-context-index.shadow-compaction";

export const SELF_ECHO_TOOL_NAME = "context_index";

/**
 * Fixed machine markers around a reader result body. A codemode parent body
 * can contain our own read output; indexing trims these ranges while the raw
 * field and explicit reads keep every byte.
 */
export const SELF_ECHO_BEGIN = "<<<pi-context-index:read>>>";
export const SELF_ECHO_END = "<<</pi-context-index:read>>>";

export interface TextRange {
  start: number;
  end: number;
}

export const selfEchoRanges = (text: string): TextRange[] => {
  const ranges: TextRange[] = [];
  let cursor = 0;
  for (;;) {
    const begin = text.indexOf(SELF_ECHO_BEGIN, cursor);
    if (begin < 0) break;
    const endMarker = text.indexOf(
      SELF_ECHO_END,
      begin + SELF_ECHO_BEGIN.length,
    );
    const end =
      endMarker < 0 ? text.length : endMarker + SELF_ECHO_END.length;
    ranges.push({ start: begin, end });
    cursor = end;
    if (cursor >= text.length) break;
  }
  return ranges;
};

export interface SourceSnapshot {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  /** Current leaf. */
  readonly headId: string | null;
  /** Last entry present in the captured file order, or null. */
  readonly watermarkId: string | null;
  /** All saved entries in file order, fixed at capture. */
  readonly entries: readonly SessionEntry[];
  /** Raw current branch, root to leaf, fixed at capture. */
  readonly branch: readonly SessionEntry[];
  readonly byId: ReadonlyMap<string, SessionEntry>;
  /** entryId -> saved file order. */
  readonly fileOrder: ReadonlyMap<string, number>;
  /** entryId -> raw branch index. Membership is real, never an ID watermark. */
  readonly branchIndex: ReadonlyMap<string, number>;
  /** Latest context_edit per target on the current branch. */
  readonly edits: ReadonlyMap<string, ContextEditEntry>;
  readonly hasContextEdits: boolean;
}

export interface EffectiveRecord {
  /** Owner entry: role, timestamp and counts. */
  readonly entry: SessionEntry;
  /** Entry that stores the visible text (the edit entry when edited). */
  readonly storageEntry: SessionEntry;
  readonly info: RecordInfo;
  /** Projected messages after Pi's context-edit application. */
  readonly messages: readonly SessionMessage[];
  /** Set when the visible content comes from a context edit. */
  readonly editId?: string;
}

export interface EffectiveCounts {
  /** I: message and custom_message identities in this snapshot. */
  saved: number;
  /** E: effective identities on the current branch. */
  effective: number;
  /** Live subset of E. */
  live: number;
  /** I entries that are not on the current branch. */
  outside: number;
}

export interface EffectiveHistory {
  readonly snapshot: SourceSnapshot;
  readonly cut: Cut;
  /** Effective records on the branch, in branch order. */
  readonly records: readonly EffectiveRecord[];
  /** Branch records excluded from E, with their reason. */
  readonly excluded: readonly RecordInfo[];
  /** Off-branch message records. */
  readonly offBranch: readonly RecordInfo[];
  /** Compaction and branch-summary nodes on the branch (derived text). */
  readonly derived: readonly SessionEntry[];
  /** Effective records at or after the cut. */
  readonly live: readonly EffectiveRecord[];
  /** Effective records before the cut and after an edited checkpoint bound. */
  readonly history: readonly EffectiveRecord[];
  /** Newest edited compaction checkpoint, when one exists. */
  readonly lowerBoundId?: string;
  readonly counts: EffectiveCounts;
}

const isMessageRecord = (
  entry: SessionEntry,
): entry is SessionMessageEntry | Extract<SessionEntry, { type: "custom_message" }> =>
  entry.type === "message" || entry.type === "custom_message";

const roleOf = (entry: SessionEntry): string => {
  if (entry.type === "message") return entry.message.role;
  if (entry.type === "custom_message") return "custom";
  return entry.type;
};

/** Why a branch record is not effective. System means Pi keeps it out of context. */
const exclusionReasonFor = (entry: SessionEntry): ExclusionReason | undefined => {
  if (entry.type !== "message") return undefined;
  const message = entry.message;
  if (message.role === "system") return "system";
  // "!!" bash commands are session history but never model context.
  if (message.role === "bashExecution" && message.excludeFromContext) {
    return "system";
  }
  if (
    message.role === "toolResult" &&
    message.toolName === SELF_ECHO_TOOL_NAME
  ) {
    return "self-echo";
  }
  return undefined;
};

const indexEntries = (
  entries: readonly SessionEntry[],
): {
  byId: Map<string, SessionEntry>;
  fileOrder: Map<string, number>;
} => {
  const byId = new Map<string, SessionEntry>();
  const fileOrder = new Map<string, number>();
  entries.forEach((entry, index) => {
    byId.set(entry.id, entry);
    fileOrder.set(entry.id, index);
  });
  return { byId, fileOrder };
};

const collectEdits = (
  branch: readonly SessionEntry[],
  branchIndex: ReadonlyMap<string, number>,
): Map<string, ContextEditEntry> => {
  const edits = new Map<string, ContextEditEntry>();
  for (const entry of branch) {
    if (entry.type !== "context_edit") continue;
    if (!branchIndex.has(entry.targetId)) continue;
    // Branch order is context order; the later edit is the effective one.
    edits.set(entry.targetId, entry);
  }
  return edits;
};

/**
 * Capture the immutable source. branchEntries is the host's already fixed
 * branch path; when omitted the manager's current branch is used.
 */
export const captureSource = (
  manager: SourceManagerLike,
  branchEntries?: readonly SessionEntry[],
): SourceSnapshot => {
  const entries = [...manager.getEntries()];
  const branch = branchEntries
    ? [...branchEntries]
    : manager.getBranch
      ? [...manager.getBranch()]
      : [];
  const { byId, fileOrder } = indexEntries(entries);
  const branchIndex = new Map<string, number>();
  branch.forEach((entry, index) => branchIndex.set(entry.id, index));
  const edits = collectEdits(branch, branchIndex);
  const leaf = manager.getLeafId();
  const headId =
    leaf !== null && branchIndex.has(leaf)
      ? leaf
      : (branch.at(-1)?.id ?? null);
  return Object.freeze({
    sessionId: manager.getSessionId(),
    sessionFile: manager.getSessionFile?.(),
    headId,
    watermarkId: entries.at(-1)?.id ?? null,
    entries: Object.freeze(entries),
    branch: Object.freeze(branch),
    byId,
    fileOrder,
    branchIndex,
    edits,
    hasContextEdits: edits.size > 0,
  });
};

const shadowCompaction = (entry: SessionEntry): SessionEntry => {
  if (entry.type !== "compaction") return entry;
  return {
    ...entry,
    type: "custom",
    customType: SHADOW_COMPACTION_TYPE,
  } as SessionEntry;
};

/**
 * Project the branch with compaction nodes made invisible and context edits
 * applied. The result keeps every source id, so a projected message can be
 * mapped back to its owner and storage entry.
 */
const projectBranch = (
  branch: readonly SessionEntry[],
): Map<string, readonly SessionMessage[]> => {
  const projectedById = new Map<string, readonly SessionMessage[]>();
  if (branch.length === 0) return projectedById;
  const shadow = branch.map(shadowCompaction);
  const projection = buildSessionProjection(shadow as SessionEntry[]);
  for (const projected of projection.entries) {
    projectedById.set(
      projected.sourceEntry.id,
      projected.messages as readonly SessionMessage[],
    );
  }
  return projectedById;
};

/** Branch index of the cut, or branch.length for compact-all. */
export const resolveCutIndex = (
  snapshot: SourceSnapshot,
  cut: Cut,
): number => {
  if (!cut.firstKeptEntryId) return snapshot.branch.length;
  const index = snapshot.branchIndex.get(cut.firstKeptEntryId);
  if (index === undefined) {
    throw new Error(
      `firstKeptEntryId ${cut.firstKeptEntryId} is not on the current branch`,
    );
  }
  return index;
};

/**
 * Build E and its live/history split for one cut. I/E/X conservation holds by
 * construction: saved = effective + excluded + offBranch.
 */
export const projectHistory = (
  snapshot: SourceSnapshot,
  cut: Cut,
): EffectiveHistory => {
  const projectedById = projectBranch(snapshot.branch);
  const cutIndex = resolveCutIndex(snapshot, cut);
  const records: EffectiveRecord[] = [];
  const excluded: RecordInfo[] = [];
  const derived: SessionEntry[] = [];

  for (let index = 0; index < snapshot.branch.length; index++) {
    const entry = snapshot.branch[index];
    if (!entry) continue;
    if (!isMessageRecord(entry)) {
      if (entry.type === "compaction" || entry.type === "branch_summary") {
        derived.push(entry);
      }
      continue;
    }
    const info: RecordInfo = {
      id: entry.id,
      order: snapshot.fileOrder.get(entry.id) ?? index,
      role: roleOf(entry),
      onBranch: true,
      effective: false,
      live: false,
      contentStorageId: entry.id,
      primaryField: primaryFieldPath(entry),
    };
    const reason = exclusionReasonFor(entry);
    if (reason) {
      info.excludedReason = reason;
      excluded.push(info);
      continue;
    }
    const edit = snapshot.edits.get(entry.id);
    if (edit && edit.replacement === null) {
      info.excludedReason = "edited";
      excluded.push(info);
      continue;
    }
    info.effective = true;
    if (edit) {
      info.contentStorageId = edit.id;
      info.primaryField = primaryFieldPath(edit);
    }
    info.live = index >= cutIndex;
    const messages = projectedById.get(entry.id) ?? [];
    records.push({
      entry,
      storageEntry: edit ?? entry,
      info,
      messages,
      ...(edit ? { editId: edit.id } : {}),
    });
  }

  const offBranch: RecordInfo[] = [];
  for (let index = 0; index < snapshot.entries.length; index++) {
    const entry = snapshot.entries[index];
    if (!entry || !isMessageRecord(entry)) continue;
    if (snapshot.branchIndex.has(entry.id)) continue;
    offBranch.push({
      id: entry.id,
      order: index,
      role: roleOf(entry),
      onBranch: false,
      effective: false,
      live: false,
      excludedReason: "off-branch",
      contentStorageId: entry.id,
      primaryField: primaryFieldPath(entry),
    });
  }

  // An edit of a compaction checkpoint bounds capsule candidates: the old
  // summarized prefix must not be reintroduced as if it were still current.
  let lowerBoundIndex = -1;
  for (const edit of snapshot.edits.values()) {
    const target = snapshot.byId.get(edit.targetId);
    if (target?.type !== "compaction") continue;
    const targetIndex = snapshot.branchIndex.get(target.id);
    if (targetIndex !== undefined && targetIndex > lowerBoundIndex) {
      lowerBoundIndex = targetIndex;
    }
  }
  const lowerBoundId =
    lowerBoundIndex >= 0
      ? snapshot.branch[lowerBoundIndex]?.id
      : undefined;

  const live = records.filter((record) => record.info.live);
  const history = records.filter((record) => {
    if (record.info.live) return false;
    const index = snapshot.branchIndex.get(record.entry.id) ?? -1;
    return index > lowerBoundIndex;
  });

  const saved = snapshot.entries.filter(isMessageRecord).length;
  return {
    snapshot,
    cut,
    records,
    excluded,
    offBranch,
    derived,
    live,
    history,
    ...(lowerBoundId ? { lowerBoundId } : {}),
    counts: {
      saved,
      effective: records.length,
      live: live.length,
      outside: offBranch.length,
    },
  };
};

/**
 * Effective fields of one record. Edited content comes from the edit entry's
 * /replacement/... fields; non-content fields of the original record (such as
 * saved nestedCalls) remain addressable on their original entry.
 */
export const effectiveFields = (record: EffectiveRecord): TextField[] => {
  if (!record.editId) return fieldList(record.entry);
  const base = editableContentBase(record.entry);
  const replacement = fieldList(record.storageEntry)
    .filter((field) => field.path.startsWith("/replacement/"))
    .map((field) => ({
      ...field,
      ownerId: record.info.id,
    }));
  const retained = fieldList(record.entry)
    .filter((field) => {
      if (!base) return true;
      return field.path !== base && !field.path.startsWith(`${base}/`);
    })
    .map((field) => ({
      ...field,
      ownerId: record.info.id,
    }));
  return [...replacement, ...retained];
};

/** Primary effective field, or undefined when the record has no visible text. */
export const primaryEffectiveField = (
  record: EffectiveRecord,
): TextField | undefined => {
  const primary = primaryFieldOf(record.storageEntry);
  return primary ? { ...primary, ownerId: record.info.id } : undefined;
};

export interface EntryVisibility {
  onBranch: boolean;
  /** True for compaction, context_edit, custom and other state entries. */
  derived: boolean;
  effective: boolean;
  excludedReason?: ExclusionReason;
  /** Entry that stores the visible text. */
  contentStorageId: string;
  /** The applied edit, when any. */
  editId?: string;
}

/**
 * Explain one saved entry for the reader without needing a cut. Explicit reads
 * may address historical or derived records; this only reports visibility.
 */
export const entryVisibility = (
  snapshot: SourceSnapshot,
  entryId: string,
): EntryVisibility | undefined => {
  const entry = snapshot.byId.get(entryId);
  if (!entry) return undefined;
  if (!isMessageRecord(entry)) {
    return { onBranch: snapshot.branchIndex.has(entry.id), derived: true, effective: false, contentStorageId: entry.id };
  }
  if (!snapshot.branchIndex.has(entry.id)) {
    return {
      onBranch: false,
      derived: false,
      effective: false,
      excludedReason: "off-branch",
      contentStorageId: entry.id,
    };
  }
  const reason = exclusionReasonFor(entry);
  if (reason) {
    return {
      onBranch: true,
      derived: false,
      effective: false,
      excludedReason: reason,
      contentStorageId: entry.id,
    };
  }
  const edit = snapshot.edits.get(entry.id);
  if (edit && edit.replacement === null) {
    return {
      onBranch: true,
      derived: false,
      effective: false,
      excludedReason: "edited",
      contentStorageId: entry.id,
    };
  }
  return {
    onBranch: true,
    derived: false,
    effective: true,
    contentStorageId: edit?.id ?? entry.id,
    ...(edit ? { editId: edit.id } : {}),
  };
};

/**
 * True for the arguments of a context_index call, direct or nested. The query
 * itself is model-authored input that is already in the live turn; indexing it
 * makes every search find its own request. Explicit list/read still sees the
 * saved field, matching the self-echo rule for results.
 */
export const isSelfEchoToolField = (
  entry: SessionEntry,
  path: string,
): boolean => {
  if (entry.type !== "message") return false;
  if (entry.message.role === "assistant") {
    const match = /^\/message\/content\/(\d+)\/arguments(?:\/|$)/.exec(path);
    if (!match || match[1] === undefined) return false;
    const content = (entry.message as { content?: unknown }).content;
    if (!Array.isArray(content)) return false;
    const block = content[Number(match[1])] as
      | { type?: unknown; name?: unknown }
      | undefined;
    return block?.type === "toolCall" && block.name === SELF_ECHO_TOOL_NAME;
  }
  if (entry.message.role === "toolResult") {
    const match = /^\/message\/nestedCalls\/calls\/(\d+)\/arguments(?:\/|$)/.exec(
      path,
    );
    if (!match || match[1] === undefined) return false;
    const nested = (entry.message as { nestedCalls?: unknown }).nestedCalls;
    if (typeof nested !== "object" || nested === null) return false;
    const calls = (nested as { calls?: unknown }).calls;
    if (!Array.isArray(calls)) return false;
    const call = calls[Number(match[1])] as { name?: unknown } | undefined;
    return call?.name === SELF_ECHO_TOOL_NAME;
  }
  return false;
};

/** Map one effective record's shown spans to owner/storage pairs. */
export const spanFor = (
  record: EffectiveRecord,
  field: TextField,
  start: number,
  end: number,
): Span => ({
  ownerId: record.info.id,
  storageId: field.storageId,
  field: field.path,
  start,
  end,
});
