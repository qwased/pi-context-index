import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView } from "./render.mjs";
const original = makeFixture("A").entries.find((e) => e.message?.role === "user").message.content;
const TARGET = "Activation target: the release checklist must be read from the saved original, never inferred from this excerpt.";
const T5_TARGET = "Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture.";
const T6_VISIBLE = "Changelog checklist: a passing full test suite is sufficient; record the changelog entry immediately after it passes.";
const T6_TARGET = "Release-note correction: a single green run is never sufficient; require an independent rerun before the entry is recorded.";
const filler = (i) => `Synthetic filler line ${i}: this line exists only to make the first message long enough to be excerpted by the view budget.`;
const shortLine = (i) => `Synthetic head line ${i}: short line used only to place the hidden span.`;
const build = (variant) => {
  const fixture = makeFixture("A");
  const first = fixture.entries.find((e) => e.message?.role === "user");
  const near = variant.endsWith("n");
  const base = variant.replace(/n$/, "");
  const middle = base === "t5" ? [TARGET, T5_TARGET] : base === "t6" ? [T6_TARGET] : [TARGET];
  first.message.content = near
    ? [base === "t6" ? T6_VISIBLE : "Allocator-golden rule: do not regenerate tests/fixtures/allocator-golden.json.", ...Array.from({ length: 13 }, (_, i) => shortLine(i + 1)), base === "t6" ? T6_TARGET : T5_TARGET, original, ...Array.from({ length: 30 }, (_, i) => filler(i + 1))].join("\n")
    : [...(base === "t6" ? [T6_VISIBLE] : []), original, ...Array.from({ length: 60 }, (_, i) => filler(i + 1)), ...middle, ...Array.from({ length: 60 }, (_, i) => filler(i + 61))].join("\n");
  const catalog = buildCatalog(fixture);
  const view = buildView(catalog, { capChars: 6287, includeCounters: false, hiddenAddress: true });
  const firstEntry = view.manifest.entries.find((e) => e.n === 1);
  const field = firstEntry.fields?.[0];
  const shown = [...(field?.shown ?? [])].sort((a,b)=>a.start-b.start);
  const gaps = []; let cursor = 0;
  for (const s of shown) { if (s.start > cursor) gaps.push([cursor, s.start]); cursor = Math.max(cursor, s.end); }
  if (cursor < field.length) gaps.push([cursor, field.length]);
  const runs = gaps.filter(([a,b]) => field.text ? true : true).map(([a,b]) => ({ start: a, end: b, len: b-a }));
  const text = catalog.E.find((r) => r.n === 1).fields.find((f) => f.path === "content").text;
  const targetOffset = text.indexOf(base === "t6" ? T6_TARGET : base === "t5" ? T5_TARGET : TARGET);
  return { variant, viewChars: view.text.length, viewId: view.manifest.id, fieldLen: field.length, runs, targetOffset, firstLine: view.text.split("\n").find((l) => l.startsWith("U #1")) };
};
console.log(JSON.stringify(["t5","t5n","t6","t6n"].map(build), null, 2));
