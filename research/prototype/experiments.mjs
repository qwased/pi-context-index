// Real DeepSeek API experiments for the pi-context-index prototype.
// All artifacts are synthetic. Only aggregate scores and counts are reported.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { makeFixture } from "./fixtures.mjs";
import { buildCatalog } from "./catalog.mjs";
import { buildView } from "./render.mjs";
import { createReader, createLegacyReader } from "./reader.mjs";

const OUT = "research/prototype/out";
const API = "http://127.0.0.1:8787/v1/chat/completions";
const MODEL = "deepseek-v4.1-flash-1017";
const RUNS = `${OUT}/runs.jsonl`;
mkdirSync(OUT, { recursive: true });
writeFileSync(RUNS, "");

const artifacts = JSON.parse(readFileSync(`${OUT}/artifacts.json`, "utf8"));
const tailA = readFileSync(`${OUT}/tail-A.txt`, "utf8");
const tailB = readFileSync(`${OUT}/tail-B.txt`, "utf8");
const fixtureA = makeFixture("A");
const catalogA = buildCatalog(fixtureA);
const fixtureB = makeFixture("B");
const catalogB = buildCatalog(fixtureB);
const viewNoCounter = buildView(catalogA, { capChars: 9583, includeCounters: false });
const viewNoCounterNewReader = createReader({ catalog: catalogA, view: viewNoCounter });
const viewNoCounterOldReader = createLegacyReader({ catalog: catalogA, view: viewNoCounter });

const CONCURRENCY = 3;
const REPEATS = 3;
const VARIANT_REPEATS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callModel = async (prompt, { maxTokens = 3000 } = {}) => {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100000);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          reasoning_effort: "minimal",
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { json = null; }
      const message = json?.choices?.[0]?.message ?? {};
      const content = message.content ?? "";
      last = {
        status: response.status,
        ms: Date.now() - started,
        attempt,
        usage: json?.usage ?? null,
        finish: json?.choices?.[0]?.finish_reason ?? null,
        content,
        error: json?.error ? JSON.stringify(json.error).slice(0, 300) : (json ? null : text.slice(0, 300)),
      };
      if (response.status === 200 && content) return last;
      if (response.status !== 200 && ![429, 500, 502, 503].includes(response.status)) return last;
    } catch (error) {
      last = { status: 0, ms: Date.now() - started, attempt, content: "", error: String(error) };
    } finally {
      clearTimeout(timer);
    }
    await sleep(1200 * attempt);
  }
  return last;
};

const parseJson = (content) => {
  if (!content) return null;
  let text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
};

const promptFor = (group, artifactText, tail, externalFile) => {
  const instructions = {
    facts: `只依据材料。输出严格 JSON：{"earliest_test":{"pass":number|null,"fail":number|null,"ref":number|null},"test_vectors":[{"pass":number,"fail":number,"ref":number|null}],"pi_1_0_0":{"pass":number|null}}。earliest_test 是材料中最早一次测试的计数和结果编号；test_vectors 列出材料中所有不同的 pass/fail 计数向量；材料没有 Pi 1.0.0 的计数就填 null，不要用 Pi 1.4.0 的数字代答。`,
    paths: `只依据材料。输出严格 JSON：{"mutation_count":number|null,"mutated_paths":[string],"observed_errors":[{"ref":number|null,"tool":string}]}。mutation_count 只数 O 行里的 write/edit 请求，不含 host aggregate；mutated_paths 是这些请求参数中的字面路径，去重，最多 80；observed_errors 列出材料中观测到的错误及引用编号。`,
    ctx: `只依据材料。输出严格 JSON：{"constraints":[string],"unverified":[string],"state":{"committed":boolean|null,"tagged":boolean|null,"pushed":boolean|null,"npm_published":boolean|null}}。constraints 抄用户明确写出的约束短语（最多 12 条）；unverified 只填材料明确说“未运行/未验证/未做”的事项；state 只看材料中的记录。`,
    cover: `只依据材料。输出严格 JSON：{"coverage":{"earliest_saved":number|null,"index_only_count":number|null,"view_ref":string|null,"may_commit":boolean|null}}。earliest_saved 是保存消息的最早编号；index_only_count 是视图标记为 IndexOnly 的记录数；view_ref 是视图编号；may_commit 按最新用户指令回答现在能否提交；材料没有的填 null。`,
  }[group];
  const external = externalFile
    ? `\n\n<external_file path="docs/plans/task-book.md">\n${externalFile}\n</external_file>\n（这是读者可读的外部任务书；它不属于压缩视图，视图只保留路径。）`
    : "";
  return `${instructions}${external}\n\n<artifact>\n${artifactText || "(no compressed view; only the retained tail is present)"}\n</artifact>\n\n<tail>\n${tail}\n</tail>`;
};

const truth = (() => {
  const early = fixtureA.expected.early;
  const mid = fixtureA.expected.mid;
  const late = fixtureA.expected.late;
  return {
    earliest: { pass: 422, fail: 0, ref: early.ref },
    vectors: [
      { pass: 422, fail: 0, ref: early.ref },
      { pass: 243, fail: 0, ref: mid.ref },
      { pass: 1139, fail: 0, ref: late.ref },
    ],
    mutationCount: 71,
    paths: new Set(fixtureA.expected.mutationPaths),
    errors: [
      { ref: fixtureA.expected.errors[0].ref, tool: "edit" },
      { ref: fixtureA.expected.errors[1].ref, tool: "write" },
      { ref: fixtureA.expected.errors[2].ref, tool: "bash" },
    ],
    constraints: fixtureA.expected.constraints,
    unverified: fixtureA.expected.unverified,
    state: fixtureA.expected.state,
    mayCommit: true,
  };
})();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const score = (group, parsed, condition) => {
  if (!parsed) return { invalid: true };
  if (group === "facts") {
    const e = parsed.earliest_test ?? {};
    const earliestOk = e.pass === 422 && e.fail === 0 && e.ref === truth.earliest.ref;
    const listed = Array.isArray(parsed.test_vectors) ? parsed.test_vectors : [];
    const pairs = new Set(listed.map((v) => `${v?.pass}/${v?.fail}`));
    const refs = new Map(listed.map((v) => [`${v?.pass}/${v?.fail}`, v?.ref]));
    const vectorPairs = truth.vectors.filter((v) => pairs.has(`${v.pass}/${v.fail}`)).length;
    const vectorRefs = truth.vectors.filter((v) => refs.get(`${v.pass}/${v.fail}`) === v.ref).length;
    const pi = parsed.pi_1_0_0?.pass ?? null;
    return {
      earliestOk,
      vectorPairs,
      vectorRefs,
      piNull: pi === null,
      piWrong: pi !== null,
      invalid: false,
    };
  }
  if (group === "paths") {
    const countOk = parsed.mutation_count === truth.mutationCount;
    const listed = Array.isArray(parsed.mutated_paths) ? parsed.mutated_paths.map(String) : [];
    const set = new Set(listed);
    let hit = 0;
    for (const p of truth.paths) if (set.has(p)) hit += 1;
    const errors = Array.isArray(parsed.observed_errors) ? parsed.observed_errors : [];
    const errorRefs = new Set(errors.map((e) => e?.ref));
    const errorsRef = truth.errors.filter((e) => errorRefs.has(e.ref)).length;
    const errorTools = truth.errors.filter((e) => errors.some((x) => x?.ref === e.ref && String(x?.tool ?? "").toLowerCase().includes(e.tool))).length;
    return {
      countOk,
      pathsHit: hit,
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
    const state = ["committed", "tagged", "pushed", "npm_published"]
      .filter((k) => s[k] === truth.state[k]).length;
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

const conditions = [];
const add = (condition, groups, reps, options = {}) => {
  for (let rep = 1; rep <= reps; rep++) {
    for (const group of groups) conditions.push({ condition, group, rep, ...options });
  }
};

for (const condition of ["tail-only", "legacy-6287", "legacy-9583", "index-6287", "index-8217"]) {
  add(condition, ["facts", "paths", "ctx", "cover"], REPEATS);
}
add("index-legacy-cover", ["cover"], VARIANT_REPEATS);
add("index-no-cover", ["cover"], VARIANT_REPEATS);
add("index-ref-only", ["facts"], VARIANT_REPEATS);
add("index-no-counter", ["facts"], VARIANT_REPEATS);
add("u-full", ["ctx"], VARIANT_REPEATS);
add("u-line", ["ctx"], VARIANT_REPEATS);
add("u-char", ["ctx"], VARIANT_REPEATS);
add("u-none", ["ctx"], VARIANT_REPEATS);
add("index-B-9583", ["facts", "paths", "ctx", "cover"], VARIANT_REPEATS, { shapeB: true });

const runOne = async (task) => {
  const artifact = artifacts[task.condition];
  const tail = task.shapeB ? tailB : tailA;
  const external = task.shapeB ? artifact.externalTaskBook : undefined;
  const prompt = promptFor(task.group, artifact?.text ?? "", tail, external);
  const maxTokens = task.group === "paths" ? 8000 : task.group === "cover" ? 4000 : task.group === "ctx" ? 3500 : 2000;
  const result = await callModel(prompt, { maxTokens });
  const parsed = parseJson(result.content);
  const metrics = score(task.group, parsed, task.condition);
  const row = {
    condition: task.condition,
    group: task.group,
    rep: task.rep,
    status: result.status,
    ms: result.ms,
    usage: result.usage,
    finish: result.finish,
    contentChars: result.content.length,
    parsed: parsed !== null,
    metrics,
    content: parsed ?? result.content.slice(0, 500),
    error: result.error ?? undefined,
  };
  appendFileSync(RUNS, `${JSON.stringify(row)}\n`);
  return row;
};

const pool = async (tasks, size) => {
  const queue = [...tasks];
  const workers = Array.from({ length: size }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      const row = await runOne(task);
      process.stderr.write(`[${task.condition}/${task.group}/${task.rep}] ${row.status} ${row.ms}ms ${JSON.stringify(row.metrics)}\n`);
    }
  });
  await Promise.all(workers);
};

process.stderr.write(`tasks=${conditions.length}\n`);
await pool(conditions, CONCURRENCY);

// ── reader experiment ─────────────────────────────────────────────────────
const readerPrompt = (artifactText, tail, toolName) => `你可以调用一个只读检索工具（最多 3 次）核对【压缩视图】之外的历史记录。工具名是 ${toolName}。
可用参数示例：
- {"tool":"${toolName}","args":{"scan":"pass"}}  按字面扫描保存字段
- {"tool":"${toolName}","args":{"read":6,"field":"content.0.text","offset":0,"length":800}}  读取一条记录的一个字段
- {"tool":"${toolName}","args":{"range":[0,20]}}  按顺序列出记录
- {"tool":"${toolName}","args":{"view":"${viewNoCounter.manifest.id}","offset":0,"limit":20}}  列出视图清单
输出规则：
1) 需要检索时，只输出一行 JSON：{"tool":"${toolName}","args":{...}}，不要解释。
2) 作答时输出严格 JSON：{"earliest_test":{"pass":number|null,"fail":number|null,"ref":number|null}}。
3) 只写材料或检索结果支持的答案；没有依据填 null。
问题：材料中最早一次测试的 pass/fail 计数和结果记录编号是什么？尾部里有更晚的测试，不要把更晚的数字当作最早。`;

const runReader = async ({ label, reader, reps = 2 }) => {
  const prompt = readerPrompt(artifacts["index-no-counter"].text, tailA, "context_index");
  const rows = [];
  for (let rep = 1; rep <= reps; rep++) {
    const messages = [{ role: "user", content: prompt }];
    const turns = [];
    let final = "";
    let done = false;
    for (let step = 0; step < 5 && !done; step++) {
      const used = turns.filter((t) => t.kind === "tool").length;
      if (used >= 3) messages.push({ role: "user", content: "检索次数已用完（3 次）。请现在直接输出最终 JSON。" });
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 100000);
      let content = "";
      let status = 0;
      let usage = null;
      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages,
            max_tokens: 2500,
            reasoning_effort: "minimal",
            temperature: 0,
            stream: false,
          }),
          signal: controller.signal,
        });
        status = response.status;
        const json = await response.json();
        usage = json.usage ?? null;
        content = json.choices?.[0]?.message?.content ?? "";
      } catch (error) {
        content = "";
      } finally {
        clearTimeout(timer);
      }
      messages.push({ role: "assistant", content });
      const toolAt = content.indexOf('{"tool"');
      if (toolAt < 0) {
        final = content;
        done = true;
        turns.push({ kind: "answer", ms: Date.now() - started, status, usage });
        break;
      }
      let end = content.lastIndexOf("}");
      let parsed = null;
      try { parsed = JSON.parse(content.slice(toolAt, end + 1)); } catch {}
      if (!parsed) {
        final = content;
        done = true;
        turns.push({ kind: "unparsed", ms: Date.now() - started, status, usage });
        break;
      }
      const result = reader.run(parsed.args ?? {});
      turns.push({ kind: "tool", args: parsed.args, result: result.slice(0, 200), ms: Date.now() - started, status, usage });
      messages.push({ role: "user", content: `tool result:\n${result}` });
    }
    const parsed = parseJson(final);
    const answer = parsed?.earliest_test ?? {};
    const ok = answer.pass === 422 && answer.fail === 0 && answer.ref === truth.earliest.ref;
    rows.push({
      condition: label,
      rep,
      ok,
      calls: turns.filter((t) => t.kind === "tool").length,
      turns,
      final: parsed ?? final.slice(0, 500),
    });
    appendFileSync(RUNS, `${JSON.stringify({ condition: label, group: "reader", rep, status: 200, ms: 0, parsed: parsed !== null, metrics: { ok, calls: rows[rows.length - 1].calls }, content: parsed ?? final.slice(0, 500) })}\n`);
  }
  return rows;
};

const readerNew = await runReader({ label: "reader-new", reader: viewNoCounterNewReader, reps: 2 });
const readerOld = await runReader({ label: "reader-old", reader: viewNoCounterOldReader, reps: 2 });

const all = readFileSync(RUNS, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const summarize = () => {
  const by = {};
  for (const row of all) {
    if (row.group === "reader") {
      by[row.condition] ??= { n: 0, ok: 0, calls: [] };
      by[row.condition].n += 1;
      if (row.metrics?.ok) by[row.condition].ok += 1;
      by[row.condition].calls.push(row.metrics?.calls ?? 0);
      continue;
    }
    const key = `${row.condition}/${row.group}`;
    by[key] ??= { n: 0, invalid: 0, metrics: {} };
    by[key].n += 1;
    if (row.parsed === false) by[key].invalid += 1;
    for (const [k, v] of Object.entries(row.metrics ?? {})) {
      if (typeof v === "number") by[key].metrics[k] = (by[key].metrics[k] ?? 0) + v;
      if (typeof v === "boolean") by[key].metrics[k] = (by[key].metrics[k] ?? 0) + (v ? 1 : 0);
    }
  }
  return by;
};

const summary = summarize();
writeFileSync(`${OUT}/experiment-summary.json`, JSON.stringify({ summary, readerNew, readerOld }, null, 2));
console.log(JSON.stringify({ summary, readerNew, readerOld }, null, 2));
