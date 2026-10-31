import { readFileSync } from "node:fs";

const OUT = "research/prototype/out";
const read = (name) => JSON.parse(readFileSync(`${OUT}/${name}.json`, "utf8"));
const first = read("first-constraints");
const honesty = read("honesty");
const readerNew = read("reader-new");
const readerOld = read("reader-old");

const byCondition = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = row.condition;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
};

const firstAgg = [...byCondition(first).entries()].map(([condition, rows]) => ({
  condition,
  n: rows.length,
  valid: rows.filter((r) => r.parsed).length,
  counts: rows.map((r) => r.count),
  mean: rows.reduce((a, r) => a + r.count, 0) / rows.length,
  hitUnion: [...new Set(rows.flatMap((r) => r.hit))].sort(),
}));

const honestyAgg = [...byCondition(honesty).entries()].map(([condition, rows]) => ({
  condition,
  n: rows.length,
  nullCount: rows.filter((r) => r.pass === null).length,
  wrong1139: rows.filter((r) => r.pass === 1139).length,
  other: rows.filter((r) => r.pass !== null && r.pass !== 1139).map((r) => r.pass),
  passes: rows.map((r) => r.pass),
}));

const readerAgg = (rows) => ({
  n: rows.length,
  ok: rows.filter((r) => r.ok).length,
  offsetOk: rows.filter((r) => r.offsetOk).length,
  calls: rows.map((r) => r.calls),
  answers: rows.map((r) => r.answer),
});

const summary = {
  first: firstAgg,
  honesty: honestyAgg,
  reader: { new: readerAgg(readerNew), old: readerAgg(readerOld) },
};
console.log(JSON.stringify(summary, null, 2));
