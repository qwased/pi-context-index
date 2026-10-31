import { writeFileSync } from 'node:fs';
import { makeFixture } from './fixtures.mjs';
import { buildCatalog } from './catalog.mjs';
import { buildView } from './render.mjs';
const f=makeFixture('A'); const c=buildCatalog(f);
for (const cap of [6287,8217]) { const v=buildView(c,{capChars:cap}); writeFileSync(`research/prototype/out/peek-${cap}.txt`, v.text); console.log('\n=====',cap,'=====\n'+v.text); }
