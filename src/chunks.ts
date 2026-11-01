/**
 * Fence-aware structural chunking.
 *
 * One saved field is split into source ranges (never copies): headings outside
 * code fences, blank-line paragraphs, list items and long lines. Short
 * neighbours merge toward 400-800 chars; oversized paragraphs or single lines
 * split at grapheme boundaries. Every chunk keeps its exact Span, optional
 * heading Span, ordinal and term frequencies for BM25.
 */

import {
  isClosingFence,
  parseFenceLine,
  type FenceLine,
} from "./fences";
import type { Chunk, Span, TextField } from "./model";
import { termFrequency } from "./search";

export const CHUNK_MIN_CHARS = 400;
export const CHUNK_MAX_CHARS = 800;
const CHUNK_TARGET_CHARS = 700;

const MARKDOWN_HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;

export interface ExcludedRange {
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** Ranges to leave out (for example a self-echo block inside a codemode body). */
  readonly exclude?: readonly ExcludedRange[];
}

interface SourceLine {
  start: number;
  end: number;
  content: string;
  fence: FenceLine | null;
  inFenceBefore: boolean;
  afterFence: FenceLine | null;
  skip: boolean;
}

interface Block {
  firstLine: number;
  lastLine: number;
  rawHeadingLine?: number;
}

interface Piece {
  start: number;
  end: number;
  rawHeadingLine?: number;
  isList: boolean;
}

const isExcludedLine = (
  start: number,
  ranges: readonly ExcludedRange[],
): boolean => {
  for (const range of ranges) {
    if (start >= range.start && start < range.end) return true;
  }
  return false;
};

const buildLines = (
  text: string,
  exclude: readonly ExcludedRange[],
): SourceLine[] => {
  const lines: SourceLine[] = [];
  let open: FenceLine | null = null;
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    const contentEnd = newline < 0 ? text.length : newline;
    const end = newline < 0 ? text.length : newline + 1;
    const content = text.slice(start, contentEnd);
    const fence = parseFenceLine(content);
    const inFenceBefore = open !== null;
    let afterFence: FenceLine | null = open;
    if (fence) {
      if (!open) afterFence = fence;
      else if (isClosingFence(open, fence)) afterFence = null;
    }
    lines.push({
      start,
      end,
      content,
      fence,
      inFenceBefore,
      afterFence,
      skip: isExcludedLine(start, exclude),
    });
    if (newline < 0) break;
    open = afterFence;
    start = end;
  }
  return lines;
};

const headingLineOf = (line: SourceLine): boolean => {
  if (line.skip || line.fence || line.inFenceBefore) return false;
  const trimmed = line.content.replace(/\r$/, "").trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  if (MARKDOWN_HEADING_RE.test(line.content)) return true;
  if (/^\s*(?:[-*+]|\d{1,4}[.)])\s+/.test(line.content)) return false;
  return trimmed.endsWith(":") || trimmed.endsWith("：");
};

const isBlank = (line: SourceLine): boolean =>
  !line.inFenceBefore && !line.fence && line.content.trim().length === 0;

const isListStart = (line: SourceLine): boolean =>
  !line.inFenceBefore &&
  !line.fence &&
  /^\s*(?:[-*+]|\d{1,4}[.)])\s+/.test(line.content);

const buildBlocks = (lines: readonly SourceLine[]): Block[] => {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let pendingHeadingLine: number | undefined;

  const flush = (): void => {
    if (current && current.lastLine >= current.firstLine) {
      blocks.push(current);
      current = null;
    }
  };
  const startBlock = (index: number): void => {
    current = { firstLine: index, lastLine: index };
    if (pendingHeadingLine !== undefined) {
      current.rawHeadingLine = pendingHeadingLine;
      pendingHeadingLine = undefined;
    }
  };
  const append = (index: number): void => {
    if (!current) startBlock(index);
    else current.lastLine = index;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    if (line.skip) {
      flush();
      continue;
    }
    if (headingLineOf(line)) {
      flush();
      pendingHeadingLine = index;
      startBlock(index);
      continue;
    }
    if (isBlank(line)) {
      flush();
      continue;
    }
    if (!line.inFenceBefore && !line.fence && isListStart(line) && current) {
      flush();
      startBlock(index);
      continue;
    }
    append(index);
  }
  flush();
  return blocks;
};

const mergeShortBlocks = (blocks: Block[], lines: readonly SourceLine[]): Block[] => {
  const merged: Block[] = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    if (previous) {
      const previousLength =
        (lines[previous.lastLine]?.end ?? 0) - (lines[previous.firstLine]?.start ?? 0);
      const blockLength =
        (lines[block.lastLine]?.end ?? 0) - (lines[block.firstLine]?.start ?? 0);
      const nextStartsHeading = block.rawHeadingLine !== undefined;
      if (
        !nextStartsHeading &&
        previousLength < CHUNK_MIN_CHARS &&
        previousLength + blockLength <= CHUNK_MAX_CHARS
      ) {
        previous.lastLine = block.lastLine;
        continue;
      }
    }
    merged.push({ ...block });
  }
  return merged;
};

const longLineSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});
const ASCII_LINE = /^[\x00-\x7F]*$/;

/**
 * Split one line that alone exceeds the chunk cap, at cluster boundaries.
 * Segmenting once per line keeps cold indexing linear; the previous helper
 * re-segmented the whole field for every 700-char slice.
 */
const splitLongLine = (
  text: string,
  line: SourceLine,
  rawHeadingLine: number | undefined,
  lineIndex: number,
): Piece[] => {
  const pieces: Piece[] = [];
  const heading = rawHeadingLine === lineIndex ? { rawHeadingLine } : {};
  const lineText = text.slice(line.start, line.end);
  let pieceStart = line.start;
  if (ASCII_LINE.test(lineText)) {
    // ASCII has one code unit per grapheme cluster (CRLF is handled below),
    // so the common log/minified-JSON case never enters Intl.Segmenter.
    let cursor = 0;
    while (cursor < lineText.length) {
      let next = Math.min(cursor + CHUNK_TARGET_CHARS, lineText.length);
      if (
        next < lineText.length &&
        lineText.charCodeAt(next - 1) === 13 &&
        lineText.charCodeAt(next) === 10
      ) {
        next--;
      }
      if (next <= cursor) next = Math.min(cursor + 1, lineText.length);
      pieces.push({
        start: line.start + cursor,
        end: line.start + next,
        ...heading,
        isList: false,
      });
      cursor = next;
    }
    return pieces;
  }
  for (const segment of longLineSegmenter.segment(lineText)) {
    const segmentEnd = line.start + segment.index + segment.segment.length;
    if (segmentEnd - pieceStart <= CHUNK_TARGET_CHARS) continue;
    const boundary = line.start + segment.index;
    if (boundary > pieceStart) {
      pieces.push({
        start: pieceStart,
        end: boundary,
        ...heading,
        isList: false,
      });
      pieceStart = boundary;
    }
  }
  if (pieceStart < line.end) {
    pieces.push({
      start: pieceStart,
      end: line.end,
      ...heading,
      isList: false,
    });
  }
  return pieces;
};

const splitBlocks = (
  text: string,
  blocks: readonly Block[],
  lines: readonly SourceLine[],
): Piece[] => {
  const pieces: Piece[] = [];
  for (const block of blocks) {
    let pieceStart = lines[block.firstLine]?.start ?? 0;
    let pieceEnd = pieceStart;
    for (let index = block.firstLine; index <= block.lastLine; index++) {
      const line = lines[index];
      if (!line) continue;
      const lineLength = line.end - line.start;
      if (lineLength > CHUNK_MAX_CHARS) {
        if (pieceEnd > pieceStart) {
          pieces.push({
            start: pieceStart,
            end: pieceEnd,
            ...(block.rawHeadingLine !== undefined &&
            block.rawHeadingLine >= block.firstLine &&
            block.rawHeadingLine < index
              ? { rawHeadingLine: block.rawHeadingLine }
              : {}),
            isList: false,
          });
        }
        pieces.push(
          ...splitLongLine(text, line, block.rawHeadingLine, index),
        );
        pieceStart = line.end;
        pieceEnd = line.end;
        continue;
      }
      if (pieceEnd > pieceStart && pieceEnd - pieceStart + lineLength > CHUNK_MAX_CHARS) {
        pieces.push({
          start: pieceStart,
          end: pieceEnd,
          ...(block.rawHeadingLine !== undefined &&
          block.rawHeadingLine >= block.firstLine &&
          block.rawHeadingLine < index
            ? { rawHeadingLine: block.rawHeadingLine }
            : {}),
          isList: false,
        });
        pieceStart = line.start;
      }
      pieceEnd = line.end;
    }
    if (pieceEnd > pieceStart) {
      pieces.push({
        start: pieceStart,
        end: pieceEnd,
        ...(block.rawHeadingLine !== undefined ? { rawHeadingLine: block.rawHeadingLine } : {}),
        isList: false,
      });
    }
  }
  return pieces;
};

const markHeadingAndList = (
  pieces: Piece[],
  text: string,
  lines: readonly SourceLine[],
): Piece[] => {
  const lineStartToIndex = new Map<number, number>();
  lines.forEach((line, index) => lineStartToIndex.set(line.start, index));
  return pieces.map((piece) => {
    const firstLineIndex = lineStartToIndex.get(piece.start);
    const isList =
      firstLineIndex === undefined
        ? false
        : !lines[firstLineIndex]?.inFenceBefore &&
          !lines[firstLineIndex]?.fence &&
          isListStart(lines[firstLineIndex] as SourceLine);
    return { ...piece, isList };
  });
};

/**
 * Chunk one saved field. Spans address the stored entry, never a copy. Heading
 * spans point at the source heading line; they are navigation metadata, not
 * separately rendered text.
 */
export const chunkField = (
  field: TextField,
  options: ChunkOptions = {},
): Chunk[] => {
  const text = field.text;
  if (text.length === 0) return [];
  const exclude = options.exclude ?? [];
  const lines = buildLines(text, exclude);
  const blocks = mergeShortBlocks(buildBlocks(lines), lines);
  const pieces = markHeadingAndList(
    splitBlocks(text, blocks, lines),
    text,
    lines,
  );

  const chunks: Chunk[] = [];
  let currentHeading: Span | undefined;
  for (const piece of pieces) {
    if (piece.rawHeadingLine !== undefined) {
      const line = lines[piece.rawHeadingLine];
      if (line) {
        const end = line.content.endsWith("\r")
          ? line.start + line.content.length - 1
          : line.start + line.content.length;
        currentHeading = {
          ownerId: field.ownerId,
          storageId: field.storageId,
          field: field.path,
          start: line.start,
          end,
        };
      }
    }
    const span: Span = {
      ownerId: field.ownerId,
      storageId: field.storageId,
      field: field.path,
      start: piece.start,
      end: piece.end,
    };
    chunks.push({
      span,
      ...(currentHeading ? { heading: { ...currentHeading } } : {}),
      ordinal: chunks.length,
      terms: termFrequency(text.slice(piece.start, piece.end)),
    });
  }
  return chunks;
};
