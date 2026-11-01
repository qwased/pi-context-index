import { afterEach, describe, expect, test } from "bun:test";
import {
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type { CapsuleDetails } from "../src/model";
import { ReaderRunBudget } from "../src/budget";
import {
  executeReader,
  readStoredField,
  type ReaderContext,
  type ReaderToolResult,
} from "../src/reader";
import {
  cleanupHostState,
  createLoader,
  createProvider,
  createRoot,
  createSession,
  EXTENSION_ENTRY,
  LONG_ASSISTANT_TEXT,
} from "./helpers/host";

afterEach(cleanupHostState);

const fillTo = (prefix: string, target: number): string => {
  const unit = "合成填充 0123456789 abcdef\n";
  let text = prefix;
  while (text.length < target) text += unit;
  return text.slice(0, target);
};

const toolResultMessage = (input: {
  toolCallId: string;
  toolName: string;
  text: string;
  isError?: boolean;
  timestamp: number;
}) => ({
  role: "toolResult" as const,
  toolCallId: input.toolCallId,
  toolName: input.toolName,
  content: [{ type: "text" as const, text: input.text }],
  isError: input.isError ?? false,
  timestamp: input.timestamp,
});

interface Question {
  id: number;
  question: string;
  marker: string;
  owner: string;
  field: string;
  offset: number;
  requiredChannel?: "capsule" | "search";
}

interface Hit {
  channel: "capsule" | "search";
  start: number;
  end: number;
}

describe("P4 fixed 12-question synthetic exposure", () => {
  test("each answer is exposed by a real capsule span or a search+read range", async () => {
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
    let clock = Date.now() - 1_000_000;
    const next = (): number => (clock += 1_000);

    const appendUser = (text: string): string =>
      manager.appendMessage({ role: "user", content: text, timestamp: next() });
    const appendAssistant = (text: string): string =>
      manager.appendMessage(
        fauxAssistantMessage(text, { timestamp: next() }),
      );
    const appendCall = (
      name: string,
      args: Parameters<typeof fauxToolCall>[1],
      text?: string,
    ): { assistantId: string; callId: string } => {
      const call = fauxToolCall(name, args, { id: "call-" + next() });
      const content = text
        ? [{ type: "text" as const, text }, call]
        : [call];
      const assistantId = manager.appendMessage(
        fauxAssistantMessage(content, {
          stopReason: "toolUse",
          timestamp: next(),
        }),
      );
      return { assistantId, callId: call.id };
    };
    const appendResult = (
      call: { assistantId: string; callId: string },
      toolName: string,
      text: string,
      isError = false,
    ): string =>
      manager.appendMessage(
        toolResultMessage({
          toolCallId: call.callId,
          toolName,
          text,
          isError,
          timestamp: next(),
        }),
      );

    const goalText = "目标开始：Q1-TARGET-100 是本次验收编号。保留原文，不要调用模型。";
    const constraintText = "约束原文：Q2-CONSTRAINT-NO-MODEL；只能本地确定性处理。";
    const correctionText =
      "更正：早期计数 3 作废，改为 Q3-COUNT-7；旧编号仍然有效。";
    const targetText = "输出目标：fixt/path/beta.ts，目标版本 Q4-TARGET-VERSION-9.0。";
    const u1 = appendUser(goalText);
    appendAssistant("A1 initial plan " + LONG_ASSISTANT_TEXT);
    const u2 = appendUser(constraintText);
    appendAssistant("A2 constraints recorded " + LONG_ASSISTANT_TEXT);
    const oldErrorCall = appendCall("bash", {
      command: "synthetic-old-check",
    });
    const t0 = appendResult(
      oldErrorCall,
      "bash",
      "Q9-HIST-ERROR: old synthetic check failed with code 2",
      true,
    );
    const u3 = appendUser(correctionText);
    appendAssistant("A3 correction recorded " + LONG_ASSISTANT_TEXT);
    const u4 = appendUser(targetText);
    const writeCall = appendCall(
      "write",
      { path: "fixt/path/Q10-ALPHA.ts", content: "synthetic write body" },
      "A4 writing the synthetic fixture",
    );
    appendResult(writeCall, "write", "written 1 file");
    const u5 = appendUser("近期：检查深输出中的版本。");
    appendAssistant("A5 checking the deep output " + LONG_ASSISTANT_TEXT);
    const readCall = appendCall("read", {
      path: "fixt/path/Q10-ALPHA.ts",
    });
    const deepOutput =
      fillTo("synthetic deep output\n", 20_900) +
      "Q8-VERSION-7.4.2\n";
    const t1 = appendResult(readCall, "read", deepOutput);
    const u6 = appendUser("最近的错误是什么？");
    appendAssistant("A6 recording the latest error " + LONG_ASSISTANT_TEXT);
    const errorCall = appendCall("bash", { command: "synthetic-latest" });
    const t2 = appendResult(
      errorCall,
      "bash",
      "Q6-LATEST-ERROR: synthetic latest failure with exit code 1",
      true,
    );
    const u7 = appendUser("把测试计数贴出来。");
    appendAssistant("A7 recording the count " + LONG_ASSISTANT_TEXT);
    const countCall = appendCall("bash", { command: "synthetic-tests" });
    const t3 = appendResult(
      countCall,
      "bash",
      "Q7-COUNT-7-PASS / 1 fail; synthetic test run",
    );
    const long15k =
      fillTo("15K-FIELD-HEADER\n", 9_000) +
      "Q11-SECOND-WINDOW-MARK\n" +
      fillTo("", 6_000);
    const u8 = appendUser(long15k);
    const a8 = appendAssistant(
      "Q5-RECENT-WORK: the newest assistant work log. " + LONG_ASSISTANT_TEXT,
    );
    const long37k =
      fillTo("37K-FIELD-HEADER\n", 31_000) +
      "Q12-DEEP-MARK\n" +
      fillTo("", 6_000);
    const u9 = appendUser(long37k);
    const a9 = appendAssistant("A9 final live answer " + LONG_ASSISTANT_TEXT);

    const session = await createSession({
      cwd: root.cwd,
      agentDir: root.agentDir,
      manager,
      settingsManager,
      loader,
      provider,
    });
    const compacted = await session.compact("keep:1");
    expect(provider.faux.state.callCount).toBe(0);
    const saved = manager
      .getEntries()
      .filter((entry) => entry.type === "compaction")
      .at(-1);
    if (saved?.type !== "compaction") throw new Error("missing compaction");
    const details = saved.details as CapsuleDetails;
    expect(compacted.summary.length).toBe(details.usedChars);
    expect(saved.summary).toBe(compacted.summary);

    const ctx: ReaderContext = {
      sessionManager: manager,
      getContextUsage: () => ({ tokens: 2_000, contextWindow: 128_000 }),
      model: { contextWindow: 128_000, maxTokens: 16_384 },
    };
    const resultText = (result: ReaderToolResult): string =>
      result.content.map((part) => part.text).join("\n");

    const questions: Question[] = [
      {
        id: 1,
        question: "最初的目标和验收编号是什么？",
        marker: "Q1-TARGET-100",
        owner: u1,
        field: "/message/content",
        offset: goalText.indexOf("Q1-TARGET-100"),
        requiredChannel: "capsule",
      },
      {
        id: 2,
        question: "不调用模型的约束原文是什么？",
        marker: "Q2-CONSTRAINT-NO-MODEL",
        owner: u2,
        field: "/message/content",
        offset: constraintText.indexOf("Q2-CONSTRAINT-NO-MODEL"),
      },
      {
        id: 3,
        question: "计数更正成了什么？",
        marker: "Q3-COUNT-7",
        owner: u3,
        field: "/message/content",
        offset: correctionText.indexOf("Q3-COUNT-7"),
      },
      {
        id: 4,
        question: "输出目标和目标版本是什么？",
        marker: "Q4-TARGET-VERSION-9.0",
        owner: u4,
        field: "/message/content",
        offset: targetText.indexOf("Q4-TARGET-VERSION-9.0"),
      },
      {
        id: 5,
        question: "最近的工作说明是什么？",
        marker: "Q5-RECENT-WORK",
        owner: a8,
        field: "/message/content/0/text",
        offset: 0,
        requiredChannel: "capsule",
      },
      {
        id: 6,
        question: "最新的错误原文是什么？",
        marker: "Q6-LATEST-ERROR",
        owner: t2,
        field: "/message/content/0/text",
        offset: 0,
      },
      {
        id: 7,
        question: "最新命令的测试计数是多少？",
        marker: "Q7-COUNT-7-PASS",
        owner: t3,
        field: "/message/content/0/text",
        offset: 0,
      },
      {
        id: 8,
        question: "深输出末尾的版本号是多少？",
        marker: "Q8-VERSION-7.4.2",
        owner: t1,
        field: "/message/content/0/text",
        offset: deepOutput.indexOf("Q8-VERSION-7.4.2"),
        requiredChannel: "search",
      },
      {
        id: 9,
        question: "早先的合成错误原文是什么？",
        marker: "Q9-HIST-ERROR",
        owner: t0,
        field: "/message/content/0/text",
        offset: 0,
        requiredChannel: "search",
      },
      {
        id: 10,
        question: "写入请求里的合成文件路径是什么？",
        marker: "Q10-ALPHA.ts",
        owner: writeCall.assistantId,
        field: "/message/content/1/arguments/path",
        offset: "fixt/path/Q10-ALPHA.ts".indexOf("Q10-ALPHA.ts"),
        requiredChannel: "search",
      },
      {
        id: 11,
        question: "15K 字段第二窗口的标记是什么？",
        marker: "Q11-SECOND-WINDOW-MARK",
        owner: u8,
        field: "/message/content",
        offset: long15k.indexOf("Q11-SECOND-WINDOW-MARK"),
        requiredChannel: "search",
      },
      {
        id: 12,
        question: "37K 字段深段的标记是什么？",
        marker: "Q12-DEEP-MARK",
        owner: u9,
        field: "/message/content",
        offset: long37k.indexOf("Q12-DEEP-MARK"),
        requiredChannel: "search",
      },
    ];

    const entries = manager.getEntries();
    const fieldText = (owner: string, field: string): string | undefined => {
      const stored = readStoredField(entries, "e:" + owner, field);
      return stored.ok ? stored.field.text : undefined;
    };
    const capsuleHit = (question: Question): Hit | undefined => {
      for (const span of details.shown) {
        if (span.ownerId !== question.owner) continue;
        const text = fieldText(span.storageId, span.field);
        if (!text) continue;
        if (
          text.slice(span.start, span.end).includes(question.marker) &&
          span.start <= question.offset &&
          span.end > question.offset
        ) {
          return { channel: "capsule", start: span.start, end: span.end };
        }
      }
      return undefined;
    };
    const searchAndRead = async (
      question: Question,
    ): Promise<Hit | undefined> => {
      const budget = new ReaderRunBudget(48_000, 8);
      const searched = await executeReader(
        { action: "search", query: question.marker, match: "literal" },
        ctx,
        budget,
      );
      if (searched.isError) return undefined;
      const text = resultText(searched);
      const escapeRegex = (value: string): string =>
        value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const line = new RegExp(
        "e:" +
          escapeRegex(question.owner) +
          "[^\\n]*\\| field=" +
          escapeRegex(question.field) +
          " \\| @(\\d+)-(\\d+)",
      ).exec(text);
      if (!line) return undefined;
      const start = Number(line[1]);
      const end = Number(line[2]);
      if (!(start <= question.offset && end > question.offset)) return undefined;
      const fieldLength = fieldText(question.owner, question.field)?.length ?? 0;
      const readLength = Math.max(
        1,
        Math.min(200, fieldLength - start),
      );
      const read = await executeReader(
        {
          action: "read",
          ref: "e:" + question.owner,
          field: question.field,
          offset: start,
          length: readLength,
        },
        ctx,
        budget,
      );
      if (read.isError) return undefined;
      const readDetails = read.details;
      if (
        typeof readDetails.start !== "number" ||
        typeof readDetails.end !== "number" ||
        !(readDetails.start <= question.offset && readDetails.end > question.offset)
      ) {
        return undefined;
      }
      if (!resultText(read).includes(question.marker)) return undefined;
      return { channel: "search", start, end };
    };

    const channels: Array<{ id: number; channel: string; start: number; end: number }> = [];
    for (const question of questions) {
      let hit = capsuleHit(question);
      if (!hit) hit = await searchAndRead(question);
      if (!hit) {
        throw new Error(
          "question " +
            question.id +
            " did not expose " +
            question.marker +
            " from e:" +
            question.owner +
            " " +
            question.field,
        );
      }
      if (question.requiredChannel && hit.channel !== question.requiredChannel) {
        throw new Error(
          "question " +
            question.id +
            " expected " +
            question.requiredChannel +
            " but used " +
            hit.channel,
        );
      }
      channels.push({
        id: question.id,
        channel: hit.channel,
        start: hit.start,
        end: hit.end,
      });
    }

    expect(channels).toHaveLength(12);
    expect(channels.filter((entry) => entry.channel === "capsule").length).toBeGreaterThanOrEqual(4);
    expect(channels.filter((entry) => entry.channel === "search").length).toBeGreaterThanOrEqual(3);
    expect(channels[0]?.channel).toBe("capsule");
    expect(channels[10]?.channel).toBe("search");
    expect(channels[11]?.channel).toBe("search");
    // Long-field answers are only exposed by real offsets in their own fields.
    expect(channels[10]?.start).toBeLessThan(9_000 + 100);
    expect(channels[10]?.end).toBeGreaterThan(9_000);
    expect(channels[11]?.start).toBeLessThan(31_000 + 100);
    expect(channels[11]?.end).toBeGreaterThan(31_000);
    expect(channels.map((entry) => entry.channel)).toEqual([
      "capsule",
      "search",
      "search",
      "search",
      "capsule",
      "capsule",
      "capsule",
      "search",
      "search",
      "search",
      "search",
      "search",
    ]);
  });
});
