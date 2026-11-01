import { describe, expect, test } from "bun:test";
import { buildCapsule } from "../src/render";
import { captureSource, projectHistory, SELF_ECHO_BEGIN, SELF_ECHO_END } from "../src/source";
import { resolveStoredField } from "../src/reader";
import { capsuleCap } from "../src/budget";
import { fenceStateAtEnd, isClosingFence, parseFenceLine } from "../src/fences";
import { chain, fakeManager } from "./fixtures/entries";
import type { Cut } from "../src/cut";
import type { CapsuleDetails } from "../src/model";

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const FENCE = String.fromCharCode(96).repeat(3);
const COMBINING = "e" + String.fromCharCode(0x301);

const manualCut = (snapshot: ReturnType<typeof captureSource>, id: string, keep = 1): Cut => ({
  firstKeptEntryId: id,
  cutIndex: snapshot.branchIndex.get(id) ?? snapshot.branch.length,
  reason: "keep-turns",
  requestedKeep: keep,
  keptUserTurns: 1,
  totalUserTurns: 4,
  tailTokens: 0,
  tailTokenLimit: 16_000,
});

const FIRST_USER = [
  "Goal: build a local continuation capsule for the coding agent.",
  "",
  "## Requirements",
  "It must be deterministic and never call a model. Preserve exact source spans and native entry ids.",
  "Version target is 0.1.0 and acceptance needs 42 pass / 0 fail.",
  "",
  "## Long appendix",
  "x".repeat(6_000),
  "",
  "## Correction",
  "Earlier I said 12k chars; the real cap is 2400 at the narrow end.",
].join(NL);

const LONG_ASSISTANT = [
  "## Work log",
  "Implemented the source snapshot and the field iterator. The first pass uses a shadow compaction projection.",
  "",
  "Next: wire the allocator and verify the 2400 budget.",
  "",
  "y".repeat(2_500),
].join(NL);

const ERROR_TEXT = "ENOENT: cannot read src/missing.ts" + NL + "no such file or directory";

const fixture = () => {
  const b = chain();
  b.user("u1", FIRST_USER);
  b.assistant("a1", LONG_ASSISTANT);
  b.user("u2", "Correction: keep the live tail and quote the edited replacement, not the original.");
  b.assistant("a2", [
    { type: "toolCall", id: "call-read", name: "read", arguments: { path: "src/missing.ts" } },
  ]);
  b.toolResult("r2", {
    toolCallId: "call-read",
    toolName: "read",
    isError: true,
    text: ERROR_TEXT,
  });
  b.user("u3", "验收😀" + COMBINING + CR + NL + "第二行：保留原始 CRLF。");
  b.assistant("a3", [
    { type: "toolCall", id: "call-bash", name: "bash", arguments: { command: "bun test tests/reader.test.ts" } },
  ]);
  b.toolResult("r1", {
    toolCallId: "call-bash",
    toolName: "bash",
    text: "bun test tests/reader.test.ts" + NL + "42 pass / 0 fail" + NL,
  });
  b.user("u4", FENCE + "ts" + NL + "const fence = true;" + NL + FENCE + NL + "Keep the fence closed when a cut splits it.");
  b.assistant("a4", "The fence-aware renderer is in place." + NL + FENCE + "js" + NL + "console.log('kept');");
  b.user("u5", "LIVE TAIL: continue from the capsule. This sentence must not be quoted again.");
  const snapshot = captureSource(fakeManager(b.entries));
  const history = projectHistory(snapshot, manualCut(snapshot, "u5"));
  return { b, snapshot, history };
};

const built = (window: number, viewMaxChars = 12_000) => {
  const { history, snapshot } = fixture();
  const capsule = buildCapsule({
    history,
    config: { viewMaxChars, keepUserTurns: 1 },
    contextWindow: window,
  });
  return { capsule, history, snapshot };
};

const assertCounts = (details: CapsuleDetails): void => {
  expect(details.counts.live + details.counts.quoted + details.counts.indexOnly).toBe(
    details.counts.effective,
  );
  expect(details.counts.quoted).toBeGreaterThan(0);
};

const assertMarkersOutsideFences = (text: string): void => {
  let open: ReturnType<typeof parseFenceLine> = null;
  for (const line of text.split(NL)) {
    if (line.includes("省略") && open) {
      throw new Error("omission marker inside a code fence: " + line);
    }
    const fence = parseFenceLine(line);
    if (!fence) continue;
    if (!open) open = fence;
    else if (isClosingFence(open, fence)) open = null;
  }
};

describe("buildCapsule", () => {
  test("respects the 2,400 / 7,680 / 12,000 caps and keeps every minimum", () => {
    const cases: Array<{ window: number; cap: number }> = [
      { window: 32_768, cap: 2_400 },
      { window: 128_000, cap: 7_680 },
      { window: 200_000, cap: 12_000 },
    ];
    for (const { window, cap } of cases) {
      const { capsule, history } = built(window);
      expect(capsule.budgetChars).toBe(cap);
      expect(capsule.details.recipe.budgetChars).toBe(cap);
      expect(capsule.text.length).toBeLessThanOrEqual(cap);
      expect(capsule.details.usedChars).toBe(capsule.text.length);
      expect(capsule.text).toContain("snapshot=" + capsule.details.snapshotId);

      // U minima: first user and the three most recent non-live users.
      for (const id of ["u1", "u2", "u3", "u4"]) {
        expect(capsule.text).toContain("U e:" + id);
      }
      // W minimum: the newest non-live assistant text.
      expect(capsule.text).toContain("A e:a4");
      // W minimum: the newest error result.
      expect(capsule.text).toContain("R e:r2");
      assertCounts(capsule.details);
      assertMarkersOutsideFences(capsule.text);
      expect(fenceStateAtEnd(capsule.text)).toBeNull();

      // Live records are never quoted.
      const liveIds = new Set(history.live.map((record) => record.info.id));
      for (const span of capsule.details.shown) {
        expect(liveIds.has(span.ownerId)).toBe(false);
        expect(span.end).toBeGreaterThan(span.start);
        const stored = resolveStoredField(
          { byId: history.snapshot.byId },
          "e:" + span.storageId,
          span.field,
        );
        expect(stored.ok).toBe(true);
        if (stored.ok) {
          expect(stored.field.text.slice(span.start, span.end).length).toBe(
            span.end - span.start,
          );
        }
      }
    }
  });

  test("a short session stops far below the cap", () => {
    const b = chain();
    b.user("u1", "Short request.");
    b.assistant("a1", "Short answer.");
    b.user("u2", "Live follow-up.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u2"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });
    expect(capsule.budgetChars).toBe(12_000);
    expect(capsule.text.length).toBeLessThan(1_200);
    expect(capsule.text).toContain("U e:u1");
    expect(capsule.text).not.toContain("Live follow-up.");
    expect(capsule.details.counts.quoted).toBe(2);
  });

  test("the long user field keeps both edges and exact Unicode", () => {
    const { capsule, snapshot } = built(32_768);
    const spans = capsule.details.shown.filter((span) => span.ownerId === "u1");
    expect(spans.length).toBeGreaterThan(1);
    const total = spans.reduce((sum, span) => sum + span.end - span.start, 0);
    expect(total).toBeGreaterThanOrEqual(160);
    expect(total).toBeLessThan(FIRST_USER.length);
    expect(capsule.text).toContain(
      "U e:u1 | partial " + total + "/" + FIRST_USER.length + " | field=/message/content",
    );
    // Both the first paragraph and the correction at the end are present.
    expect(capsule.text).toContain("Goal: build a local continuation capsule");
    expect(capsule.text).toContain("Earlier I said 12k chars");
    expect(capsule.text).toContain("## Correction");
    expect(capsule.text).toContain("长文 e:u1");

    // Every stored span reads back byte-for-byte from its address.
    for (const span of spans) {
      const stored = resolveStoredField(
        { byId: snapshot.byId },
        "e:" + span.storageId,
        span.field,
      );
      expect(stored.ok).toBe(true);
    }

    // Unicode: no split surrogate at any span boundary.
    const boundaries = new Set<number>();
    for (const span of spans) {
      boundaries.add(span.start);
      boundaries.add(span.end);
    }
    for (const boundary of boundaries) {
      const before = FIRST_USER.charCodeAt(boundary - 1);
      const at = FIRST_USER.charCodeAt(boundary);
      expect(before >= 0xd800 && before <= 0xdbff).toBe(false);
      expect(at >= 0xdc00 && at <= 0xdfff).toBe(false);
    }
  });

  test("counts and fences render exactly once with source addresses", () => {
    const { capsule } = built(200_000);
    const reported = capsule.text.match(/reported: 42 pass \/ 0 fail/g) ?? [];
    expect(reported).toHaveLength(1);
    expect(capsule.text).toContain("R e:r1 | bun test tests/reader.test.ts | reported: 42 pass / 0 fail");
    expect(capsule.text).toContain("[操作与历史入口]");
    expect(capsule.text).toContain("command bun test tests/reader.test.ts x1 | call=e:a3 result=e:r1");
    expect(capsule.text).not.toContain("LIVE TAIL");
  });

  test("is deterministic and the snapshot id changes with shown spans", () => {
    const first = built(128_000).capsule;
    const second = built(128_000).capsule;
    expect(second.text).toBe(first.text);
    expect(second.details.snapshotId).toBe(first.details.snapshotId);

    const narrow = built(32_768).capsule;
    expect(narrow.details.snapshotId).not.toBe(first.details.snapshotId);
  });
});

describe("codemode and nested observations", () => {
  test("drops self-echo ranges, reports omitted arguments and keeps nested refs", () => {
    const b = chain();
    b.user("u1", "Run the codemode script and keep the aggregate output.");
    b.assistant("a1", [
      {
        type: "toolCall",
        id: "call-code",
        name: "codemode",
        arguments: { code: "await tools.write({path:'src/x.ts',content:'x'}); return 'ECHOED_READ_SHOULD_NOT_APPEAR'" },
      },
    ]);
    b.toolResult("r3", {
      toolCallId: "call-code",
      toolName: "codemode",
      text:
        "aggregate output" +
        NL +
        SELF_ECHO_BEGIN +
        NL +
        "ECHOED_READ_SHOULD_NOT_APPEAR" +
        NL +
        SELF_ECHO_END +
        NL +
        "42 pass / 0 fail",
      nestedCalls: {
        complete: false,
        calls: [
          { id: "n1", name: "write", argumentsBytes: 20_031, status: "ok" },
          {
            id: "n2",
            name: "edit",
            arguments: { path: "src/reader.ts" },
            status: "error",
            error: "EACCES: denied",
          },
        ],
      },
    });
    b.user("u2", "Live continuation.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u2"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });

    expect(capsule.text).not.toContain("ECHOED_READ_SHOULD_NOT_APPEAR");
    expect(capsule.text).toContain("R e:r3 | codemode | reported: 42 pass / 0 fail");
    expect(capsule.text).toContain("EACCES: denied");
    expect(capsule.text).toContain("write 参数已省略（20031 字节） x1 | call=e:r3#0 result=e:r3");
    expect(capsule.text).toContain("edit src/reader.ts x1 (error) | call=e:r3#1 result=e:r3");
    expect(capsule.details.observations).toEqual(
      expect.arrayContaining([
        { callId: "n1", resultId: "r3", nestedIndex: 0 },
        { callId: "n2", resultId: "r3", nestedIndex: 1 },
      ]),
    );
    expect(capsule.details.shown.every((span) => !span.field.includes("/details"))).toBe(true);
  });
});

describe("selection depth and related history", () => {
  test("picks an older user message by query relevance", () => {
    const b = chain();
    b.user("u1", "Initial build instructions.");
    b.user("u2", "Older note: the zeta allocator invariant must stay monotonic.");
    b.assistant("a2", "Recorded.");
    b.user("u3", "Third request without the special term.");
    b.assistant("a3", "Working.");
    b.user("u4", "Fourth request.");
    b.assistant("a4", "Working.");
    b.user("u5", "Please reconcile the zeta allocator invariant with the live design.");
    b.user("u6", "Live turn.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u6"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });
    expect(capsule.text).toContain("U e:u2");
    expect(capsule.text).toContain("zeta allocator invariant must stay monotonic");
  });

  test("a long newest assistant text deepens toward 4,000 chars with both edges", () => {
    const b = chain();
    b.user("u1", "Start the work.");
    const longText =
      "## Work log" +
      NL +
      "A".repeat(2_000) +
      NL +
      "middle detail " +
      "B".repeat(2_000) +
      NL +
      "## Final note" +
      NL +
      "C".repeat(1_500);
    b.assistant("a1", longText);
    b.user("u2", "Live turn.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u2"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });
    const spans = capsule.details.shown.filter((span) => span.ownerId === "a1");
    const shown = spans.reduce((sum, span) => sum + span.end - span.start, 0);
    expect(shown).toBeGreaterThan(3_000);
    expect(shown).toBeLessThanOrEqual(4_000);
    expect(capsule.text).toContain("A e:a1 | partial " + shown + "/" + longText.length);
    expect(capsule.text).toContain("## Work log");
    expect(capsule.text).toContain("C".repeat(100));
  });

  test("a long code fence is closed before every structural marker", () => {
    const b = chain();
    b.user("u1", "Intro before the code.");
    const code = Array.from({ length: 120 }, (_, index) => "const value" + index + " = " + index + ";").join(NL);
    b.user("u2", "Context:" + NL + NL + FENCE + "ts" + NL + code + NL + FENCE + NL + "Tail after the fence.");
    b.user("u3", "Live turn.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u3"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });
    expect(capsule.text).toContain(FENCE + "ts");
    assertMarkersOutsideFences(capsule.text);
    expect(fenceStateAtEnd(capsule.text)).toBeNull();
  });

  test("merges repeated nested operations into one counted row", () => {
    const b = chain();
    b.user("u1", "Edit the same file three times.");
    b.assistant("a1", [
      {
        type: "toolCall",
        id: "call-code",
        name: "codemode",
        arguments: { code: "three edits" },
      },
    ]);
    b.toolResult("r1", {
      toolCallId: "call-code",
      toolName: "codemode",
      text: "done",
      nestedCalls: {
        complete: true,
        calls: [
          { id: "n1", name: "edit", arguments: { path: "src/x.ts" }, status: "ok" },
          { id: "n2", name: "edit", arguments: { path: "src/x.ts" }, status: "ok" },
          { id: "n3", name: "edit", arguments: { path: "src/x.ts" }, status: "ok" },
        ],
      },
    });
    b.user("u2", "Live turn.");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, manualCut(snapshot, "u2"));
    const capsule = buildCapsule({
      history,
      config: { viewMaxChars: 12_000, keepUserTurns: 1 },
      contextWindow: 200_000,
    });
    const rows = capsule.text.match(/^edit src\/x\.ts x3 \| call=e:r1#(\d) result=e:r1$/gm) ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain("#2");
  });
});
