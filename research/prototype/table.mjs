// Compact aggregate table for the design document.
import { readFileSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";

const OUT = "research/prototype/out";
const artifacts = JSON.parse(readFileSync(`${OUT}/artifacts.json`, "utf8"));
const runs = readFileSync(`${OUT}/runs.jsonl`, "utf8").split("\n").filter(Boolean).map(JSON.parse);
const fixture = makeFixture("A");
const expected = fixture.expected;
const parse = (value) => (value && typeof value === "object" ? value : null);

const factScore = (parsed) => {
  const e = parsed?.earliest_test ?? {};
  const ref = Number(e.ref);
  const refOk = [expected.early.callRef, expected.early.ref].includes(ref);
  const vectors = Array.isArray(parsed?.test_vectors) ? parsed.test_vectors : [];
  const pairs = new Set(vectors.map((v) => `${v?.pass}/${v?.fail}`));
  const byPair = new Map(vectors.map((v) => [`${v?.pass}/${v?.fail}`, Number(v?.ref)]));
  const truth = [
    { p: 422, f: 0, refs: [expected.early.callRef, expected.early.ref] },
    { p: 243, f: 0, refs: [expected.mid.callRef, expected.mid.ref] },
    { p: 1139, f: 0, refs: [expected.late.callRef, expected.late.ref] },
  ];
  return {
    earliest: e.pass === 422 && e.fail === 0 && refOk ? 1 : 0,
    pair: truth.filter((t) => pairs.has(`${t.p}/${t.f}`)).length,
    ref: truth.filter((t) => t.refs.includes(byPair.get(`${t.p}/${t.f}`))).length,
    piNull: (parsed?.pi_1_0_0?.pass ?? null) === null ? 1 : 0,
  };
};

const pathScore = (parsed) => {
  const listed = Array.isArray(parsed?.mutated_paths) ? parsed.mutated_paths.map(String) : [];
  const set = new Set(listed);
  let hits = 0;
  for (const p of expected.mutationPaths) if (set.has(p)) hits++;
  const errors = Array.isArray(parsed?.observed_errors) ? parsed.observed_errors : [];
  const refs = new Set(errors.map((e) => Number(e?.ref)));
  const errorRefs = expected.errors.filter((e) => refs.has(e.callRef) || refs.has(e.ref)).length;
  return { count: parsed?.mutation_count === 71 ? 1 : 0, paths: hits, errors: errorRefs };
};

const ctxScore = (parsed) => {
  const c = JSON.stringify(parsed?.constraints ?? []).toLowerCase();
  const u = JSON.stringify(parsed?.unverified ?? []).toLowerCase();
  const s = parsed?.state ?? {};
  return {
    constraints: expected.constraints.filter((x) => c.includes(x.needle.toLowerCase())).length,
    unverified: expected.unverified.filter((x) => u.includes(x.needle.toLowerCase())).length,
    state: ["committed", "tagged", "pushed", "npm_published"].filter((k) => s[k] === expected.state[k]).length,
  };
};

const coverScore = (parsed, condition) => {
  const c = parsed?.coverage ?? {};
  const tail = condition === "tail-only";
  const legacy = condition.startsWith("legacy-");
  const noCover = condition === "index-no-cover";
  const earliestWant = tail || noCover ? null : 0;
  const indexWant = tail || legacy || noCover ? null : artifacts[condition].counts.indexOnly;
  const viewWant = tail || legacy || noCover ? null : artifacts[condition].viewId;
  const commitWant = tail ? null : true;
  return {
    earliest: c.earliest_saved === earliestWant ? 1 : 0,
    indexOnly: c.index_only_count === indexWant ? 1 : 0,
    view: c.view_ref === viewWant ? 1 : 0,
    commit: c.may_commit === commitWant ? 1 : 0,
  };
};

const mainConditions = ["tail-only", "legacy-6287", "legacy-9583", "index-6287", "index-8217"];
const variantConditions = ["index-legacy-cover", "index-no-cover", "index-ref-only", "index-no-counter", "u-full", "u-line", "u-char", "u-none", "index-B-9583"];
const rowsOf = (condition, group) => runs.filter((r) => r.condition === condition && r.group === group);

const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const fmt = (n) => n == null ? "-" : Number(n.toFixed(2)).toString();

const out = { main: [], variants: [], reader: [] };
for (const condition of mainConditions) {
  const facts = rowsOf(condition, "facts");
  const paths = rowsOf(condition, "paths");
  const ctx = rowsOf(condition, "ctx");
  const cover = rowsOf(condition, "cover");
  const f = facts.map((r) => parse(r.content)).filter(Boolean).map(factScore);
  const p = paths.map((r) => parse(r.content)).filter(Boolean).map(pathScore);
  const x = ctx.map((r) => parse(r.content)).filter(Boolean).map(ctxScore);
  const c = cover.map((r) => parse(r.content)).filter(Boolean).map((v) => coverScore(v, condition));
  out.main.push({
    condition,
    facts: { n: facts.length, valid: f.length, earliest: f.filter((v) => v.earliest).length, pair: avg(f.map((v) => v.pair)), ref: avg(f.map((v) => v.ref)), piNull: f.filter((v) => v.piNull).length },
    paths: { n: paths.length, valid: p.length, count: p.filter((v) => v.count).length, paths: avg(p.map((v) => v.paths)), errors: avg(p.map((v) => v.errors)) },
    ctx: { n: ctx.length, valid: x.length, constraints: avg(x.map((v) => v.constraints)), unverified: avg(x.map((v) => v.unverified)), state: avg(x.map((v) => v.state)) },
    cover: { n: cover.length, valid: c.length, earliest: c.filter((v) => v.earliest).length, indexOnly: c.filter((v) => v.indexOnly).length, view: c.filter((v) => v.view).length, commit: c.filter((v) => v.commit).length },
  });
}
for (const condition of variantConditions) {
  const groups = ["facts", "paths", "ctx", "cover"].map((group) => [group, rowsOf(condition, group)]).filter(([, r]) => r.length);
  const item = { condition, groups: {} };
  for (const [group, rows] of groups) {
    const vals = rows.map((r) => parse(r.content)).filter(Boolean);
    item.groups[group] = { n: rows.length, valid: vals.length };
    if (group === "facts") {
      const s = vals.map(factScore); item.groups[group].earliest = s.filter((v) => v.earliest).length; item.groups[group].pair = avg(s.map((v) => v.pair)); item.groups[group].ref = avg(s.map((v) => v.ref));
    }
    if (group === "paths") {
      const s = vals.map(pathScore); item.groups[group].count = s.filter((v) => v.count).length; item.groups[group].paths = avg(s.map((v) => v.paths)); item.groups[group].errors = avg(s.map((v) => v.errors));
    }
    if (group === "ctx") {
      const s = vals.map(ctxScore); item.groups[group].constraints = avg(s.map((v) => v.constraints)); item.groups[group].unverified = avg(s.map((v) => v.unverified)); item.groups[group].state = avg(s.map((v) => v.state));
    }
    if (group === "cover") {
      const s = vals.map((v) => coverScore(v, condition)); item.groups[group].earliest = s.filter((v) => v.earliest).length; item.groups[group].indexOnly = s.filter((v) => v.indexOnly).length; item.groups[group].view = s.filter((v) => v.view).length; item.groups[group].commit = s.filter((v) => v.commit).length;
    }
  }
  out.variants.push(item);
}
for (const row of runs.filter((r) => r.group === "reader")) {
  out.reader.push({ condition: row.condition, rep: row.rep, ok: row.metrics?.ok ?? null, calls: row.metrics?.calls ?? null });
}

console.log(JSON.stringify(out, null, 2));
