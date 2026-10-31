import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "research/prototype/out";
// DeepSeek only: non-DeepSeek runs are excluded by constraint and contribute
// no numbers anywhere.
const FILES = (process.env.FU_IN ??
  "activation-t5,followup-t5-distant,followup-t5-near,followup-t6-distant,followup-t6-near,followup-t6-distant-native,followup-t6-near-native").split(",");

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"'\`]/g, "")
    .trim();
const approval = /explicitly approves|explicit approval|explicit user approval|明确批准|明确同意|明确许可/;
const newFixture = /new fixture|新夹具|新的夹具|新 fixture|新的 fixture/;
const rerun = /independent|second (run|pass|rerun)|never sufficient|not sufficient|独立|第二次|重跑|不足以|不够|必须再/;

const bootstrapOf = (name) => {
  const path = `${OUT}/${name}.log`;
  if (!existsSync(path)) return {};
  const first = readFileSync(path, "utf8").split("\n").find((line) => line.startsWith("{"));
  if (!first) return {};
  try {
    return JSON.parse(first);
  } catch {
    return {};
  }
};

const readArgsOf = (args) => {
  if (args === undefined || args === null) return null;
  if (typeof args.read === "number") return { index: args.read, offset: args.offset, length: args.length };
  if (args.read && typeof args.read === "object") return args.read;
  return null;
};

const rescore = (row, hiddenStart) => {
  let correct = row.correct;
  let exactQuote = row.exactQuote;
  let grounded = row.grounded;
  let wrongVisible = row.wrongVisible;
  let abstained = row.abstained;
  if (row.question === "T5-looks-answerable") {
    const text = norm(row.answer);
    exactQuote = text.includes(norm("Exception to the allocator-golden rule: regeneration is allowed only when the user explicitly approves a new fixture."));
    correct = exactQuote || (approval.test(text) && newFixture.test(text));
  }
  if (row.question === "T6-no-keyword-clue") {
    const allowed = row.answer && typeof row.answer === "object" ? row.answer.record_changelog : undefined;
    correct = allowed === false;
    wrongVisible = allowed === true;
    abstained = allowed === null || allowed === undefined;
    grounded = rerun.test(norm(row.answer?.why));
  }
  const reads = (row.turns ?? [])
    .filter((t) => t.kind === "tool")
    .map((t) => readArgsOf(t.args))
    .filter(Boolean);
  const usedAddress = hiddenStart === null || hiddenStart === undefined
    ? null
    : reads.some((r) => Number(r.index) === 1 && Number(r.offset) === hiddenStart);
  return {
    ...row,
    correct,
    exactQuote,
    grounded,
    wrongVisible,
    abstained,
    usedAddress,
    readLengths: reads.map((r) => Number(r.length)).filter((n) => Number.isFinite(n)),
  };
};

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

const summary = [];
for (const name of FILES) {
  const boot = bootstrapOf(name);
  const hiddenStart = boot.hiddenStart ?? null;
  const rows = JSON.parse(readFileSync(`${OUT}/${name}.json`, "utf8")).map((row) => rescore(row, hiddenStart));
  const groups = new Map();
  for (const row of rows) {
    const key = row.condition;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [condition, group] of groups) {
    const valid = group.filter((r) => !r.invalid && !r.formatError);
    const exposedKnown = valid.filter((r) => r.hiddenExposed !== undefined);
    summary.push({
      file: name,
      model: group[0].model ?? "deepseek-v4.1-flash-1017",
      protocol: group[0].protocol ?? "json",
      render: group[0].render ?? "1",
      question: group[0].question,
      firstPageTarget: group[0].firstPageTarget ?? boot.t6InFirstPage ?? boot.t5InFirstPage ?? null,
      hiddenStart,
      condition,
      n: group.length,
      valid: valid.length,
      invalid: group.filter((r) => r.invalid).length,
      formatErrors: group.filter((r) => r.formatError).length,
      firstTool: valid.filter((r) => r.firstAction === "tool").length,
      firstAnswer: valid.filter((r) => r.firstAction === "answer").length,
      correct: valid.filter((r) => r.correct).length,
      hiddenExposed: exposedKnown.length === 0 ? null : exposedKnown.filter((r) => r.hiddenExposed).length,
      usedAddress: valid[0]?.usedAddress === null ? null : valid.filter((r) => r.usedAddress).length,
      zeroCallWrong: valid.filter((r) => r.firstAction === "answer" && !r.correct).length,
      grounded: valid.filter((r) => r.grounded).length,
      abstained: valid.filter((r) => r.abstained).length,
      wrongVisible: valid.filter((r) => r.wrongVisible).length,
      calls: valid.map((r) => r.calls),
      meanCalls: mean(valid.map((r) => r.calls)),
      readLengths: [...new Set(valid.flatMap((r) => r.readLengths))].sort((a, b) => a - b),
    });
  }
}

const report = {
  note: "Synthetic fixtures only; DeepSeek only. valid excludes invalid responses and format errors; T5/T6 rescored from stored answers. usedAddress means a read at the hidden start printed on the U line.",
  summary,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/followup-summary.json`, JSON.stringify(report, null, 2));
