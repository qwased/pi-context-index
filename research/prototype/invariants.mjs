// Structural invariant checks for the prototype. Run with: node invariants.mjs

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { makeFixture, makeEditFixture } from "./fixtures.mjs";
import { buildCatalog, fieldsOfMessage, textOf } from "./catalog.mjs";
import { buildView, budgetFor, CHARS_PER_TOKEN } from "./render.mjs";
import { createReader } from "./reader.mjs";

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
  }
};

const quotedSourceText = (catalog, manifest, entry) => {
  const rec = catalog.E.find((r) => r.n === entry.n);
  const out = [];
  for (const field of entry.fields ?? []) {
    const src = rec.fields.find((f) => f.path === field.field);
    assert.ok(src, `field ${field.field} missing on #${entry.n}`);
    const intervals = [...field.shown, ...field.hidden].sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = 0;
    for (const span of intervals) {
      assert.equal(span.start, cursor, `field ${field.field} of #${entry.n} has a gap/overlap at ${cursor}`);
      assert.ok(span.end >= span.start, "negative span");
      cursor = span.end;
    }
    assert.equal(cursor, src.text.length, `field ${field.field} of #${entry.n} does not cover the source`);
    for (const span of field.shown) out.push(src.text.slice(span.start, span.end));
  }
  return out;
};

const fixture = makeFixture("A");
const catalog = buildCatalog(fixture);
const view6287 = buildView(catalog, { capChars: 6287 });
const view8217 = buildView(catalog, { capChars: 8217 });
const view12560 = buildView(catalog, { capChars: 12560 });
const reader = createReader({ catalog, view: view8217 });

check("fixture scale and partition", () => {
  assert.equal(fixture.expected.expectedSaved, 470);
  assert.equal(catalog.counts.saved, 470);
  assert.equal(catalog.counts.effective, 467);
  assert.equal(catalog.counts.live, 30);
  assert.equal(catalog.counts.x, 3);
  assert.equal(catalog.counts.xByReason.system, 1);
  assert.equal(catalog.counts.xByReason["off-branch"], 2);
  assert.equal(catalog.counts.custom, 1);
  assert.equal(catalog.counts.customExcluded, 1);
  assert.equal(catalog.counts.unaccounted, 0);
  assert.equal(catalog.counts.effective + catalog.counts.x, catalog.counts.saved);
});

check("ledger scale and scopes", () => {
  assert.equal(catalog.observations.mutationTotal, 71);
  assert.equal(catalog.observations.mutationPaths.length, 71);
  assert.equal(catalog.observations.errors.length, 3);
  const byVector = new Map(catalog.observations.counters.map((c) => [`${c.pass}/${c.fail}`, c]));
  for (const [pass, fail] of [[422, 0], [243, 0], [1139, 0]]) {
    assert.ok(byVector.has(`${pass}/${fail}`), `missing counter ${pass}/${fail}`);
  }
  assert.equal(byVector.get("422/0").refs.resultRef, fixture.expected.early.ref);
  assert.equal(byVector.get("422/0").field, "content.0.text");
  assert.ok(byVector.get("422/0").offset > 20000);
});

check("view is deterministic and within cap", () => {
  const a = buildView(catalog, { capChars: 8217 });
  const b = buildView(catalog, { capChars: 8217 });
  assert.equal(a.text, b.text);
  assert.equal(JSON.stringify(a.manifest), JSON.stringify(b.manifest));
  for (const v of [view6287, view8217, view12560]) {
    assert.ok(v.text.length <= v.capChars, `${v.capChars}: ${v.text.length} > cap`);
    assert.equal(v.text.length, v.usedChars);
    assert.equal(v.counts.live + v.counts.quoted + v.counts.indexOnly + v.counts.unavailable, v.counts.effective);
    assert.equal(v.counts.unaccounted, 0);
  }
});

check("needed cutoff does not spend unused budget", () => {
  assert.equal(view8217.text, view12560.text);
  assert.equal(view8217.usedChars, view8217.neededChars);
  assert.ok(view6287.text.length <= 6287);
  assert.ok(view6287.counts.quoted < view8217.counts.quoted);
});

check("quoted spans are exact and field partitions are complete", () => {
  for (const v of [view6287, view8217]) {
    for (const entry of v.manifest.entries) {
      if (entry.status !== "Quoted") continue;
      const quotes = quotedSourceText(catalog, v.manifest, entry);
      for (const quote of quotes) assert.ok(v.text.includes(quote), `quoted text missing for #${entry.n}`);
    }
  }

  // render-2: every partial quote carries a field/offset and an executable read
  // that returns the hidden text at that offset. The marker is structural text,
  // so the same regex is checked on U and A lines, not just on Quoted entries.
  // The base fixture's first user message fits whole, so a partial quote needs
  // the activation shape: same fixture with a long first message.
  const longFixture = makeFixture("A");
  const firstUser = longFixture.entries.find((e) => e.message?.role === "user");
  firstUser.message.content = [
    firstUser.message.content,
    ...Array.from({ length: 60 }, (_, i) => `Synthetic filler line ${i + 1}: this line exists only to make the first message long enough to be excerpted by the view budget.`),
    ...Array.from({ length: 60 }, (_, i) => `Synthetic filler line ${i + 61}: this line exists only to make the first message long enough to be excerpted by the view budget.`),
  ].join("\n");
  const longCatalog = buildCatalog(longFixture);
  const addressed = buildView(longCatalog, { capChars: 6287, includeCounters: false, hiddenAddress: true });
  const addressedReader = createReader({ catalog: longCatalog, view: addressed, hiddenAddress: true });
  const addressedSource = (n) => longCatalog.E.find((r) => r.n === n).fields.find((f) => f.path === "content") ??
    longCatalog.E.find((r) => r.n === n).fields.find((f) => f.path.endsWith(".text"));
  const addressRe = /field=(\S+) (\d+)-(\d+) of (\d+); read: (\{"read":(\d+),"field":"([^"]+)","offset":(\d+),"length":(\d+)\})/;
  const partialMarkers = addressed.text.split("\n").filter((line) => /^[UA] #\d+ \[/.test(line));
  assert.ok(partialMarkers.length > 0, "no partial quote to address");
  for (const line of partialMarkers) {
    const n = Number(line.match(/^[UA] #(\d+)/)[1]);
    const m = line.match(addressRe);
    assert.ok(m, `no hidden address on: ${line}`);
    assert.equal(Number(m[6]), n, "address #N differs from the line");
    assert.equal(Number(m[8]), Number(m[2]), "read offset differs from the address start");
    const args = JSON.parse(m[5]);
    const out = addressedReader.run(args);
    const field = addressedSource(n);
    assert.ok(field, `#${n} has no source field`);
    assert.ok(out.includes(field.text.slice(Number(m[2]), Number(m[2]) + 40)), `read does not return the hidden start for #${n}`);
  }
  for (const line of addressed.text.split("\n").filter((l) => /^[UA] #\d+ \(full/.test(l))) {
    assert.doesNotMatch(line, addressRe, `full quote has a hidden address: ${line}`);
  }

  // render-3: a run longer than one page gets the span/pages/windows descriptor
  // and the cost-accounted max call. The max call covers the printed start, the
  // page starts are exact, page/line resolve server-side, and the returned text
  // is the exact source slice. The read result carries the cost line.
  const paged = buildView(longCatalog, { capChars: 6287, includeCounters: false, pageTable: true });
  const pagedReader = createReader({ catalog: longCatalog, view: paged, pageTable: true });
  const spanRe = /field=(\S+) (\d+)-(\d+) of (\d+); span=(\d+) pages=(\d+) windows=(\d+); max: (\{"read":(\d+),"field":"([^"]+)","offset":(\d+),"length":(\d+)\})/;
  const pagedMarkers = paged.text.split("\n").filter((line) => /^[UA] #\d+ \[/.test(line));
  const pagedLine = pagedMarkers.find((line) => line.includes("; span="));
  assert.ok(pagedLine, "no render-3 span descriptor on a partial quote");
  const sm = pagedLine.match(spanRe);
  assert.ok(sm, `render-3 address shape differs: ${pagedLine}`);
  const pagedN = Number(pagedLine.match(/^[UA] #(\d+)/)[1]);
  const spanStart = Number(sm[2]);
  const spanEnd = Number(sm[3]);
  const spanChars = Number(sm[5]);
  assert.equal(spanChars, spanEnd - spanStart, "span length differs from the range");
  assert.equal(Number(sm[6]), Math.ceil(spanChars / 1200), "page count differs");
  assert.equal(Number(sm[7]), Math.ceil(spanChars / 12000), "window count differs");
  const maxArgs = JSON.parse(sm[8]);
  assert.equal(Number(sm[9]), pagedN, "max call #N differs");
  assert.equal(Number(sm[11]), spanStart, "max call offset differs from the span start");
  assert.equal(Number(sm[12]), Math.min(12000, spanChars), "max call length differs");
  const pagedSource = longCatalog.E.find((r) => r.n === pagedN).fields.find((f) => f.path === sm[1]);
  assert.ok(pagedSource, "render-3 source field missing");
  const maxOut = pagedReader.run(maxArgs);
  assert.ok(maxOut.includes(pagedSource.text.slice(spanStart, spanStart + 40)), "max read does not return the span start");
  assert.match(maxOut, /\[cost \d+ chars ~\d+tok; hidden span \d+-\d+, unread \d+\]/);

  // The page table is in the view listing; every printed start is on the exact
  // 1,200 grid anchored at the run start, and the page locator returns that slice.
  const pagedIndex = paged.manifest.entries.findIndex((e) => e.n === pagedN);
  assert.ok(pagedIndex >= 0, "render-3 entry missing from the manifest");
  const pageRow = pagedReader.run({ view: paged.manifest.id, offset: pagedIndex, limit: 1 });
  const pageTable = pageRow.match(/pages@([0-9,]+)/);
  assert.ok(pageTable, "no page table in the view listing");
  const starts = pageTable[1].split(",").filter(Boolean).map(Number);
  assert.ok(starts.length > 0, "empty page table");
  for (let i = 0; i < starts.length; i++) {
    assert.equal(starts[i], spanStart + i * 1200, "page start is off the 1,200 grid");
  }
  const secondPage = pagedReader.run({ read: { index: pagedN, field: sm[1], page: 2 } });
  assert.ok(secondPage.includes(pagedSource.text.slice(spanStart + 1200, spanStart + 1240)), "page 2 does not return the page slice");
  assert.match(secondPage, /\[cost 1200 chars ~383tok/);
  const pageRange = secondPage.match(/field=\S+ (\d+)-(\d+) of \d+/);
  assert.ok(pageRange, "page read has no range line");
  assert.equal(Number(pageRange[2]) - Number(pageRange[1]), 1200, "cost chars differ from the returned range");
  assert.match(pagedReader.run({ read: { index: pagedN, field: sm[1], page: 0 } }), /outside 1-\d+/);
  assert.match(pagedReader.run({ read: { index: pagedN, field: sm[1], line: 99999 } }), /outside 1-\d+/);
  assert.match(pagedReader.run({ read: { index: pagedN, field: sm[1], page: 1, line: 2 } }), /mutually exclusive/);
  const lineOut = pagedReader.run({ read: { index: pagedN, field: sm[1], line: 2, length: 20 } });
  const line2 = pagedSource.text.indexOf("\n", 0) + 1;
  assert.ok(lineOut.includes(pagedSource.text.slice(line2, line2 + 20)), "line read did not resolve to the field line");
  assert.ok(paged.usedChars <= paged.capChars, "render-3 view exceeds its cap");

  // render-5 (opt-in): a run longer than one read window gets one merged
  // cover call. Its result is the exact source slice, reports one total cost,
  // says the span is finished, and never appears in the render-3 view. The
  // address and the reader bound come from the same coverMax policy.
  assert.doesNotMatch(paged.text, /cover: \{/, "render-3 view contains a cover call");
  const covered = buildView(longCatalog, { capChars: 6287, includeCounters: false, pageTable: true, cover: true });
  const coveredReader = createReader({ catalog: longCatalog, view: covered, pageTable: true, cover: true });
  const coveredLine = covered.text.split("\n").find((line) => /^U #\d+ \[/.test(line) && line.includes("cover: {"));
  assert.ok(coveredLine, "no render-5 cover call on a multi-window span");
  const coverArgs = JSON.parse(coveredLine.match(/cover: (\{"read":\d+,"field":"[^"]+","offset":\d+,"cover":true\})/)[1]);
  assert.equal(Number(coverArgs.read), Number(coveredLine.match(/^U #(\d+)/)[1]), "cover call #N differs from the line");
  const coverAddress = coveredLine.match(/field=(\S+) (\d+)-(\d+) of (\d+); span=(\d+) pages=(\d+) windows=(\d+); max: \{[^}]*\} ~\d+tok; cover: \{[^}]*\} ~(\d+)tok \((all windows|first \d+ of \d+ windows)\)/);
  assert.ok(coverAddress, "render-5 address shape differs: " + coveredLine);
  const coverStart = Number(coverAddress[2]);
  const coverEnd = Number(coverAddress[3]);
  const coverSpan = Number(coverAddress[5]);
  const coverLabel = coverAddress[9];
  const coverField = longCatalog.E.find((r) => r.n === coverArgs.read).fields.find((f) => f.path === coverAddress[1]);
  assert.ok(coverField, "render-5 source field missing");
  assert.equal(Number(coverArgs.offset), coverStart, "cover offset differs from the span start");
  const coverOut = coveredReader.run(coverArgs);
  const coverLines = coverOut.split("\n");
  const coverCost = coverLines.find((line) => line.startsWith("[cost "));
  const coverBody = coverLines.slice(1, coverLines.indexOf(coverCost)).join("\n");
  if (coverLabel === "all windows") {
    assert.equal(coverBody, coverField.text.slice(coverStart, coverEnd), "cover body is not the exact span slice");
    assert.equal(coverBody.length, coverSpan, "cover body length differs from the printed span");
    assert.match(coverCost, new RegExp("\\[cost " + coverSpan + " chars ~\\d+tok; hidden span " + coverStart + "-" + coverEnd + ", unread 0\\]"));
    assert.match(coverOut, /\[end of hidden span; field continues to \d+\]/);
    assert.equal(Number(coverAddress[8]), Math.ceil(coverSpan / CHARS_PER_TOKEN), "printed cover cost differs");
  } else {
    assert.match(coverOut, /\[cover incomplete: \d+ of \d+ chars; next: read #\d+ field="[^"]+" offset=\d+ length=12000\]/);
    assert.match(coverCost, /unread [1-9]\d*/);
  }
  assert.ok(covered.text.length <= covered.capChars, "render-5 view exceeds its cap");
  const bounded = buildView(longCatalog, { capChars: 6287, includeCounters: false, pageTable: true, cover: true, coverMax: 5000 });
  const boundedReader = createReader({ catalog: longCatalog, view: bounded, pageTable: true, cover: true, coverMax: 5000 });
  const boundedLine = bounded.text.split("\n").find((line) => /^U #\d+ \[/.test(line) && line.includes("cover: {"));
  if (boundedLine) {
    const boundedArgs = JSON.parse(boundedLine.match(/cover: (\{"read":\d+,"field":"[^"]+","offset":\d+,"cover":true\})/)[1]);
    const boundedOut = boundedReader.run(boundedArgs);
    assert.match(boundedOut, /cover: 1 window merged|cover: \d+ windows merged/);
    assert.match(boundedOut, /\[cover incomplete: \d+ of \d+ chars; next: read #\d+ field="[^"]+" offset=\d+ length=12000\]/);
    const nextOffset = Number(boundedOut.match(/offset=(\d+) length=12000\]/)[1]);
    assert.equal(nextOffset, Number(boundedArgs.offset) + 5000, "coverMax bound differs from the next offset");
  }
  assert.match(coveredReader.run({ read: { index: coverArgs.read, field: coverAddress[1], cover: true, length: 100 } }), /cover and length are mutually exclusive/);
  assert.match(coveredReader.run({ read: { index: coverArgs.read, field: coverAddress[1], cover: true, page: 1 } }), /cover cannot be combined with page or line/);
});

check("reader view enumerates every manifest entry", () => {
  let offset = 0;
  const seen = new Set();
  const addressed = buildView(catalog, { capChars: 8217, hiddenAddress: true });
  const addressedReader = createReader({ catalog, view: addressed, hiddenAddress: true });
  const addressedPage = addressedReader.run({ view: addressed.manifest.id, offset: 0, limit: 20 });
  const quotedOrIndex = addressedPage.split("\n").filter((line) => /^#\d+ (Quoted|IndexOnly) /.test(line));
  assert.ok(quotedOrIndex.length > 0, "no Quoted/IndexOnly row to address");
  // A fully quoted record has no hidden span (and no address); every row that
  // does carry a hidden span must carry an executable read for it.
  const withHidden = quotedOrIndex.filter((line) => line.includes("hidden=field "));
  assert.ok(withHidden.length > 0, "no hidden span in the addressed view page");
  for (const line of withHidden) {
    const m = line.match(/read: (\{"read":\d+,"field":"[^"]+","offset":\d+,"length":\d+\})/);
    assert.ok(m, `no executable read on: ${line}`);
    const out = addressedReader.run(JSON.parse(m[1]));
    assert.match(out, /^#\d+ \[/, "addressed read did not return a record");
  }
  for (let page = 0; page < 100; page++) {
    const text = reader.run({ view: view8217.manifest.id, offset, limit: 20 });
    for (const line of text.split("\n")) {
      const m = line.match(/^#(\d+) /);
      if (!m) continue;
      const n = Number(m[1]);
      assert.ok(!seen.has(n), `duplicate #${n} in view pages`);
      seen.add(n);
    }
    assert.match(text, /end of view|next=/);
    if (text.includes("end of view")) break;
    const next = text.match(/offset":(\d+)/);
    assert.ok(next, "page has no next offset");
    offset = Number(next[1]);
  }
  assert.equal(seen.size, view8217.manifest.entries.length);
});

check("reader reads the deep early counter in one call", () => {
  const early = fixture.expected.early;
  const out = reader.run({ read: early.ref, field: "content.0.text", offset: early.offset, length: 40 });
  assert.match(out, /422 pass \/ 0 fail/);
  assert.match(out, /field=content\.0\.text/);
});

check("scan exposes the hit field and offset", () => {
  const out = reader.run({ scan: "422 pass / 0 fail" });
  assert.match(out, new RegExp(`#${fixture.expected.early.ref} .*field=content\\.0\\.text@${fixture.expected.early.offset}`));
  assert.match(out, /read: \{"read":/);
  const line = out.split("\n").find((l) => l.includes("read: {"));
  const args = JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1));
  const readOut = reader.run(args);
  assert.match(readOut, /422 pass \/ 0 fail/);
});

check("scan says what it did not search", () => {
  const out = reader.run({ scan: "not-present-anywhere-xyz" });
  assert.match(out, /no match/i);
  assert.match(out, /not proof of absence/i);
});

check("touched lists recorded operations, not a diff", () => {
  const out = reader.run({ touched: "src/ops/op-007.ts" });
  assert.match(out, /mutation edit src\/ops\/op-007\.ts/);
  assert.match(out, /error observed/);
  assert.match(out, /not a current diff/i);
});

check("off-branch records require an explicit scope", () => {
  const off = catalog.X.find((r) => r.reason === "off-branch");
  const denied = reader.run({ read: off.n });
  assert.match(denied, /scope:"all"/);
  const allowed = reader.run({ read: off.n, scope: "all" });
  assert.match(allowed, /OFFBRANCH/);
});

check("policy-excluded records are never returned", () => {
  const id = catalog.E.find((r) => r.role === "assistant")?.entryId;
  const guarded = buildCatalog(fixture, { policy: { excludeEntryIds: [id] } });
  const guardedView = buildView(guarded, { capChars: 8217 });
  const guardedReader = createReader({ catalog: guarded, view: guardedView });
  const x = guarded.X.find((r) => r.entryId === id);
  assert.equal(x?.reason, "policy-excluded");
  const out = guardedReader.run({ read: x.n });
  assert.match(out, /not readable under the current policy/);
  assert.doesNotMatch(out, /OFFBRANCH|Task book/);
});

check("context edits quote revision text and preserve the original address", () => {
  const editFixture = makeEditFixture();
  const editCatalog = buildCatalog(editFixture);
  const editView = buildView(editCatalog, { capChars: 6000 });
  assert.match(editView.text, /revised requirement/);
  assert.doesNotMatch(editView.text, /original requirement/);
  const revised = editCatalog.E.find((r) => r.revisionEntryId);
  assert.ok(revised, "revision identity missing");
  const entry = editView.manifest.entries.find((e) => e.n === revised.n);
  assert.ok(entry.fields.flatMap((f) => f.shown).some((s) => s.revision === editFixture.editId));
  const editReader = createReader({ catalog: editCatalog, view: editView });
  assert.match(editReader.run({ read: revised.n }), /original requirement/);
  assert.match(editReader.run({ read: revised.n, revision: editFixture.editId }), /revised requirement/);
});

check("identity is monotonic over append-only growth", () => {
  const grown = JSON.parse(JSON.stringify(fixture));
  const last = fixture.headId;
  const appended = {
    type: "message",
    id: "e9999",
    parentId: last,
    message: { role: "assistant", content: [{ type: "text", text: "appended after the snapshot" }] },
  };
  grown.entries.push(appended);
  grown.headId = appended.id;
  const before = buildCatalog(fixture);
  const after = buildCatalog(grown);
  for (const [id, n] of before.nById) assert.equal(after.nById.get(id), n, `#N changed for ${id}`);
  assert.ok(after.counts.saved === before.counts.saved + 1);
});

check("budget formula produces the four tiers", () => {
  const expected = [
    [200000, 6280],
    [300000, 7850],
    [410462, 9583],
    [500000, 10990],
    [800000, 12560],
  ];
  for (const [ctx, cap] of expected) {
    const b = budgetFor(487, ctx);
    assert.equal(b.capChars, cap, `ctx ${ctx}: ${b.capChars} != ${cap}`);
  }
  const low = budgetFor(10, 200000);
  assert.equal(low.tokens, 1100);
});

check("display is not required to be monotonic", () => {
  // The smaller view is not a prefix of the larger one; both still keep every
  // catalog identity and the larger view keeps at least as many quoted records.
  assert.notEqual(view6287.text, view8217.text);
  assert.ok(view8217.counts.quoted >= view6287.counts.quoted);
  assert.equal(buildCatalog(fixture).counts.saved, 470);
});

check("prototype performance stays in the interactive range", () => {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const c = buildCatalog(fixture);
    buildView(c, { capChars: 8217 });
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 500, `p95 ${p95.toFixed(1)}ms`);
  results.push({ name: "performance.p95ms", ok: true, value: Number(p95.toFixed(2)), median: Number(times[10].toFixed(2)) });
});

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
