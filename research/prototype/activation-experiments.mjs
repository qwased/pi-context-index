// Activation/initiative experiment: after compaction, will the model call the
// read-only tool when the view lacks a requirement, and do prompt guidelines
// change that? All material is synthetic; raw output stays in the git-ignored
// research/prototype/out directory.

import { writeFileSync } from "node:fs";
import { buildActivation } from "./activation-fixture.mjs";

const OUT = "research/prototype/out";
const API = "http://127.0.0.1:8787/v1/chat/completions";
// DeepSeek only (user constraint). The guard makes an accidental non-DeepSeek
// run fail before any request is sent.
const MODEL = process.env.ACT_MODEL ?? "deepseek-v4.1-flash-1017";
if (!/^deepseek/i.test(MODEL)) throw new Error(`only DeepSeek models are allowed; got ${MODEL}`);
const OUT_NAME = process.env.ACT_OUT ?? "activation";
const REPS = Number(process.env.ACT_REPS ?? 3);
const VARIANT = process.env.ACT_VARIANT ?? "t4";
const ONLY_CONDITIONS = (process.env.ACT_CONDITIONS ?? "A,B,C,D").split(",");
const ONLY_QUESTIONS = (process.env.ACT_QUESTIONS ?? "T1,T2,T3,T4").split(",");
// "2" turns on the hidden-span address (field/offset + executable read) that
// section 7.1 of the design requires. "3" adds the span/pages/windows
// descriptor, the cost-accounted max window and the view page table (render-3).
// "5" adds the merged cover call for spans longer than one read window.
// "1" keeps the exact render-1 bytes that the earlier activation runs used, so
// those results stay reproducible.
const RENDER = process.env.ACT_RENDER ?? "1";
// "native" sends the real tool schema and reads structured tool_calls instead
// of the text JSON stand-in. The stand-in is only an experiment convenience.
const PROTOCOL_MODE = process.env.ACT_PROTOCOL ?? "json";

// The activation fixture and view are shared with the structural probes; see
// activation-fixture.mjs. Rendering mode "5" adds the merged cover call.
const ACT = buildActivation({
  variant: VARIANT,
  render: RENDER,
  coverMax: process.env.ACT_COVER_MAX ? Number(process.env.ACT_COVER_MAX) : undefined,
});
const {
  catalog,
  view,
  reader,
  tail,
  firstFieldText,
  firstLineStarts,
  targetOffset,
  t5Offset,
  t6Offset,
  hiddenStart,
  hiddenEnd,
  hiddenSpan,
  hiddenPages,
  hiddenWindows,
  t5InFirstPage,
  t6InFirstPage,
  cover,
  coverMax,
  pageTable,
  maxRead,
  baseVariant: BASE_VARIANT,
  long: LONG,
} = ACT;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Real host tool schema (OpenAI/pi function shape). The text JSON block below
// is only the experiment stand-in used by the earlier runs; a real host passes
// this schema and receives structured tool_calls.
const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "context_index",
    description:
      "Read saved session history outside the compressed view. One action per call: view lists entries, read returns a field range, range lists #N records, scan searches literally, touched lists recorded operations for a path.",
    parameters: {
      type: "object",
      properties: {
        view: { type: "string", description: "View id from the cover line; guards every action." },
        status: { type: "string", enum: ["Live", "Quoted", "IndexOnly", "Unavailable"] },
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        read: {
          type: "object",
          properties: {
            index: { type: "integer", minimum: 0, description: "#N saved message" },
            field: { type: "string", description: "Field path, e.g. content or content.0.text" },
            offset: { type: "integer", minimum: 0, description: "UTF-16 offset in the field" },
            length: { type: "integer", minimum: 1, maximum: 12000 },
            cover: { type: "boolean", description: "Merged read of consecutive windows up to the host coverMax; total cost is reported" },
            revision: { type: "string" },
            scope: { type: "string", enum: ["all"] },
          },
          required: ["index"],
          additionalProperties: false,
        },
        range: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
        scan: { type: "string", minLength: 1 },
        scope: { type: "string", enum: ["view", "all"] },
        touched: { type: "string", description: "Literal path" },
      },
      additionalProperties: false,
    },
  },
};

const NATIVE_PROTOCOL = "You can call the read-only tool context_index at most 3 times to inspect saved history outside the compressed view. When you answer, output exactly the JSON object requested by the user; no prose.";

const PROTOCOL = `You can call one read-only tool, context_index, at most 3 times to inspect saved history outside the compressed view.
To call it, output exactly one line of JSON: {"tool":"context_index","args":{...}}.
Examples:
- {"tool":"context_index","args":{"scan":"release checklist"}} literal scan of saved fields
- {"tool":"context_index","args":{"read":1,"field":"content","offset":0,"length":800}} read one saved field
- {"tool":"context_index","args":{"range":[0,20]}} list records in order
- {"tool":"context_index","args":{"view":"${view.manifest.id}","offset":0,"limit":20}} list the view
When you answer, output exactly the JSON object requested by the user; no prose.`;

const POSITIVE =
  "After compaction, the view is a navigation index, not the full task. Before answering a question about a user instruction or requirement, check whether its `U` line is complete. If the line has hidden ranges, or the record is `IndexOnly`, or only a `#N`/cover range is present, call `context_index` and read the saved original at the given field/offset. Do not infer a requirement from an excerpt. If the saved history has no such text, say it is not recorded instead of guessing.";
const STRUCTURE =
  "`IndexOnly` means the record is saved but its text is not shown. `U` lines with `hidden` ranges show only a head/tail excerpt. Read the saved original before treating a requirement as absent.";
// Pre-registered paging rule (PREREG_RENDER3.md). It binds only to structural
// signals (hidden span length, the printed max call, a returned next offset).
const PAGING =
  "If a `U` line has a `hidden` span longer than 1,200 chars, or a tool result ends with a `next` offset, the span is not fully read. Continue from that `next` offset, or use the printed `max` read, until the span is covered or the text the question depends on is found. Do not answer from the first page alone.";
// Pre-registered render-5 rule (PREREG_RENDER5.md). It binds only to the
// printed structural calls, never to the content of the text.
const COVER =
  "A `U` line whose hidden span is longer than one read window prints two calls: `max` covers the first window only, and `cover` returns the whole span in one result with its total cost. If the question depends on the hidden middle and the span is longer than one window, use the printed `cover` call; do not stop after `max` or after one `next` page.";

const BASE = PROTOCOL_MODE === "native" ? NATIVE_PROTOCOL : PROTOCOL;

const conditions = {
  A: { id: "A", label: "A-no-guidance", system: BASE },
  B: {
    id: "B",
    label: "B-negative",
    system: `${BASE}\n- Use \`context_index\` to recover compacted or earlier session context before concluding it is unavailable.`,
  },
  C: { id: "C", label: "C-positive-conditional", system: `${BASE}\n- ${POSITIVE}` },
  D: {
    id: "D",
    label: "D-positive-plus-structure",
    system: `${BASE}\n- ${POSITIVE}\n- ${STRUCTURE}`,
  },
  // New, pre-registered conditions: the same positive guidance plus the
  // paging/coverage rule. They are compared with A/B/C/D on the same fixture.
  C2: { id: "C2", label: "C2-positive-plus-paging", system: `${BASE}\n- ${POSITIVE}\n- ${PAGING}` },
  D2: {
    id: "D2",
    label: "D2-positive-structure-paging",
    system: `${BASE}\n- ${POSITIVE}\n- ${STRUCTURE}\n- ${PAGING}`,
  },
  // Render-5 conditions: the same positive guidance plus the cover rule. They
  // differ from C/D only by that one rule and run on the same view.
  C5: { id: "C5", label: "C5-positive-plus-cover", system: `${BASE}\n- ${POSITIVE}\n- ${COVER}` },
  D5: {
    id: "D5",
    label: "D5-positive-structure-cover",
    system: `${BASE}\n- ${POSITIVE}\n- ${STRUCTURE}\n- ${COVER}`,
  },
};

if (process.env.ACT_PRINT_PROMPTS) {
  for (const c of Object.values(conditions)) console.log(JSON.stringify({ id: c.id, system: c.system }));
  process.exit(0);
}

const questions = {
  T1: {
    id: "T1-latest",
    group: "answerable-now",
    schema: '{"latest_test":{"pass":number|null}}',
    text: "材料中最后一次测试的 pass 数是多少？只依据材料；如果材料没有，填 null。",
  },
  T2: {
    id: "T2-earliest",
    group: "hidden-indexonly",
    schema: '{"earliest_test":{"pass":number|null,"fail":number|null,"ref":number|null}}',
    text: "材料中最早一次测试的 pass/fail 计数和结果记录编号是什么？尾部有更晚的测试，不要把更晚的数字当作最早。只依据材料；如果材料没有，填 null。",
  },
  T3: {
    id: "T3-absent",
    group: "absent",
    schema: '{"pi_1_0_0":{"pass":number|null}}',
    text: "材料中 Pi 1.0.0 的 pass 数是多少？只写材料支持的答案；无法确定就填 null。",
  },
  T4: {
    id: "T4-hidden-requirement",
    group: "hidden-requirement",
    schema: '{"release_checklist_rule":string|null}',
    text: "第一条用户消息对 release checklist 有什么要求？只依据材料；如果材料没有，填 null。",
  },
  T5: {
    id: "T5-looks-answerable",
    group: "looks-answerable",
    schema: '{"allocator_regeneration_condition":string|null}',
    text: "在什么条件下可以重新生成 tests/fixtures/allocator-golden.json？只依据材料；如果材料没有，填 null。",
  },
  // T6 pre-registration: the visible line states a complete-looking rule, the
  // correction is only in the hidden middle, and no distinctive word from the
  // correction appears in the question. Truth is false (one green run is not
  // sufficient). correct = commit_allowed === false; grounded = why names the
  // independent rerun; zeroCallWrong = answered on the first turn and wrong.
  T6: {
    id: "T6-no-keyword-clue",
    group: "looks-answerable-no-clue",
    schema: '{"record_changelog":boolean|null,"why":string|null}',
    text: "按第一条用户消息里的 Changelog checklist，完整测试套件通过后可以直接记录 changelog 吗？只依据材料；无法确定就填 null。",
  },
};

const userPrompt = (q) =>
  `${q.text}\n\n<view>\n${view.text}\n</view>\n\n<tail>\n${tail}\n</tail>\n\n只依据材料；需要检索时先调用工具。作答时输出严格 JSON：${q.schema}。`;

const parse = (content) => {
  if (!content) return null;
  const a = content.indexOf("{");
  const b = content.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(content.slice(a, b + 1));
  } catch {
    return null;
  }
};

const extractObject = (text, from) => {
  const start = text.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

const toolCall = (content) => {
  const re = /\{\s*"tool"\s*:/g;
  let match;
  while ((match = re.exec(content))) {
    const raw = extractObject(content, match.index);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.tool === "context_index") return parsed;
    } catch {}
  }
  return null;
};

const call = async (messages, maxTokens = 2500) => {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: maxTokens,
          reasoning_effort: "minimal",
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      });
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      last = { status: response.status, ms: Date.now() - started, content, usage: json.usage ?? null };
      if (response.status === 200 && content) return last;
      if (![429, 500, 502, 503].includes(response.status) && content) return last;
    } catch (error) {
      last = { status: 0, ms: Date.now() - started, content: "", error: String(error) };
    } finally {
      clearTimeout(timer);
    }
    await sleep(1200 * attempt);
  }
  return last;
};

// The local stand-in endpoint drops `tool_calls` from non-streaming
// responses but forwards the deltas, so the native path always streams and
// reassembles. A real host returns the structured call directly.
const streamCall = async (messages, maxTokens = 2500) => {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: [TOOL_SCHEMA],
          tool_choice: "auto",
          max_tokens: maxTokens,
          reasoning_effort: "minimal",
          temperature: 0,
          stream: true,
        }),
        signal: controller.signal,
      });
      const body = await response.text();
      let content = "";
      const calls = [];
      let usage = null;
      for (const line of body.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break;
        let chunk;
        try { chunk = JSON.parse(payload); } catch { continue; }
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string") content += delta.content;
        for (const part of delta.tool_calls ?? []) {
          const index = Number(part.index ?? calls.length);
          if (!calls[index]) calls[index] = { id: "", name: "", arguments: "" };
          if (part.id) calls[index].id = part.id;
          if (part.function?.name) calls[index].name += part.function.name;
          if (part.function?.arguments) calls[index].arguments += part.function.arguments;
        }
      }
      last = { status: response.status, ms: Date.now() - started, content, toolCalls: calls.filter(Boolean), usage };
      if (response.status === 200 && (content || last.toolCalls.length > 0)) return last;
      if (![429, 500, 502, 503].includes(response.status)) return last;
    } catch (error) {
      last = { status: 0, ms: Date.now() - started, content: "", toolCalls: [], error: String(error) };
    } finally {
      clearTimeout(timer);
    }
    await sleep(1200 * attempt);
  }
  return last;
};

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .trim();

const has = (obj, key) => obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);

const score = (q, parsed, turns) => {
  const calls = turns.filter((t) => t.kind === "tool").length;
  const recalled = calls > 0;
  if (q.id === "T1-latest") {
    const answer = parsed?.latest_test;
    const pass = has(answer, "pass") ? answer.pass : undefined;
    return { answer: pass ?? null, correct: pass === 1139, recalled, unnecessaryRecall: recalled };
  }
  if (q.id === "T2-earliest") {
    const answer = parsed?.earliest_test;
    const pass = has(answer, "pass") ? answer.pass : undefined;
    const fail = has(answer, "fail") ? answer.fail : undefined;
    const ref = has(answer, "ref") ? answer.ref : undefined;
    return {
      answer: { pass: pass ?? null, fail: fail ?? null, ref: ref ?? null },
      correct: pass === 422 && fail === 0 && [5, 6].includes(Number(ref)),
      recalled,
    };
  }
  if (q.id === "T3-absent") {
    const answer = parsed?.pi_1_0_0;
    const pass = has(answer, "pass") ? answer.pass : undefined;
    return {
      answer: pass ?? null,
      correct: has(answer, "pass") && pass === null,
      abstained: has(answer, "pass") && pass === null,
      fabricated: has(answer, "pass") && pass !== null,
      wrong1139: pass === 1139,
      recalled,
    };
  }
  if (q.id === "T4-hidden-requirement") {
    const raw = has(parsed, "release_checklist_rule") ? parsed.release_checklist_rule : undefined;
    const text = norm(raw);
    const exact = text.includes(norm(TARGET));
    const keyword =
      (text.includes("saved original") ||
        text.includes("保存的原文") ||
        text.includes("保存原文") ||
        text.includes("原始记录") ||
        text.includes("原文") ||
        text.includes("原始")) &&
      /never|not|绝不|不要|不能|不得|不应|不可|禁止|勿/.test(text) &&
      /infer|推断|推测/.test(text);
    return {
      answer: typeof raw === "string" ? raw.slice(0, 400) : null,
      correct: exact || keyword,
      exactQuote: exact,
      keyword,
      recalled,
    };
  }
  if (q.id === "T6-no-keyword-clue") {
    const allowed = has(parsed, "record_changelog") ? parsed.record_changelog : undefined;
    const why = has(parsed, "why") ? parsed.why : undefined;
    const text = norm(why);
    const grounded =
      /independent|second (run|pass|rerun)|never sufficient|not sufficient|独立|第二次|重跑|不足以|不够|必须再/.test(text);
    return {
      answer: {
        record_changelog: allowed === null || allowed === undefined ? null : allowed,
        why: typeof why === "string" ? why.slice(0, 400) : null,
      },
      correct: allowed === false,
      wrongVisible: allowed === true,
      abstained: allowed === null || allowed === undefined,
      grounded,
      recalled,
      zeroCallWrong: calls === 0 && allowed !== false,
    };
  }
  if (q.id === "T5-looks-answerable") {
    const raw = has(parsed, "allocator_regeneration_condition")
      ? parsed.allocator_regeneration_condition
      : undefined;
    const text = norm(raw);
    const exact = text.includes(norm(T5_TARGET));
    // Widened before the pre-registered run: a smoke answer said "只有用户明确
    // 批准新的 fixture", which the first keyword list missed. Approval and
    // "new fixture" are matched as separate groups so paraphrase order is free.
    const keyword =
      /explicitly approves|explicit approval|explicit user approval|明确批准|明确同意|明确许可/.test(text) &&
      /new fixture|新夹具|新的夹具|新 fixture|新的 fixture/.test(text);
    return {
      answer: typeof raw === "string" ? raw.slice(0, 400) : null,
      correct: exact || keyword,
      exactQuote: exact,
      keyword,
      recalled,
    };
  }
  return { correct: false, recalled };
};

const runOne = async (condition, q, rep) => {
  const messages = [
    { role: "system", content: condition.system },
    { role: "user", content: userPrompt(q) },
  ];
  const turns = [];
  let final = "";
  let firstAction = null;
  let invalid = false;
  let overBudget = false;
  let hiddenExposed = false;
  // A tool result "exposed" the hidden text only if the hidden sentence itself
  // came back. This is a structural measure, not an answer score.
  const hiddenMarker =
    q.id === "T5-looks-answerable" ? "explicitly approves a new fixture"
      : q.id === "T6-no-keyword-clue" ? "green run is never sufficient"
        : "must be read from the saved original";
  const recordTool = (args, toolText, result, extra = {}) => {
    if (toolText.includes(hiddenMarker)) hiddenExposed = true;
    // The range the reader actually returned. A clamped length and a merged
    // cover read are both measured by this interval, not by the request.
    const rangeMatch = String(toolText).match(/^#(\d+) \[[^\]]*\] field=(\S+) (\d+)-(\d+) of (\d+)/m);
    const readRange = rangeMatch && Number(rangeMatch[1]) === 1 && rangeMatch[2] === "content"
      ? { start: Number(rangeMatch[3]), end: Number(rangeMatch[4]), total: Number(rangeMatch[5]) }
      : null;
    const text = String(toolText);
    const coverHead = text.match(/\(cover: (\d+) windows? merged/);
    turns.push({
      kind: "tool",
      args,
      result: text.slice(0, 400),
      chars: text.length,
      status: result.status,
      ms: result.ms,
      readRange,
      coverEnded: /\[end of hidden span|unread 0\]/.test(text),
      coverWindows: coverHead ? Number(coverHead[1]) : null,
      ...extra,
    });
    if (firstAction === null) firstAction = "tool";
  };
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  for (let step = 0; step < 6; step++) {
    const callsSoFar = turns.filter((t) => t.kind === "tool").length;
    if (callsSoFar >= 3) {
      messages.push({ role: "user", content: "Tool budget exhausted (3 calls). Answer now with the requested JSON." });
    }
    const result = PROTOCOL_MODE === "native" ? await streamCall(messages) : await call(messages);
    const structured = result?.toolCalls ?? [];
    if (!result || (!result.content && structured.length === 0)) {
      invalid = true;
      turns.push({ kind: "invalid", status: result?.status ?? 0, ms: result?.ms ?? 0 });
      break;
    }
    usage.prompt_tokens += result.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += result.usage?.completion_tokens ?? 0;

    if (PROTOCOL_MODE === "native") {
      if (structured.length === 0) {
        final = result.content;
        turns.push({ kind: "answer", content: result.content.slice(0, 600), status: result.status, ms: result.ms });
        if (firstAction === null) firstAction = "answer";
        break;
      }
      const assistantCalls = structured.map((call, i) => ({
        id: call.id || `call_${step}_${i}`,
        type: "function",
        function: { name: call.name || "context_index", arguments: call.arguments || "{}" },
      }));
      messages.push({ role: "assistant", content: result.content || "", tool_calls: assistantCalls });
      let handled = 0;
      for (const toolCallItem of assistantCalls) {
        if (turns.filter((t) => t.kind === "tool").length >= 3) { overBudget = true; break; }
        let args = {};
        let argsError = null;
        try {
          args = toolCallItem.function.arguments ? JSON.parse(toolCallItem.function.arguments) : {};
        } catch (error) {
          argsError = String(error);
        }
        const toolText = argsError ? `invalid tool arguments: ${argsError}` : String(reader.run(args ?? {}));
        recordTool(args, toolText, result, argsError ? { argsError } : {});
        messages.push({ role: "tool", tool_call_id: toolCallItem.id, content: toolText });
        handled += 1;
      }
      if (handled === 0) break;
      continue;
    }

    messages.push({ role: "assistant", content: result.content });
    const tc = toolCall(result.content);
    if (!tc) {
      final = result.content;
      turns.push({ kind: "answer", content: result.content.slice(0, 600), status: result.status, ms: result.ms });
      if (firstAction === null) firstAction = "answer";
      break;
    }
    if (callsSoFar >= 3) {
      overBudget = true;
      turns.push({ kind: "over-budget", content: result.content.slice(0, 300) });
      break;
    }
    const toolText = String(reader.run(tc.args ?? {}));
    recordTool(tc.args, toolText, result);
    messages.push({ role: "user", content: `tool result:\n${toolText}` });
  }
  const readArgs = (t) => {
    if (t.args === undefined || t.args === null) return null;
    if (typeof t.args.read === "number") {
      return { index: t.args.read, offset: t.args.offset, length: t.args.length, page: t.args.page, line: t.args.line, field: t.args.field, cover: t.args.cover };
    }
    if (t.args.read && typeof t.args.read === "object") return t.args.read;
    return null;
  };
  // Reads of the first user field are measured by the interval the reader
  // actually returned (header line), including the page/line locators it
  // resolves server-side and the merged cover interval. This is structural:
  // it measures coverage of the hidden span, not answer quality.
  const readIntervals = [];
  for (const t of turns) {
    if (t.kind !== "tool") continue;
    const read = readArgs(t);
    if (!read || Number(read.index) !== 1 || (read.field ?? "content") !== "content") continue;
    if (t.readRange) {
      readIntervals.push({ offset: t.readRange.start, end: t.readRange.end, cover: read.cover === true });
      continue;
    }
    let offset;
    let length = Number(read.length);
    if (read.page !== undefined) {
      offset = hiddenStart + (Number(read.page) - 1) * 1200;
      if (!Number.isFinite(length)) length = 1200;
    } else if (read.line !== undefined) {
      const line = Number(read.line);
      offset = Number.isInteger(line) && line >= 1 && line <= firstLineStarts.length
        ? firstLineStarts[line - 1]
        : NaN;
      if (!Number.isFinite(length)) length = 1200;
    } else {
      offset = Number(read.offset);
    }
    if (!Number.isFinite(offset)) continue;
    if (!Number.isFinite(length) || length <= 0) length = 1200;
    readIntervals.push({ offset, end: offset + Math.min(length, maxRead), cover: read.cover === true });
  }
  const questionTarget = q.id === "T6-no-keyword-clue" ? t6Offset : t5Offset;
  const usedAddress = hiddenStart !== null && readIntervals.some((r) => r.offset === hiddenStart);
  const usedMax = hiddenStart !== null && hiddenSpan !== null &&
    readIntervals.some((r) => !r.cover && r.offset === hiddenStart && r.end - r.offset >= Math.min(maxRead, hiddenSpan));
  const usedCover = hiddenStart !== null && readIntervals.some((r) => r.cover && r.offset === hiddenStart);
  const coverCalls = turns.filter((t) => t.kind === "tool" && readArgs(t)?.cover === true).length;
  const coverTurns = turns.filter((t) => t.kind === "tool" && readArgs(t)?.cover === true);
  const coverChars = coverTurns.reduce((sum, t) => sum + (t.chars ?? 0), 0);
  const coverComplete = coverTurns.some((t) => t.coverEnded === true);
  const coverWindows = coverTurns.reduce((max, t) => Math.max(max, t.coverWindows ?? 0), 0);
  const usedPage = turns.some((t) => {
    if (t.kind !== "tool") return false;
    const read = readArgs(t);
    return Boolean(read) && (read.page !== undefined || read.line !== undefined);
  });
  const touchedPages = new Set();
  if (hiddenStart !== null && hiddenEnd !== null) {
    for (const r of readIntervals) {
      const a = Math.max(r.offset, hiddenStart);
      const b = Math.min(r.end, hiddenEnd);
      if (b <= a) continue;
      const firstPage = Math.floor((a - hiddenStart) / 1200);
      const lastPage = Math.floor((b - 1 - hiddenStart) / 1200);
      for (let p = firstPage; p <= lastPage; p++) touchedPages.add(p);
    }
  }
  const pagesCovered = hiddenSpan === null ? null : touchedPages.size;
  const maxOffsetReached = hiddenSpan === null
    ? null
    : readIntervals.reduce((m, r) => Math.min(hiddenEnd, Math.max(m, r.end)), hiddenStart);
  const targetCoveredByRead = readIntervals.some((r) => r.offset <= questionTarget && questionTarget < r.end);
  const allReadCalls = turns.filter((t) => t.kind === "tool" && readArgs(t)).length;
  const scanCalls = turns.filter((t) => t.kind === "tool" && t.args?.scan !== undefined).length;
  const viewCalls = turns.filter((t) => t.kind === "tool" && t.args &&
    t.args.view !== undefined && t.args.read === undefined && t.args.range === undefined &&
    t.args.scan === undefined && t.args.touched === undefined).length;
  const toolChars = turns.filter((t) => t.kind === "tool").reduce((sum, t) => sum + (t.chars ?? 0), 0);
  const readLengths = turns
    .filter((t) => t.kind === "tool")
    .map((t) => Number(readArgs(t)?.length))
    .filter((n) => Number.isFinite(n));
  const parsed = parse(final);
  const scored = score(q, parsed, turns);
  const formatError = /<｜DSML｜|invoke name=/.test(final) ||
    turns.some((t) => t.kind === "answer" && /<｜DSML｜|invoke name=/.test(t.content ?? ""));
  const callCount = turns.filter((t) => t.kind === "tool").length;
  const row = {
    condition: condition.label,
    conditionId: condition.id,
    question: q.id,
    group: q.group,
    rep,
    firstAction,
    calls: callCount,
    invalid,
    formatError,
    overBudget,
    hiddenExposed,
    hiddenStart,
    hiddenEnd,
    hiddenSpan,
    hiddenPages,
    hiddenWindows,
    firstPageTarget: q.id === "T6-no-keyword-clue" ? t6InFirstPage : t5InFirstPage,
    usedAddress,
    usedMax,
    usedCover,
    usedPage,
    coverCalls,
    coverChars,
    coverComplete,
    coverWindows,
    coverMax,
    pagesCovered,
    maxOffsetReached,
    targetCoveredByRead,
    readCalls: allReadCalls,
    targetReadCalls: readIntervals.length,
    scanCalls,
    viewCalls,
    toolChars,
    readLengths,
    protocol: PROTOCOL_MODE,
    render: RENDER,
    coverMode: cover,
    model: MODEL,
    parsed: parsed !== null,
    ...scored,
    zeroCallWrong: scored.zeroCallWrong ?? (callCount === 0 && scored.correct !== true),
    promptTokens: usage.prompt_tokens,
    usage,
    msTotal: turns.reduce((sum, t) => sum + (t.ms || 0), 0),
    turns,
  };
  console.log(
    JSON.stringify({
      condition: row.condition,
      question: row.question,
      rep,
      firstAction,
      calls: row.calls,
      invalid,
      formatError,
      hiddenExposed,
      parsed: row.parsed,
      correct: row.correct,
      recalled: row.recalled,
      answer: row.answer,
    }),
  );
  return row;
};

console.log(
  JSON.stringify({
    variant: VARIANT,
    view: view.manifest.id,
    viewChars: view.text.length,
    render: RENDER,
    protocol: PROTOCOL_MODE,
    model: MODEL,
    targetOffset,
    t5Offset,
    t6Offset,
    hiddenStart,
    hiddenEnd,
    hiddenSpan,
    hiddenPages,
    hiddenWindows,
    pageTable,
    maxRead,
    cover,
    coverMax,
    coverLinePresent: /cover: \{/.test(view.text),
    t5InFirstPage,
    t6InFirstPage,
    targetHidden: !view.text.includes("release checklist"),
    t5Hidden: BASE_VARIANT === "t5" ? !view.text.includes("explicitly approves") : null,
    t6Visible: BASE_VARIANT === "t6" ? view.text.includes("Changelog checklist") : null,
    t6Hidden: BASE_VARIANT === "t6" ? !view.text.includes("green run is never sufficient") : null,
    t6l: LONG,
    conditions: ONLY_CONDITIONS,
    questions: ONLY_QUESTIONS,
    reps: REPS,
  }),
);

const rows = [];
for (const cid of ONLY_CONDITIONS) {
  const condition = conditions[cid];
  if (!condition) throw new Error(`unknown condition ${cid}`);
  for (const qid of ONLY_QUESTIONS) {
    const q = questions[qid];
    if (!q) throw new Error(`unknown question ${qid}`);
    for (let rep = 1; rep <= REPS; rep++) {
      rows.push(await runOne(condition, q, rep));
      writeFileSync(`${OUT}/${OUT_NAME}.json`, JSON.stringify(rows, null, 2));
    }
  }
}
console.log(`done ${rows.length} rows`);
