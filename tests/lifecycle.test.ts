import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  SessionManager,
  SettingsManager,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type { CapsuleDetails } from "../src/model";
import { readStoredField } from "../src/reader";
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
  findUserTarget,
  LONG_ASSISTANT_TEXT,
  messageText,
  TARGET_USER_TEXT,
} from "./helpers/host";

afterEach(cleanupHostState);

interface Harness {
  root: ReturnType<typeof createRoot>;
  manager: SessionManager;
  settingsManager: SettingsManager;
  session: Awaited<ReturnType<typeof createSession>>;
  provider: Awaited<ReturnType<typeof createProvider>>;
  loader: Awaited<ReturnType<typeof createLoader>>;
}

const createHarness = async (): Promise<Harness> => {
  const root = createRoot();
  const provider = await createProvider(root.agentDir);
  const settingsManager = SettingsManager.create(root.cwd, root.agentDir);
  const loader = await createLoader({
    cwd: root.cwd,
    agentDir: root.agentDir,
    settingsManager,
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
  });
  return { root, manager, settingsManager, session, provider, loader };
};

const compactionOf = (entries: SessionEntry[]) => {
  const compaction = entries
    .filter((entry) => entry.type === "compaction")
    .at(-1);
  if (compaction?.type !== "compaction") {
    throw new Error("expected a persisted compaction entry");
  }
  return compaction;
};

describe("P4 compact-all on the real host", () => {
  test("keep:0 persists the empty cut, projects summary-only context, reopens, forks and reads", async () => {
    const { root, manager, settingsManager, session, provider } =
      await createHarness();
    const userIds = appendHistory(manager);
    const firstUserId = userIds[0];
    if (!firstUserId) throw new Error("missing first user record");

    const first = await session.compact("keep:0");
    expect(provider.faux.state.callCount).toBe(0);
    expect(first.firstKeptEntryId).toBe("");
    expect(first.summary).toContain(TARGET_USER_TEXT);
    const firstSnapshot = (compactionOf(manager.getEntries()).details as CapsuleDetails)
      .snapshotId;
    // With keep:0 every record is history, so the capsule may quote recent
    // assistant work; the point is that it is not a live tail.
    expect(first.summary).toContain("live: 0");

    const saved = compactionOf(manager.getEntries());
    expect(saved.firstKeptEntryId).toBe("");
    expect(saved.fromHook).toBe(true);
    expect(saved.summary).toBe(first.summary);

    // An empty firstKeptEntryId matches no entry; the host projection keeps
    // only the compaction summary and everything appended after the checkpoint.
    const projection = manager.buildSessionProjection();
    expect(projection.messages).toHaveLength(1);
    expect(projection.messages[0]?.role).toBe("compactionSummary");
    if (projection.messages[0]?.role === "compactionSummary") {
      expect(projection.messages[0].summary).toBe(first.summary);
    }

    const sessionFile = manager.getSessionFile();
    if (!sessionFile) throw new Error("session file was not persisted");
    const reopened = SessionManager.open(sessionFile);
    const reopenedCompaction = compactionOf(reopened.getEntries());
    expect(reopenedCompaction.firstKeptEntryId).toBe("");
    expect(reopenedCompaction.summary).toBe(first.summary);
    expect(reopened.buildSessionProjection().messages).toHaveLength(1);

    // The archive is untouched: the first user record still reads verbatim.
    const firstRecord = findUserTarget(reopened.getEntries());
    if (!firstRecord) throw new Error("the first user record was lost");
    const stored = readStoredField(reopened.getEntries(), "e:" + firstRecord.id);
    expect(stored.ok && stored.field.text).toBe(TARGET_USER_TEXT);

    // A second compact-all on the same session still leaves summary-only
    // context and still quotes the original first user record.
    for (let step = 0; step < 6; step++) {
      appendTurn(
        manager,
        step === 5 ? "Second compact-all: continue the implementation." : "Post-all step " + step + ".",
        "post-compact-all work log " + step + "\n" + LONG_ASSISTANT_TEXT,
        Date.now() + 100_000 + step * 10_000,
      );
    }
    const second = await session.compact("keep:0");
    expect(provider.faux.state.callCount).toBe(0);
    expect(second.firstKeptEntryId).toBe("");
    expect(second.summary).toContain(TARGET_USER_TEXT);
    expect(second.summary).not.toContain("snapshot=" + firstSnapshot);
    expect(
      manager.getEntries().filter((entry) => entry.type === "compaction"),
    ).toHaveLength(2);
    expect(manager.buildSessionProjection().messages).toHaveLength(1);

    // Fork copies the full file (including the empty cut) under a new session
    // id. Inherited ids resolve; an id that never existed returns not_found.
    const forkRoot = createRoot({ keepRecentTokens: 2_000 });
    const forkCwd = join(forkRoot.root, "fork-work");
    const forkSessions = join(forkRoot.root, "fork-sessions");
    mkdirSync(forkCwd, { recursive: true });
    mkdirSync(forkSessions, { recursive: true });
    const forked = SessionManager.forkFrom(sessionFile, forkCwd, forkSessions);
    expect(forked.getSessionId()).not.toBe(reopened.getSessionId());
    expect(compactionOf(forked.getEntries()).firstKeptEntryId).toBe("");
    expect(forked.buildSessionProjection().messages).toHaveLength(1);
    const forkUser = findUserTarget(forked.getEntries());
    if (!forkUser) throw new Error("the forked archive lost the first user");
    expect(forkUser.id).toBe(firstUserId);
    const forkStored = readStoredField(forked.getEntries(), "e:" + forkUser.id);
    expect(forkStored.ok && forkStored.field.text).toBe(TARGET_USER_TEXT);
    expect(readStoredField(forked.getEntries(), "e:not-in-this-file").ok).toBe(false);

    const forkProvider = await createProvider(forkRoot.agentDir);
    const forkSettings = SettingsManager.create(forkCwd, forkRoot.agentDir);
    const forkLoader = await createLoader({
      cwd: forkCwd,
      agentDir: forkRoot.agentDir,
      settingsManager: forkSettings,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const forkSession = await createSession({
      cwd: forkCwd,
      agentDir: forkRoot.agentDir,
      manager: forked,
      settingsManager: forkSettings,
      loader: forkLoader,
      provider: forkProvider,
    });
    forkProvider.faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall("context_index", {
          action: "read",
          ref: "e:" + firstUserId,
        }),
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("fork read complete"),
    ]);
    await forkSession.prompt("Read the earliest instruction in the fork.");
    expect(forkProvider.faux.state.callCount).toBe(2);
    const toolResult = findLatestToolResult(forked.getEntries());
    if (
      toolResult?.type !== "message" ||
      toolResult.message.role !== "toolResult"
    ) {
      throw new Error("context_index did not produce a tool result");
    }
    expect(toolResult.message.isError).toBe(false);
    expect(messageText(toolResult.message)).toContain(TARGET_USER_TEXT);
    expect(toolResult.message.details).toMatchObject({
      storageId: firstUserId,
      field: "/message/content",
    });
    expect(forkProvider.faux.state.callCount).toBe(2);

    // Details stay structural and bounded after the second compaction.
    const details = compactionOf(manager.getEntries()).details as CapsuleDetails;
    expect(details.firstKeptEntryId).toBe("");
    expect(JSON.stringify(details).length).toBeLessThan(12_000);
    expect(JSON.stringify(details)).not.toContain(TARGET_USER_TEXT);
  });
});
interface ToolCallResult {
  text: string;
  details: Record<string, unknown>;
  isError: boolean;
}

const callTool = async (
  env: {
    session: Harness["session"];
    provider: Harness["provider"];
    manager: SessionManager;
  },
  args: Parameters<typeof fauxToolCall>[1],
  prompt = "Use the context reader.",
): Promise<ToolCallResult> => {
  env.provider.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("context_index", args), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("reader turn complete"),
  ]);
  await env.session.prompt(prompt);
  const result = findLatestToolResult(env.manager.getEntries());
  if (result?.type !== "message" || result.message.role !== "toolResult") {
    throw new Error("context_index did not produce a tool result");
  }
  if (result.message.toolName !== "context_index") {
    throw new Error("expected a context_index tool result");
  }
  return {
    text: messageText(result.message),
    details: (result.message.details ?? {}) as Record<string, unknown>,
    isError: result.message.isError === true,
  };
};

describe("P4 lifecycle: restart, tree switch and context edits", () => {
  test("a restarted session rediscovers the archive and continues a list cursor", async () => {
    const harness = await createHarness();
    const userIds = appendHistory(harness.manager);
    for (let index = 0; index < 15; index++) {
      appendTurn(
        harness.manager,
        "restart history marker " + index,
        LONG_ASSISTANT_TEXT,
        Date.now() + 50_000 + index * 10_000,
      );
    }
    await harness.session.compact("keep:1");
    const listed = await callTool(harness, { action: "list" }, "List the archive.");
    expect(listed.isError).toBe(false);
    expect(listed.text).toContain("[context_index list");
    const cursor = listed.details.cursor;
    if (typeof cursor !== "string") throw new Error("missing list cursor");
    expect(listed.details.incomplete).toBe(true);

    const sessionFile = harness.manager.getSessionFile();
    if (!sessionFile) throw new Error("session file was not persisted");
    const reopened = SessionManager.open(sessionFile);
    const provider = await createProvider(harness.root.agentDir);
    const settingsManager = SettingsManager.create(
      harness.root.cwd,
      harness.root.agentDir,
    );
    const loader = await createLoader({
      cwd: harness.root.cwd,
      agentDir: harness.root.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const restarted = await createSession({
      cwd: harness.root.cwd,
      agentDir: harness.root.agentDir,
      manager: reopened,
      settingsManager,
      loader,
      provider,
    });

    // The old cursor still belongs to the same saved session, head and
    // watermark; it resumes the page after a full restart.
    const resumed = await callTool(
      { session: restarted, provider, manager: reopened },
      { action: "list", cursor },
      "Continue the old list cursor after restart.",
    );
    expect(resumed.isError).toBe(false);
    expect(resumed.text).toContain("[context_index list");
    expect(resumed.text).toContain("21-40/");

    const firstUser = userIds[0];
    if (!firstUser) throw new Error("missing first user");
    const read = await callTool(
      { session: restarted, provider, manager: reopened },
      { action: "read", ref: "e:" + firstUser },
      "Read the earliest instruction after restart.",
    );
    expect(read.isError).toBe(false);
    expect(read.text).toContain(TARGET_USER_TEXT);
    expect(read.details).toMatchObject({
      storageId: firstUser,
      field: "/message/content",
      effective: true,
    });
    const stored = readStoredField(reopened.getEntries(), "e:" + firstUser);
    expect(stored.ok && stored.field.text).toBe(TARGET_USER_TEXT);
  });

  test("a tree switch invalidates old cursors, keeps ids readable and rebuilds from the new branch", async () => {
    const harness = await createHarness();
    const userIds = appendHistory(harness.manager);
    const needleUsers: string[] = [];
    for (let index = 0; index < 12; index++) {
      const turn = appendTurn(
        harness.manager,
        "needle target " + index,
        "needle work log " + index,
        Date.now() - 20_000 + index * 1_000,
      );
      needleUsers.push(turn.userId);
    }
    await harness.session.compact("keep:1");

    const searched = await callTool(
      harness,
      { action: "search", query: "needle" },
      "Find the needle targets.",
    );
    expect(searched.isError).toBe(false);
    const cursor = searched.details.cursor;
    if (typeof cursor !== "string") throw new Error("missing search cursor");

    const third = userIds[2];
    if (!third) throw new Error("missing third user");
    const navigation = await harness.session.navigateTree(third);
    expect(navigation.cancelled).toBe(false);
    expect(navigation.editorText).toContain("Third instruction");

    // Build a new branch at the same leaf; the old branch (and its compaction)
    // remains in the append-only file.
    harness.provider.faux.setResponses([
      fauxAssistantMessage("new branch answer " + LONG_ASSISTANT_TEXT),
    ]);
    await harness.session.prompt("NEW BRANCH after the tree switch.");

    const staleCursor = await callTool(
      harness,
      { action: "search", cursor },
      "Try the old search cursor.",
    );
    expect(staleCursor.isError).toBe(true);
    expect(staleCursor.text).toContain("branch changed");

    const branchSearch = await callTool(
      harness,
      { action: "search", query: "needle target 11", match: "literal" },
      "Search the abandoned branch from the current branch.",
    );
    expect(branchSearch.isError).toBe(false);
    expect(branchSearch.text).toContain("no literal matches");

    const sessionSearch = await callTool(
      harness,
      {
        action: "search",
        query: "needle target 11",
        match: "literal",
        scope: "session",
      },
      "Search the abandoned branch in session scope.",
    );
    expect(sessionSearch.isError).toBe(false);
    expect(sessionSearch.text).not.toContain("no literal matches");
    expect(sessionSearch.text).toContain("needle target 11");

    const lastNeedle = needleUsers.at(-1);
    if (!lastNeedle) throw new Error("missing needle record");
    const offBranch = await callTool(
      harness,
      { action: "read", ref: "e:" + lastNeedle },
      "Read a record that is no longer on the current branch.",
    );
    expect(offBranch.isError).toBe(false);
    expect(offBranch.text).toContain("needle target 11");
    expect(offBranch.details).toMatchObject({
      onBranch: false,
      effective: false,
      excludedReason: "off-branch",
    });

    const missing = await callTool(
      harness,
      { action: "read", ref: "e:not-in-this-file" },
      "Read a record that never existed.",
    );
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("not in this session file");

    for (let index = 0; index < 6; index++) {
      appendTurn(
        harness.manager,
        "post-switch step " + index,
        LONG_ASSISTANT_TEXT,
        Date.now() + 200_000 + index * 10_000,
      );
    }
    const headBeforeCompact = harness.manager.getLeafId();
    const second = await harness.session.compact("keep:1");
    expect(second.summary).toContain(TARGET_USER_TEXT);
    expect(second.summary).not.toContain("needle target 11");
    const details = compactionOf(harness.manager.getEntries()).details as CapsuleDetails;
    expect(details.counts.outside).toBeGreaterThan(0);
    expect(details.sourceHeadId).toBe(headBeforeCompact);
  });

  test("a replacement edit in the summarized prefix is quoted from its storage entry", async () => {
    const harness = await createHarness();
    const userIds = appendHistory(harness.manager);
    const firstUser = userIds[0];
    if (!firstUser) throw new Error("missing first user");
    const editedText = "EDITED IN THE TAIL: the edit entry stores this text.";
    const editId = harness.manager.appendContextEdit(firstUser, {
      content: editedText,
    });
    const projection = harness.manager.buildSessionProjection();
    expect(
      projection.messages.some(
        (message) => message.role === "user" && message.content === editedText,
      ),
    ).toBe(true);

    const result = await harness.session.compact("keep:1");
    expect(result.summary).toContain(editedText);
    expect(result.summary).not.toContain(TARGET_USER_TEXT);
    const details = compactionOf(harness.manager.getEntries()).details as CapsuleDetails;
    const span = details.shown.find((candidate) => candidate.ownerId === firstUser);
    expect(span).toEqual({
      ownerId: firstUser,
      storageId: editId,
      field: "/replacement/content",
      start: 0,
      end: editedText.length,
    });

    const branch = harness.manager.getBranch();
    const editIndex = branch.findIndex((entry) => entry.id === editId);
    const liveStartIndex = branch.findIndex(
      (entry) => entry.id === result.firstKeptEntryId,
    );
    expect(editIndex).toBeGreaterThan(liveStartIndex);

    const original = await callTool(
      harness,
      { action: "read", ref: "e:" + firstUser },
      "Read the original stored message.",
    );
    expect(original.text).toContain(TARGET_USER_TEXT);
    const replacement = await callTool(
      harness,
      { action: "read", ref: "e:" + editId, field: "/replacement/content" },
      "Read the replacement storage field.",
    );
    expect(replacement.isError).toBe(false);
    expect(replacement.text).toContain(editedText);
    expect(replacement.details).toMatchObject({
      storageId: editId,
      field: "/replacement/content",
      effective: true,
    });
  });

  test("an omission edit removes candidates but keeps the original archive readable", async () => {
    const harness = await createHarness();
    const userIds = appendHistory(harness.manager);
    const secondUser = userIds[1];
    if (!secondUser) throw new Error("missing second user");
    const originalText =
      "Second instruction: quote stored text, never a model summary.";
    const editId = harness.manager.appendContextEdit(secondUser, null);
    const projection = harness.manager.buildSessionProjection();
    expect(
      projection.messages.some(
        (message) => message.role === "user" && message.content === originalText,
      ),
    ).toBe(false);

    const result = await harness.session.compact("keep:1");
    expect(result.summary).not.toContain("Second instruction");
    const details = compactionOf(harness.manager.getEntries()).details as CapsuleDetails;
    expect(details.shown.some((span) => span.ownerId === secondUser)).toBe(false);

    const readOriginal = await callTool(
      harness,
      { action: "read", ref: "e:" + secondUser },
      "Read the omitted original record.",
    );
    expect(readOriginal.isError).toBe(false);
    expect(readOriginal.text).toContain(originalText);
    expect(readOriginal.details).toMatchObject({
      effective: false,
      excludedReason: "edited",
    });

    const readEdit = await callTool(
      harness,
      { action: "read", ref: "e:" + editId },
      "Read the omission edit entry without a field.",
    );
    expect(readEdit.isError).toBe(true);
    expect(readEdit.text).toContain("no default text field");

    const branch = await callTool(
      harness,
      { action: "search", query: originalText, match: "literal" },
      "Search for omitted text on the branch.",
    );
    expect(branch.text).toContain("no literal matches");
    const session = await callTool(
      harness,
      {
        action: "search",
        query: originalText,
        match: "literal",
        scope: "session",
      },
      "Search for omitted text in session scope.",
    );
    expect(session.text).not.toContain("no literal matches");
    expect(session.text).toContain(originalText);
  });

  test("a checkpoint edit is not expressible through the host API but projects safely", async () => {
    const harness = await createHarness();
    const userIds = appendHistory(harness.manager);
    const firstUser = userIds[0];
    if (!firstUser) throw new Error("missing first user");
    const first = await harness.session.compact("keep:1");
    const checkpoint = compactionOf(harness.manager.getEntries());

    // Pi 1.4's appendContextEdit refuses a compaction target; the design's
    // checkpoint-edit path is kept for forward compatibility and exercised
    // here through a saved record that the real projection still reads.
    expect(() =>
      harness.manager.appendContextEdit(checkpoint.id, {
        content: "EDITED CHECKPOINT TEXT",
      }),
    ).toThrow(/does not contribute editable model content/);

    const sessionFile = harness.manager.getSessionFile();
    if (!sessionFile) throw new Error("session file was not persisted");
    const leaf = harness.manager.getLeafId();
    appendFileSync(
      sessionFile,
      JSON.stringify({
        type: "context_edit",
        id: "raw-checkpoint-edit",
        parentId: leaf,
        timestamp: new Date().toISOString(),
        targetId: checkpoint.id,
        replacement: { content: "EDITED CHECKPOINT TEXT" },
      }) + "\n",
    );
    const reopened = SessionManager.open(sessionFile);
    const rawEdit = reopened
      .getEntries()
      .find((entry) => entry.id === "raw-checkpoint-edit");
    expect(rawEdit?.type).toBe("context_edit");
    expect(reopened.getBranch().some((entry) => entry.id === "raw-checkpoint-edit")).toBe(
      true,
    );
    // Pi's projection applies an edit only to message roles; a compaction
    // summary keeps its stored text, while replacement:null would omit it.
    const rawProjection = reopened.buildSessionProjection();
    const projectedSummary = rawProjection.messages[0];
    expect(projectedSummary?.role).toBe("compactionSummary");
    if (projectedSummary?.role === "compactionSummary") {
      expect(projectedSummary.summary).toBe(first.summary);
    }

    const provider = await createProvider(harness.root.agentDir);
    const settingsManager = SettingsManager.create(
      harness.root.cwd,
      harness.root.agentDir,
    );
    const loader = await createLoader({
      cwd: harness.root.cwd,
      agentDir: harness.root.agentDir,
      settingsManager,
      additionalExtensionPaths: [EXTENSION_ENTRY],
    });
    const session = await createSession({
      cwd: harness.root.cwd,
      agentDir: harness.root.agentDir,
      manager: reopened,
      settingsManager,
      loader,
      provider,
    });
    for (let index = 0; index < 6; index++) {
      appendTurn(
        reopened,
        "post-checkpoint step " + index,
        "post-checkpoint work log " + index + "\n" + LONG_ASSISTANT_TEXT,
        Date.now() + 300_000 + index * 10_000,
      );
    }
    const second = await session.compact("keep:1");
    expect(second.summary).not.toContain(TARGET_USER_TEXT);
    expect(second.summary).toContain("post-checkpoint");
    const details = compactionOf(reopened.getEntries()).details as CapsuleDetails;
    expect(details.shown.some((span) => span.ownerId === firstUser)).toBe(false);

    const stored = await callTool(
      { session, provider, manager: reopened },
      { action: "read", ref: "e:" + firstUser },
      "Read the pre-checkpoint archive after the checkpoint edit.",
    );
    expect(stored.isError).toBe(false);
    expect(stored.text).toContain(TARGET_USER_TEXT);
  });
});
describe("P4 lifecycle: ten consecutive compactions", () => {
  test("early target, correction and old counts remain readable without summary calls", async () => {
    const harness = await createHarness();
    const firstText =
      "目标：EARLY-42 是早期验收编号。保留原始验收夹具，压缩时不要调用模型。";
    const correctionText =
      "更正：EARLY-42 已改为 LATE-77；旧的 3 pass / 2 fail 计数作废。";
    const firstUser = harness.manager.appendMessage({
      role: "user",
      content: firstText,
      timestamp: Date.now() - 200_000,
    });
    harness.manager.appendMessage(
      fauxAssistantMessage("initial plan " + LONG_ASSISTANT_TEXT),
    );
    const correction = appendTurn(
      harness.manager,
      correctionText,
      "correction acknowledged " + LONG_ASSISTANT_TEXT,
      Date.now() - 180_000,
    );
    const oldCount = appendTurn(
      harness.manager,
      "早期测试输出请保留：3 pass / 2 fail。",
      "old run: 3 pass / 2 fail\n" + LONG_ASSISTANT_TEXT,
      Date.now() - 160_000,
    );
    appendTurn(
      harness.manager,
      "近期工作：继续读取并实现。",
      "recent work log " + LONG_ASSISTANT_TEXT,
      Date.now() - 140_000,
    );

    const sizes: number[] = [];
    const summaries: string[] = [];
    for (let round = 1; round <= 10; round++) {
      const result = await harness.session.compact("keep:1");
      expect(harness.provider.faux.state.callCount).toBe(0);
      expect(result.summary).toContain("EARLY-42");
      expect(result.summary).toContain(firstText.slice(0, 12));
      expect(result.summary.split("[Context index v1").length - 1).toBe(1);
      const saved = compactionOf(harness.manager.getEntries());
      expect(saved.summary).toBe(result.summary);
      const details = saved.details as CapsuleDetails;
      expect(details.usedChars).toBe(result.summary.length);
      expect(
        details.counts.live + details.counts.quoted + details.counts.indexOnly,
      ).toBe(details.counts.effective);
      expect(JSON.stringify(details)).not.toContain("EARLY-42");
      sizes.push(JSON.stringify(details).length);
      summaries.push(result.summary);

      for (let step = 0; step < 6; step++) {
        appendTurn(
          harness.manager,
          "round " + round + " step " + step,
          "round " + round + " work " + step + "\n" + LONG_ASSISTANT_TEXT,
          Date.now() + round * 100_000 + step * 10_000,
        );
      }
    }

    expect(sizes).toHaveLength(10);
    const largest = sizes.reduce((max, size) => Math.max(max, size), 0);
    const smallest = sizes.reduce((min, size) => Math.min(min, size), Infinity);
    expect(largest).toBeLessThan(12_000);
    // Structural details grow only with small numeric fields, not with the
    // message array; a linear history would add hundreds of characters/round.
    expect(largest - smallest).toBeLessThan(2_000);

    const latest = summaries.at(-1);
    if (!latest) throw new Error("missing latest summary");
    expect(latest).toContain(firstText.slice(0, 40));
    expect(latest).toContain("EARLY-42");
    expect(latest).not.toContain(correctionText);

    const storedFirst = readStoredField(
      harness.manager.getEntries(),
      "e:" + firstUser,
    );
    expect(storedFirst.ok && storedFirst.field.text).toBe(firstText);

    const correctionRead = await callTool(
      harness,
      { action: "read", ref: "e:" + correction.userId },
      "Read the mid-history correction.",
    );
    expect(correctionRead.isError).toBe(false);
    expect(correctionRead.text).toContain("LATE-77");
    expect(correctionRead.details).toMatchObject({
      storageId: correction.userId,
      effective: true,
    });

    const countSearch = await callTool(
      harness,
      { action: "search", query: "3 pass / 2 fail", match: "literal" },
      "Find the old test count.",
    );
    expect(countSearch.isError).toBe(false);
    expect(countSearch.text).toContain("3 pass / 2 fail");
    expect(countSearch.text).toContain("e:" + oldCount.assistantId);
    const countRead = await callTool(
      harness,
      { action: "read", ref: "e:" + oldCount.assistantId },
      "Read the old test count from its stored field.",
    );
    expect(countRead.isError).toBe(false);
    expect(countRead.text).toContain("3 pass / 2 fail");

    // Ten compactions were one plugin path, zero provider calls, and never
    // consumed a previous capsule as source.
    expect(
      harness.manager.getEntries().filter((entry) => entry.type === "compaction"),
    ).toHaveLength(10);
    // Three post-compaction reader turns (tool call + final answer each);
    // every compaction itself stayed local.
    expect(harness.provider.faux.state.callCount).toBe(6);
  });
});
