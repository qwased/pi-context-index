/**
 * Synthetic session entries for unit tests.
 *
 * Only fields the plugin reads are shaped exactly; everything is cast to
 * SessionEntry at the boundary. No real session text, file name or path.
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type ContentParts = readonly Record<string, unknown>[];

const iso = (timestamp: number): string => new Date(timestamp).toISOString();

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export const userEntry = (
  id: string,
  parentId: string | null,
  text: string,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(timestamp),
    message: { role: "user", content: text, timestamp },
  }) as unknown as SessionEntry;

export const userPartsEntry = (
  id: string,
  parentId: string | null,
  parts: ContentParts,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(timestamp),
    message: { role: "user", content: parts, timestamp },
  }) as unknown as SessionEntry;

export const assistantEntry = (
  id: string,
  parentId: string | null,
  content: string | ContentParts,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(timestamp),
    message: {
      role: "assistant",
      content:
        typeof content === "string" ? [{ type: "text", text: content }] : content,
      api: "faux",
      provider: "faux",
      model: "faux-1",
      usage,
      stopReason: "stop",
      timestamp,
    },
  }) as unknown as SessionEntry;

export const systemEntry = (
  id: string,
  parentId: string | null,
  text: string,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(timestamp),
    message: { role: "system", content: text, timestamp },
  }) as unknown as SessionEntry;

export interface ToolResultInput {
  toolCallId?: string;
  toolName?: string;
  text?: string;
  isError?: boolean;
  nestedCalls?: Record<string, unknown>;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export const toolResultEntry = (
  id: string,
  parentId: string | null,
  input: ToolResultInput = {},
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(input.timestamp ?? 0),
    message: {
      role: "toolResult",
      toolCallId: input.toolCallId ?? "call-1",
      toolName: input.toolName ?? "bash",
      content: [{ type: "text", text: input.text ?? "ok" }],
      isError: input.isError ?? false,
      timestamp: input.timestamp ?? 0,
      ...(input.nestedCalls ? { nestedCalls: input.nestedCalls } : {}),
      ...(input.details ? { details: input.details } : {}),
    },
  }) as unknown as SessionEntry;

export const bashExecutionEntry = (
  id: string,
  parentId: string | null,
  command: string,
  output: string,
  options: { exitCode?: number; excludeFromContext?: boolean; timestamp?: number } = {},
): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: iso(options.timestamp ?? 0),
    message: {
      role: "bashExecution",
      command,
      output,
      exitCode: options.exitCode,
      cancelled: false,
      truncated: false,
      timestamp: options.timestamp ?? 0,
      ...(options.excludeFromContext ? { excludeFromContext: true } : {}),
    },
  }) as unknown as SessionEntry;

export const customMessageEntry = (
  id: string,
  parentId: string | null,
  content: string | ContentParts,
  options: { customType?: string; timestamp?: number } = {},
): SessionEntry =>
  ({
    type: "custom_message",
    id,
    parentId,
    timestamp: iso(options.timestamp ?? 0),
    customType: options.customType ?? "test.note",
    content,
    display: false,
  }) as unknown as SessionEntry;

export const contextEditEntry = (
  id: string,
  parentId: string | null,
  targetId: string,
  replacement: string | ContentParts | null,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "context_edit",
    id,
    parentId,
    timestamp: iso(timestamp),
    targetId,
    replacement: replacement === null ? null : { content: replacement },
  }) as unknown as SessionEntry;

export const compactionEntry = (
  id: string,
  parentId: string | null,
  firstKeptEntryId: string,
  summary: string,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "compaction",
    id,
    parentId,
    timestamp: iso(timestamp),
    summary,
    firstKeptEntryId,
    tokensBefore: 1_000,
    fromHook: true,
  }) as unknown as SessionEntry;

export const branchSummaryEntry = (
  id: string,
  parentId: string | null,
  fromId: string,
  summary: string,
  timestamp = 0,
): SessionEntry =>
  ({
    type: "branch_summary",
    id,
    parentId,
    timestamp: iso(timestamp),
    fromId,
    summary,
    fromHook: true,
  }) as unknown as SessionEntry;

export const customEntry = (
  id: string,
  parentId: string | null,
  data?: unknown,
): SessionEntry =>
  ({
    type: "custom",
    id,
    parentId,
    timestamp: iso(0),
    customType: "test.custom",
    data,
  }) as unknown as SessionEntry;

export interface FakeManager {
  getEntries(): SessionEntry[];
  getBranch(fromId?: string): SessionEntry[];
  getSessionId(): string;
  getLeafId(): string | null;
  getSessionFile(): string | undefined;
}

/** Walk the parent chain like SessionManager.getBranch(). */
export const branchFor = (
  entries: readonly SessionEntry[],
  leafId: string | null,
): SessionEntry[] => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const path: SessionEntry[] = [];
  let current = leafId ? byId.get(leafId) : undefined;
  while (current) {
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
};

export const fakeManager = (
  entries: readonly SessionEntry[],
  options: {
    leafId?: string | null;
    sessionId?: string;
    sessionFile?: string;
  } = {},
): FakeManager => {
  const leafId =
    options.leafId === undefined ? (entries.at(-1)?.id ?? null) : options.leafId;
  return {
    getEntries: () => [...entries],
    getBranch: (fromId?: string) =>
      branchFor(entries, fromId === undefined ? leafId : fromId),
    getSessionId: () => options.sessionId ?? "session-test",
    getLeafId: () => leafId,
    getSessionFile: () => options.sessionFile,
  };
};

/** Mutable linear builder: every append becomes a child of the previous entry. */
export interface ChainBuilder {
  entries: SessionEntry[];
  parentId: string | null;
  user(id: string, text: string, timestamp?: number): SessionEntry;
  userParts(id: string, parts: ContentParts, timestamp?: number): SessionEntry;
  assistant(id: string, content: string | ContentParts, timestamp?: number): SessionEntry;
  system(id: string, text: string, timestamp?: number): SessionEntry;
  toolResult(id: string, input?: ToolResultInput, timestamp?: number): SessionEntry;
  bash(
    id: string,
    command: string,
    output: string,
    options?: { exitCode?: number; excludeFromContext?: boolean; timestamp?: number },
  ): SessionEntry;
  customMessage(
    id: string,
    content: string | ContentParts,
    options?: { customType?: string; timestamp?: number },
  ): SessionEntry;
  edit(
    id: string,
    targetId: string,
    replacement: string | ContentParts | null,
    timestamp?: number,
  ): SessionEntry;
  compaction(id: string, firstKeptEntryId: string, summary: string, timestamp?: number): SessionEntry;
  push(entry: SessionEntry): SessionEntry;
}

export const chain = (): ChainBuilder => {
  const entries: SessionEntry[] = [];
  const builder: ChainBuilder = {
    entries,
    parentId: null,
    push(entry: SessionEntry): SessionEntry {
      entries.push(entry);
      builder.parentId = entry.id;
      return entry;
    },
    user(id, text, timestamp) {
      return builder.push(userEntry(id, builder.parentId, text, timestamp));
    },
    userParts(id, parts, timestamp) {
      return builder.push(userPartsEntry(id, builder.parentId, parts, timestamp));
    },
    assistant(id, content, timestamp) {
      return builder.push(assistantEntry(id, builder.parentId, content, timestamp));
    },
    system(id, text, timestamp) {
      return builder.push(systemEntry(id, builder.parentId, text, timestamp));
    },
    toolResult(id, input, timestamp) {
      const merged: ToolResultInput = { ...(input ?? {}) };
      if (timestamp !== undefined) merged.timestamp = timestamp;
      return builder.push(toolResultEntry(id, builder.parentId, merged));
    },
    bash(id, command, output, options) {
      return builder.push(bashExecutionEntry(id, builder.parentId, command, output, options ?? {}));
    },
    customMessage(id, content, options) {
      return builder.push(customMessageEntry(id, builder.parentId, content, options ?? {}));
    },
    edit(id, targetId, replacement, timestamp) {
      return builder.push(contextEditEntry(id, builder.parentId, targetId, replacement, timestamp));
    },
    compaction(id, firstKeptEntryId, summary, timestamp) {
      return builder.push(compactionEntry(id, builder.parentId, firstKeptEntryId, summary, timestamp));
    },
  };
  return builder;
};

