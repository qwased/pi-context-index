// Re-score the completed runs with call-or-result reference acceptance and
// produce aggregate tables. Reads only synthetic experiment outputs.

import { readFileSync, writeFileSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";

const OUT = "research/prototype/out";
const artifacts = JSON.parse(readFileSync(`${OUT}/artifacts.json`, "utf8"));
const rows = readFileSync(`${OUT}/runs.jsonl`, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const fixture = makeFixture("A");
const e = fixture.expected;

const truth = {
  earliest: { pass: 422, fail: 0, refs: new Set([e.early.callRef, e.early.ref]) },
  vectors: [
    { pass: 422, fail: 0, refs: new Set([e.early.callRef, e.early.ref]) },
    { pass: 243, fail: 0, refs: new Set([e.mid.callRef, e.mid.ref]) },
    { pass: 1139, fail: 0, refs: new Set([e.late.callRef, e.late.ref]) },
  ],
  mutationCount: 71,
  paths: new Set(e.mutationPaths),
  errors: [
    { refs: new Set([e.errors[0].callRef, e.errors[0].ref]), tool: "edit" },
    { refs: new Set([e.errors[1].callRef, e.errors[1].ref]), tool: "write" },
    { refs: new Set([e.errors[2].callRef, e.errors[2].ref]), tool: "bash" },
  ],
  constraints: e.constraints,
  unverified: e.unverified,
  state: e.state,
};

const parseMaybe = (value) => {
  if (value && typeof value === "object") return value;
  return null;
};

const score = (group, parsed, condition) => {
  if (!parsed) return { invalid: true };
  if (group === "facts") {
    const earliest = parsed.earliest_test ?? {};
    const ref = Number(earliest.ref);
    const earliestOk = earliest.pass === 422 && earliest.fail === 0 && truth.earliest.refs.has(ref);
    const listed = Array.isArray(parsed.test_vectors) ? parsed.test_vectors : [];
    const pairs = new Set(listed.map((v) => `${v?.pass}/${v?.fail}`));
    const refByPair = new Map(listed.map((v) => [`${v?.pass}/${v?.fail}`, Number(v?.ref)]));
    const pairHits = truth.vectors.filter((v) => pairs.has(`${v.pass}/${v.fail}`)).length;
    const refHits = truth.vectors.filter((v) => v.refs.has(refByPair.get(`${v.pass}/${v.fail}`))).length;
    const pi = parsed.pi_1_0_0?.pass ?? null;
    return { earliestOk, pairHits, refHits, piNull: pi === null, piWrong: pi !== null, invalid: false };
  }
  if (group === "paths") {
    const countOk = parsed.mutation_count === truth.mutationCount;
    const listed = Array.isArray(parsed.mutated_paths) ? parsed.mutated_paths.map(String) : [];
    const set = new Set(listed);
    let hit = 0;
    for (const p of truth.paths) if (set.has(p)) hit += 1;
    const errors = Array.isArray(parsed.observed_errors) ? parsed.observed_errors : [];
    const errorRefs = new Set(errors.map((x) => Number(x?.ref)));
    const errorsRef = truth.errors.filter((t) => [...t.refs].some((r) => errorRefs.has(r))).length;
    const errorTools = truth.errors.filter((t) => errors.some((x) => [...t.refs].includes(Number(x?.ref)) && String(x?.tool ?? "").toLowerCase().includes(t.tool))).length;
    return {
      countOk,
      pathHits: hit,
      pathsListed: listed.length,
      pathsExtra: listed.filter((p) => !truth.paths.has(p)).length,
      errorsRef,
      errorTools,
      errorsListed: errors.length,
      invalid: false,
    };
  }
  if (group === "ctx") {
    const c = JSON.stringify(parsed.constraints ?? []).toLowerCase();
    const u = JSON.stringify(parsed.unverified ?? []).toLowerCase();
    const constraints = truth.constraints.filter((x) => c.includes(x.needle.toLowerCase())).length;
    const unverified = truth.unverified.filter((x) => u.includes(x.needle.toLowerCase())).length;
    const s = parsed.state ?? {};
    const state = ["committed", "tagged", "pushed", "npm_published"].filter((k) => s[k] === truth.state[k]).length;
    return { constraints, unverified, state, invalid: false };
  }
  if (group === "cover") {
    const c = parsed.coverage ?? {};
    const isTail = condition === "tail-only";
    const legacy = String(condition).startsWith("legacy-");
    const noCount = condition === "index-no-cover";
    const expectedEarliest = isTail || noCount ? null : 0;
    const expectedIndexOnly = isTail || legacy || noCount ? null : artifacts[condition]?.counts?.indexOnly ?? null;
    const expectedView = isTail || legacy || noCount ? null : artifacts[condition]?.viewId ?? null;
    const expectedCommit = isTail ? null : true;
    return {
      earliest: c.earliest_saved === expectedEarliest,
      indexOnly: c.index_only_count === expectedIndexOnly,
      view: c.view_ref === expectedView,
      mayCommit: c.may_commit === expectedCommit,
      invalid: false,
    };
  }
  return { invalid: true };
};

const scored = rows.map((row) => {
  if (row.group === "reader") return row;
  const parsed = parseMaybe(row.content);
  return { ...row, metrics: score(row.group, parsed, row.condition), rescored: true };
});

const aggregate = () => {
  const by = new Map();
  for (const row of scored) {
    if (row.group === "reader") {
      const key = row.condition;
      const item = by.get(key) ?? { condition: key, group: "reader", n: 0, ok: 0, calls: [] };
      item.n += 1;
      item.calls.push(row.metrics?.calls ?? 0);
      if (row.metrics?.ok) item.ok += 1;
      by.set(key, item);
      continue;
    }
    const key = `${row.condition}/${row.group}`;
    const item = by.get(key) ?? { condition: row.condition, group: row.group, n: 0, invalid: 0, values: {} };
    item.n += 1;
    if (row.metrics?.invalid) item.invalid += 1;
    for (const [k, v] of Object.entries(row.metrics ?? {})) {
      if (typeof v === "number") {
        item.values[k] ??= [];
        item.values[k].push(v);
      }
    }
    by.set(key, item);
  }
  const out = [];
  for (const item of by.values()) {
    if (item.group === "reader") {
      out.push(item);
      continue;
    }
    const mean = (arr) => arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const min = (arr) => {
      if (!arr || arr.length === 0) return null;
      let value = arr[0];
      for (const n of arr) if (n < value) value = n;
      return value;
    };
    const max = (arr) => {
      if (!arr || arr.length === 0) return null;
      let value = arr[0];
      for (const n of arr) if (n > value) value = n;
      return value;
    };
    const summary = { condition: item.condition, group: item.group, n: item.n, invalid: item.invalid };
    for (const [k, arr] of Object.entries(item.values)) {
      summary[k] = { mean: mean(arr), min: min(arr), max: max(arr), n: arr.length };
    }
    out.push(summary);
  }
  return out;
};

const summary = aggregate();
const reader = summary.filter((r) => r.group === "reader");
writeFileSync(`${OUT}/experiment-summary-rescored.json`, JSON.stringify({ summary, reader }, null, 2));
console.log(JSON.stringify({ summary, reader }, null, 2));
