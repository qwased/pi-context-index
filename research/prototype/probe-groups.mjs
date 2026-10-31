import { readFileSync } from 'node:fs';
const arts=JSON.parse(readFileSync('research/prototype/out/artifacts.json','utf8'));
const tail=readFileSync('research/prototype/out/tail-A.txt','utf8');
const a=arts['index-8217'].text;
const groups={
 paths:`只依据材料。输出严格 JSON：{"mutation_count":number|null,"mutated_paths":[string],"observed_errors":[{"ref":number|null,"tool":string}]}。mutation_count 只数 O 行里的 write/edit 请求，不含 host aggregate；mutated_paths 是这些请求参数中的字面路径，去重，最多 80；observed_errors 列出材料中观测到的错误及引用编号。`,
 ctx:`只依据材料。输出严格 JSON：{"constraints":[string],"unverified":[string],"state":{"committed":boolean|null,"tagged":boolean|null,"pushed":boolean|null,"npm_published":boolean|null}}。constraints 抄用户明确写出的约束短语（最多 12 条）；unverified 只填材料明确说“未运行/未验证/未做”的事项；state 只看材料中的记录。`,
 cover:`只依据材料。输出严格 JSON：{"coverage":{"earliest_saved":number|null,"index_only_count":number|null,"view_ref":string|null,"may_commit":boolean|null}}。earliest_saved 是保存消息的最早编号；index_only_count 是视图标记为 IndexOnly 的记录数；view_ref 是视图编号；may_commit 按最新用户指令回答现在能否提交；材料没有的填 null。`,
};
for (const [name,instr] of Object.entries(groups)) {
 const u=instr+`\n\n<artifact>\n${a}\n</artifact>\n\n<tail>\n${tail}\n</tail>`;
 const started=Date.now();
 const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),80000);
 try {
  const res=await fetch('http://127.0.0.1:8787/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'deepseek-v4.1-flash-1017',messages:[{role:'user',content:u}],max_tokens:3000,reasoning_effort:'minimal',temperature:0,stream:false}),signal:ac.signal});
  const j=await res.json(); const m=j.choices?.[0]?.message??{};
  console.log('\n###',name,JSON.stringify({status:res.status,ms:Date.now()-started,usage:j.usage,chars:(m.content??'').length}));
  console.log(m.content);
 } catch(e){console.log('\n###',name,'ERROR',String(e),Date.now()-started)}
 clearTimeout(timer);
}
