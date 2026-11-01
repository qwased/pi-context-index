/**
 * Shared real-host harness for the P4/P5 lifecycle tests. Every root is a
 * temporary directory; the user's agent directory is never read or written.
 */

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
} from "@earendil-works/pi-ai/providers/faux";

export const EXTENSION_ENTRY = fileURLToPath(
  new URL("../../index.ts", import.meta.url),
);

export const TARGET_USER_TEXT =
  "保留原始验收夹具 𪚥 😀 e\u0301\r\n第二行：压缩时不要调用模型。";
export const LIVE_TAIL_MARKER = "LIVE TAIL MARKER: the newest assistant work log";
export const LONG_ASSISTANT_TEXT = "work log line. " + "x".repeat(2_400);

export interface TestRoot {
  root: string;
  cwd: string;
  agentDir: string;
  sessionsDir: string;
}

export interface ProviderHarness {
  faux: ReturnType<typeof fauxProvider>;
  runtime: ModelRuntime;
  model: ReturnType<ReturnType<typeof fauxProvider>["getModel"]>;
}

export interface RecordedRequest {
  messages: readonly { role?: unknown; content?: unknown }[];
}

const roots: string[] = [];
const ORIGINAL_AGENT_DIR = process.env.PI_CODING_AGENT_DIR;

export const cleanupHostState = (): void => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  if (ORIGINAL_AGENT_DIR === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = ORIGINAL_AGENT_DIR;
  }
};

export const createRoot = (options: {
  keepRecentTokens?: number;
  settings?: Record<string, unknown>;
} = {}): TestRoot => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-index-lifecycle-"));
  roots.push(root);
  const cwd = join(root, "work");
  const agentDir = join(root, "agent");
  const sessionsDir = join(root, "sessions");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      compaction: {
        keepRecentTokens: options.keepRecentTokens ?? 2_000,
      },
      ...(options.settings ?? {}),
    }),
    "utf8",
  );
  return { root, cwd, agentDir, sessionsDir };
};

export const createProvider = async (
  agentDir: string,
  model: { id?: string; contextWindow?: number; maxTokens?: number } = {},
): Promise<ProviderHarness> => {
  const faux = fauxProvider({
    tokenSize: { min: 100, max: 200 },
    models: [
      {
        id: model.id ?? "faux-1",
        contextWindow: model.contextWindow ?? 128_000,
        maxTokens: model.maxTokens ?? 16_384,
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

export const createLoader = async (input: {
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
    systemPrompt: "P4 host test system prompt.",
    extensionFactories: input.extensionFactories ?? [],
    additionalExtensionPaths: input.additionalExtensionPaths ?? [],
  });
  await loader.reload();
  if (loader.getExtensions().errors.length > 0) {
    throw new Error(
      "extension load failed: " +
        loader
          .getExtensions()
          .errors.map((error) => error.error)
          .join("; "),
    );
  }
  return loader;
};

export const createSession = async (input: {
  cwd: string;
  agentDir: string;
  manager: SessionManager;
  settingsManager: SettingsManager;
  loader: DefaultResourceLoader;
  provider: ProviderHarness;
  noTools?: "all" | "builtin";
  activeTools?: string[];
}): Promise<AgentSession> => {
  const { session } = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    modelRuntime: input.provider.runtime,
    model: input.provider.model,
    sessionManager: input.manager,
    settingsManager: input.settingsManager,
    resourceLoader: input.loader,
    noTools: input.noTools ?? "builtin",
    thinkingLevel: "off",
  });
  await session.bindExtensions({});
  if (input.activeTools) {
    session.setActiveToolsByName(input.activeTools);
  }
  return session;
};

export const appendHistory = (
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
        ? LIVE_TAIL_MARKER + "\n" + LONG_ASSISTANT_TEXT
        : LONG_ASSISTANT_TEXT;
    manager.appendMessage(
      assistantMessage(assistantText, { timestamp: timestamp + 1 }),
    );
  }
  return userIds;
};

export const assistantMessage = (
  text: string,
  options: { timestamp?: number } = {},
) => fauxAssistantMessage(text, { timestamp: options.timestamp });

export const appendTurn = (
  manager: SessionManager,
  userText: string,
  assistantText: string,
  timestamp: number = Date.now(),
): { userId: string; assistantId: string } => ({
  userId: manager.appendMessage({
    role: "user",
    content: userText,
    timestamp,
  }),
  assistantId: manager.appendMessage(
    assistantMessage(assistantText, { timestamp: timestamp + 1 }),
  ),
});

export const messageText = (message: { content?: unknown }): string => {
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

export const requestText = (request: RecordedRequest): string =>
  request.messages.map(messageText).join("\n");

export const findUserTarget = (entries: SessionEntry[]): SessionEntry | undefined =>
  entries.find(
    (entry) =>
      entry.type === "message" &&
      entry.message.role === "user" &&
      entry.message.content === TARGET_USER_TEXT,
  );

export const findLatestToolResult = (
  entries: SessionEntry[],
): SessionEntry | undefined =>
  entries
    .filter(
      (entry): entry is Extract<SessionEntry, { type: "message" }> =>
        entry.type === "message" && entry.message.role === "toolResult",
    )
    .at(-1);

export const observerForCompactions = (
  events: Array<{ reason: string; fromExtension: boolean; willRetry: boolean }>,
): InlineExtension => ({
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
});
