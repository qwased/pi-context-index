# pi-context-index 0.1.0 工作进度

- 版本：0.1.0（未发布）
- 最近更新：2026-11-02
- 状态：P0–P3 完成；P4 **进行中**（threshold/overflow 真实宿主路径已完成，其余 P4 项待做）；codemode 范围已确认（R1–R3 纳入，R4 不做）。下一窗口继续用的提示词见 §9
- 设计依据：[V0.1 设计](./PI_CONTEXT_INDEX_V0_1_DESIGN.md)
- 执行依据：[V0.1 落地计划](./PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md)
- 基线提交：本文件所在提交（用 `git log -1 --format=%H` 查看）

## 1. 交接约定

本文是 0.1.0 实现期间唯一持续更新的状态与交接文档。

- `PI_CONTEXT_INDEX_V0_1_DESIGN.md` 和 `PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md` 是冻结输入，非必要不修改。
- 进度、验证结果、实现决定、偏差、遗留问题和下一步只写入本文。
- 如果确实需要修订设计，先在本文件记录原因和影响，并在同一变更中更新设计；不要悄悄改变实现口径。
- 每完成一个有意义的步骤（至少每个 P 阶段和每次真实宿主验证），更新状态、证据和下一步。
- 新接手的人按“本文 → 设计 §6/§13 → 计划对应 P 阶段 → 相关源码”的顺序阅读。原型、外审和旧插件文档只在需要追溯时阅读。
- 计划 §1/§10 写于项目创建前，仍称“尚未创建新包、在同级目录新建项目”。实际项目就是本仓库；该句是历史状态，不改计划，以本文为准。

## 2. 当前状态

### 2.1 已完成

| 项目 | 状态 |
|---|---|
| 仓库与包骨架 | 完成。TypeScript ESM、Bun 测试、锁文件、CI、MIT LICENSE、包清单 |
| 冻结数据契约 | 完成。`src/model.ts` 对应设计 §6.4 |
| 设置边界检查 | 完成。`src/settings.ts` 校验三个设置和范围 |
| 围栏状态机 | 完成。`src/fences.ts` 及单元测试 |
| 测试类型检查 | 完成。`tsconfig.tests.json` 覆盖 `tests/`，`@types/bun` 固定 1.4.4，CI 执行 `bun run typecheck:tests` |
| 扩展入口 | 完成（P0）。`index.ts` 注册直连工具和压缩钩子，不再保持空注册 |
| `context_index` 直连工具 | 完成（P0）。`exposure:"direct"`；当前只实现 `read`，按 `e:<entryId>` 读取主文本字段或显式 JSON Pointer 字段。`list`/`search`、窗口、`full`、游标和预算留给 P3 |
| 压缩钩子 | 完成（P0）。`session_before_compact` 返回插件 compaction；构建失败或取消一律返回 `{cancel:true}`，不触发默认摘要；P0 使用宿主准备好的切点 |
| 真实宿主测试 | 完成（P0）。`tests/host.test.ts` 使用临时 cwd/agentDir、Pi faux provider 和真实 `AgentSession.compact()`；真实扩展由 `DefaultResourceLoader` 从 `index.ts` 加载，覆盖持久化、投影、按引用回读、长用户文本的有界截断与整字段回读、失败取消 |
| 旧实现镜像 | 完成。`reference/legacy-0.1.5/` 只读，不导入 |
| 合成原型资产 | 完成。`research/prototype/` 脚本、夹具和预注册；运行产物不入库 |
| codemode 需求范围 | 完成（2026-11-02）。需求方确认 0.1.0 只需索引并寻回脚本聚合输出；R1–R3 纳入，R4（每条嵌套调用的输出）记为产品级已知限制。结论与落点见 §7 和[审阅稿](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md) |
| 来源快照与有效历史 | 完成（P1，2026-11-02）。`src/source.ts` 一次捕获 entries/branch/leaf/watermark，建立稳定 ID 索引；影子 compaction + `buildSessionProjection` 应用编辑；I/E/X 与 live 按真实成员集合计算，不使用 ID 水位近似 |
| 字段迭代器 | 完成（P1）。`src/fields.ts` 是唯一字段口径：JSON Pointer、UTF-16 跨度、owner/storage 分离、内容/参数/结果/标量、nestedCalls 与 replacement 字段；自动跳过 `/message/details/**` |
| 自有切点 | 完成（P1）。`src/cut.ts` 实现默认保留最近一个用户轮、`keep:N`、tail 上限 `min(16000, 0.25W)`、overflow `min(8000, 0.15W)`、工具事务边界；compact-all 使用空 `firstKeptEntryId` |
| grep 窗口与精确回读 | 完成（P1）。`src/reader.ts` 提供 grapheme 对齐前缀/有界窗口与按存储地址 `read` |
| P1 单元与真实宿主测试 | 完成（P1）。新增 `tests/source.test.ts`、`tests/fields.test.ts`、`tests/cut.test.ts`、`tests/reader.test.ts` 与 `tests/fixtures/entries.ts`；真实宿主新增 `keep:2` + 编辑替换 + 按 replacement 地址回读测试 |
| 结构分块与词法 | 完成（P2）。`src/chunks.ts` 围栏感知标题/段落/列表/长行分块，400–800 合并，192 字符升级切片；`src/search.ts` 统一 tokenizer 与 BM25（k1=1.2, b=0.75），camelCase/下划线/路径拆分、CJK 二字词项 |
| 观测提取 | 完成（P2）。`src/observations.ts` 直接工具、nestedCalls 与 bashExecution 产出同一 `Observation`；`(resultId,nestedIndex)` 配对，`argumentsBytes` 保留，nested 错误引用其 error 字段 |
| U/W/N 候选与保底 | 完成（P2）。`src/candidates.ts` 首条用户 + 最近三条 + 最多四条 BM25 相关旧用户；最近两条助手 + 最近两错误/一条命令；操作按 `(operation,path)` 合并最多 12 行 + 4 条计数原句 + 长文标题导航；160/256/128 保底 |
| 预算与渲染 | 完成（P2）。`src/render.ts` 实现 `Bcap=min(viewMaxChars,max(2400,0.06W))`、55/30/15 份额、U→W→N 借用、按接受顺序回退、最终 UTF-16 长度裁定；覆盖、标签、地址、省略标记与围栏修复全部计费 |
| P2 真实宿主与预算测试 | 完成（P2）。`tests/capsule.test.ts` 覆盖 2,400/7,680/12,000、保底、短会话、Unicode、围栏、相关旧用户、长助手、嵌套合并；真实宿主在同一会话连续压缩两次仍从源历史选材 |
| 三动作 reader | 完成（P3）。`src/reader.ts` 实现 `list/search/read`：目录分页、ref 字段与标题、BM25/字面检索、真实偏移、窗口/`full`、`scope:branch|session`、role 过滤；显式 read 不受旧 cursor 影响 |
| 游标与回注预算 | 完成（P3）。版本化 base64url cursor（session/head/watermark/action/params/resume point）；追加保持旧水位、切树/新编辑失效；`ReaderRunBudget` 同步预留/结算/释放，48,000 字符 + 8 次调用，上下文余量与 `budget_exhausted` 短诊断 |
| 设置文件 | 完成（P3）。`loadSettingsFile(agentDir)` 读取 `pi-context-index.json`，`parseSettings` 边界检查；无效配置使压缩取消、工具报错；host 测试用临时 agentDir |
| 自我回声标记 | 完成（P3）。reader 结果正文外套 `<<<pi-context-index:read>>>` / `<<</pi-context-index:read>>>`；分块与检索剪除标记区间，原始字段与显式读取保持全字节 |
| P3 测试 | 完成（P3）。reader 单元/执行测试 28 个、设置文件 3 个、真实宿主 2 个（8 次调用上限与无效设置）；覆盖 21K 深字段搜索直达、37K full、并发共享账本、cursor 失效 |
| 工作文档 | 完成。设计、计划、移植地图、宿主入门、外审与历史记录 |

### 2.2 未实现

- threshold/overflow、重启、切树、fork、context edit、连续压缩和真实任务回归（P4）。
- `pi-context-index.json` 设置文件加载；P0 使用冻结默认值。
- R4（每条嵌套调用的独立执行输出）：**不在 0.1.0 范围**。宿主不落盘，插件不监听 `tool_execution_end`、不新增 custom 条目；范围为 R1–R3，见 §7 和[审阅稿 §0](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md)。

### 2.3 基线验证

2026-11-02 在本机运行：

```text
bun 1.4.4 / Node 24.19.0 / Pi 1.4.0 / TypeScript 7.0.2
bun run typecheck                                -> pass
bun run typecheck:tests                          -> pass
bun test                                         -> 122 pass, 0 fail
```

P4 目前新增真实宿主 threshold 与 overflow 各 1 个测试；全套现为 122 个测试、905 个断言。P0–P3 测试全部保持通过。

### 2.4 里程碑

| 阶段 | 状态 | 产出与退出条件 |
|---|---|---|
| P0 真实宿主薄闭环 | 完成 | 注册 `exposure:"direct"` 的 `context_index read` 与 `session_before_compact`；真实 `AgentSession.compact()` 完成压缩、持久化、上下文重建和按引用读回；直接压缩零摘要模型请求；构建失败返回 `cancel:true` 且不调用默认摘要 |
| P1 来源/字段/有效历史 | 完成 2026-11-02 | 源快照、编辑投影、字段迭代器、Unicode 窗口、切点；引用在追加和切树后保持指向；nestedCalls 的 `arguments`/`error`/`status` 可按地址读取。证据：`tests/source.test.ts` 覆盖不可变快照、替换/省略/检查点编辑、I/E/X 守恒；`tests/fields.test.ts` 覆盖 nestedCalls 与 Pointer 转义；`tests/cut.test.ts` 覆盖 keep:N、tail/overflow 上限与工具边界；真实宿主测试覆盖 `keep:2`、编辑替换与按 `/replacement/content` 回读 |
| P2 续接包与真实预算 | 完成 2026-11-02 | U/W/N 候选、长文本分块、观测提取、保底与借用、围栏修复；真实会话连续压缩两次。证据：`tests/capsule.test.ts` 覆盖 2,400/7,680/12,000、保底、短会话、Unicode、围栏标记与相关旧用户；真实宿主第二次压缩仍引用第一条用户原文且零摘要请求 |
| P3 三动作 reader 与回注预算 | 完成 2026-11-02 | `list/search/read`、全文模式、BM25 与字面检索、游标、运行预算；已知长字段可搜索后一次读取直达。证据：21K 深字段搜索→read 直达、37K full、8 次调用上限、无效设置、并发共享账本、cursor 追加/切树/编辑失效 |
| P4 生命周期与真实任务回归 | **进行中** | 已完成：真实宿主 threshold/overflow 同一插件路径、下一轮看到 capsule、零摘要请求（`tests/host.test.ts` "P4 lifecycle"）。待做：compact-all、restart/切树/fork/context edit 四种编辑路径的真实宿主测试、连续 10 次压缩、12 题合成曝光、性能基准、codemode 状态迁移、真实 TUI/任务试用 |
| P5 打包与交付 | 未开始 | README、CHANGELOG、设置示例；临时 agentDir 安装并跑一次压缩与读取；记录版本与结果 |

### 2.5 P0 实现决定（历史，仍有效的保留）

- **切点暂时用宿主的准备结果。** `buildThinCapsule` 直接使用 `event.preparation.firstKeptEntryId`，不自建 `cut.ts`。原因是 P0 先验证真实宿主链路；该切点是宿主按 `keepRecentTokens` 算出的消息/工具事务边界，不会以孤立 `toolResult` 开头。P1 用插件自己的 `keep:N` 与 tail 上限替换。
- **P0 续接文本只引用用户原文。** 选中“被压缩前缀中的第一条非空用户消息 + 最近三条”，按源顺序引用；每条是主文本字段的完整原文或经 grapheme 对齐的前缀。整体硬上限取 `DEFAULT_SETTINGS.viewMaxChars`（12,000）。助手工作说明、工具结果和操作导航留给 P2 的候选集与渲染器。
- **主文本字段口径。** 字符串 `message.content` 为 `/message/content`；数组内容取第一个文本块 `/message/content/<i>/text`；`custom_message` 同理使用 `/content`；compaction/branch summary 使用 `/summary`。显式 `field` 按 JSON Pointer 解析，只接受保存的字符串。P1 用统一的字段迭代器替换。
- **details 结构化但不带正文。** `CapsuleDetails` 的冻结字段均已填充；`snapshotId` 是会话 ID、分支头、水位、recipe 和 shown spans 的规范 JSON 的 SHA-256 前 12 位十六进制。`counts` 基于原始分支近似（没有编辑投影）：saved/effective 相同、live 从切点起算、quoted 按显示跨度去重、index-only 为余数。P1 用真实有效历史替换这些计数。
- **P0 reader 读取整字段。** 没有 `offset`/`length`/`full`/cursor/run budget；工具结果正文就是保存字段的完整字符串，`details` 只带地址、长度和 `complete:true`。P3 会整体替换为有界窗口、游标和累计预算；P0 不是为了日常安装使用。宿主测试另外用 40,000 字符的单行用户文本验证了续接引用的 grapheme 对齐截断与整字段逐字回读。
- **失败路径是硬约束。** 钩子把所有构建错误和 abort 都收敛为 `{cancel:true}`，因为向宿主返回空值会触发默认模型摘要。P0 暂不做用户可见的错误通知；上报在后续阶段补，不能反过来破坏 cancel 语义。
- **测试注入点只用于失败测试。** `registerContextIndex(pi, { buildCapsule })` 允许 `tests/host.test.ts` 注入一个必失败构建器，验证真实宿主上的 cancel 行为；`index.ts` 走默认构建器，没有环境变量或生产开关。
- **宿主测试的临时设置。** 临时 agentDir 的 `settings.json` 把 Pi 自己的 `compaction.keepRecentTokens` 调成 2,000，只用于让合成历史产生可压缩前缀；这不是本插件设置文件，插件在 P0 仍只使用默认值。

### 2.6 P1 实现决定

- **快照一次捕获，身份与位置分离。** `captureSource` 复制 `getEntries/getBranch`，固定 `headId`、`watermarkId`、文件序 `order` 和分支序号。`order` 只用于展示；成员关系一律查 `branchIndex`。旧快照在追加和切树后保持不变（`tests/source.test.ts`）。
- **影子投影保持 Pi 语义。** 分支上的 compaction 替换为无文本 custom 节点后调用 `buildSessionProjection`，因此 `replacement:null`、tail 内编辑和检查点编辑的行为与宿主一致；投影只用于确定有效性和投影消息，正文地址仍从存储条目枚举。
- **编辑指向存储条目。** 有效记录同时保存 `entry`（owner）与 `storageEntry`（最新 edit）；`RecordInfo.contentStorageId` 和 `primaryField` 指向 `/replacement/...`。`effectiveFields` 只合并 replacement 内容字段与原记录的 content 之外字段（如 toolResult 的 `nestedCalls`），同一字段视图服务摘录、搜索与读取。
- **I/E/X 与 live 严格按成员集合。** `saved` 为全文件 message/custom_message 数；`effective` 为当前分支有效集；`outside` 为离支记录。守恒式 `saved = effective + excluded + outside` 在测试中直接校验。`live` 由切点分支序号决定，不使用 ID 水位。
- **计数口径。** `counts.quoted/indexOnly` 仍由渲染器在 P2 填充；P1 的薄渲染器以 `effective - live - quoted` 计算 index-only。
- **检查点编辑下界。** 最新被编辑的 compaction 节点之后才进入 `history` 候选；其前记录仍是有效档案，可搜索、可显式读取，但不作为新续接包候选。
- **切点按当前上下文窗口计算。** 用户轮从最新 compaction 的保留范围起算，避免把已摘要的旧轮次重新当作 live；tail 上限按设计 `min(16000, 0.25W)` / overflow `min(8000, 0.15W)`，超限时向前找最近的合法消息/工具边界，绝不从孤立 `toolResult` 开始。没有可摘要前缀时返回失败，钩子转 `{cancel:true}`，不写空摘要。
- **token 估算统一为 3 字符/token。** `src/budget.ts` 集中全部容量常量与消息内容字符估算（含 toolCall 参数和图片 4,800 字符）；未知窗口回退到基础 cap，不让 0 窗口把所有内容判为超限。
- **字段类型保守。** `scalar` 覆盖数字、布尔、null 及 nested call 的 `status`；`argumentsBytes` 为标量字段，`error` 为结果字段；`/message/details/**` 不进入字段视图（设计 §7.2 第 5 条）。
- **契约修订已同批落地。** `Observation.nestedIndex?` 与 `CapsuleObservationRef.nestedIndex?` 已加入 `src/model.ts`，设计 §6.4 已同步并注明修订来源。

### 2.7 P2 实现决定

- **候选先于预算。** `makeCandidates` 只产生固定候选与升级级别，不读预算；分配器只决定级别深度。U 的首条用户与最近三条、W 的最新助手与最新错误、以及计数行/操作行都以 `Span` 或生成行表示，正文不复制。
- **Bcap 与 B。** `Bcap=min(viewMaxChars,max(2400,floor(0.06W)))`；完整候选成本 `neededChars` 通过“级别耗尽”自然体现，`B=min(Bcap,neededChars)`。faux 窗口 128,000 的实际 cap 为 7,680；P0 的 12,000 断言已改。
- **升级粒度是 192 字符。** 长文本先保底前缀，再合并首块+末块，然后按得分顺序给中段块加 192 字符切片；分配器可在字符级接近 cap，而不是只能整块跳。最终长度仍以渲染为准，超出时按接受顺序逆序回退。
- **保底是种子，不进回退栈。** 首条用户/最近三条各 160、最新助手 256、最新错误 128 在任何加预算前写入；回退只弹后续接受的升级。2,400 窄端测试直接校验保底可容纳。
- **minima 不因“更深级别字符更少”而被替换。** 首块/末块级别会与保底前缀合并；测试显示首条用户在任何深度都 ≥160。
- **W 的计数行采用标签内联。** 结果正文里的 `N pass / M fail` 原句进入 `R e:<id> | <command> | reported: <原句>` 标签，正文不重复；没有计数行时仍渲染首尾各约 400 字符的正文。
- **nested 错误引用其 error 字段。** 同一父结果既可能承载嵌套错误，也可能承载聚合输出；二者地址不同，W 保留两个 R 候选，N 分别合并。嵌套错误不把父正文误报为错误原文。
- **N 的合并键是 `(operation, path/command)`。** 不按工具名区分，三次 `edit src/x.ts` 合并为一行 x3；latest 引用带 `#nestedIndex`。参数被丢弃时输出“参数已省略（N 字节）”；错误行追加 ` (error)`。计数片段附 `call=e:<owner>[#i]` 与 `result=e:<id>`。
- **输出按源顺序，导航按优先级。** U/W 组内按文件序排列；N 保持“最近/相关操作 → 计数 → 长文标题”的优先级顺序。W 生成的计数片段与 N 计数片段按 result ID 去重，只出现一次。
- **相关旧用户用消息级 BM25；中段块用条内 BM25 + 0.25 heading + 0.15 list。** 中段按章节轮转，没有查询命中且没有标题时按段落序等距抽样（受剩余预算约束）。
- **自我回声标记已定义。** `SELF_ECHO_BEGIN/END` 为固定机器标记；分块与 W 摘录在索引时剪除标记区间，原始字段与显式读取保持全字节。P3 在读取结果正文外套这两个标记，并在 codemode 父正文中真正生效。
- **cover 暂时不提 list。** 当前工具只有 `read`，cover 的读取提示也只写 `read`；P3 实现 `list/search` 后再补 “Browse”。这是刻意避免在 P2 alpha 中宣传不可用动作。
- **细节不带正文。** `CapsuleDetails.shown` 只有跨度，`observations` 只有 callId/resultId/nestedIndex，`usedChars` 为最终长度；已测 `JSON.stringify(details)` 不含用户原文。
- **真实宿主连续压缩。** 同一 `AgentSession` 第一次压缩后追加 6 个用户轮再压缩；第二次仍引用首条用户原文、live 用户不被重复引用、两次均无摘要模型请求、首个用户记录在重开文件后仍可读。

### 2.9 P3 实现决定

- 一个 schema，三个动作，组合在入口校验。list 有 ref/role/scope/cursor，search 有 query/match/role/scope/cursor，read 有 ref/field/offset/length/full/cursor；full 与 offset/length 同传、cursor 与定位参数同传、空 query 都是错误路径。
- 普通部分结果不是错误。分页、窗口容量截断、扫描 3 秒时间片、full 到达 48K 上限都返回 isError:false、details.incomplete:true 和可执行 cursor；只有参数冲突、缺失 ref/字段、无效 cursor/设置和取消走错误路径。
- 结果帧计入上限。list/search 4,000、普通 read 12,000、full 48,000 是整个工具结果的上限；分页器从整页开始逐项减少直到 header、正文、cursor 和 run 剩余行一起装入 grant。read 用 360 字符帧预留起算，再按实际长度回缩。
- run 剩余字符用不动点求解。footer 的 run remaining 由 budget.remaining + grant - text.length 得到，长度又受数字影响；最多迭代 4 次收敛，details 的 runRemainingChars 在 settle 后取账本真值。
- 预算先预留后 await。参数/引用解析和候选准备完成后、第一次 abort 检查前同步 reserve(outputCap, headroom)；grant <= 512 直接返回短诊断且不建预留；取消或异常 release，取消退回调用额度；结算按最终 UTF-16 长度，未用额度退回。账本绑定 run 对象，旧预留不写入新 run。
- 上下文余量。usedTokens 取 getContextUsage().tokens；为 null 时用投影消息内容字符/3 估算，图片按 4,800；reserveTokens=min(8192,model.maxTokens)+ceil(0.05W)；headroomChars=max(0,floor(3*free)-inFlightChars)。未知窗口返回 Infinity，只受输出 cap 约束。
- 游标是版本化自足状态。base64url JSON 存 v/action/session/head/watermark、原动作参数和续点。分页 cursor 用旧 head 重建受限快照；追加只增加文件尾部，旧 head 仍是当前分支祖先，旧水位过滤新记录。切树（旧 head 不在当前分支）或水位后出现针对可见记录的新 context_edit 时明确失效；session scope 不因切树失效。read cursor 只要求存储条目和字段仍存在。
- 查询索引一次构建、按边界缓存。单个缓存条目按 session|head|watermark|scope|role 键保存字段/块/BM25；命中与分页在同一快照上确定性重算。词法排序为 BM25 分数、完整字面命中 +0.25、记录时间与字段偏移 tie-break；先每个 owner 取最佳命中，再补同 owner 的其余命中。
- 字面检索返回真实偏移。大小写不敏感匹配只用于定位；返回的 start/end 指原文。Unicode 大小写改变长度时退化为逐位置比较，不信任平移后的偏移。3 秒时间片按字段检查，cursor 指向首个未返回命中或当前扫描位置。
- 字段/标题导航。list ref 列出存储字段、长度、kind 和可执行 read；长字段额外列最多 12 个标题及偏移。被编辑记录同时给出 effective: source=e:<edit> read: ...，edit 记录标注 revision of e:<target>；显式 read 仍读原存储地址。
- 自我回声真正剪除。所有 reader 结果正文外套固定标记；分块/BM25/字面扫描在索引时排除标记区间。reader 正文自带 cursor 与 run 剩余，codemode 拿不到 details 时仍可从正文续读。
- 设置失败不破坏 cancel 语义。invalid pi-context-index.json 在压缩构建时抛错→{cancel:true}；工具调用返回 isError:true 的设置错误。before_agent_start 若读不到有效设置，先用默认值建账本，工具执行时再报错。
- cover 已改为 Browse list。三动作落地后，第三行给出 Browse: context_index {"action":"list"}。
- 尚未验证的 P3 项。真实 TUI 下的展示、codemode 脚本内并发读取的真实工具管线、200K 字段搜索性能留到 P4/P5；单元层已覆盖 21K 深字段、37K full、并发共享账本与字号上限。

### 2.10 P4 进行中记录（交接重点）

- **threshold 已完成。** 用 faux 小窗口（3,000 tokens，maxTokens 1,000）、Pi compaction.reserveTokens:500 / keepRecentTokens:2000 触发；插件路径返回 capsule，session_compact.reason=threshold、fromExtension:true、willRetry:false，provider 摘要调用为 0；下一次 prompt 的请求正文包含上一条 compaction summary。
- **overflow 已完成，但触发顺序有坑。** 第一次尝试用小窗口 + 显式 stopReason:"error" / "prompt is too long" 时，Pi 在 prompt 提交前的 _checkCompaction 先用历史 usage 触发了 **threshold** 压缩，导致测试拿到的不是 overflow。最终测试改为**大窗口 + reserveTokens:0**，只让显式 overflow 错误触发 overflow 分支；结果 session_compact.reason=overflow、willRetry:true，失败尝试被 context edit 省略，重试请求包含 capsule，provider 调用 2 次且无摘要请求。下一窗口做其他自动压缩测试时先确认前置 threshold 不会抢先触发。
- **P4 剩余工作。** compact-all（空 firstKeptEntryId 的真实 append/projection/fork 行为）、restart/切树/fork/四种 context edit、连续 10 次压缩、12 题合成曝光（不是模型答案）、10K/50MB 性能基准、codemode 8 条状态迁移、真实 TUI 与三个任务试用。真实 TUI/任务需要用户环境，合成测试不能替代。
- **交接时的仓库状态。** 全部改动尚未提交（AGENTS 禁止无授权提交）；bun run typecheck、bun run typecheck:tests、bun test（122/905）全部通过。新增/修改文件见 git status。
- **下一窗口的测试入口。** 真实宿主测试用 tests/host.test.ts 的 createRoot/createProvider/createLoader/createSession；settings 通过 process.env.PI_CODING_AGENT_DIR 指向临时 agentDir，afterEach 恢复。小窗口 threshold 用 createProvider(agentDir,{contextWindow:3000,maxTokens:1000})。overflow 用默认 provider + compaction.reserveTokens:0。

### 2.11 下一步（P4）

1. ~~真实宿主 threshold/overflow~~ **已完成（§2.10）**：reason 正确、同一插件路径、下一轮上下文含 capsule、零摘要请求。
2. keep:N、compact-all（空 firstKeptEntryId）、单轮过大、工具调用/结果边界在真实 AgentSession 上的行为。
3. 重启、切树、fork、context edit 四类编辑路径；e:<entryId> 在同文件中的解析与 not_found。
4. 连续 10 次压缩；检查早期目标、中段更正、旧计数仍可读，details 体积不随历史数组增长。
5. 固定 12 题合成曝光检查 + 三个真实任务试用（真实任务与 TUI 需要用户环境，记录为待执行）。
6. 10K 消息 / 50MB 混合会话基准；先消除重复投影/分词，再评估缓存。
7. 8 条 codemode 状态迁移测试与真实 codemode 环境调用。

## 3. 已核实的宿主事实（Pi 1.4.0）

以下结论来自本地安装源码；P0 已用真实会话复核其中的关键路径。

| 事实 | 位置 |
|---|---|
| 压缩事件含 `preparation`、`branchEntries`、`reason: manual/threshold/overflow`、`signal` | `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:601` |
| 钩子可返回 `compaction{summary, firstKeptEntryId, tokensBefore, details, usage}` 或 `cancel:true` | 同文件 `:1137` |
| 扩展提供 compaction 时跳过默认摘要器；`cancel` 在默认路径前终止 | `dist/core/agent-session.js:2253` |
| 手动压缩入口为 `AgentSession.compact(customInstructions?)` | `dist/core/agent-session.d.ts:726` |
| `buildSessionProjection` 已导出，`ctx.sessionManager` 提供 `getEntries/getBranch` | `dist/core/session-manager.d.ts:178`、`:200` |
| `ctx.getContextUsage()` 可用 | `dist/core/agent-session.d.ts:893` |
| `exposure:"direct"` 合法且默认激活 | `dist/core/extensions/types.d.ts:395`、`:453` |
| `createAgentSession` 可注入 `modelRuntime`/`model`，用于测试 provider 替身 | `dist/core/sdk.d.ts:10`；`ModelRuntime.registerNativeProvider` 在 `dist/core/model-runtime.d.ts` |
| compaction entry 记录 `fromHook`，`session_compact` 事件记录 `fromExtension` | `dist/core/extensions/types.d.ts:616`、`:634` |

P0 真实会话复核（2026-10-31，`tests/host.test.ts`）：

- 扩展返回 `compaction` 后，宿主跳过默认摘要，持久化 compaction entry 的 `fromHook:true`，并发出 `session_compact.fromExtension:true`；压缩期间测试 provider 的调用次数为 0。
- 钩子返回 `{cancel:true}` 时，`AgentSession.compact()` 以 “Compaction cancelled” 失败，不追加 compaction entry，也不调用默认摘要；即使预先排队一个 provider 回复也未被消费。
- 压缩后的 `buildSessionProjection().messages` 为 `compactionSummary` 加从 `firstKeptEntryId` 起的原样 tail；从会话文件重新 `SessionManager.open` 后投影一致。
- 落盘文件中的 `e:<entryId>` 引用可在新 `AgentSession` 中由 `context_index read` 解析，工具结果与该字段保存的原文逐字相等；继续对话只产生工具调用和最终回答两个正常请求。
- 真实扩展通过 `DefaultResourceLoader.additionalExtensionPaths` 从 `index.ts` 加载，扩展入口的无扩展名 `./src/host` 导入和 TypeBox schema 在 jiti 加载路径下可用；失败测试再用内联工厂注入必失败构建器。
- 测试 provider 用 `fauxProvider()` 与 `ModelRuntime.registerNativeProvider`，配合临时 `authPath`、`modelsPath:null`、`refreshOnCreate:false`，全程无网络。`hasConfiguredAuth` 为 false 时 `checkAuth` 仍通过，`prompt()` 可运行。
- `createAgentSession({ noTools:"all" })` 会用空 allowlist 过滤掉扩展工具；宿主测试改用 `noTools:"builtin"`，让 `exposure:"direct"` 的扩展工具保持激活。

## 4. 已知风险与待验证项

| 项 | 影响 | 处理 |
|---|---|---|
| 测试类型检查 | 已处理：独立 `tsconfig.tests.json` 覆盖 `tests/`，`@types/bun` 固定 1.4.4，CI 与本地都执行 `bun run typecheck:tests`。首次启用时发现并修正了 `tests/fences.test.ts` 捕获组可能为空的类型错误 | 新增测试继续放在 `tests/`，不要绕过该配置 |
| 根 TypeBox 1.3.32 与 Pi 内置 1.3.27 双副本 | 工具 schema 的类型推断可能出现兼容摩擦 | P0 已通过：工具注册、真实模型工具调用和 `typecheck` 均正常。P3 增加更复杂 schema 时继续验证；若报错再对齐 1.3.27 |
| ~~P0 切点来自宿主~~ | **已处理（P1）**：`src/cut.ts` 取代宿主切点，`keepUserTurns` 与 `keep:N` 生效；真实宿主测试验证 `keep:2` 与 tail 边界 | 不再适用 |
| ~~P0 续接包只引用用户原文~~ | **已处理（P2）**：U/W/N 候选、保底、真实分配与围栏修复全部落地；2,400/7,680/12,000 与围栏标记测试通过 | P4 用真实任务验证选择质量 |
| 胶囊调参尚无真实语料 | P2 的份额、保底、192 字符粒度与中段评分来自设计，未在大规模真实会话上校准 | P4 的 12 题与三个任务试用后再调；调整时提升 `SELECTOR_VERSION` 并更新 golden，不建第二套选择器 |
| ~~P0 reader 读取整字段~~ | **已处理（P3）**：6,000/12,000/48,000 上限、`full`、游标、run budget、上下文余量与 `budget_exhausted` 均已落地；真实宿主 8 次调用上限通过 | 不再适用 |
| 检索索引无长期缓存 | 每次词法搜索从头枚举字段并分块；大会话冷查询可能超过 200ms | P3 只缓存最近一次边界；P4 基准先测，必要时做增量或复用同快照索引，缓存不得改变排序 |
| 真实 TUI 与真实任务尚未验证 | 结果行可读性、通知、12 题与三个任务的目标保持尚未在真实环境检查 | P4/P5 手动执行；记录失败与修复，不以合成测试替代 |
| 设置错误无用户通知 | 压缩失败静默取消，工具错误只在该次调用可见 | 保持 `{cancel:true}` 前提下在 P4/P5 补非阻塞通知；通知本身必须捕获 |
| ~~P0 details 计数为原始分支近似~~ | **已处理（P1）**：`saved/effective/live/outside` 由快照与有效历史计算，测试校验 `saved = effective + excluded + outside`；`quoted/index-only` 仍由 P2 渲染器填充 | P2/P4 继续校验 Live/Quoted/IndexOnly 互斥 |
| P0 压缩失败无用户可见上报 | 静默取消只保证不触发默认摘要，调试信息不足 | 后续阶段在保持 `{cancel:true}` 的前提下补通知；通知自身也必须被捕获 |
| codemode 下每条嵌套调用的输出不可寻回 | 脚本不 `return`/`text()` 的命令输出，模型与会话都看不到；`only` 模式下每一次读取都经脚本，影响面更大 | **已确认的产品级已知限制**（2026-11-02）。0.1.0 只保证脚本聚合输出（R2）；胶囊（P2）与 README（P5）提示「要保留就给脚本返回值」；不监听宿主事件、不写副本、不改 Pi 上游。见[审阅稿 §0](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md) |
| codemode 聚合输出被宿主截断 | 默认 10,000 token（约 40,000 字符）后只留头尾各 20,000 字符，全文在临时文件；再压缩只能引用已保存正文 | 只索引宿主保存的正文，临时路径不入索引；不承诺全文。P2 文案与 P4 测试覆盖；需要全文时由脚本直接 `return` 关键片段 |
| 测试 provider 来自 pi-ai faux | `@earendil-works/pi-ai` 是宿主依赖而非本包直接依赖；CI 干净安装路径尚未在 Ubuntu 验证 | 锁文件固定 Pi 1.4.0 的依赖树；P0 宿主测试已在 Windows 通过，合并前在 CI 跑一次 |
| `compact-all` 的空 `firstKeptEntryId` | `CompactionResult.firstKeptEntryId` 类型为非空字符串；`appendCompaction` 用 `??`，空串会原样保存，投影按 ID 匹配不到任何记录，可能得到“只留摘要”的效果。宿主自身的 retain-none 路径按文档写入压缩条目自身 ID，重复压缩和 fork 重映射是否接受空串尚未验证 | P1 已实现 `keep:0` 的空串切点（单元测试覆盖）；P4 必须在真实宿主上验证 append/projection/fork 行为，必要时改用宿主明确支持的方式并在此记录 |
| 真实宿主测试污染日常环境 | 可能读写用户真实会话或设置 | 一律使用临时 cwd、临时 agentDir 和临时设置；不读取 `~/.pi/agent`。P0 宿主测试已验证 |
| Windows 开发、Ubuntu CI | 路径分隔符、换行和进程行为可能不同 | 测试保留 CRLF 夹具；宿主测试已在 Windows 通过，Ubuntu CI 尚待运行，失败时按平台修正，不跳过 |
| README 与 AGENTS 的当前状态行 | README 仍称 `index.ts` 在前 P0 保持惰性，AGENTS 仍称工作区骨架；与 P0/P1 完成状态不一致 | 状态只写入本文；P5 发布时同步 README/AGENTS |
| P1 投影成本 | 每次建包对整条分支调用一次 `buildSessionProjection` 与字段枚举；大会话的冷建成本尚未测量 | P2 复用同一快照与投影结果；P4 性能基准先消除重复投影/分词，再考虑缓存 |
| 冻结计划的状态行已过时 | 计划仍称项目尚未创建 | 不改计划，以本文第 1 节说明为准 |

## 5. 日常验证

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun run typecheck:tests
bun test
bun test tests/host.test.ts
npm pack --dry-run
```

`tests/host.test.ts` 已在 P0 建立；`tests/lifecycle.test.ts` 属于 P4，尚未建立。真实会话与模型费用对照只手动运行，不进自动测试。

## 6. 变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-31 | 建立 0.1.0 工作区基线：纳入骨架、冻结设计/计划、legacy 镜像、合成原型资产、测试和文档；忽略依赖、原型运行产物、审查压缩包、备份和打包 tarball |
| 2026-10-31 | 新增本文，作为实现期间的进度与交接入口；`AGENTS.md`、`docs/README.md` 和 CHANGELOG 指向本文 |
| 2026-10-31 | 启用测试类型检查：新增 `tsconfig.tests.json`、`@types/bun@1.4.4` 和 `typecheck:tests` 脚本，CI 增加对应步骤；修正 `tests/fences.test.ts` 的捕获组空值类型错误 |
| 2026-10-31 | 新增待审文档 `docs/reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md`：把「codemode 脚本与执行结果可索引、可寻回」拆为 R1–R4，记录 F1–F12 宿主事实与 C1–C7 冲突、A/B/C/D 四条路径、E1–E6 修订、D1–D6 待拍板决定与新增测试行 |
| 2026-10-31 | 核实 codemode 调用形态：两种 `codemode.mode` 下 `context_index` 均可调用、guideline 位置不同、嵌套结果不入库、参数 >8KB 被丢弃、本工具回声进入父结果正文；差异与修订点见 §7 |
| 2026-10-31 | 完成 P0 真实宿主薄闭环：`index.ts` 注册 `exposure:"direct"` 的 `context_index read` 与 `session_before_compact`；新增 `src/host.ts`、`src/reader.ts`、`tests/host.test.ts`；覆盖真实 `AgentSession.compact()`、持久化 compaction、宿主 summary+tail 重建、重开会话后按生成引用逐字回读、长文本有界截断与整字段回读、压缩零 provider 请求、继续对话两个正常请求、构建失败 `{cancel:true}` 阻止默认摘要。全套 29 测试通过 |
| 2026-11-02 | 需求方确认 codemode 范围：0.1.0 只需索引并寻回脚本聚合输出，不要求每条嵌套调用的执行输出。审阅稿改为已确认结论（路径 A；D6 不批准；D2–D5 按建议进入实现），同步更新本文 §2.1/§2.2/§2.6/§4/§7/§8 与 `docs/README.md`；设计 §6.4/§7.1/§8.2 的修订与 P1 契约改动同批，不在本轮 |
| 2026-11-02 | P4（进行中）：真实宿主 threshold 与 overflow 测试通过。threshold 用小窗口（3,000 tokens / maxTokens 1,000 / reserve 500）触发；overflow 用默认大窗口 + reserveTokens:0，只让显式 "prompt is too long" 错误触发 overflow 分支，避免 prompt 前置 threshold 抢先。验证 `session_compact.reason`、`fromExtension`、`willRetry`、失败尝试被 context edit 省略、重试请求含 capsule、无摘要请求。全套 122 测试 / 905 断言通过。
| 2026-11-02 | 完成 P3：`src/reader.ts` 增加三动作执行器、版本化游标、字面扫描、字段/标题导航、run 预算与上下文余量；`src/host.ts` 接入设置文件、`before_agent_start` 账本与三动作 schema；reader 结果套自我回声标记，cover 改 Browse list；新增 settings/reader/host 测试。全套 120 测试、885 断言通过 |
| 2026-11-02 | 完成 P2：新增 `src/chunks.ts`（围栏感知分块）、`src/search.ts`（tokenizer + BM25）、`src/observations.ts`（直接/nested/bash 统一观测）、`src/candidates.ts`（U/W/N 候选与保底）、`src/render.ts`（Bcap、55/30/15、借用/回退、围栏与省略标记）；`src/host.ts` 改用真实 capsule；`src/model.ts`/`设计 §6.4` 增补 `Observation.argumentsBytes` 与 self-echo 标记口径；新增 chunks/search/capsule 测试与真实宿主连续两次压缩测试。全套 95 测试、713 断言通过 |
| 2026-11-02 | 完成 P1：新增 `src/source.ts`（不可变快照、影子投影、I/E/X 与 live）、`src/fields.ts`（唯一字段视图、JSON Pointer、nestedCalls/replacement）、`src/cut.ts`（keep:N、tail/overflow 上限、工具边界）、`src/budget.ts`（容量常量与 3 字符/token 估算）；`src/reader.ts` 改为按存储地址解析并新增 grapheme 窗口；`src/host.ts` 接入真实切点与有效历史。契约新增 `Observation.nestedIndex`/`CapsuleObservationRef.nestedIndex`，设计 §6.4 同步。新增 `tests/fixtures/entries.ts` 与 source/fields/cut/reader 测试；真实宿主新增 `keep:2` + 编辑替换测试。全套 70 测试、410 断言通过 |

## 7. codemode 调用形态核实（2026-10-31 核实；2026-11-02 范围确认）

本节回答两件事：0.1.0 预期的形态在 Pi 的默认工具模式与 codemode 模式下是否一致；插件能否正确读取 codemode 的工具调用。**2026-11-02 需求方已确认范围：0.1.0 只需索引并寻回脚本聚合输出（R1–R3），不要求每条嵌套调用的执行输出（R4）；路径 A，不走事件捕获。**范围结论、决定与落点见[codemode 可索引/可寻回审阅稿](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md)；设计的契约修订与 P1 契约改动同批，本轮只记录决定。结论基于 Pi 1.4.0 安装源码 + 真实 in-process 宿主探针（临时 cwd/agentDir/sessions，`createCodemodeExtension()` 注入，脚本混合 `context_index` / `bash` / `write`（20KB 内容）/ 不存在的 `read`），`codemode.mode` 取 `on` 与 `only` 各跑一次。探针是一次性脚本，未入库。

### 7.1 已核实事实

| 事实 | 证据 |
|---|---|
| `context_index` 以 `exposure:"direct"` 注册后，两种模式下都可从脚本调用；`only` 模式下它不出现在工具声明中（声明数 1，仅 `codemode`），但脚本调用成功（`status:"ok"`） | 探针 `declaredTools`/`activeTools`/`nestedCalls` |
| `on` 模式：`context_index` 仍作为直接工具声明，其描述尾部追加 `Codemode: tools.context_index(args) resolves to a string.`；插件 guideline 进入系统提示词 rules | 探针 `contextIndexDescription`、`rulesHasPluginGuideline:true` |
| `only` 模式：直接工具声明被隐藏，插件 guideline 改由 `codemode` 描述携带（`codemodeDescriptionHasPluginGuideline:true`），受 `codemode.inlineBudget`（默认 3000 估算 token）与 cheapest-first 编目选择约束 | 探针 `codemodeDescriptionChars:5443` |
| 一次 `codemode` 调用只落一条 `toolResult` 条目；嵌套调用记在该条目的 `message.nestedCalls={calls,complete}`，**嵌套调用的输出不入库**（源码注释 “Nested results are not persisted”） | `dist/core/nested-tool-calls.js`；探针 `separateNestedEntries:1` |
| 脚本里 `tools.bash` 的 stdout 未出现在会话任何字段中（脚本没把它写进返回值时，模型与会话都看不到） | 探针 `bashOutputInResult:false` |
| 嵌套参数截断：单次 >8192 字节或累计 >32768 字节则只留 `argumentsBytes`；超过 256 条调用丢弃；错误截到 500 字符；出现截断或存在未完成调用即 `complete:false` | `NESTED_CALL_LIMITS`；探针 write 20,031 字节 → `hasArguments:false, argumentsBytes:20031, complete:false` |
| `codemode` 工具结果的 `details.calls[].args` 是 **JSON 预览字符串**（`previewArgs` 截到 200 字符），不是结构化字段；它也持久化 | `dist/extensions/codemode/execute.js` `ARGS_PREVIEW_CHARS`；探针 `writeDetailArgsShape:"string:...`（截断的 JSON） |
| 嵌套调用 id 形如 `tool:<ts>:<rand>/N`，不是会话条目 ID；嵌套调用的“结果条目”只能是父 `codemode` 结果条目 | 探针 `nestedCalls[].id` |
| 插件自身读取结果会原样进入 `codemode` 结果正文（脚本 `return` 它时） | 探针 `selfEchoInResult:true` |

### 7.2 与 0.1.0 预期的差异（1–6 已定，7–9 为实现注意）

以下 1–6 为 0.1.0 的处置决定；其中 3–6 按审阅稿建议定案，需求方未逐条答复，细节以审阅稿 §6/§7 为准。7–9 是实现时要注意的边界，不单独构成需求。

1. **“嵌套结果不存在”与 W/N 候选前提的边界已定。** 设计 §8.2 的“最近错误/命令结果”与 §7.1 的“工具结果文本”在 codemode 会话里只有父条目正文一个来源；单条嵌套调用的输出、退出码、测试计数都不入库（除非脚本自己打印）。0.1.0 的 W/N 只取父正文与嵌套 `error`/`status`，不为不存在的单条输出伪造行。原型 `catalog.mjs` 读 `nestedCall.output/text` 是旧假设，不能照搬。
2. **调用/结果配对退化。已定：加嵌套序号。** 直接工具靠 `toolCallId` 配对；嵌套调用没有独立结果条目，所有嵌套调用共享父 `resultId`。冻结契约 `Observation{callId,resultId?}` 与 `CapsuleObservationRef{callId,resultId?}` 无法表达“第 N 条嵌套调用”，0.1.0 增加 `nestedIndex`（原型同名）；`resultId` 固定为承载嵌套记录的父结果条目，配对键为 `(resultId,nestedIndex)`。设计 §6.4 与 P1 契约改动同批更新。
3. **写入类请求可能丢路径。已定：显式降级。** `write`/`edit` 参数超过 8KB 时只留 `argumentsBytes`，路径随之消失；实测 20KB 写请求正是这种形态。设计 §8.2 的 `(operation,path)` 合并与 §4.1 的“文件曾收到什么操作请求”在 codemode 下会静默少行。0.1.0 输出「参数已省略（N 字节）」一行，不索引 `details` 预览；legacy 的“参数被丢即跳过”不再沿用。
4. **自我回声排除规则失效。已定：机器标记 + 剪除。** 设计 §6.5 按“本工具回声”登记派生记录，默认实现会按 `toolName==="context_index"` 判定。codemode 下回声藏在父结果正文里，按 tool 名判定不到，也无法从正文切分；若整条父结果标记为派生，会连带丢掉同脚本的 bash/测试证据。0.1.0 采用：读取结果正文加固定机器标记，建索引时在 codemode 父正文里剪掉标记区间，保留同脚本其他输出；P2 写测试落地。
5. **`details` 不是可靠恢复通道。已定：不索引。** `codemode` 的 `details.calls[].args` 是截断的 200 字符 JSON 预览，属 Pi 内部 TUI 数据；把它当作嵌套参数的第二来源会让 reader 对“保存字段”的语义变得不确定。0.1.0 的字段迭代器显式跳过 `/message/details/**`，`details` 也不作为 reader 的字段来源；只在 `list ref` 的结构清单里标注为 Pi 内部预览。
6. **`only` 模式下胶囊里的指令形状不同。已定：模式中立文案。** 胶囊与 guideline 文案写的是 `context_index {...}`；在 `only` 下模型没有该工具的声明，必须写脚本调用。0.1.0 文案改为“直接调用或经脚本调用”，不假设工具已声明。
7. **正常部分结果语义更关键。** 嵌套调用 `isError` 会让脚本里的 `await` 直接 reject（未 catch 则整个脚本失败，父结果 `isError:true`）。设计“正常分页/截断不算错误”的规则在 codemode 下不仅是语义选择，也是可用性前提；反之参数错误会打断用户脚本，需要在文案里提示用 `allSettled` 或先 `list`。
8. **运行预算的并发面变大。** 一个脚本可并发发多次读取（`Promise.allSettled`），嵌套调用走同一条工具管线；设计要求的“第一次 await 前同步预留、在途额度计入 headroom”正好覆盖，但必须有 codemode 并行夹具，不能只测两个直接调用。
9. **性能与夹具形状。** codemode 会话把整段脚本放在 `arguments.code`，单条助手消息可达数十 KB，嵌套调用又多，冷建索引成本与字段数量明显高于直接工具会话。计划的 10K/50MB 基准与合成夹具目前不含这种形状。

### 7.3 下一步（按阶段）

- **不再做**：R4、路径 B（监听 `tool_execution_end` 写 custom 条目）、Pi 上游改动。见审阅稿 §5/§7。
- ~~P1（`fields.ts`）~~ **已完成**：字段迭代器覆盖 `/message/nestedCalls/calls/<i>/{arguments,error,status}`，`argumentsBytes` 作为标量字段；跳过 `/message/details/**`（`tests/fields.test.ts`）。
- ~~P1（`source.ts`/契约）~~ **已完成**：`Observation.nestedIndex?`、`CapsuleObservationRef.nestedIndex?` 已加入契约，`resultId` 表示承载嵌套记录的父结果条目；设计 §6.4 已同步。
- ~~P2（`observations.ts`/`candidates.ts`）~~ **已完成**：嵌套观测与直接工具产出同一结构；参数被丢弃时输出“参数已省略（N 字节）”；W/N 只用父正文与嵌套 `error`/`status`（`tests/capsule.test.ts`）。
- ~~P2（`render.ts`/胶囊）~~ **部分完成**：自我回声标记与分块剪除已实现并测试；胶囊/guideline 的模式中立措辞已改。仍需在 P3 真正把读取结果套上标记，并在 P5 README 写明“脚本内嵌套调用的输出不单独保存；要保留就在脚本里 `return`/`text()`”。
- ~~P3（`reader.ts`/`host.ts`）~~ **已完成**：所有 reader 结果正文加机器标记；正文 footer 自带 cursor 与 run 剩余，`details` 不可见时（codemode）仍能续读。
- P4：新增 8 条 codemode 状态迁移测试——参数超 8KB 的嵌套写请求、`complete:false`、脚本内并发读取共用 run 预算、脚本 `return` 读取结果后回声被剪除、`only` 模式下胶囊文案仍可执行、嵌套错误文本可引用且不算成功、嵌套命令输出缺失时不伪造结果行、聚合输出超默认上限只索引已保存头尾。

## 8. 交接检查

- [x] 已读设计 §6.4 数据契约、§13 验收标准。
- [x] 已读计划的 P0 产出与退出条件。
- [x] 已确认 `node_modules/@earendil-works/pi-coding-agent` 为 1.4.0。
- [x] 已运行 `bun run typecheck`、`bun run typecheck:tests` 和 `bun test`。
- [x] 宿主测试使用临时 cwd 和 agentDir。
- [x] 每次有意义的变更后更新本文件；冻结设计只在有意修订时同批更新（P1 的 `nestedIndex` 已如此处理）。
- [x] 已读本文 §7 的 codemode 事实与已定修订项，再动手写 `fields.ts`。
- [x] 已读需求方 2026-11-02 的 codemode 范围确认：R1–R3 纳入，R4 不做，不按路径 B 设计。
- [x] 已运行 P1 全套检查：`bun run typecheck`、`bun run typecheck:tests`、`bun test`（70 测试 / 410 断言）。
- [x] 已用真实 `AgentSession.compact("keep:2 …")` 验证自有切点、编辑投影与按 `/replacement/content` 回读。
- [x] 已读 P1 实现决定（本文 §2.6），再动手写 `chunks.ts`。
- [x] 已运行 P2 全套检查：`bun run typecheck`、`bun run typecheck:tests`、`bun test`（95 测试 / 713 断言）。
- [x] 已读 P2 实现决定（本文 §2.7），再动手写 `reader.ts` 的三动作。
- [x] 已运行 P3 全套检查：`bun run typecheck`、`bun run typecheck:tests`、`bun test`（120 测试 / 885 断言）。
- [x] 已读 P3 实现决定（本文 §2.9），再动手写 P4 生命周期测试。
- [x] P4 threshold/overflow 已完成并记录于 §2.10；overflow 测试必须用大窗口 + reserveTokens:0，避免前置 threshold。
- [ ] P4 其余项（compact-all、restart/切树/fork/编辑、10 次压缩、12 题、性能、codemode、TUI/任务）。
- [ ] P5 打包与交付。
## 9. 下一窗口继续提示词（可直接粘贴）

```text
继续 pi-context-index 0.1.0。仓库就是当前工作目录；先读 AGENTS.md、docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md（尤其 §2.10 P4 进行中记录、§2.11 下一步、§4 风险），设计与计划是冻结输入，只有有意修订才同批更新并记录原因。不要提交、推送、打 tag 或发布，除非我明确授权。

当前状态：P0–P3 已完成；P4 进行中。`bun run typecheck`、`bun run typecheck:tests`、`bun test` 全绿（122 测试 / 905 断言）。新增文件未提交：src/{budget,fields,source,cut,chunks,search,observations,candidates,render}.ts 与对应 tests；src/{reader,host,model}.ts 有改动，设计 §6.4 已按 nestedIndex/argumentsBytes 有意修订。

先做 P4 剩余，按这个顺序：
1. 真实宿主 compact-all：session.compact("keep:0")，确认空 firstKeptEntryId 的 append/projection/reopen 行为与风险表一致；必要时改用宿主明确支持的方式并记录。
2. 真实宿主 restart/切树/fork/四种 context edit：SessionManager.open、manager.branch 或 session.navigateTree、SessionManager.forkFrom、manager.appendContextEdit；验证 e:<entryId> 跨追加/切树/fork 的解析、not_found、编辑替换/省略/检查点编辑。
3. 连续 10 次压缩：同一 AgentSession 追加足够历史让宿主 prepareCompaction 每次成立；检查首条用户原文、早期数字、中段更正、旧计数仍可读，details 体积不随历史数组增长，provider 摘要调用始终为 0。
4. 固定 12 题合成曝光检查：目标/更正 4、近期工作 3、历史数值/错误/文件 3、15K 第二窗口与 37K 深段各 1；断言实际 capsule/search/read 暴露了预期源跨度，不是只检查布尔答案。三个真实任务试用与真实 TUI 需要用户环境，先在文档记录为待执行，不要伪造结果。
5. 10K 消息 / 50MB 混合会话性能基准：脚本放 research/benchmark，输出本地不入库；测冷 capsule、冷搜索、热查询/读取，目标冷建 ≤2s、热 ≤200ms；先消除重复投影/分词，再考虑缓存，缓存不得改变排序或字节。
6. codemode 8 条状态迁移（见进度 §7.3）：参数超 8KB、complete:false、脚本内并发读取共用 run 预算、脚本 return 读取结果后回声剪除、only 模式文案、嵌套错误可引用且不算成功、命令输出缺失不伪造、聚合输出超限只索引已保存头尾。能注入 @earendil-works/pi-coding-agent 的 codemode 扩展就做真实 in-process 测试，否则用记录结构夹具并注明边界。
7. P5：README/CHANGELOG/设置示例、npm pack 清单、临时 agentDir 安装并跑一次压缩+读取；按需更新 AGENTS/README 的过时状态行。

重要坑：
- overflow 测试必须用大窗口 + Pi compaction.reserveTokens:0，只让显式 "prompt is too long" 错误触发 overflow；小窗口会先被 prompt 前置 threshold 抢走。
- 宿主测试的 settings 通过 process.env.PI_CODING_AGENT_DIR 指向临时 agentDir，afterEach 恢复；绝不读写真实 ~/.pi/agent。
- capsule 的 Bcap=min(viewMaxChars,max(2400,floor(0.06W)))；faux 128K 窗口对应 7680。minima 在 2400 必须放得下，失败会抛错→cancel。
- reader 结果正文带固定自我回声标记，断言用包含而非整串相等；run 预算 48000/8，before_agent_start 开账，session_start 清账，turn_start/压缩不重置。
- cursor 是版本化自足状态；追加保持旧水位，切树/新投影编辑失效。测试不要用 ID 水位近似成员关系。
- 每次有意义变更更新 PROGRESS；测试夹具只放合成数据，不写真实会话、真实文件名或绝对路径。不要用 Math.min(...array)/Math.max(...array) 处理候选列表。

完成后运行全部检查，更新 PROGRESS 的 P4/P5 状态、证据与残留风险，并给出下一步或交付总结。
```

