import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
  type InlineExtension,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { registerContextIndex } from "../src/host";
import type { CapsuleDetails } from "../src/model";
import { readStoredField } from "../src/reader";
import { DEFAULT_SETTINGS } from "../src/settings";
import { capsuleCap } from "../src/budget";

const EXTENSION_ENTRY = fileURLToPath(new URL("../index.ts", import.meta.url));

const TARGET_USER_TEXT =
  "保留原始验收夹具 𪚥 😀 e\u0301\r\n第二行：压缩时不要调用模型。";
const HUGE_USER_TEXT = "验收😀".repeat(10_000);
const LIVE_TAIL_MARKER = "LIVE TAIL MARKER: the newest assistant work log";
const LONG_ASSISTANT_TEXT = "work log line. " + "x".repeat(2_400);

interface TestRoot {
  root: string;
  cwd: string;
  agentDir: string;
  sessionsDir: string;
}

interface ProviderHarness {
  faux: ReturnType<typeof fauxProvider>;
  runtime: ModelRuntime;
  model: ReturnType<ReturnType<typeof fauxProvider>["getModel"]>;
}

interface RecordedRequest {
  messages: readonly { role?: unknown; content?: unknown }[];
}

const roots: string[] = [];
const ORIGINAL_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  if (ORIGINAL_AGENT_DIR === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = ORIGINAL_AGENT_DIR;
  }
});

const createRoot = (): TestRoot => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-index-host-"));
  roots.push(root);
  const cwd = join(root, "work");
  const agentDir = join(root, "agent");
  const sessionsDir = join(root, "sessions");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  // The extension resolves pi-context-index.json through Pi's agent dir.
  process.env.PI_CODING_AGENT_DIR = agentDir;
  // Keep the host's own cut small so a compact fixture can summarize a prefix.
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ compaction: { keepRecentTokens: 2_000 } }),
    "utf8",
  );
  return { root, cwd, agentDir, sessionsDir };
};

const createProvider = async (
  agentDir: string,
  options: { contextWindow?: number; maxTokens?: number } = {},
): Promise<ProviderHarness> => {
  const faux = fauxProvider({
    tokenSize: { min: 100, max: 200 },
    models: [
      {
        id: "faux-1",
        contextWindow: options.contextWindow ?? 128_000,
        maxTokens: options.maxTokens ?? 16_384,
      },
    ],
  });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  runtime.registerNativeProvider(faux.provider);
  return { faux, runtime, model: faux.getModel() };
};

const createLoader = async (input: {
  cwd: string;
  agentDir: string;
  settingsManager: SettingsManager;
  extensionFactories?: InlineExtension[];
  additionalExtensionPaths?: string[];
}): Promise<DefaultResourceLoader> => {
  const loader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: input.agentDir,
    settingsManager: input.settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "P0 host test system prompt.",
    extensionFactories: input.extensionFactories ?? [],
    additionalExtensionPaths: input.additionalExtensionPaths ?? [],
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  return loader;
};

const createSession = async (input: {
  cwd: string;
  agentDir: string;
  manager: SessionManager;
  settingsManager: SettingsManager;
  loader: DefaultResourceLoader;
  provider: ProviderHarness;
}): Promise<AgentSession> => {
  const { session } = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    modelRuntime: input.provider.runtime,
    model: input.provider.model,
    sessionManager: input.manager,
    settingsManager: input.settingsManager,
    resourceLoader: input.loader,
    noTools: "builtin",
    thinkingLevel: "off",
  });
  await session.bindExtensions({});
  return session;
};

const appendHistory = (
  manager: SessionManager,
  firstUserText: string = TARGET_USER_TEXT,
): string[] => {
  const texts = [
    firstUserText,
    "Second instruction: quote stored text, never a model summary.",
    "Third instruction: keep the live tail after the cut.",
    "Fourth instruction: read a reference instead of guessing.",
    "Fifth instruction: finish with the newest work log.",
  ];
  const userIds: string[] = [];
  const base = Date.now() - texts.length * 10_000;
  for (let index = 0; index < texts.length; index++) {
    const timestamp = base + index * 10_000;
    userIds.push(
      manager.appendMessage({
        role: "user",
        content: texts[index]!,
        timestamp,
      }),
    );
    const assistantText =
      index === texts.length - 1
        ? `${LIVE_TAIL_MARKER}\n${LONG_ASSISTANT_TEXT}`
        : LONG_ASSISTANT_TEXT;
    manager.appendMessage(
      fauxAssistantMessage(assistantText, { timestamp: timestamp + 1 }),
    );
  }
  return userIds;
};

const messageText = (message: { content?: unknown }): string => {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block !== "object" || block === null) return "";
      const record = block as { type?: unknown; text?: unknown };
      return record.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
};

const requestText = (request: RecordedRequest): string =>
  request.messages.map(messageText).join("\n");

const findUserTarget = (entries: SessionEntry[]): SessionEntry | undefined =>
  entries.find(
    (entry) =>
      entry.type === "message" &&
      entry.message.role === "user" &&
      entry.message.content === TARGET_USER_TEXT,
  );

const findLatestToolResult = (entries: SessionEntry[]): SessionEntry | undefined =>
  entries
    .filter(
      (entry) =>
        entry.type === "message" && entry.message.role === "toolResult",
    )
    .at(-1);

describe("P0 real-host closure", () => {
  test("compacts through the hook, persists, restores summary + tail, and reads a generated ref", async () => {
    const testRoot = createRoot();
    const events: Array<{ fromExtension: boolean; reason: string }> = [];
    const observer: InlineExtension = {
      name: "p0-observer",
      factory: (pi: ExtensionAPI) => {
        pi.on("session_compact", (event) => {
          events.push({
            fromExtension: event.fromExtension,
            reason: event.reason,
          });
        });
      },
    };

    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      extensionFactories: [observer],
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(
      testRoot.cwd,
      testRoot.sessionsDir,
    );
    const loadedExtension = loader
      .getExtensions()
      .extensions.find((candidate) => candidate.tools.has("context_index"));
    expect(loadedExtension?.tools.get("context_index")?.definition.exposure).toBe(
      "direct",
    );
    expect(loadedExtension?.handlers.has("session_before_compact")).toBe(true);
    const guidelines =
      loadedExtension?.tools.get("context_index")?.definition.promptGuidelines;
    expect(guidelines).toHaveLength(1);
    expect(guidelines?.[0]?.length ?? 0).toBeLessThan(400);
    const userIds = appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    expect(session.getActiveToolNames()).toContain("context_index");

    const entryCountBefore = manager.getEntries().length;
    const result = await session.compact();

    // No summarization request: the extension supplied the whole compaction.
    expect(provider.faux.state.callCount).toBe(0);
    expect(events).toEqual([{ fromExtension: true, reason: "manual" }]);

    const entries = manager.getEntries();
    expect(entries.length).toBe(entryCountBefore + 1);
    const compaction = entries.at(-1);
    expect(compaction?.type).toBe("compaction");
    if (compaction?.type !== "compaction") {
      throw new Error("expected a persisted compaction entry");
    }
    expect(compaction.fromHook).toBe(true);
    expect(compaction.summary).toBe(result.summary);
    expect(compaction.firstKeptEntryId).toBe(result.firstKeptEntryId);
    const expectedCap = capsuleCap(DEFAULT_SETTINGS.viewMaxChars, 128_000);
    expect(result.summary.length).toBeLessThanOrEqual(expectedCap);

    const details = compaction.details as CapsuleDetails;
    expect(details.kind).toBe("pi-context-index");
    expect(details.schemaVersion).toBe(1);
    expect(details.snapshotId).toMatch(/^[0-9a-f]{12}$/);
    expect(result.summary).toContain(`snapshot=${details.snapshotId}`);
    expect(details.recipe.budgetChars).toBe(expectedCap);
    expect(details.usedChars).toBe(result.summary.length);
    expect(details.firstKeptEntryId).toBe(result.firstKeptEntryId);
    expect(details.shown.length).toBeGreaterThan(0);
    expect(details.counts.quoted).toBeGreaterThan(0);
    expect(JSON.stringify(details)).not.toContain("保留原始验收夹具");

    // The host rebuilt the model context as the compaction summary plus the
    // raw kept tail, not as a model-generated summary.
    const projection = manager.buildSessionProjection();
    const summaryIndex = projection.messages.findIndex(
      (message) => message.role === "compactionSummary",
    );
    expect(summaryIndex).toBeGreaterThanOrEqual(0);
    const summaryMessage = projection.messages[summaryIndex];
    if (summaryMessage?.role !== "compactionSummary") {
      throw new Error("expected a compaction summary message");
    }
    expect(summaryMessage.summary).toBe(result.summary);

    if (!compaction.parentId) {
      throw new Error("expected the pre-compaction branch head");
    }
    const branchBefore = manager.getBranch(compaction.parentId);
    const cutIndex = branchBefore.findIndex(
      (entry) => entry.id === result.firstKeptEntryId,
    );
    expect(cutIndex).toBeGreaterThanOrEqual(0);
    const expectedTail = branchBefore
      .slice(cutIndex)
      .flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
    expect(projection.messages.slice(summaryIndex + 1)).toEqual(expectedTail);

    // Reopen the persisted file: the checkpoint and its projection survive.
    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeDefined();
    if (!sessionFile) throw new Error("session file was not persisted");
    expect(sessionFile.startsWith(testRoot.sessionsDir)).toBe(true);
    const reopened = SessionManager.open(sessionFile);
    const savedCompaction = reopened
      .getEntries()
      .find((entry) => entry.type === "compaction");
    expect(savedCompaction?.type).toBe("compaction");
    if (savedCompaction?.type !== "compaction") {
      throw new Error("expected the compaction entry on disk");
    }
    expect(savedCompaction.summary).toBe(result.summary);
    expect(savedCompaction.fromHook).toBe(true);
    const savedProjection = reopened.buildSessionProjection();
    const savedSummaryIndex = savedProjection.messages.findIndex(
      (message) => message.role === "compactionSummary",
    );
    expect(savedSummaryIndex).toBeGreaterThanOrEqual(0);
    const savedSummary = savedProjection.messages[savedSummaryIndex];
    if (savedSummary?.role !== "compactionSummary") {
      throw new Error("expected a stored compaction summary");
    }
    expect(savedSummary.summary).toBe(result.summary);
    expect(savedProjection.messages.slice(savedSummaryIndex + 1)).toEqual(
      expectedTail,
    );

    // Derive the generated reference for the first user record from the
    // structured shown spans, then execute the reader through a real agent turn.
    expect(result.summary).toContain(TARGET_USER_TEXT);
    const targetEntry = findUserTarget(reopened.getEntries());
    expect(targetEntry?.id).toBe(userIds[0] ?? "");
    if (!targetEntry) throw new Error("target user record is missing");
    const targetSpan = details.shown.find(
      (span) => span.ownerId === targetEntry.id,
    );
    expect(targetSpan).toBeDefined();
    if (!targetSpan) throw new Error("generated capsule has no target ref");
    const targetQuote = {
      ref: `e:${targetSpan.storageId}`,
      field: targetSpan.field,
    };

    const secondProvider = await createProvider(testRoot.agentDir);
    const secondSettings = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const secondLoader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager: secondSettings,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const secondSession = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager: reopened,
      settingsManager: secondSettings,
      loader: secondLoader,
      provider: secondProvider,
    });

    const requests: RecordedRequest[] = [];
    secondProvider.faux.setResponses([
      (context) => {
        requests.push({ messages: [...context.messages] });
        return fauxAssistantMessage(
          fauxToolCall("context_index", {
            action: "read",
            ref: targetQuote.ref,
            field: targetQuote.field,
          }),
          { stopReason: "toolUse" },
        );
      },
      (context) => {
        requests.push({ messages: [...context.messages] });
        return fauxAssistantMessage("read complete");
      },
    ]);

    await secondSession.prompt(
      "Continue from the capsule and read the earliest user instruction.",
    );

    // Exactly two ordinary agent requests: tool call and final answer. No
    // summarization request was issued at any point.
    expect(secondProvider.faux.state.callCount).toBe(2);
    expect(requests).toHaveLength(2);
    expect(requestText(requests[0]!)).toContain(TARGET_USER_TEXT);
    expect(requestText(requests[0]!)).toContain(LIVE_TAIL_MARKER);
    expect(requestText(requests[0]!)).toContain(
      "Continue from the capsule and read the earliest user instruction.",
    );
    expect(requestText(requests[1]!)).toContain(TARGET_USER_TEXT);

    const toolResult = findLatestToolResult(reopened.getEntries());
    expect(toolResult?.type).toBe("message");
    if (toolResult?.type !== "message" || toolResult.message.role !== "toolResult") {
      throw new Error("context_index did not produce a tool result");
    }
    expect(toolResult.message.toolName).toBe("context_index");
    expect(toolResult.message.isError).toBe(false);
    const resultText = messageText(toolResult.message);
    expect(resultText).toContain(TARGET_USER_TEXT);
    expect(resultText).toContain("field=/message/content");
    expect(toolResult.message.details).toMatchObject({
      action: "read",
      storageId: targetEntry.id,
      field: "/message/content",
      complete: true,
    });
    expect(JSON.stringify(toolResult.message.details)).not.toContain(
      "保留原始验收夹具",
    );
  });

  test("bounds a long user quote at a grapheme boundary and still reads the whole field", async () => {
    const testRoot = createRoot();
    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(
      testRoot.cwd,
      testRoot.sessionsDir,
    );
    const userIds = appendHistory(manager, HUGE_USER_TEXT);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const result = await session.compact();
    expect(provider.faux.state.callCount).toBe(0);
    const cap = capsuleCap(DEFAULT_SETTINGS.viewMaxChars, 128_000);
    expect(result.summary.length).toBeLessThanOrEqual(cap);

    const compaction = manager.getEntries().at(-1);
    if (compaction?.type !== "compaction") {
      throw new Error("expected a persisted compaction entry");
    }
    const details = compaction.details as CapsuleDetails;
    const targetId = userIds[0];
    if (!targetId) throw new Error("missing first user record");
    const spans = details.shown.filter((candidate) => candidate.ownerId === targetId);
    expect(spans.length).toBeGreaterThan(0);
    if (spans.length === 0) throw new Error("the long user record was not quoted");

    const shownChars = spans.reduce(
      (sum, span) => sum + (span.end - span.start),
      0,
    );
    expect(shownChars).toBeGreaterThan(0);
    expect(shownChars).toBeLessThan(HUGE_USER_TEXT.length);
    expect(result.summary).toContain(
      `U e:${targetId} | partial ${shownChars}/${HUGE_USER_TEXT.length} | field=/message/content`,
    );
    expect(result.summary).toContain(
      HUGE_USER_TEXT.slice(spans[0]!.start, spans[0]!.end),
    );
    expect(result.summary).toContain("[省略 ");
    // Every shown boundary is a grapheme boundary, never a split surrogate.
    for (const span of spans) {
      const lastUnit = HUGE_USER_TEXT.charCodeAt(span.end - 1);
      expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(false);
      if (span.start > 0) {
        const firstUnit = HUGE_USER_TEXT.charCodeAt(span.start);
        expect(firstUnit >= 0xdc00 && firstUnit <= 0xdfff).toBe(false);
      }
    }

    const stored = readStoredField(
      manager.getEntries(),
      `e:${targetId}`,
      spans[0]!.field,
    );
    expect(stored.ok).toBe(true);
    if (stored.ok) {
      expect(stored.field.text).toBe(HUGE_USER_TEXT);
    }

    const primary = readStoredField(manager.getEntries(), `e:${targetId}`);
    expect(primary.ok).toBe(true);
    if (primary.ok) {
      expect(primary.field.path).toBe("/message/content");
      expect(primary.field.text).toBe(HUGE_USER_TEXT);
    }

    const missing = readStoredField(manager.getEntries(), "e:not-in-this-file");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("not_found");
  });

  test("a failing capsule build cancels compaction instead of using the default model summary", async () => {
    const testRoot = createRoot();
    const failingExtension: InlineExtension = {
      name: "p0-forced-failure",
      factory: (pi: ExtensionAPI) => {
        registerContextIndex(pi, {
          buildCapsule: () => {
            throw new Error("intentional capsule failure");
          },
        });
      },
    };

    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      extensionFactories: [failingExtension],
    });
    const manager = SessionManager.create(
      testRoot.cwd,
      testRoot.sessionsDir,
    );
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const entriesBefore = manager.getEntries().map((entry) => entry.id);
    // If the host falls back to its own summarizer, this queued reply would be
    // consumed and a compaction entry would appear.
    provider.faux.setResponses([
      fauxAssistantMessage("DEFAULT SUMMARY MUST NOT RUN"),
    ]);

    await expect(session.compact()).rejects.toThrow(/Compaction cancelled/);
    expect(provider.faux.state.callCount).toBe(0);
    expect(manager.getEntries().map((entry) => entry.id)).toEqual(entriesBefore);
    expect(
      manager.getEntries().some((entry) => entry.type === "compaction"),
    ).toBe(false);
  });
});

describe("P1 effective history on the real host", () => {
  test("keep:N controls the tail and edited text is quoted from its storage entry", async () => {
    const testRoot = createRoot();
    const editedText = "EDITED: quoted text now comes from the edit entry.";
    const originalText =
      "Second instruction: quote stored text, never a model summary.";
    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    const userIds = appendHistory(manager);
    const editedUser = userIds[1];
    const keptUser = userIds[3];
    const firstUser = userIds[0];
    if (!editedUser || !keptUser || !firstUser) {
      throw new Error("fixture users missing");
    }
    const editId = manager.appendContextEdit(editedUser, {
      content: editedText,
    });
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    // Before compaction the host projects the edit into model context.
    const preProjection = manager.buildSessionProjection();
    const projectedUsers = preProjection.messages.filter(
      (message) => message.role === "user",
    );
    expect(projectedUsers.map((message) => message.content)).toContain(editedText);
    expect(projectedUsers.map((message) => message.content)).not.toContain(
      originalText,
    );

    const result = await session.compact("keep:2 focus on the edit");
    expect(provider.faux.state.callCount).toBe(0);
    // keep:2 retains the last two user turns, so the cut is the fourth user.
    expect(result.firstKeptEntryId).toBe(keptUser);

    const compaction = manager.getEntries().find((entry) => entry.type === "compaction");
    if (compaction?.type !== "compaction") {
      throw new Error("expected a persisted compaction entry");
    }
    const details = compaction.details as CapsuleDetails;
    expect(details.recipe.keep).toBe(2);
    expect(details.firstKeptEntryId).toBe(keptUser);
    expect(result.summary).toContain(editedText);
    expect(result.summary).not.toContain(originalText);

    const span = details.shown.find((candidate) => candidate.ownerId === editedUser);
    expect(span).toEqual({
      ownerId: editedUser,
      storageId: editId,
      field: "/replacement/content",
      start: 0,
      end: editedText.length,
    });

    // Explicit reads of the original entry and of the edit entry stay distinct.
    const original = readStoredField(manager.getEntries(), `e:${editedUser}`);
    expect(original.ok && original.field.text).toBe(originalText);
    const first = readStoredField(manager.getEntries(), `e:${firstUser}`);
    expect(first.ok && first.field.text).toBe(TARGET_USER_TEXT);

    // A real agent turn reads the edit storage address through the tool.
    const sessionFile = manager.getSessionFile();
    if (!sessionFile) throw new Error("session file was not persisted");
    const reopened = SessionManager.open(sessionFile);
    const secondProvider = await createProvider(testRoot.agentDir);
    const secondSettings = SettingsManager.create(testRoot.cwd, testRoot.agentDir);
    const secondLoader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager: secondSettings,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const secondSession = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager: reopened,
      settingsManager: secondSettings,
      loader: secondLoader,
      provider: secondProvider,
    });
    secondProvider.faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("context_index", {
          action: "read",
          ref: `e:${editId}`,
          field: "/replacement/content",
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("read complete"),
    ]);
    await secondSession.prompt("Read the edited instruction from its stored field.");
    const toolResult = findLatestToolResult(reopened.getEntries());
    if (
      toolResult?.type !== "message" ||
      toolResult.message.role !== "toolResult"
    ) {
      throw new Error("context_index did not produce a tool result");
    }
    expect(toolResult.message.isError).toBe(false);
    expect(messageText(toolResult.message)).toContain(editedText);
    expect(toolResult.message.details).toMatchObject({
      storageId: editId,
      field: "/replacement/content",
      effective: true,
    });
  });
});

describe("P2 repeated compaction", () => {
  test("a second compaction rebuilds from source history instead of the previous summary", async () => {
    const testRoot = createRoot();
    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(
      testRoot.cwd,
      testRoot.agentDir,
    );
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const first = await session.compact();
    expect(provider.faux.state.callCount).toBe(0);

    const postUserText = "POST-COMPACTION: continue with the implementation.";
    // Enough post-checkpoint turns that the host's own preparation still has
    // something to summarize; our cut then keeps the last user turn.
    let postUser = "";
    let postAssistant = "";
    for (let step = 0; step < 6; step++) {
      const timestamp = Date.now() + 100_000 + step * 10_000;
      postUser = manager.appendMessage({
        role: "user",
        content: step === 5 ? postUserText : `Post-compaction step ${step}.`,
        timestamp,
      });
      postAssistant = manager.appendMessage(
        fauxAssistantMessage(LONG_ASSISTANT_TEXT, { timestamp: timestamp + 1 }),
      );
    }

    const second = await session.compact("keep:1");
    expect(provider.faux.state.callCount).toBe(0);
    expect(second.firstKeptEntryId).toBe(postUser);
    expect(second.summary).toContain(TARGET_USER_TEXT);
    expect(second.summary).not.toContain(postUserText);

    const entries = manager.getEntries();
    const compactions = entries.filter((entry) => entry.type === "compaction");
    expect(compactions).toHaveLength(2);
    const latest = compactions[1];
    if (latest?.type !== "compaction") {
      throw new Error("expected the second compaction");
    }
    expect(latest.summary).toBe(second.summary);
    expect(latest.firstKeptEntryId).toBe(postUser);
    expect(latest.fromHook).toBe(true);
    const details = latest.details as CapsuleDetails;
    expect(details.sourceWatermarkId).toBe(postAssistant);
    expect(details.counts.saved).toBeGreaterThan(
      (compactions[0]?.type === "compaction"
        ? (compactions[0].details as CapsuleDetails).counts.saved
        : 0),
    );
    expect(details.counts.live).toBe(2);
    expect(details.counts.live + details.counts.quoted + details.counts.indexOnly).toBe(
      details.counts.effective,
    );

    // The first user record survives both checkpoints and still reads back.
    const sessionFile = manager.getSessionFile();
    if (!sessionFile) throw new Error("session file was not persisted");
    const reopened = SessionManager.open(sessionFile);
    const reopenedCompactions = reopened
      .getEntries()
      .filter((entry) => entry.type === "compaction");
    expect(reopenedCompactions).toHaveLength(2);
    const firstUser = findUserTarget(reopened.getEntries());
    if (!firstUser) throw new Error("the first user record was lost");
    const stored = readStoredField(
      reopened.getEntries(),
      `e:${firstUser.id}`,
    );
    expect(stored.ok && stored.field.text).toBe(TARGET_USER_TEXT);
  });
});

describe("P3 reader on the real host", () => {
  test("settings load and the ninth reader call in one run is budget_exhausted", async () => {
    const testRoot = createRoot();
    writeFileSync(
      join(testRoot.agentDir, "pi-context-index.json"),
      JSON.stringify({
        viewMaxChars: 2_400,
        keepUserTurns: 1,
        runReadMaxChars: 48_000,
      }),
      "utf8",
    );
    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(testRoot.cwd, testRoot.agentDir);
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const compacted = await session.compact();
    expect(compacted.summary.length).toBeLessThanOrEqual(2_400);
    expect(provider.faux.state.callCount).toBe(0);

    const responses = Array.from({ length: 9 }, () =>
      fauxAssistantMessage(
        fauxToolCall("context_index", { action: "list" }),
        { stopReason: "toolUse" },
      ),
    );
    responses.push(fauxAssistantMessage("read complete"));
    provider.faux.setResponses(responses);
    await session.prompt("Walk the archive with the reader.");
    expect(provider.faux.state.callCount).toBe(10);

    const results = manager
      .getEntries()
      .filter(
        (entry): entry is Extract<SessionEntry, { type: "message" }> =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === "context_index",
      );
    expect(results).toHaveLength(9);
    for (const result of results.slice(0, 8)) {
      if (result.message.role !== "toolResult") continue;
      expect(result.message.isError).toBe(false);
      expect(messageText(result.message)).toContain("[context_index list");
      expect(messageText(result.message)).toContain("e:");
    }
    const ninth = results[8];
    if (!ninth || ninth.message.role !== "toolResult") {
      throw new Error("missing ninth result");
    }
    expect(ninth.message.isError).toBe(false);
    expect(messageText(ninth.message)).toContain("budget_exhausted");
    expect(ninth.message.details).toMatchObject({
      budgetExhausted: true,
      resume: "next-run",
    });
  });

  test("an invalid settings file fails the tool and cancels compaction", async () => {
    const testRoot = createRoot();
    writeFileSync(
      join(testRoot.agentDir, "pi-context-index.json"),
      JSON.stringify({ viewMaxChars: 10 }),
      "utf8",
    );
    const provider = await createProvider(testRoot.agentDir);
    const settingsManager = SettingsManager.create(testRoot.cwd, testRoot.agentDir);
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const before = manager.getEntries().map((entry) => entry.id);
    await expect(session.compact()).rejects.toThrow(/Compaction cancelled/);
    expect(provider.faux.state.callCount).toBe(0);
    expect(manager.getEntries().map((entry) => entry.id)).toEqual(before);

    provider.faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("context_index", { action: "list" }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("cannot read"),
    ]);
    await session.prompt("Try to list the archive.");
    const result = findLatestToolResult(manager.getEntries());
    if (
      result?.type !== "message" ||
      result.message.role !== "toolResult"
    ) {
      throw new Error("expected a tool result");
    }
    expect(result.message.isError).toBe(true);
    expect(messageText(result.message)).toContain("settings error");
    expect(provider.faux.state.callCount).toBe(2);
  });
});

describe("P4 lifecycle: threshold and overflow", () => {
  test("threshold compaction enters the hook, then the next prompt sees the capsule", async () => {
    const testRoot = createRoot();
    writeFileSync(
      join(testRoot.agentDir, "settings.json"),
      JSON.stringify({
        compaction: { reserveTokens: 500, keepRecentTokens: 2_000 },
      }),
      "utf8",
    );
    const provider = await createProvider(testRoot.agentDir, {
      contextWindow: 3_000,
      maxTokens: 1_000,
    });
    const events: Array<{ reason: string; fromExtension: boolean; willRetry: boolean }> = [];
    const observer: InlineExtension = {
      name: "p4-compaction-observer",
      factory: (pi: ExtensionAPI) => {
        pi.on("session_compact", (event) => {
          events.push({
            reason: event.reason,
            fromExtension: event.fromExtension,
            willRetry: event.willRetry,
          });
        });
      },
    };
    const settingsManager = SettingsManager.create(testRoot.cwd, testRoot.agentDir);
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      extensionFactories: [observer],
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    provider.faux.setResponses([fauxAssistantMessage("threshold answer")]);
    await session.prompt("Continue the work.");
    expect(provider.faux.state.callCount).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe("threshold");
    expect(events[0]?.fromExtension).toBe(true);
    expect(events[0]?.willRetry).toBe(false);

    const compaction = manager
      .getEntries()
      .find((entry) => entry.type === "compaction");
    if (compaction?.type !== "compaction") {
      throw new Error("expected a threshold compaction entry");
    }
    expect(compaction.fromHook).toBe(true);
    expect(compaction.summary.length).toBeLessThanOrEqual(2_400);
    expect(compaction.summary).toContain(TARGET_USER_TEXT);

    const requests: RecordedRequest[] = [];
    provider.faux.setResponses([
      (context) => {
        requests.push({ messages: [...context.messages] });
        return fauxAssistantMessage("after threshold");
      },
    ]);
    await session.prompt("Continue from the capsule.");
    expect(provider.faux.state.callCount).toBe(2);
    expect(requestText(requests[0]!)).toContain(compaction.summary);
  });

  test("overflow recovery compacts through the hook and retries with the capsule", async () => {
    const testRoot = createRoot();
    writeFileSync(
      join(testRoot.agentDir, "settings.json"),
      JSON.stringify({
        compaction: { reserveTokens: 0, keepRecentTokens: 2_000 },
      }),
      "utf8",
    );
    // Large window: the only compaction trigger is the explicit overflow error.
    const provider = await createProvider(testRoot.agentDir);
    const events: Array<{ reason: string; fromExtension: boolean; willRetry: boolean }> = [];
    const observer: InlineExtension = {
      name: "p4-overflow-observer",
      factory: (pi: ExtensionAPI) => {
        pi.on("session_compact", (event) => {
          events.push({
            reason: event.reason,
            fromExtension: event.fromExtension,
            willRetry: event.willRetry,
          });
        });
      },
    };
    const settingsManager = SettingsManager.create(testRoot.cwd, testRoot.agentDir);
    const loader = await createLoader({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      settingsManager,
      extensionFactories: [observer],
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const manager = SessionManager.create(testRoot.cwd, testRoot.sessionsDir);
    appendHistory(manager);
    const session = await createSession({
      cwd: testRoot.cwd,
      agentDir: testRoot.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });

    const requests: RecordedRequest[] = [];
    provider.faux.setResponses([
      (context) => {
        requests.push({ messages: [...context.messages] });
        return fauxAssistantMessage("too long", {
          stopReason: "error",
          errorMessage: "prompt is too long: 9000 tokens > 3000 maximum",
        });
      },
      (context) => {
        requests.push({ messages: [...context.messages] });
        return fauxAssistantMessage("recovered");
      },
    ]);
    await session.prompt("Continue the work.");
    expect(provider.faux.state.callCount).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]?.reason).toBe("overflow");
    expect(events[0]?.fromExtension).toBe(true);
    expect(events[0]?.willRetry).toBe(true);

    const compaction = manager
      .getEntries()
      .find((entry) => entry.type === "compaction");
    if (compaction?.type !== "compaction") {
      throw new Error("expected an overflow compaction entry");
    }
    expect(compaction.fromHook).toBe(true);
    expect(requestText(requests[1]!)).toContain(compaction.summary);
    expect(requestText(requests[1]!)).toContain(TARGET_USER_TEXT);
  });
});
