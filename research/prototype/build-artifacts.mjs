// Build all synthetic artifacts for the API experiments.
// Run with Bun because the 0.1.5 baseline imports the real TypeScript compiler.

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeFixture } from "./fixtures.mjs";
import { buildCatalog, primaryTextField } from "./catalog.mjs";
import { buildView } from "./render.mjs";
import { compileRankedWithDetail } from "../../src/core/summarize.ts";

const outDir = "research/prototype/out";
mkdirSync(outDir, { recursive: true });

const serializedMessage = (msg, n) => {
  if (msg.role === "toolResult") {
    const text = primaryTextField(msg)?.text ?? "";
    return `#${n} [toolResult ${msg.toolName}${msg.isError ? " error" : ""}]\n${text}`;
  }
  if (msg.role === "bashExecution") {
    return `#${n} [bashExecution]\n$ ${msg.command}\n${msg.output}`;
  }
  if (msg.role === "assistant" && Array.isArray(msg.content)) {
    const parts = [];
    for (const part of msg.content) {
      if (part.type === "text") parts.push(part.text);
      else if (part.type === "toolCall") parts.push(`[toolCall ${part.name}] ${JSON.stringify(part.arguments ?? {})}`);
    }
    return `#${n} [assistant]\n${parts.join("\n")}`;
  }
  return `#${n} [${msg.role}]\n${typeof msg.content === "string" ? msg.content : primaryTextField(msg)?.text ?? ""}`;
};

const tailText = (catalog) => {
  const live = catalog.E.filter((r) => r.live).sort((a, b) => a.n - b.n);
  return live.map((r) => serializedMessage(r.message, r.n)).join("\n\n");
};

const legacyView = (fixture, catalog, budget) => {
  const prefix = catalog.E.filter((r) => !r.live);
  const result = compileRankedWithDetail({
    messages: prefix.map((r) => r.message),
    sourceIndices: prefix.map((r) => r.n),
    fileOps: {
      readFiles: fixture.expected.hostFileOps.read,
      modifiedFiles: fixture.expected.hostFileOps.written,
    },
    trackCommands: [],
    ranking: {
      maxBriefChars: budget,
      maxBriefCharsCeiling: budget,
      briefCharsPerBlock: 47,
    },
    briefHistory: {
      messages: prefix.map((r) => r.message),
      sourceIndices: prefix.map((r) => r.n),
      hadCodemodeHistory: true,
      hasContextEdits: false,
    },
    briefBudgetChars: budget,
  });
  return {
    text: result.summary,
    counts: result.detail.counts,
    kind: result.detail.kind,
    header: result.detail.headerNames,
    used: result.detail.usedChars,
    reserved: result.detail.reservedChars,
  };
};

const meta = [];
const artifacts = {};

const record = (label, text, extra = {}) => {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  writeFileSync(`${outDir}/${label}.txt`, text);
  meta.push({ label, chars: text.length, sha: hash, ...extra });
  artifacts[label] = { text, ...extra };
};

const fixtureA = makeFixture("A");
const catalogA = buildCatalog(fixtureA);
const tailA = tailText(catalogA);
writeFileSync(`${outDir}/tail-A.txt`, tailA);

for (const budget of [6287, 9583]) {
  const legacy = legacyView(fixtureA, catalogA, budget);
  record(`legacy-${budget}`, legacy.text, {
    view: "legacy",
    budget,
    used: legacy.used,
    reserved: legacy.reserved,
    header: legacy.header,
    detailCounts: legacy.counts,
  });
}

for (const cap of [6287, 7850, 8217, 9583, 12560]) {
  const view = buildView(catalogA, { capChars: cap });
  record(`index-${cap}`, view.text, {
    view: "index",
    cap,
    needed: view.neededChars,
    used: view.usedChars,
    counts: view.counts,
    viewId: view.manifest.id,
    budget: view.budget,
  });
}

{
  const view = buildView(catalogA, { capChars: 9583, coverMode: "legacy" });
  record("index-legacy-cover", view.text, { view: "index", cap: 9583, variant: "legacy-cover", counts: view.counts, viewId: view.manifest.id });
}
{
  const view = buildView(catalogA, { capChars: 9583, coverMode: "none" });
  record("index-no-cover", view.text, { view: "index", cap: 9583, variant: "no-cover", counts: view.counts, viewId: view.manifest.id });
}
{
  const view = buildView(catalogA, { capChars: 9583, counterValue: false });
  record("index-ref-only", view.text, { view: "index", cap: 9583, variant: "ref-only", counts: view.counts, viewId: view.manifest.id });
}
{
  const view = buildView(catalogA, { capChars: 9583, includeCounters: false });
  record("index-no-counter", view.text, { view: "index", cap: 9583, variant: "no-counter", counts: view.counts, viewId: view.manifest.id });
}
for (const [label, userMode] of [
  ["u-full", "auto"],
  ["u-line", "line"],
  ["u-char", "char"],
  ["u-none", "none-first"],
]) {
  const view = buildView(catalogA, { capChars: 12560, userMode });
  record(label, view.text, { view: "index", cap: 12560, variant: label, counts: view.counts, viewId: view.manifest.id, needed: view.neededChars });
}

const fixtureB = makeFixture("B");
const catalogB = buildCatalog(fixtureB);
const tailB = tailText(catalogB);
writeFileSync(`${outDir}/tail-B.txt`, tailB);
for (const cap of [6287, 9583]) {
  const view = buildView(catalogB, { capChars: cap });
  record(`index-B-${cap}`, view.text, {
    view: "index",
    shape: "B",
    cap,
    needed: view.neededChars,
    used: view.usedChars,
    counts: view.counts,
    viewId: view.manifest.id,
    externalTaskBook: fixtureB.expected.externalTaskBook,
  });
}

const summary = {
  fixtureA: {
    messages: fixtureA.expected.expectedSaved,
    effective: fixtureA.expected.expectedE,
    live: fixtureA.expected.expectedLive,
    mutations: fixtureA.expected.mutationCount,
    paths: fixtureA.expected.mutationPaths.length,
    errors: fixtureA.expected.errors.length,
    blocks: catalogA.blocks,
    view8217Needed: artifacts["index-8217"]?.needed,
  },
  fixtureB: {
    messages: fixtureB.expected.expectedSaved,
    effective: fixtureB.expected.expectedE,
    live: fixtureB.expected.expectedLive,
    mutations: fixtureB.expected.mutationCount,
    paths: fixtureB.expected.mutationPaths.length,
    blocks: catalogB.blocks,
    needed6287: artifacts["index-B-6287"]?.needed,
    needed9583: artifacts["index-B-9583"]?.needed,
  },
  artifacts: meta,
};

writeFileSync(`${outDir}/artifacts.json`, JSON.stringify({ ...artifacts, summary }, null, 2));
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
