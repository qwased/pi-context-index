/** P0 reader: native entry refs, stored-field resolution and exact text. */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TextField } from "./model";

export type ReadFailureReason =
  | "invalid_ref"
  | "not_found"
  | "primary_not_found"
  | "field_not_found"
  | "field_not_text";

export type StoredReadResult =
  | { ok: true; field: TextField }
  | { ok: false; reason: ReadFailureReason; detail: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const ENTRY_REF_PREFIX = "e:";

/** Parse `e:<entryId>`; an empty or differently prefixed ref is invalid. */
export const parseEntryRef = (ref: string): string | undefined => {
  if (!ref.startsWith(ENTRY_REF_PREFIX)) return undefined;
  const id = ref.slice(ENTRY_REF_PREFIX.length);
  return id.length > 0 ? id : undefined;
};

const parsePointer = (pointer: string): string[] | undefined => {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
};

const resolvePointer = (root: unknown, tokens: string[]): unknown => {
  let current: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) return undefined;
      const index = Number(token);
      if (index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, token)) return undefined;
    current = current[token];
  }
  return current;
};

const textFromContent = (
  content: unknown,
  basePath: string,
): { path: string; text: string } | undefined => {
  if (typeof content === "string") return { path: basePath, text: content };
  if (!Array.isArray(content)) return undefined;
  for (let index = 0; index < content.length; index++) {
    const block: unknown = content[index];
    if (
      isRecord(block) &&
      block.type === "text" &&
      typeof block.text === "string"
    ) {
      return { path: `${basePath}/${index}/text`, text: block.text };
    }
  }
  return undefined;
};

/** The stored text a record shows by default; edits and custom roles are P1. */
export const primaryTextField = (entry: SessionEntry): TextField | undefined => {
  let primary: { path: string; text: string } | undefined;

  switch (entry.type) {
    case "message":
      primary = textFromContent(
        (entry.message as { content?: unknown }).content,
        "/message/content",
      );
      break;
    case "custom_message":
      primary = textFromContent(entry.content, "/content");
      break;
    case "compaction":
      primary = { path: "/summary", text: entry.summary };
      break;
    case "branch_summary":
      primary = { path: "/summary", text: entry.summary };
      break;
    default:
      return undefined;
  }

  if (!primary) return undefined;
  return {
    ownerId: entry.id,
    storageId: entry.id,
    path: primary.path,
    kind: "text",
    text: primary.text,
  };
};

/** Read one stored field by native identity; `field` is a JSON Pointer. */
export const readStoredField = (
  entries: readonly SessionEntry[],
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

  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    return {
      ok: false,
      reason: "not_found",
      detail: `${ref} is not in this session file`,
    };
  }

  if (field === undefined) {
    const primary = primaryTextField(entry);
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
      detail: `field must be a JSON Pointer such as /message/content`,
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
  if (typeof value !== "string") {
    return {
      ok: false,
      reason: "field_not_text",
      detail: `${ref} field ${field} is not saved text`,
    };
  }
  return {
    ok: true,
    field: {
      ownerId: entry.id,
      storageId: entry.id,
      path: field,
      kind: "text",
      text: value,
    },
  };
};

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/** Largest grapheme-aligned prefix end not past `maxChars`, in UTF-16 offsets. */
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
