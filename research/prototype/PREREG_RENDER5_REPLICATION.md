# render-5 重复批预注册（主结果后）

- 写入时间：R5-A..R5-D 已完成并已汇总；本文件在任何重复请求之前写入。
- 目的：把主臂每格 3 次扩到 9 次（主 + 重复），并给同帧 render-3 与 15K 控制加重复。**不替换主臂**；主臂条件原文、夹具、计分、上限都不改。
- 数据边界：同一合成夹具与同一 DeepSeek 模型；原始输出 git-ignored。

## 1. 主结果摘要（只用于确定重复对象，不改条件）

R5-A（t6l，render-5，3 次/条件）：C5 3/3 正确/有据/目标覆盖、cover 3/3；D5 2/3、cover 2/3；C 0/3、D 1/3（scan 片段命中，无目标覆盖）、C2 1/3（三次跟随 `next` 的一次成功）、D2 0/3；A 0/3、B 0/3。R5-B（同帧 render-3）A/C/D 全 0/3、0 目标覆盖。R5-C（t6 15K，render-5）A 1/3、B 2/3、C/D/C2/D2 3/3、C5/D5 3/3（C5/D5 各 3 次使用 cover，工具字符约 15.5K vs 13.3K）。R5-D（t6n）C/C5 各 3/3，cover 0 次。

## 2. 重复臂（固定）

| 臂 | 夹具 | render | 条件 × 次数 | 运行数 | 目的 |
|---|---|---|---:|---:|---|
| R5-R1 | t6l（37K） | 5 | C,C2,C5,D5 × 6 | 24 | 覆盖 vs 无规则 vs 分页规则 |
| R5-R2 | t6l（37K） | 3 | C × 6 | 6 | 同帧 render-3 无 cover 基线 |
| R5-R3 | t6（15K） | 5 | C,C5 × 6 | 12 | 15K 的 cover 成本重复 |

顺序固定 R5-R1 → R5-R2 → R5-R3；每臂内部条件顺序固定。命令：

```sh
ACT_VARIANT=t6l ACT_OUT=render5-r1 ACT_REPS=6 ACT_CONDITIONS=C,C2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
ACT_VARIANT=t6l ACT_OUT=render5-r2 ACT_REPS=6 ACT_CONDITIONS=C ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
ACT_VARIANT=t6  ACT_OUT=render5-r3 ACT_REPS=6 ACT_CONDITIONS=C,C5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
```

## 3. 预测（可证伪）

1. **C5**：R5-R1 的 `targetCoveredByRead` ≥ 5/6（点预测 6/6）；合并主臂 9/9 覆盖。若 ≤ 4/6，则“cover + 规则”在 37K 上不稳定。
2. **C**：R5-R1 0/6 覆盖；合并 0/9。若 ≥ 2/6，则“地址本身会触发覆盖”成立。
3. **C2**：R5-R1 ≤ 2/6 覆盖；合并 ≤ 3/9。主臂唯一成功是三次跟随 `next` 的一次，预测分页规则仍是低可靠路径。
4. **D5**：R5-R1 ≥ 4/6 覆盖；合并 ≥ 6/9。D5 与 C5 的差别只有 STRUCTURE 一行，若重复后 C5 明显高于 D5，记录为描述性差异，不写因果。
5. **render-3 C**：R5-R2 0/6 覆盖；合并 0/9。
6. **15K**：R5-R3 C 与 C5 各 ≥ 5/6 正确；C5 每次 cover 的 `toolChars` 约 15.4K，比 C 的 12–13.3K 多约 1–3K chars（约 0.5–1K tok）；正确率不因此提高（主臂与 §12.8 都已接近天花板）。
7. **成本**：每个 C5 正确条目的 `toolChars` ≥ 37,000；`promptTokens` 高于同条件 max-only 失败条目，但只调用 1 次 cover 的条目应低于三次 `next` 的 C2 成功条目（约 36.5K 工具字符 + 更高 prompt）。

## 4. 分析

- 与主臂按条件合并（主 3 + 重复 6 = 9/格），单独也报重复批；两者都列 Wilson 95%。
- 有效样本规则与主预注册相同：排除 invalid、formatError、unparsed；不把格式无效算答错。
- 只用描述性统计；不写显著性。顺序固定，记录为顺序偏差。
- 不新增条件、不改提示、不改夹具或上限；发现实现缺陷只能在该臂文件名加 `-fix` 并写明，不能回改已跑数据。
