import { describe, expect, test } from "bun:test";
import {
  closeUnclosedFences,
  dropOrphanClosers,
  fenceStateAtEnd,
  fenceStateBefore,
  isClosingFence,
  parseFenceLine,
} from "../src/fences";

// ── independent fence oracle (deliberately not shared with src) ───────────
// CommonMark-ish: 0-3 spaces, then >=3 backticks or tildes. A backtick
// opener's info string cannot contain a backtick. A closer needs the same
// character, at least the opener's length, and an empty info string.
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

interface Fence {
  char: "`" | "~";
  length: number;
  info: string;
}

const parse = (line: string): Fence | null => {
  const match = line.match(FENCE_RE);
  if (!match) return null;
  const run = match[2] ?? "";
  const info = match[3] ?? "";
  if (!run) return null;
  const char = run.charAt(0) as "`" | "~";
  if (char === "`" && info.includes("`")) return null;
  return { char, length: run.length, info: info.trim() };
};

const isBalanced = (text: string): boolean => {
  let open: Fence | null = null;
  for (const line of text.split("\n")) {
    const fence = parse(line);
    if (!fence) continue;
    if (!open) {
      open = fence;
    } else if (
      fence.char === open.char &&
      fence.length >= open.length &&
      fence.info === ""
    ) {
      open = null;
    }
  }
  return open === null;
};

describe("parseFenceLine", () => {
  test("0-3 spaces are a fence, 4 spaces are not", () => {
    expect(parseFenceLine("```ts")).not.toBeNull();
    expect(parseFenceLine(" ```ts")).not.toBeNull();
    expect(parseFenceLine("   ```ts")).not.toBeNull();
    expect(parseFenceLine("    ```ts")).toBeNull();
  });

  test("tildes are fences and may carry a backtick in their info string", () => {
    expect(parseFenceLine("~~~ts")?.char).toBe("~");
    expect(parseFenceLine("```code `x`")).toBeNull();
    expect(parseFenceLine("~~~code `x`")?.info).toBe("code `x`");
  });

  test("keeps the original line so a tail can reopen it verbatim", () => {
    const fence = parseFenceLine("  ````ts ");
    expect(fence?.length).toBe(4);
    expect(fence?.indent).toBe(2);
    expect(fence?.info).toBe("ts");
    expect(fence?.raw).toBe("  ````ts ");
  });

  test("a CRLF line ending does not change the parse", () => {
    const fence = parseFenceLine("```ts\r");
    expect(fence?.info).toBe("ts");
    expect(fence?.raw.endsWith("\r")).toBe(true);
  });
});

describe("isClosingFence", () => {
  const open = parseFenceLine("```ts")!;

  test("requires the same character", () => {
    expect(isClosingFence(open, parseFenceLine("~~~")!)).toBe(false);
  });

  test("accepts a longer run and rejects a shorter one", () => {
    expect(isClosingFence(open, parseFenceLine("`````")!)).toBe(true);
    expect(
      isClosingFence(parseFenceLine("````ts")!, parseFenceLine("```")!),
    ).toBe(false);
  });

  test("rejects a closer that carries an info string", () => {
    expect(isClosingFence(open, parseFenceLine("```js")!)).toBe(false);
  });
});

describe("fenceStateAtEnd", () => {
  test("tracks open and close across lines", () => {
    expect(fenceStateAtEnd("prose")).toBeNull();
    expect(fenceStateAtEnd("```ts\ncode")).not.toBeNull();
    expect(fenceStateAtEnd("```ts\ncode\n```")).toBeNull();
    expect(fenceStateAtEnd("````ts\ncode\n```")).not.toBeNull();
    expect(
      fenceStateAtEnd("```ts\ncode\n```\nmore\n~~~\ninside"),
    ).not.toBeNull();
  });
});

describe("fenceStateBefore", () => {
  const text = "```ts\ncode\n```\ntail";

  test("only complete lines before the offset count", () => {
    expect(fenceStateBefore(text, 0)).toBeNull();
    expect(fenceStateBefore(text, 6)).not.toBeNull();
    expect(fenceStateBefore(text, 12)).not.toBeNull();
    expect(fenceStateBefore(text, 16)).toBeNull();
  });

  test("an offset in the middle of a fence line does not count that line", () => {
    const partial = "prose\n````ts\ncode";
    expect(fenceStateBefore(partial, 9)).toBeNull();
    expect(fenceStateBefore(partial, 13)).not.toBeNull();
  });
});

describe("closeUnclosedFences", () => {
  test("appends the matching closer and reports its cost", () => {
    const closed = closeUnclosedFences("```ts\ncode");
    expect(closed.text).toBe("```ts\ncode\n```");
    expect(closed.appendedChars).toBe(4);
  });

  test("is idempotent and respects an existing final newline", () => {
    const once = closeUnclosedFences("```ts\ncode");
    expect(closeUnclosedFences(once.text).appendedChars).toBe(0);
    const withNewline = closeUnclosedFences("```ts\ncode\n");
    expect(withNewline.text).toBe("```ts\ncode\n```");
    expect(isBalanced(withNewline.text)).toBe(true);
  });

  test("uses the opener character and length", () => {
    const closed = closeUnclosedFences("~~~~\ncode");
    expect(closed.text.endsWith("\n~~~~")).toBe(true);
  });

  test("leaves balanced and fenceless text byte-identical", () => {
    for (const text of ["", "plain", "```ts\ncode\n```"]) {
      expect(closeUnclosedFences(text).text).toBe(text);
    }
  });
});

describe("dropOrphanClosers", () => {
  test("removes only a closer for the dropped opener", () => {
    expect(dropOrphanClosers("prose\n```ts\n", ["```", "after"])).toEqual([
      "after",
    ]);
    expect(dropOrphanClosers("prose\n", ["```", "after"])).toEqual([
      "```",
      "after",
    ]);
  });

  test("removes every orphan closer of the same opener", () => {
    expect(
      dropOrphanClosers("```ts\n", ["```", "````", "text", "```"]),
    ).toEqual(["text"]);
  });

  test("keeps a shorter run and a different character", () => {
    expect(dropOrphanClosers("````ts\n", ["```", "after"])).toEqual([
      "```",
      "after",
    ]);
    expect(dropOrphanClosers("```ts\n", ["~~~", "after"])).toEqual([
      "~~~",
      "after",
    ]);
  });
});
