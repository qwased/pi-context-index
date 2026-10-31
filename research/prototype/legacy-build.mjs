import { writeFileSync } from 'node:fs';
import { makeFixture } from './fixtures.mjs';
import { buildCatalog } from './catalog.mjs';
import { buildView } from './render.mjs';
import { compileRankedWithDetail } from '../../src/core/summarize.ts';

const fixture = makeFixture('A');
const catalog = buildCatalog(fixture);
const prefix = catalog.E.filter((r) => !r.live).map((r) => r.message);
const sourceIndices = catalog.E.filter((r) => !r.live).map((r) => r.n);
const result = compileRankedWithDetail({
  messages: prefix,
  sourceIndices,
  fileOps: { readFiles: fixture.expected.hostFileOps.read, modifiedFiles: fixture.expected.hostFileOps.written },
  trackCommands: [],
  ranking: { maxBriefChars: 6287, maxBriefCharsCeiling: 6287, briefCharsPerBlock: 47 },
  briefHistory: { messages: prefix, sourceIndices, hadCodemodeHistory: true, hasContextEdits: false },
  briefBudgetChars: 6287,
});
writeFileSync('research/prototype/out/legacy.txt', result.summary);
console.log(JSON.stringify({ len: result.summary.length, kind: result.detail.kind, header: result.detail.headerNames, used: result.detail.usedChars, reserved: result.detail.reservedChars, counts: result.detail.counts }, null, 2));
console.log(result.summary.slice(0, 900));
const index = buildView(catalog, { capChars: 6287 });
writeFileSync('research/prototype/out/index-6287.txt', index.text);
const index8 = buildView(catalog, { capChars: 8217 });
writeFileSync('research/prototype/out/index-8217.txt', index8.text);
console.log('index', index.text.length, index8.text.length, index8.neededChars);
