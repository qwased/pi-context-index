# pi-context-index 0.1.0 落地计划

- 日期：2026-10-31。
- 配套依据：[初版设计](./PI_CONTEXT_INDEX_V0_1_DESIGN.md)。功能、数据与默认参数以该文档为准。
- 本轮交付：设计和计划；尚未创建新包、修改运行代码或发布版本。
- 执行目标：约 6 个开发日形成可日常使用的 0.1.0；第二个开发日结束前提供可用的 alpha 闭环。工作量按交付验收而不是日历强制切分。

## 1. 交付物与工作位置

正式实现时，在当前仓库的同级目录创建独立项目 `pi-context-index/`，不把新运行代码继续叠加到旧插件。

| 交付物 | 内容 |
|---|---|
| 可安装 Pi 包 | `index.ts`、`src/`、必要依赖、MIT LICENSE、包清单 |
| 核心能力 | 自动/手动压缩续接包；常驻 `context_index` 三动作工具 |
| 基础测试 | 来源与编辑、字段、检索、预算、Unicode、引用、真实宿主生命周期 |
| 使用文档 | 简短 README：安装互斥、默认效果、三个动作、三个设置、故障定位 |
| 发布记录 | CHANGELOG 的 0.1.0 条目及简短试用记录 |

旧仓库继续保持 0.1.5 运行代码不变。现有原型文件用于搬运夹具、理解机制，不直接作为新包依赖。移植旧代码时保留 MIT 许可和原有版权信息。

技术栈确定为 TypeScript ESM、Pi 1.4.0 开发基线、TypeBox 参数 schema、Bun 测试与锁文件。peer 范围 `>=1.4.0 <2.0.0`；首版不投入 Pi 1.0.0 兼容层。包本身不依赖 pi-codemode；只按已有记录结构处理 nestedCalls。

## 2. 首版范围

### 必须完成

1. `session_before_compact` 对 manual、threshold、overflow 的同一路径接管。
2. 以原生 entryId 为引用的来源目录、当前分支与编辑投影。
3. 用户指令、近期工作、操作导航三组续接内容；真实字符预算和 `needed` 截止。
4. 全文与窗口读取、结构浏览、词法/字面搜索。
5. 一次 agent 运行累计回注预算、正常部分结果、可继续游标和取消响应。
6. 重启、切树、fork、context edit、重复压缩的基础宿主测试。
7. 至少三个真实任务形态的试用及固定 12 题检查。

### 排到用户反馈之后

磁盘 sidecar、向量搜索、自定义抽取器注册机制、任务状态编辑工具、自动全文预取、独立 TUI 面板、跨会话检索、历史 renderer 重放、全量操作列表常驻展示、100K 条/200MB 专项优化。

这份列表是排期，不是永久禁止。优先解决真实用户出现的目标丢失、找错记录、读回成本过高问题。

## 3. 开发顺序与里程碑

```text
P0 真实宿主薄闭环
        |
P1 来源/字段/有效历史
        |
P2 续接包与真实预算 -> alpha 日常试用
        |
P3 结构导航/搜索/全文读取
        |
P4 生命周期/重复压缩/真实任务回归
        |
P5 0.1.0 打包交付 -> 用户反馈 -> 0.1.1
```

测试夹具和算法单元测试可以与各阶段并行建设。压缩链路先通，不再先花多轮研究预算调教孤立的提示词。

### P0：先跑通真实压缩与读回（0.5 日）

**产出**：最小新包、宿主测试支架、临时简单续接包、按记录 ID 读取。

实现位置：`index.ts`、`src/host.ts`、`src/model.ts`、`src/reader.ts`、`tests/host.test.ts`。

具体工作：

1. 注册 `exposure:"direct"` 的 `context_index`，初始实现 `read` 的主文本字段。
2. 注册 `session_before_compact`，返回一段带用户原文和 entryId 的有界文本。
3. 使用真实 Pi SDK 构造有历史的会话，调用真正的 `AgentSession.compact()`。
4. 检查新增 compaction entry、`fromExtension`、宿主重新构建的 `summary + tail`。
5. 从刚生成的压缩文本提取引用，实际执行 reader，核对原文。
6. 测试 provider 替身记录所有请求；直接压缩不产生模型请求。继续对话时只出现正常 agent 请求。
7. 故意让插件构建失败，确认 `{cancel:true}` 阻止默认 LLM 摘要回退。

**退出条件**：真实压缩 → 持久化 compaction → 宿主重建上下文 → 按生成引用读回原文完整通过。不得用手动拼接 `<view>` 后 `prompt()` 代替。

P0 的简单渲染器只服务薄闭环，P2 直接替换；不保留为兼容分支。

### P1：统一来源、字段和引用（0.75 日）

**产出**：源目录、编辑投影、字段迭代器、Unicode 窗口、可重建内存状态。

实现位置：`src/source.ts`、`src/fields.ts`、`src/cut.ts`、`src/fences.ts`，以及相应测试。

具体工作：

- 从 `getEntries/getBranch` 捕获水位与分支头，建立 `entryId -> entry` 索引。
- 使用原生 ID 显示引用，`order` 只用于排序，彻底分开身份与位置。
- 返回 `TextField[]/Iterable<TextField>`，字段路径为 JSON Pointer。
- 对内容编辑分别记录 ownerId 与实际 storageId；替换内容指向 `/replacement/content/...`。
- 复用影子 compaction 投影方法；先确定 cut，再应用包含 tail 中 edit 的完整分支投影。
- 复用用户轮切点与工具结果边界处理；按初版 tail 上限替换旧 smart-keep 调参路径。
- 把旧 grapheme 窗口改为接受独立字段字符串；原始换行保持不变。
- 排除 compaction、branch summary、本工具回声对新候选和默认搜索的影响。
- 统一登记 message/custom_message、编辑、调用与结果，计算 I/E/X 和 live 成员。

**退出条件**：引用在追加和切树后保持指向；编辑正文按新字段地址精确读取；首条源消息跨一次压缩后仍在档案中；UTF-16 和围栏基础测试通过。

### P2：实现实用续接包（1 日）

**产出**：可日常试用的 alpha，完整三组续接内容和确定性分配器。

实现位置：`src/chunks.ts`、`src/observations.ts`、`src/candidates.ts`、`src/budget.ts`、`src/render.ts`、`tests/capsule.test.ts`。

具体工作：

1. 实现围栏外标题、自然段、列表和超长单行分块。
2. 提取 U/W/N 固定候选集合，长助手文本保留至 4,000 字符目标深度。
3. 完成直接工具和 nestedCalls 的调用/结果配对、路径聚合及常见测试计数原句定位。
4. 先完成时间与结构选择；P3 接入同一个 BM25 排序器后，补齐相关旧消息与中段查询得分，不保留两套选择协议。
5. 实现保底、55/30/15 份额、U→W→N 借用、精确回退和 `needed` 截止。
6. 所有非连续源片段之间加入有范围的省略标记；复用围栏状态机。
7. details 只写 source/recipe/选择跨度/计数，不写正文或逐记录状态数组。
8. 在同一个真实 SDK 会话中压缩两次，检查第二次仍从源历史选取，而不是摘要套摘要。

**退出条件**：2,400/7,680/12,000 字符预算均通过；用户和最新助手保底存在；短会话不填满；工具结果/代码围栏不吞掉后续结构；无 live 原文重复。

**立即试用**：把 alpha 装入独立测试用 Pi agentDir，做一个真实小任务并手动压缩，检查 agent 能否继续。此时不等待大规模性能或研究实验。

### P3：完成三动作 reader 与回注预算（1.25 日）

**产出**：完整 `list/search/read`、全文模式、共享词法排序、续读游标和运行预算。

实现位置：`src/search.ts`、`src/reader.ts`、`src/host.ts`、`src/settings.ts`、`tests/search.test.ts`、`tests/reader.test.ts`。

具体工作：

- `list` 无 ref 浏览目录；有 ref 返回字段和章节导航。
- `search` 支持 BM25 词法检索和原字符串字面检索；输出真实源块/偏移和可执行 read。
- 搜索分词器与候选相关性排序共用，接入 P2 的相关旧用户消息及中段选择。
- 普通 read 默认请求 6,000 字符；全文模式直接有界切片，完整输出分别受 12K/48K 上限约束。
- cursor 固定源水位、分支和原参数；词法分页位置与字面扫描的字段/偏移位置分别保存，输出装不下的命中留给下一页。
- 部分全文结果同时返回运行剩余额度与 now/next-run 续读时机，额度耗尽后在下一次运行续读，不绕过累计上限。
- `before_agent_start` 创建 run 预算，普通 `turn_start` 不重置；压缩也不重置该 run 的额度。
- 并发执行先同步预留，完成后结算，取消释放；持有原 run 对象避免跨运行串账。
- list/search 4K、普通 read 12K、full 48K 均为总结果上限；run 正常结果累计默认 48K。
- 正常部分结果不设置 `isError`；返回实际区间、remaining、next/cursor。
- 字面扫描按记录让出事件循环，3 秒时间片返回部分命中；运行中取消有测试。
- 仅暴露设计规定的三个设置；对配置类型和范围做一次入口检查。

**退出条件**：已知 21K/200K 字段中的目标可用搜索后一次 read 直达；15K/37K 用户字段可用 full 一次读取或明确部分读取；中文查询、标识符拆词、字段错误、游标续读和并发预算通过。

### P4：宿主生命周期与真实任务回归（1.5 日）

**产出**：可发布候选，真实宿主路径、重复压缩与实际使用闭环。

实现位置：`src/host.ts`、`tests/host.test.ts`、`tests/lifecycle.test.ts`、合成夹具及本地回放脚本。

具体工作：

1. 通过测试 provider/窗口设置触发真正的 threshold 与 overflow 处理，检查续接包进入下一次模型上下文。
2. 手动 keep:N、compact-all、过大单轮、正常调用/结果边界分别验证。
3. 持久会话重启后 reader 可用；切树和 fork 后继承记录仍按 ID 解析。
4. 覆盖消息编辑、消息省略、在 tail 内修改旧消息、检查点编辑四种常见编辑路径。
5. 连续 10 次压缩，检查早期用户目标、中段更正、旧计数仍能找到，details 体积与选择跨度相关而不随整个历史数组增长。
6. 执行固定 12 题，并在三个真实任务形态中做压缩后继续工作。
7. 测量 10K 条/50MB 混合会话冷建、热查询、渲染与读取；优先消除重复字符串、重复分词和整文件重读。
8. 使用真实 Pi TUI 手动运行一次压缩与 recall，检查通知、工具错误和结果展示；只做必要可读性调整。
9. 在启用 codemode 的测试环境中检查 `context_index` 实际可调用，并验证直接工具与 nestedCalls 混合记录的读取。

**退出条件**：核心自动测试全通过；12 题至少 10 题有据正确且目标/更正 4 题全部通过；三个实际任务能够在不重新讲述目标的情况下继续。发现目标遗漏或错引用，直接回到对应模块修复再验收。

### P5：打包与交付（0.5 日）

- 写简短 README、CHANGELOG 和设置示例，说明安装时关闭旧压缩插件。
- 检查 npm 包只包含入口、运行源码、README、LICENSE、CHANGELOG。
- 在全新临时 agentDir 安装打包产物，跑一次 `/compact` 和一次 `context_index`。
- 保留准确版本、测试命令、12 题结果、三类试用结论和性能计数。
- 交付可安装包与安装步骤；真正的提交、推送和 npm 发布按用户届时授权执行。

## 4. 复用清单与必须重写的位置

旧实现提供算法素材，新包不导入旧包运行路径。

| 来源锚点 | 复用内容 | 新位置与改动 |
|---|---|---|
| [before-compact.ts：279](../../reference/legacy-0.1.5/src/hooks/before-compact.ts#L279) | `buildOwnCut` 的用户轮边界 | `cut.ts`；保留基本边界，替换预算输入，不复制旧 provider gate 与摘要路径 |
| [before-compact.ts：351](../../reference/legacy-0.1.5/src/hooks/before-compact.ts#L351) | token 预算切点与不从 toolResult 开始的处理 | `cut.ts`；以工具事务和新 tail 参数测试 |
| [brief-history.ts：83](../../reference/legacy-0.1.5/src/core/brief-history.ts#L83) | 完整原始分支、影子 compaction、编辑检查点下界 | `source.ts`；输出 owner/storage 定位，不再输出全局编号 |
| [recall-full.ts：76](../../reference/legacy-0.1.5/src/core/recall-full.ts#L76) | 保存字段选择规则与 nestedCalls | `fields.ts`；必须重写为字段迭代器，不从旧格式化字符串解析字段 |
| [recall-full.ts：163](../../reference/legacy-0.1.5/src/core/recall-full.ts#L163) | 字符簇安全切片 | `reader.ts`；对独立字段执行，回显实际起止 |
| [recall-full.ts：321](../../reference/legacy-0.1.5/src/core/recall-full.ts#L321) | 固定范围扫描、deadline、续扫思路 | `search.ts`；遍历内存字段及索引，不再每次线性扫描 JSONL 到编号 |
| [fences.ts：70](../../reference/legacy-0.1.5/src/core/fences.ts#L70) | 围栏状态、闭合与孤立收尾 | `fences.ts`；保留纯函数和对应测试 |
| [token-estimate.ts：69](../../reference/legacy-0.1.5/src/core/token-estimate.ts#L69) | 消息内容容量估算 | `budget.ts`；供 tail 和 reader 余量计算，不沿用旧摘要预算公式 |
| [file-ops.ts：16](../../reference/legacy-0.1.5/src/codemode/file-ops.ts#L16) | nestedCalls 文件操作识别 | `observations.ts`；与直接工具统一输出 |
| `research/prototype/fixtures.mjs`、`activation-fixture.mjs` | 合成记录、深偏移与更正场景 | 拆到 `tests/fixtures/`，扩展 Unicode 与分散更正；不搬实验开关和旧渲染版本 |

`global-indices.ts`、旧角色评分/摘要合并、旧 recall 格式、render-1 至 render-5 分支、权限策略和固定页网格不进入新包。当前新设计不需要迁移原型所有代码，按契约逐项移植即可。

## 5. 可直接开工的函数边界

以下是新包目标接口，不表示旧文件已经导出这些函数。

```ts
captureSource(manager, branchEntries?): SourceSnapshot
projectHistory(snapshot, firstKeptEntryId): EffectiveHistory
enumerateFields(entry, options): Iterable<TextField>
resolveStoredField(snapshot, ref, field?): TextField
chunkField(field): Chunk[]
extractObservations(history): Observation[]
buildWorkingQuery(history, compactInstructions?): string[]
makeCandidates(history, query): CandidateSet
buildCapsule(snapshot, cut, config, modelWindow): Capsule
search(query, snapshot, options, signal): Promise<SearchPage>
executeReader(args, ctx, runBudget, signal): Promise<ToolResult>
chooseCut(snapshot, event, ctx): Cut
```

实施约束：

- `SourceSnapshot` 的原始记录表和有效投影表分开；一个负责存档寻址，一个负责当前展示。
- `Span.ownerId` 决定角色、时间与统计；`Span.storageId + field + start/end` 决定实际原文。
- 一个 `FieldPath` 解析器同时用于提取、搜索命中和 read，避免三套字段命名。
- `render()` 是计费真值；所有上限检查用最终 UTF-16 长度。
- 候选器是纯函数；预算器操作升级单元；渲染器负责源顺序和结构标记。
- schema 只声明三种 action 与必要参数，执行入口集中检查互斥关系。
- 索引增量和 cache 不改变排序结果；同一输入的冷建与热路径生成同一续接包。

## 6. 必测状态迁移

| 初始状态 | 触发 | 目标状态/可观察结果 | 测试归属 |
|---|---|---|---|
| 未压缩会话 | list/search/read | 可浏览和读取已有保存记录 | reader |
| 普通长会话 | 手动 compact | 新续接包 + 合法 live tail，零摘要模型请求 | host |
| 接近窗口上限 | threshold | 自动走相同插件路径，下一轮看到续接包 | host |
| 模型返回上下文超限 | overflow | 更紧 tail，插件结果用于宿主重试 | host |
| 压缩构建失败或取消 | hook 返回 cancel | 不生成 compaction，不调用默认摘要模型 | host |
| 已压缩会话 | 再压缩 10 次 | 仍能找回最早目标，生成物不自喂 | lifecycle |
| 当前消息有替换 edit | 再建包/搜索 | 返回替换文本及 edit 保存地址 | source |
| 消息被 edit 省略 | 再建包 | 退出续接候选；显式原始地址仍可读 | source |
| edit 位于 tail | 压缩旧前缀 | 编辑已作用于旧记录 | source |
| 检查点被 edit | 再压缩 | 按设计下界构建；旧档案读取不丢 | source |
| 存在历史引用 | 切树/fork | 当前文件中存在的原生 ID 正确解析 | lifecycle |
| 持久会话已压缩 | 关闭并恢复 | 目录重建，引用与字符范围保持正确 | lifecycle |
| 有长字段 | full 返回部分结果 | 正常结果 + incomplete + 可执行 cursor | reader |
| 同一运行已有读取 | 工具循环下一次 read | 累计额度继续扣减，不因 turn_start 清零 | reader/host |
| 两个读取同时启动 | 并发 reserve | 总获准结果不超过共享额度 | reader |
| 读取/扫描进行中 | abort | 及时停止并退还未使用预留 | reader |
| 旧 cursor 尚未结束 | 普通追加 | 按原快照完成分页 | reader |
| 旧 cursor 尚未结束 | 切树/编辑 | 明确要求重启动作，不混合两份有效历史 | reader |

这张表作为测试索引。新增问题优先补一行可复现迁移，再修改对应实现，不扩大到与该问题无关的边界。

## 7. 测试夹具与评价方法

### 7.1 合成夹具最小集合

| 夹具 | 目的 |
|---|---|
| 普通编码任务 | 起点请求、近期更正、最新助手说明、直接工具结果 |
| 分散更正 | 早期规则与中段更正位于不同用户消息，不依赖一条巨型任务书 |
| 最新长报告 | 2.5K/4K 助手说明及验收数字，验证不再退化为几十字旁白 |
| 长用户字段 | 15K 的目标在第二窗口；37K 的目标在中段；同时测试无标题文本 |
| 深工具输出 | 21K 与 200K 字段尾部有不同版本计数，核对值、作用域、地址 |
| Unicode | 中文、生僻字、emoji、组合字符、CRLF、长单行、跨围栏切点 |
| 分支与编辑 | append、切树、fork、替换/省略、编辑检查点 |
| 长期增长 | 连续压缩 10 次，夹杂 reader 结果与 compaction 条目 |

题目和预期来源跨度保存在夹具代码中。调整算法时重跑同一题集，另加一个暴露失败的新用例；不靠只修改评分词表把失败改成成功。

### 7.2 行为检查

使用同一个模型、同一原始任务和同一压缩位置做简单对照，固定用户问题，记录：

- 回答是否正确、是否来自预期原文。
- 实际工具返回区间是否覆盖所需内容；搜索片段也纳入暴露范围。
- 目标/更正是否被直接展示或可靠读回。
- list/search/read 次数及全文重复读取次数。
- 新增工具字符和宿主实际累计 prompt token。

首版无需重跑原型的全部 105 次实验，也不把统计预注册作为实现前置门。每次有意修改选择或读取策略，留下变更前后的同题结果即可；正式做性能宣传时再扩大样本。

### 7.3 日常验证命令

新项目建立相应 scripts 后使用：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
bun test tests/host.test.ts tests/lifecycle.test.ts
npm pack --dry-run
```

首次创建 lockfile 时先正常安装并生成锁文件，之后才使用 frozen-lockfile。宿主测试使用临时 cwd、agentDir 和设置文件，不读取或改写日常使用环境。模型费用对照单独手动运行，普通自动测试使用本地 provider 替身。

## 8. 发布前完成定义

- [ ] 设计 §13.1 的十项自动验收通过。
- [ ] 所有生成读取地址已通过真实 parser 与 reader 回读。
- [ ] 真正的手动/threshold/overflow 压缩均验证；无插件摘要模型调用。
- [ ] 目标/更正 4 题全部通过，固定题集至少 10/12 有据正确。
- [ ] 三种实际任务压缩后可以继续，记录失败修复与残留体验问题。
- [ ] 50MB/10K 条基准达到目标，或先完成影响日常使用的优化后复测。
- [ ] 真实 TUI 完成一次压缩与读取，确认可读性。
- [ ] 打包内容、安装互斥、设置、README 与 CHANGELOG 一致。
- [ ] 交付版本、运行结果和未做的可选项目准确区分。

当前这些勾选项是实施验收清单，不代表已经完成。

## 9. 0.1.1 的反馈闭环

每次用户反馈只收集能定位问题的最小材料：压缩记录、相关消息 ID、工具调用轨迹、实际看到的续接包，以及用户期望继续完成的事情。

| 实际反馈 | 优先调整 | 保持不动 |
|---|---|---|
| 忘了最初目标或某次更正 | U 选择、工作查询、中段分块或完整消息阈值 | 引用和 reader 协议 |
| 不知道刚才工作到哪 | W 深度、最新助手选择、最近结果片段 | 源档案与目录身份 |
| 找不到旧记录 | 分词、词法排序、章节导航、搜索去重 | 预算总量先保持 |
| 经常一次读回过多内容 | search 命中窗、普通 read 默认值、full 使用提示 | 原文保留与可寻址性 |
| 连续工具调用消耗过大 | runReadMaxChars、结果长度、重复读取提示 | 正常部分结果语义 |
| 大会话卡顿 | 增量索引、避免字符串副本，再评估可丢弃磁盘缓存 | 会话为事实来源 |

先发布可用的 0.1.0，再围绕用户遇到的一个具体失败做一次小迭代。修改 selector 常量提升版本号并更新对应 golden，不建设第二套兼容压缩系统。

## 10. 执行起点

下一次进入实现时，直接从 P0 创建独立新包并建立真实压缩测试开始。初版架构、引用策略、reader 形状与默认预算已经确定，无需再以原型评审或隐私设计作为前置工作。
