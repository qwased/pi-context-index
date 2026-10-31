# pi-context-index 原型：外部专家评审 brief

- 日期：2026-10-31
- 评审对象：[PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md](../plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md)（设计 + 一次性验证）与 [PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md](../plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md)（交接）
- 评审性质：**设计与验证方法的独立评审**，不是实现评审、发布评审、复现审计或安全审计
- 版本锚定：本仓库冻结在 0.1.5（`68145e7`）；本轮没有修改 `src/`、`package.json`、版本或发布状态；`docs/plans` 与 `docs/reviews` 在 git 中仍是未跟踪文件
- 评审包：`research/review-bundle/pi-context-index-prototype-review.zip`；zip 的 SHA-256 在同目录的 `.sha256` 文件中，包内 `manifest.json` 给出除自身外每个文件的 SHA-256（zip 整体由 `.sha256` 覆盖）

## 0. 建议阅读路径

1. `README.md` 与 `REVIEWER_GUIDE.md`（离线、无 Pi 背景的阅读顺序、术语、文件地图、证据地图）。
2. `docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md`（设计理念与愿景）。
3. `docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md`（Pi 最小知识；无 Pi 背景必读）。
4. 设计文档 §0（结论摘要）、§1.1–§1.3（契约与非目标）。
5. 设计文档 §6–§7（视图与 reader 协议）、§10.5（提示词与激活）。
6. 设计文档 §12.3、§12.6、§12.7、§12.8、§12.9 的表格与“发现/边界”段。
7. 设计文档 §14（风险与未证明）、§16（复现边界）；本 brief §1.4、§3、§5。
8. 可选：本 brief §7（claim→evidence 索引）、§8（英文摘要）、`EXTERNAL_REVIEW_PROMPT.md`；包内全部预注册与对应 summary。

## 1. 评审对象、性质与版本锚定

### 1.1 这是什么

- 一个独立插件 `pi-context-index` 的**设计**：保存记录的可校验目录 + 有限展示视图 + 可寻址 reader；零模型调用；双层分母 `I/E/X`；消息级四状态互斥分区；字段级展示/隐藏/策略排除分区；`needed` 截止预算；render-1 到 render-5 的演进；`context_index` 的宿主工具契约。
- 一次**一次性验证**：470 条消息的合成夹具；18/18 结构不变式；真实 DeepSeek API 的行为实验（§12.3–§12.9）；render-5 的 105 条主/重复运行（全部 valid）；真实 in-process Pi SDK 宿主 24/24 项检查。
- 一个**可核对包**：设计、交接、本 brief、离线评审指南、宿主入门、设计理念、评审提示词、全部五份预注册、原型源码、§12.3–§12.9 的冻结表汇总、105 条运行的参数/返回区间/成本索引、24 项宿主检查索引、manifest、`package.json`/`LICENSE` 与离线校验脚本。

### 1.2 这不是什么

| 不是 | 说明 |
|---|---|
| 不是 `pi-context-index` 的实现 | 没有新包的 `src/`、`package.json`、版本线或安装包；原型在 git-ignored 的 `research/prototype/`。 |
| 不是发布承诺 | 没有生产保证、没有总体概率、没有统计显著性；单模型、单合成夹具、每格 3 或 9 次。 |
| 不是完整宿主验证 | 宿主是真实 in-process Pi SDK，但模型端点仍是本机 DeepSeek 替身；运行中取消、调度并行、权限扩展端到端等未闭环（见 §3 Q5）。 |
| 不是对 0.1.5 的改动评审 | 本仓库 `pi-vcc-codemode` 冻结在 0.1.5；本设计是新插件方向，不迁移旧摘要。 |
| 不是真实会话证据 | 所有夹具、问题、目标位置、扫描词和填充行都是合成的；没有真实会话正文、路径或文件名。 |

### 1.3 版本锚定与材料位置

- 当前 HEAD：`68145e7`（0.1.5，`docs(release): 0.1.5 brief navigation, fence safety and budget metadata`）。
- 本轮 `git status` 不包含 `src/` 或 `package.json`；未 commit、未 push、未 publish。
- `docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md` 与 `..._HANDOFF.md` 是工作区未跟踪文件；评审包是这些工作区文件的稳定副本，manifest 记录副本的 SHA-256。
- 评审包另含 `package.json`、`bun.lock` 与 `LICENSE`（版本/peer 范围/Pi 1.4.0 锁定/许可证）。主设计为中文；英文材料见 `DESIGN_RATIONALE.md`、brief §8、`HOST_PRIMER.md` 的代码/签名与 `EXTERNAL_REVIEW_PROMPT.md` 的 English prompt。
- 评审包不包含 `research/prototype/out/` 的长正文、原始工具结果、模型完整回答或真实会话；只包含聚合汇总、精简后的运行行（参数/返回区间/成本/计分布尔）和结构检查输出。

### 1.4 §12.9 supersede 说明复核（本轮任务 1）

结论：**说明基本准确，但原措辞把 §12.8 发现 5/9 的整体状态说得过宽；已做最小修订，§12.8 冻结表与批次数字未改。**

| §12.8 发现 | 当时断言 | §12.9 已发生的事实 | 复核判定 |
|---|---|---|---|
| 发现 5 | 超过一个读窗口的跨度仍未解决；24 条长跨度 0 覆盖、0 跟随 `next`；下一步应是宿主侧覆盖循环或改变压缩策略，且需要新预注册 | 宿主侧 `cover` 已实现并预注册测试；37K 上 C5 7/9 目标覆盖（7 条 cover 全对），C 0/9，同帧 render-3 C 0/9 | **部分 supersede**：机制已落地并有覆盖证据；触发（C5 2/9 不调用 cover）与默认政策仍未解决，不能整体作废 |
| 发现 9 | 真实 Pi 宿主的注册、权限、错误传播、并发与取消仍未验证 | 注册、schema 拒绝、`throw`/`isError`、部分结果、工具层并发、扩展侧预算、`hidden` 已闭环；运行中取消、宿主调度并行、权限扩展端到端仍未闭环 | **部分 supersede**：不能把“真实宿主”写成整体已验证；权限只验证了 `beforeToolCall` 钩子，取消只验证了预 abort |

设计与交接的修订方式：§12.9 的“与 §12.8 的关系”段现在明确写出“发现 5 的机制缺口已由 cover 补上、触发与政策仍开放；发现 9 的注册/错误/并发等已闭环、取消与权限扩展未闭环”。§12.8 的表、数字和批次结论逐字保留；两节引用时必须带批次与测量口径（见 §5.4）。

**宿主 N1 复核（同一轮）**：设计早期文本曾写 N1 执行 cover 并答 false；包内当前 host-pi 产物的 N1 使用 read/scan、未调用 cover、答案 record_changelog=true。已修正设计 §12.9、交接 §11 与 HOST_PRIMER；N1 仍只作管线证据，cover 端到端由 N2 逐字验证。24/24 与 105 条数字不受影响。

## 2. 冻结输入

### 2.1 冻结的文档表

以下表格在本轮**不得修改**，评审时按原文引用；它们记录的是各自批次的结果，不是可随时重算的当前值。

| 冻结输入 | 位置 | 批次/口径 | 评审时不要做什么 |
|---|---|---|---|
| 主 API 表 + 变体表 | 设计 §12.3 | 5 个主条件 × 3 次；变体 2 次；单模型、同夹具、同尾部 | 不要把变体表与主表混算，不要把 `pi_1_0_0` 的 null 命中当诚实性证据（原文已注明提示差异） |
| 激活实验 T1–T4、T5 表 | 设计 §12.6 | A/B/C/D × 3；render-1 | 不要把 render-2 的 T5 数字补进 render-1 表 |
| render-2 地址/T5/T6/native 表 | 设计 §12.7 | A/B/C/D × 3；native 2 次/条件 | 不要把“12/12 带回隐藏句”全归因于地址（11/12 用了 scan） |
| render-3/4 主臂、重复、近距、长跨度表 | 设计 §12.8 | P0–P3、R0/R1、S1、S2/S2b、F1/F2 | 不要把 S2b（事后确认）算进预注册主臂；不要把页表的结构存在写成行为增益 |
| render-5 主臂/重复、15K、近距、成本表 | 设计 §12.9 | R5-A..D（63 条）+ R5-R1..R3（42 条）；每格 3 或 9 次 | 不要用 §12.8 的请求参数口径逐格对比 §12.9 的实际返回区间口径 |

**预注册文件清单**：§12.8 有 `PREREG_RENDER3.md`、`PREREG_RENDER3_REPLICATION.md`、`PREREG_RENDER4.md`；§12.9 有 `PREREG_RENDER5.md`、`PREREG_RENDER5_REPLICATION.md`。§12.3、§12.6、§12.7 **没有独立预注册文件**；它们的条件、truth 与计分记录在设计 §12.x 和对应脚本（`experiments.mjs`、`activation-experiments.mjs`、`followup-summary.mjs`）。评审 Q6 时必须按这个清单判断预注册证据，不要假设五个文件覆盖全部章节。

### 2.2 冻结的字节与视图

- `render-1`、`render-2`、`render-3` 的视图字节在本轮不变；`probe-render5.mjs` 的 `render1And2BytesUnchanged` 与 `render3BytesUnchanged` 均为 true。
- `render-snapshot.mjs` 只保存 SHA-256 与长度，不保存正文；包内 `render-snapshot-final2.json` 可用于核对 render-1/render-2 的哈希。
- 关键视图 id/长度（合成夹具）：

| 夹具 | render-1 | render-2 | render-3 | render-5 |
|---|---|---|---|---|
| t5（§12.7） | `vd4800054` / 6,169 | `vc812ed8b` / 6,180 | — | — |
| t5n（§12.7） | `v021a042e` / 6,233 | `vf21511ac` / 6,135 | — | — |
| t6（§12.8/§12.9） | `vae2e0d09` / 6,201 | `v3b06626c` / 6,137 | `vfdaf9adb` / 6,177 | `vff37f466` / 6,176 |
| t6n（§12.8/§12.9） | `v70d68dca` / 6,201 | `v23075d99` / 6,174 | `v761c5494` / 6,211 | `v761c5494` / 6,211 |
| t6l（§12.8/§12.9） | — | — | `v0dabfee8` / 6,177 | `v3614f5ed` / 6,177 |

- render-5 的地址会增加预算成本：t6 与 t6l 各挤掉一条被引用行（`1-10 → 1-9`），隐藏跨度各增加 86 chars（15,188→15,274；37,328→37,414）；t6n（5,058 chars）不打印 cover，字节与 render-3 完全相同。

### 2.3 冻结的运行与检查计数

| 项 | 数值 | 说明 |
|---|---:|---|
| render-5 主臂 | 63 条 | R5-A 24 + R5-B 9 + R5-C 24 + R5-D 6 |
| render-5 重复 | 42 条 | R5-R1 24 + R5-R2 6 + R5-R3 12 |
| render-5 合计 | 105 条 | `invalid=0`、`formatErrors=0`、`unparsed=0`；105/105 valid |
| 汇总文件 | 28 行 / 21 合并行 | `render5-summary.json` 的 `summary` / `combined` |
| 宿主检查 | 24/24 | in-process Pi SDK；见 §2.3 分类 |
| 结构不变式 | 18/18 | `invariants.mjs`；页表/cover 断言并入既有条目，未新增条目 |
| render-5 结构探针 | 8/8 | 字节不变、位移记录、cover 精确切片/成本、目标覆盖、`coverMax` 截断 + next、互斥错误、view 行可执行 |

宿主 24 项的分类：schema 接受/拒绝 7 项（1 项接受 + 6 项拒绝）；编码错误 5 项；`beforeToolCall` 1 项；预 abort 1 项；部分 cover 1 项；工具层并发 1 项；扩展侧预算 1 项；allowlist + 系统提示词 2 项；`hidden` 撤回 1 项；details 无正文 1 项；模型闭环 3 项。合计 24；完整名称见包内 `host-checks.json`。

### 2.4 评审包内容

包内保留仓库相对路径，便于对照设计文档：

| 内容 | 文件 |
|---|---|
| 设计/交接 | `docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md`、`..._HANDOFF.md` |
| 离线评审入口 | `README.md`、`REVIEWER_GUIDE.md`、`docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md`、`docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md` |
| 本 brief + 提示词 | `docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md`、`docs/reviews/PI_CONTEXT_INDEX_EXTERNAL_REVIEW_PROMPT.md` |
| 背景评审/方向 | `docs/reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md`、`CODEMODE_0.1.5_EXPERIENCE_AND_0.2.0_DIRECTION.md`、`CODEMODE_0.2.0_REVIEW_BRIEF.md` |
| 预注册 | `research/prototype/PREREG_RENDER3.md`、`PREREG_RENDER3_REPLICATION.md`、`PREREG_RENDER4.md`、`PREREG_RENDER5.md`、`PREREG_RENDER5_REPLICATION.md` |
| 原型源码 | `fixtures.mjs`、`catalog.mjs`、`render.mjs`、`reader.mjs`、`activation-fixture.mjs`、`activation-experiments.mjs`、`experiments.mjs`、`probe-render5.mjs`、`host-pi.mjs`、`invariants.mjs`、`bench-large.mjs` |
| 计分/汇总源码 | `rescore.mjs`、`table.mjs`、`activation-summary.mjs`、`followup-summary.mjs`、`render3-summary.mjs`、`render5-summary.mjs`、`focused-summary.mjs`、`render-snapshot.mjs` |
| 冻结表汇总 | `out/experiment-summary-rescored.json`、`out/activation-summary.json`、`out/activation-t5-summary.json`、`out/followup-summary.json`、`out/render3-summary.json`、`out/render3-all-summary.json`、`out/render5-summary.json`、`out/render5-runs.json`（105 行精简运行） |
| 结构/宿主 | `out/host-checks.json`（24 项精简检查）、`out/render-snapshot-final2.json`、`out/probe-render5.json`、`out/invariants.json`、`out/doc-fences.json`、`out/tail-A.txt` |
| 校验与来源 | `manifest.json`（除自身外每个文件的 SHA-256；zip 整体由 `.sha256` 覆盖）、`verify-bundle.mjs`、`package.json`、`bun.lock`、`LICENSE` |

**包内不含**：真实会话正文/路径/文件名；`out/` 下的合成视图全文与长工具结果；模型完整回答与 rationale；原始 `render5-*.json`/`*.log`；任何 `node_modules` 或打包产物；旧 `pi-vcc-codemode` 源码（0.1.5 只作为对照基线，不是评审对象）。精简运行行只保留工具参数、返回区间、字符/成本、计分布尔与结构指标；答案只保留 `record_changelog` 布尔与计分标志。**冻结表汇总**只含聚合计数/均值/计分布尔，不含工具结果正文或模型 rationale；`host-checks.json` 只含检查名/结果、错误类别与 N1 事件参数，不含完整回答。

包内校验（解压后执行）：

```sh
sha256sum -c pi-context-index-prototype-review.zip.sha256   # 在 zip 所在目录
unzip pi-context-index-prototype-review.zip -d review
cd review && node verify-bundle.mjs
```

`verify-bundle.mjs` 会：逐个核对 manifest 的 SHA-256 与字节数；检查缺失/多余文件；重算 105 条、28/21 行、关键表格单元；确认精简运行行不含 `result`/`content`；确认宿主检查 24/24 且不含完整回答；离线运行 `invariants.mjs` 与 `probe-render5.mjs` 并核对 18/18 与 8/8。原始运行日志与端点配置不在包内，因此不能从包内重跑 105 条行为实验或重算 grounded 文本。

## 3. 评审问题（Q1–Q6）

**六问是细节，不是边界。** 本 brief 不要求评审接受作者的框架。评审可以从第一性原理质疑设计前提、提出不同的设计理念、替代架构，甚至建议重构或替换；如果认为前提错误，可以先给第一性原理结论，再把六问标为“不适用/次要”。完整的第一性原理问题、设计理念摘要与输出格式见 `EXTERNAL_REVIEW_PROMPT.md`。

### Q1. 深跨度 `cover` 机制是否成立

**机制。** render-5 只对 `span > 12,000` 的隐藏跨度打印 `cover`：reader 从跨度起点连续拼接窗口，把整段作为一个工具结果返回，结果头给出精确字段区间与合并窗口数，成本行给出整段字符数与 token 估算；`coverMax=48,000` 是独立的宿主政策，超过时返回部分正文 + `next` 并标 `isError:true`；`cover` 与 `length`/`page`/`line` 互斥并明确报错。37K 夹具（t6l：隐藏跨度 37,414 chars、32 页、4 个 12K 窗口、目标 20,751）：

| 条件（t6l） | 有效 | 正确 | grounded | 目标被读覆盖 | cover 运行 | usedMax | 0 调用答错 | 工具字符均值 | prompt tokens 均值 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C5 正向 + 覆盖 | 9 | 7 | 7 | 7 | 7 | 0 | 1 | 29,452 | 13,570 |
| D5 结构 + 覆盖 | 9 | 5 | 5 | 5 | 5 | 4 | 0 | 26,679 | 14,826 |
| C 正向条件 | 9 | 0 | 0 | 0 | 0 | 8 | 0 | 11,267 | 11,734 |
| C2 正向 + 分页 | 9 | 3 | 3 | 3 | 0 | 9 | 0 | 20,004 | 20,463 |
| D2 结构 + 分页 | 3 | 0 | 0 | 0 | 0 | 2 | 0 | 11,677 | 13,794 |
| A 无提示 | 3 | 0 | 0 | 0 | 0 | 1 | 1 | 4,246 | 5,557 |
| 同帧 render-3 C | 9 | 0 | 0 | 0 | 0 | 7 | 0 | 11,378 | 13,341 |

7 条 cover 运行全部正确、有据、目标覆盖、`unread 0`，各覆盖 32/32 页；C5 的 2 条失败都没有调用 cover（1 条 0 调用直接答 true，1 条只 `scan "changelog"`）。Wilson 95% 仅描述本样本：C5 7/9 [0.45, 0.94]，D5 5/9 [0.27, 0.81]，C 0/9 [0.00, 0.30]，C2 3/9 [0.12, 0.65]。

**请判断：**

1. “一次合并结果 + 整段成本 + 精确字段区间 + 显式截断”的 `cover` 是否满足设计契约（§1.2、§6.4、§7.4）？它是否把“有限视图”变成了“按需长正文”，从而需要在契约层重新表述？
2. `coverMax` 应属于宿主 policy、reader 参数、schema 常量还是 recipe？超过 `coverMax` 时的“部分正文 + next + `isError:true`”是否足够，还是应当直接拒绝并让模型走 `next`？
3. `cover` 是否应作为一等动作，还是只是 `next` 的服务端循环糖？如果保留，它和 `range`/`read` 的动作层级、cursor 语义、日志/详情暴露是否需要单独的契约？
4. 合并 37K 正文到单个工具结果，是否违反“视图有界、原文可寻址”的原始原则？若可接受，请给出必须写进产品文档的限制条件（例如仅按需、必须打印总成本、不得自动预热、不得在日志/详情复制正文）。

**可接受的产出：** 成立 / 成立但需契约修订 / 拒绝；并给出具体条款。

### Q2. 触发层 2/9 缺口

**事实。** 37K 上 C5 仍有 2/9 完全不调用 cover（1 条 0 调用直接答 true，1 条只 scan）；D5 4/9 不调用（3 条只读 `max`、1 条 scan + max + 头部读取）；A 0/3 覆盖、B 0/3 覆盖；15K 上 C 有 2/9 自发使用 cover，但 A 仍有 2 次 0 调用答错。C5/D5 的规则只绑定打印出来的结构信号，不做语义判断：

> 若问题依赖隐藏中段且跨度超过一个读窗口，使用打印的 `cover`；不要在 `max` 或一次 `next` 后停下。

D5 多一行 STRUCTURE，但与 C5 的 5/9 vs 7/9 区间重叠，没有可测增益；C2 的分页规则能到达目标（3/9），但 prompt 20,463 高于 C5 的 13,570。

**请判断：**

1. 一个“被使用时 7/7 正确、但 2/9 不触发”的机制，是否足以作为设计基线？设计明确拒绝语义“重要性”评分；触发是否只能靠提示词/宿主强制，还是应承认这是产品风险并写进“已知缺口”？
2. 是否应该改为宿主层强制覆盖（例如：生成视图时预取、或在模型作答前要求读取、或把 cover 自动附在视图后），而不是继续加提示词？如果是，强制覆盖的隐私、成本和“未经请求读取”的契约风险如何界定？
3. 若继续提示词路线，什么样的预注册实验能证伪“规则有效”？主指标应是 `zeroCallWrong`、`targetCoveredByRead`，还是端到端 token/正确率？D5 的结构行是否应该删除？
4. 触发缺口是否应作为**发布阻断项**，还是“设计已知限制”？请给出明确分级。

**可接受的产出：** 接受缺口并文档化 / 指定一种宿主机制 / 停止该路线；并说明是否需要新预注册。

### Q3. `cover` 的成本与默认政策

**成本事实。**

- 37K：一次 cover 的工具结果 37,615 chars（正文 37,414 ≈ 11,916 tok），加 6,177 chars 视图约 **43.8K chars**，已超过被隐藏的 39,324 chars 原文；15K：15,474 + 6,176 ≈ **21.7K chars**，超过 17,184 chars 原文。
- 路由成本（37K 到达目标）：一次 cover 的累计 prompt 约 **14,208**；cover + 再读已显示尾部约 25,777；连续两个 next 约 21,614；三个 next 约 28,167–28,171。15K：一次 cover 约 9,342，两次 `max` 约 15,090。
- 因此“单次工具字符更大”不等于“端到端更贵”；真正的节省来自少一次上下文重发。
- `coverMax=48,000` 是探索值；schema 的 `length` 上界仍是 12,000；48K 需要宿主 policy 同时改 schema 与视图地址，未验证。

**请判断：**

1. 设计能否在“必须读取深跨度原文”的场景下宣称压缩节省 token？是否应把“压缩收益只在隐藏文本不被立即/重复读取或视图跨请求复用时成立”写成产品契约的一部分？
2. `cover` 应不应该默认出现？请给出精确的打印/启用条件（`span > readMax`、`span > coverMax`、成本上限、仅模型显式请求、或永不自动）。
3. `coverMax` 的产品值应由谁拥有、如何进入 recipe 与 schema？是否应对单次 cover 设 token/字符预算，超过就返回 `budget_exhausted` 而不是让模型自己判断？
4. 15K 的 `max` 已经够用（C 9/9），但 C5 仍 9/9 使用 cover、工具字符 +12%；这是否说明“打印 cover”本身会诱导不必要的读取？应如何避免为短跨度打印 cover？

**可接受的产出：** 默认政策 + 具体数值/条件 + 所有权（host/reader/recipe）+ 是否需要新预注册。

### Q4. 15K 时 cover 多余

**事实。** t6 的隐藏跨度是 15,274 chars（>12,000，因此按当前规则打印 cover），目标是 9,720，落在第一个 12K 窗口内。render-5 的 t6：C 9/9（cover 2、max 7），C5 9/9（cover 9、max 0），D5 3/3（cover 3）；工具字符 C 13,904 vs C5 15,538（约 +12%），prompt C 10,083 vs C5 9,706。t6n（跨度 5,058）不打印 cover，render-5 与 render-3 字节相同，C/C5 各 3/3、cover 0 次。

**请判断：**

1. 当前“`span > readMax` 就打印 cover”的规则是否过宽？是否应改为“`span > coverMax` 或 `max` 已证明不足时才打印 cover”？
2. 12K–48K 之间是否存在可辩护的阈值？t6（15,274）是否足以支持“15K 不打印 cover”的产品决定，还是需要新的预注册阈值实验？
3. 若视图同时打印 `max` 和 `cover`，是否需要成本上限/条件（例如 cover 估算成本超过视图的一定倍数就不打印）？这个倍数应是产品常量还是 recipe 字段？
4. 成本指标应以工具字符、prompt tokens、端到端费用还是“首次正确所需轮次”为准？本批次 C5 的工具字符更高但 prompt 更低，设计应如何表述“更省”？

**可接受的产出：** 明确的打印门 + 成本指标 + 是否重跑（先写新预注册）。

### Q5. 宿主证据边界

**已验证（in-process Pi SDK，真实宿主运行时）。** 24/24：工具 allowlist（仅 `context_index`）、`promptSnippet`/`promptGuidelines` 进入系统提示词（11,392 chars）、6 类 schema 拒绝在 `execute` 前发生、5 类编码错误 `throw` → `isError:true`、`beforeToolCall` 在 execute 前拦截、预 abort、部分 cover（`coverMax=20,000` → 20,000 正文 + `next` + `isError:true`）、工具层并发、扩展侧第 4 次调用 `budget_exhausted`、`hidden` 不能被 `setActiveToolsByName` 按名激活、details 无正文、1 次模型工具闭环（N1；本次 N1 使用 read/scan，未调用 cover）、逐字 cover 端到端（N2）、错误回送（N3）。

**未验证。** 运行中取消（只测了预 abort）；同一 assistant 消息的宿主调度并行（只测工具层并发）；权限扩展端到端（只测 `beforeToolCall`）；`scope:"all"` 单独确认；TUI/HTML 渲染；fork/context edit；100 次压缩后的自喂；真实托管 DeepSeek provider（端点仍是本机替身）；Pi 1.0.0/1.4.0 双版本对照；真实会话。

**请判断：**

1. “真实 in-process SDK + 本机替身端点”是否足以接受工具契约（注册/校验/错误/部分结果/预算/hidden）？哪些检查是设计签字所需，哪些可以留给实现阶段？
2. 未验证项中哪些是**设计阻断**（例如 fork 的身份映射、运行时取消），哪些是**实现阻断**（例如 TUI/HTML、Pi 双版本）？请给出分级。
3. 宿主新事实是否必须进入产品契约而非实现说明：`hidden` 不能按名恢复、没有内建 per-turn 工具预算、annotations 不是权限执行、details 已证明无正文但 TUI/HTML 未验证？
4. 1 次模型闭环（N1）只算管线证据；是否需要在设计评审前补一次真实宿主的条件实验（新预注册），还是可以明确标注“管线成立、行为未比较”？

**可接受的产出：** 接受边界 / 指定必须在设计签字前完成的宿主实验 / 把设计评审与实现评审拆开；并给出分级清单。

### Q6. 预注册与计分口径

**已记录的事实与偏差。**

- render-5：105 条全部 valid（invalid/format/unparsed 0）；主臂 63 + 重复 42；条件与臂顺序固定、未随机化；重复只覆盖 C/C2/C5/D5 与 render-3 C。**独立预注册文件只覆盖 §12.8/§12.9；§12.3/§12.6/§12.7 是设计内记录**（见 §2.1 清单）。
- 预注册预测有成立也有证伪：主臂 P1（C5/D5 ≥2/3 覆盖）成立（3/3、2/3）；P2（C/D/C2/D2 ≤1/3）成立（0/9、0/3、1/3、0/3）；P3（A ≥2/3 零调用答错）**不成立**（1/3，另 2 条各读了一次 `max`）；重复 P1（C5 ≥5/6）**不成立**（4/6，合并 7/9）；P4（D5 ≥4/6）**不成立**（3/6，合并 5/9）；P4 的“C5 prompt 更高”也不成立（15K 上 C5 9,706 vs C 10,083）。
- 事后/未预注册：§12.8 的 S2b 是看到 S2 后追加的 6 条确认批；§12.3 的 T4 计分在冒烟后放宽了中文否定词表；§12.9 的 D5 STRUCTURE 行是新条件的一部分。
- 计分：`correct` 与 `grounded` 分开；`targetCoveredByRead` 与 `hiddenExposed` 分开；`grounded` 由确定性关键词/正则从存储答案重算。D 的 1 条“正确”来自 `scan "release"` 的片段命中：`hiddenExposed=true`、`targetCoveredByRead=false`、`grounded=true`，不能算深跨度恢复。
- 测量口径变化：§12.8 的 `targetCoveredByRead`/`pagesCovered` 用**请求参数**；§12.9 改用**读者实际返回区间**（结果头），夹取与合并按真实区间计。§12.9 已声明“不可逐格对比”。
- Wilson 95% 只描述本样本；没有 p 值，没有显著性，没有总体概率。

**请判断：**

1. 上述预注册偏差（固定顺序、无随机化、S2b 事后追加、T4 计分放宽、D5 结构行）是否被如实记录并可接受？是否需要在报告中把“预注册确认性”与“事后探索性”拆成两张表？
2. §12.8 的 0/24 与 §12.9 的 C5 7/9 能否在改变测量口径后并列叙述？如果不能，正确的跨节表述是什么？（核对：§12.8 长跨度批次的任何 `readRange` 都没有覆盖 20,751，因此 0/24 在实际区间口径下也成立；但两节仍不是同一时间序列。）
3. 确定性关键词/正则的 `grounded` 是否足以支撑设计结论，还是需要人工裁定/双人复核？`correct`、`grounded`、`targetCoveredByRead` 中哪个应作为主终点？
4. 报告是否应保留 Wilson 描述性区间，还是只给原始计数？未来实验的最低报告标准应是什么（随机化、盲评、固定提示、原始日志/代码发布、预注册偏差清单）？

**可接受的产出：** 接受现状 / 要求重述（不重跑）/ 要求新预注册；并给出最低报告标准。

## 4. 范围外

| 不在本轮评审范围 | 原因/去向 |
|---|---|
| `pi-context-index` 的实现、性能、安装包 | 本轮没有 `src/`、`package.json`、版本线；实现属于后续阶段 |
| npm 发布、版本号、CHANGELOG、安装互斥 | 本轮不发布；发布评审需要单独的检查表 |
| 真实会话、真实用户数据、真实文件路径 | 设计明确只用合成夹具；隐私与真实数据审计不在本轮 |
| 跨模型比较 | 全部行为数字只来自 `deepseek-v4.1-flash-1017`；跨模型未测 |
| 100k 条消息 / 200MB 会话 / 多巨型字段 | 原型只到 10k 条、单条 199K；生产性能门未验证 |
| 真实 fork、真实权限扩展、TUI/HTML、100 次压缩、托管 provider | 宿主只验证 in-process SDK 的主要环节；见 Q5 |
| 统计显著性、总体概率、生产 SLA | 单模型/单夹具/小样本；只报告描述性计数与 Wilson 描述区间 |
| 安全审计、秘密扫描零漏检 | 设计只承诺精确策略与显式标记，不承诺启发式零漏检 |

## 5. 证据边界

### 5.1 单模型、单夹具

- 模型：只用 `deepseek-v4.1-flash-1017`，`temperature=0`，`reasoning_effort=minimal`；本机 OpenAI 兼容替身端点。没有第二模型、没有托管 provider、没有跨模型对照。
- 夹具：470 条计数消息（另 1 条 custom、2 条 off-branch、1 条 system）、`E=467`、`live=30`、71 条唯一操作、3 个错误、3 组计数向量、21,195 chars 早期结果；T6/t6n/t6l 的目标位置、填充行、扫描词都是人为设计。
- 行为结论只对“本模型 + 本夹具 + 本提示 + 本顺序”成立；不能外推为所有模型/会话都会或都不会主动 recall/cover。

### 5.2 每格 3 或 9 次、固定顺序

- render-5 主臂每格 3 次，重复 6 次（合并 9 次）；条件顺序与臂顺序固定、未随机化；重复只覆盖部分条件。
- 同配置重复存在波动：§12.8 的 P0 0/12 与 §12.7 T6 2/12 是同夹具、同 render-2、相隔数十分钟的差异；§12.9 的 C5 主臂 3/3、重复 4/6 也是同配置波动。
- 因此“9/9”“7/9”是批次内的计数，不是稳定概率；Wilson 区间只描述本样本。

### 5.3 计分不是单一“正确率”

- `correct`：布尔答案是否符合合成真值；`grounded`：理由是否落到隐藏更正/独立重跑；`targetCoveredByRead`：读取区间是否覆盖目标偏移；`hiddenExposed`：单条工具结果是否含完整隐藏句。
- 四者不可互换：D 的 `scan "release"` 片段可以 `hiddenExposed=true`、`grounded=true`、`correct=true`，但 `targetCoveredByRead=false`；render-4/D2 的目标句跨两个结果，单条 `hiddenExposed=false` 但 `targetCoveredByRead=true` 且答案 grounded；P2/C2 有 1 条布尔正确但 `grounded=false`。
- `exposure ⇒ correct` 只在本夹具的“带回隐藏句”子集内成立，不是定理；真实会话可能带回原文仍解释错，也可能没带回却从别处答对。

### 5.4 跨节比较的限制

- §12.8 的覆盖指标用请求参数；§12.9 用实际返回区间。两节不能逐格并列；本 brief 只做“机制从 0/24 到 C5 7/9”的方向性叙述，并注明批次与口径。
- §12.8 的长跨度 0/24 在实际区间口径下也成立：来源仓库的原始行显示没有任何 `readRange` 覆盖 20,751（最大到 38,217 的那次从末页开始，仍在目标之后）。这不改变“两节不是同一时间序列”的限制。
- render-1/2/3/5 的字节冻结是“同输入同字节”的断言，不是“行为不变”的断言。

### 5.5 宿主与成本边界

- 宿主：真实 in-process Pi SDK 运行时；模型端点是本机替身；权限扩展/TUI/fork/取消未闭环。不要把“工具注册/校验/错误/部分结果在 SDK 上通过”写成“真实 CLI/托管 provider 已验证”。
- 成本：字符数是精确 UTF-16 长度；token 是按 `c=3.14` 的估算，不是账单；prompt tokens 来自端点用量，不是费用。压缩盈亏取决于隐藏文本是否被立即/重复读取，不能只用单次工具字符判断。

### 5.6 包内可复现与不可复现

- 可离线复现：18/18 结构不变式、8/8 render-5 结构探针、manifest 哈希、105/28/21 计数、关键表格单元、字节快照哈希，以及 §12.3/§12.6/§12.7/§12.8 的聚合汇总核对（`experiment-summary-rescored.json`、`activation-summary.json`、`activation-t5-summary.json`、`followup-summary.json`、`render3-summary.json` / `render3-all-summary.json`）。
- 不可从包内复现：105 条行为运行（原始日志/端点不在包内）、模型 rationale 与工具结果全文、grounded 的人工语义判断、真实宿主行为。需要复现时回到本仓库的 `research/prototype/out/`（git-ignored）与本机端点。

## 6. 期望产出

### 6.1 必须回答（设计签字的阻断项）

| 问题 | 必须给出的结论 |
|---|---|
| 第一性原理结论 | 问题是否成立、作用层是否正确；设计理念中哪些是承重部分；承重假设与反例；至少 2 个替代方向；建议 keep / modify / refactor / replace；哪些证据不足 |
| Q1 深跨度 cover 机制 | 成立 / 需契约修订 / 拒绝；若成立，列出必须写入产品契约的限制（按需、总成本、截断、日志/详情） |
| Q3 cover 成本与默认政策 | 默认打印/启用条件、`coverMax` 所有权与数值、单次预算上限；是否写“压缩在深读场景不省 token” |
| Q4 15K cover 多余 | 打印门（`span > readMax` vs 其他阈值）与成本指标；是否需要新预注册阈值实验 |
| Q6 预注册与计分口径 | 接受现状 / 要求重述（不重跑）/ 要求新预注册；最低报告标准（确认性与探索性分表） |
| 总体 | 设计可送实现 / 设计可送但必须先改条款 / 建议重构后再评 / 设计不可送；并列出阻断项 |

### 6.2 只需确认缺口（非阻断）

| 问题 | 期望确认 |
|---|---|
| Q2 触发层 2/9 | 确认这是“已知缺口 + 现有规则只作安全网”，还是要求指定宿主强制机制；也欢迎提出替代触发/预取/宿主机制；若要求新实验，先写预注册 |
| Q5 宿主证据边界 | 确认 24/24 的证据范围与未验证清单；确认哪些是设计阻断、哪些是实现阻断；可提出不同的宿主契约或降级方案 |

### 6.3 评审回答格式

先给 **0. 第一性原理结论**：问题是否成立/作用层是否正确；设计理念的承重部分；承重假设与反例；至少 2 个替代方案；建议 keep / modify / refactor / replace（哪些保留、哪些重做）。若认为前提错误，可把六问标为“不适用/次要”。

再对每个 Q1–Q6 给出：

1. 结论：接受 / 有条件接受 / 拒绝 / 不适用。
2. 依据：引用设计章节、表行或包内文件；不要用未在材料中的数字。
3. 需要的修改：具体条款/表格/默认值；若要求新实验，写出预注册问题与主指标。
4. 阻断级别：设计阻断 / 实现阻断 / 非阻断。

总体给出：**可送实现 / 有条件可送 / 建议重构后再评 / 不可送**，以及必须修改的条款清单。评审者不需要重跑行为实验；可选离线校验命令见 §2.4。

## 7. Claim→evidence 索引

“强度”一列区分结构证据、行为证据与宿主证据；“范围”说明该结论只在哪里成立。**核对路径**：§12.3 → `experiment-summary-rescored.json`；§12.6 → `activation-summary.json` / `activation-t5-summary.json`；§12.7 → `followup-summary.json`；§12.8 → `render3-summary.json` / `render3-all-summary.json`；§12.9 → `render5-summary.json` / `render5-runs.json`；宿主 → `host-checks.json`。

| ID | 主张 | 证据 | 位置/选择器 | 强度 | 范围 |
|---|---|---|---|---|---|
| C1 | 目录/视图/reader 的 18 项结构不变式成立 | `invariants.mjs` 18/18；包内 `invariants.json` | 设计 §2、§11.1；`node research/prototype/invariants.mjs` | 结构 | 合成夹具 |
| C2 | `needed` 截止生效：7,850/8,217/9,583/12,560 四档视图逐字相同，6,287 截断 | 设计 §12.2/§12.4 表 | 设计 §12.2 | 结构 | 合成夹具 |
| C3 | “值 + 引用”不是装饰：只给引用/无计数行时最早测试 0/2、向量 1.0/2 | 设计 §12.3 变体表 | 设计 §12.3 | 行为 | 单模型、2 次/条件 |
| C4 | U 行隐藏地址可执行；T5 式 follow-up 12/12 带回隐藏句；但只有 1 条真的从地址起点读 | 设计 §12.7 T5 表 | `variant=t5`, render-2；设计 §12.7 | 行为+结构 | 单模型、3 次/条件 |
| C5 | 目标在地址后第一页内时可解：t5n 11/11、t6n 11/11、render-3 S1 12/12 | 设计 §12.7/§12.8 | S1；t6n | 行为 | 单模型、3 次/条件 |
| C6 | “正向条件规则 + 打印 max”在 15K 上有效：C/render-3 合并 9/9 vs C/render-2 2/9 | 设计 §12.8 合并表 | `variant=t6`, render-2/3, C；P0+R0 / P1+R1 | 行为 | 单模型、9 次/条件 |
| C7 | >12K 跨度在 render-3/4 上未解决：24 条长跨度 0 覆盖、0 跟随 next、页表 0 使用 | 设计 §12.8 | `variant=t6l`, render-3, S2+S2b；render-4 F1/F2 | 行为 | 单模型、24 条 |
| C8 | render-5 cover 被使用时有效：C5 7/9，7 条 cover 全对/有据/覆盖/unread 0；同帧 render-3 C 0/9 | 设计 §12.9 | `variant=t6l, render=5, condition=C5-positive-plus-cover`；`render=3, condition=C` | 行为 | 单模型、9 次/条件 |
| C9 | 触发层仍是缺口：C5 2/9 不调用 cover（1 零调用、1 只 scan）；A 0/3 覆盖 | 设计 §12.9；包内 `render5-runs.json` | `condition=C5` 的 `coverRuns=0` 行；`condition=A` | 行为 | 单模型、3/9 次 |
| C10 | 15K 时 cover 多余：C 9/9（cover 2）、C5 9/9（cover 9）、工具字符 +12% | 设计 §12.9 15K 表 | `variant=t6, render=5, condition=C/C5` | 行为 | 单模型、9 次/条件 |
| C11 | 成本按路由算：37K 一次 cover prompt 14,208 vs 三次 next 28,167；cover+视图仍超过原文 | 设计 §12.9 成本表/成本账 | 设计 §12.9 | 算术+行为 | 合成夹具、估算 |
| C12 | 真实 in-process Pi SDK 24/24；端点仍是替身；取消/调度并行/权限扩展等未闭环 | `host-pi.mjs` + 包内 `host-checks.json` | 设计 §7.4、§12.9、§14 | 宿主 | in-process SDK、替身端点 |
| C13 | render-1/2/3 字节冻结；render-5 只对跨窗口跨度打印 cover；t6n 字节不变 | `probe-render5.mjs` 8/8；`render-snapshot-final2.json` | `node research/prototype/probe-render5.mjs` | 结构 | 合成夹具 |
| C14 | render-5 105 条全部 valid（invalid/format/unparsed 0） | `render5-summary.json` 的 28 行 | 包内 `verify-bundle.mjs` | 结构计数 | 本批 105 条 |
| C15 | §12.8 发现 5/9 被 §12.9 部分 supersede，不是整体作废 | 设计 §12.9“与 §12.8 的关系”；本 brief §1.4 | 设计 §12.9 | 文档一致性 | 批次记录 |

## 8. 一页英文 executive summary

**What is being reviewed.** A design for a separate Pi plugin, `pi-context-index`, that replaces semantic compaction with a verifiable index of saved records plus a deliberately limited view and an addressable reader. The design is zero-model-call, uses a dual denominator `I/E/X`, mutually exclusive message states (`Live`/`Quoted`/`IndexOnly`/`Unavailable`), field-level shown/hidden/policy partitions, a `needed`-capped budget, and renderer versions 1–5. It is a design plus one-shot validation, not an implementation or release commitment.

**What was validated.** 18/18 structural invariants on a synthetic 470-message fixture. Behavioral runs used only `deepseek-v4.1-flash-1017` at temperature 0 with minimal reasoning against a local OpenAI-compatible stand-in. Render-5 added a server-side merged `cover` read for hidden spans longer than one 12K window. On the 37K fixture, C5 reached target coverage 7/9 (all seven cover runs correct, grounded, covered, `unread 0`), while C and same-frame render-3 C were 0/9; D5 was 5/9, C2 3/9. All 105 main/replication runs were valid (0 invalid, 0 format errors, 0 unparsed). A real in-process Pi SDK host passed 24/24 checks: registration, TypeBox schema rejection (6 cases), coded throws/`isError` (5), `beforeToolCall`, pre-abort, partial cover with `next`, tool-layer concurrency, extension-side budget, `hidden` non-reactivation, details-without-text, and three model-loop checks.

**What was not validated.** The model endpoint is a local stand-in. Running cancellation, host scheduler parallelism, permission-extension end-to-end, `scope:"all"` confirmation, TUI/HTML, fork/context edit, 100 compactions, hosted DeepSeek, and Pi 1.0.0/1.4.0 comparison remain unverified. No real sessions, no cross-model evidence, no 100k/200MB performance, no statistical significance. Every behavioral cell is 3 or 9 runs, fixed order, single synthetic fixture family; Wilson intervals are descriptive only.

**Open design questions.** (1) Is a merged `cover` result consistent with the bounded-view contract, and what limits must be written into the product contract? (2) Two of nine C5 runs never called cover; A never covered. Is this an accepted known gap or a reason to enforce coverage at the host layer? (3) `cover` plus the view exceeds the hidden original in characters (37K: ~43.8K > 39.3K; 15K: ~21.7K > 17.2K); when, if ever, should cover be the default, and what should `coverMax` be? (4) At 15K, `max` already suffices (C 9/9), yet C5 used cover 9/9 and added 12% tool characters; what is the right print gate? (5) Is the in-process SDK + stand-in endpoint evidence sufficient for the tool contract, and which host gaps block design vs implementation? (6) Are the preregistration deviations (fixed order, post-hoc S2b, widened T4 scoring, changed coverage basis between §12.8 and §12.9) acceptable, and what reporting standard should be mandatory?

**Frozen inputs.** The §12.3/§12.6/§12.7/§12.8 tables, render-1/2/3 bytes, the 105 render-5 runs, and the 24/24 host checks. The review bundle contains the design, handoff, this brief, a reviewer guide, a Pi host primer, a design rationale, a review prompt, all five preregistrations, the prototype sources, all frozen-table summaries, `render5-summary.json`, reduced per-run rows (arguments, returned ranges, costs, scoring booleans; no long tool text), host check rows, the prior review/direction documents, `package.json`, `LICENSE`, a SHA-256 manifest, and an offline verifier.

**Expected output.** Answer Q1/Q3/Q4/Q6 with a verdict and any required contract changes; confirm or reclassify the Q2 trigger gap and the Q5 host boundary; state overall: ready for implementation / conditionally ready / not ready.

## 9. 自评：送审结论与剩余缺口

- **可送**：设计、方法、预注册、聚合结果与证据边界已达到“外部设计评审”的完成度；bundle 可解压、manifest 可校验、18/18 与 8/8 可离线复核。
- **离线/无 Pi 背景**：`README.md` + `REVIEWER_GUIDE.md` + `DESIGN_RATIONALE.md` + `HOST_PRIMER.md` + `EXTERNAL_REVIEW_PROMPT.md` 覆盖阅读顺序、术语、宿主契约、证据地图与提示词；不需要 Pi 文档、npm install 或网络。
- **不可声称**：不是实现评审、不是发布评审、不是真实会话/跨模型/生产证据；不能从 bundle 重跑 105 条行为实验。
- **剩余缺口（按阻断级别）**：
  1. **设计阻断（待评审裁定）**：cover 默认政策与 `coverMax`；15K 打印门；触发层 2/9 的产品定位；Q6 报告口径。
  2. **实现阻断（后续阶段）**：真实 CLI/托管 provider、运行中取消、宿主调度并行、权限扩展端到端、`scope:"all"` 确认、TUI/HTML、fork/context edit、100 次压缩、Pi 1.0/1.4 对照。
  3. **证据缺口（非本轮）**：跨模型、真实会话、100k/200MB、隐私零漏检、性能门。
- **本轮已完成**：§12.9 supersede 复核（部分 supersede，已收窄措辞）；本 brief；合成数据评审包；claim→evidence 索引；版本锚定（HEAD + manifest；未 commit）。
- **未做**：没有新增行为实验、没有新增条件、没有改提示、没有改 §12.3/§12.6/§12.7/§12.8 表、没有改 render-1/2/3 字节、没有改 `src/`/`package.json`/版本、没有提交/推送/发布。
