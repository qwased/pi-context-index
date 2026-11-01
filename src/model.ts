/**
 * Frozen data contract from docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md §6.4.
 * These types describe what the capsule and reader exchange. They do not
 * describe how the host stores records; that belongs in host.ts / source.ts.
 */

export type EntryRef = string;

/** JSON Pointer, for example /message/content/0/text. */
export type FieldPath = string;

/** UTF-16 half-open source range [start, end) within one stored field. */
export interface Span {
  ownerId: EntryRef;
  storageId: EntryRef;
  field: FieldPath;
  start: number;
  end: number;
}

export type ExclusionReason =
  | "off-branch"
  | "system"
  | "edited"
  | "checkpoint"
  | "self-echo";

export interface RecordInfo {
  id: EntryRef;
  order: number;
  role: string;
  onBranch: boolean;
  effective: boolean;
  live: boolean;
  excludedReason?: ExclusionReason;
  contentStorageId: EntryRef;
  primaryField?: FieldPath;
}

export type TextFieldKind = "text" | "argument" | "result" | "scalar";

export interface TextField {
  ownerId: EntryRef;
  storageId: EntryRef;
  path: FieldPath;
  kind: TextFieldKind;
  text: string;
}

export interface Chunk {
  span: Span;
  heading?: Span;
  ordinal: number;
  terms: Map<string, number>;
}

export type ObservationOperation = "read" | "write" | "edit" | "command";

export interface Observation {
  ownerId: EntryRef;
  callId: string;
  tool: string;
  operation?: ObservationOperation;
  path?: string;
  command?: string;
  /**
   * Entry that carries the result. For a nested call this is the parent result
   * entry; the pairing key is (resultId, nestedIndex).
   */
  resultId?: EntryRef;
  /** 0-based index in resultId's saved message.nestedCalls.calls, when nested. */
  nestedIndex?: number;
  /** UTF-8 size Pi recorded instead of the nested arguments, when dropped. */
  argumentsBytes?: number;
  isError?: boolean;
  sources: Span[];
  valueSpan?: Span;
}

export interface CapsuleRecipe {
  selectorVersion: number;
  fieldVersion: number;
  budgetChars: number;
  contextWindow: number;
  keep: number;
}

export interface CapsuleObservationRef {
  callId: string;
  resultId?: EntryRef;
  /** Present only for a nested call under the parent result entry. */
  nestedIndex?: number;
}

export interface CapsuleCounts {
  saved: number;
  effective: number;
  live: number;
  quoted: number;
  indexOnly: number;
  outside: number;
}

export interface CapsuleDetails {
  kind: "pi-context-index";
  schemaVersion: 1;
  sourceSessionId: string;
  sourceHeadId: string | null;
  sourceWatermarkId: string | null;
  firstKeptEntryId: string;
  snapshotId: string;
  recipe: CapsuleRecipe;
  shown: Span[];
  observations: CapsuleObservationRef[];
  counts: CapsuleCounts;
  usedChars: number;
}

export const DETAILS_KIND = "pi-context-index" as const;
export const SCHEMA_VERSION = 1 as const;
export const SELECTOR_VERSION = 1;
export const FIELD_VERSION = 1;
