import { describe, expect, test } from "bun:test";
import {
  chooseCut,
  isValidTailBoundary,
  liveWindowStartIndex,
  parseCompactionInstructions,
} from "../src/cut";
import { captureSource, type SourceSnapshot } from "../src/source";
import {
  assistantEntry,
  chain,
  compactionEntry,
  customMessageEntry,
  fakeManager,
  systemEntry,
  toolResultEntry,
  userEntry,
} from "./fixtures/entries";

const snapshotOf = (
  entries: Parameters<typeof fakeManager>[0],
  leafId?: string | null,
): SourceSnapshot => captureSource(fakeManager(entries, leafId === undefined ? {} : { leafId }));

const W = 128_000;

describe("parseCompactionInstructions", () => {
  test("extracts keep:N and keeps the rest as query material", () => {
    expect(parseCompactionInstructions(undefined)).toEqual({ instructions: "" });
    expect(parseCompactionInstructions("focus on tests")).toEqual({
      instructions: "focus on tests",
    });
    expect(parseCompactionInstructions("keep:3 focus on tests")).toEqual({
      keep: 3,
      instructions: "focus on tests",
    });
    expect(parseCompactionInstructions("  keep:0  ")).toEqual({
      keep: 0,
      instructions: "",
    });
    expect(parseCompactionInstructions("keep:2, please")).toEqual({
      instructions: "keep:2, please",
    });
    expect(parseCompactionInstructions("keep:abc")).toEqual({
      instructions: "keep:abc",
    });
    expect(parseCompactionInstructions("updated keep:07 plan")).toEqual({
      keep: 7,
      instructions: "updated plan",
    });
  });
});

describe("live window", () => {
  test("starts at the newest checkpoint's retained range", () => {
    const branch = [
      userEntry("u1", null, "old"),
      assistantEntry("a1", null, "old work"),
      compactionEntry("c1", "a1", "a1", "summary"),
      userEntry("u2", "c1", "new"),
      assistantEntry("a2", "u2", "new work"),
    ];
    expect(liveWindowStartIndex(branch)).toBe(1);
    const sentinel = [
      userEntry("u1", null, "old"),
      assistantEntry("a1", null, "old work"),
      compactionEntry("c1", "a1", "", "summary"),
      userEntry("u2", "c1", "new"),
    ];
    expect(liveWindowStartIndex(sentinel)).toBe(3);
    expect(liveWindowStartIndex([])).toBe(0);
  });
});

describe("boundaries", () => {
  test("rejects tool results, system messages and state entries", () => {
    expect(isValidTailBoundary(userEntry("u1", null, "x"))).toBe(true);
    expect(isValidTailBoundary(assistantEntry("a1", null, "x"))).toBe(true);
    expect(isValidTailBoundary(toolResultEntry("r1", null))).toBe(false);
    expect(isValidTailBoundary(systemEntry("s1", null, "x"))).toBe(false);
    expect(isValidTailBoundary(customMessageEntry("cm1", null, "x"))).toBe(true);
    expect(isValidTailBoundary(compactionEntry("c1", null, "x", "s"))).toBe(false);
  });
});

describe("chooseCut", () => {
  test("keeps the last user turn by default", () => {
    const b = chain();
    b.user("u1", "one");
    b.assistant("a1", "work");
    b.user("u2", "two");
    b.assistant("a2", "work");
    b.user("u3", "three");
    b.assistant("a3", "done");
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "manual", contextWindow: W });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cut.firstKeptEntryId).toBe("u3");
    expect(result.cut.reason).toBe("keep-turns");
    expect(result.cut.keptUserTurns).toBe(1);
    expect(result.cut.totalUserTurns).toBe(3);
    expect(result.cut.requestedKeep).toBe(1);
    expect(result.cut.tailTokenLimit).toBe(16_000);
  });

  test("keep:N counts user turns from the end", () => {
    const b = chain();
    b.user("u1", "one");
    b.assistant("a1", "work");
    b.user("u2", "two");
    b.assistant("a2", "work");
    b.user("u3", "three");
    b.assistant("a3", "done");
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 2, reason: "manual", contextWindow: W });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cut.firstKeptEntryId).toBe("u2");
    expect(result.cut.keptUserTurns).toBe(2);
  });

  test("keep:0 compacts everything with the empty sentinel", () => {
    const b = chain();
    b.user("u1", "one");
    b.assistant("a1", "work");
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 0, reason: "manual", contextWindow: W });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cut.firstKeptEntryId).toBe("");
    expect(result.cut.cutIndex).toBe(2);
    expect(result.cut.reason).toBe("compact-all");
    expect(result.cut.keptUserTurns).toBe(0);
  });

  test("a keep larger than the available turns cannot form a prefix", () => {
    const b = chain();
    b.user("u1", "one");
    b.assistant("a1", "work");
    b.user("u2", "two");
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 5, reason: "manual", contextWindow: W });
    expect(result).toEqual({ ok: false, reason: "nothing_to_compact" });
  });

  test("a single small turn is not worth a checkpoint", () => {
    const b = chain();
    b.user("u1", "only turn");
    const snapshot = snapshotOf(b.entries);
    expect(chooseCut({ snapshot, keepUserTurns: 1, reason: "manual", contextWindow: W })).toEqual({
      ok: false,
      reason: "nothing_to_compact",
    });
  });

  test("an oversized tail moves the cut to the nearest boundary that fits", () => {
    const b = chain();
    b.user("u1", "build the thing");
    for (let index = 1; index <= 60; index++) {
      b.assistant(`a${index}`, "x".repeat(3_000));
    }
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "manual", contextWindow: W });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 16 assistants * 3,000 chars / 3 chars-per-token = 16,000 tokens.
    expect(result.cut.firstKeptEntryId).toBe("a45");
    expect(result.cut.reason).toBe("tail-budget");
    expect(result.cut.keptUserTurns).toBe(0);
    expect(result.cut.tailTokens).toBe(16_000);
    expect(result.cut.tailTokens).toBeLessThanOrEqual(result.cut.tailTokenLimit);
  });

  test("overflow uses the tighter cap", () => {
    const b = chain();
    b.user("u1", "build the thing");
    for (let index = 1; index <= 60; index++) {
      b.assistant(`a${index}`, "x".repeat(3_000));
    }
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "overflow", contextWindow: 32_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // min(8,000, floor(0.15 * 32,000)) = 4,800.
    expect(result.cut.tailTokenLimit).toBe(4_800);
    expect(result.cut.firstKeptEntryId).toBe("a57");
    expect(result.cut.reason).toBe("overflow-budget");
    expect(result.cut.tailTokens).toBe(4_000);
  });

  test("never starts the tail at a tool result", () => {
    const b = chain();
    b.user("u1", "run the harness");
    for (let index = 1; index <= 30; index++) {
      b.assistant(`a${index}`, [
        { type: "toolCall", id: `call-${index}`, name: "bash", arguments: { command: "x" } },
      ]);
      b.toolResult(`r${index}`, { toolCallId: `call-${index}`, text: "y".repeat(3_000) });
    }
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "manual", contextWindow: W });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = snapshot.branch.find((candidate) => candidate.id === result.cut.firstKeptEntryId);
    expect(entry?.type).toBe("message");
    if (entry?.type !== "message") return;
    expect(entry.message.role).not.toBe("toolResult");
  });

  test("counts user turns only inside the current checkpoint window", () => {
    const b = chain();
    b.user("u1", "old goal");
    b.assistant("a1", "old work");
    b.compaction("c1", "a1", "summary");
    b.user("u2", "middle direction");
    b.assistant("a2", "middle work");
    b.user("u3", "new direction");
    b.assistant("a3", "new work");
    const snapshot = snapshotOf(b.entries);
    const one = chooseCut({ snapshot, keepUserTurns: 1, reason: "threshold", contextWindow: W });
    expect(one.ok).toBe(true);
    if (one.ok) {
      expect(one.cut.firstKeptEntryId).toBe("u3");
      expect(one.cut.totalUserTurns).toBe(2);
    }
    const two = chooseCut({ snapshot, keepUserTurns: 2, reason: "threshold", contextWindow: W });
    expect(two.ok).toBe(true);
    if (two.ok) {
      expect(two.cut.firstKeptEntryId).toBe("u2");
      expect(two.cut.totalUserTurns).toBe(2);
    }
  });

  test("without a user anchor the budget alone chooses the cut", () => {
    const branch = [
      assistantEntry("a1", null, "x".repeat(3_000)),
      assistantEntry("a2", "a1", "x".repeat(3_000)),
      assistantEntry("a3", "a2", "x".repeat(3_000)),
      assistantEntry("a4", "a3", "x".repeat(3_000)),
    ];
    const snapshot = snapshotOf(branch);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "manual", contextWindow: 12_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // min(16,000, 0.25 * 12,000) = 3,000 tokens; a2..a4 fit exactly.
    expect(result.cut.tailTokenLimit).toBe(3_000);
    expect(result.cut.firstKeptEntryId).toBe("a2");
    expect(result.cut.reason).toBe("tail-budget");
    expect(result.cut.keptUserTurns).toBe(0);
  });

  test("an over-budget single turn is split at a later message boundary", () => {
    const b = chain();
    b.user("u1", "one giant request");
    b.assistant("a1", "x".repeat(30_000));
    b.assistant("a2", "y".repeat(30_000));
    const snapshot = snapshotOf(b.entries);
    const result = chooseCut({ snapshot, keepUserTurns: 1, reason: "overflow", contextWindow: 32_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cut.reason).toBe("overflow-budget");
    expect(result.cut.firstKeptEntryId).toBe("a2");
    // Each assistant alone is over the cap; the latest legal boundary is the
    // smallest tail that exists. The cut never invents an illegal boundary.
    expect(result.cut.tailTokens).toBe(10_000);
  });
});
