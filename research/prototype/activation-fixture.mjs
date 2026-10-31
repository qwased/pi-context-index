// Activation fixture construction shared by the experiment runner and the
// structural probes. Everything here is synthetic: the first user message of
// fixture A is stretched so that the view shows only a head/tail excerpt.

import { readFileSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView, COVER_MAX, READ_MAX } from "./render.mjs";
import { createReader } from "./reader.mjs";
import { PAGE_CHARS } from "./render.mjs";

const OUT = "research/prototype/out";

export const TARGET =
  "Activation target: the release checklist must be read from the saved original, never inferred from this excerpt.";
export const T5_TARGET =
  "Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture.";
// T6: the visible head states a complete-looking delivery rule; the correction
// sits in the hidden middle and shares no distinctive token with the question.
export const T6_VISIBLE =
  "Changelog checklist: a passing full test suite is sufficient; record the changelog entry immediately after it passes.";
export const T6_TARGET =
  "Release-note correction: a single green run is never sufficient; require an independent rerun before the entry is recorded.";

const filler = (i) =>
  `Synthetic filler line ${i}: this line exists only to make the first message long enough to be excerpted by the view budget.`;
const shortLine = (i) => `Synthetic head line ${i}: short line used only to place the hidden span.`;

// render "1" = render-1 bytes; "2" = hidden address; "3" = page table and the
// cost-accounted max window; "4" = render-3 with a 48,000 max window (explore);
// "5" = render-3 plus the merged cover call (server-side multi-window read).
// "6" = render-3 plus window calls enumerated in the timeline (explore).
export const buildActivation = ({ variant = "t6", render = "1", coverMax = COVER_MAX } = {}) => {
  const fixture = makeFixture("A");
  const first = fixture.entries.find((e) => e.message?.role === "user");
  const original = first.message.content;
  const NEAR = variant.endsWith("n");
  const LONG = variant.endsWith("l");
  const BASE_VARIANT = variant.replace(/n$/, "").replace(/l$/, "");
  const middle = BASE_VARIANT === "t5" ? [TARGET, T5_TARGET] : BASE_VARIANT === "t6" ? [T6_TARGET] : [TARGET];
  const head = BASE_VARIANT === "t6" ? [T6_VISIBLE] : [];
  // t6l keeps the same visible rule and target, but moves the target past the
  // first 12,000-char window: two reads are needed to cover the span.
  const before = LONG ? 150 : 60;
  const after = LONG ? 150 : 60;
  first.message.content = NEAR
    ? [
        BASE_VARIANT === "t6" ? T6_VISIBLE : "Allocator-golden rule: do not regenerate tests/fixtures/allocator-golden.json.",
        ...Array.from({ length: 13 }, (_, i) => shortLine(i + 1)),
        BASE_VARIANT === "t6" ? T6_TARGET : T5_TARGET,
        original,
        ...Array.from({ length: 30 }, (_, i) => filler(i + 1)),
      ].join("\n")
    : [
        ...head,
        original,
        ...Array.from({ length: before }, (_, i) => filler(i + 1)),
        ...middle,
        ...Array.from({ length: after }, (_, i) => filler(i + before + 1)),
      ].join("\n");

  const catalog = buildCatalog(fixture);
  const pageTable = render === "3" || render === "4" || render === "5";
  const address = render !== "1";
  const cover = render === "5";
  const maxRead = render === "4" ? 48000 : READ_MAX;
  const view = buildView(catalog, {
    capChars: 6287,
    includeCounters: false,
    hiddenAddress: address,
    pageTable,
    maxRead,
    cover,
    coverMax,
  });
  const reader = createReader({ catalog, view, hiddenAddress: address, pageTable, maxRead, cover, coverMax });
  const tail = readFileSync(`${OUT}/tail-A.txt`, "utf8");
  const targetOffset = first.message.content.indexOf(TARGET);
  const t5Offset = first.message.content.indexOf(T5_TARGET);
  const t6Offset = first.message.content.indexOf(T6_TARGET);
  const hiddenMatch = view.text.match(/field=content (\d+)-(\d+) of (\d+)/);
  const hiddenStart = hiddenMatch ? Number(hiddenMatch[1]) : null;
  const hiddenEnd = hiddenMatch ? Number(hiddenMatch[2]) : null;
  const hiddenSpan = hiddenStart !== null && hiddenEnd !== null ? hiddenEnd - hiddenStart : null;
  const hiddenPages = hiddenSpan === null ? null : Math.ceil(hiddenSpan / PAGE_CHARS);
  const hiddenWindows = hiddenSpan === null ? null : Math.ceil(hiddenSpan / maxRead);
  const firstFieldText = catalog.E.find((r) => r.n === 1)?.fields.find((f) => f.path === "content")?.text ?? "";
  const firstLineStarts = [0];
  for (let i = 0; i < firstFieldText.length; i++) if (firstFieldText[i] === "\n") firstLineStarts.push(i + 1);
  const inFirstPage = (offset) =>
    hiddenStart !== null && offset >= hiddenStart && offset < hiddenStart + PAGE_CHARS;
  return {
    variant,
    render,
    cover,
    coverMax,
    pageTable,
    address,
    maxRead,
    fixture,
    catalog,
    view,
    reader,
    tail,
    first,
    firstFieldText,
    firstLineStarts,
    targetOffset,
    t5Offset,
    t6Offset,
    hiddenStart,
    hiddenEnd,
    hiddenSpan,
    hiddenPages,
    hiddenWindows,
    t5InFirstPage: inFirstPage(t5Offset),
    t6InFirstPage: inFirstPage(t6Offset),
    baseVariant: BASE_VARIANT,
    near: NEAR,
    long: LONG,
  };
};
