import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView } from "./render.mjs";
import { createReader, hiddenRunsFor, pageStartsFor } from "./reader.mjs";

const original = makeFixture("A").entries.find((e) => e.message?.role === "user").message.content;
const T5_TARGET = "Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture.";
const T6_VISIBLE = "Changelog checklist: a passing full test suite is sufficient; record the changelog entry immediately after it passes.";
const T6_TARGET = "Release-note correction: a single green run is never sufficient; require an independent rerun before the entry is recorded.";
const filler = (i) => `Synthetic filler line ${i}: this line exists only to make the first message long enough to be excerpted by the view budget.`;
const shortLine = (i) => `Synthetic head line ${i}: short line used only to place the hidden span.`;
const build = (variant, pageTable) => {
  const fixture = makeFixture("A");
  const first = fixture.entries.find((e) => e.message?.role === "user");
  const near = variant.endsWith("n");
  const long = variant.endsWith("l");
  const base = variant.replace(/n$/, "").replace(/l$/, "");
  const middle = base === "t6" ? [T6_TARGET] : [T5_TARGET];
  const before = long ? 150 : 60;
  const after = long ? 150 : 60;
  first.message.content = near
    ? [T6_VISIBLE, ...Array.from({ length: 13 }, (_, i) => shortLine(i + 1)), T6_TARGET, original, ...Array.from({ length: 30 }, (_, i) => filler(i + 1))].join("\n")
    : [T6_VISIBLE, original, ...Array.from({ length: before }, (_, i) => filler(i + 1)), ...middle, ...Array.from({ length: after }, (_, i) => filler(i + before + 1))].join("\n");
  const catalog = buildCatalog(fixture);
  const view = buildView(catalog, { capChars: 6287, includeCounters: false, pageTable });
  const reader = createReader({ catalog, view, hiddenAddress: pageTable, pageTable });
  const runs = hiddenRunsFor(catalog, view, 1);
  const run = runs.filter((r) => r.field === "content").sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const text = catalog.E.find((r) => r.n === 1).fields.find((f) => f.path === "content").text;
  return { variant, pageTable, viewChars: view.text.length, viewId: view.manifest.id, used: view.usedChars, needed: view.neededChars, run, pages: pageStartsFor(run), target: text.indexOf(T6_TARGET), firstLine: view.text.split("\n").find((l) => l.startsWith("U #1")), viewLine: reader.run({ view: view.manifest.id, offset: 0, limit: 1 }).split("\n").find((l) => l.startsWith("#1 ")), reads: [
    ["page2", reader.run({ read: { index: 1, field: "content", page: 2 } })],
    ["max", reader.run({ read: { index: 1, field: "content", offset: run.start, length: 12000 } })],
    ["line90", reader.run({ read: { index: 1, field: "content", line: 90, length: 200 } })],
    ["both", reader.run({ read: { index: 1, field: "content", page: 1, line: 2 } })],
    ["page999", reader.run({ read: { index: 1, field: "content", page: 999 } })],
    ["line9999", reader.run({ read: { index: 1, field: "content", line: 9999 } })],
  ].map(([k, v]) => [k, String(v).split("\n").slice(0, 2).join(" | "), String(v).split("\n").filter((l) => l.startsWith("[")).join(" | ")]) };
};
console.log(JSON.stringify(["t6","t6n","t6l"].map((v) => build(v, true)), null, 2));
