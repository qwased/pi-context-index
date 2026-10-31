// Aggregate render-5 arms. Synthetic fixtures only; reads the git-ignored raw
// rows and writes counts only.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "research/prototype/out";
const FILES = (process.env.R5_IN ?? "render5-a,render5-b,render5-c,render5-d,render5-r1,render5-r2,render5-r3").split(",");
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
    const valid = group.filter((r) => !r.invalid && !r.formatError && r.parsed !== false);
    const correct = valid.filter((r) => r.correct).length;
    const groundedCorrect = valid.filter((r) => r.correct && r.grounded).length;
    const targetRead = valid.filter((r) => r.targetCoveredByRead);
    const cover = valid.filter((r) => r.coverCalls > 0);
    summary.push({
      file: name,
      model: group[0].model,
      render: group[0].render,
      protocol: group[0].protocol,
      coverMode: group[0].coverMode,
      coverMax: group[0].coverMax,
      question: group[0].question,
      variant: boot.variant ?? null,
      view: boot.view ?? null,
      viewChars: boot.viewChars ?? null,
      hiddenStart: boot.hiddenStart ?? null,
      hiddenEnd: boot.hiddenEnd ?? null,
      hiddenSpan: boot.hiddenSpan ?? null,
      hiddenWindows: boot.hiddenWindows ?? null,
      condition,
      n: group.length,
      valid: valid.length,
      invalid: group.filter((r) => r.invalid).length,
      formatErrors: group.filter((r) => r.formatError).length,
      unparsed: group.filter((r) => !r.invalid && !r.formatError && r.parsed === false).length,
      firstTool: valid.filter((r) => r.firstAction === "tool").length,
      firstAnswer: valid.filter((r) => r.firstAction === "answer").length,
      correct,
      groundedCorrect,
      ungroundedCorrect: correct - groundedCorrect,
      correctInterval: wilson(correct, valid.length),
      hiddenExposed: valid.filter((r) => r.hiddenExposed).length,
      exposedAndCorrect: valid.filter((r) => r.hiddenExposed && r.correct).length,
      targetCoveredByRead: targetRead.length,
      targetReadAndCorrect: targetRead.filter((r) => r.correct).length,
      targetReadInterval: wilson(targetRead.length, valid.length),
      pagesCoveredMean: mean(valid.map((r) => r.pagesCovered).filter((n) => Number.isFinite(n))),
      pagesCoveredSum: sum(valid.map((r) => r.pagesCovered).filter((n) => Number.isFinite(n))),
      usedAddress: valid.filter((r) => r.usedAddress).length,
      usedMax: valid.filter((r) => r.usedMax).length,
      usedCover: valid.filter((r) => r.usedCover).length,
      coverCalls: sum(valid.map((r) => r.coverCalls ?? 0)),
      coverRuns: cover.length,
      coverComplete: valid.filter((r) => r.coverComplete).length,
      coverCharsMean: mean(cover.map((r) => r.coverChars)),
      coverWindows: [...new Set(valid.map((r) => r.coverWindows).filter((n) => n > 0))],
      zeroCallWrong: valid.filter((r) => r.zeroCallWrong).length,
      wrongVisible: valid.filter((r) => r.wrongVisible).length,
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

// Combined cells: same fixture + render + condition across the main and
// replication arms. This is the pre-registered 9-per-cell view; the per-file
// rows stay separate so a batch effect cannot hide inside a merge.
const combined = new Map();
for (const row of summary) {
  const key = [row.variant, row.render, row.condition].join("|");
  const cell = combined.get(key) ?? {
    variant: row.variant,
    render: row.render,
    condition: row.condition,
    files: [],
    n: 0,
    valid: 0,
    invalid: 0,
    formatErrors: 0,
    unparsed: 0,
    correct: 0,
    groundedCorrect: 0,
    targetCoveredByRead: 0,
    hiddenExposed: 0,
    usedCover: 0,
    coverRuns: 0,
    usedMax: 0,
    zeroCallWrong: 0,
    pagesCoveredSum: 0,
    calls: [],
    toolCharsSum: 0,
    promptTokensSum: 0,
  };
  cell.files.push(row.file);
  for (const key2 of ["n", "valid", "invalid", "formatErrors", "unparsed", "correct", "groundedCorrect", "targetCoveredByRead", "hiddenExposed", "usedCover", "usedMax", "zeroCallWrong"]) {
    cell[key2] += row[key2] ?? 0;
  }
  cell.coverRuns += row.coverRuns ?? 0;
  cell.calls.push(...row.calls);
  cell.pagesCoveredSum += row.pagesCoveredSum ?? 0;
  cell.toolCharsSum += row.toolCharsSum ?? 0;
  cell.promptTokensSum += row.promptTokensSum ?? 0;
  combined.set(key, cell);
}
const combinedRows = [...combined.values()].map((cell) => ({
  ...cell,
  correctInterval: wilson(cell.correct, cell.valid),
  targetReadInterval: wilson(cell.targetCoveredByRead, cell.valid),
  toolCharsMean: cell.valid ? cell.toolCharsSum / cell.valid : null,
  promptTokensMean: cell.valid ? cell.promptTokensSum / cell.valid : null,
  pagesCoveredMean: cell.valid ? cell.pagesCoveredSum / cell.valid : null,
}));

const report = {
  note:
    "Synthetic fixtures only; DeepSeek only. valid excludes invalid responses, format-invalid answers and unparsed JSON. " +
    "correct/grounded are recomputed from the stored answer. targetCoveredByRead and pagesCovered use the range the " +
    "reader actually returned (header line), so clamped and merged cover reads are measured by their real interval. " +
    "toolChars/promptTokens are the read-back cost.",
  summary,
  combined: combinedRows,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/render5-summary.json`, JSON.stringify(report, null, 2));
