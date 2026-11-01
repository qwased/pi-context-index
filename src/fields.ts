/**
 * One field view for excerpts, search hits and reads.
 *
 * Every text the session stores is addressed by a JSON Pointer on the saved
 * entry, for example /message/content/0/text or
 * /message/nestedCalls/calls/0/arguments/cmd. A TextField reuses the saved
 * string instead of a formatted copy, so source offsets always point back to
 * the record on disk.
 *
 * ownerId is the record whose role, timestamp and counts we show. storageId is
 * the entry that actually stores the text; for an edited message that is the
 * context_edit entry and the path starts with /replacement/.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { TextField, TextFieldKind } from "./model";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Escape one JSON Pointer reference token (RFC 6901). */
export const escapePointerToken = (token: string): string =>
  token.replace(/~/g, "~0").replace(/\//g, "~1");

export const joinPointer = (base: string, token: string | number): string =>
  base + "/" + escapePointerToken(String(token));

/** Parse a JSON Pointer into reference tokens; undefined when malformed. */
export const parsePointer = (pointer: string): string[] | undefined => {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
};

export const formatPointer = (tokens: readonly string[]): string =>
  tokens.length === 0
    ? ""
    : "/" + tokens.map(escapePointerToken).join("/");

/** Resolve a JSON Pointer. Returns undefined for missing paths; null is a value. */
export const resolvePointer = (
  root: unknown,
  tokens: readonly string[],
): unknown => {
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

const isEmptyJsonValue = (value: unknown): boolean =>
  value === undefined || (Array.isArray(value) && value.length === 0);

type RawField = { path: string; kind: TextFieldKind; text: string };

/**
 * Flatten one saved JSON value into fields. Strings keep their own kind;
 * numbers, booleans and null become canonical scalar strings so the original
 * value can still be addressed and read back.
 */
const pushJsonFields = (
  out: RawField[],
  path: string,
  value: unknown,
  stringKind: TextFieldKind,
): void => {
  if (typeof value === "string") {
    out.push({ path, kind: stringKind, text: value });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    out.push({ path, kind: "scalar", text: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      pushJsonFields(out, joinPointer(path, index), item, stringKind);
    });
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      pushJsonFields(out, joinPointer(path, key), nested, stringKind);
    }
  }
};

/**
 * The stored content path prefix an edit can replace. Only entries that Pi
 * lets a context_edit target have one (see ContextEditableContent).
 */
export const editableContentBase = (entry: SessionEntry): string | undefined => {
  switch (entry.type) {
    case "message": {
      const role = entry.message.role;
      if (role === "user" || role === "assistant" || role === "toolResult") {
        return "/message/content";
      }
      return undefined;
    }
    case "custom_message":
      return "/content";
    default:
      return undefined;
  }
};

const pushContentFields = (
  out: RawField[],
  base: string,
  content: unknown,
  textKind: TextFieldKind,
): void => {
  if (typeof content === "string") {
    out.push({ path: base, kind: textKind, text: content });
    return;
  }
  if (!Array.isArray(content)) return;
  for (let index = 0; index < content.length; index++) {
    const part: unknown = content[index];
    if (!isRecord(part)) continue;
    const type = part["type"];
    const path = joinPointer(base, index);
    if (type === "text" && typeof part["text"] === "string") {
      out.push({ path: joinPointer(path, "text"), kind: textKind, text: part["text"] });
      continue;
    }
    if (type === "toolCall") {
      const args = part["arguments"];
      if (!isEmptyJsonValue(args)) {
        pushJsonFields(out, joinPointer(path, "arguments"), args, "argument");
      }
      continue;
    }
    // thinking, image and every other typed part are excluded by type.
  }
};

const pushNestedCallFields = (
  out: RawField[],
  base: string,
  message: unknown,
): void => {
  if (!isRecord(message)) return;
  const nested = message["nestedCalls"];
  if (!isRecord(nested)) return;
  const calls = nested["calls"];
  if (!Array.isArray(calls)) return;
  for (let index = 0; index < calls.length; index++) {
    const call: unknown = calls[index];
    if (!isRecord(call)) continue;
    const callBase = joinPointer(joinPointer(base, "calls"), index);
    if (!isEmptyJsonValue(call["arguments"])) {
      pushJsonFields(out, joinPointer(callBase, "arguments"), call["arguments"], "argument");
    } else if (typeof call["argumentsBytes"] === "number") {
      out.push({
        path: joinPointer(callBase, "argumentsBytes"),
        kind: "scalar",
        text: String(call["argumentsBytes"]),
      });
    }
    if (typeof call["error"] === "string" && call["error"].length > 0) {
      out.push({ path: joinPointer(callBase, "error"), kind: "result", text: call["error"] });
    }
    if (typeof call["status"] === "string" && call["status"].length > 0) {
      out.push({ path: joinPointer(callBase, "status"), kind: "scalar", text: call["status"] });
    }
  }
};

/**
 * Every saved text or scalar of one entry, in storage order. The iterator
 * returns TextFields; callers that need a materialized list use fieldList().
 */
export function* enumerateFields(entry: SessionEntry): Generator<TextField> {
  const out: RawField[] = [];
  const ownerId = entry.id;

  switch (entry.type) {
    case "message": {
      const message = entry.message;
      if (message.role === "bashExecution") {
        out.push({ path: "/message/command", kind: "argument", text: message.command });
        out.push({ path: "/message/output", kind: "result", text: message.output });
        if (message.exitCode !== undefined) {
          out.push({
            path: "/message/exitCode",
            kind: "scalar",
            text: String(message.exitCode),
          });
        }
        break;
      }
      if (message.role === "toolResult") {
        pushContentFields(out, "/message/content", message.content, "result");
        pushNestedCallFields(out, "/message/nestedCalls", message);
        break;
      }
      if (
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "custom" ||
        message.role === "system"
      ) {
        pushContentFields(out, "/message/content", message.content, "text");
      }
      break;
    }
    case "custom_message":
      pushContentFields(out, "/content", entry.content, "text");
      break;
    case "compaction":
    case "branch_summary":
      out.push({ path: "/summary", kind: "text", text: entry.summary });
      break;
    case "context_edit":
      if (entry.replacement !== null) {
        pushContentFields(out, "/replacement/content", entry.replacement.content, "text");
      }
      break;
    default:
      break;
  }

  for (const field of out) {
    yield {
      ownerId,
      storageId: ownerId,
      path: field.path,
      kind: field.kind,
      text: field.text,
    };
  }
}

/** Materialized field list for callers that need to index or count. */
export const fieldList = (entry: SessionEntry): TextField[] => [
  ...enumerateFields(entry),
];

/** The field read ref shows when the caller does not pass a field. */
export const primaryFieldPath = (entry: SessionEntry): string | undefined => {
  switch (entry.type) {
    case "message": {
      const message = entry.message;
      if (message.role === "bashExecution") return "/message/output";
      if (
        message.role !== "user" &&
        message.role !== "assistant" &&
        message.role !== "toolResult" &&
        message.role !== "custom" &&
        message.role !== "system"
      ) {
        return undefined;
      }
      const content = message.content;
      if (typeof content === "string") return "/message/content";
      if (!Array.isArray(content)) return undefined;
      for (let index = 0; index < content.length; index++) {
        const part: unknown = content[index];
        if (
          isRecord(part) &&
          part["type"] === "text" &&
          typeof part["text"] === "string"
        ) {
          return joinPointer(joinPointer("/message/content", index), "text");
        }
      }
      return undefined;
    }
    case "custom_message": {
      const content = entry.content;
      if (typeof content === "string") return "/content";
      if (!Array.isArray(content)) return undefined;
      for (let index = 0; index < content.length; index++) {
        const part: unknown = content[index];
        if (
          isRecord(part) &&
          part["type"] === "text" &&
          typeof part["text"] === "string"
        ) {
          return joinPointer(joinPointer("/content", index), "text");
        }
      }
      return undefined;
    }
    case "compaction":
    case "branch_summary":
      return "/summary";
    case "context_edit": {
      if (entry.replacement === null) return undefined;
      const content = entry.replacement.content;
      if (typeof content === "string") return "/replacement/content";
      if (!Array.isArray(content)) return undefined;
      for (let index = 0; index < content.length; index++) {
        const part: unknown = content[index];
        if (
          isRecord(part) &&
          part["type"] === "text" &&
          typeof part["text"] === "string"
        ) {
          return joinPointer(joinPointer("/replacement/content", index), "text");
        }
      }
      return undefined;
    }
    default:
      return undefined;
  }
};

const kindForPath = (path: string, fallback: TextFieldKind): TextFieldKind => {
  if (path.includes("/arguments")) return "argument";
  if (path.endsWith("/error") || path.startsWith("/message/output")) return "result";
  return fallback;
};

/** The default field as a TextField, or undefined when the entry has no text. */
export const primaryFieldOf = (entry: SessionEntry): TextField | undefined => {
  const path = primaryFieldPath(entry);
  if (!path) return undefined;
  const tokens = parsePointer(path);
  if (!tokens) return undefined;
  const value = resolvePointer(entry, tokens);
  if (typeof value !== "string") return undefined;
  return {
    ownerId: entry.id,
    storageId: entry.id,
    path,
    kind: kindForPath(path, "text"),
    text: value,
  };
};

/** True when a pointer addresses stored text or a canonical scalar. */
export const isTextFieldValue = (value: unknown): boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  value === null;
