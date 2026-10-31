import { readFileSync } from 'node:fs';
const a=JSON.parse(readFileSync('research/prototype/out/artifacts.json','utf8'))['index-8217'].text;
const t=readFileSync('research/prototype/out/tail-A.txt','utf8');
const u=`只依据材料。输出严格 JSON：{"earliest_test":{"pass":number|null,"fail":number|null,"ref":number|null},"test_vectors":[{"pass":number,"fail":number,"ref":number|null}],"pi_1_0_0":{"pass":number|null}}。材料中最早一次测试的计数和结果编号是什么？列出所有测试计数向量。材料没有 Pi 1.0.0 的计数就填 null。\n\n<artifact>\n${a}\n</artifact>\n\n<tail>\n${t}\n</tail>`;
const started=Date.now();
const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),80000);
try {
 const res=await fetch('http://127.0.0.1:8787/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'deepseek-v4.1-flash-1017',messages:[{role:'user',content:u}],max_tokens:2000,reasoning_effort:'minimal',temperature:0,stream:false}),signal:ac.signal});
 const text=await res.text();
 console.log(JSON.stringify({status:res.status,ms:Date.now()-started,text:text.slice(0,3000)},null,1));
} catch(e) { console.log(JSON.stringify({error:String(e),ms:Date.now()-started})); }
clearTimeout(timer);
