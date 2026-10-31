import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "research/prototype/out";
const FILES = (process.env.R3_IN ??
  "render3-p0,render3-p1,render3-p2,render3-p3,render3-r1-p0,render3-r1-p1,render3-s1,render3-s2,render3-s2b,render4-f1,render4-f2").split(",");
const rerun = /independent|second (run|pass|rerun)|never sufficient|not sufficient|独立|第二次|重跑|不足以|不够|必须再/;

const norm = (value) =>
  String(value ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[“”"'\`]/g, "").trim();

const bootstrapOf = (name) => {
  const path = `${OUT}/${name}.log`;
  if (!existsSync(path)) return {};
  const first = readFileSync(path, "utf8").split("\n").find((line) => line.startsWith("{"));
  if (!first) return {};
  try { return JSON.parse(first); } catch { return {}; }
};

const rescore = (row) => {
  if (row.question !== "T6-no-keyword-clue") return row;
  const allowed = row.answer && typeof row.answer === "object" ? row.answer.record_changelog : undefined;
  return {
    ...row,
    correct: allowed === false,
    wrongVisible: allowed === true,
    abstained: allowed === null || allowed === undefined,
    grounded: rerun.test(norm(row.answer?.why)),
  };
};

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const wilson = (k, n) => {
  if (!n) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
};

const summary = [];
for (const name of FILES) {
  if (!existsSync(`${OUT}/${name}.json`)) continue;
  const boot = bootstrapOf(name);
  const rows = JSON.parse(readFileSync(`${OUT}/${name}.json`, "utf8")).map(rescore);
  const groups = new Map();
  for (const row of rows) groups.set(row.condition, [...(groups.get(row.condition) ?? []), row]);
  for (const [condition, group] of groups) {
    // A non-JSON final answer is a protocol-format failure, not a wrong answer;
    // it is excluded from the correctness denominator and reported separately.
    const valid = group.filter((r) => !r.invalid && !r.formatError && r.parsed !== false);
    const unparsed = group.filter((r) => !r.invalid && !r.formatError && r.parsed === false).length;
    const correct = valid.filter((r) => r.correct).length;
    const groundedCorrect = valid.filter((r) => r.correct && r.grounded).length;
    const exposed = valid.filter((r) => r.hiddenExposed);
    const targetRead = valid.filter((r) => r.targetCoveredByRead);
    summary.push({
      file: name,
      arm: boot.arm ?? name.replace(/^render3-/, ""),
      model: group[0].model,
      render: group[0].render,
      protocol: group[0].protocol,
      question: group[0].question,
      variant: boot.variant ?? null,
      hiddenStart: boot.hiddenStart ?? null,
      hiddenEnd: boot.hiddenEnd ?? null,
      hiddenSpan: boot.hiddenSpan ?? null,
      hiddenPages: boot.hiddenPages ?? null,
      hiddenWindows: boot.hiddenWindows ?? null,
      firstPageTarget: boot.t6InFirstPage ?? null,
      condition,
      n: group.length,
      valid: valid.length,
      invalid: group.filter((r) => r.invalid).length,
      formatErrors: group.filter((r) => r.formatError).length,
      unparsed,
      firstTool: valid.filter((r) => r.firstAction === "tool").length,
      firstAnswer: valid.filter((r) => r.firstAction === "answer").length,
      correct,
      groundedCorrect,
      ungroundedCorrect: correct - groundedCorrect,
      correctInterval: wilson(correct, valid.length),
      hiddenExposed: exposed.length,
      exposedAndCorrect: exposed.filter((r) => r.correct).length,
      notExposed: valid.length - exposed.length,
      usedAddress: valid.filter((r) => r.usedAddress).length,
      usedMax: valid.filter((r) => r.usedMax).length,
      usedPage: valid.filter((r) => r.usedPage).length,
      targetCoveredByRead: targetRead.length,
      targetReadAndCorrect: targetRead.filter((r) => r.correct).length,
      pagesCoveredMean: mean(valid.map((r) => r.pagesCovered).filter((n) => Number.isFinite(n))),
      zeroCallWrong: valid.filter((r) => r.zeroCallWrong).length,
      calls: valid.map((r) => r.calls),
      meanCalls: mean(valid.map((r) => r.calls)),
      readCallsMean: mean(valid.map((r) => r.readCalls)),
      scanCalls: sum(valid.map((r) => r.scanCalls)),
      viewCalls: sum(valid.map((r) => r.viewCalls)),
      readLengths: [...new Set(valid.flatMap((r) => r.readLengths))].sort((a, b) => a - b),
      toolCharsMean: mean(valid.map((r) => r.toolChars)),
      toolCharsSum: sum(valid.map((r) => r.toolChars)),
      promptTokensMean: mean(valid.map((r) => r.promptTokens)),
      promptTokensSum: sum(valid.map((r) => r.promptTokens)),
    });
  }
}

const report = {
  note:
    "Synthetic fixtures only; DeepSeek only. valid excludes invalid responses and format-invalid answers. " +
    "correct is recomputed from the stored answer for T6. pagesCovered is the union of read intervals on the " +
    "1,200-char grid anchored at the hidden start; targetCoveredByRead is independent of the model's answer. " +
    "toolChars/promptTokens measure the read-back cost.",
  summary,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/render3-summary.json`, JSON.stringify(report, null, 2));
