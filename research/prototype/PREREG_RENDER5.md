# render-5 预注册：服务端合并覆盖读取（cover）

- 写入时间：本批任何模型请求之前。写入后不得改动条件原文、臂、夹具、计分或预测；发现错误只能追加“偏离记录”，不能回改。
- 数据边界：只用合成夹具（fixture A 的 t6 / t6n / t6l 变体）与 `deepseek-v4.1-flash-1017`（temperature=0，`reasoning_effort=minimal`）。原始输出只在 git-ignored 的 `research/prototype/out/`；文档只引用聚合计数。
- 冻结：§12.3、§12.6、§12.7、§12.8 的表与 render-1/2/3 的字节不改。本批是新条件与新 render，不替换任何旧结果。

## 1. 机制

§12.8 的缺口是：隐藏跨度超过一个 `max` 窗口（12,000 chars）时，24 条长跨度运行 0 条覆盖目标、0 条跟随 `next`；页表/`page`/`line` 0 次使用；render-4 把窗口放到全跨度后也只有 2/9 直接读、3/9 覆盖。下一次结构改进应是**宿主侧覆盖循环**：服务端按 `next` 取完连续窗口，合并成一个带总成本的结果。

render-5 在 render-3 上增加一个可执行动作 `cover`，不改 `max`、不改页表、不改页/行定位：

- 只对**超过一个读窗口**（span > 12,000）的隐藏跨度打印；短跨度（如 t6n 的 5,058）字节与 render-3 完全相同。
- 地址形如：`cover: {"read":1,"field":"content","offset":803,"cover":true} ~11916tok (all windows)`。成本是**整个被覆盖区间**的估算（`ceil(chars/3.14)`），不是单个窗口；`all windows` 表示一次读完，`first N of M windows` 表示受 `coverMax` 限制只覆盖前 N 个窗口。
- reader 的 `cover`：从给定 offset（缺省为最大隐藏跨度的起点）连续拼接到该隐藏跨度末尾或 `coverMax` 上限，**一个工具结果**返回精确子串；结果头写 `(cover: N windows merged, hidden span a-b)`，并给一行 `[cost N chars ~Ttok; hidden span a-b, unread U]`。`unread=0` 时结尾是 `[end of hidden span; field continues to T]`；未读完时是 `[cover incomplete: N of M chars; next: read … offset=… length=12000]`。
- `cover` 与 `length`/`page`/`line` 互斥（明确报错，不猜）；不是“把 read 窗口调大”：`maxRead` 仍是 12,000，schema 的 `length` 上界不变，cover 的合并上限由独立的 `coverMax=48000` 政策控制，并计入 recipe。48,000 是探索上限（与 render-4 相同），不是默认读窗口；超过 48,000 的跨度会显式未完成并给 `next`。
- 地址是结构文本，计入同一 6,287 chars 预算。它可能挤掉一条被引用行：见 §2 的结构代价。

## 2. 结构事实（运行前测得，`probe-render5.mjs`）

| 夹具 | render-3 视图 / chars | render-5 视图 / chars | 隐藏起点/终点 | span | 目标偏移 | 目标在 max 内 | 目标在 cover 内 | cover 打印成本 |
|---|---|---:|---:|---:|---:|---|---|---:|
| t6（15K） | vfdaf9adb / 6,177 | vff37f466 / 6,176 | 803-16077 | 15,274 | 9,720 | 是 | 是 | ~4,865 tok |
| t6n（近距） | v761c5494 / 6,211 | v761c5494 / 6,211 | 819-5877 | 5,058 | 1,032 | 是 | 未打印（span ≤ 窗口） | — |
| t6l（37K） | v0dabfee8 / 6,177 | v3614f5ed / 6,177 | 803-38217 | 37,414 | 20,751 | 否 | 是 | ~11,916 tok |

- render-1/render-2/render-3 的视图 id 与长度逐字不变（探针断言；render-3 的 t6/t6n/t6l 仍是 vfdaf9adb/v761c5494/v0dabfee8）。
- render-5 的地址代价是真实的：t6 与 t6l 各挤掉一条 U 行的被引用行（`1-10 → 1-9` 行），隐藏跨度因此增加 86 chars（t6 15,188→15,274；t6l 37,328→37,414），视图 chars 变化 −1 / 0。t6n 无变化（不打印 cover）。
- 结构探针断言：cover 返回的正文严格等于源字段切片；成本行 chars 等于返回长度；`all windows` 时 `unread 0`；`coverMax=20000` 时 t6l 返回 `cover incomplete: 20000 of 37414` 且 `next offset=20803` 可执行；cover+length、cover+page 明确报错；`view` 行里的同一个 cover 调用可执行。

## 3. 条件原文（固定，不得改）

A/B/C/D/C2/D2 与 §12.6–§12.8 完全相同（同一 `activation-experiments.mjs` 常量）。新增两个条件只加一条规则：

```text
A `U` line whose hidden span is longer than one read window prints two calls: `max` covers the first window only, and `cover` returns the whole span in one result with its total cost. If the question depends on the hidden middle and the span is longer than one window, use the printed `cover` call; do not stop after `max` or after one `next` page.
```

- C5 = `PROTOCOL + POSITIVE + COVER`
- D5 = `PROTOCOL + POSITIVE + STRUCTURE + COVER`

C5 与 C 的唯一差别是这条规则；D5 与 D 的唯一差别也是它。A/B/C/D/C2/D2 在同一视图上运行，因此“有 cover 地址但无规则”与“有规则”是同一视图内的条件比较，不是跨 render 比较。

## 4. 臂与运行顺序（固定）

问题只用 T6（`record_changelog` boolean + `why`；truth=false；`correct = record_changelog === false`；`grounded` = `why` 落到 independent rerun / never sufficient）。每臂内部条件顺序固定；臂顺序固定如下，不随机化，作为顺序偏差记录。

| 臂 | 夹具 | render | 条件 × 次数 | 运行数 | 目的 |
|---|---|---|---:|---:|---|
| R5-A | t6l（37K） | 5 | A,B,C,D,C2,D2,C5,D5 × 3 | 24 | 主臂：>12K 覆盖是否可达 |
| R5-B | t6l（37K） | 3 | A,C,D × 3 | 9 | 同帧 render-3 基线（与 §12.8 S2 非同批） |
| R5-C | t6（15K） | 5 | A,B,C,D,C2,D2,C5,D5 × 3 | 24 | 15K 控制：cover 是否多余/更贵 |
| R5-D | t6n（近距） | 5 | C,C5 × 3 | 6 | 无 cover 行时的回归控制 |

命令：

```sh
ACT_VARIANT=t6l ACT_OUT=render5-a ACT_REPS=3 ACT_CONDITIONS=A,B,C,D,C2,D2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
ACT_VARIANT=t6l ACT_OUT=render5-b ACT_REPS=3 ACT_CONDITIONS=A,C,D ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
ACT_VARIANT=t6  ACT_OUT=render5-c ACT_REPS=3 ACT_CONDITIONS=A,B,C,D,C2,D2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
ACT_VARIANT=t6n ACT_OUT=render5-d ACT_REPS=3 ACT_CONDITIONS=C,C5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
```

## 5. 指标（每行都记录）

`firstAction`（tool/answer）、`calls`、`readCalls`、`scanCalls`、`viewCalls`、`toolChars`、`promptTokens`、`valid`/`invalid`/`formatErrors`/`unparsed`、`correct`、`groundedCorrect`、`zeroCallWrong`、`hiddenExposed`（单条结果含完整隐藏句）、`targetCoveredByRead`（某次读取的实际返回区间覆盖目标偏移）、`pagesCovered`（1,200 网格并集）、`usedAddress`（从打印起点读）、`usedMax`（非 cover、从起点读满一个窗口）、`usedCover`（从打印起点 cover）、`coverCalls`、`coverChars`、`coverComplete`（unread 0）、`readLengths`。

- `targetCoveredByRead`/`pagesCovered` 本批改用**结果头里的实际返回区间**（`#N [role] field=… a-b of T`），不用请求参数；夹取与合并读取因此按真实区间计。§12.8 用的是请求参数，两者不可逐格对比，§12.9 会写明。
- 成本按实际返回字符：`toolChars` 是全部工具结果字符和；`promptTokens` 是各轮 `usage.prompt_tokens` 之和，包含重复发送的视图与工具结果。
- `correct ≠ grounded`、`targetCoveredByRead ≠ hiddenExposed`：目标句可能跨结果；必须分开报。

## 6. 运行前预测（可被证伪）

1. **R5-A 覆盖**：C5 与 D5 的 `targetCoveredByRead` 各 ≥ 2/3（点预测 3/3），且 `usedCover` 各 ≥ 2/3；一条 cover 调用返回约 37.4K chars ≈ 11,916 tok，`coverComplete=1`。
2. **同视图无规则**：R5-A 的 C、D、C2、D2 各 ≤ 1/3 覆盖；A ≤ 1/3；B 不预测。若 C 在无规则下也大量使用 cover，则“地址本身会触发覆盖”成立，预测 2 被证伪。
3. **触发层**：R5-A 的 A 仍 ≥ 2/3 `zeroCallWrong`（cover 地址不改变“看起来可答”的直接作答）。若 A 的覆盖 ≥ 2/3，则“打印 cover 就足够触发”成立。
4. **15K（R5-C）**：C5/D5 正确 3/3（天花板）；cover 可能被使用，若使用则每次工具字符约 15.3K（比 max 的 12K 多约 27%），`promptTokens` 更高；不预测正确率提升（render-3 的 C 已 9/9）。
5. **近距（R5-D）**：t6n 的 render-5 字节与 render-3 相同，C 与 C5 各 3/3，`coverCalls=0`。
6. **成本**：R5-A 的 cover 运行 `toolChars` ≥ 37,000；若正确，则比 §12.8 长跨度 24 条“0 覆盖但每条 10–20K 工具字符”更贵一次、更省总轮次。若 cover 运行超过 37K 仍答错，则覆盖不是充分条件。
7. **同帧 render-3（R5-B）**：A/C/D 的覆盖各 ≤ 1/3，作为“本批不是时间漂移”的对照；不做跨批合并。

## 7. 分析规则

- 有效样本 = 非 invalid（非空响应/HTTP 失败）、非 formatError（`<invoke …>`）、`parsed === true`。invalid、formatError、unparsed 单独计数并从正确率分母排除；不得把格式无效算答错。
- 主要读数按臂、条件给 n/valid/correct/grounded/targetCoveredByRead/pagesCovered/usedCover/coverCalls/calls/zeroCallWrong/toolChars/promptTokens，并给 Wilson 95% 区间。
- 只做描述性统计；单模型、单合成夹具、每格 3 次（后续重复另写预注册），不写显著性，不写生产保证。
- 报告必须同时给 `correct` 与 `groundedCorrect`、`targetCoveredByRead` 与 `hiddenExposed`；不得用布尔正确代替 grounded。
- 任何运行前未列出的条件、夹具、提示、上限或计分变化都不得加入；发现实现缺陷只能记录偏离并重跑该臂（文件名带 `-fix`，在文档写明）。
- 无停止规则：固定 63 次运行，不因中途结果提前停止或加臂。重复批在独立预注册文件里。

## 8. 已知限制

- `cover` 的成本上限 48,000 是探索值；超过它的跨度只部分覆盖。render-5 不改变 `readMaxChars` 或 schema 的 `length` 上界。
- 成本是估算（`c=3.14`），不是账单；promptTokens 是端点用量，不是压缩本身的费用。
- 仍然只有一个模型、一个夹具族；t6l 的目标位置、填充行和成本都是人为设计。
