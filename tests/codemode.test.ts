import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCodemodeExtension,
  SettingsManager,
  SessionManager,
  type ExtensionAPI,
  type InlineExtension,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { ReaderRunBudget } from "../src/budget";
import { buildCapsule } from "../src/render";
import type { Cut } from "../src/cut";
import type { CapsuleDetails } from "../src/model";
import {
  captureSource,
  projectHistory,
  type EffectiveHistory,
} from "../src/source";
import {
  extractObservations,
  observationResultField,
} from "../src/observations";
import { fieldList, primaryFieldOf } from "../src/fields";
import {
  executeReader,
  readStoredField,
  type ReaderContext,
} from "../src/reader";
import {
  appendHistory,
  appendTurn,
  cleanupHostState,
  createLoader,
  createProvider,
  createRoot,
  createSession,
  EXTENSION_ENTRY,
  findLatestToolResult,
  messageText,
} from "./helpers/host";

afterEach(cleanupHostState);

const probeTools: InlineExtension = {
  name: "codemode-probe-tools",
  factory: (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "write",
      label: "Synthetic Write",
      description: "synthetic write probe; never touches disk",
      parameters: Type.Object({ payload: Type.Optional(Type.String()) }),
      async execute(_id, args) {
        const payload = (args as { payload?: string }).payload ?? "";
        return {
          content: [
            { type: "text" as const, text: "write probe accepted " + payload.length + " chars" },
          ],
          details: {},
        };
      },
    });
    pi.registerTool({
      name: "bash",
      label: "Synthetic Bash",
      description: "synthetic command probe; output is not persisted",
      parameters: Type.Object({ command: Type.Optional(Type.String()) }),
      async execute() {
        return {
          content: [
            { type: "text" as const, text: "MISSING-OUTPUT-MARKER" },
          ],
          details: {},
        };
      },
    });
  },
};

interface CodemodeHarness {
  root: ReturnType<typeof createRoot>;
  provider: Awaited<ReturnType<typeof createProvider>>;
  manager: SessionManager;
  session: Awaited<ReturnType<typeof createSession>>;
}

const createCodemodeHarness = async (input: {
  mode?: "on" | "only";
  pluginSettings?: Record<string, number>;
  extraTurns?: number;
} = {}): Promise<CodemodeHarness> => {
  const root = createRoot();
  if (input.pluginSettings) {
    writeFileSync(
      join(root.agentDir, "pi-context-index.json"),
      JSON.stringify(input.pluginSettings),
      "utf8",
    );
  }
  const provider = await createProvider(root.agentDir);
  const settingsManager = SettingsManager.create(root.cwd, root.agentDir);
  const loader = await createLoader({
    cwd: root.cwd,
    agentDir: root.agentDir,
    settingsManager,
    extensionFactories: [
      createCodemodeExtension({ mode: input.mode ?? "on" }),
      probeTools,
    ],
    additionalExtensionPaths: [EXTENSION_ENTRY],
  });
  const manager = SessionManager.create(root.cwd, root.sessionsDir);
  const session = await createSession({
    cwd: root.cwd,
    agentDir: root.agentDir,
    manager,
    settingsManager,
    loader,
    provider,
    activeTools: ["codemode", "context_index", "write", "bash"],
  });
  appendHistory(manager);
  for (let index = 0; index < (input.extraTurns ?? 0); index++) {
    appendTurn(
      manager,
      "codemode extra turn " + index,
      "codemode extra work " + index,
      Date.now() + 100_000 + index * 1_000,
    );
  }
  return { root, provider, manager, session };
};

type ToolMessage = Extract<
  Extract<SessionEntry, { type: "message" }>["message"],
  { role: "toolResult" }
>;
type CodemodeResult = Extract<SessionEntry, { type: "message" }> & {
  message: ToolMessage;
};

const runCodemode = async (
  harness: CodemodeHarness,
  code: string,
): Promise<CodemodeResult> => {
  harness.provider.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("codemode", { code }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("codemode done"),
  ]);
  await harness.session.prompt("Run the synthetic codemode script.");
  const result = findLatestToolResult(harness.manager.getEntries());
  if (
    result?.type !== "message" ||
    result.message.role !== "toolResult" ||
    result.message.toolName !== "codemode"
  ) {
    throw new Error("codemode did not produce a tool result");
  }
  return result as CodemodeResult;
};

const nestedOf = (
  result: CodemodeResult,
): { calls: Array<Record<string, unknown>>; complete: boolean } => {
  const nested = (result.message as { nestedCalls?: unknown }).nestedCalls;
  if (typeof nested !== "object" || nested === null) {
    throw new Error("codemode result has no nestedCalls");
  }
  return nested as { calls: Array<Record<string, unknown>>; complete: boolean };
};

const historyOf = (manager: SessionManager, keep = 0): EffectiveHistory => {
  const snapshot = captureSource(manager);
  const cut: Cut = {
    firstKeptEntryId: keep > 0 ? (snapshot.branch.at(-keep)?.id ?? "") : "",
    cutIndex: keep > 0 ? snapshot.branch.length - keep : snapshot.branch.length,
    reason: keep > 0 ? "keep-turns" : "compact-all",
    requestedKeep: keep,
    keptUserTurns: keep,
    totalUserTurns: 0,
    tailTokens: 0,
    tailTokenLimit: 0,
  };
  return projectHistory(snapshot, cut);
};

const capsuleText = (manager: SessionManager): string =>
  buildCapsule({
    history: historyOf(manager),
    config: { viewMaxChars: 12_000, keepUserTurns: 0 },
    contextWindow: 128_000,
  }).text;

const readerContext = (manager: SessionManager): ReaderContext => ({
  sessionManager: manager,
  getContextUsage: () => ({ tokens: 2_000, contextWindow: 128_000 }),
  model: { contextWindow: 128_000, maxTokens: 16_384 },
});

const searchText = async (
  manager: SessionManager,
  query: string,
): Promise<string> => {
  const result = await executeReader(
    { action: "search", query, match: "literal" },
    readerContext(manager),
    new ReaderRunBudget(),
  );
  return result.content.map((part) => part.text).join("\n");
};

const resultText = (result: CodemodeResult): string =>
  messageText(result.message);

describe("P4 codemode state transitions on the real in-process pipeline", () => {
  test("only mode hides the direct declaration, carries the guideline and still executes", async () => {
    const harness = await createCodemodeHarness({ mode: "only" });
    const active = harness.session.getActiveToolNames();
    expect(active).toContain("codemode");
    expect(active).toContain("context_index");
    expect(
      harness.session.getToolDefinition("context_index")?.exposure,
    ).toBe("direct");

    const compacted = await harness.session.compact("keep:1");
    expect(compacted.summary).toContain(
      "direct or tools.context_index(...) in a script",
    );
    const guidelines =
      harness.session.getToolDefinition("context_index")?.promptGuidelines ?? [];
    expect(guidelines.join(" ")).toContain("directly");
    expect(guidelines.join(" ")).toContain("tools.context_index");
    expect(guidelines.join(" ")).toContain("codemode script");
    // In only mode the direct declarations are hidden from the model prompt;
    // the script path still reaches the active tool and the capsule names both.
    expect(harness.session.systemPrompt).not.toContain("context_index");

    const result = await runCodemode(
      harness,
      'const out = await tools.context_index({action: "list"}); return out.slice(0, 160);',
    );
    expect(result.message.isError).toBe(false);
    expect(nestedOf(result).complete).toBe(true);
    expect(nestedOf(result).calls[0]?.["name"]).toBe("context_index");
    expect(resultText(result)).toContain("[context_index list");
  });

  test("nested arguments above 8KB become argumentsBytes and lose their path", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'const out = await tools.write({payload: "x".repeat(9000)}); return "write:" + out.length;',
    );
    expect(result.message.isError).toBe(false);
    const nested = nestedOf(result);
    expect(nested.complete).toBe(false);
    const call = nested.calls[0];
    expect(call?.["name"]).toBe("write");
    expect(call?.["arguments"]).toBeUndefined();
    expect(Number(call?.["argumentsBytes"])).toBeGreaterThan(8_192);

    const stored = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
      "/message/nestedCalls/calls/0/argumentsBytes",
    );
    expect(stored.ok && Number(stored.field.text)).toBeGreaterThan(8_192);
    const args = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
      "/message/nestedCalls/calls/0/arguments",
    );
    expect(args.ok).toBe(false);

    const observations = extractObservations(historyOf(harness.manager));
    const write = observations.entries
      .map((entry) => entry.observation)
      .find((observation) => observation.tool === "write");
    expect(write?.operation).toBe("write");
    expect(write?.path).toBeUndefined();
    expect(write?.argumentsBytes).toBeGreaterThan(8_192);
    expect(write?.isError).not.toBe(true);
  });

  test("complete:false is visible and the capsule reports omitted arguments instead of success", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'await tools.write({payload: "y".repeat(9500)}); return "done";',
    );
    const nested = nestedOf(result);
    expect(nested.complete).toBe(false);
    expect(nested.calls[0]?.["arguments"]).toBeUndefined();
    expect(nested.calls[0]?.["status"]).toBe("ok");

    const summary = capsuleText(harness.manager);
    expect(summary).toContain("参数已省略");
    expect(summary).toMatch(/参数已省略（95\d{2} 字节）/);
    expect(summary).not.toContain("write probe accepted");
    const observations = extractObservations(historyOf(harness.manager));
    const write = observations.entries
      .map((entry) => entry.observation)
      .find((observation) => observation.tool === "write");
    expect(write?.argumentsBytes).toBeGreaterThan(9_000);
    expect(write?.sources.every((span) => span.field.includes("argumentsBytes"))).toBe(
      true,
    );
  });

  test("two reads launched from one script share the run ledger", async () => {
    const harness = await createCodemodeHarness({
      pluginSettings: {
        viewMaxChars: 12_000,
        keepUserTurns: 1,
        runReadMaxChars: 12_000,
      },
    });
    const longUser = harness.manager.appendMessage({
      role: "user",
      content: "ledger read field " + "z".repeat(60_000),
      timestamp: Date.now() + 500_000,
    });
    await runCodemode(
      harness,
      'const [a, b] = await Promise.all([' +
        'tools.context_index({action: "read", ref: "e:' +
        longUser +
        '", length: 12000}),' +
        'tools.context_index({action: "read", ref: "e:' +
        longUser +
        '", length: 12000})' +
        ']);' +
        'return JSON.stringify({a: a.length, b: b.length, bBudget: b.includes("budget_exhausted")});',
    );
    const parent = findLatestToolResult(harness.manager.getEntries());
    if (parent?.type !== "message" || parent.message.role !== "toolResult") {
      throw new Error("missing codemode result");
    }
    const text = messageText(parent.message as CodemodeResult["message"]);
    expect(text).toContain('"bBudget":true');
    const nested = nestedOf(parent as CodemodeResult);
    expect(nested.calls).toHaveLength(2);
    expect(nested.calls.every((call) => call["status"] === "ok")).toBe(true);
  });

  test("a returned read result is trimmed from indexing while the raw body keeps it", async () => {
    const harness = await createCodemodeHarness();
    const holder = harness.manager.appendMessage({
      role: "toolResult",
      toolCallId: "synthetic-holder",
      toolName: "read",
      content: [{ type: "text", text: "holder record" }],
      details: { secret: "ECHO-SECRET-99" },
      isError: false,
      timestamp: Date.now() + 600_000,
    });
    const result = await runCodemode(
      harness,
      'return await tools.context_index({action: "read", ref: "e:' +
        holder +
        '", field: "/message/details/secret"});',
    );
    const bodyFields = fieldList(result);
    expect(bodyFields.some((field) => field.text.includes("ECHO-SECRET-99"))).toBe(
      true,
    );
    expect(
      bodyFields.some((field) => field.text.includes("<<<pi-context-index:read>>>")),
    ).toBe(true);

    const search = await searchText(harness.manager, "ECHO-SECRET-99");
    expect(search).toContain("no literal matches");
    const summary = capsuleText(harness.manager);
    expect(summary).not.toContain("ECHO-SECRET-99");
  });

  test("a nested error is addressable, marked as an error and not treated as success", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'let message = "";' +
        'try { await tools.context_index({action: "read", ref: "e:not-in-this-file"}); }' +
        'catch (error) { message = String(error && error.message || error); }' +
        'return "caught:" + message;',
    );
    expect(result.message.isError).toBe(false);
    const nested = nestedOf(result);
    expect(nested.complete).toBe(true);
    expect(nested.calls[0]?.["status"]).toBe("error");
    expect(String(nested.calls[0]?.["error"])).toContain("not in this session file");

    const storedError = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
      "/message/nestedCalls/calls/0/error",
    );
    expect(storedError.ok).toBe(true);
    expect(storedError.ok && storedError.field.text).toContain(
      "not in this session file",
    );

    const observations = extractObservations(historyOf(harness.manager));
    const error = observations.entries
      .map((entry) => entry.observation)
      .find(
        (observation) =>
          observation.resultId === result.id &&
          observation.nestedIndex === 0,
      );
    expect(error?.isError).toBe(true);
    expect(
      error?.sources.some(
        (span) => span.field === "/message/nestedCalls/calls/0/error",
      ),
    ).toBe(true);
    const reviewed = observations.entries.find(
      (entry) =>
        entry.observation.resultId === result.id &&
        entry.observation.nestedIndex === 0,
    );
    expect(observationResultField(reviewed!)?.field.path).toBe(
      "/message/nestedCalls/calls/0/error",
    );
    // The stored error text is itself a reader result wrapped in self-echo
    // markers, so the capsule does not quote it. Navigation still marks the
    // nested call as an error; the raw error field stays explicitly readable.
    const summary = capsuleText(harness.manager);
    expect(summary).toMatch(/context_index x1 \(error\)/);
    expect(summary).not.toContain("context_index x1 |");
  });

  test("a nested command output that was not persisted is never fabricated", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'await tools.bash({command: "synthetic-command"}); return "finished without the output";',
    );
    const text = resultText(result);
    expect(text).toContain("finished without the output");
    expect(text).not.toContain("MISSING-OUTPUT-MARKER");
    expect(JSON.stringify(harness.manager.getEntries())).not.toContain(
      "MISSING-OUTPUT-MARKER",
    );
    expect(await searchText(harness.manager, "MISSING-OUTPUT-MARKER")).toContain(
      "no literal matches",
    );
    const observations = extractObservations(historyOf(harness.manager));
    const command = observations.entries
      .map((entry) => entry.observation)
      .find(
        (observation) =>
          observation.tool === "bash" && observation.command === "synthetic-command",
      );
    expect(command).toBeDefined();
    expect(command?.valueSpan).toBeUndefined();
    expect(capsuleText(harness.manager)).not.toContain("MISSING-OUTPUT-MARKER");
  });

  test("oversized aggregate output indexes only the saved head and tail", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'const head = "HEAD" + "-MARK";' +
        'const middle = "MIDDLE" + "-MARK";' +
        'const tail = "TAIL" + "-MARK";' +
        'return head + "A".repeat(30000) + middle + "B".repeat(30000) + tail;',
    );
    const body = resultText(result);
    expect(body).toContain("Warning: truncated output");
    expect(body).toContain("HEAD-MARK");
    expect(body).toContain("TAIL-MARK");
    expect(body).not.toContain("MIDDLE-MARK");
    expect(body.length).toBeGreaterThan(39_000);
    expect(body.length).toBeLessThan(45_000);

    expect(await searchText(harness.manager, "HEAD-MARK")).toContain("HEAD-MARK");
    expect(await searchText(harness.manager, "TAIL-MARK")).toContain("TAIL-MARK");
    expect(await searchText(harness.manager, "MIDDLE-MARK")).toContain(
      "no literal matches",
    );
    const details = (result.message as { details?: { fullOutputPath?: string } })
      .details;
    expect(typeof details?.fullOutputPath).toBe("string");
    const detailsRead = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
      "/message/details/fullOutputPath",
    );
    expect(detailsRead.ok).toBe(true);
  });

  test("a real two-part codemode result defaults to the output body", async () => {
    const harness = await createCodemodeHarness();
    const result = await runCodemode(
      harness,
      'return "REAL-CODEMODE-BODY-MARK";',
    );
    const content = result.message.content;
    expect(content.length).toBeGreaterThanOrEqual(2);
    const first = content[0];
    expect(first?.type).toBe("text");
    if (first?.type === "text") {
      expect(first.text).toContain("Script completed");
    }
    expect(primaryFieldOf(result)?.path).toBe("/message/content/1/text");
    expect(primaryFieldOf(result)?.text).toContain("REAL-CODEMODE-BODY-MARK");

    const body = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
    );
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.field.path).toBe("/message/content/1/text");
      expect(body.field.text).toContain("REAL-CODEMODE-BODY-MARK");
    }
    const header = readStoredField(
      harness.manager.getEntries(),
      "e:" + result.id,
      "/message/content/0/text",
    );
    expect(header.ok).toBe(true);
    if (header.ok) expect(header.field.text).toContain("Script completed");
  });
});
