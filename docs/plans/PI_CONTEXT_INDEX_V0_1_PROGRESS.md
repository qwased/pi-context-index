# pi-context-index 0.1.0 工作进度

- 版本：0.1.0（未发布）
- 最近更新：2026-10-31
- 状态：P0 真实宿主薄闭环完成；P1 未开始
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
| 工作文档 | 完成。设计、计划、移植地图、宿主入门、外审与历史记录 |

### 2.2 未实现

- `list`/`search` 动作和完整 `read`（窗口、`full`、游标、运行预算）；P0 只有整字段读取。
- 自有切点策略、来源快照、有效历史投影、字段迭代器、编辑寻址（P1）。
- 续接包 U/W/N 候选、真实预算、长文本分块、观测提取和围栏渲染（P2）。
- threshold/overflow、重启、切树、fork、context edit、连续压缩和真实任务回归（P4）。
- `pi-context-index.json` 设置文件加载；P0 使用冻结默认值。

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
| P1 来源/字段/有效历史 | 未开始 | 源快照、编辑投影、字段迭代器、Unicode 窗口、切点；引用在追加和切树后保持指向 |
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
2. `src/fields.ts`：字段迭代器、JSON Pointer 路径、owner/storage 分离；编辑正文指向最新 edit entry 的 replacement 字段。
3. 影子 compaction 投影与 `buildSessionProjection`：处理 `replacement:null`、tail 内编辑和检查点编辑。
4. `src/cut.ts`：自有 `keep:N`、tail token 上限和工具事务边界，替换 P0 的宿主切点。
5. 测试：追加与切树后引用稳定、编辑替换/省略、UTF-16/grapheme 窗口、围栏内切点；更新本文件。

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
| 2026-10-31 | 完成 P0 真实宿主薄闭环：`index.ts` 注册 `exposure:"direct"` 的 `context_index read` 与 `session_before_compact`；新增 `src/host.ts`、`src/reader.ts`、`tests/host.test.ts`；覆盖真实 `AgentSession.compact()`、持久化 compaction、宿主 summary+tail 重建、重开会话后按生成引用逐字回读、长文本有界截断与整字段回读、压缩零 provider 请求、继续对话两个正常请求、构建失败 `{cancel:true}` 阻止默认摘要。全套 29 测试通过 |

## 7. 交接检查

- [x] 已读设计 §6.4 数据契约、§13 验收标准。
- [x] 已读计划的 P0 产出与退出条件。
- [x] 已确认 `node_modules/@earendil-works/pi-coding-agent` 为 1.4.0。
- [x] 已运行 `bun run typecheck`、`bun run typecheck:tests` 和 `bun test`。
- [x] 宿主测试使用临时 cwd 和 agentDir。
- [x] 每次有意义的变更后更新本文件，不修改冻结的设计和计划。
