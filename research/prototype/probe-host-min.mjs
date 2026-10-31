// Minimal probe: can an in-process Pi host load a synthetic tool and reach the
// local DeepSeek-compatible endpoint? No real session data is used.
import { mkdirSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

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
      models: [{ id: "deepseek-v4.1-flash-1017", name: "DeepSeek v4.1 flash (local stand-in)", reasoning: false, input: ["text"], contextWindow: 131072, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    },
  },
}, null, 2));
writeFileSync(authPath, "{}");

const runtime = await ModelRuntime.create({ modelsPath, authPath });
const model = runtime.getModel("local-deepseek", "deepseek-v4.1-flash-1017");
console.log("model:", model ? model.provider + "/" + model.id + " api=" + model.api + " baseUrl=" + model.baseUrl : "MISSING");

let registered = false;
const tool = defineTool({
  name: "probe_tool",
  label: "Probe tool",
  description: "Returns the literal string given in text.",
  promptSnippet: "probe_tool: echo a literal string (synthetic host probe)",
  parameters: Type.Object({ text: Type.String() }, { additionalProperties: false }),
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  async execute(_id, params) {
    registered = true;
    return { content: [{ type: "text", text: "echo:" + params.text }], details: { echo: params.text.length } };
  },
});

const loader = new DefaultResourceLoader({
  cwd: CWD,
  agentDir: AGENT_DIR,
  extensionFactories: [(pi) => pi.registerTool(tool)],
});
await loader.reload();
const { session } = await createAgentSession({
  cwd: CWD,
  agentDir: AGENT_DIR,
  tools: ["probe_tool"],
  modelRuntime: runtime,
  model,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(CWD),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
  noTools: "builtin",
  thinkingLevel: "off",
});
console.log("active tools:", session.getActiveToolNames());
console.log("system prompt has tool name:", session.systemPrompt.includes("probe_tool"));
await session.prompt("Call probe_tool exactly once with {\"text\":\"ok\"}, then answer with the exact echo string.");
console.log("last text:", JSON.stringify(session.getLastAssistantText()));
console.log("messages:", session.messages.map((m) => m.role + (m.toolName ? ":" + m.toolName : "")).join(","));
console.log("registered flag:", registered);
session.dispose();
