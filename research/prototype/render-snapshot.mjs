// Snapshot the render-1 and render-2 view bytes before the render-3 change.
// Synthetic only; writes hashes and lengths, never view text.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView } from "./render.mjs";

const OUT = process.env.SNAP_OUT ?? "before";
const variants = ["base", "t5", "t5n", "t6", "t6n"];
const rows = [];

const baseFixture = makeFixture("A");
const baseFirst = baseFixture.entries.find((e) => e.message?.role === "user");
const original = baseFirst.message.content;
const TARGET = "Activation target: the release checklist must be read from the saved original, never inferred from this excerpt.";
const T5_TARGET = "Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture.";
const T6_VISIBLE = "Changelog checklist: a passing full test suite is sufficient; record the changelog entry immediately after it passes.";
const T6_TARGET = "Release-note correction: a single green run is never sufficient; require an independent rerun before the entry is recorded.";
const filler = (i) => `Synthetic filler line ${i}: this line exists only to make the first message long enough to be excerpted by the view budget.`;
const shortLine = (i) => `Synthetic head line ${i}: short line used only to place the hidden span.`;

const buildFor = (variant) => {
  const fixture = makeFixture("A");
  const first = fixture.entries.find((e) => e.message?.role === "user");
  if (variant !== "base") {
    const near = variant.endsWith("n");
    const base = variant.replace(/n$/, "");
    const middle = base === "t5" ? [TARGET, T5_TARGET] : base === "t6" ? [T6_TARGET] : [TARGET];
    const head = base === "t6" ? [T6_VISIBLE] : [];
    first.message.content = near
      ? [
          base === "t6" ? T6_VISIBLE : "Allocator-golden rule: do not regenerate tests/fixtures/allocator-golden.json.",
          ...Array.from({ length: 13 }, (_, i) => shortLine(i + 1)),
          base === "t6" ? T6_TARGET : T5_TARGET,
          original,
          ...Array.from({ length: 30 }, (_, i) => filler(i + 1)),
        ].join("\n")
      : [
          ...head,
          original,
          ...Array.from({ length: 60 }, (_, i) => filler(i + 1)),
          ...middle,
          ...Array.from({ length: 60 }, (_, i) => filler(i + 61)),
        ].join("\n");
  }
  const catalog = buildCatalog(fixture);
  const out = {};
  for (const mode of ["render1", "render2"]) {
    const view = buildView(catalog, { capChars: 6287, includeCounters: false, hiddenAddress: mode === "render2" });
    out[mode] = {
      id: view.manifest.id,
      chars: view.text.length,
      sha256: createHash("sha256").update(view.text).digest("hex"),
    };
  }
  return out;
};

for (const variant of variants) rows.push({ variant, ...buildFor(variant) });
const report = { note: "Synthetic fixture only. Hash of the exact view text; no view text stored.", rows };
writeFileSync(`research/prototype/out/render-snapshot-${OUT}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
