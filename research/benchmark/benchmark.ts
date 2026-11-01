/**
 * Local-only benchmark for the 0.1.0 performance targets.
 *
 * Usage:
 *   bun research/benchmark/benchmark.ts [--turns 2500] [--out research/benchmark/out]
 *
 * The fixture is synthetic ASCII and never touches a real session or agent
 * directory. Output is written under research/benchmark/out/ (git-ignored).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { buildHookCapsule } from "../../src/host";
import { ReaderRunBudget } from "../../src/budget";
import {
  executeReader,
  readStoredField,
  type ReaderContext,
} from "../../src/reader";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

const argValue = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};

const TURNS = Number(argValue("--turns", "2500"));
const OUT_DIR = resolve(argValue("--out", "research/benchmark/out"));
const RESULT_CHARS = 18_100;
const RESULT_MARKER = (turn: number) => "synthetic-tail-marker-" + turn;

const fill = (prefix: string, target: number, unit = "synthetic filler 0123456789 abcdef "): string => {
  let text = prefix;
  while (text.length < target) text += unit;
  return text.slice(0, target);
};

const now = (): number => performance.now();

const timeSync = <T>(label: string, fn: () => T): { label: string; ms: number; value: T } => {
  const started = now();
  const value = fn();
  return { label, ms: now() - started, value };
};

const timeAsync = async <T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ label: string; ms: number; value: T }> => {
  const started = now();
  const value = await fn();
  return { label, ms: now() - started, value };
};

const buildManager = (): {
  manager: SessionManager;
  firstUserId: string;
  deepResultId: string;
  deepField: string;
  deepOffset: number;
  totalChars: number;
} => {
  const manager = SessionManager.inMemory(process.cwd());
  let firstUserId = "";
  let deepResultId = "";
  let deepField = "/message/content/0/text";
  let deepOffset = 0;
  let totalChars = 0;
  let clock = Date.now() - TURNS * 10_000;

  for (let turn = 0; turn < TURNS; turn++) {
    clock += 10_000;
    const userText = fill(
      "synthetic user turn " + turn + ": ",
      400,
    );
    const userId = manager.appendMessage({
      role: "user",
      content: userText,
      timestamp: clock,
    });
    if (turn === 0) firstUserId = userId;

    const call = fauxToolCall(
      "bash",
      { command: "synthetic-command-" + turn },
      { id: "call-" + turn },
    );
    manager.appendMessage(
      fauxAssistantMessage([call], {
        stopReason: "toolUse",
        timestamp: clock + 1,
      }),
    );
    const body =
      fill(
        "synthetic tool output " + turn + "\n",
        RESULT_CHARS - RESULT_MARKER(turn).length - 1,
      ) +
      RESULT_MARKER(turn) +
      "\n";
    const resultId = manager.appendMessage({
      role: "toolResult",
      toolCallId: call.id,
      toolName: "bash",
      content: [{ type: "text", text: body }],
      isError: false,
      timestamp: clock + 2,
    });
    if (turn === Math.floor(TURNS / 2)) {
      deepResultId = resultId;
      deepOffset = body.indexOf(RESULT_MARKER(turn));
    }
    const assistantText = fill(
      "synthetic work log " + turn + ": ",
      1_500,
    );
    manager.appendMessage(
      fauxAssistantMessage(assistantText, { timestamp: clock + 3 }),
    );
    totalChars += userText.length + body.length + assistantText.length;
  }
  return {
    manager,
    firstUserId,
    deepResultId,
    deepField,
    deepOffset,
    totalChars,
  };
};

const main = async (): Promise<void> => {
  const startedAt = new Date().toISOString();
  const built = buildManager();
  const { manager, deepResultId, deepField, deepOffset } = built;
  const entries = manager.getEntries();
  const contextWindow = 128_000;
  const ctx: ReaderContext = {
    sessionManager: manager,
    getContextUsage: () => ({ tokens: 50_000, contextWindow }),
    model: { contextWindow, maxTokens: 16_384 },
  };
  const event = {
    type: "session_before_compact",
    preparation: { tokensBefore: 50_000 },
    branchEntries: manager.getBranch(),
    reason: "manual",
    willRetry: false,
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof buildHookCapsule>[0];

  const capsule = timeSync("cold capsule", () =>
    buildHookCapsule(event, ctx as Parameters<typeof buildHookCapsule>[1], {
      viewMaxChars: 12_000,
      keepUserTurns: 1,
      runReadMaxChars: 48_000,
    }),
  );
  const searchBudget = new ReaderRunBudget(48_000, 8);
  const query = "synthetic-tail-marker-" + Math.floor(TURNS / 2);
  const coldSearch = await timeAsync("cold search", () =>
    executeReader(
      { action: "search", query, match: "terms" },
      ctx,
      searchBudget,
      new AbortController().signal,
    ),
  );
  // A fresh equal ledger isolates ranking bytes from run-remaining footer
  // digits; the hit ordering and snippets must be identical to the cold call.
  const hotSearch = await timeAsync("hot search", () =>
    executeReader(
      { action: "search", query, match: "terms" },
      ctx,
      new ReaderRunBudget(48_000, 8),
      new AbortController().signal,
    ),
  );
  const hotList = await timeAsync("hot list", () =>
    executeReader({ action: "list" }, ctx, searchBudget, new AbortController().signal),
  );
  const hotRead = await timeAsync("hot read", () =>
    executeReader(
      {
        action: "read",
        ref: "e:" + deepResultId,
        field: deepField,
        offset: deepOffset,
        length: 200,
      },
      ctx,
      searchBudget,
      new AbortController().signal,
    ),
  );
  const hotCapsule = timeSync("hot capsule", () =>
    buildHookCapsule(event, ctx as Parameters<typeof buildHookCapsule>[1], {
      viewMaxChars: 12_000,
      keepUserTurns: 1,
      runReadMaxChars: 48_000,
    }),
  );

  const stored = readStoredField(entries, "e:" + deepResultId, deepField);
  const readTextOK = hotRead.value.content[0]?.text.includes(
    "synthetic-tail-marker-" + Math.floor(TURNS / 2),
  ) ?? false;
  const summary = capsule.value.summary;
  const result = {
    startedAt,
    runtime: "bun " + Bun.version + " / " + process.platform,
    fixture: {
      turns: TURNS,
      messages: entries.filter((entry) => entry.type === "message").length,
      chars: built.totalChars,
      approxMiB: +(built.totalChars / 1024 / 1024).toFixed(2),
      contextWindow,
      capsuleCapChars: capsule.value.details.recipe.budgetChars,
    },
    timingsMs: {
      coldCapsule: capsule.ms,
      coldSearch: coldSearch.ms,
      hotSearch: hotSearch.ms,
      hotList: hotList.ms,
      hotRead: hotRead.ms,
      hotCapsule: hotCapsule.ms,
    },
    checks: {
      summaryChars: summary.length,
      summaryHasFirstUser: summary.includes("synthetic user turn 0"),
      capsuleTableRows: capsule.value.details.shown.length,
      coldSearchError: coldSearch.value.isError === true,
      hotSearchError: hotSearch.value.isError === true,
      hotListError: hotList.value.isError === true,
      hotReadError: hotRead.value.isError === true,
      storedFieldChars: stored.ok ? stored.field.text.length : -1,
      hotReadExposesMarker: readTextOK,
      coldHotSearchSameBytes:
        coldSearch.value.content[0]?.text === hotSearch.value.content[0]?.text,
      coldHotCapsuleSameBytes:
        capsule.value.summary === hotCapsule.value.summary &&
        JSON.stringify(capsule.value.details) ===
          JSON.stringify(hotCapsule.value.details),
    },
    targets: {
      coldCapsuleMs: 2_000,
      hotQueryMs: 200,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const outFile = join(OUT_DIR, "benchmark-" + stamp + ".json");
  writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ outFile: dirname(outFile) + "/" + outFile.split(/[\\/]/).at(-1), ...result }, null, 2));
};

await main();
