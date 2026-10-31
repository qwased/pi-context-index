# 评审者指南（离线、无需 Pi 背景）

> **Quick orientation (English).** This bundle is a design plus one-shot validation of a Pi plugin that replaces semantic compaction with a verifiable index of saved records, a deliberately limited view, and an addressable reader. No Pi knowledge is assumed: read **HOST_PRIMER.md** for the minimum host contract. The main design is Chinese; **DESIGN_RATIONALE.md** and the brief §8 give the English orientation. Start with **README.md**, then this guide, then the rationale and host primer.

- 包：**pi-context-index-prototype-review**（review-2）
- 来源：本仓库 HEAD **68145e7**（0.1.5）；评审对象是设计与一次性验证，不是实现/发布
- 适用环境：离线；Node 18+ 可选运行结构检查；不需要 npm install，不需要网络

## 0. 五分钟上手

1. 在 zip 所在目录校验并解压：

   ~~~sh
   sha256sum -c pi-context-index-prototype-review.zip.sha256
   unzip pi-context-index-prototype-review.zip -d review
   cd review
   ~~~

2. 运行离线校验（可选；不需要网络）：

   ~~~sh
   node verify-bundle.mjs
   ~~~

   期望输出：manifest 哈希全部通过；105/105 valid；28/21 汇总行；24/24 宿主检查；18/18 结构不变式；8/8 render-5 探针；围栏闭合。

3. 按顺序读：

   - **README.md**（包内容与排除项）
   - 本指南（术语、文件地图、证据地图、常见误读）
   - **DESIGN_RATIONALE.md**（设计理念与愿景）
   - **HOST_PRIMER.md**（Pi 的最小知识；无 Pi 背景必读）
   - 设计文档 §0、§1、§6、§7、§12.3–§12.9、§14–§16
   - 交接文档 §12（送审状态与缺口）
   - 评审 brief §2–§6（冻结输入、六个问题、证据边界、期望产出）
   - 需要核对数字时，按 §6 的证据地图读对应 summary JSON

4. 按 **EXTERNAL_REVIEW_PROMPT.md**（或用户提供的提示词）回答 Q1–Q6，给出总体结论。

## 1. 一句话设计

**它不是摘要，而是“保存记录的可校验目录 + 有限展示视图 + 可寻址 reader”。** 这份材料邀请你质疑这句话本身，而不只是检查它实现得好不好；替代架构、重构或替换建议都是有效评审产出。

- 目录回答“记录过什么、原文在哪、哪些没展示”。
- 视图只展示有限的高价值结构片段；未展示不等于不存在。
- reader 按 #N、字段、UTF-16 偏移/页/行读取保存原文；所有动作共用同一快照与隐私策略。
- 压缩器不生成目标、待办、当前状态、撤销关系或“已验证”推断；这些不属于它的职责。
- 原型零模型调用：压缩时只做确定性目录/选择/渲染；reader 是模型按需调用的工具。

## 2. 为什么需要它（问题陈述）

传统“语义摘要”压缩有三个结构性问题：

1. **不可核对**：摘要说“完成了 X”，但读者无法从摘要本身确认原文哪一条、哪个字段、什么偏移；也无法区分“没发生”“没展示”“读不了”。
2. **会生成状态**：目标、待办、当前状态、撤销关系是推断，不是记录；在中文/自由表达/长会话下不稳定，而且会过期。
3. **覆盖不可见**：摘要通常只给“选择了什么”，不给“保存了多少、隐藏了多少、为什么隐藏”；读者容易把摘录当成完整要求。

本设计把承诺降为可验证的三件事：

- **目录完整**：源快照内所有已分配 #N 的消息都登记；有效历史 E 与外部 X 逐项有原因；E 的四个状态互斥且 unaccounted=0。
- **原文可寻址**：Quoted 的每个字段有 shown/hidden/policy 精确分区；IndexOnly/Unavailable 有明确地址或原因；read/range/scan/touched 共用快照。
- **覆盖可查**：覆盖行给出 saved 区间、E 计数、状态计数、X 原因、custom 计数与 view 入口；不静默丢指针。

它明确**不承诺**“所有历史/所有字段都直接可见”，也不承诺“模型一定会去读”。结构可达与任务正确率分开报告。

## 3. Pi 的最小知识（详见 HOST_PRIMER.md）

- Pi 是一个编码 agent；一个会话是持久的 entry 树（消息、custom、compaction 等），当前分支有一个 leaf。
- 压缩时 Pi 触发 **session_before_compact**；扩展可以取消，或返回一个 **compaction**（summary + details + tokensBefore + firstKeptEntryId）。Pi 追加 compaction entry，并用“summary + firstKeptEntryId 之后的条目”重建上下文。
- 工具通过 **defineTool** 定义（名称、描述、TypeBox 参数、execute），用 **pi.registerTool** 注册。execute 返回 **content**（给模型）与 **details**（给 UI/状态重建）；throw 产生失败结果；**isError:true** 表示“有数据的部分失败”。
- 工具有 **exposure**：direct / model-only / codemode / deferred / hidden。**hidden** 是撤回：注册但不可达，不能按名重新激活；要撤回就重新注册为 hidden。
- 工具调用来自结构化 tool_call；正文里拼 JSON 或 invoke 标签只是实验替身，不是产品协议。
- 宿主的 schema 校验在 execute 之前；权限是独立扩展/钩子的职责；annotations 只是提示，不是授权。
- 本设计只使用这些点：compaction hook 返回视图文本；context_index 工具读取保存记录；details 存结构，不存正文。

如果你不熟悉 Pi，**不要**根据“常见 agent 框架”猜行为；以 HOST_PRIMER 和 host-pi.mjs 为准，材料没写的标为“未验证”。

## 4. 术语表

| 术语 | 含义 |
|---|---|
| **I** | 身份目录：源快照内所有已分配 #N 的消息（含 system、off-branch）。 |
| **E** | 有效历史：当前分支 + 编辑投影 + 隐私策略之后的消息身份集合。 |
| **X = I 减 E** | 未进入有效历史的消息，逐项带原因（system、off-branch、context-edit-excluded、policy-excluded、not-effective）。 |
| **Live / Quoted / IndexOnly / Unavailable** | E 的四个互斥状态：当前尾部 / 有展示跨度 / 已保存但未展示 / 不可读。 |
| **H / U0 / EC / O / U1 / A** | 视图候选：最小封面 / 用户原文核心 / 错误与计数 / 操作台账 / 用户原文加深 / 助手锚点。 |
| **neededChars** | 完整候选集的最终渲染成本；预算 B = min(Bcap, needed)。 |
| **render-1 到 render-5** | 渲染器版本：基础视图 / 隐藏地址 / 页表+max+cost / 全跨度探索 / 合并 cover。 |
| **hidden span** | Quoted 字段中未展示的连续字符区间；有字段与 UTF-16 偏移。 |
| **max** | 一次读取一个窗口（默认 12,000 chars）的可执行地址。 |
| **cover / coverMax** | 服务端合并连续窗口、一次返回整段并打印总成本；coverMax 是宿主政策（探索值 48,000）。 |
| **readRange** | 读者实际返回的区间（结果头）；§12.9 的覆盖指标用它。 |
| **targetCoveredByRead** | 读区间是否真的包含目标偏移；独立于模型答案。 |
| **hiddenExposed** | 单条工具结果是否含完整隐藏句；保守指标，目标句可能跨结果。 |
| **groundedCorrect** | 答案正确且理由落到隐藏更正/独立重跑；由确定性词表重算。 |
| **zeroCallWrong** | 首轮 0 次工具调用直接作答且错误。 |
| **Wilson** | 本样本的描述性区间；不是显著性检验，不是总体概率。 |

## 5. 文件地图

| 路径 | 作用 |
|---|---|
| **README.md** | 包内容、校验、排除项、证据边界摘要 |
| **REVIEWER_GUIDE.md** | 本文件：离线阅读顺序、术语、证据地图、常见误读 |
| **docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md** | 设计理念与愿景（英文，含中文摘要） |
| **docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md** | Pi 宿主最小知识、API 事实、24 项检查、已验/未验 |
| **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md** | 主设计 + 一次性验证（中文，权威） |
| **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md** | 交接：完成状态、文件地图、送审状态 |
| **docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md** | 评审 brief：冻结输入、六个问题、范围外、证据边界、期望产出、claim 到 evidence 索引、英文摘要 |
| **docs/reviews/PI_CONTEXT_INDEX_EXTERNAL_REVIEW_PROMPT.md** | 可直接使用的评审提示词（中文 + English） |
| **docs/reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md** | 背景：促成该设计的独立第一性原理评审（中文） |
| **docs/reviews/CODEMODE_0.1.5_EXPERIENCE_AND_0.2.0_DIRECTION.md** | 背景：0.1.5 实测与 0.2.0 方向（中文） |
| **docs/reviews/CODEMODE_0.2.0_REVIEW_BRIEF.md** | 背景：上一轮评审提示词（中文） |
| **research/prototype/PREREG_RENDER3.md** / **PREREG_RENDER3_REPLICATION.md** / **PREREG_RENDER4.md** | §12.8 预注册（运行前写入；S2b 为事后确认，文档已标注） |
| **research/prototype/PREREG_RENDER5.md** / **PREREG_RENDER5_REPLICATION.md** | §12.9 预注册（主臂/重复批） |
| **research/prototype/fixtures.mjs** | 470 条合成夹具、真值、context-edit 夹具 |
| **research/prototype/activation-fixture.mjs** | t5/t5n/t6/t6n/t6l 激活夹具；render 1 到 5 |
| **research/prototype/catalog.mjs** | I/E/X、live、observations、字段视图 |
| **research/prototype/render.mjs** | 候选、预算、渲染、render-1 到 5 |
| **research/prototype/reader.mjs** | view/read/range/scan/touched；地址、页表、cover |
| **research/prototype/activation-experiments.mjs** | 行为实验运行器（需要本机端点；包内不可跑） |
| **research/prototype/rescore.mjs** / **table.mjs** / **activation-summary.mjs** / **followup-summary.mjs** / **render3-summary.mjs** / **render5-summary.mjs** | 计分与汇总逻辑（truth、correct/grounded、combined 行）；需要原始 runs，包内不可跑 |
| **research/prototype/bench-large.mjs** | 可选离线 10k 条性能检查（单机合成，非生产门） |
| **research/prototype/experiments.mjs** / **focused-experiments.mjs** / **focused-summary.mjs** / **render-snapshot.mjs** | §12.3/§12.5 与字节快照的源码；包内不可跑或只作参考 |
| **research/prototype/probe-render5.mjs** | 8 项结构探针（可离线跑） |
| **research/prototype/invariants.mjs** | 18 项结构不变式（可离线跑） |
| **research/prototype/host-pi.mjs** | 真实 in-process Pi SDK 探针（需要 Pi 包 + 端点；包内不可跑） |
| **research/prototype/out/render5-summary.json** | 105 条的 28 文件行 + 21 合并行 |
| **research/prototype/out/render5-runs.json** | 105 条精简运行：参数、返回区间、字符/成本、计分布尔；无正文 |
| **research/prototype/out/experiment-summary-rescored.json** | §12.3 主/变体表对应的聚合结果 |
| **research/prototype/out/activation-summary.json** / **activation-t5-summary.json** | §12.6 激活实验聚合 |
| **research/prototype/out/followup-summary.json** | §12.7 render-2 follow-up 聚合 |
| **research/prototype/out/render3-summary.json** / **render3-all-summary.json** | §12.8 render-3/4 聚合（两份的 summary 行相同） |
| **research/prototype/out/host-checks.json** | 24 项宿主检查的精简记录（无回答/正文） |
| **research/prototype/out/render-snapshot-final2.json** | render-1/2 视图哈希与长度（无正文） |
| **research/prototype/out/probe-render5.json** / **invariants.json** / **doc-fences.json** | 离线检查输出 |
| **manifest.json** / **verify-bundle.mjs** | 哈希清单与离线校验器 |
| **package.json** / **bun.lock** / **LICENSE** | 来源版本 0.1.5、peer 范围、Pi 1.4.0 锁定、MIT 许可证 |
| 旧插件源码 | **不在包内**；0.1.5 只是 design §12.3 的对照基线，不是评审对象 |

背景评审/方向文档中的链接可能指向包外的旧仓库文件；它们不是本次评审必需，链接只保留出处。

## 6. 证据地图（冻结结果到文件）

| 冻结结果 | 文件 / 位置 | 备注 |
|---|---|---|
| §12.3 主 API 表 + 变体表 | **experiment-summary-rescored.json** | 条件/组/均值/计数；无长正文 |
| §12.6 T1–T4 / T5 | **activation-summary.json** / **activation-t5-summary.json** | 每格 3 次；render-1 |
| §12.7 render-2 T5/T6/native | **followup-summary.json** | 行含 firstAction、hiddenExposed、usedAddress、zeroCallWrong |
| §12.8 render-3/4 主臂/重复/近距/长跨度 | **render3-summary.json** / **render3-all-summary.json** | 32 行；两份 summary 数组相同；S2b 是事后确认 |
| §12.9 render-5 + 15K + 近距 + 成本 | **render5-summary.json** / **render5-runs.json** | 28/21 行；105 条；覆盖按实际返回区间 |
| 结构不变式 | **invariants.mjs** / **invariants.json** | 18/18 |
| render-1/2/3 字节 | **probe-render5.mjs** / **probe-render5.json** / **render-snapshot-final2.json** | 8 项检查；哈希不变 |
| 宿主 24 项 | **host-checks.json** / **host-pi.mjs** | 24/24；端点替身；未验证项见指南 §8/HOST_PRIMER §7 |
| 文档围栏 | **doc-fences.json** | 设计/交接/brief/指南/宿主入门/理念/提示词 |

**怎么读 summary**：每行通常有 condition、n、valid、correct、groundedCorrect、targetCoveredByRead、hiddenExposed、usedMax/usedCover、calls、toolChars/promptTokens。**不要**把不同 batch 的 coverage 口径直接相减；看设计 §12.9 的“与 §12.8 的关系”和 brief §5.4。

**预注册文件清单**：§12.8 有 PREREG_RENDER3.md、PREREG_RENDER3_REPLICATION.md、PREREG_RENDER4.md；§12.9 有 PREREG_RENDER5.md、PREREG_RENDER5_REPLICATION.md。§12.3/§12.6/§12.7 **没有独立预注册文件**；它们的条件、truth 与计分记录在设计 §12.x 和对应脚本（experiments.mjs、activation-experiments.mjs、followup-summary.mjs）。评审 Q6 时必须按这个清单判断“预注册”证据，不要假设五个文件覆盖了所有章节。

## 7. 离线可跑与不可跑

**可以离线运行（Node 18+，无 npm install、无网络）：**

~~~sh
node verify-bundle.mjs                         # manifest + 计数 + 18/18 + 8/8
node research/prototype/invariants.mjs         # 18 项结构检查
node research/prototype/probe-render5.mjs      # 8 项 render-5 结构探针
node research/prototype/bench-large.mjs        # 可选：10k 条性能（单机数值）
~~~

**不能从包内运行：**

| 脚本 | 原因 |
|---|---|
| **activation-experiments.mjs** | 需要本机 OpenAI 兼容端点（127.0.0.1:8787）与 DeepSeek 模型；包内没有端点 |
| **host-pi.mjs** | 需要 @earendil-works/pi-coding-agent / pi-agent-core 包与端点；包内只提供源码与结果 |
| **render5-summary.mjs** | 需要原始 render5-*.json / *.log；包内只有精简运行与汇总 |
| **build-bundle.mjs** | 不在包内；它是生成本包的本机脚本 |

原始日志、端点配置、完整模型回答不在包内；因此**不能**从包内重跑 105 条行为实验或重算 grounded 的语义判断。可复现的是结构检查、聚合计数、manifest 哈希与冻结表核对。

## 8. 评审时不要做的事（常见误读）

1. **视图不是摘要，也不是全集。** 视图里没有不等于历史没有；IndexOnly 不等于删除；Unavailable 不等于可恢复；Quoted 的摘录不等于完整要求。
2. **工具可达不等于模型会调用。** 打印 cover 地址不等于模型会 cover；打印 max 不等于模型会读。触发层是本设计的已知缺口（C5 2/9 不调用 cover；A 0/3 覆盖）。
3. **7/9、9/9 不是概率。** 每格 3 或 9 次、固定顺序、无随机化、单模型、单合成夹具；Wilson 只描述本样本，不是显著性。
4. **correct / grounded / targetCoveredByRead / hiddenExposed 不是同一件事。** 有“正确但未覆盖目标”“覆盖目标但单结果未暴露完整句”“布尔正确但理由编造”的例子；报告必须分开。
5. **§12.8 与 §12.9 的覆盖口径不同。** §12.8 用请求参数，§12.9 用实际返回区间；不要逐格对比。0/24 在实际区间下也成立，但两节不是同一时间序列。
6. **宿主 24/24 不是完整宿主验证。** 真实 in-process Pi SDK + 本机 DeepSeek 替身；运行中取消、调度并行、权限扩展端到端、TUI/HTML、fork/context edit、100 次压缩、托管 provider、Pi 1.0/1.4 对照未验证。
7. **压缩不一定省 token。** 37K cover 结果 + 视图约 43.8K 大于 39.3K 原文；15K 约 21.7K 大于 17.2K。收益取决于隐藏文本是否被立即/重复读取，以及是否跨请求复用视图。
8. **“全量原文可见”不是承诺。** 预算是真实字符，B = min(Bcap, needed)；单行超限、策略排除、不可读都会让内容进入 IndexOnly/Unavailable。
9. **#N 是会话全局 entry 索引，不是窗口序号。** system 占索引但不渲染；custom/compaction 不消耗 #N；跨文件 fork 需要宿主继承元数据，缺映射就拒绝旧引用。
10. **材料没写的 Pi 行为，标“未验证”。** 不要用“通常 agent 框架都这样”补全；HOST_PRIMER 是 1.4.0 的摘录性说明，不是官方文档。

## 9. 已知缺口（评审应重点裁定）

- **触发层**：37K 上 C5 7/9，但 2/9 完全不调用 cover；A 0/3 覆盖；D5 4/9 不调用。
- **cover 默认政策**：coverMax=48,000 是探索值；何时打印 cover（只对跨窗口跨度？等 max 失败？成本上限？）未定。
- **15K 冗余**：max 已覆盖目标时 C 9/9；C5 仍 9/9 用 cover，工具字符 +12%。
- **分页/页表**：C2 3/9 覆盖、prompt 20,463 对比 C5 13,570；页表/page/line 在全部臂 0 次使用；不加入默认。
- **宿主**：取消、调度并行、权限扩展、TUI、fork、100 次压缩、托管 provider 未闭环。
- **证据边界**：单模型、单合成夹具、每格 3/9、固定顺序、Wilson 描述性；无真实会话/跨模型/100k/200MB/显著性。

完整裁定问题与期望产出见 **REVIEW BRIEF §3 与 §6**。

## 10. 建议的评审产出

0. 第一性原理结论：问题是否成立、作用层是否正确、设计理念的承重部分、承重假设与反例、至少 2 个替代方案、建议 keep / modify / refactor / replace。若前提错误，可把六问标为不适用。
1. 逐题回答 Q1–Q6：结论（接受/有条件/拒绝/不适用）、依据（文件+章节/行）、要求的修改、阻断级别（设计/实现/非阻断）。
2. 总体结论：**可送实现 / 有条件可送 / 建议重构后再评 / 不可送**。
3. 必须弱化的 claim 列表（例如把“压缩节省 token”限定为“隐藏文本不被立即读取”）。
4. 缺失证据清单（不要编造；写“材料未提供”）。
5. 语言/范围限制：如果评审者不读中文，请明确把详细表格评审标为语言受限；英文材料覆盖设计理念、宿主契约、英文摘要与 prompt。

评审不需要重跑行为实验；离线检查可选。引用数字时以 summary/设计表为准，不要从 out 目录正文或模型回答推断。
