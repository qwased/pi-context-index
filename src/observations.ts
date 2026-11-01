/**
 * Tool observations from the effective history.
 *
 * A direct tool call and a codemode nested call produce the same Observation.
 * write/edit are recorded as requests, never as proof that a file changed.
 * A nested call has no result entry of its own: resultId is the parent result
 * entry and nestedIndex is its 0-based position, so (resultId, nestedIndex) is
 * the pairing key.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
  Observation,
  ObservationOperation,
  Span,
  TextField,
} from "./model";
import {
  effectiveFields,
  primaryEffectiveField,
  type EffectiveHistory,
  type EffectiveRecord,
} from "./source";
import { joinPointer } from "./fields";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const COMMAND_TOOLS = new Set([
  "bash",
  "shell",
  "exec",
  "execute",
  "run",
  "terminal",
  "codemode",
]);
const READ_TOOLS = new Set(["read", "grep", "glob", "find", "ls", "list"]);
const WRITE_TOOLS = new Set(["write", "create"]);
const EDIT_TOOLS = new Set(["edit", "replace", "patch", "apply_patch"]);

const PATH_ARG_KEYS = ["path", "file_path", "filePath", "filepath", "target_file"];
const COMMAND_ARG_KEYS = ["command", "cmd"];

/** Operation class for an observed tool name, if it is a known operation. */
export const operationForTool = (
  toolName: string,
): ObservationOperation | undefined => {
  const name = toolName.toLowerCase();
  if (READ_TOOLS.has(name)) return "read";
  if (WRITE_TOOLS.has(name)) return "write";
  if (EDIT_TOOLS.has(name)) return "edit";
  if (COMMAND_TOOLS.has(name)) return "command";
  return undefined;
};

const readStringArg = (
  args: Record<string, unknown>,
  keys: readonly string[],
): { key: string; value: string } | undefined => {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) return { key, value };
  }
  return undefined;
};

const spanOfField = (field: TextField): Span => ({
  ownerId: field.ownerId,
  storageId: field.storageId,
  field: field.path,
  start: 0,
  end: field.text.length,
});

const findField = (
  fields: readonly TextField[],
  path: string,
): TextField | undefined => fields.find((field) => field.path === path);

const directArgumentField = (
  fields: readonly TextField[],
  blockIndex: number,
  key: string,
): TextField | undefined => {
  const suffix = "/arguments/" + escapeKey(key);
  for (const prefix of [`/message/content/${blockIndex}`, `/replacement/content/${blockIndex}`]) {
    const found = findField(fields, prefix + suffix);
    if (found) return found;
  }
  return undefined;
};

const nestedArgumentField = (
  fields: readonly TextField[],
  nestedIndex: number,
  key: string,
): TextField | undefined =>
  findField(
    fields,
    joinPointer(joinPointer(joinPointer("/message/nestedCalls/calls", nestedIndex), "arguments"), key),
  );

const escapeKey = (key: string): string =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");

const blocksOf = (record: EffectiveRecord): readonly unknown[] => {
  const message = record.messages[0];
  if (!isRecord(message)) return [];
  const content = message["content"];
  return Array.isArray(content) ? content : [];
};

const nestedCallsOf = (entry: SessionEntry): readonly unknown[] => {
  if (entry.type !== "message" || entry.message.role !== "toolResult") return [];
  const nested = (entry.message as { nestedCalls?: unknown }).nestedCalls;
  if (!isRecord(nested)) return [];
  const calls = nested["calls"];
  return Array.isArray(calls) ? calls : [];
};

export interface ReviewedObservation {
  observation: Observation;
  /** User turn index in the effective branch; -1 before the first user turn. */
  turn: number;
  /** File order of the result (or the owner when there is no result). */
  sortOrder: number;
  owner?: EffectiveRecord;
  result?: EffectiveRecord;
}

export interface ObservationSet {
  entries: ReviewedObservation[];
  recordByResultId: ReadonlyMap<string, EffectiveRecord>;
  turnOfRecordId: ReadonlyMap<string, number>;
}

const isErrorResult = (record: EffectiveRecord | undefined): boolean => {
  if (!record || record.entry.type !== "message") return false;
  const message = record.entry.message;
  if (message.role === "toolResult") return message.isError;
  if (message.role === "bashExecution") {
    return message.exitCode !== undefined && message.exitCode !== 0;
  }
  return false;
};

/**
 * Extract observations from the effective history. Live records are included;
 * the candidate selector decides which turns may be quoted.
 */
export const extractObservations = (
  history: EffectiveHistory,
): ObservationSet => {
  const recordById = new Map<string, EffectiveRecord>();
  const turnOfRecordId = new Map<string, number>();
  let turn = -1;
  for (const record of history.records) {
    recordById.set(record.info.id, record);
    if (record.info.role === "user") turn++;
    turnOfRecordId.set(record.info.id, turn);
  }

  const resultByCallId = new Map<string, EffectiveRecord>();
  for (const record of history.records) {
    if (record.info.role !== "toolResult") continue;
    if (record.entry.type !== "message" || record.entry.message.role !== "toolResult") {
      continue;
    }
    resultByCallId.set(record.entry.message.toolCallId, record);
  }

  const recordByResultId = new Map<string, EffectiveRecord>();
  for (const record of history.records) {
    recordByResultId.set(record.info.id, record);
  }

  const entries: ReviewedObservation[] = [];
  const pairedResultIds = new Set<string>();

  const push = (input: {
    observation: Observation;
    owner?: EffectiveRecord;
    result?: EffectiveRecord;
  }): void => {
    const sortRecord = input.result ?? input.owner;
    const turnId = sortRecord?.info.id;
    entries.push({
      observation: input.observation,
      turn: turnId === undefined ? -1 : (turnOfRecordId.get(turnId) ?? -1),
      sortOrder: sortRecord?.info.order ?? -1,
      ...(input.owner ? { owner: input.owner } : {}),
      ...(input.result ? { result: input.result } : {}),
    });
  };

  for (const record of history.records) {
    if (record.info.role === "bashExecution") {
      const fields = effectiveFields(record);
      const command = findField(fields, "/message/command");
      const output = findField(fields, "/message/output");
      const exit = findField(fields, "/message/exitCode");
      const sources: Span[] = [];
      if (command) sources.push(spanOfField(command));
      if (output) sources.push(spanOfField(output));
      if (exit) sources.push(spanOfField(exit));
      push({
        observation: {
          ownerId: record.info.id,
          callId: record.info.id,
          tool: "bashExecution",
          operation: "command",
          ...(command ? { command: command.text } : {}),
          resultId: record.info.id,
          isError: exit !== undefined && exit.text !== "0",
          sources,
        },
        owner: record,
        result: record,
      });
      pairedResultIds.add(record.info.id);
      continue;
    }

    if (record.info.role === "assistant") {
      const fields = effectiveFields(record);
      const blocks = blocksOf(record);
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        if (!isRecord(block) || block["type"] !== "toolCall") continue;
        const callId = typeof block["id"] === "string" ? block["id"] : undefined;
        const tool = typeof block["name"] === "string" ? block["name"] : "unknown";
        if (!callId) continue;
        const args = isRecord(block["arguments"]) ? block["arguments"] : {};
        const pathArg = readStringArg(args, PATH_ARG_KEYS);
        const commandArg = readStringArg(args, COMMAND_ARG_KEYS);
        const result = resultByCallId.get(callId);
        if (result) pairedResultIds.add(result.info.id);
        const sources: Span[] = [];
        if (pathArg) {
          const field = directArgumentField(fields, index, pathArg.key);
          if (field) sources.push(spanOfField(field));
        }
        if (commandArg) {
          const field = directArgumentField(fields, index, commandArg.key);
          if (field) sources.push(spanOfField(field));
        }
        const operation = operationForTool(tool);
        push({
          observation: {
            ownerId: record.info.id,
            callId,
            tool,
            ...(operation ? { operation } : {}),
            ...(pathArg ? { path: pathArg.value } : {}),
            ...(commandArg ? { command: commandArg.value } : {}),
            ...(result ? { resultId: result.info.id } : {}),
            isError: isErrorResult(result),
            sources,
          },
          owner: record,
          ...(result ? { result } : {}),
        });
      }
      continue;
    }

    if (record.info.role !== "toolResult") continue;
    const fields = effectiveFields(record);
    const calls = nestedCallsOf(record.entry);
    for (let index = 0; index < calls.length; index++) {
      const call = calls[index];
      if (!isRecord(call)) continue;
      const tool = typeof call["name"] === "string" ? call["name"] : "unknown";
      const callId =
        typeof call["id"] === "string" ? call["id"] : `${record.info.id}#${index}`;
      const args = isRecord(call["arguments"]) ? call["arguments"] : {};
      const pathArg = readStringArg(args, PATH_ARG_KEYS);
      const commandArg = readStringArg(args, COMMAND_ARG_KEYS);
      const sources: Span[] = [];
      if (pathArg) {
        const field = nestedArgumentField(fields, index, pathArg.key);
        if (field) sources.push(spanOfField(field));
      }
      if (commandArg) {
        const field = nestedArgumentField(fields, index, commandArg.key);
        if (field) sources.push(spanOfField(field));
      }
      const errorField = findField(
        fields,
        joinPointer("/message/nestedCalls/calls", index) + "/error",
      );
      if (errorField) sources.push(spanOfField(errorField));
      const operation = operationForTool(tool);
      const argumentsBytes =
        typeof call["argumentsBytes"] === "number" ? call["argumentsBytes"] : undefined;
      push({
        observation: {
          ownerId: record.info.id,
          callId,
          tool,
          ...(operation ? { operation } : {}),
          ...(pathArg ? { path: pathArg.value } : {}),
          ...(commandArg ? { command: commandArg.value } : {}),
          resultId: record.info.id,
          nestedIndex: index,
          ...(argumentsBytes !== undefined ? { argumentsBytes } : {}),
          isError: call["status"] === "error",
          sources,
        },
        owner: record,
        result: record,
      });
    }
    if (pairedResultIds.has(record.info.id)) continue;
    // A result whose call is not in the effective window still counts as a
    // recorded observation; it has no argument address to quote.
    if (record.entry.type === "message" && record.entry.message.role === "toolResult") {
      const tool = record.entry.message.toolName;
      const operation = operationForTool(tool);
      push({
        observation: {
          ownerId: record.info.id,
          callId: record.entry.message.toolCallId,
          tool,
          ...(operation ? { operation } : {}),
          resultId: record.info.id,
          isError: record.entry.message.isError,
          sources: [],
        },
        owner: record,
        result: record,
      });
    }
  }

  return { entries, recordByResultId, turnOfRecordId };
};

/**
 * The stored field an observation's result should quote. A nested error has no
 * result body of its own: its saved error text is the evidence, while the
 * parent body may belong to a different command. Other nested/aggregate calls
 * quote the parent's primary result text.
 */
export const observationResultField = (
  reviewed: ReviewedObservation,
): { record: EffectiveRecord; field: TextField } | undefined => {
  if (!reviewed.result) return undefined;
  const observation = reviewed.observation;
  if (observation.nestedIndex !== undefined && observation.isError) {
    const errorPath = joinPointer(
      joinPointer("/message/nestedCalls/calls", observation.nestedIndex),
      "error",
    );
    const errorField = effectiveFields(reviewed.result).find(
      (field) => field.path === errorPath,
    );
    if (errorField) return { record: reviewed.result, field: errorField };
  }
  const field = primaryEffectiveField(reviewed.result);
  return field ? { record: reviewed.result, field } : undefined;
};
