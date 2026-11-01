/**
 * P5 install smoke: load the packed package from a temporary agent directory,
 * compact a synthetic session and read the first user record through the tool.
 *
 *   PI_INSTALL_AGENT_DIR=<temp>/agent PI_INSTALL_CWD=<temp>/work \
 *   PI_INSTALL_SESSIONS=<temp>/sessions bun research/install-smoke.ts
 *
 * The script only uses temporary paths and the local package settings. It does
 * not publish, and it does not touch the real agent directory.
 */

import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

const agentDir = process.env.PI_INSTALL_AGENT_DIR;
const cwd = process.env.PI_INSTALL_CWD;
const sessionsDir = process.env.PI_INSTALL_SESSIONS;
if (!agentDir || !cwd || !sessionsDir) {
  throw new Error(
    "set PI_INSTALL_AGENT_DIR, PI_INSTALL_CWD and PI_INSTALL_SESSIONS",
  );
}
process.env.PI_CODING_AGENT_DIR = agentDir;

const faux = fauxProvider({
  tokenSize: { min: 100, max: 200 },
  models: [
    { id: "faux-1", contextWindow: 128_000, maxTokens: 16_384 },
  ],
});
const runtime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: null,
  refreshOnCreate: false,
});
runtime.registerNativeProvider(faux.provider);
const model = faux.getModel();

const settingsManager = SettingsManager.create(cwd, agentDir);
const loader = new DefaultResourceLoader({
  cwd,
  agentDir,
  settingsManager,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  noMcp: true,
  systemPrompt: "P5 install smoke system prompt.",
});
await loader.reload();
const loaded = loader.getExtensions();
if (loaded.errors.length > 0) {
  throw new Error(
    "installed extension load failed: " +
      loaded.errors.map((error) => error.error).join("; "),
  );
}
const installed = loaded.extensions.find((extension) =>
  extension.tools.has("context_index"),
);
if (!installed) {
  throw new Error(
    "installed package did not register context_index; tools: " +
      loaded.extensions
        .flatMap((extension) => [...extension.tools.keys()])
        .join(","),
  );
}

const manager = SessionManager.create(cwd, sessionsDir);
const texts = [
  "P5 install target: read this original instruction after compaction.",
  "Second instruction.",
  "Third instruction.",
  "Fourth instruction.",
  "Fifth instruction.",
];
for (let index = 0; index < texts.length; index++) {
  const timestamp = Date.now() + index * 10_000;
  manager.appendMessage({
    role: "user",
    content: texts[index]!,
    timestamp,
  });
  manager.appendMessage(
    fauxAssistantMessage("work log " + "x".repeat(2_000), {
      timestamp: timestamp + 1,
    }),
  );
}
const { session } = await createAgentSession({
  cwd,
  agentDir,
  modelRuntime: runtime,
  model,
  sessionManager: manager,
  settingsManager,
  resourceLoader: loader,
  noTools: "builtin",
  thinkingLevel: "off",
});
await session.bindExtensions({});

const compacted = await session.compact("keep:1");
const compactionProviderCalls = faux.state.callCount;
const firstUser = manager.getEntries().find(
  (entry) =>
    entry.type === "message" &&
    entry.message.role === "user" &&
    entry.message.content === texts[0],
);
if (!firstUser) throw new Error("first user record missing");

faux.setResponses([
  fauxAssistantMessage(
    fauxToolCall("context_index", {
      action: "read",
      ref: "e:" + firstUser.id,
    }),
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("install smoke read complete"),
]);
await session.prompt("Read the earliest instruction from the installed package.");
const toolResult = manager
  .getEntries()
  .filter(
    (entry): entry is Extract<typeof entry, { type: "message" }> =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "context_index",
  )
  .at(-1);
if (!toolResult) throw new Error("installed reader did not run");
const text = toolResult.message.content
  .map((part) => (part.type === "text" ? part.text : ""))
  .join("\n");
console.log(
  JSON.stringify(
    {
      installedFrom: settingsManager.getPackages?.() ?? null,
      registeredTool: installed.tools.get("context_index")?.definition.name,
      compactionChars: compacted.summary.length,
      compactionProviderCalls,
      firstKeptEntryId: compacted.firstKeptEntryId,
      readContainsTarget: text.includes(texts[0]),
      providerCalls: faux.state.callCount,
      sessionFile: manager.getSessionFile(),
    },
    null,
    2,
  ),
);
