import { describe, expect, test } from "bun:test";
import {
  BM25_B,
  BM25_K1,
  Bm25Index,
  queryTerms,
  termFrequency,
  tokenize,
} from "../src/search";

const doc = (key: string, text: string) => {
  const terms = termFrequency(text);
  let length = 0;
  for (const count of terms.values()) length += count;
  return { key, terms, length };
};

describe("tokenize", () => {
  test("keeps identifiers and splits camelCase, underscores and paths", () => {
    const tokens = new Set(tokenize("readWindowFile src/core/reader.ts write_file"));
    for (const expected of [
      "readwindowfile",
      "read",
      "window",
      "file",
      "src/core/reader.ts",
      "src",
      "core",
      "reader",
      "ts",
      "write_file",
      "write",
    ]) {
      expect(tokens.has(expected)).toBe(true);
    }
  });

  test("CJK runs produce bigrams and single-character runs stay whole", () => {
    expect(tokenize("验收方式")).toEqual(["验收", "收方", "方式"]);
    expect(tokenize("验")).toEqual(["验"]);
    expect(tokenize("验收😀方式")).toEqual(["验收", "方式"]);
  });

  test("numbers and Latin are case-folded; punctuation is ignored", () => {
    expect(tokenize("42 pass / 0 fail")).toEqual(["42", "pass", "0", "fail"]);
    expect(queryTerms("Pass PASS pass")).toEqual(["pass"]);
  });

  test("termFrequency counts occurrences", () => {
    const terms = termFrequency("pass pass fail 验收验收");
    expect(terms.get("pass")).toBe(2);
    expect(terms.get("fail")).toBe(1);
    expect(terms.get("验收")).toBe(2);
  });
});

describe("Bm25Index", () => {
  test("ranks the document that contains the query term", () => {
    const index = new Bm25Index([
      doc("a", "golden allocator acceptance"),
      doc("b", "unrelated note"),
    ]);
    const scores = index.score(queryTerms("allocator"));
    expect(scores.get("a")).toBeGreaterThan(0);
    expect(scores.has("b")).toBe(false);
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });

  test("repeated terms in shorter documents score higher", () => {
    const index = new Bm25Index([
      doc("short", "pass pass"),
      doc("long", "pass " + "other ".repeat(30)),
    ]);
    const scores = index.score(["pass"]);
    expect(scores.get("short") ?? 0).toBeGreaterThan(scores.get("long") ?? 0);
  });

  test("unknown terms score nothing and empty indexes are safe", () => {
    const index = new Bm25Index([doc("a", "alpha")]);
    expect(index.score(["beta"]).size).toBe(0);
    expect(new Bm25Index([]).score(["alpha"]).size).toBe(0);
  });
});
