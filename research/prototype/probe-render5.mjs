// Structural probe for render-5 (merged cover read). Synthetic only; prints
// counts, ids, ranges and cost lines, never long source text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildActivation } from "./activation-fixture.mjs";
import { COVER_MAX, READ_MAX } from "./render.mjs";

const OUT = "research/prototype/out";
const documented = {
  t6: { render3: "vfdaf9adb", chars3: 6177, render2: "v3b06626c", render1: "vae2e0d09" },
  t6n: { render3: "v761c5494", chars3: 6211, render2: "v23075d99", render1: "v70d68dca" },
  t6l: { render3: "v0dabfee8", chars3: 6177, render2: null, render1: null },
};
const report = { note: "Synthetic fixture; structural checks only.", rows: [], checks: {} };

const coverLine = (text) => text.split("\n").find((line) => /^U #1 \[/.test(line) && line.includes("cover: {"));

for (const [variant, expected] of Object.entries(documented)) {
  const r3 = buildActivation({ variant, render: "3" });
  const r5 = buildActivation({ variant, render: "5" });
  const r1 = buildActivation({ variant, render: "1" });
  const r2 = buildActivation({ variant, render: "2" });
  if (expected.render3) assert.equal(r3.view.manifest.id, expected.render3, variant + " render-3 view id changed");
  if (expected.chars3) assert.equal(r3.view.text.length, expected.chars3, variant + " render-3 chars changed");
  if (expected.render2) assert.equal(r2.view.manifest.id, expected.render2, variant + " render-2 view id changed");
  if (expected.render1) assert.equal(r1.view.manifest.id, expected.render1, variant + " render-1 view id changed");
  const line3 = coverLine(r3.view.text);
  const line5 = coverLine(r5.view.text);
  assert.equal(line3, undefined, variant + " render-3 unexpectedly has a cover call");
  // The cover clause is charged to the same budget, so render-5 is NOT a
  // superset of render-3: it can displace a quoted line or a ledger row. Record
  // the displacement instead of asserting byte equality.
  const stripped = r5.view.text.replace(/; cover: \{[^}]*\} ~\d+tok \([^)]*\)/, "");
  const timeline = (t) => t.split("\n").filter((l) => /^[UACOE] #|[UACOE] (error|host|_) /.test(l));
  const lines3 = timeline(r3.view.text);
  const lines5 = timeline(r5.view.text);
  const address = line5 ? JSON.parse(line5.match(/cover: (\{[^}]*\})/)[1]) : null;
  if (address) {
    const covered = Math.min(r5.coverMax, r5.hiddenSpan);
    const printed = Number(line5.match(/cover: \{[^}]*\} ~(\d+)tok/)[1]);
    assert.equal(printed, Math.ceil(covered / 3.14), variant + " cover cost is not the covered span cost");
  }
  const span = r5.hiddenSpan;
  let cover = null;
  if (address) {
    const out = r5.reader.run(address);
    const head = out.split("\n")[0];
    const cost = out.split("\n").find((line) => line.startsWith("[cost "));
    const body = out.split("\n").slice(1, out.split("\n").indexOf(cost)).join("\n");
    const src = r5.firstFieldText.slice(address.offset, address.offset + body.length);
    assert.equal(body, src, variant + " cover body is not the exact source slice");
    const m = head.match(/field=content (\d+)-(\d+) of (\d+) \(cover: (\d+) windows? merged, hidden span (\d+)-(\d+)\)/);
    assert.ok(m, variant + " cover header shape differs: " + head);
    assert.equal(Number(m[1]), r5.hiddenStart, "cover start differs from hidden start");
    assert.equal(Number(m[2]) - Number(m[1]), body.length, "cover range length differs from body");
    assert.match(cost, new RegExp("\\[cost " + body.length + " chars ~\\d+tok; hidden span " + r5.hiddenStart + "-" + r5.hiddenEnd + ", unread 0\\]"));
    assert.match(out, /\[end of hidden span; field continues to \d+\]/);
    assert.ok(address.offset <= r5.t6Offset && r5.t6Offset < address.offset + body.length, variant + " cover does not contain the target");
    cover = { chars: body.length, windows: Number(m[4]), head, cost, targetCovered: true };
  }
  report.rows.push({
    variant,
    hiddenSpan: span,
    render3: { id: r3.view.manifest.id, chars: r3.view.text.length, timelineRows: lines3.length },
    render5: {
      id: r5.view.manifest.id,
      chars: r5.view.text.length,
      cap: r5.view.capChars,
      timelineRows: lines5.length,
      sameTimelineSkeleton: stripped === r3.view.text,
      deltaChars: r5.view.text.length - r3.view.text.length,
      removedLines: lines3.filter((l) => !lines5.includes(l)).length,
      addedLines: lines5.filter((l) => !lines3.includes(l)).length,
      address,
      cover,
      line: line5 ?? null,
    },
  });
  assert.ok(r5.view.text.length <= r5.view.capChars, variant + " render-5 exceeds its cap");
}

// coverMax truncation: the merged read stops at the policy bound, reports the
// unread remainder and gives an executable next offset.
const bounded = buildActivation({ variant: "t6l", render: "5", coverMax: 20000 });
const boundedLine = coverLine(bounded.view.text);
const windows = Math.ceil(bounded.hiddenSpan / 12000);
assert.ok(boundedLine.includes("first 2 of " + windows + " windows"), "coverMax 20000 should print a partial cover");
const boundedCall = JSON.parse(boundedLine.match(/cover: (\{[^}]*\})/)[1]);
const partial = bounded.reader.run(boundedCall);
const boundedEnd = bounded.hiddenStart + 20000;
assert.ok(partial.startsWith("#1 [user] field=content " + bounded.hiddenStart + "-" + boundedEnd + " of " + bounded.firstFieldText.length + " (cover: 2 windows merged"), "partial cover header: " + partial.split("\n")[0]);
assert.match(partial, new RegExp("\\[cover incomplete: 20000 of " + bounded.hiddenSpan + " chars; next: read #1 field=\"content\" offset=" + boundedEnd + " length=12000\\]"));
assert.match(partial, new RegExp("unread " + (bounded.hiddenSpan - 20000)));
const nextOffset = Number(partial.match(/offset=(\d+) length=12000\]/)[1]);
const nextArgs = { read: 1, field: "content", offset: nextOffset, length: 12000 };
const nextOut = bounded.reader.run(nextArgs);
assert.equal(nextOut.split("\n")[1], bounded.firstFieldText.slice(nextOffset, nextOffset + 12000).split("\n")[0], "next offset is not executable");
assert.equal(nextArgs.offset, boundedEnd);

// Locator conflicts and bounds are explicit errors, never silent clamping.
const r5 = buildActivation({ variant: "t6", render: "5" });
assert.match(r5.reader.run({ read: { index: 1, field: "content", offset: r5.hiddenStart, cover: true, length: 1200 } }), /cover and length are mutually exclusive/);
assert.match(r5.reader.run({ read: { index: 1, field: "content", cover: true, page: 2 } }), /cover cannot be combined with page or line/);
assert.match(r5.reader.run({ read: { index: 1, field: "content", offset: 999999, cover: true } }), /outside 0-\d+ of field/);

// The view listing exposes the same cover call for the same span.
const entryIndex = r5.view.manifest.entries.findIndex((e) => e.n === 1);
const page = r5.reader.run({ view: r5.view.manifest.id, offset: entryIndex, limit: 1 });
const listed = page.match(/cover: (\{"read":1,"field":"content","offset":\d+,"cover":true\})/);
assert.ok(listed, "view listing has no cover call");
assert.ok(r5.reader.run(JSON.parse(listed[1])).includes(r5.firstFieldText.slice(r5.hiddenStart, r5.hiddenStart + 40)), "view cover call does not execute");
assert.equal(COVER_MAX, 48000);
assert.equal(READ_MAX, 12000);

report.checks = {
  render1And2BytesUnchanged: true,
  render3BytesUnchanged: true,
  render5DisplacementRecorded: true,
  coverReturnsExactSliceAndCost: true,
  coverContainsTarget: true,
  coverMaxTruncationHasNext: true,
  locatorConflictsExplicit: true,
  viewListingCoverExecutes: true,
};
console.log(JSON.stringify(report, null, 2));
