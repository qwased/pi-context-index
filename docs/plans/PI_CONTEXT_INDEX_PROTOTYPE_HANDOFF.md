# pi-context-index 原型设计交接

- 日期：2026-10-30
- 主交付物：[PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md](./PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md)
- 性质：设计 + 一次性验证；没有实现新插件，没有修改 `src/`、`package.json` 或版本。
- 数据边界：全部为合成夹具；没有真实会话正文、真实会话路径或敏感字段。实验原始输出在 git-ignored 的 `research/prototype/out/`，不要在提交或文档中引用正文。

## 1. 当前状态

### 已完成

1. 设计文档主体：契约、不变量、数据模型、构建流程、预算、渲染、reader、隐私、确定性、宿主集成、测试、实施计划、风险、与独立评审的裁定对照。
2. 一次性原型：`research/prototype/`（Node ESM；不进入 npm 包）。
   - 470 条消息、467 条有效、30 live、71 条唯一操作、3 个错误、3 组计数向量、21K 早期结果。
   - 18/18 结构不变式通过：`node research/prototype/invariants.mjs`。
   - 10k 条消息/199K 单条结果：目录+视图 133–218ms，scan 200ms，read 0.17ms，heap ~113MB。
3. 主真实 API 实验完成（`deepseek-v4.1-flash-1017`，temperature 0，minimal reasoning）：
   - 仅尾部：最早测试 0/3，向量 1.0/3，路径 0，约束 0/8，未验证 1/3，状态 4/4；覆盖 earliest 0/3。
   - 0.1.5 @6,287：0/3，1.0/3，16/71，4.7/8，1/3，4/4；覆盖 earliest 0/3。
   - 0.1.5 @9,583：0/3，1.0/3，57/71，6.7/8，3/3，4/4；覆盖 earliest 0/3。
   - 新视图 @6,287：3/3，3.0/3，67/71，7.0/8，1/3，4/4；覆盖 earliest 3/3、indexOnly/view 3/3。
   - 新视图 @8,217：3/3，3.0/3，71/71，6.5/8（1 次无效 JSON，n=2），3/3，4/4；覆盖 3/3。
   - 只给引用/无计数行：最早 0/2、向量 1.0/2；值 + 引用是必要的。
   - 形态 B @9,583：facts 2/2，路径 71/71，约束 8/8，mayCommit 1/2；外部任务书提供约束，视图只保留路径。
   - reader：新协议 2/2（各 2 次调用）；旧式对照 1/2（各 3 次调用，一次弃答）。
4. 设计文档已写入 `docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md`；`docs/README.md` 已加索引行。
5. §12.7（已完成）：render-2 在 U 行/`view` 加隐藏跨度的字段、起始偏移和可执行 `read`；T5 式 follow-up、T6 无关键词线索、近距控制 t5n/t6n、native 协议对照。结构检查仍为 18/18（地址断言并入既有检查）。
6. §12.8（已完成）：render-3 给超过 1,200 chars 的隐藏跨度加 `span/pages/windows/max/cost`，`view` 给页表，`read` 支持 `page`/`line` 与成本行；预注册主臂 P0–P3、近距 S1、长跨度 S2/S2b、6 次重复（A/C）、render-4 全跨度探索；18/18 结构检查（页表/页行/成本断言并入既有检查）。关键读数：C/render-3 合并 9/9（render-2 2/9），A/render-3 1/9 且 7/9 零调用答错；37K 长跨度 24 条 0 目标覆盖、0 跟随 `next`；页表/`page`/`line` 全部臂 0 次使用；C2/D2 分页规则无可测增益；render-4 全跨度 2/9 直接读、3/9 覆盖。
7. §12.9（已完成）：render-5 的宿主侧合并覆盖（`cover`：一次调用取完连续窗口、打印整段成本，`coverMax=48000` 仅探索）；预注册主臂 R5-A..D（63 条）与重复 R5-R1..R3（42 条），C5/D5 新条件；18/18 结构检查（cover 断言并入既有检查），`probe-render5` 结构探针。关键读数：37K 上 C5 7/9 目标覆盖（7 条 cover 全对）、同视图 C 0/9、同帧 render-3 C 0/9、C2 3/9（prompt 20,463 vs C5 13,570）；15K 上 C 9/9、C5 9/9 但 cover 多余（+12% 工具字符）；近距字节不变、C/C5 3/3；C5 仍有 2/9 完全不调用 cover。全部 105 条 valid（invalid/format/unparsed 0）。
8. 真实 Pi 宿主（§7.4，已完成主要环节）：`host-pi.mjs` 用 in-process Pi SDK + 临时 `cwd`/`agentDir` + `defineTool`/TypeBox/registerTool；24/24 检查通过（注册与系统提示词、6 类 schema 拒绝、5 类编码错误、`beforeToolCall` 拦截、预 abort、部分 cover 的 `isError:true` + 正文 + next、工具层并发、扩展侧预算、hidden 撤回语义、details 无正文、1 次模型工具闭环（本次使用 read/scan，未调用 cover）、逐字 cover 端到端、错误回送）。端点仍是本机 DeepSeek 替身。

### 聚焦实验（已完成，已写进设计文档 §12.5）

- 首条消息 6 个唯一约束（2 次/条件）：u-full 3.5/6、u-line 4/6、u-char 4/6、u-none 0/6；index-6287 3.0/6（1 次有效；另 1 次 HTTP 200 空响应无效）、index-8217 3.5/6；legacy-6287 3.5/6、legacy-9583 3.0/6。
  - 结构可见性：u-full/index/legacy 6/6；u-line/u-char 4/6；u-none 0/6。行为分数没有显示“全量原文必然更好”，模型抽取本身有波动；见设计文档 §12.5。
- 无提示 `Pi 1.0.0` 弃答：5 个条件 × 3 次共 15/15 填 null，0 次答 1139；与方向文档曾出现的 1139 幻觉不一致，不能据此宣称已解决污染。
- 带 offset 的 reader：新协议 3/3 值/ref、2/3 exact offset（第二次 21169 是 “pass” 起点，扫描给的是 “422” 起点 21165）、3 次调用；旧式对照 2/3 值/ref、0/3 offset、3 次调用。
- 输出文件：`first-constraints.json`、`honesty.json`、`reader-new.json`、`reader-old.json`；汇总 `node research/prototype/focused-summary.mjs`。
- 设计文档 §12.5 已完成，不再有占位。

### 激活实验（已完成，已写进设计文档 §12.6）

- 夹具：首条用户消息加长到 17,055 字符，U0 只显示 `lines 1-11, 144-153`（`hidden 12-143`），目标要求藏在隐藏中段；视图 6,169 字符，`#6` 为 `IndexOnly`。
- 条件 A 无提示 / B 负向 / C 正向条件 / D 正向 + 结构；T1–T4 主实验 48 条，T5“看起来可答”追加 12 条；每条件 3 次。
- 结果：A 无提示已足以触发；T2/T3/T4/T5 首次工具；T2/T4/T5 全对，T3 3/3 弃答；B/C/D 没有可测正确率增益，C 的 T5 平均调用 2.67 vs A 1.0；T5/C 1 次失败因 `scan "allocator-golden.json"` 只命中可见行（隐藏例外写作 `allocator-golden rule`）；D 2 次使用 native `<｜DSML｜ invoke>`，格式无效；B/T2 2 次字段错误，1 次未恢复。
- 结论：提示词规则保留为安全网，不写成“模型会主动 recall”的保证；优先补隐藏区间的字段/偏移/`read` 地址（§12.7 已补；深于一个读页的目标仍未解决）。reader 字段错误提示已修；18/18 结构检查复跑通过。
- 输出：`activation.json`、`activation-t5.json`、`activation.log`、`activation-t5.log`、`activation-summary.json`、`activation-t5-summary.json`。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md` | 主交付物：完整设计 |
| `docs/references/PI_CONTEXT_INDEX_REVIEWER_GUIDE.md` | 离线、无 Pi 背景评审者的指南：术语、文件地图、证据地图、离线命令、常见误读 |
| `docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md` | Pi 宿主最小知识：compaction hook、工具契约、exposure、24 项检查、已验/未验 |
| `docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md` | 设计理念与愿景（英文，含中文摘要） |
| `docs/reviews/PI_CONTEXT_INDEX_EXTERNAL_REVIEW_PROMPT.md` | 可直接交给离线外部评审者的提示词（中文 + English） |
| `docs/README.md` | 已加设计文档索引 |
| `research/prototype/fixtures.mjs` | 合成夹具 A/B、context-edit 夹具、真值 |
| `research/prototype/catalog.mjs` | I/E/X、live、observations、字段视图 |
| `research/prototype/render.mjs` | H/U0/EC/O/U1/A、预算、渲染、变体；`hiddenAddress` 默认关闭 = render-1，开启 = §12.7 的 render-2；`pageTable:true` + `maxRead` = §12.8 的 render-3/4 |
| `research/prototype/reader.mjs` | view/read/range/scan/touched；新/旧 reader；`hiddenAddress` 时 view 行给 hidden 字段/偏移/可执行 read；`pageTable` 时页表、`page`/`line`、成本行 |
| `research/prototype/render-snapshot.mjs` | render-1/2 视图哈希快照；只存 SHA-256 与长度，不存正文 |
| `research/prototype/render3-summary.mjs` | §12.8 汇总：valid/unparsed/format、correct/grounded、targetCoveredByRead、usedMax/usedPage、成本与区间 |
| `research/prototype/activation-fixture.mjs` | 实验与探针共用的激活夹具构造（t5/t6/t6n/t6l，render 1/2/3/4/5） |
| `research/prototype/render5-summary.mjs` | §12.9 汇总：per-file 与跨批 combined，cover/覆盖/成本/区间 |
| `research/prototype/probe-render5.mjs` | render-5 结构探针：视图 id/长度、地址代价、cover 端到端与 `coverMax` 截断 |
| `research/prototype/host-pi.mjs` | 真实 in-process Pi 宿主：注册、schema 拒绝、错误传播、权限钩子、部分结果、并发、预算、hidden、模型闭环 |
| `research/prototype/PREREG_RENDER5.md` | render-5 主臂预注册（cover 机制、条件原文、臂、指标、预测） |
| `research/prototype/PREREG_RENDER5_REPLICATION.md` | render-5 重复批预注册（C/C2/C5/D5 × 6） |
| `research/prototype/PREREG_RENDER3.md` | render-3 预注册：机制、C2/D2 原文、臂、指标、预测、分析规则 |
| `research/prototype/PREREG_RENDER3_REPLICATION.md` | 主结果后的 6 次重复（A/C）预注册 |
| `research/prototype/PREREG_RENDER4.md` | render-4 全跨度探索预注册（48K，仅探索） |
| `research/prototype/invariants.mjs` | 18 项结构检查 |
| `research/prototype/build-artifacts.mjs` | 生成 0.1.5 与新视图产物 |
| `research/prototype/experiments.mjs` | 主 API 实验 |
| `research/prototype/table.mjs` | 主/变体聚合表 |
| `research/prototype/focused-experiments.mjs` | 聚焦实验（已完成） |
| `research/prototype/focused-summary.mjs` | 聚焦汇总 |
| `research/prototype/activation-experiments.mjs` | 激活实验：A/B/C/D/C2/D2 × T1–T6、render-1/2/3/4、JSON/native；记录首次动作、调用数、hiddenExposed、targetCoveredByRead、pagesCovered、usedAddress/usedMax/usedPage、zeroCallWrong、成本、格式无效；非 DeepSeek 模型直接报错 |
| `research/prototype/activation-summary.mjs` | 激活实验汇总；对 T4/T5 按存储答案重计分 |
| `research/prototype/followup-summary.mjs` | §12.7 汇总：T5/T6 重计分、firstAction、hiddenExposed、usedAddress、zeroCallWrong、native 格式无效 |
| `research/prototype/bench-large.mjs` | 10k 条性能 |
| `research/prototype/out/` | 合成产物、runs、日志；git-ignored |

## 3. 继续工作步骤

§12.5–§12.9 已完成；不要重跑主实验。可做验收：

1. 复核设计文档 §12.3–§12.9 的数字与 `research/prototype/out/*.json` 一致；§12.3、§12.6、§12.7、§12.8 的表不要改。
2. 检查文档无 `<!-- ... -->` 占位、无“未完成”时态、无真实会话正文/路径。
3. 可选复核：
   ```sh
   node research/prototype/invariants.mjs            # 18/18
   node research/prototype/followup-summary.mjs      # §12.7 汇总
   node research/prototype/render3-summary.mjs       # §12.8 汇总
   node research/prototype/probe-render5.mjs         # render-5 结构
   node research/prototype/render5-summary.mjs       # §12.9 汇总
   node research/prototype/host-pi.mjs               # 真实宿主 24/24
   node research/prototype/bench-large.mjs
   ```
4. 仍未被证明/未做：深跨度的触发（37K C5 7/9、2/9 完全不调用；A 0/3 覆盖）；15K 时 cover 的默认策略（C 9/9 已够，C5 +12% 工具字符）；`coverMax`/何时打印 cover 的产品值；页表/`page`/`line` 的行为收益（全部臂 0 次使用）；C2/D2 分页规则（3/9 覆盖、成本更高，不作默认）；D5 的 STRUCTURE 行（无可测增益）；真实宿主的运行中取消、调度并行、权限扩展端到端、`scope:"all"` 确认、TUI/HTML、fork/context edit、100 次压缩、Pi 1.0.0/1.4.0 对照、托管 DeepSeek provider；跨模型；真实会话；宿主 fork；100k/200MB；隐私零漏检。若继续实验，只用 DeepSeek，且只用合成夹具。
5. 不修改 `src/`、`package.json`、版本或发布状态；当前任务是原型设计，不是实现。
6. 未经用户明确要求，不提交、不推送、不发布。
7. 送审完成度见 §12；review brief、合成数据评审包与工作区版本锚定已完成（未 commit），可按 §12 的边界送外部设计评审；仍不能声称实现/发布/真实会话已验证。

## 4. 设计决策与未决项

- 已采纳独立评审的核心：独立插件、零 LLM、无 legacy、I/E/X 双层分母、四状态互斥、字段级跨度、覆盖行、needed 截止、值 + 引用、reader 字段/偏移、无强制逐行短指纹、首版无 sidecar、跨文件 fork 缺映射即拒绝。
- 主动偏离：模板禁用 `done/verified/success`，但逐字引用允许包含这些词（引用不是断言）；理由见设计 §1.6。
- 主动细化：U 拆成 U0 核心（每条用户消息先得完整行核心）与 U1 加深（O 之后）；避免一条长消息吞掉台账。
- 主动细化：覆盖行必须带 `saved #0-#M`；原型发现只写数量时模型把最早记录答成 #1。
- 未决/需评审确认：O 组内按源顺序而非 write 优先；EC 错误先于计数；custom 在 v1 只验证 excluded 路径；跨文件 fork 的宿主元数据；renderer 版本冻结方式。
- §12.7 的主动偏离/细化：地址行是结构成本，可能挤掉同一 U 行的一级加深；地址只给隐藏跨度起点，不承诺深目标在一页内；native 的窗口差异说明协议对照必须固定示例；正文 `<｜DSML｜ invoke …>` 按格式无效剔除，不算答错。
- §12.8 的主动偏离/细化：只对超过 1,200 chars 的跨度加 `span/pages/windows/max/cost`；默认 `readMaxChars=12000`，48K 仅探索；`view` 页表、`page`/`line` 保留但未被使用；C2/D2 分页规则作为新条件测试后**不加入默认提示词**；render-4 全跨度不作为默认；成本行是估算，不是账单；页表/规则的“结构存在但 0 次使用”如实报告。
- §12.9 的主动偏离/细化：cover 只对跨窗口跨度打印，`coverMax=48000` 是独立政策、不是读窗口；地址挤掉一条被引用行（隐藏跨度 +86 chars），作为可测预算代价报告；C5/D5 是新增条件，规则只绑定打印的 `cover`；C5 7/9 支持“cover + 正向规则”作为候选默认，但 2/9 不调用、15K 多余、D5 无增益，所以不写保证、不把 C5 规则默认化；`targetCoveredByRead` 改用实际返回区间，不与 §12.8 请求参数口径混读。
- 宿主层的新事实：`exposure:"hidden"` 不能被 `setActiveToolsByName` 按名激活；per-turn 工具预算必须由扩展计数；annotations 不是权限执行；details 已证明不含正文，TUI/HTML 未验证。
- 行为结论只来自单模型（DeepSeek）/单合成夹具族/每格 2–9 次/固定条件顺序，不构成总体概率或统计显著性。约束到达前的一次非 DeepSeek 探测已剔除，不贡献任何数字。
- 送审材料复核（本轮）：§12.9 对 §12.8 发现 5/9 是部分 supersede，不是整体作废；§12.8 表与批次数字保持不变。评审包把 docs、两份 render-5 预注册、原型源码、聚合结果、105 条精简运行与 24 项宿主检查固定到 manifest；zip SHA-256 在 `research/review-bundle/*.zip.sha256`。

## 5. 下一个对话窗口的提示词

```text
把 pi-context-index 原型推进到“可送外部专家评审”的完成度；本轮不新增行为实验，做复核、评审 brief、合成数据评审包与版本锚定。

先读：
- docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md（重点 §0、§7.4、§10.5、§12.9、§14、§16）
- docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md（§1、§3、§12）
- docs/reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md（背景）

当前状态（已完成，不要重跑）：
- §12.9：render-5 服务端合并 cover；R5-A..D 63 条 + R5-R1..R3 42 条，共 105 条全部 valid（invalid/format/unparsed 0）；37K C5 7/9、D5 5/9、C 0/9、C2 3/9、同帧 render-3 C 0/9；15K C 9/9、C5 9/9 但 cover 多余（+12% 工具字符）；t6n 字节不变。
- 真实 in-process Pi SDK 宿主 24/24；端点仍是本机 DeepSeek 替身；运行中取消、调度并行、权限扩展端到端、TUI、fork、100 次压缩、托管 provider 未验证。
- invariants 18/18；probe-render5 OK；render5-summary 28 rows / 21 combined；docs fences even。
- §12.3/§12.6/§12.7/§12.8 表冻结；render-1/2/3 字节不变。
- 无 src/、package.json、版本改动；未提交/推送/发布；docs/plans 与 research 仍是未跟踪/忽略状态。

本轮任务：
1. 复核 §12.9 的 supersede 说明（§12.8 发现 5/9）是否准确；不改 §12.8 冻结表。
2. 写 docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md（完整、无占位）：
   - 评审对象与性质（设计 + 一次性验证，不是实现/发布承诺）；
   - 5–6 个评审问题：深跨度 cover 机制是否成立；触发层 2/9 缺口；cover 成本/默认政策；15K cover 多余；宿主证据边界；预注册/计分口径；
   - 冻结输入：§12.3/§12.6/§12.7/§12.8 表、render-1/2/3 字节、105 条主/重复运行、24/24 宿主检查；
   - 范围外：实现、发布、真实会话、跨模型、100k/200MB、真实 fork/权限/TUI；
   - 证据边界：单模型、单合成夹具、每格 3 或 9 次、固定顺序、Wilson 描述性；
   - 期望产出：哪些问题必须回答、哪些只需确认缺口。
3. 生成合成数据评审包（放 research/review-bundle/，不提交）：
   - docs/plans 两份文档、docs/reviews 的 brief、PREREG_RENDER5*.md；
   - fixtures/catalog/render/reader/activation-fixture/activation-experiments/render5-summary/probe-render5/host-pi；
   - render5-summary.json 与关键原始行（含 turns 的 args/readRange/cost，不含长正文）；
   - manifest.json + SHA-256；zip；不含真实会话、不含 out/ 长正文。
4. 可选：1 页英文 executive summary 或 claim→evidence 索引。
5. 版本锚定：未经用户明确授权不 commit/push；若授权，只提交 docs/（不改 src/package/version）；否则给 bundle 路径 + SHA-256。
6. 收尾：invariants 18/18、probe-render5、render5-summary、host-pi、docs fences；git status 不含 src/package.json；给出“可送/不可送”结论与剩余缺口。

约束：
- 只用 DeepSeek；只用合成夹具；不碰真实会话；不新增条件/不改提示；若必须补实验，先写新预注册文件。
- 不改 §12.3/§12.6/§12.7/§12.8 表；不改 render-1/2/3 字节；不改 src/、package.json、版本或发布状态。
- 不把 out/ 正文复制进文档或提交；不写生产保证；不写显著性。

验收：
- review brief 完整、无占位；bundle 可解压、manifest 校验通过；§12.8/§12.9 无自相矛盾；所有检查绿；明确剩余缺口（触发层、cover 默认政策、宿主未验证项、单模型/合成边界）。
```

## 6. 聚焦实验最终读数（已写入设计文档 §12.5）

- 首条消息 6 个唯一约束（2 次/条件）：u-full 3.5/6、u-line 4/6、u-char 4/6、u-none 0/6；index-6287 3.0/6（1 次有效；另 1 次 HTTP 200 空响应无效）、index-8217 3.5/6；legacy-6287 3.5/6、legacy-9583 3.0/6。
- 结构可见性：u-full/index/legacy 6/6；u-line/u-char 4/6；u-none 0/6。行为分数没有证明“全量原文必然提高抽取”；模型抽取本身有波动。
- 无提示 `Pi 1.0.0`：5 个条件 × 3 次共 15/15 填 null，0 次答 1139。
- 带 offset reader：新协议 3/3 值/ref、2/3 exact offset、3 次调用；旧式对照 2/3 值/ref、0/3 offset、3 次调用。
- 这些数字只来自本合成夹具与单模型；不能外推为总体概率。

## 7. 激活实验最终读数（已写入设计文档 §12.6）

- 主实验（T1–T4，3 次/条件）：A 无提示 T1 3/3（1 次无谓召回）、T2 3/3、T3 3/3 null、T4 3/3；B T2 2/3（2 次字段错误，1 次未恢复），其余 3/3；C 全部 3/3；D T4 2/2 有效（1 次格式无效），其余 3/3。
- T5（3 次/条件）：A 3/3、B 3/3、C 2/3（1 次 scan 词不匹配）、D 2/2 有效（1 次格式无效）；平均调用 A 1.0、B 1.33、C 2.67、D 2.5。
- 解释：本模型在无提示下已主动调用；提示词没有可测正确率增益；T5/C 的失败是隐藏区间缺少可读地址，D 的失败是原生工具调用格式。样本小，不外推。
- 原始输出：`activation.json`、`activation-t5.json`、`activation.log`、`activation-t5.log`、`activation-summary.json`、`activation-t5-summary.json`；均 git-ignored。

## 8. §12.7 最终读数（已写入设计文档 §12.7）

- render-2：U 行/`view` 给 `field=… start-end of total; read: {…}`；`hiddenAddress` 默认关闭以保持 render-1 字节不变。地址约 +110 chars，可能挤掉同一 U 行的一级加深（t5n 视图 6,233 → 6,135）。
- T5 同夹具（3 次/条件）：render-1 A/B/C/D = 3/3、3/3、2/3、2/2；render-2 = 3/3、3/3、3/3、3/3，平均调用 1.33/1.33/1.67/2.00；12/12 带回隐藏句；11 条用 `scan`（多数扫更宽的 `"allocator-golden"`），只有 1 条真的从地址起点读（C，`offset=809 length=16000`），6 条在 scan 命中后读附近。§12.6 的 scan 不匹配没有复现，不能全归因于地址。
- T5 近距 t5n：11 条有效全对；D 1 次 `<｜DSML｜ invoke …>` 格式无效（剔除）；从地址起点读 B1、C2（3 次）。
- T6 同夹具（3 次/条件，15K 隐藏、目标 9.7K）：A 0/3（2 次 0 调用答错）、B 1/3（1 次 0 调用答错）、C 1/3、D 0/3；12 条里只有 B1、C1 带回隐藏句，且只有这 2 条答对；7 条调用了但没到目标（C 1 条从地址 889 读 1,200，仍停在一页）。
- T6 近距 t6n：A 2/3（1 次 0 调用答错）、B/C/D 3/3；11/11 带回隐藏句的样本全对，唯一没带回的答错。
- native（T6/t6n，2 次/条件）：0 格式无效；同夹具 A 2/2、B 2/2、C 1/2、D 1/2；近距 8/8；A/B 直接读 `length=12000` 覆盖 9.7K 目标，文本替身示例 800/1,200 把窗口锚小。协议差异不是能力差异。
- 解释：`exposure ⇒ correct` 在本合成夹具内成立；地址是必要条件，不是任意深度定位；下一次结构改进是隐藏跨度的分页/索引，而不是更强提醒。

## 9. §12.8 最终读数（已写入设计文档 §12.8）

- render-3：只对 >1,200 chars 的隐藏跨度加 `span/pages/windows/max/cost`；默认 `readMaxChars=12000`；`view` 页表；`read` 支持 `page`/`line` 与 `[cost …]` 行。t6 视图 6,137→6,177（+40），t6n 6,174→6,211（+37），t6l 6,177；render-1/2 哈希逐字不变。
- 主臂（3 次/条件，T6 15K、目标 9.7K）：P0 render-2 A/B/C/D = 0/3、0/3、0/3、0/3；P1 render-3 = 0/3、1/3、3/3、2/2 有效（1 次非 JSON）；P2 render-2+C2/D2 = 1/3（1 条无据）、1/3；P3 render-3+C2/D2 = 3/3、3/3。
- 重复（6 次/条件，A/C）：R0 render-2 A 0/6（5 次 0 调用答错）、C 2/6；R1 render-3 A 1/6（4 次 0 调用答错）、C 6/6。合并：A/render-2 0/9 [0,0.30]、A/render-3 1/9 [0.02,0.44]；C/render-2 2/9 [0.06,0.55]、C/render-3 9/9 [0.70,1.00]。C 区间不重叠；A 触发缺口未改善。C/render-3 的 9 条全部复制 `offset=889 length=12000`；C/render-2 的 2 次成功自己选了 12K/17K。
- 近距 t6n：A/B/C/D 12/12，全部使用 max 5,058、全部目标覆盖、全部 grounded；视图 6,211。
- 长跨度 t6l（37K，目标 20.7K）：S2 18 条无目标覆盖；S2b 是事后追加的 6 条确认批（未预注册），同样 0 覆盖。合计 24 条、23 有效：0 目标覆盖、0 隐藏句暴露、0 在第二窗口起点 12,889 读取；1 条布尔“正确”无据；C2/D2 的 12 条（S2 6 + S2b 6）同样 0 覆盖。C2/D2 分页规则无可测增益。
- 页表/`page`/`line`：全部臂 `usedPage=0`；模型只用 `offset`/`length`。页表在 `view` 里，时间线只付 max/cost。
- render-4（探索，`readMaxChars=48000`，t6l）：C/C2/D2 9 条中 2 条直接读全跨度（37,328 chars ≈ 11,888 tok）、3 条覆盖目标并正确/grounded（其中 1 条用两次 20K）；6 条仍选 2K–8K 或只 scan；A 3 条 0 正确、2 条 0 调用答错。全跨度读取约 6× 视图（工具字符 37–39K，prompt 14–25K tokens），不是默认策略。
- 成本：15K 跨度一次 12K 读 + 6,177 视图约 18K chars，超过被隐藏的 15K；37K 全跨度 + 视图约 43.5K，超过 39.3K。压缩只在隐藏文本不被立即/重复读取或视图跨请求复用时才划算。
- 计分：布尔正确与 grounded 分开；P2/C2 1 条正确无据、S2/D 1 条猜中；render-4/D2 的目标句跨两个 20K 结果，单结果 `hiddenExposed=false` 但 `targetCoveredByRead=true` 且 grounded。
- 解释：有效组合是“正向条件规则 + 可执行 max 地址”；地址/规则单独都不够；>12K 跨度仍未解决；页表/分页规则不作为默认修复；真实宿主仍未验证。

## 10. §12.9 最终读数（已写入设计文档 §12.9）

- render-5：只对 span > 12,000 的隐藏跨度打印 `cover`（一次合并连续窗口、整段成本，`coverMax=48000` 仅探索）；`max`、页表、`page`/`line`、schema `length` 上界不变。t6 视图 6,176 / vff37f466，t6l 6,177 / v3614f5ed，t6n 6,211 / v761c5494（与 render-3 逐字相同）；render-1/2/3 的 id 与长度不变。地址挤掉一条被引用行，隐藏跨度 +86 chars（15,188→15,274；37,328→37,414）。
- 主臂（3 次/条件，t6l 37K、目标 20,751）：C5 3/3、D5 2/3、C 0/3、C2 1/3（三次 next 的一次）、D 1/3（scan 片段命中，无目标覆盖）、D2 0/3；A/B 0/3；同帧 render-3 A/C/D 0/3。
- 重复（6 次/条件）：R1 C5 4/6、D5 3/6、C2 2/6、C 0/6；R2 render-3 C 0/6；R3 t6 C 6/6、C5 6/6。合并：C5 7/9 [0.45,0.94]、D5 5/9 [0.27,0.81]、C2 3/9 [0.12,0.65]、C 0/9 [0.00,0.30]、render-3 C 0/9 [0.00,0.30]。
- 覆盖：C5 的 7 条 cover 运行全部正确/有据/目标覆盖/`unread 0`；2 条失败未调用 cover（1 条 0 调用、1 条只 scan）。D5 的 4 条失败也未调用 cover。C/D/C2/D2 在 37K 上 0 次 cover。
- 15K：C 9/9（cover 2、max 7）、C5 9/9（cover 9）、D5 3/3；cover 多余，+12% 工具字符（15,538 vs 13,904）。C 在无规则下有 2/9 自发 cover；37K 上 C 0/9。t6n：C/C5 3/3、cover 0、字节不变。
- 成本：37K 一次 cover 37,615 chars、prompt 14,208；三次 next 36,498–36,501 chars、prompt 28,167–28,171；15K 一次 cover 15,474/9,342，两次 max 16,701/15,090。cover 工具结果 + 视图仍超过原文（37K 约 43.8K > 39,324；15K 约 21.7K > 17,184）。
- 计分：全部 105 条 valid（invalid/format/unparsed 0）；本批 correct 与 grounded 一致；D 的 scan 片段是 `hiddenExposed=true`、`targetCoveredByRead=false` 的边界例。预测 P1 主臂成立、重复 P1（C5 ≥5/6）与 P4（D5 ≥4/6）不成立；P3（A ≥2/3 零调用）不成立（1/3）；P4 的“C5 prompt 更高”不成立（15K 上更低）。证伪项保留，不回改条件。
- 解释：cover + 正向规则是当前唯一在 37K 上被实际使用并覆盖目标的机制，但不是触发保证；分页规则低可靠且 prompt 更贵；15K 不应打印/使用 cover；`coverMax` 与“何时打印 cover”仍需产品评审。

## 11. 真实 Pi 宿主读数（§7.4，写入设计文档 §12.9/§14）

- `node research/prototype/host-pi.mjs`：in-process Pi SDK，临时 `cwd`/`agentDir`，只启用 `context_index`；`defineTool` + TypeBox + `pi.registerTool`；模型走本机 OpenAI 兼容 DeepSeek 替身。24/24 检查通过。探针在开发中因 bug（工具未激活、预算耗尽、重名）运行过多次，最终文件只保留修复后的一轮；这些不是条件实验，不计分。
- 注册/声明：`getActiveToolNames() = ["context_index"]`；`promptSnippet` 与 `promptGuidelines` 进入系统提示词（11,392 chars）；annotations 随定义注册，宿主不自动执行权限。
- schema：6 类非法参数被 `runToolCall` 的真实校验路径拒绝，execute 未运行。错误：5 类编码错误 `throw` → `isError:true`；`beforeToolCall` 拦截；预 abort 返回 `Operation aborted`。
- 部分结果：`coverMax=20000` 的 t6l 返回 20,000 chars 正文 + `[cover incomplete … next]`，`isError:true` 且 `details.incomplete/next` 保留。并发：两个 `runToolCall` 都完成。预算：扩展侧第 4 次调用抛 `budget_exhausted`。exposure：`hidden` 工具不能通过 `setActiveToolsByName` 按名激活。
- 模型闭环：N1 1 次 T6 → 结构化调用 → 宿主执行并回送 5 个工具结果（本次使用 read/scan，未用 cover）→ details 无正文 → 模型作答；本次答案 `record_changelog: true`（理由不在包内），只证明管线成立，不作为 cover 触发/正确性/隐藏覆盖证据。N2 逐字 cover 端到端；N3 `field_missing` 以 `isError:true` 回送，模型答 `{"observed":"field_missing"}`。N1 不与 JSON 臂合并计分。
- 未验证：运行中取消、宿主调度并行、权限扩展端到端、`scope:"all"` 确认、TUI/HTML、fork/context edit、100 次压缩、Pi 1.0.0/1.4.0 对照、托管 DeepSeek provider、真实会话。

## 12. 送审状态与缺口（下一步）

- 结论：**内容与交付形态均达到“外部设计评审”完成度。** 可以请外部专家审设计、方法、预注册与证据边界，并用 zip + manifest 核对聚合数字与结构检查；不能从包内重跑 105 条行为实验，也不能把它当实现/发布/真实会话评审。
- 现有资产：§12.9、两份 render-5 预注册、105 条主/重复运行（全部 valid：invalid/format/unparsed 0）、24/24 宿主检查、18/18 结构检查、`probe-render5` 8/8、`render5-summary` 28 行/21 合并。§12.3/§12.6/§12.7/§12.8 表冻结，render-1/2/3 字节不变。
- 评审包：`research/review-bundle/pi-context-index-prototype-review.zip`；同目录 `.sha256` 为 zip 的 SHA-256；包内 `manifest.json` 给出除自身外每个文件的 SHA-256（zip 整体由 `.sha256` 覆盖），`verify-bundle.mjs` 可离线复验（manifest 哈希、105/105、28/21、24/24、18/18、8/8、围栏闭合）。包内另含 `REVIEWER_GUIDE.md`、`HOST_PRIMER.md`、`DESIGN_RATIONALE.md`、`EXTERNAL_REVIEW_PROMPT.md`、全部五份预注册、§12.3–§12.8 的聚合 summary、`package.json`/`bun.lock`/`LICENSE`；不含真实会话、`out/` 长正文、原始日志或模型完整回答。
- 已补齐的送审四项：
  1. **版本锚点**：HEAD `68145e7`（0.1.5）+ bundle manifest；docs 仍是未跟踪文件，未 commit/tag（需用户明确授权）。
  2. **可复现包**：zip + manifest + `verify-bundle.mjs`；可离线重算结构检查与聚合计数，不能重跑行为实验。
  3. **外部评审 brief**：`docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md`，含六个评审问题、冻结输入、范围外、证据边界、期望产出、claim→evidence 索引。
  4. **英文摘要**：brief §8（一页 executive summary）。
- 送审前最小清单：
  - [x] §12.9 的 supersede 说明复核：判定为**部分 supersede**；已收窄措辞（cover 机制已落地、触发/默认政策仍开放；注册/错误/工具层并发等闭环，运行中取消/调度并行/权限扩展端到端未闭环）。§12.8 冻结表未改。
  - [x] `docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md`：完整、无占位。
  - [x] 合成数据评审包：zip + manifest + SHA-256；含 docs、brief、离线指南、宿主入门、设计理念、评审提示词、全部五份 pre-reg、§12.3–§12.8 聚合 summary、原型脚本、`render5-summary.json`、105 条精简运行、24 项宿主检查与结构输出。
  - [x] 版本锚定决定：**不 commit**（未经用户明确授权）；使用 bundle + manifest + zip SHA-256 作为工作区锚点。
  - [x] 可选英文摘要：brief §8。
  - [x] 送审前复核：18/18、probe 8/8、summary 105/105、host 24/24、docs fences 闭合；`git status` 不含 `src/`/`package.json`。
- 本轮复核：N1 证据措辞已按当前 host-pi 产物修正（read/scan、未 cover、answer true；只作管线证据，cover 端到端由 N2）；24/24 与 105 条不变。
- 送审时必须写明的边界：单模型（DeepSeek）、单合成夹具、每格 3 或 9 次、固定顺序、Wilson 只描述本样本；C5 仍有 2/9 不调用 cover；15K cover 多余；`coverMax`/默认政策未定；宿主只验证 in-process SDK 主要环节；运行中取消、调度并行、权限扩展、TUI、fork、100 次压缩、托管 provider 未验证；评审对象是设计与一次性验证，不是实现/发布承诺。
- 送审材料不要包含：真实会话正文/路径、`out/` 长正文、把合成结果写成生产保证的表述、显著性/总体概率。
