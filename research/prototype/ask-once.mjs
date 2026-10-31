import { readFileSync } from 'node:fs';
const artifacts = JSON.parse(readFileSync('research/prototype/out/artifacts.json','utf8'));
const tail = readFileSync('research/prototype/out/tail-A.txt','utf8');
const label = process.argv[2] ?? 'index-8217';
const artifact = artifacts[label].text;
const instr = `你是只读的材料核对者。下面给出【压缩视图】和【保留尾部】。只依据这两段材料回答；材料没有的事实填 null 或空数组，不要猜测、不要补全。输出严格 JSON（不要代码围栏、不要额外解释）。

{
 "earliest_test": {"pass": number|null, "fail": number|null, "ref": number|null},
 "test_vectors": [{"pass": number, "fail": number, "ref": number|null}],
 "mutation_count": number|null,
 "mutated_paths": [string],
 "observed_errors": [{"ref": number|null, "tool": string}],
 "constraints": [string],
 "unverified": [string],
 "pi_1_0_0": {"pass": number|null},
 "state": {"committed": boolean|null, "tagged": boolean|null, "pushed": boolean|null, "npm_published": boolean|null},
 "coverage": {"earliest_saved": number|null, "index_only_count": number|null, "view_ref": string|null, "may_commit": boolean|null}
}

说明：earliest_test 指材料中最早一次测试的 pass/fail 计数和结果记录编号；test_vectors 列出材料中所有不同的 pass/fail 计数向量；mutation_count 指 write/edit 请求条数；mutated_paths 列出调用参数中的字面路径（去重，最多 80）；observed_errors 每条给引用编号；constraints 只抄用户明确写出的约束短语；unverified 只填材料明确说“未运行/未验证”的事项；state 只看材料中的记录；coverage 的 earliest_saved 是保存消息的最早编号，index_only_count 是视图中未展示的记录数，view_ref 是视图编号，may_commit 回答“按最新用户指令现在能否提交”。`;
const user = instr + "\n\n<artifact>\n" + artifact + "\n</artifact>\n\n<tail>\n" + tail + "\n</tail>";
for (let attempt=1; attempt<=3; attempt++) {
  const started = Date.now();
  const res = await fetch('http://127.0.0.1:8787/v1/chat/completions', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'deepseek-v4.1-flash-1017',messages:[{role:'user',content:user}],max_tokens:8000,reasoning_effort:'minimal',temperature:0,stream:false})});
  const text = await res.text();
  let j; try { j=JSON.parse(text); } catch { j={raw:text.slice(0,1000)}; }
  const msg = j.choices?.[0]?.message ?? {};
  console.log(JSON.stringify({attempt,status:res.status,ms:Date.now()-started,usage:j.usage,finish:j.choices?.[0]?.finish_reason,error:j.error??j.raw,chars:(msg.content??'').length,reasoning:(msg.reasoning_content??'').length,content:(msg.content??'').slice(0,4000)},null,1));
  if (res.status===200 && msg.content) break;
}
