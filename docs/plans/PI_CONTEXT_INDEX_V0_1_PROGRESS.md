# pi-context-index 0.1.0 工作进度

- 版本：0.1.0（未发布）
- 最近更新：2026-11-02
- 状态：P0 真实宿主薄闭环完成；codemode 范围已确认（R1–R3 纳入，R4 不做）；P1 未开始
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
| 工作文档 | 完成。设计、计划、移植地图、宿主入门、外审与历史记录 |

### 2.2 未实现

- `list`/`search` 动作和完整 `read`（窗口、`full`、游标、运行预算）；P0 只有整字段读取。
- 自有切点策略、来源快照、有效历史投影、字段迭代器、编辑寻址（P1）。
- 续接包 U/W/N 候选、真实预算、长文本分块、观测提取和围栏渲染（P2）。
- threshold/overflow、重启、切树、fork、context edit、连续压缩和真实任务回归（P4）。
- `pi-context-index.json` 设置文件加载；P0 使用冻结默认值。
- R4（每条嵌套调用的独立执行输出）：**不在 0.1.0 范围**。宿主不落盘，插件不监听 `tool_execution_end`、不新增 custom 条目；范围为 R1–R3，见 §7 和[审阅稿 §0](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md)。

### 2.3 基线验证

2026-10-31 在本机运行：

```text
bun 1.4.4 / Node 24.19.0 / Pi 1.4.0 / TypeScript 7.0.2
bun install --frozen-lockfile --ignore-scripts   -> no changes
bun run typecheck                                -> pass
bun run typecheck:tests                          -> pass
bun test                                         -> 29 pass, 0 fail
npm pack --dry-run                               -> 10 files, 13.4 kB package / 36.7 kB unpacked
```

基线阶段的 26 个测试保持不变；P0 新增 `tests/host.test.ts` 三个真实宿主测试（75 个断言），全套现为 29 个测试、182 个断言。`npm pack` 现包含入口、`src/` 五个模块、README、LICENSE、CHANGELOG 和包清单；测试与文档仍不入包，P5 再核对最终清单。

### 2.4 里程碑

| 阶段 | 状态 | 产出与退出条件 |
|---|---|---|
| P0 真实宿主薄闭环 | 完成 | 注册 `exposure:"direct"` 的 `context_index read` 与 `session_before_compact`；真实 `AgentSession.compact()` 完成压缩、持久化、上下文重建和按引用读回；直接压缩零摘要模型请求；构建失败返回 `cancel:true` 且不调用默认摘要 |
| P1 来源/字段/有效历史 | 未开始 | 源快照、编辑投影、字段迭代器、Unicode 窗口、切点；引用在追加和切树后保持指向；nestedCalls 的 `arguments`/`error`/`status` 可按地址读取 |
| P2 续接包与真实预算 | 未开始 | U/W/N 候选、长文本分块、观测提取、保底与借用、围栏修复；真实会话连续压缩两次 |
| P3 三动作 reader 与回注预算 | 未开始 | `list/search/read`、全文模式、BM25 与字面检索、游标、运行预算；已知长字段可搜索后一次读取直达 |
| P4 生命周期与真实任务回归 | 未开始 | threshold/overflow、restart、切树、fork、context edit、连续 10 次压缩、12 题、三任务试用、性能基准 |
| P5 打包与交付 | 未开始 | README、CHANGELOG、设置示例；临时 agentDir 安装并跑一次压缩与读取；记录版本与结果 |

### 2.5 P0 实现决定

- **切点暂时用宿主的准备结果。** `buildThinCapsule` 直接使用 `event.preparation.firstKeptEntryId`，不自建 `cut.ts`。原因是 P0 先验证真实宿主链路；该切点是宿主按 `keepRecentTokens` 算出的消息/工具事务边界，不会以孤立 `toolResult` 开头。P1 用插件自己的 `keep:N` 与 tail 上限替换。
- **P0 续接文本只引用用户原文。** 选中“被压缩前缀中的第一条非空用户消息 + 最近三条”，按源顺序引用；每条是主文本字段的完整原文或经 grapheme 对齐的前缀。整体硬上限取 `DEFAULT_SETTINGS.viewMaxChars`（12,000）。助手工作说明、工具结果和操作导航留给 P2 的候选集与渲染器。
- **主文本字段口径。** 字符串 `message.content` 为 `/message/content`；数组内容取第一个文本块 `/message/content/<i>/text`；`custom_message` 同理使用 `/content`；compaction/branch summary 使用 `/summary`。显式 `field` 按 JSON Pointer 解析，只接受保存的字符串。P1 用统一的字段迭代器替换。
- **details 结构化但不带正文。** `CapsuleDetails` 的冻结字段均已填充；`snapshotId` 是会话 ID、分支头、水位、recipe 和 shown spans 的规范 JSON 的 SHA-256 前 12 位十六进制。`counts` 基于原始分支近似（没有编辑投影）：saved/effective 相同、live 从切点起算、quoted 按显示跨度去重、index-only 为余数。P1 用真实有效历史替换这些计数。
- **P0 reader 读取整字段。** 没有 `offset`/`length`/`full`/cursor/run budget；工具结果正文就是保存字段的完整字符串，`details` 只带地址、长度和 `complete:true`。P3 会整体替换为有界窗口、游标和累计预算；P0 不是为了日常安装使用。宿主测试另外用 40,000 字符的单行用户文本验证了续接引用的 grapheme 对齐截断与整字段逐字回读。
- **失败路径是硬约束。** 钩子把所有构建错误和 abort 都收敛为 `{cancel:true}`，因为向宿主返回空值会触发默认模型摘要。P0 暂不做用户可见的错误通知；上报在后续阶段补，不能反过来破坏 cancel 语义。
- **测试注入点只用于失败测试。** `registerContextIndex(pi, { buildCapsule })` 允许 `tests/host.test.ts` 注入一个必失败构建器，验证真实宿主上的 cancel 行为；`index.ts` 走默认构建器，没有环境变量或生产开关。
- **宿主测试的临时设置。** 临时 agentDir 的 `settings.json` 把 Pi 自己的 `compaction.keepRecentTokens` 调成 2,000，只用于让合成历史产生可压缩前缀；这不是本插件设置文件，插件在 P0 仍只使用默认值。

### 2.6 下一步（P1）

1. `src/source.ts`：一次捕获 `getEntries/getBranch`，建立稳定 ID 索引、原始记录与有效投影的分层。
2. `src/fields.ts`：字段迭代器、JSON Pointer 路径、owner/storage 分离；编辑正文指向最新 edit entry 的 replacement 字段。覆盖 codemode 的 `/message/nestedCalls/calls/<i>/{arguments,error,status}`，`argumentsBytes` 作为标量字段，跳过 `/message/details/**`（§7.2 第 5 条）。
3. 契约增量：`Observation.nestedIndex?`、`CapsuleObservationRef.nestedIndex?`，`resultId` 表示承载嵌套记录的父结果条目；与设计 §6.4 同批更新。
4. 影子 compaction 投影与 `buildSessionProjection`：处理 `replacement:null`、tail 内编辑和检查点编辑。
5. `src/cut.ts`：自有 `keep:N`、tail token 上限和工具事务边界，替换 P0 的宿主切点。
6. 测试：追加与切树后引用稳定、编辑替换/省略、UTF-16/grapheme 窗口、围栏内切点、nestedCalls 字段寻址；更新本文件。

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
| P0 切点来自宿主 | 不使用设计规定的插件 tail 策略；`keepUserTurns` 实际未生效，P0 的 `details.recipe.keep` 只是记录的期望值 | P1 的 `src/cut.ts` 替换；在此之前不把 P0 当日常压缩使用 |
| P0 续接包只引用用户原文 | 没有助手工作说明、工具结果、操作导航和 U/W/N 分配；数组内容只取第一个文本块；简单渲染器没有使用 `fences.ts` 修复围栏，截断标记可能落在未闭合代码块内 | P2 整体替换渲染与候选，结构标记按围栏状态放置；P1 的字段迭代器先补齐数组与编辑寻址 |
| P0 reader 读取整字段 | 没有 6,000/12,000/48,000 上限、`full`、游标和 run budget；超长字段会原样返回 | P3 整体替换；P0 只用于宿主闭环验证，不发布 |
| P0 details 计数为原始分支近似 | 没有编辑投影和 live/quoted/index-only 的严格互斥校验 | P1 用有效历史重算；P4 按 §13.1 校验守恒 |
| P0 压缩失败无用户可见上报 | 静默取消只保证不触发默认摘要，调试信息不足 | 后续阶段在保持 `{cancel:true}` 的前提下补通知；通知自身也必须被捕获 |
| codemode 下每条嵌套调用的输出不可寻回 | 脚本不 `return`/`text()` 的命令输出，模型与会话都看不到；`only` 模式下每一次读取都经脚本，影响面更大 | **已确认的产品级已知限制**（2026-11-02）。0.1.0 只保证脚本聚合输出（R2）；胶囊（P2）与 README（P5）提示「要保留就给脚本返回值」；不监听宿主事件、不写副本、不改 Pi 上游。见[审阅稿 §0](../reviews/PI_CONTEXT_INDEX_CODEMODE_INDEXABILITY_REVIEW.md) |
| codemode 聚合输出被宿主截断 | 默认 10,000 token（约 40,000 字符）后只留头尾各 20,000 字符，全文在临时文件；再压缩只能引用已保存正文 | 只索引宿主保存的正文，临时路径不入索引；不承诺全文。P2 文案与 P4 测试覆盖；需要全文时由脚本直接 `return` 关键片段 |
| 测试 provider 来自 pi-ai faux | `@earendil-works/pi-ai` 是宿主依赖而非本包直接依赖；CI 干净安装路径尚未在 Ubuntu 验证 | 锁文件固定 Pi 1.4.0 的依赖树；P0 宿主测试已在 Windows 通过，合并前在 CI 跑一次 |
| `compact-all` 的空 `firstKeptEntryId` | `CompactionResult.firstKeptEntryId` 类型为非空字符串；`appendCompaction` 用 `??`，空串会原样保存，投影按 ID 匹配不到任何记录，可能得到“只留摘要”的效果。宿主自身的 retain-none 路径按文档写入压缩条目自身 ID，重复压缩和 fork 重映射是否接受空串尚未验证 | 不影响 P0–P3（正常压缩总传真实切点 ID）；P4 做 compact-all 前先加宿主测试，必要时改用宿主明确支持的方式并在此记录 |
| 真实宿主测试污染日常环境 | 可能读写用户真实会话或设置 | 一律使用临时 cwd、临时 agentDir 和临时设置；不读取 `~/.pi/agent`。P0 宿主测试已验证 |
| Windows 开发、Ubuntu CI | 路径分隔符、换行和进程行为可能不同 | 测试保留 CRLF 夹具；宿主测试已在 Windows 通过，Ubuntu CI 尚待运行，失败时按平台修正，不跳过 |
| README 与 AGENTS 的当前状态行 | README 仍称 `index.ts` 在 P0 前保持惰性，AGENTS 仍称工作区骨架；与 P0 完成状态不一致 | 按本次任务约定，状态只写入本文；发布前或获得明确授权时再同步 README/AGENTS |
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
- P1（`fields.ts`）：字段迭代器覆盖 `/message/nestedCalls/calls/<i>/{arguments,error,status}`，`argumentsBytes` 作为标量字段；跳过 `/message/details/**`。
- P1（`source.ts`/契约）：`Observation.nestedIndex?`、`CapsuleObservationRef.nestedIndex?`，`resultId` 表示承载嵌套记录的父结果条目；与设计 §6.4 同批更新。
- P2（`observations.ts`/`candidates.ts`）：嵌套观测与直接工具产出同一结构；参数被丢弃时输出“参数已省略（N 字节）”；W/N 只用父正文与嵌套 `error`/`status`。
- P2（`render.ts`/胶囊）：自我回声按机器标记剪除并写测试；胶囊与 guideline 改模式中立措辞，并写明“脚本内嵌套调用的输出不单独保存；要保留就在脚本里 `return`/`text()`”。
- P3（`reader.ts`/`host.ts`）：读取结果正文加机器标记；`details` 不可见时（codemode）仍能从正文恢复续读参数。
- P4：新增 8 条 codemode 状态迁移测试——参数超 8KB 的嵌套写请求、`complete:false`、脚本内并发读取共用 run 预算、脚本 `return` 读取结果后回声被剪除、`only` 模式下胶囊文案仍可执行、嵌套错误文本可引用且不算成功、嵌套命令输出缺失时不伪造结果行、聚合输出超默认上限只索引已保存头尾。

## 8. 交接检查

- [x] 已读设计 §6.4 数据契约、§13 验收标准。
- [x] 已读计划的 P0 产出与退出条件。
- [x] 已确认 `node_modules/@earendil-works/pi-coding-agent` 为 1.4.0。
- [x] 已运行 `bun run typecheck`、`bun run typecheck:tests` 和 `bun test`。
- [x] 宿主测试使用临时 cwd 和 agentDir。
- [x] 每次有意义的变更后更新本文件，不修改冻结的设计和计划。
- [x] 已读本文 §7 的 codemode 事实与已定修订项，再动手写 `fields.ts`。
- [x] 已读需求方 2026-11-02 的 codemode 范围确认：R1–R3 纳入，R4 不做，不按路径 B 设计。
