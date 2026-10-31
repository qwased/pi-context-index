import { readFileSync, writeFileSync } from "node:fs";

const OUT = "research/prototype/out";
const IN = process.env.ACT_IN ?? "activation";
const T4_TARGET =
  "Activation target: the release checklist must be read from the saved original, never inferred from this excerpt.";
const T5_TARGET =
  "Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture.";

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"'`]/g, "")
    .trim();
const negation = /never|not|绝不|不要|不能|不得|不应|不可|禁止|勿/;

// The first run used a narrower Chinese negation list; rescore T4/T5 from the
// stored answer so a correct paraphrase such as "不得…推断" is not marked wrong.
const rescore = (row) => {
  let extra = {};
  if (row.question === "T4-hidden-requirement") {
    const text = norm(row.answer);
    const exact = text.includes(norm(T4_TARGET));
    const keyword =
      (text.includes("saved original") ||
        text.includes("保存的原文") ||
        text.includes("保存原文") ||
        text.includes("原始记录") ||
        text.includes("原文") ||
        text.includes("原始")) &&
      negation.test(text) &&
      /infer|推断|推测/.test(text);
    extra = { correctRaw: row.correct, correct: exact || keyword, exactQuote: exact, keyword };
  } else if (row.question === "T5-looks-answerable") {
    const text = norm(row.answer);
    const exact = text.includes(norm(T5_TARGET));
    const keyword =
      /explicitly approves|explicit approval|explicit user approval|明确批准|明确同意|明确许可/.test(text) &&
      /new fixture|新夹具|新的夹具|新 fixture|新的 fixture/.test(text);
    extra = { correctRaw: row.correct, correct: exact || keyword, exactQuote: exact, keyword };
  } else {
    extra = { correctRaw: row.correct };
  }
  const fieldError = (row.turns ?? []).some(
    (t) => t.kind === "tool" && /has no saved text fields|available fields:/.test(t.result ?? ""),
  );
  const formatError =
    row.formatError ??
    (row.turns ?? []).some((t) => t.kind === "answer" && /<｜DSML｜|invoke name=/.test(t.content ?? ""));
  return { ...row, ...extra, fieldError, formatError };
};

const rows = JSON.parse(readFileSync(`${OUT}/${IN}.json`, "utf8")).map(rescore);

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

const agg = (group) => {
  const valid = group.filter((r) => !r.invalid && !r.formatError && r.parsed);
  const invalid = group.filter((r) => r.invalid).length;
  const formatErrors = group.filter((r) => r.formatError).length;
  const values = {
    n: group.length,
    valid: valid.length,
    invalid,
    formatErrors,
    firstTool: valid.filter((r) => r.firstAction === "tool").length,
    firstAnswer: valid.filter((r) => r.firstAction === "answer").length,
    recalled: valid.filter((r) => r.recalled).length,
    correct: valid.filter((r) => r.correct).length,
    calls: valid.map((r) => r.calls),
    meanCalls: mean(valid.map((r) => r.calls)),
    meanPromptTokens: mean(valid.map((r) => r.usage?.prompt_tokens ?? 0)),
    meanCompletionTokens: mean(valid.map((r) => r.usage?.completion_tokens ?? 0)),
    meanMs: mean(valid.map((r) => r.msTotal ?? 0)),
  };
  if (group.some((r) => r.unnecessaryRecall !== undefined)) {
    values.unnecessaryRecall = valid.filter((r) => r.unnecessaryRecall).length;
  }
  if (group.some((r) => r.fabricated !== undefined)) {
    values.fabricated = valid.filter((r) => r.fabricated).length;
    values.wrong1139 = valid.filter((r) => r.wrong1139).length;
  }
  if (group.some((r) => r.exactQuote !== undefined)) {
    values.exactQuote = valid.filter((r) => r.exactQuote).length;
    values.keyword = valid.filter((r) => r.keyword).length;
    values.correctRaw = valid.filter((r) => r.correctRaw).length;
  }
  values.fieldErrors = valid.filter((r) => r.fieldError).length;
  values.directWrong = valid.filter((r) => r.firstAction === "answer" && !r.correct).length;
  values.recallWrong = valid.filter((r) => r.firstAction === "tool" && !r.correct).length;
  return values;
};

const cells = new Map();
for (const row of rows) {
  const key = `${row.condition} | ${row.question}`;
  const list = cells.get(key) ?? [];
  list.push(row);
  cells.set(key, list);
}

const byCell = [...cells.entries()].map(([cell, group]) => ({
  cell,
  condition: group[0].condition,
  question: group[0].question,
  group: group[0].group,
  ...agg(group),
}));

const byCondition = new Map();
for (const row of rows) {
  const list = byCondition.get(row.condition) ?? [];
  list.push(row);
  byCondition.set(row.condition, list);
}
const conditionRows = [...byCondition.entries()].map(([condition, group]) => ({
  condition,
  ...agg(group),
}));

const summary = { byCell, byCondition: conditionRows };
console.log(JSON.stringify(summary, null, 2));
writeFileSync(`${OUT}/${IN}-summary.json`, JSON.stringify(summary, null, 2));
