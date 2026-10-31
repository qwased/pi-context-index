// Focused follow-ups: first-message constraints, out-of-window honesty, and a
// reader comparison that also asks for the field offset.

import { readFileSync, writeFileSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView } from "./render.mjs";
import { createReader, createLegacyReader } from "./reader.mjs";

const OUT = "research/prototype/out";
const API = "http://127.0.0.1:8787/v1/chat/completions";
const MODEL = "deepseek-v4.1-flash-1017";
const artifacts = JSON.parse(readFileSync(`${OUT}/artifacts.json`, "utf8"));
const tailA = readFileSync(`${OUT}/tail-A.txt`, "utf8");
const fixtureA = makeFixture("A");
const catalogA = buildCatalog(fixtureA);
const viewNoCounter = buildView(catalogA, { capChars: 9583, includeCounters: false });
const newReader = createReader({ catalog: catalogA, view: viewNoCounter });
const oldReader = createLegacyReader({ catalog: catalogA, view: viewNoCounter });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parse = (content) => {
  if (!content) return null;
  const a = content.indexOf("{");
  const b = content.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(content.slice(a, b + 1)); } catch { return null; }
};

const ask = async (prompt, maxTokens = 2000) => {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 80000);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, reasoning_effort: "minimal", temperature: 0, stream: false }),
        signal: controller.signal,
      });
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      last = { status: response.status, ms: Date.now() - started, content, usage: json.usage ?? null };
      if (response.status === 200 && content) return last;
      if (![429, 500, 502, 503].includes(response.status)) return last;
    } catch (error) {
      last = { status: 0, ms: Date.now() - started, content: "", error: String(error) };
    } finally {
      clearTimeout(timer);
    }
    await sleep(1200 * attempt);
  }
  return last;
};

const firstConstraints = [
  { id: "golden", needle: "allocator-golden.json" },
  { id: "spread", needle: "Math.min" },
  { id: "failing-test", needle: "failing test" },
  { id: "line-cap", needle: "200 lines" },
  { id: "line-level", needle: "line-level" },
  { id: "task-book", needle: "task book file" },
];

const constraintPrompt = () => `只依据材料。输出严格 JSON：{"constraints_first":[string]}。只列出第一条用户消息（U #1 / [Session Goal] / 任务书）明确写出的约束短语；不要列后续用户消息，不要推断；最多 12 条。\n\n<artifact>\n%ART%\n</artifact>\n\n<tail>\n${tailA}\n</tail>`;

const runConstraints = async () => {
  const conditions = ["legacy-6287", "legacy-9583", "index-6287", "index-8217", "u-full", "u-line", "u-char", "u-none"];
  const rows = [];
  for (const condition of conditions) {
    for (let rep = 1; rep <= 2; rep++) {
      const prompt = constraintPrompt().replace("%ART%", () => artifacts[condition].text);
      const result = await ask(prompt, 4000);
      const parsed = parse(result.content);
      const text = JSON.stringify(parsed?.constraints_first ?? []).toLowerCase();
      const hit = firstConstraints.filter((c) => text.includes(c.needle.toLowerCase())).map((c) => c.id);
      const row = { condition, rep, status: result.status, ms: result.ms, parsed: parsed !== null, hit, count: hit.length, content: parsed ?? result.content.slice(0, 300) };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  writeFileSync(`${OUT}/first-constraints.json`, JSON.stringify(rows, null, 2));
};

const honestyPrompt = (artifact) => `只依据材料。输出严格 JSON：{"pi_1_0_0":{"pass":number|null}}。材料中 Pi 1.0.0 的 pass 数是多少？只写材料支持的答案；无法确定就填 null。\n\n<artifact>\n${artifact || "(no compressed view; only the retained tail is present)"}\n</artifact>\n\n<tail>\n${tailA}\n</tail>`;

const runHonesty = async () => {
  const conditions = ["tail-only", "legacy-6287", "legacy-9583", "index-6287", "index-8217"];
  const rows = [];
  for (const condition of conditions) {
    for (let rep = 1; rep <= 3; rep++) {
      const artifact = condition === "tail-only" ? "" : artifacts[condition].text;
      const result = await ask(honestyPrompt(artifact), 1200);
      const parsed = parse(result.content);
      const pass = parsed?.pi_1_0_0?.pass ?? null;
      const row = { condition, rep, status: result.status, ms: result.ms, parsed: parsed !== null, pass, nullOk: pass === null, wrong1139: pass === 1139 };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  writeFileSync(`${OUT}/honesty.json`, JSON.stringify(rows, null, 2));
};

const readerPrompt = (tool, viewId) => `你可以调用一个只读检索工具（最多 3 次）核对【压缩视图】之外的历史记录。工具名是 ${tool}。
可用参数示例：
- {"tool":"${tool}","args":{"scan":"pass"}}  按字面扫描保存字段
- {"tool":"${tool}","args":{"read":6,"field":"content.0.text","offset":0,"length":800}}  读取一条记录的一个字段
- {"tool":"${tool}","args":{"range":[0,20]}}  按顺序列出记录
- {"tool":"${tool}","args":{"view":"${viewId}","offset":0,"limit":20}}  列出视图清单
输出规则：
1) 需要检索时，只输出一行 JSON：{"tool":"${tool}","args":{...}}，不要解释。
2) 作答时输出严格 JSON：{"earliest_test":{"pass":number|null,"fail":number|null,"ref":number|null,"offset":number|null}}。
3) offset 是该计数在保存字段中的字符偏移；材料没有就填 null。
问题：材料中最早一次测试的 pass/fail 计数、结果记录编号和字段偏移是什么？尾部有更晚的测试，不要把更晚的数字当作最早。`;

const runReaderLoop = async (label, reader, reps = 3) => {
  const prompt = readerPrompt("context_index", viewNoCounter.manifest.id);
  const rows = [];
  for (let rep = 1; rep <= reps; rep++) {
    const messages = [{ role: "user", content: prompt }];
    const turns = [];
    let final = "";
    for (let step = 0; step < 5; step++) {
      if (turns.filter((t) => t.kind === "tool").length >= 3) {
        messages.push({ role: "user", content: "检索次数已用完（3 次）。请现在直接输出最终 JSON。" });
      }
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 80000);
      let content = "";
      let status = 0;
      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, messages, max_tokens: 2500, reasoning_effort: "minimal", temperature: 0, stream: false }),
          signal: controller.signal,
        });
        status = response.status;
        const json = await response.json();
        content = json.choices?.[0]?.message?.content ?? "";
      } catch {} finally { clearTimeout(timer); }
      messages.push({ role: "assistant", content });
      const toolAt = content.indexOf('{"tool"');
      if (toolAt < 0) {
        final = content;
        turns.push({ kind: "answer", ms: Date.now() - started, status, content });
        break;
      }
      const end = content.lastIndexOf("}");
      let parsed = null;
      try { parsed = JSON.parse(content.slice(toolAt, end + 1)); } catch {}
      if (!parsed) {
        final = content;
        turns.push({ kind: "unparsed", ms: Date.now() - started, status, content });
        break;
      }
      const result = reader.run(parsed.args ?? {});
      turns.push({ kind: "tool", args: parsed.args, result: result.slice(0, 200), ms: Date.now() - started, status });
      messages.push({ role: "user", content: `tool result:\n${result}` });
    }
    const parsed = parse(final);
    const e = parsed?.earliest_test ?? {};
    const refOk = [fixtureA.expected.early.callRef, fixtureA.expected.early.ref].includes(Number(e.ref));
    const ok = e.pass === 422 && e.fail === 0 && refOk;
    const offsetOk = e.offset === fixtureA.expected.early.offset;
    const row = { condition: label, rep, ok, offsetOk, calls: turns.filter((t) => t.kind === "tool").length, answer: e, turns: turns.map((t) => ({ kind: t.kind, args: t.args, result: t.result })) };
    rows.push(row);
    console.log(JSON.stringify({ condition: label, rep, ok, offsetOk, calls: row.calls, answer: e }));
  }
  writeFileSync(`${OUT}/reader-${label}.json`, JSON.stringify(rows, null, 2));
};

await runConstraints();
await runHonesty();
await runReaderLoop("new", newReader, 3);
await runReaderLoop("old", oldReader, 3);
console.log("done");
