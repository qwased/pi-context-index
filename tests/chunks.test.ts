import { describe, expect, test } from "bun:test";
import { chunkField } from "../src/chunks";
import type { TextField } from "../src/model";

const field = (text: string, owner = "u1", path = "/message/content"): TextField => ({
  ownerId: owner,
  storageId: owner,
  path,
  kind: "text",
  text,
});

const textOf = (text: string, chunk: { span: { start: number; end: number } }): string =>
  text.slice(chunk.span.start, chunk.span.end);

describe("chunkField", () => {
  test("a short field is one exact span", () => {
    const text = "Short instruction.";
    const chunks = chunkField(field(text));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.span).toEqual({
      ownerId: "u1",
      storageId: "u1",
      field: "/message/content",
      start: 0,
      end: text.length,
    });
    expect(textOf(text, chunks[0]!)).toBe(text);
    expect(chunks[0]?.terms.get("short")).toBe(1);
  });

  test("adjacent short paragraphs merge, long paragraphs stay separate", () => {
    const short = chunkField(field("Short A\n\nShort B"));
    expect(short).toHaveLength(1);
    expect(textOf("Short A\n\nShort B", short[0]!)).toBe("Short A\n\nShort B");

    const longText = "a".repeat(500) + "\n\n" + "b".repeat(520);
    const chunks = chunkField(field(longText));
    expect(chunks).toHaveLength(2);
    // Blank lines are separators, not part of either span.
    expect(textOf(longText, chunks[0]!)).toBe("a".repeat(500) + "\n");
    expect(chunks[0]?.span.end).toBe(501);
    expect(chunks[1]?.span.start).toBe(502);
    expect(textOf(longText, chunks[1]!)).toBe("b".repeat(520));
  });

  test("headings start sections and are excluded inside fences", () => {
    const text =
      "Intro text " +
      "x".repeat(450) +
      "\n\n# Real heading\n" +
      "y".repeat(500) +
      "\n\n\u0060\u0060\u0060js\n# not a heading\n\ncode line\n\u0060\u0060\u0060\n";
    const chunks = chunkField(field(text));
    const headingChunk = chunks.find((chunk) => {
      const chunkText = textOf(text, chunk);
      return chunkText.startsWith("# Real heading");
    });
    expect(headingChunk).toBeDefined();
    if (!headingChunk?.heading) throw new Error("expected a heading span");
    expect(text.slice(headingChunk.heading.start, headingChunk.heading.end)).toBe(
      "# Real heading",
    );

    const codeChunk = chunks.find((chunk) => textOf(text, chunk).includes("not a heading"));
    expect(codeChunk).toBeDefined();
    if (!codeChunk) return;
    // The heading inside the fence belongs to the real section, not a new one.
    expect(
      codeChunk.heading
        ? text.slice(codeChunk.heading.start, codeChunk.heading.end)
        : undefined,
    ).toBe("# Real heading");
  });

  test("blank lines inside a fence do not split the code block", () => {
    const text =
      "intro\n\n\u0060\u0060\u0060js\nline one\n\nline three\n\u0060\u0060\u0060\ndone\n";
    const chunks = chunkField(field(text));
    const codeChunk = chunks.find((chunk) => textOf(text, chunk).includes("line one"));
    expect(codeChunk).toBeDefined();
    if (!codeChunk) return;
    expect(textOf(text, codeChunk)).toContain("line three");
  });

  test("a long single line splits at grapheme clusters", () => {
    const text = "😀".repeat(1_000);
    const chunks = chunkField(field(text));
    expect(chunks.length).toBeGreaterThan(1);
    let previousEnd = 0;
    for (const chunk of chunks) {
      expect(chunk.span.start).toBe(previousEnd);
      expect(chunk.span.end - chunk.span.start).toBeLessThanOrEqual(800);
      expect(chunk.span.end).toBeGreaterThan(chunk.span.start);
      // Even offsets are surrogate-pair boundaries in this fixture.
      expect(chunk.span.start % 2).toBe(0);
      expect(chunk.span.end % 2).toBe(0);
      previousEnd = chunk.span.end;
    }
    expect(previousEnd).toBe(text.length);
  });

  test("CRLF is preserved verbatim", () => {
    const text = "alpha\r\n\r\nbeta\r\n";
    const chunks = chunkField(field(text));
    expect(chunks).toHaveLength(1);
    expect(textOf(text, chunks[0]!)).toBe(text);
  });

  test("excluded ranges are never part of a chunk", () => {
    const text =
      "prefix text " +
      "a".repeat(450) +
      "\n[[echo start]]\nthis is an echoed read result\n[[echo end]]\n" +
      "suffix text " +
      "b".repeat(450);
    const start = text.indexOf("[[echo start]]");
    const end = text.indexOf("\n", text.indexOf("[[echo end]]")) + 1;
    const chunks = chunkField(field(text), { exclude: [{ start, end }] });
    for (const chunk of chunks) {
      expect(chunk.span.end <= start || chunk.span.start >= end).toBe(true);
      expect(textOf(text, chunk)).not.toContain("echoed read result");
    }
    expect(chunks.length).toBeGreaterThan(1);
  });
});
