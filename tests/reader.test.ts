import { describe, expect, test } from "bun:test";
import {
  fitGraphemePrefix,
  fitGraphemeWindow,
  graphemeEndAfter,
  graphemeStartAtOrBefore,
  parseEntryRef,
  readStoredField,
  resolveStoredField,
} from "../src/reader";
import {
  assistantEntry,
  contextEditEntry,
  userEntry,
  userPartsEntry,
} from "./fixtures/entries";

const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";

describe("entry refs", () => {
  test("only e:<id> is valid", () => {
    expect(parseEntryRef("e:abc")).toBe("abc");
    expect(parseEntryRef("e:")).toBeUndefined();
    expect(parseEntryRef("abc")).toBeUndefined();
    expect(parseEntryRef("#3")).toBeUndefined();
  });
});

describe("grapheme-aligned prefix", () => {
  test("does not split surrogate pairs, combining marks or ZWJ clusters", () => {
    expect(fitGraphemePrefix("😀😀", 0)).toBe(0);
    expect(fitGraphemePrefix("😀😀", 1)).toBe(0);
    expect(fitGraphemePrefix("😀😀", 3)).toBe(2);
    expect(fitGraphemePrefix("😀😀", 4)).toBe(4);
    expect(fitGraphemePrefix("😀😀", 99)).toBe(4);

    const combining = "e\u0301x";
    expect(fitGraphemePrefix(combining, 1)).toBe(0);
    expect(fitGraphemePrefix(combining, 2)).toBe(2);
    expect(fitGraphemePrefix(combining, 3)).toBe(3);

    expect(fitGraphemePrefix(FAMILY + "x", 5)).toBe(0);
    expect(fitGraphemePrefix(FAMILY + "x", FAMILY.length)).toBe(FAMILY.length);
  });
});

describe("grapheme start and end", () => {
  test("align down and up around a cluster", () => {
    const text = "e\u0301x";
    expect(graphemeStartAtOrBefore(text, 0)).toBe(0);
    expect(graphemeStartAtOrBefore(text, 1)).toBe(0);
    expect(graphemeStartAtOrBefore(text, 2)).toBe(2);
    expect(graphemeEndAfter(text, 0)).toBe(2);
    expect(graphemeEndAfter(text, 1)).toBe(2);
    expect(graphemeEndAfter(text, 2)).toBe(3);
  });
});

describe("grapheme windows", () => {
  test("returns the actual aligned range and the remaining count", () => {
    const text = "😀😀";
    expect(fitGraphemeWindow(text, 0, 3)).toEqual({
      ok: true,
      start: 0,
      end: 2,
      total: 4,
      remaining: 2,
      text: "😀",
    });
    // An offset inside a surrogate pair aligns to the cluster start.
    expect(fitGraphemeWindow(text, 1, 3)).toEqual({
      ok: true,
      start: 0,
      end: 2,
      total: 4,
      remaining: 2,
      text: "😀",
    });
    expect(fitGraphemeWindow(text, 2, 3)).toEqual({
      ok: true,
      start: 2,
      end: 4,
      total: 4,
      remaining: 0,
      text: "😀",
    });
  });

  test("reports eof, out-of-range and clusters larger than the grant", () => {
    expect(fitGraphemeWindow("abc", 3, 4)).toEqual({
      ok: false,
      reason: "eof",
      total: 3,
    });
    expect(fitGraphemeWindow("abc", 4, 4)).toEqual({
      ok: false,
      reason: "out-of-range",
      total: 3,
    });
    expect(fitGraphemeWindow("😀", 0, 1)).toEqual({
      ok: false,
      reason: "grapheme-too-large",
      total: 2,
      required: 2,
    });
    expect(fitGraphemeWindow("e\u0301", 0, 1)).toEqual({
      ok: false,
      reason: "grapheme-too-large",
      total: 2,
      required: 2,
    });
  });

  test("preserves CRLF and never normalizes line endings", () => {
    const text = "a\r\nb";
    const window = fitGraphemeWindow(text, 1, 2);
    expect(window.ok).toBe(true);
    if (!window.ok) return;
    expect(window.text).toBe("\r\n");
    expect(window.start).toBe(1);
    expect(window.end).toBe(3);
  });
});

describe("stored reads through the field view", () => {
  test("reads array content, edit replacements and scalars by native ref", () => {
    const entries = [
      userPartsEntry("u1", null, [
        { type: "text", text: "first block" },
        { type: "text", text: "second block" },
      ]),
      contextEditEntry("e1", null, "u1", "replacement text"),
      assistantEntry("a1", null, [
        { type: "toolCall", id: "c1", name: "write", arguments: { n: 42 } },
      ]),
    ];
    const first = readStoredField(entries, "e:u1");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.field.path).toBe("/message/content/0/text");
      expect(first.field.text).toBe("first block");
    }
    const second = readStoredField(entries, "e:u1", "/message/content/1/text");
    expect(second.ok && second.field.text).toBe("second block");
    const edit = readStoredField(entries, "e:e1");
    expect(edit.ok && edit.field.path).toBe("/replacement/content");
    const scalar = resolveStoredField(
      { byId: new Map(entries.map((entry) => [entry.id, entry])) },
      "e:a1",
      "/message/content/0/arguments/n",
    );
    expect(scalar.ok).toBe(true);
    if (scalar.ok) {
      expect(scalar.field.text).toBe("42");
      expect(scalar.field.kind).toBe("scalar");
    }
  });

  test("the original user text is untouched by an edit entry", () => {
    const entries = [userEntry("u1", null, "original"), contextEditEntry("e1", null, "u1", "edited")];
    const original = readStoredField(entries, "e:u1");
    expect(original.ok && original.field.text).toBe("original");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// P3 executor: list / search / read, cursors, budget and headroom.
// ═══════════════════════════════════════════════════════════════════════

import {
  executeReader,
  type ReaderContext,
  type ReaderArgs,
} from "../src/reader";
import {
  ReaderRunBudget,
  contextHeadroomChars,
} from "../src/budget";
import { SELF_ECHO_BEGIN, SELF_ECHO_END } from "../src/source";
import { chain, fakeManager } from "./fixtures/entries";
import { captureSource } from "../src/source";

const stripFrames = (text: string): string =>
  text
    .replace(SELF_ECHO_BEGIN, "")
    .replace(SELF_ECHO_END, "")
    .trim();

const contextFor = (
  manager: ReturnType<typeof fakeManager>,
  options: { window?: number; tokens?: number; maxTokens?: number } = {},
): ReaderContext => ({
  sessionManager: manager,
  getContextUsage: () => ({
    tokens: options.tokens ?? 0,
    contextWindow: options.window ?? 200_000,
  }),
  model: {
    contextWindow: options.window ?? 200_000,
    maxTokens: options.maxTokens ?? 8_000,
  },
});

const readArgsFrom = (text: string): ReaderArgs | undefined => {
  const match = /context_index (\{[^\n]+\})/.exec(text);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as ReaderArgs;
  } catch {
    return undefined;
  }
};

describe("reader executor: list", () => {
  test("browses the effective branch in pages without repeating records", async () => {
    const b = chain();
    for (let index = 1; index <= 25; index++) {
      b.user("u" + index, "request " + index);
    }
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget(48_000, 8);
    const first = await executeReader(
      { action: "list" },
      contextFor(manager),
      budget,
    );
    expect(first.isError).not.toBe(true);
    expect(first.content[0]?.text.startsWith(SELF_ECHO_BEGIN)).toBe(true);
    expect(first.content[0]?.text).toContain("[context_index list");
    expect(first.content[0]?.text).toContain("e:u1");
    expect(first.content[0]?.text).toContain("1-20/25");
    expect(first.details.incomplete).toBe(true);
    expect(first.details.cursor).toBeDefined();
    expect(budget.remainingCalls).toBe(7);

    const second = await executeReader(
      { action: "list", cursor: first.details.cursor },
      contextFor(manager),
      budget,
    );
    expect(second.isError).not.toBe(true);
    expect(second.content[0]?.text).toContain("21-25/25");
    expect(second.content[0]?.text).toContain("e:u25");
    expect(second.content[0]?.text).not.toContain("e:u26");
    expect(second.details.complete).toBe(true);
    expect(second.details.cursor).toBeUndefined();
    expect(budget.remainingCalls).toBe(6);
  });

  test("lists one record's fields and section headings", async () => {
    const text =
      "Intro " +
      "x".repeat(500) +
      "\n\n# Heading One\n" +
      "y".repeat(500) +
      "\n\n## Heading Two\n" +
      "z".repeat(500);
    const b = chain();
    b.user("u1", text);
    b.user("u2", "live");
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "list", ref: "e:u1" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("field /message/content");
    expect(result.content[0]?.text).toContain("# Heading One");
    expect(result.content[0]?.text).toContain("# Heading Two");
    expect(result.details.ref).toBe("e:u1");
    expect(result.details.complete).toBe(true);
  });
});

describe("reader executor: search", () => {
  test("returns BM25 hits with executable read parameters", async () => {
    const b = chain();
    b.user("u1", "The zeta allocator invariant must stay monotonic.");
    b.assistant("a1", "Noted.");
    b.user("u2", "Unrelated tail.");
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "search", query: "zeta allocator" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("[context_index search");
    expect(text).toContain("zeta allocator");
    expect(text).toContain("field=/message/content");
    expect(text).toContain("read: context_index");
    const args = readArgsFrom(text);
    expect(args?.action).toBe("read");
    expect(args?.ref).toBeDefined();
    expect(args?.field).toBe("/message/content");
    const read = await executeReader(args!, contextFor(manager), new ReaderRunBudget());
    expect(read.isError).not.toBe(true);
    expect(stripFrames(read.content[0]?.text ?? "")).toContain("zeta allocator");
  });

  test("literal search returns real offsets, case-insensitively", async () => {
    const text = "alpha BETA gamma 验收方式 delta";
    const b = chain();
    b.user("u1", text);
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "search", query: "beta", match: "literal" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    const rendered = result.content[0]?.text ?? "";
    expect(rendered).toContain("literal");
    expect(rendered).toContain("@" + text.toLowerCase().indexOf("beta") + "-" + (text.toLowerCase().indexOf("beta") + 4));
    const hitStart = text.indexOf("BETA");
    expect(rendered).toContain(text.slice(hitStart, hitStart + 4));
    const args = readArgsFrom(rendered);
    expect(args?.action).toBe("read");
    expect(args?.offset).toBeGreaterThanOrEqual(0);
  });
});

describe("reader executor: read", () => {
  test("bounds a long field, continues with a cursor and supports full:true", async () => {
    const long = "😀" + "x".repeat(15_000);
    const b = chain();
    b.user("u1", long);
    b.user("u2", "live");
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget();
    const first = await executeReader(
      { action: "read", ref: "e:u1" },
      contextFor(manager),
      budget,
    );
    expect(first.isError).not.toBe(true);
    expect(first.details.start).toBe(0);
    expect(first.details.chars).toBeGreaterThan(5_000);
    expect(first.details.chars).toBeLessThanOrEqual(6_000);
    expect(first.details.incomplete).toBe(true);
    expect(first.details.remainingChars).toBeGreaterThan(0);
    expect(first.details.cursor).toBeDefined();
    expect(first.content[0]?.text).toContain(long.slice(0, 50));

    const second = await executeReader(
      { action: "read", cursor: first.details.cursor },
      contextFor(manager),
      budget,
    );
    expect(second.isError).not.toBe(true);
    expect(second.details.start).toBe(first.details.end);

    const full = await executeReader(
      { action: "read", ref: "e:u1", full: true },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(full.isError).not.toBe(true);
    expect(full.details.complete).toBe(true);
    expect(full.details.chars).toBe(long.length);
    expect(full.content[0]?.text).toContain(long);
  });

  test("a full read larger than 48K is a normal partial with a full cursor", async () => {
    const long = "y".repeat(60_000);
    const b = chain();
    b.user("u1", long);
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "read", ref: "e:u1", full: true },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    expect(result.details.incomplete).toBe(true);
    expect(result.details.chars).toBeLessThanOrEqual(48_000);
    expect(result.details.next?.full).toBe(true);
    expect(result.details.cursor).toBeDefined();
  });

  test("aligns an offset inside a grapheme to the cluster start", async () => {
    const b = chain();
    b.user("u1", "😀tail");
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "read", ref: "e:u1", offset: 1 },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    expect(result.details.start).toBe(0);
    expect(result.content[0]?.text).toContain("😀tail");
  });

  test("argument conflicts and missing refs are errors", async () => {
    const b = chain();
    b.user("u1", "text");
    const manager = fakeManager(b.entries);
    const ctx = contextFor(manager);
    const budget = new ReaderRunBudget();
    const fullOffset = await executeReader(
      { action: "read", ref: "e:u1", full: true, offset: 3 },
      ctx,
      budget,
    );
    expect(fullOffset.isError).toBe(true);
    const missing = await executeReader({ action: "read" }, ctx, budget);
    expect(missing.isError).toBe(true);
    const empty = await executeReader({ action: "search", query: "  " }, ctx, budget);
    expect(empty.isError).toBe(true);
    const mixed = await executeReader(
      { action: "list", query: "x" },
      ctx,
      budget,
    );
    expect(mixed.isError).toBe(true);
    const cursorMix = await executeReader(
      { action: "read", cursor: "not-a-cursor", ref: "e:u1" },
      ctx,
      budget,
    );
    expect(cursorMix.isError).toBe(true);

    const malformed = Buffer.from(
      JSON.stringify({
        v: 1,
        action: "search",
        sessionId: "session-test",
        headId: "u1",
        watermarkId: "u1",
        query: 5,
      }),
      "utf8",
    ).toString("base64url");
    const malformedResult = await executeReader(
      { action: "search", cursor: malformed },
      ctx,
      budget,
    );
    expect(malformedResult.isError).toBe(true);
    expect(malformedResult.details.error).toContain("malformed cursor query");
  });
});

describe("run budget and headroom", () => {
  test("settles the exact output and refuses the next call once spent", async () => {
    const b = chain();
    b.user("u1", "z".repeat(5_000));
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget(2_000, 2);
    const first = await executeReader(
      { action: "read", ref: "e:u1" },
      contextFor(manager),
      budget,
    );
    expect(first.isError).not.toBe(true);
    expect(first.content[0]!.text.length).toBeLessThanOrEqual(2_000);
    expect(budget.remainingChars).toBe(2_000 - first.content[0]!.text.length);
    const second = await executeReader(
      { action: "read", ref: "e:u1" },
      contextFor(manager),
      budget,
    );
    expect(second.isError).not.toBe(true);
    expect(second.details.budgetExhausted).toBe(true);
    expect(second.details.resume).toBe("next-run");
  });

  test("reservations nest, settle and release without crossing runs", () => {
    const first = new ReaderRunBudget(10_000, 3);
    const one = first.reserve(4_000, 10_000);
    const two = first.reserve(4_000, 10_000);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(first.inFlightChars).toBe(8_000);
    first.settle(one!, 1_000);
    first.release(two!);
    expect(first.remainingChars).toBe(9_000);
    expect(first.remainingCalls).toBe(2);

    const second = new ReaderRunBudget(1_000, 1);
    first.settle(two!, 999); // already released; ignored
    expect(second.remainingChars).toBe(1_000);
    expect(first.remainingChars).toBe(9_000);
  });

  test("context headroom follows the documented formula", () => {
    expect(
      contextHeadroomChars({
        contextWindow: 100_000,
        usedTokens: 50_000,
        maxOutputTokens: 8_000,
        inFlightChars: 0,
      }),
    ).toBe(111_000);
    expect(
      contextHeadroomChars({
        contextWindow: 100_000,
        usedTokens: 50_000,
        maxOutputTokens: 8_000,
        inFlightChars: 1_000,
      }),
    ).toBe(110_000);
    expect(
      contextHeadroomChars({
        contextWindow: 10_000,
        usedTokens: 9_500,
        maxOutputTokens: 8_000,
        inFlightChars: 0,
      }),
    ).toBe(0);
  });

  test("a tight context window returns the short budget diagnostic", async () => {
    const b = chain();
    b.user("u1", "text");
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "read", ref: "e:u1" },
      contextFor(manager, { window: 10_000, tokens: 9_500 }),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    expect(result.details.budgetExhausted).toBe(true);
  });
});

describe("cursor invalidation", () => {
  test("a tree switch invalidates a page cursor", async () => {
    const b = chain();
    for (let index = 1; index <= 25; index++) b.user("u" + index, "request " + index);
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget();
    const first = await executeReader({ action: "list" }, contextFor(manager), budget);
    expect(first.details.cursor).toBeDefined();
    const switched = fakeManager(b.entries, { leafId: "u2" });
    const resumed = await executeReader(
      { action: "list", cursor: first.details.cursor },
      contextFor(switched),
      budget,
    );
    expect(resumed.isError).toBe(true);
    expect(resumed.details.error).toContain("branch changed");
  });

  test("a later context edit invalidates effective-history paging", async () => {
    const b = chain();
    for (let index = 1; index <= 25; index++) b.user("u" + index, "request " + index);
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget();
    const first = await executeReader({ action: "list" }, contextFor(manager), budget);
    b.edit("edit1", "u1", "changed");
    const manager2 = fakeManager(b.entries);
    const resumed = await executeReader(
      { action: "list", cursor: first.details.cursor },
      contextFor(manager2),
      budget,
    );
    expect(resumed.isError).toBe(true);
    expect(resumed.details.error).toContain("context edit");
  });

  test("appends keep an old page cursor valid at the old watermark", async () => {
    const b = chain();
    for (let index = 1; index <= 25; index++) b.user("u" + index, "request " + index);
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget();
    const first = await executeReader({ action: "list" }, contextFor(manager), budget);
    b.user("u26", "appended after the cursor");
    const manager2 = fakeManager(b.entries);
    const resumed = await executeReader(
      { action: "list", cursor: first.details.cursor },
      contextFor(manager2),
      budget,
    );
    expect(resumed.isError).not.toBe(true);
    expect(resumed.content[0]?.text).toContain("21-25/25");
    expect(resumed.content[0]?.text).not.toContain("e:u26");
  });
});

describe("edited records in the reader", () => {
  const editedFixture = () => {
    const b = chain();
    b.user("u1", "original stored text");
    b.assistant("a1", "work");
    b.edit("e1", "u1", "replacement visible text");
    b.user("u2", "live");
    return fakeManager(b.entries);
  };

  test("list ref shows the original field and the effective read link", async () => {
    const manager = editedFixture();
    const original = await executeReader(
      { action: "list", ref: "e:u1" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    const text = original.content[0]?.text ?? "";
    expect(text).toContain("field /message/content");
    expect(text).toContain("effective: source=e:e1");
    expect(text).toContain('"ref":"e:e1"');
    expect(text).toContain("/replacement/content");

    const edit = await executeReader(
      { action: "list", ref: "e:e1" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    const editText = edit.content[0]?.text ?? "";
    expect(editText).toContain("revision of e:u1");
    expect(editText).toContain("field /replacement/content");
  });

  test("branch search sees the replacement, session scope also sees the original", async () => {
    const manager = editedFixture();
    const branch = await executeReader(
      { action: "search", query: "replacement visible text" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(branch.isError).not.toBe(true);
    expect(branch.content[0]?.text).toContain("source=e:e1");
    expect(branch.content[0]?.text).toContain("/replacement/content");

    const originalInBranch = await executeReader(
      { action: "search", query: "original stored" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(originalInBranch.content[0]?.text).toContain("no matches");

    const originalInSession = await executeReader(
      { action: "search", query: "original stored", scope: "session" },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(originalInSession.isError).not.toBe(true);
    expect(originalInSession.content[0]?.text).toContain("original stored text");
    expect(originalInSession.content[0]?.text).toContain("e:u1");
  });
});

describe("reader depth and shared budget", () => {
  test("a target deep in a 21K field is found by search and read in one step", async () => {
    const marker = "TARGET_TOKEN_42";
    const deepText = "z".repeat(21_000) + marker + "x".repeat(2_000);
    const b = chain();
    b.user("u1", deepText);
    const manager = fakeManager(b.entries);
    const search = await executeReader(
      { action: "search", query: marker },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(search.isError).not.toBe(true);
    const text = search.content[0]?.text ?? "";
    expect(text).toContain(marker);
    const args = readArgsFrom(text);
    expect(args?.action).toBe("read");
    expect(args?.offset).toBeGreaterThan(20_900);
    expect(args?.offset).toBeLessThan(21_100);
    const read = await executeReader(args!, contextFor(manager), new ReaderRunBudget());
    expect(read.isError).not.toBe(true);
    expect(read.content[0]?.text).toContain(marker);
    expect(read.details.start).toBeLessThanOrEqual(21_000);
  });

  test("a 37K user field is returned whole by full:true", async () => {
    const long = "a".repeat(37_000);
    const b = chain();
    b.user("u1", long);
    const manager = fakeManager(b.entries);
    const result = await executeReader(
      { action: "read", ref: "e:u1", full: true },
      contextFor(manager),
      new ReaderRunBudget(),
    );
    expect(result.isError).not.toBe(true);
    expect(result.details.complete).toBe(true);
    expect(result.details.chars).toBe(37_000);
    expect(result.content[0]?.text).toContain(long);
  });

  test("two concurrent reads share one ledger and the sum stays within it", async () => {
    const b = chain();
    b.user("u1", "😀".repeat(7_500));
    const manager = fakeManager(b.entries);
    const budget = new ReaderRunBudget(20_000, 8);
    const [first, second] = await Promise.all([
      executeReader({ action: "read", ref: "e:u1" }, contextFor(manager), budget),
      executeReader({ action: "read", ref: "e:u1" }, contextFor(manager), budget),
    ]);
    const total =
      (first.content[0]?.text.length ?? 0) + (second.content[0]?.text.length ?? 0);
    expect(total).toBeLessThanOrEqual(20_000);
    expect(first.details.incomplete).toBe(true);
    expect(second.details.incomplete).toBe(true);
    expect(budget.remainingChars).toBe(20_000 - total);
  });
});
