/**
 * Local lexical search: one tokenizer and one BM25 scorer shared by the
 * capsule selector (P2) and the reader's search action (P3).
 *
 * Matching is normalized text; every returned range still comes from the raw
 * saved field. Identifiers keep their full form and their parts, camelCase,
 * underscore and path separators split parts, and CJK runs produce bigrams.
 */

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

const LATIN_RUN = /[A-Za-z0-9_]+(?:[./\\][A-Za-z0-9_.-]+)*/g;
const CJK_RUN =
  /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]+/gu;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d{1,4}[.)])\s+/;

const splitCamel = (part: string): string[] =>
  part
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter((piece) => piece.length > 0);

const identifierTokens = (run: string): string[] => {
  const tokens = new Set<string>();
  const full = run.toLowerCase();
  if (full.length > 0) tokens.add(full);
  for (const segment of run.split(/[_./\\]+/)) {
    if (!segment) continue;
    for (const piece of splitCamel(segment)) {
      const token = piece.toLowerCase();
      if (token.length > 0) tokens.add(token);
    }
  }
  return [...tokens];
};

const cjkTokens = (run: string): string[] => {
  if (run.length === 1) return [run];
  const tokens: string[] = [];
  for (let index = 0; index + 1 < run.length; index++) {
    tokens.push(run.slice(index, index + 2));
  }
  return tokens;
};

/** Tokenize saved text for matching. Never used to reconstruct offsets. */
export const tokenize = (text: string): string[] => {
  const tokens: string[] = [];
  for (const match of text.matchAll(LATIN_RUN)) {
    const run = match[0];
    if (run) tokens.push(...identifierTokens(run));
  }
  for (const match of text.matchAll(CJK_RUN)) {
    const run = match[0];
    if (run) tokens.push(...cjkTokens(run));
  }
  return tokens;
};

export const termFrequency = (text: string): Map<string, number> => {
  const terms = new Map<string, number>();
  for (const token of tokenize(text)) {
    terms.set(token, (terms.get(token) ?? 0) + 1);
  }
  return terms;
};

/** Unique query terms in first-seen order. */
export const queryTerms = (text: string): string[] => [...new Set(tokenize(text))];

export const isListItemLine = (line: string): boolean =>
  LIST_ITEM_RE.test(line);

export interface Bm25Document {
  key: string;
  terms: ReadonlyMap<string, number>;
  length: number;
}

export interface Bm25Hit {
  key: string;
  score: number;
}

/**
 * In-memory BM25 index. Documents keep their own keys (chunk ordinals, field
 * addresses); ranking only reads terms and lengths, so cold and warm orderings
 * are identical.
 */
export class Bm25Index {
  private readonly documents: readonly Bm25Document[];
  private readonly documentFrequency = new Map<string, number>();
  private readonly averageLength: number;

  constructor(documents: readonly Bm25Document[]) {
    this.documents = documents;
    let total = 0;
    for (const document of documents) {
      total += document.length;
      for (const term of document.terms.keys()) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) ?? 0) + 1,
        );
      }
    }
    this.averageLength =
      documents.length === 0 ? 0 : total / documents.length;
  }

  get size(): number {
    return this.documents.length;
  }

  idf(term: string): number {
    const df = this.documentFrequency.get(term) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (this.documents.length - df + 0.5) / (df + 0.5));
  }

  /** Score every document that contains at least one query term. */
  score(terms: readonly string[]): Map<string, number> {
    const scores = new Map<string, number>();
    if (this.averageLength <= 0) return scores;
    const unique = [...new Set(terms)];
    for (const document of this.documents) {
      let score = 0;
      for (const term of unique) {
        const tf = document.terms.get(term);
        if (!tf) continue;
        const idf = this.idf(term);
        const denominator =
          tf + BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / this.averageLength);
        score += idf * ((tf * (BM25_K1 + 1)) / denominator);
      }
      if (score > 0) scores.set(document.key, score);
    }
    return scores;
  }
}

export interface LiteralMatch {
  /** UTF-16 offset of the first matching character. */
  start: number;
  /** UTF-16 end of the match (start + query length in the original text). */
  end: number;
}

/**
 * Case-insensitive literal scan over the raw saved string. Returned offsets
 * always address the original text; the lowercased copy is only a matcher.
 * When Unicode case folding changes length, fall back to a bounded comparison
 * at each candidate position instead of trusting shifted offsets.
 */
export const scanLiteralMatches = (
  text: string,
  query: string,
  fromOffset = 0,
  limit = Number.POSITIVE_INFINITY,
): LiteralMatch[] => {
  if (query.length === 0) return [];
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const matches: LiteralMatch[] = [];
  const start = Math.max(0, Math.min(text.length, fromOffset));
  if (lowerText.length === text.length) {
    let cursor = lowerText.indexOf(lowerQuery, start);
    while (cursor >= 0 && matches.length < limit) {
      matches.push({ start: cursor, end: cursor + query.length });
      cursor = lowerText.indexOf(lowerQuery, cursor + Math.max(1, query.length));
    }
    return matches;
  }
  for (let index = start; index + query.length <= text.length; index++) {
    if (text.slice(index, index + query.length).toLowerCase() === lowerQuery) {
      matches.push({ start: index, end: index + query.length });
      if (matches.length >= limit) break;
      index += Math.max(1, query.length) - 1;
    }
  }
  return matches;
};

export const containsLiteral = (text: string, query: string): boolean => {
  if (query.length === 0) return false;
  return text.toLowerCase().includes(query.toLowerCase());
};

