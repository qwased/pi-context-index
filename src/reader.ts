/**
 * Reader primitives: native refs, stored-field resolution and grapheme-safe
 * windows over one saved field.
 *
 * Every address is owner-independent: reading e:<entryId> field=<pointer>
 * always returns the text stored on that entry. Edited messages are read
 * through the edit entry's /replacement/... path, which the capsule and search
 * print as the storage address.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  fieldList,
  isTextFieldValue,
  parsePointer,
  primaryFieldOf,
  resolvePointer,
} from "./fields";
import type { Chunk, TextField, TextFieldKind } from "./model";
import {
  captureSource,
  effectiveFields,
  entryVisibility,
  projectHistory,
  selfEchoRanges,
  SELF_ECHO_BEGIN,
  SELF_ECHO_END,
  type EffectiveRecord,
  type SourceManagerLike,
  type SourceSnapshot,
} from "./source";
import { chunkField } from "./chunks";
import {
  Bm25Index,
  containsLiteral,
  scanLiteralMatches,
  tokenize,
} from "./search";
import {
  contextHeadroomChars,
  estimateMessageChars,
  LIST_PAGE_SIZE,
  LIST_SEARCH_OUTPUT_CAP,
  READ_DEFAULT_LENGTH,
  READ_MAX_LENGTH,
  READ_OUTPUT_CAP,
  FULL_READ_OUTPUT_CAP,
  RUN_READ_MAX_CALLS,
  SEARCH_PAGE_SIZE,
  SEARCH_SCAN_SLICE_MS,
  type ReaderRunBudget,
  type Reservation,
} from "./budget";
import type { Cut } from "./cut";

export type ReadFailureReason =
  | "invalid_ref"
  | "not_found"
  | "primary_not_found"
  | "field_not_found"
  | "field_not_text";

export type StoredReadResult =
  | { ok: true; field: TextField }
  | { ok: false; reason: ReadFailureReason; detail: string };

export const ENTRY_REF_PREFIX = "e:";

/** Parse e:<entryId>; an empty or differently prefixed ref is invalid. */
export const parseEntryRef = (ref: string): string | undefined => {
  if (!ref.startsWith(ENTRY_REF_PREFIX)) return undefined;
  const id = ref.slice(ENTRY_REF_PREFIX.length);
  return id.length > 0 ? id : undefined;
};

export const formatEntryRef = (entryId: string): string =>
  ENTRY_REF_PREFIX + entryId;

/** Anything the reader can resolve native ids from. */
export interface EntryIndex {
  readonly byId: ReadonlyMap<string, SessionEntry>;
}

const indexEntries = (entries: readonly SessionEntry[]): Map<string, SessionEntry> => {
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return byId;
};

const kindForResolvedPath = (path: string): TextFieldKind => {
  if (path.includes("/arguments")) return "argument";
  if (path.endsWith("/error") || path.startsWith("/message/output")) return "result";
  return "text";
};

/**
 * Resolve one stored field by native identity. Without a field, the entry's
 * primary text field is used. Explicit pointers may address any saved string
 * or scalar, including fields the candidate selector would never surface.
 */
export const resolveStoredField = (
  index: EntryIndex,
  ref: string,
  field?: string,
): StoredReadResult => {
  const id = parseEntryRef(ref);
  if (!id) {
    return {
      ok: false,
      reason: "invalid_ref",
      detail: `ref must be "${ENTRY_REF_PREFIX}<entryId>"`,
    };
  }

  const entry = index.byId.get(id);
  if (!entry) {
    return {
      ok: false,
      reason: "not_found",
      detail: `${ref} is not in this session file`,
    };
  }

  if (field === undefined) {
    const primary = primaryFieldOf(entry);
    if (!primary) {
      return {
        ok: false,
        reason: "primary_not_found",
        detail: `${ref} has no default text field; pass field=<JSON Pointer>`,
      };
    }
    return { ok: true, field: primary };
  }

  const tokens = parsePointer(field);
  if (!tokens) {
    return {
      ok: false,
      reason: "field_not_found",
      detail: "field must be a JSON Pointer such as /message/content",
    };
  }
  const value = resolvePointer(entry, tokens);
  if (value === undefined) {
    return {
      ok: false,
      reason: "field_not_found",
      detail: `${ref} has no field ${field}`,
    };
  }
  if (!isTextFieldValue(value)) {
    return {
      ok: false,
      reason: "field_not_text",
      detail: `${ref} field ${field} is not stored text or a scalar; browse fields with list ref=${ref}`,
    };
  }
  return {
    ok: true,
    field: {
      ownerId: entry.id,
      storageId: entry.id,
      path: field,
      kind: typeof value === "string" ? kindForResolvedPath(field) : "scalar",
      text: typeof value === "string" ? value : String(value),
    },
  };
};

/** Array-entry convenience used by the host tool and tests. */
export const readStoredField = (
  entries: readonly SessionEntry[],
  ref: string,
  field?: string,
): StoredReadResult =>
  resolveStoredField({ byId: indexEntries(entries) }, ref, field);

/** Backwards-compatible name for the default field of a stored entry. */
export const primaryTextField = primaryFieldOf;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/** Grapheme cluster start at or before offset, in UTF-16 units. */
export const graphemeStartAtOrBefore = (text: string, offset: number): number => {
  if (offset <= 0) return 0;
  if (offset >= text.length) return text.length;
  let boundary = 0;
  for (const segment of graphemeSegmenter.segment(text)) {
    if (segment.index > offset) break;
    boundary = segment.index;
  }
  return boundary;
};

/** End of the grapheme cluster containing offset. */
export const graphemeEndAfter = (text: string, offset: number): number => {
  if (offset >= text.length) return text.length;
  for (const segment of graphemeSegmenter.segment(text)) {
    const end = segment.index + segment.segment.length;
    if (end > offset) return end;
  }
  return text.length;
};

/** Largest grapheme-aligned prefix end not past maxChars, in UTF-16 units. */
export const fitGraphemePrefix = (text: string, maxChars: number): number => {
  if (maxChars <= 0) return 0;
  if (maxChars >= text.length) return text.length;
  let end = 0;
  for (const segment of graphemeSegmenter.segment(text)) {
    const next = segment.index + segment.segment.length;
    if (next > maxChars) break;
    end = next;
  }
  return end;
};

export type GraphemeWindowFailure =
  | "eof"
  | "out-of-range"
  | "grapheme-too-large";

export type GraphemeWindow =
  | {
      ok: true;
      /** Grapeheme-aligned actual start (may be before the requested offset). */
      start: number;
      /** Grapheme-aligned actual end. */
      end: number;
      total: number;
      remaining: number;
      text: string;
    }
  | {
      ok: false;
      reason: GraphemeWindowFailure;
      total: number;
      /** UTF-16 width of the first cluster, when it alone exceeds the grant. */
      required?: number;
    };

/**
 * Bounded, grapheme-aligned window over one stored field. Never normalizes
 * text and never splits a cluster to satisfy a character cap; the caller
 * reports the actual range that was returned.
 */
export const fitGraphemeWindow = (
  text: string,
  offset: number,
  maxChars: number,
): GraphemeWindow => {
  const total = text.length;
  if (offset < 0) return { ok: false, reason: "out-of-range", total };
  if (offset === total) return { ok: false, reason: "eof", total };
  if (offset > total) return { ok: false, reason: "out-of-range", total };

  const start = graphemeStartAtOrBefore(text, offset);
  let end = Math.min(start + Math.max(0, maxChars), total);
  if (end < total) end = graphemeStartAtOrBefore(text, end);
  if (end <= start) {
    const required = graphemeEndAfter(text, start) - start;
    return { ok: false, reason: "grapheme-too-large", total, required };
  }
  return {
    ok: true,
    start,
    end,
    total,
    remaining: total - end,
    text: text.slice(start, end),
  };
};

// ═══════════════════════════════════════════════════════════════════════
// P3 reader: three actions, versioned cursors and one run budget.
// ═══════════════════════════════════════════════════════════════════════

export type ReaderAction = "list" | "search" | "read";
export type ReaderScope = "branch" | "session";
export type ReaderMatch = "terms" | "literal";

export interface ReaderArgs {
  action: ReaderAction;
  ref?: string;
  field?: string;
  role?: string;
  query?: string;
  match?: ReaderMatch;
  scope?: ReaderScope;
  cursor?: string;
  offset?: number;
  length?: number;
  full?: boolean;
}

export interface ReaderNext {
  ref?: string;
  field?: string;
  offset?: number;
  length?: number;
  full?: boolean;
}

export interface ReaderDetails {
  action: ReaderAction;
  scope?: ReaderScope;
  ref?: string;
  ownerId?: string;
  storageId?: string;
  field?: string;
  onBranch?: boolean;
  effective?: boolean;
  excludedReason?: string;
  start?: number;
  end?: number;
  chars?: number;
  complete?: boolean;
  incomplete?: boolean;
  remainingChars?: number;
  runRemainingChars?: number;
  resume?: "now" | "next-run";
  cursor?: string;
  next?: ReaderNext;
  budgetExhausted?: boolean;
  error?: string;
  page?: { nextOrdinal: number };
  scan?: { fieldOrdinal: number; offset: number };
}

export interface ReaderToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: ReaderDetails;
  isError?: boolean;
}

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number;
}

/** Structural subset of Pi's ExtensionToolContext the reader needs. */
export interface ReaderContext {
  sessionManager: SourceManagerLike & {
    getBranch(fromId?: string): SessionEntry[];
    buildSessionProjection?(): { messages: readonly unknown[] };
  };
  getContextUsage?(): ContextUsageLike | undefined;
  model?: { contextWindow?: number; maxTokens?: number };
}

export interface ReaderSettings {
  viewMaxChars: number;
  keepUserTurns: number;
  runReadMaxChars: number;
}

interface ReadCursorState {
  storageId: string;
  field: string;
  nextOffset: number;
  full: boolean;
}

interface CursorState {
  v: 1;
  action: ReaderAction;
  sessionId: string;
  headId: string | null;
  watermarkId: string | null;
  scope?: ReaderScope;
  role?: string;
  query?: string;
  match?: ReaderMatch;
  ref?: string;
  field?: string;
  page?: { nextOrdinal: number };
  scan?: { fieldOrdinal: number; offset: number };
  read?: ReadCursorState;
}

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const CURSOR_VERSION = 1;

export const encodeReaderCursor = (state: Omit<CursorState, "v">): string =>
  Buffer.from(JSON.stringify({ v: CURSOR_VERSION, ...state }), "utf8").toString(
    "base64url",
  );

export const decodeReaderCursor = (
  raw: string,
): { ok: true; state: CursorState } | { ok: false; reason: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "not a context_index cursor" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "cursor is not an object" };
  }
  const cursor = parsed as Record<string, unknown>;
  if (cursor["v"] !== CURSOR_VERSION) {
    return { ok: false, reason: "unsupported cursor version" };
  }
  if (
    cursor["action"] !== "list" &&
    cursor["action"] !== "search" &&
    cursor["action"] !== "read"
  ) {
    return { ok: false, reason: "malformed cursor action" };
  }
  if (typeof cursor["sessionId"] !== "string" || cursor["sessionId"].length === 0) {
    return { ok: false, reason: "malformed cursor session" };
  }
  if (cursor["headId"] !== null && typeof cursor["headId"] !== "string") {
    return { ok: false, reason: "malformed cursor head" };
  }
  if (
    cursor["watermarkId"] !== null &&
    typeof cursor["watermarkId"] !== "string"
  ) {
    return { ok: false, reason: "malformed cursor watermark" };
  }
  if (
    cursor["scope"] !== undefined &&
    cursor["scope"] !== "branch" &&
    cursor["scope"] !== "session"
  ) {
    return { ok: false, reason: "malformed cursor scope" };
  }
  if (
    cursor["match"] !== undefined &&
    cursor["match"] !== "terms" &&
    cursor["match"] !== "literal"
  ) {
    return { ok: false, reason: "malformed cursor match" };
  }
  for (const key of ["role", "query", "ref", "field"] as const) {
    if (cursor[key] !== undefined && typeof cursor[key] !== "string") {
      return { ok: false, reason: "malformed cursor " + key };
    }
  }
  if (cursor["page"] !== undefined) {
    const page = cursor["page"];
    if (
      typeof page !== "object" ||
      page === null ||
      !isNonNegativeInt((page as Record<string, unknown>)["nextOrdinal"])
    ) {
      return { ok: false, reason: "malformed page cursor" };
    }
  }
  if (cursor["scan"] !== undefined) {
    const scan = cursor["scan"];
    if (
      typeof scan !== "object" ||
      scan === null ||
      !isNonNegativeInt((scan as Record<string, unknown>)["fieldOrdinal"]) ||
      !isNonNegativeInt((scan as Record<string, unknown>)["offset"])
    ) {
      return { ok: false, reason: "malformed scan cursor" };
    }
  }
  if (cursor["read"] !== undefined) {
    const read = cursor["read"];
    if (
      typeof read !== "object" ||
      read === null ||
      typeof (read as Record<string, unknown>)["storageId"] !== "string" ||
      typeof (read as Record<string, unknown>)["field"] !== "string" ||
      !isNonNegativeInt((read as Record<string, unknown>)["nextOffset"]) ||
      typeof (read as Record<string, unknown>)["full"] !== "boolean"
    ) {
      return { ok: false, reason: "malformed read cursor" };
    }
  }
  return { ok: true, state: parsed as CursorState };
};

// ── scope records ─────────────────────────────────────────────────────────

interface ScopeRecord {
  id: string;
  order: number;
  role: string;
  entry: SessionEntry;
  storageEntry: SessionEntry;
  fields: TextField[];
  onBranch: boolean;
  effective: boolean;
  excludedReason?: string;
  revisionOf?: string;
}

const compactAllCut = (snapshot: SourceSnapshot): Cut => ({
  firstKeptEntryId: "",
  cutIndex: snapshot.branch.length,
  reason: "compact-all",
  requestedKeep: 0,
  keptUserTurns: 0,
  totalUserTurns: 0,
  tailTokens: 0,
  tailTokenLimit: 0,
});

const branchRecords = (snapshot: SourceSnapshot): ScopeRecord[] => {
  const history = projectHistory(snapshot, compactAllCut(snapshot));
  return history.records.map((record: EffectiveRecord) => ({
    id: record.info.id,
    order: record.info.order,
    role: record.info.role,
    entry: record.entry,
    storageEntry: record.storageEntry,
    fields: effectiveFields(record),
    onBranch: true,
    effective: true,
    ...(record.editId ? { revisionOf: record.editId } : {}),
  }));
};

const sessionRecords = (snapshot: SourceSnapshot): ScopeRecord[] => {
  const records: ScopeRecord[] = [];
  snapshot.entries.forEach((entry, index) => {
    if (entry.type === "context_edit") {
      records.push({
        id: entry.id,
        order: index,
        role: "edit",
        entry,
        storageEntry: entry,
        fields: fieldList(entry),
        onBranch: snapshot.branchIndex.has(entry.id),
        effective: false,
        revisionOf: entry.targetId,
      });
      return;
    }
    if (entry.type !== "message" && entry.type !== "custom_message") return;
    const visibility = entryVisibility(snapshot, entry.id);
    if (visibility?.excludedReason === "self-echo") return;
    records.push({
      id: entry.id,
      order: index,
      role: entry.type === "message" ? entry.message.role : "custom",
      entry,
      storageEntry: entry,
      fields: fieldList(entry),
      onBranch: snapshot.branchIndex.has(entry.id),
      effective: visibility?.effective ?? false,
      ...(visibility?.excludedReason
        ? { excludedReason: visibility.excludedReason }
        : {}),
    });
  });
  return records;
};

const scopeRecords = (
  snapshot: SourceSnapshot,
  scope: ReaderScope,
  role?: string,
): ScopeRecord[] => {
  const records = scope === "session" ? sessionRecords(snapshot) : branchRecords(snapshot);
  return role ? records.filter((record) => record.role === role) : records;
};

const echoRangesOf = (field: TextField) => selfEchoRanges(field.text);

const insideRanges = (
  offset: number,
  ranges: readonly { start: number; end: number }[],
): boolean => ranges.some((range) => offset >= range.start && offset < range.end);


// ── frames, cursor snapshots and paging ──────────────────────────────────

/** Reserve inside a granted frame for header, footer and cursor digits. */
const FRAME_RESERVE = 360;

const wrapReaderText = (text: string): string =>
  SELF_ECHO_BEGIN + "\n" + text + "\n" + SELF_ECHO_END;

const toolCallText = (args: Record<string, unknown>): string =>
  "context_index " + JSON.stringify(args);

const sessionManagerOf = (ctx: ReaderContext) => ctx.sessionManager;

const snapshotForNewAction = (ctx: ReaderContext): SourceSnapshot =>
  captureSource(sessionManagerOf(ctx));

const snapshotForCursor = (
  ctx: ReaderContext,
  state: CursorState,
): { ok: true; snapshot: SourceSnapshot } | { ok: false; reason: string } => {
  const manager = sessionManagerOf(ctx);
  const sessionId = manager.getSessionId();
  if (state.sessionId !== sessionId) {
    return { ok: false, reason: "cursor belongs to another session" };
  }
  const all = manager.getEntries();
  const watermarkIndex = state.watermarkId
    ? all.findIndex((entry) => entry.id === state.watermarkId)
    : all.length - 1;
  if (watermarkIndex < 0) {
    return {
      ok: false,
      reason: "cursor watermark is no longer in the session file",
    };
  }
  const filtered = all.slice(0, watermarkIndex + 1);
  const branch = state.headId ? manager.getBranch(state.headId) : [];
  if (state.headId && !filtered.some((entry) => entry.id === state.headId)) {
    return { ok: false, reason: "cursor branch head is no longer saved" };
  }
  if (state.scope !== "session") {
    const currentBranch = manager.getBranch();
    if (state.headId && !currentBranch.some((entry) => entry.id === state.headId)) {
      return {
        ok: false,
        reason: "the conversation branch changed; restart the action",
      };
    }
    const visibleIds = new Set(filtered.map((entry) => entry.id));
    for (const entry of all.slice(watermarkIndex + 1)) {
      if (entry.type === "context_edit" && visibleIds.has(entry.targetId)) {
        return {
          ok: false,
          reason:
            "a context edit changed the effective history; restart the action",
        };
      }
    }
  }
  const fake: SourceManagerLike = {
    getEntries: () => filtered,
    getBranch: () => (state.headId ? branch : []),
    getSessionId: () => sessionId,
    getLeafId: () => state.headId,
    getSessionFile: () => manager.getSessionFile?.(),
  };
  return { ok: true, snapshot: captureSource(fake, branch) };
};

interface PageInput {
  /** Rebuilt per shown count because the header carries the range. */
  headerFor: (shown: number) => string;
  /** Items from start, at most one page. */
  items: readonly string[];
  start: number;
  /** Total items in the logical page sequence. */
  totalItems: number;
  pageSize: number;
  cap: number;
  /** Resume ordinal after a given shown count; undefined means complete. */
  nextFor: (shown: number) => number | undefined;
  makeFooter: (input: {
    shown: number;
    next: number | undefined;
    cursor: string | undefined;
    runRemainingChars: number;
  }) => string;
  cursorFor: (next: number) => string;
  grant: number;
  budget: ReaderRunBudget;
}

interface PageResult {
  text: string;
  next: number | undefined;
  incomplete: boolean;
}

/**
 * Render one page and converge the run-remaining footer digits with the final
 * text length. The page fitter below then drops items until the whole text,
 * cursor included, fits the grant.
 */
const pageText = (
  input: PageInput,
  shown: number,
): { text: string; next: number | undefined } => {
  const next = input.nextFor(shown);
  const header = input.headerFor(shown);
  const body = input.items
    .slice(0, shown)
    .map((item) => "\n" + item)
    .join("");
  const cursor = next === undefined ? undefined : input.cursorFor(next);
  let runRemaining = Math.max(0, input.budget.remainingChars + input.grant);
  let text = "";
  for (let pass = 0; pass < 4; pass++) {
    const footer = input.makeFooter({
      shown,
      next,
      cursor,
      runRemainingChars: runRemaining,
    });
    text = header + body + "\n" + footer;
    const actual = Math.max(
      0,
      input.budget.remainingChars + input.grant - text.length,
    );
    if (actual === runRemaining) break;
    runRemaining = actual;
  }
  return { text, next };
};

const fitPage = (input: PageInput): PageResult => {
  const remainingItems = Math.max(0, input.totalItems - input.start);
  if (remainingItems === 0) {
    const built = pageText(input, 0);
    return { ...built, incomplete: false };
  }
  let shown = Math.min(input.pageSize, input.items.length, remainingItems);
  for (;;) {
    const built = pageText(input, shown);
    if (built.text.length <= input.cap || shown <= 1) {
      return { ...built, incomplete: built.next !== undefined };
    }
    shown--;
  }
};

const pageHeader = (
  action: string,
  label: string,
  shown: number,
  total: number,
  start: number,
  extra = "",
): string =>
  "[context_index " +
  action +
  " | " +
  label +
  extra +
  " | " +
  (total === 0 ? "0" : start + 1 + "-" + Math.min(start + shown, total)) +
  "/" +
  total +
  "]";

const pageFooter = (input: {
  action: ReaderAction;
  scope: ReaderScope;
  cursor: string | undefined;
  next: number | undefined;
  runRemainingChars: number;
  resume: "now" | "next-run";
}): string => {
  const nextText =
    input.cursor === undefined
      ? "complete"
      : "next: " + toolCallText({ action: input.action, cursor: input.cursor });
  return (
    "[" +
    nextText +
    "; run remaining " +
    input.runRemainingChars +
    " chars; resume " +
    (input.cursor === undefined ? "now" : input.resume) +
    "]"
  );
};

// ── list ──────────────────────────────────────────────────────────────────

interface ListItem {
  text: string;
  kind: string;
}

const recordStatus = (record: ScopeRecord): string => {
  if (!record.onBranch) return "off-branch";
  if (record.excludedReason) return record.excludedReason;
  if (record.role === "edit") return "revision";
  return record.effective ? "effective" : "indexed";
};

const listDirectoryItems = (
  records: readonly ScopeRecord[],
  snapshot: SourceSnapshot,
): ListItem[] =>
  records.map((record) => {
    const primary = record.fields[0];
    const status = recordStatus(record);
    const branch = record.onBranch ? "branch" : "session";
    const revision = record.revisionOf ? " revises=e:" + record.revisionOf : "";
    const primaryText = primary
      ? " primary=" + primary.path + " " + primary.text.length + "c"
      : " no-text-field";
    return {
      kind: "record",
      text:
        "e:" +
        record.id +
        " | " +
        record.role +
        " | " +
        status +
        " | " +
        branch +
        " | " +
        record.fields.length +
        " fields" +
        primaryText +
        revision,
    };
  });

const listFieldItems = (
  snapshot: SourceSnapshot,
  entry: SessionEntry,
): ListItem[] => {
  const fields = fieldList(entry);
  const items: ListItem[] = [];
  const visibility = entryVisibility(snapshot, entry.id);
  if (visibility?.editId) {
    const editEntry = snapshot.byId.get(visibility.editId);
    const effectiveField = editEntry ? primaryFieldOf(editEntry) : undefined;
    items.push({
      kind: "note",
      text:
        "effective: source=e:" +
        visibility.editId +
        (effectiveField
          ? " read: " +
            toolCallText({
              action: "read",
              ref: "e:" + visibility.editId,
              field: effectiveField.path,
            })
          : " (edited content; explicit reads below use the stored address)"),
    });
  }
  if (entry.type === "context_edit") {
    items.push({
      kind: "note",
      text: "revision of e:" + entry.targetId,
    });
  }
  for (const field of fields) {
    items.push({
      kind: "field",
      text:
        "field " +
        field.path +
        " | " +
        field.kind +
        " | " +
        field.text.length +
        "c | read: " +
        toolCallText({
          action: "read",
          ref: "e:" + field.storageId,
          field: field.path,
        }),
    });
    if (field.text.length >= 400) {
      let headings = 0;
      for (const chunk of chunkField(field, { exclude: echoRangesOf(field) })) {
        if (!chunk.heading) continue;
        const text = field.text.slice(chunk.heading.start, chunk.heading.end).trim();
        if (text.length === 0) continue;
        items.push({
          kind: "heading",
          text: "  @" + chunk.heading.start + " " + text,
        });
        headings++;
        if (headings >= 12) break;
      }
    }
  }
  if (items.length === 0) {
    items.push({ kind: "note", text: "no stored text or scalar fields" });
  }
  return items;
};

const listFooter = (input: {
  action: ReaderAction;
  scope: ReaderScope;
  cursor: string | undefined;
  next: number | undefined;
  runRemainingChars: number;
  resume: "now" | "next-run";
}): string => pageFooter(input);

// ── read ──────────────────────────────────────────────────────────────────


// ── search ────────────────────────────────────────────────────────────────

interface SearchFieldEntry {
  record: ScopeRecord;
  field: TextField;
  ordinal: number;
}

interface TermDoc {
  record: ScopeRecord;
  field: TextField;
  chunk: Chunk;
}

interface SearchCache {
  key: string;
  fields: SearchFieldEntry[];
  docs?: TermDoc[];
  index?: Bm25Index;
}

let searchCache: SearchCache | null = null;

const searchCacheKey = (
  snapshot: SourceSnapshot,
  scope: ReaderScope,
  role: string | undefined,
): string =>
  [
    snapshot.sessionId,
    snapshot.headId ?? "",
    snapshot.watermarkId ?? "",
    scope,
    role ?? "*",
    "v1",
  ].join("|");

const collectSearchFields = (
  snapshot: SourceSnapshot,
  scope: ReaderScope,
  role: string | undefined,
): SearchFieldEntry[] => {
  const fields: SearchFieldEntry[] = [];
  for (const record of scopeRecords(snapshot, scope, role)) {
    for (const field of record.fields) {
      if (field.text.length === 0) continue;
      fields.push({ record, field, ordinal: fields.length });
    }
  }
  return fields;
};

const ensureSearchCache = (
  snapshot: SourceSnapshot,
  scope: ReaderScope,
  role: string | undefined,
  needTerms: boolean,
): SearchCache => {
  const key = searchCacheKey(snapshot, scope, role);
  if (!searchCache || searchCache.key !== key) {
    searchCache = { key, fields: collectSearchFields(snapshot, scope, role) };
  }
  const cache = searchCache;
  if (needTerms && !cache.docs) {
    const docs: TermDoc[] = [];
    for (const entry of cache.fields) {
      const chunks = chunkField(entry.field, { exclude: echoRangesOf(entry.field) });
      for (const chunk of chunks) {
        docs.push({ record: entry.record, field: entry.field, chunk });
      }
    }
    const index = new Bm25Index(
      docs.map((doc, index) => {
        let length = 0;
        for (const count of doc.chunk.terms.values()) length += count;
        return { key: String(index), terms: doc.chunk.terms, length };
      }),
    );
    cache.docs = docs;
    cache.index = index;
  }
  return cache;
};

interface TermHit {
  record: ScopeRecord;
  field: TextField;
  chunk: Chunk;
  score: number;
}

const rankTermHits = (cache: SearchCache, query: string): TermHit[] => {
  if (!cache.docs || !cache.index) return [];
  const scores = cache.index.score(tokenize(query));
  const hits: TermHit[] = [];
  for (const [key, score] of scores) {
    const doc = cache.docs[Number(key)];
    if (!doc) continue;
    const literalBonus = containsLiteral(
      doc.field.text.slice(doc.chunk.span.start, doc.chunk.span.end),
      query,
    )
      ? 0.25
      : 0;
    hits.push({
      record: doc.record,
      field: doc.field,
      chunk: doc.chunk,
      score: score + literalBonus,
    });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.record.order - a.record.order ||
      a.field.path.localeCompare(b.field.path) ||
      a.chunk.span.start - b.chunk.span.start,
  );
  // Best hit per owner first, then the remaining hits from the same owners.
  const firstPerOwner: TermHit[] = [];
  const rest: TermHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.record.id)) {
      rest.push(hit);
      continue;
    }
    seen.add(hit.record.id);
    firstPerOwner.push(hit);
  }
  return [...firstPerOwner, ...rest];
};

interface SnippetWindow {
  start: number;
  end: number;
  text: string;
}

const snippetAt = (
  text: string,
  focusStart: number,
  focusEnd: number,
  width: number,
): SnippetWindow => {
  let start = graphemeStartAtOrBefore(text, Math.max(0, focusStart - 80));
  let end = Math.min(text.length, start + width);
  end = graphemeStartAtOrBefore(text, end);
  if (end <= focusStart) {
    end = Math.min(text.length, graphemeEndAfter(text, Math.min(focusStart, text.length - 1)));
  }
  if (end < focusEnd) {
    end = Math.min(text.length, graphemeEndAfter(text, focusEnd));
  }
  if (end <= start) {
    start = graphemeStartAtOrBefore(text, focusStart);
    end = Math.min(text.length, graphemeEndAfter(text, Math.max(0, focusStart)));
  }
  return { start, end, text: text.slice(start, end) };
};

const readSuffix = (field: TextField, snippet: SnippetWindow): string => {
  const length = Math.max(
    1,
    Math.min(READ_DEFAULT_LENGTH, field.text.length - snippet.start),
  );
  return (
    "   read: " +
    toolCallText({
      action: "read",
      ref: "e:" + field.storageId,
      field: field.path,
      offset: snippet.start,
      length,
    })
  );
};

const hitLabel = (hit: {
  record: ScopeRecord;
  field: TextField;
  start: number;
  end: number;
}): string => {
  const storage =
    hit.field.storageId !== hit.record.id
      ? " source=e:" + hit.field.storageId
      : "";
  return (
    "e:" +
    hit.record.id +
    " " +
    hit.record.role +
    storage +
    " | field=" +
    hit.field.path +
    " | @" +
    hit.start +
    "-" +
    hit.end
  );
};

const renderTermHit = (hit: TermHit, position: number): string => {
  const snippet = snippetAt(
    hit.field.text,
    hit.chunk.span.start,
    Math.min(hit.field.text.length, hit.chunk.span.start + 1),
    240,
  );
  return (
    position +
    ". " +
    hitLabel({
      record: hit.record,
      field: hit.field,
      start: hit.chunk.span.start,
      end: hit.chunk.span.end,
    }) +
    "\n" +
    snippet.text +
    "\n" +
    readSuffix(hit.field, snippet)
  );
};

interface LiteralHit {
  record: ScopeRecord;
  field: TextField;
  fieldOrdinal: number;
  start: number;
  end: number;
}

interface LiteralScan {
  hits: LiteralHit[];
  next?: { fieldOrdinal: number; offset: number };
  timedOut: boolean;
}

const scanLiteralPage = (
  fields: readonly SearchFieldEntry[],
  query: string,
  from: { fieldOrdinal: number; offset: number },
  signal: AbortSignal | undefined,
): LiteralScan => {
  const startedAt = Date.now();
  const hits: LiteralHit[] = [];
  let ordinal = from.fieldOrdinal;
  let offset = from.offset;
  for (; ordinal < fields.length; ordinal++, offset = 0) {
    signal?.throwIfAborted();
    if (hits.length >= SEARCH_PAGE_SIZE) {
      return { hits, next: { fieldOrdinal: ordinal, offset }, timedOut: false };
    }
    if (Date.now() - startedAt > SEARCH_SCAN_SLICE_MS) {
      return { hits, next: { fieldOrdinal: ordinal, offset }, timedOut: true };
    }
    const entry = fields[ordinal];
    if (!entry) break;
    const text = entry.field.text;
    if (offset >= text.length) continue;
    const ranges = echoRangesOf(entry.field);
    const matches = scanLiteralMatches(text, query, offset);
    for (const match of matches) {
      if (insideRanges(match.start, ranges)) continue;
      hits.push({
        record: entry.record,
        field: entry.field,
        fieldOrdinal: ordinal,
        start: match.start,
        end: match.end,
      });
      if (hits.length >= SEARCH_PAGE_SIZE) {
        return {
          hits,
          next: { fieldOrdinal: ordinal, offset: match.end },
          timedOut: false,
        };
      }
    }
  }
  return { hits, timedOut: false };
};

const renderLiteralHit = (hit: LiteralHit, position: number): string => {
  const snippet = snippetAt(hit.field.text, hit.start, hit.end, 240);
  return (
    position +
    ". " +
    hitLabel({
      record: hit.record,
      field: hit.field,
      start: hit.start,
      end: hit.end,
    }) +
    "\n" +
    snippet.text +
    "\n" +
    readSuffix(hit.field, snippet)
  );
};


// ── read rendering ────────────────────────────────────────────────────────

interface ReadRender {
  text: string;
  end: number;
  cursor?: string;
  next?: ReaderNext;
  incomplete: boolean;
}

const readCursorBase = (
  snapshot: SourceSnapshot,
  storageId: string,
  field: string,
  nextOffset: number,
  full: boolean,
): CursorState => ({
  v: 1,
  action: "read",
  sessionId: snapshot.sessionId,
  headId: snapshot.headId,
  watermarkId: snapshot.watermarkId,
  read: { storageId, field, nextOffset, full },
});

const buildReadText = (input: {
  snapshot: SourceSnapshot;
  field: TextField;
  start: number;
  end: number;
  total: number;
  full: boolean;
  requestedLength: number;
  grant: number;
  budget: ReaderRunBudget;
}): ReadRender => {
  const header =
    "[context_index read | e:" +
    input.field.storageId +
    " | field=" +
    input.field.path +
    " | " +
    input.start +
    "-" +
    input.end +
    "/" +
    input.total +
    " | " +
    (input.full || (input.start === 0 && input.end === input.total)
      ? "full"
      : "partial") +
    "]";
  const body = input.field.text.slice(input.start, input.end);
  const incomplete = input.end < input.total;
  const cursor = incomplete
    ? encodeReaderCursor(
        readCursorBase(
          input.snapshot,
          input.field.storageId,
          input.field.path,
          input.end,
          input.full,
        ),
      )
    : undefined;
  const next: ReaderNext | undefined = incomplete
    ? {
        ref: "e:" + input.field.storageId,
        field: input.field.path,
        offset: input.end,
        length: input.requestedLength,
        ...(input.full ? { full: true } : {}),
      }
    : undefined;
  let runRemaining = Math.max(0, input.budget.remainingChars + input.grant);
  let text = "";
  for (let pass = 0; pass < 4; pass++) {
    const resume = runRemaining > 0 ? "now" : "next-run";
    const footer = incomplete
      ? "[remaining " +
        (input.total - input.end) +
        " chars; next: " +
        toolCallText({
          action: "read",
          ...(cursor ? { cursor } : { ref: "e:" + input.field.storageId, field: input.field.path, offset: input.end }),
        }) +
        "; run remaining " +
        runRemaining +
        " chars; resume " +
        resume +
        "]"
      : "[complete; run remaining " + runRemaining + " chars; resume now]";
    text = wrapReaderText(header + "\n" + body + "\n" + footer);
    const actual = Math.max(
      0,
      input.budget.remainingChars + input.grant - text.length,
    );
    if (actual === runRemaining) break;
    runRemaining = actual;
  }
  return {
    text,
    end: input.end,
    ...(cursor ? { cursor } : {}),
    ...(next ? { next } : {}),
    incomplete,
  };
};

const emptyPageText = (
  header: string,
  message: string,
  grant: number,
  budget: ReaderRunBudget,
): string => {
  let runRemaining = Math.max(0, budget.remainingChars + grant);
  let text = "";
  for (let pass = 0; pass < 4; pass++) {
    text = wrapReaderText(
      header +
        "\n[" +
        message +
        "; run remaining " +
        runRemaining +
        " chars; complete]",
    );
    const actual = Math.max(0, budget.remainingChars + grant - text.length);
    if (actual === runRemaining) break;
    runRemaining = actual;
  }
  return text;
};

// ── prepared actions ──────────────────────────────────────────────────────

interface PreparedAction {
  details: ReaderDetails;
  render: (grant: number) => { text: string; details: ReaderDetails };
}

type PrepareResult =
  | { ok: true; prepared: PreparedAction }
  | { ok: false; reason: string };

const listHeaderLabel = (args: {
  scope: ReaderScope;
  role?: string;
  ref?: string;
}): string =>
  args.ref
    ? "ref=" + args.ref
    : "scope=" + args.scope + (args.role ? " role=" + args.role : "");

const prepareList = (
  input: {
    snapshot: SourceSnapshot;
    scope: ReaderScope;
    role?: string;
    ref?: string;
    state?: CursorState;
  },
  budget: ReaderRunBudget,
): PrepareResult => {
  const { snapshot, state, scope, role, ref } = input;
  const start = state?.page?.nextOrdinal ?? 0;
  const base = {
    action: "list" as const,
    sessionId: snapshot.sessionId,
    headId: snapshot.headId,
    watermarkId: snapshot.watermarkId,
    scope,
    ...(role ? { role } : {}),
    ...(ref ? { ref } : {}),
  };
  const cursorFor = (next: number): string =>
    encodeReaderCursor({ ...base, page: { nextOrdinal: next } });

  let items: string[];
  let total: number;
  if (ref) {
    const id = parseEntryRef(ref);
    if (!id) return { ok: false, reason: "ref must be e:<entryId>" };
    const entry = snapshot.byId.get(id);
    if (!entry) return { ok: false, reason: ref + " is not in this session file" };
    const fieldItems = listFieldItems(snapshot, entry);
    total = fieldItems.length;
    items = fieldItems.slice(start, start + LIST_PAGE_SIZE).map((item) => item.text);
  } else {
    const records = scopeRecords(snapshot, scope, role);
    total = records.length;
    items = listDirectoryItems(
      records.slice(start, start + LIST_PAGE_SIZE),
      snapshot,
    ).map((item) => item.text);
  }

  const label = listHeaderLabel({ scope, role, ...(ref ? { ref } : {}) });
  const headerFor = (shown: number): string =>
    pageHeader("list", label, shown, total, start);

  const render = (grant: number): { text: string; details: ReaderDetails } => {
    if (total === 0) {
      const text = emptyPageText(
        headerFor(0),
        "no records" + (role ? " for role=" + role : ""),
        grant,
        budget,
      );
      return {
        text,
        details: {
          action: "list",
          scope,
          ...(ref ? { ref } : {}),
          incomplete: false,
          complete: true,
        },
      };
    }
    const page = fitPage({
      headerFor,
      items,
      start,
      totalItems: total,
      pageSize: LIST_PAGE_SIZE,
      cap: grant,
      nextFor: (shown) => (start + shown < total ? start + shown : undefined),
      makeFooter: (footerInput) =>
        pageFooter({
          action: "list",
          scope,
          cursor: footerInput.cursor,
          next: footerInput.next,
          runRemainingChars: footerInput.runRemainingChars,
          resume: footerInput.runRemainingChars > 0 ? "now" : "next-run",
        }),
      cursorFor,
      grant,
      budget,
    });
    const cursor = page.next === undefined ? undefined : cursorFor(page.next);
    return {
      text: wrapReaderText(page.text),
      details: {
        action: "list",
        scope,
        ...(ref ? { ref } : {}),
        incomplete: page.incomplete,
        complete: !page.incomplete,
        ...(cursor ? { cursor } : {}),
      },
    };
  };

  return {
    ok: true,
    prepared: {
      details: { action: "list", scope, ...(ref ? { ref } : {}) },
      render,
    },
  };
};

const prepareTermsSearch = (
  input: {
    snapshot: SourceSnapshot;
    scope: ReaderScope;
    role?: string;
    query: string;
    state?: CursorState;
  },
  budget: ReaderRunBudget,
): PrepareResult => {
  const { snapshot, scope, role, query, state } = input;
  const cache = ensureSearchCache(snapshot, scope, role, true);
  const hits = rankTermHits(cache, query);
  const start = state?.page?.nextOrdinal ?? 0;
  if (start > hits.length) {
    return { ok: false, reason: "cursor is past the end; restart the search" };
  }
  const base = {
    action: "search" as const,
    sessionId: snapshot.sessionId,
    headId: snapshot.headId,
    watermarkId: snapshot.watermarkId,
    scope,
    ...(role ? { role } : {}),
    query,
    match: "terms" as const,
  };
  const cursorFor = (next: number): string =>
    encodeReaderCursor({ ...base, page: { nextOrdinal: next } });
  const label =
    JSON.stringify(query) +
    " terms scope=" +
    scope +
    (role ? " role=" + role : "");
  const headerFor = (shown: number): string =>
    pageHeader("search", label, shown, hits.length, start);

  const total = hits.length;
  if (total === 0) {
    const render = (grant: number) => ({
      text: emptyPageText(
        headerFor(0),
        "no matches for " +
          JSON.stringify(query) +
          " in " +
          scope +
          " scope; try other words or scope:\"session\"",
        grant,
        budget,
      ),
      details: {
        action: "search" as const,
        scope,
        incomplete: false,
        complete: true,
      },
    });
    return { ok: true, prepared: { details: { action: "search", scope }, render } };
  }

  const pageHits = hits.slice(start, start + SEARCH_PAGE_SIZE);
  const items = pageHits.map((hit, index) => renderTermHit(hit, start + index + 1));

  const render = (grant: number): { text: string; details: ReaderDetails } => {
    const page = fitPage({
      headerFor,
      items,
      start,
      totalItems: total,
      pageSize: SEARCH_PAGE_SIZE,
      cap: grant,
      nextFor: (shown) => (start + shown < total ? start + shown : undefined),
      makeFooter: (footerInput) =>
        pageFooter({
          action: "search",
          scope,
          cursor: footerInput.cursor,
          next: footerInput.next,
          runRemainingChars: footerInput.runRemainingChars,
          resume: footerInput.runRemainingChars > 0 ? "now" : "next-run",
        }),
      cursorFor,
      grant,
      budget,
    });
    const cursor = page.next === undefined ? undefined : cursorFor(page.next);
    return {
      text: wrapReaderText(page.text),
      details: {
        action: "search",
        scope,
        incomplete: page.incomplete,
        complete: !page.incomplete,
        ...(cursor ? { cursor } : {}),
      },
    };
  };

  return {
    ok: true,
    prepared: {
      details: { action: "search", scope },
      render,
    },
  };
};


const prepareLiteralSearch = (
  input: {
    snapshot: SourceSnapshot;
    scope: ReaderScope;
    role?: string;
    query: string;
    state?: CursorState;
  },
  budget: ReaderRunBudget,
  signal: AbortSignal | undefined,
): PrepareResult => {
  const { snapshot, scope, role, query, state } = input;
  const cache = ensureSearchCache(snapshot, scope, role, false);
  const from = state?.scan ?? { fieldOrdinal: 0, offset: 0 };
  const scan = scanLiteralPage(cache.fields, query, from, signal);
  const hits = scan.hits;
  const base = {
    action: "search" as const,
    sessionId: snapshot.sessionId,
    headId: snapshot.headId,
    watermarkId: snapshot.watermarkId,
    scope,
    ...(role ? { role } : {}),
    query,
    match: "literal" as const,
  };
  const cursorAtScan = (next: { fieldOrdinal: number; offset: number }): string =>
    encodeReaderCursor({ ...base, scan: next });
  const cursorFor = (next: number): string => {
    if (next < hits.length) {
      const hit = hits[next];
      if (hit) {
        return cursorAtScan({
          fieldOrdinal: hit.fieldOrdinal,
          offset: hit.start,
        });
      }
    }
    if (scan.next) return cursorAtScan(scan.next);
    return cursorAtScan(from);
  };
  const totalForFit = hits.length + (scan.next ? 1 : 0);
  const items = hits.map((hit, index) => renderLiteralHit(hit, index + 1));
  const headerFor = (shown: number): string =>
    "[context_index search | " +
    JSON.stringify(query) +
    " literal scope=" +
    scope +
    (role ? " role=" + role : "") +
    " | showing " +
    shown +
    " of " +
    hits.length +
    " hits" +
    (scan.timedOut ? " | scan slice stopped" : "") +
    "]";

  const render = (grant: number): { text: string; details: ReaderDetails } => {
    if (hits.length === 0 && !scan.next) {
      return {
        text: emptyPageText(
          headerFor(0),
          "no literal matches for " + JSON.stringify(query) + " in " + scope + " scope",
          grant,
          budget,
        ),
        details: {
          action: "search",
          scope,
          incomplete: false,
          complete: true,
        },
      };
    }
    const page = fitPage({
      headerFor,
      items,
      start: 0,
      totalItems: totalForFit,
      pageSize: SEARCH_PAGE_SIZE,
      cap: grant,
      nextFor: (shown) =>
        shown < hits.length ? shown : scan.next ? hits.length : undefined,
      makeFooter: (footerInput) =>
        pageFooter({
          action: "search",
          scope,
          cursor: footerInput.cursor,
          next: footerInput.next,
          runRemainingChars: footerInput.runRemainingChars,
          resume: footerInput.runRemainingChars > 0 ? "now" : "next-run",
        }),
      cursorFor,
      grant,
      budget,
    });
    const cursor = page.next === undefined ? undefined : cursorFor(page.next);
    return {
      text: wrapReaderText(page.text),
      details: {
        action: "search",
        scope,
        incomplete: page.incomplete,
        complete: !page.incomplete,
        ...(cursor ? { cursor } : {}),
      },
    };
  };
  return {
    ok: true,
    prepared: { details: { action: "search", scope }, render },
  };
};

const prepareRead = (
  input: {
    snapshot: SourceSnapshot;
    args: ReaderArgs;
    state?: CursorState;
  },
  budget: ReaderRunBudget,
): PrepareResult => {
  const { snapshot, args, state } = input;
  let storageId: string;
  let fieldPath: string;
  let full: boolean;
  let offset: number;
  let length: number;
  if (state?.read) {
    storageId = state.read.storageId;
    fieldPath = state.read.field;
    full = state.read.full;
    offset = state.read.nextOffset;
    length = READ_DEFAULT_LENGTH;
  } else {
    if (!args.ref) return { ok: false, reason: "ref is required for read" };
    const resolved = resolveStoredField(snapshot, args.ref, args.field);
    if (!resolved.ok) return { ok: false, reason: resolved.detail };
    storageId = resolved.field.storageId;
    fieldPath = resolved.field.path;
    full = args.full === true;
    offset = full ? 0 : Math.max(0, Math.floor(args.offset ?? 0));
    length = full
      ? READ_MAX_LENGTH
      : Math.max(
          1,
          Math.min(
            READ_MAX_LENGTH,
            Math.floor(args.length ?? READ_DEFAULT_LENGTH),
          ),
        );
  }
  const resolvedField = resolveStoredField(
    snapshot,
    "e:" + storageId,
    fieldPath,
  );
  if (!resolvedField.ok) {
    return {
      ok: false,
      reason:
        "the stored field is no longer readable (" +
        resolvedField.detail +
        "); restart the read",
    };
  }
  const field = resolvedField.field;
  const storageEntry = snapshot.byId.get(field.storageId);
  const ownerId =
    storageEntry?.type === "context_edit"
      ? storageEntry.targetId
      : field.storageId;
  const visibility = entryVisibility(snapshot, ownerId);
  const readBase = {
    action: "read" as const,
    ref: args.ref ?? "e:" + storageId,
    ownerId,
    storageId: field.storageId,
    field: fieldPath,
    onBranch: visibility?.onBranch ?? false,
    effective: visibility?.effective ?? false,
    ...(visibility?.excludedReason
      ? { excludedReason: visibility.excludedReason }
      : {}),
  };
  const total = field.text.length;
  if (offset > total) {
    return {
      ok: false,
      reason: "offset " + offset + " is past the field end (" + total + " chars)",
    };
  }
  const requestedLength = full ? READ_MAX_LENGTH : length;
  const requestedEnd = full ? total : Math.min(total, offset + length);

  const render = (grant: number): { text: string; details: ReaderDetails } => {
    if (offset === total) {
      const built = buildReadText({
        snapshot,
        field,
        start: total,
        end: total,
        total,
        full,
        requestedLength,
        grant,
        budget,
      });
      return {
        text: built.text,
        details: {
          ...readBase,
          start: total,
          end: total,
          chars: 0,
          complete: true,
          incomplete: false,
          remainingChars: 0,
        },
      };
    }
    const windowCap = Math.max(0, grant - FRAME_RESERVE);
    // Align the requested start down once, then measure the requested range
    // from the actual start so an offset inside a cluster still shows the
    // intended amount of source.
    const alignedOffset = graphemeStartAtOrBefore(field.text, offset);
    let take = Math.min(requestedEnd - alignedOffset, windowCap);
    if (take <= 0) {
      const text = emptyPageText(
        "[context_index read | e:" + storageId + " | field=" + fieldPath + "]",
        "no room for source text in this grant; use a new run",
        grant,
        budget,
      );
      return {
        text,
        details: {
          ...readBase,
          start: offset,
          end: offset,
          chars: 0,
          complete: false,
          incomplete: true,
          remainingChars: total - offset,
        },
      };
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const window = fitGraphemeWindow(field.text, alignedOffset, take);
      if (!window.ok) {
        if (window.reason === "grapheme-too-large") {
          const text = emptyPageText(
            "[context_index read | e:" +
              storageId +
              " | field=" +
              fieldPath +
              " | 0 chars]",
            "the next grapheme needs " +
              (window.required ?? take) +
              " chars; read a later offset or use a larger run budget",
            grant,
            budget,
          );
          const alignedStart = graphemeStartAtOrBefore(field.text, offset);
          return {
            text,
            details: {
              ...readBase,
              start: alignedStart,
              end: alignedStart,
              chars: 0,
              complete: false,
              incomplete: true,
              remainingChars: total - alignedStart,
            },
          };
        }
        return {
          text: emptyPageText(
            "[context_index read | e:" + storageId + " | field=" + fieldPath + "]",
            window.reason === "eof"
              ? "already at the field end"
              : "offset is outside this field",
            grant,
            budget,
          ),
          details: {
            ...readBase,
            start: offset,
            end: offset,
            chars: 0,
            complete: window.reason === "eof",
            incomplete: window.reason !== "eof",
            remainingChars: total - offset,
          },
        };
      }
      const built = buildReadText({
        snapshot,
        field,
        start: window.start,
        end: window.end,
        total,
        full,
        requestedLength,
        grant,
        budget,
      });
      if (built.text.length <= grant) {
        return {
          text: built.text,
          details: {
            ...readBase,
            start: window.start,
            end: window.end,
            chars: window.end - window.start,
            complete: built.incomplete === false,
            incomplete: built.incomplete,
            remainingChars: total - window.end,
            ...(built.cursor ? { cursor: built.cursor } : {}),
            ...(built.next ? { next: built.next } : {}),
          },
        };
      }
      const overflow = built.text.length - grant;
      take = Math.max(0, window.end - offset - overflow - 24);
      if (take <= 0) break;
    }
    return {
      text: emptyPageText(
        "[context_index read | e:" + storageId + " | field=" + fieldPath + "]",
        "the result frame does not fit this grant",
        grant,
        budget,
      ),
      details: {
        ...readBase,
        start: offset,
        end: offset,
        chars: 0,
        complete: false,
        incomplete: true,
        remainingChars: total - offset,
      },
    };
  };
  return { ok: true, prepared: { details: { action: "read" }, render } };
};

// ── argument validation and execution ─────────────────────────────────────

interface ValidatedReaderArgs {
  scope: ReaderScope;
  match: ReaderMatch;
  role?: string;
}

const validateReaderArgs = (
  args: ReaderArgs,
): { ok: true; value: ValidatedReaderArgs } | { ok: false; reason: string } => {
  const action = args.action;
  if (action !== "list" && action !== "search" && action !== "read") {
    return { ok: false, reason: "action must be list, search or read" };
  }
  const scope = args.scope ?? "branch";
  if (scope !== "branch" && scope !== "session") {
    return { ok: false, reason: "scope must be branch or session" };
  }
  const match = args.match ?? "terms";
  if (match !== "terms" && match !== "literal") {
    return { ok: false, reason: "match must be terms or literal" };
  }
  const role = args.role && args.role.length > 0 ? args.role : undefined;
  const hasCursor = args.cursor !== undefined;
  if (hasCursor) {
    const extras: Array<unknown> = [
      args.ref,
      args.field,
      args.role,
      args.query,
      args.match,
      args.scope,
      args.offset,
      args.length,
      args.full,
    ];
    if (extras.some((value) => value !== undefined)) {
      return {
        ok: false,
        reason:
          "a cursor restores its own action parameters; pass only action and cursor",
      };
    }
  }

  if (action === "list") {
    if (
      args.query !== undefined ||
      args.match !== undefined ||
      args.offset !== undefined ||
      args.length !== undefined ||
      args.full !== undefined
    ) {
      return {
        ok: false,
        reason:
          "list accepts ref, role, scope and cursor; query/match/offset/length/full belong to other actions",
      };
    }
  } else if (action === "search") {
    if (
      args.ref !== undefined ||
      args.field !== undefined ||
      args.offset !== undefined ||
      args.length !== undefined ||
      args.full !== undefined
    ) {
      return {
        ok: false,
        reason:
          "search accepts query, match, role, scope and cursor; ref/field/offset/length/full belong to read",
      };
    }
    if (!hasCursor && (typeof args.query !== "string" || args.query.trim().length === 0)) {
      return { ok: false, reason: "search requires a non-empty query" };
    }
  } else {
    if (
      args.query !== undefined ||
      args.match !== undefined ||
      args.role !== undefined ||
      args.scope !== undefined
    ) {
      return {
        ok: false,
        reason: "read accepts ref, field, offset, length, full and cursor",
      };
    }
    if (!hasCursor) {
      if (!args.ref) return { ok: false, reason: "read requires ref" };
      if (args.full === true && (args.offset !== undefined || args.length !== undefined)) {
        return {
          ok: false,
          reason: "full cannot be combined with offset or length",
        };
      }
      if (
        args.offset !== undefined &&
        (!Number.isInteger(args.offset) || args.offset < 0)
      ) {
        return { ok: false, reason: "offset must be a non-negative integer" };
      }
      if (
        args.length !== undefined &&
        (!Number.isInteger(args.length) || args.length <= 0)
      ) {
        return { ok: false, reason: "length must be a positive integer" };
      }
    }
  }
  return {
    ok: true,
    value: { scope, match, ...(role ? { role } : {}) },
  };
};

const readerHeadroom = (ctx: ReaderContext, budget: ReaderRunBudget): number => {
  const usage = ctx.getContextUsage?.();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  let usedTokens = usage?.tokens ?? null;
  if (usedTokens === null || usedTokens === undefined) {
    try {
      const projection = ctx.sessionManager.buildSessionProjection?.();
      let chars = 0;
      for (const message of projection?.messages ?? []) {
        chars += estimateMessageChars(message);
      }
      usedTokens = Math.ceil(chars / 3);
    } catch {
      usedTokens = 0;
    }
  }
  return contextHeadroomChars({
    contextWindow,
    usedTokens,
    maxOutputTokens: ctx.model?.maxTokens ?? 0,
    inFlightChars: budget.inFlightChars,
  });
};

const wrappedError = (
  action: ReaderAction,
  message: string,
  extra: Partial<ReaderDetails> = {},
): ReaderToolResult => ({
  content: [
    {
      type: "text",
      text: wrapReaderText("[context_index error] " + message),
    },
  ],
  details: { action, error: message, ...extra },
  isError: true,
});

const budgetDiagnostic = (
  action: ReaderAction,
  budget: ReaderRunBudget,
): ReaderToolResult => ({
  content: [
    {
      type: "text",
      text: wrapReaderText(
        "[context_index budget_exhausted] No reader budget remains for this run (" +
          budget.remainingChars +
          " chars, " +
          budget.remainingCalls +
          " calls). Continue in the next run or finish without reading.",
      ),
    },
  ],
  details: {
    action,
    budgetExhausted: true,
    runRemainingChars: budget.remainingChars,
    resume: "next-run",
    incomplete: true,
  },
});

/**
 * Execute one reader action. Argument and cursor conflicts are errors; normal
 * paging, capacity cuts and the full-read cap are isError:false partial
 * results. The budget is reserved before rendering the granted frame and
 * settled with the exact UTF-16 length returned.
 */
export const executeReader = async (
  args: ReaderArgs,
  ctx: ReaderContext,
  budget: ReaderRunBudget,
  signal?: AbortSignal,
): Promise<ReaderToolResult> => {
  const validation = validateReaderArgs(args);
  if (!validation.ok) {
    return wrappedError(args.action, validation.reason);
  }
  const action = args.action;
  try {
    let state: CursorState | undefined;
    if (args.cursor) {
      const decoded = decodeReaderCursor(args.cursor);
      if (!decoded.ok) {
        return wrappedError(
          action,
          "Invalid cursor (" + decoded.reason + "). Re-run the action without a cursor.",
        );
      }
      state = decoded.state;
      if (state.action !== action) {
        return wrappedError(
          action,
          "This cursor belongs to a " +
            state.action +
            " action. Re-run with action " +
            state.action +
            ".",
        );
      }
      if (state.sessionId !== ctx.sessionManager.getSessionId()) {
        return wrappedError(
          action,
          "This cursor belongs to another session. Re-run the action.",
        );
      }
    }

    const snapshotResult = state
      ? snapshotForCursor(ctx, state)
      : { ok: true as const, snapshot: snapshotForNewAction(ctx) };
    if (!snapshotResult.ok) {
      return wrappedError(
        action,
        snapshotResult.reason + ". Re-run the action without a cursor.",
      );
    }
    const snapshot = snapshotResult.snapshot;
    const scope = state?.scope ?? validation.value.scope;
    const role = state?.role ?? validation.value.role;
    const match = state?.match ?? validation.value.match;
    const query = state?.query ?? args.query ?? "";

    let prepared: PrepareResult;
    if (action === "list") {
      prepared = prepareList(
        {
          snapshot,
          scope,
          ...(role ? { role } : {}),
          ...(state?.ref ?? args.ref ? { ref: state?.ref ?? args.ref } : {}),
          ...(state ? { state } : {}),
        },
        budget,
      );
    } else if (action === "search") {
      prepared =
        match === "literal"
          ? prepareLiteralSearch(
              { snapshot, scope, ...(role ? { role } : {}), query, ...(state ? { state } : {}) },
              budget,
              signal,
            )
          : prepareTermsSearch(
              { snapshot, scope, ...(role ? { role } : {}), query, ...(state ? { state } : {}) },
              budget,
            );
    } else {
      prepared = prepareRead({ snapshot, args, ...(state ? { state } : {}) }, budget);
    }
    if (!prepared.ok) {
      return wrappedError(action, prepared.reason);
    }

    const full =
      action === "read" &&
      (args.full === true || state?.read?.full === true);
    const cap =
      action === "read"
        ? full
          ? FULL_READ_OUTPUT_CAP
          : READ_OUTPUT_CAP
        : LIST_SEARCH_OUTPUT_CAP;
    const reservation: Reservation | null = budget.reserve(
      cap,
      readerHeadroom(ctx, budget),
    );
    if (!reservation) return budgetDiagnostic(action, budget);

    try {
      signal?.throwIfAborted();
      const rendered = prepared.prepared.render(reservation.chars);
      if (rendered.text.length > reservation.chars) {
        budget.release(reservation);
        return wrappedError(
          action,
          "Result exceeded its granted frame (" +
            rendered.text.length +
            " > " +
            reservation.chars +
            " chars)",
        );
      }
      budget.settle(reservation, rendered.text.length);
      const incomplete = rendered.details.incomplete === true;
      return {
        content: [{ type: "text", text: rendered.text }],
        details: {
          ...rendered.details,
          runRemainingChars: budget.remainingChars,
          resume: incomplete
            ? budget.remainingChars > 0
              ? "now"
              : "next-run"
            : "now",
        },
      };
    } catch (error) {
      budget.release(reservation);
      if (signal?.aborted) {
        return wrappedError(action, "reader call cancelled");
      }
      throw error;
    }
  } catch (error) {
    if (signal?.aborted) {
      return wrappedError(action, "reader call cancelled");
    }
    throw error;
  }
};

