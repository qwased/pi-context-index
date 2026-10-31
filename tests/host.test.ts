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

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
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
  // Keep the host's own cut small so a compact fixture can summarize a prefix.
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ compaction: { keepRecentTokens: 2_000 } }),
    "utf8",
  );
  return { root, cwd, agentDir, sessionsDir };
};

const createProvider = async (agentDir: string): Promise<ProviderHarness> => {
  const faux = fauxProvider({ tokenSize: { min: 100, max: 200 } });
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
    expect(result.summary.length).toBeLessThanOrEqual(
      DEFAULT_SETTINGS.viewMaxChars,
    );

    const details = compaction.details as CapsuleDetails;
    expect(details.kind).toBe("pi-context-index");
    expect(details.schemaVersion).toBe(1);
    expect(details.snapshotId).toMatch(/^[0-9a-f]{12}$/);
    expect(result.summary).toContain(`snapshot=${details.snapshotId}`);
    expect(details.recipe.budgetChars).toBe(DEFAULT_SETTINGS.viewMaxChars);
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

    // Extract the generated reference for the first user record and execute
    // the reader through a real agent turn in the reopened session.
    const quotes = [...result.summary.matchAll(/^U (e:[0-9a-f-]+) \| field=(\S+)/gm)]
      .map((match) => ({ ref: match[1], field: match[2] }))
      .filter(
        (quote): quote is { ref: string; field: string } =>
          quote.ref !== undefined && quote.field !== undefined,
      );
    expect(quotes.length).toBeGreaterThan(0);
    expect(result.summary).toContain(TARGET_USER_TEXT);
    const targetEntry = findUserTarget(reopened.getEntries());
    expect(targetEntry?.id).toBe(userIds[0] ?? "");
    if (!targetEntry) throw new Error("target user record is missing");
    const targetQuote = quotes.find(
      (quote) => quote.ref === `e:${targetEntry.id}`,
    );
    expect(targetQuote).toBeDefined();
    if (!targetQuote) throw new Error("generated capsule has no target ref");

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
    expect(messageText(toolResult.message)).toBe(TARGET_USER_TEXT);
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
    expect(result.summary.length).toBeLessThanOrEqual(
      DEFAULT_SETTINGS.viewMaxChars,
    );

    const compaction = manager.getEntries().at(-1);
    if (compaction?.type !== "compaction") {
      throw new Error("expected a persisted compaction entry");
    }
    const details = compaction.details as CapsuleDetails;
    const targetId = userIds[0];
    if (!targetId) throw new Error("missing first user record");
    const span = details.shown.find((candidate) => candidate.ownerId === targetId);
    expect(span).toBeDefined();
    if (!span) throw new Error("the long user record was not quoted");

    expect(span.field).toBe("/message/content");
    expect(span.end).toBeGreaterThan(0);
    expect(span.end).toBeLessThan(HUGE_USER_TEXT.length);
    expect(result.summary).toContain(HUGE_USER_TEXT.slice(0, span.end));
    expect(result.summary).toMatch(
      new RegExp(
        `^U e:${targetId} \\| field=/message/content \\| partial 0-${span.end}/${HUGE_USER_TEXT.length}$`,
        "m",
      ),
    );
    expect(result.summary).toContain("chars omitted");
    // A UTF-16 high surrogate at the cut would mean a split grapheme.
    const lastUnit = HUGE_USER_TEXT.charCodeAt(span.end - 1);
    expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(false);

    const stored = readStoredField(
      manager.getEntries(),
      `e:${targetId}`,
      span.field,
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
