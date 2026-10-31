import { performance } from 'node:perf_hooks';
import { buildCatalog } from './catalog.mjs';
import { buildView } from './render.mjs';
import { createReader } from './reader.mjs';

const build = (target) => {
  const entries=[]; let id=0; let parent=null; const main=[]; let last=null;
  const add=(e)=>{e.id=`b${String(id++).padStart(6,'0')}`;e.parentId=parent;entries.push(e);parent=e.id;last=e;if(e.type==='message')main.push(e);return e;};
  add({type:'message',message:{role:'system',content:'system'}});
  add({type:'message',message:{role:'user',content:'Work through the large synthetic history. Do not use Math.min(...array).'}});
  // giant result early
  const giant='x'.repeat(190000)+'\nNEEDLE-190000 422 pass / 0 fail\n'+'y'.repeat(9000);
  add({type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'tc_giant',name:'bash',arguments:{command:'bun test'}}]}});
  add({type:'message',message:{role:'toolResult',toolCallId:'tc_giant',toolName:'bash',content:[{type:'text',text:giant}],isError:false}});
  let i=0;
  while(main.length<target-30){
    if(i%20===0){add({type:'message',message:{role:'assistant',content:[{type:'toolCall',id:`tc_op_${i}`,name:'edit',arguments:{path:`src/bench/op-${i}.ts`,oldText:'a',newText:'b'}}]}});add({type:'message',message:{role:'toolResult',toolCallId:`tc_op_${i}`,toolName:'edit',content:[{type:'text',text:'file operation recorded'}],isError:false}});}
    else {add({type:'message',message:{role:'assistant',content:[{type:'toolCall',id:`tc_read_${i}`,name:'read',arguments:{file_path:`docs/bench-${i}.md`}}]}});add({type:'message',message:{role:'toolResult',toolCallId:`tc_read_${i}`,toolName:'read',content:[{type:'text',text:'line of synthetic filler '.repeat(8)}],isError:false}});}
    i++;
  }
  const cut=main[main.length-30].id;
  while(main.length<target){add({type:'message',message:{role:'assistant',content:[{type:'text',text:'tail filler'}]}});}
  return {entries, headId:last.id, firstKeptEntryId:cut, expected:{skipCustomTypes:[],hostFileOps:{}}};
};
const fixture=build(10000);
const times=[];
let catalog, view;
for(let i=0;i<5;i++){
  const t=performance.now();
  catalog=buildCatalog(fixture);
  view=buildView(catalog,{capChars:9583});
  times.push(performance.now()-t);
}
const reader=createReader({catalog,view});
let t=performance.now();
const scan=reader.run({scan:'NEEDLE-190000'});
const scanMs=performance.now()-t;
t=performance.now();
const read=reader.run({read:3,field:'content.0.text',offset:190000,length:80});
const readMs=performance.now()-t;
console.log(JSON.stringify({messages:catalog.counts.saved,effective:catalog.counts.effective,blocks:catalog.blocks,viewChars:view.text.length,needed:view.neededChars,times,scanMs,readMs,scanHead:scan.slice(0,200),readHead:read.slice(0,120),heapMB:Math.round(process.memoryUsage().heapUsed/1048576)},null,1));
