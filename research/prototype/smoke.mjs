import { makeFixture } from './fixtures.mjs';
import { buildCatalog } from './catalog.mjs';
import { buildView } from './render.mjs';

const fixture = makeFixture('A');
console.log('fixture', fixture.entries.length, fixture.expected.expectedSaved, fixture.expected.expectedE, fixture.expected.expectedLive);
const catalog = buildCatalog(fixture);
console.log('catalog', catalog.counts, 'blocks', catalog.blocks, 'ops', catalog.observations.operations.length, 'mut', catalog.observations.mutationTotal, 'paths', catalog.observations.mutationPaths.length, 'errors', catalog.observations.errors.length, 'counters', catalog.observations.counters.map(c=>[c.pass,c.fail,c.refs,c.field,c.offset]));
console.log('expected', fixture.expected.mutationCount, fixture.expected.mutationPaths.length, fixture.expected.errors, fixture.expected.early, fixture.expected.mid, fixture.expected.late);
for (const cap of [6287, 8217, 9584, 12560]) {
  const view = buildView(catalog, { capChars: cap });
  console.log('view', cap, 'len', view.text.length, 'used', view.usedChars, 'needed', view.neededChars, 'counts', view.counts);
  console.log(view.text.slice(0, 700));
  console.log('---');
}
