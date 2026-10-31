// Real Pi host probe (in-process SDK) with a synthetic fixture only. The model
// endpoint is the local DeepSeek-compatible stand-in; the host is the real Pi
// runtime. No real session data, no user config: cwd and agentDir are temp dirs
// under the git-ignored out/ tree.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { runToolCall } from "@earendil-works/pi-agent-core";
import { buildActivation } from "./activation-fixture.mjs";
import { COVER_MAX } from "./render.mjs";
import { createReader } from "./reader.mjs";
import { buildView } from "./render.mjs";

const OUT = "research/prototype/out";
const CWD = OUT + "/host-cwd";
const AGENT_DIR = OUT + "/host-agent";
mkdirSync(CWD, { recursive: true });
mkdirSync(AGENT_DIR, { recursive: true });
const modelsPath = OUT + "/host-models.json";
const authPath = OUT + "/host-auth.json";
writeFileSync(modelsPath, JSON.stringify({
  providers: {
    "local-deepseek": {
      baseUrl: "http://127.0.0.1:8787/v1",
      api: "openai-completions",
      apiKey: "local",
      models: [{
        id: "deepseek-v4.1-flash-1017",
        name: "DeepSeek v4.1 flash (local stand-in)",
        reasoning: false,
        input: ["text"],
        contextWindow: 131072,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }],
    },
  },
}, null, 2));
writeFileSync(authPath, "{}");

const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: String(error?.message ?? error) }); }
};
const record = { checks, structural: {}, host: {}, model: {} };

// ---- tool definition -------------------------------------------------------
class ToolError extends Error {
  constructor(code, message) { super(code + ": " + message); this.code = code; }
}

const ACTIONS = ["view", "read", "range", "scan", "touched"];
const parameters = Type.Object({
  view: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([Type.Literal("Live"), Type.Literal("Quoted"), Type.Literal("IndexOnly"), Type.Literal("Unavailable")])),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  read: Type.Optional(Type.Object({
    index: Type.Integer({ minimum: 0 }),
    field: Type.Optional(Type.String()),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
    page: Type.Optional(Type.Integer({ minimum: 1 })),
    line: Type.Optional(Type.Integer({ minimum: 1 })),
    length: Type.Optional(Type.Integer({ minimum: 1, maximum: 12000 })),
    cover: Type.Optional(Type.Boolean()),
    revision: Type.Optional(Type.String()),
    scope: Type.Optional(Type.Union([Type.Literal("all")])),
  }, { additionalProperties: false })),
  range: Type.Optional(Type.Array(Type.Integer(), { minItems: 2, maxItems: 2 })),
  scan: Type.Optional(Type.String({ minLength: 1 })),
  scope: Type.Optional(Type.Union([Type.Literal("view"), Type.Literal("all")])),
  touched: Type.Optional(Type.String()),
}, { additionalProperties: false });

// The coded-error map the design asks for. It is applied to the reader's
// textual failures, so execute() throws on no-data failures and keeps the
// reader as the single source of ranges and text.
const codedError = (text) => {
  if (/^read error:/.test(text)) return new ToolError("locator_conflict", text);
  if (/is not (in|this) view/.test(text)) return new ToolError("view_stale", text);
  if (/is not in this saved history/.test(text)) return new ToolError("unavailable", text);
  if (/not readable under the current policy/.test(text)) return new ToolError("policy_excluded", text);
  if (/available fields:/.test(text)) return new ToolError("field_missing", text);
  if (/^page \d+ is outside/.test(text)) return new ToolError("page_out_of_range", text);
  if (/^line \d+ is outside/.test(text)) return new ToolError("line_out_of_range", text);
  if (/^offset \d+ is outside/.test(text)) return new ToolError("offset_out_of_range", text);
  return null;
};

const makeTool = ({ reader, viewId, budget = 3, label = "Context index", exposure = "direct", snippet = true, name = "context_index" }) => {
  const state = { calls: 0, executed: 0 };
  const tool = defineTool({
    name,
    label,
    description: "Read saved session history outside the compressed view. One action per call: view lists entries, read returns a field range, range lists #N records, scan searches literally, touched lists recorded operations for a path.",
    ...(snippet ? { promptSnippet: "context_index: read saved history outside the view (view/read/range/scan/touched)" } : {}),
    promptGuidelines: [
      "If a saved requirement is not visible in the view, call context_index and read the saved original; do not infer it from an excerpt.",
      "If a U line's hidden span is longer than one read window, use the printed cover call; max covers only the first window.",
    ],
    parameters,
    annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    exposure,
    executionMode: "parallel",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      state.calls += 1;
      if (signal?.aborted) throw new ToolError("deadline_exceeded", "the call was cancelled before execution");
      if (state.calls > budget) throw new ToolError("budget_exhausted", "no more than " + budget + " calls are allowed");
      const present = ACTIONS.filter((key) => params[key] !== undefined);
      if (present.length !== 1) throw new ToolError("unknown_action", "exactly one action is required");
      const text = String(reader.run(params));
      const failure = codedError(text);
      if (failure) throw failure;
      state.executed += 1;
      const range = text.match(/^#\d+ \[[^\]]*\] field=\S+ (\d+)-(\d+) of (\d+)/);
      const incomplete = /\[cover incomplete: (\d+) of (\d+) chars; next: read #\d+ field="([^"]+)" offset=(\d+)/.exec(text);
      return {
        content: [{ type: "text", text }],
        details: {
          viewId,
          action: present[0],
          refs: params.read ? [params.read.index] : [],
          spans: range ? [{ start: Number(range[1]), end: Number(range[2]), total: Number(range[3]) }] : [],
          costChars: text.length,
          ...(incomplete ? { incomplete: true, covered: Number(incomplete[1]), span: Number(incomplete[2]), next: { field: incomplete[3], offset: Number(incomplete[4]) } } : {}),
        },
        ...(incomplete ? { isError: true } : {}),
      };
    },
  });
  return { tool, state };
};

const wrap = (definition) => ({
  name: definition.name,
  label: definition.label,
  description: definition.description,
  parameters: definition.parameters,
  executionMode: definition.executionMode,
  execute: (id, params, signal, onUpdate) => definition.execute(id, params, signal, onUpdate, undefined),
});

const assistantMessage = {
  role: "assistant",
  content: [],
  api: "openai-completions",
  provider: "local-deepseek",
  model: "deepseek-v4.1-flash-1017",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  stopReason: "toolUse",
  timestamp: Date.now(),
};
const toolCall = (id, args, name = "context_index") => ({ type: "toolCall", id, name, arguments: args });
const runHostCall = (agentTool, args, extra = {}) =>
  runToolCall(toolCall(extra.id ?? "tc1", args, agentTool.name), {
    tools: [agentTool],
    assistantMessage,
    context: { messages: [], tools: [agentTool] },
    ...extra,
  });

const firstText = (outcome) => outcome.result.content?.map((part) => part.type === "text" ? part.text : "").join("") ?? "";

// ---- structural host calls on the 37K fixture ------------------------------
const act = buildActivation({ variant: "t6l", render: "5" });
// Structural calls use a large budget so a late call is not masked by the
// per-turn budget; the budget itself is tested on its own instance below.
const { tool, state } = makeTool({ reader: act.reader, viewId: act.view.manifest.id, budget: 100 });
const agentTool = wrap(tool);
const coverArgs = { read: { index: 1, field: "content", offset: act.hiddenStart, cover: true } };

const valid = await runHostCall(agentTool, coverArgs);
await check("host validation accepts the cover call", () => {
  assert.equal(valid.isError, false);
  assert.ok(firstText(valid).startsWith("#1 [user] field=content " + act.hiddenStart + "-"));
  assert.equal(valid.result.details.viewId, act.view.manifest.id);
  assert.equal(valid.result.details.action, "read");
  assert.equal(valid.result.details.costChars, firstText(valid).length);
  assert.ok(valid.result.details.spans[0].end - valid.result.details.spans[0].start > 37000);
});
await check("details carries no source text", () => {
  const details = JSON.stringify(valid.result.details);
  assert.ok(!details.includes("Release-note correction"));
  assert.ok(!details.includes("Synthetic filler line"));
  assert.ok(details.length < 400);
  assert.ok(valid.result.details.costChars > 37000);
});

const validationCases = [
  ["extra top-level property", { read: { index: 1, field: "content", offset: act.hiddenStart }, extra: 1 }, /additional|unexpected|extra/i],
  ["length above maximum", { read: { index: 1, field: "content", offset: 0, length: 99999 } }, /length|99999|maximum/i],
  ["negative index", { read: { index: -1 } }, /index|-1|minimum/i],
  ["status enum is case-sensitive", { status: "quoted" }, /status|quoted|enum/i],
  ["scan needs a non-empty query", { scan: "" }, /scan|minLength|empty/i],
  ["range needs two integers", { range: [1] }, /range|minItems|array/i],
];
record.structural.validation = [];
for (const [name, args, pattern] of validationCases) {
  const before = state.calls;
  const outcome = await runHostCall(agentTool, args);
  record.structural.validation.push({ name, isError: outcome.isError, message: firstText(outcome).slice(0, 160), executeRan: state.calls !== before });
  await check("schema rejects: " + name, () => {
    assert.equal(outcome.isError, true);
    assert.match(firstText(outcome), pattern);
    assert.equal(state.calls, before, "execute ran for an invalid call");
  });
}

const errorCases = [
  ["unknown field", { read: { index: 1, field: "missing_field", offset: 0 } }, /field_missing/],
  ["page out of range", { read: { index: 1, field: "content", page: 999 } }, /page_out_of_range/],
  ["cover plus length", { read: { index: 1, field: "content", offset: act.hiddenStart, cover: true, length: 100 } }, /locator_conflict/],
  ["stale view", { view: "vdeadbeef" }, /view_stale/],
  ["missing record", { read: { index: 9999 } }, /unavailable/],
];
record.structural.errors = [];
for (const [name, args, pattern] of errorCases) {
  const outcome = await runHostCall(agentTool, args);
  record.structural.errors.push({ name, isError: outcome.isError, message: firstText(outcome).slice(0, 160) });
  await check("throws coded error: " + name, () => {
    assert.equal(outcome.isError, true);
    assert.match(firstText(outcome), pattern);
  });
}

await check("permission hook blocks before execution", async () => {
  const before = state.executed;
  const outcome = await runHostCall(agentTool, coverArgs, { beforeToolCall: () => ({ block: true, reason: "permission: reading saved history requires confirmation" }) });
  assert.equal(outcome.isError, true);
  assert.match(firstText(outcome), /permission: reading saved history requires confirmation/);
  assert.equal(state.executed, before);
});
await check("aborted signal stops before execution", async () => {
  const controller = new AbortController();
  controller.abort();
  const before = state.executed;
  const outcome = await runHostCall(agentTool, coverArgs, { signal: controller.signal });
  assert.equal(outcome.isError, true);
  assert.match(firstText(outcome), /aborted/i);
  assert.equal(state.executed, before);
});

// Partial success: a cover bounded by a smaller policy returns text + next and
// sets isError:true, so the model sees the error without losing the payload.
const boundedAct = buildActivation({ variant: "t6l", render: "5", coverMax: 20000 });
const bounded = makeTool({ reader: boundedAct.reader, viewId: boundedAct.view.manifest.id });
const partial = await runHostCall(wrap(bounded.tool), { read: { index: 1, field: "content", offset: boundedAct.hiddenStart, cover: true } });
await check("partial cover is isError:true with payload and next", () => {
  assert.equal(partial.isError, true);
  assert.match(firstText(partial), /\[cover incomplete: 20000 of /);
  assert.equal(partial.result.details.incomplete, true);
  assert.equal(partial.result.details.covered, 20000);
  assert.ok(partial.result.details.next.offset > boundedAct.hiddenStart);
  assert.ok(firstText(partial).length > 20000);
});

await check("parallel calls are independent and both complete", async () => {
  const { tool: t2, state: s2 } = makeTool({ reader: act.reader, viewId: act.view.manifest.id, budget: 10 });
  const a = wrap(t2);
  const [one, two] = await Promise.all([
    runHostCall(a, { read: { index: 1, field: "content", offset: act.hiddenStart, cover: true } }, { id: "p1" }),
    runHostCall(a, { read: { index: 1, field: "content", offset: act.hiddenStart + 20000, length: 1200 } }, { id: "p2" }),
  ]);
  assert.equal(one.isError, false);
  assert.equal(two.isError, false);
  assert.equal(s2.executed, 2);
  assert.equal(s2.calls, 2);
});

await check("budget exhaustion is a coded throw", async () => {
  const { tool: t3 } = makeTool({ reader: act.reader, viewId: act.view.manifest.id, budget: 1 });
  const a = wrap(t3);
  const first = await runHostCall(a, { view: act.view.manifest.id, offset: 0, limit: 1 });
  const second = await runHostCall(a, { view: act.view.manifest.id, offset: 0, limit: 1 });
  assert.equal(first.isError, false);
  assert.equal(second.isError, true);
  assert.match(firstText(second), /budget_exhausted/);
});

record.structural.calls = state.calls;

// ---- registration / exposure on a real session -----------------------------
const runtime = await ModelRuntime.create({ modelsPath, authPath });
const model = runtime.getModel("local-deepseek", "deepseek-v4.1-flash-1017");
if (!model) throw new Error("local model not registered");

const direct = makeTool({ reader: act.reader, viewId: act.view.manifest.id, budget: 100 });
const hidden = makeTool({ reader: act.reader, viewId: act.view.manifest.id, budget: 3, name: "context_index_hidden", label: "Context index (hidden)", exposure: "hidden", snippet: false });
const loader = new DefaultResourceLoader({
  cwd: CWD,
  agentDir: AGENT_DIR,
  extensionFactories: [
    (pi) => {
      pi.registerTool(direct.tool);
      pi.registerTool(hidden.tool);
    },
  ],
});
await loader.reload();
const { session, extensionsResult } = await createAgentSession({
  cwd: CWD,
  agentDir: AGENT_DIR,
  modelRuntime: runtime,
  model,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(CWD),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
  tools: ["context_index"],
  thinkingLevel: "off",
});
record.host.activeTools = session.getActiveToolNames();
record.host.systemPromptHasSnippet = session.systemPrompt.includes("context_index: read saved history outside the view");
record.host.systemPromptHasGuideline = session.systemPrompt.includes("use the printed cover call");
record.host.systemPromptLength = session.systemPrompt.length;
await check("only the allowlisted direct tool is active", () => {
  assert.deepEqual(session.getActiveToolNames(), ["context_index"]);
});
await check("prompt snippet and guideline are in the system prompt", () => {
  assert.equal(record.host.systemPromptHasSnippet, true);
  assert.equal(record.host.systemPromptHasGuideline, true);
});
await check("hidden exposure cannot be activated by name", () => {
  // Host behavior: _applyToolLoadout drops any tool whose exposure is
  // "hidden", even when its name is passed to setActiveToolsByName(). A hidden
  // tool is therefore a withdrawal, not a dormant tool the model can call.
  assert.ok(!session.getActiveToolNames().includes("context_index_hidden"));
  session.setActiveToolsByName(["context_index", "context_index_hidden"]);
  assert.deepEqual(session.getActiveToolNames(), ["context_index"]);
  record.host.hiddenActivation = session.getActiveToolNames();
});

// ---- real-host model runs ---------------------------------------------------
// N1 is one behavioral run on the synthetic T6 fixture. It shows that the real
// host loop executes a model-issued tool call and feeds the result back; it is
// not a condition comparison and is not pooled with the JSON-protocol arms.
const events = [];
const unsubscribe = session.subscribe((event) => {
  if (event.type === "tool_execution_start") events.push({ type: "start", name: event.toolName, args: event.args });
  if (event.type === "tool_execution_end") events.push({ type: "end", name: event.toolName, isError: event.isError, durationMs: event.durationMs });
  if (event.type === "turn_end") events.push({ type: "turn_end", toolResults: event.toolResults.length });
});
const question = "按第一条用户消息里的 Changelog checklist，完整测试套件通过后可以直接记录 changelog 吗？只依据材料；无法确定就填 null。";
const userPrompt = question + "\n\n<view>\n" + act.view.text + "\n</view>\n\n<tail>\n" + act.tail + "\n</tail>\n\n作答时输出严格 JSON：{\"record_changelog\":boolean|null,\"why\":string|null}。";
await session.prompt(userPrompt);
unsubscribe();
const messages = session.messages;
const toolResults = messages.filter((m) => m.role === "toolResult");
const last = session.getLastAssistantText();
let answer = null;
try { answer = JSON.parse(String(last).slice(String(last).indexOf("{"), String(last).lastIndexOf("}") + 1)); } catch {}
record.model.n1 = {
  note: "single behavioral run; descriptive only, not a condition comparison",
  events,
  messageRoles: messages.map((m) => m.role),
  toolResultCount: toolResults.length,
  toolResult: toolResults[0] ? {
    toolName: toolResults[0].toolName,
    isError: toolResults[0].isError,
    chars: (toolResults[0].content ?? []).map((p) => p.text ?? "").join("").length,
    details: toolResults[0].details ?? null,
    hasSourceText: JSON.stringify(toolResults[0].details ?? {}).includes("Release-note correction"),
  } : null,
  answer,
  assistantChars: String(last ?? "").length,
  usage: messages.filter((m) => m.role === "assistant").map((m) => m.usage ?? null),
};
await check("real host executes a model-issued tool call and returns details", () => {
  assert.ok(events.some((e) => e.type === "start" && e.name === "context_index"), "no tool call");
  assert.ok(toolResults.length >= 1);
  assert.equal(toolResults[0].isError, false);
  assert.equal(toolResults[0].details.viewId, act.view.manifest.id);
  assert.equal(record.model.n1.toolResult.hasSourceText, false);
});
session.dispose();

// N2/N3 are plumbing runs: explicit arguments, a fresh session and a fresh
// conversation. They verify cover execution and thrown-error propagation; the
// model's choice of arguments is given, not measured.
const { session: session2 } = await createAgentSession({
  cwd: CWD,
  agentDir: AGENT_DIR,
  modelRuntime: runtime,
  model,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(CWD),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
  tools: ["context_index"],
  thinkingLevel: "off",
});
const coverArgsJson = JSON.stringify({ read: { index: 1, field: "content", offset: act.hiddenStart, cover: true } });
await session2.prompt("Call context_index exactly once with these arguments verbatim: " + coverArgsJson + ". Do not call any other tool. Then answer with strict JSON {\"hidden_correction\":string|null} quoting the Release-note correction sentence from the tool result.");
const coverResults = session2.messages.filter((m) => m.role === "toolResult");
const coverResult = coverResults[coverResults.length - 1];
const coverText = String((coverResult?.content ?? []).map((p) => p.text ?? "").join(""));
record.model.n2 = {
  isError: coverResult?.isError ?? null,
  chars: coverText.length,
  startsAtSpan: coverText.includes("field=content " + act.hiddenStart + "-" + act.hiddenEnd),
  hasHiddenSentence: coverText.includes("a single green run is never sufficient"),
  details: coverResult?.details ?? null,
  final: String(session2.getLastAssistantText() ?? "").slice(0, 300),
};
await check("real host executes the merged cover call end to end", () => {
  assert.equal(record.model.n2.isError, false);
  assert.ok(record.model.n2.chars > 37000);
  assert.equal(record.model.n2.startsAtSpan, true);
  assert.equal(record.model.n2.hasHiddenSentence, true);
  assert.equal(record.model.n2.details?.spans?.[0]?.end - record.model.n2.details?.spans?.[0]?.start, act.hiddenEnd - act.hiddenStart);
});

await session2.prompt("Call context_index exactly once with these arguments verbatim: {\"read\":{\"index\":1,\"field\":\"missing_field\",\"offset\":0}}. Do not call any other tool. Then answer with strict JSON {\"observed\":string|null} where observed is the error code from the tool result.");
const errorResults2 = session2.messages.filter((m) => m.role === "toolResult");
const errorResult = errorResults2[errorResults2.length - 1];
const errorText = String((errorResult?.content ?? []).map((p) => p.text ?? "").join(""));
record.model.n3 = {
  isError: errorResult?.isError ?? null,
  text: errorText.slice(0, 200),
  final: String(session2.getLastAssistantText() ?? "").slice(0, 200),
};
await check("a thrown coded error becomes an isError tool result", () => {
  assert.equal(record.model.n3.isError, true);
  assert.match(record.model.n3.text, /^field_missing:\s/);
});
session2.dispose();
record.checks = checks;
const failed = checks.filter((c) => !c.ok);
record.summary = { total: checks.length, failed: failed.length };
console.log(JSON.stringify(record, null, 2));
if (failed.length > 0) process.exitCode = 1;
