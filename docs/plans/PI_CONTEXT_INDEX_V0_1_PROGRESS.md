# pi-context-index 0.1.0 工作进度

- 版本：0.1.0（未发布）
- 最近更新：2026-10-31
- 状态：P0 未开始；工作区基线已建立
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
| 扩展入口 | 占位。`index.ts` 按计划保持空注册，P0 接入 |
| 旧实现镜像 | 完成。`reference/legacy-0.1.5/` 只读，不导入 |
| 合成原型资产 | 完成。`research/prototype/` 脚本、夹具和预注册；运行产物不入库 |
| 工作文档 | 完成。设计、计划、移植地图、宿主入门、外审与历史记录 |

### 2.2 未实现

- `context_index` 工具及其 `list/search/read` 三动作。
- `session_before_compact` 的 manual、threshold、overflow 统一路径。
- 来源快照、有效历史投影、字段迭代器、编辑寻址。
- 续接包候选、预算、渲染与真实字符计量。
- 搜索、全文读取、游标和单次运行预算。
- 真实宿主生命周期测试和 0.1.0 试用验收。

### 2.3 基线验证

2026-10-31 在本机运行：

```text
bun 1.4.4 / Node 24.19.0 / Pi 1.4.0 / TypeScript 7.0.2
bun install --frozen-lockfile --ignore-scripts   -> no changes
bun run typecheck                                -> pass
bun test                                         -> 26 pass, 0 fail
npm pack --dry-run                               -> 8 files, 9.0 kB
```

`npm pack` 当前只含入口、`src/` 三个模块、README、LICENSE、CHANGELOG 和包清单；随 P0–P5 增加模块后会增长，P5 再核对最终文件清单。

### 2.4 里程碑

| 阶段 | 状态 | 产出与退出条件 |
|---|---|---|
| P0 真实宿主薄闭环 | 未开始 | 注册 `exposure:"direct"` 的 `context_index read` 与 `session_before_compact`；用真实 SDK 会话完成压缩、持久化、上下文重建和按引用读回；零摘要模型请求；构建失败返回 `cancel:true` |
| P1 来源/字段/有效历史 | 未开始 | 源快照、编辑投影、字段迭代器、Unicode 窗口、切点；引用在追加和切树后保持指向 |
| P2 续接包与真实预算 | 未开始 | U/W/N 候选、长文本分块、观测提取、保底与借用、围栏修复；真实会话连续压缩两次 |
| P3 三动作 reader 与回注预算 | 未开始 | `list/search/read`、全文模式、BM25 与字面检索、游标、运行预算；已知长字段可搜索后一次读取直达 |
| P4 生命周期与真实任务回归 | 未开始 | threshold/overflow、restart、切树、fork、context edit、连续 10 次压缩、12 题、三任务试用、性能基准 |
| P5 打包与交付 | 未开始 | README、CHANGELOG、设置示例；临时 agentDir 安装并跑一次压缩与读取；记录版本与结果 |

### 2.5 P0 下一步

1. 在 `index.ts` 注册 `context_index`，先实现 `read` 的主文本字段。
2. 注册 `session_before_compact`，返回带用户原文和 `e:<entryId>` 的有界文本。
3. 建立 `tests/host.test.ts`：临时 cwd、临时 agentDir、测试 provider 替身。
4. 用真实 `AgentSession.compact()` 触发压缩，检查 compaction entry、`fromExtension` 与宿主重建的 `summary + tail`。
5. 从生成的压缩文本提取引用，执行 reader 并逐字核对原文。
6. 断言测试 provider 未收到摘要请求；继续对话时只出现正常 agent 请求。
7. 故意让插件构建失败，确认 `{cancel:true}` 阻止默认摘要回退。

退出条件：真实压缩 → 持久化 compaction → 宿主重建上下文 → 按生成引用读回原文完整通过。不得用手动拼接 `<view>` 后 `prompt()` 代替。

## 3. 已核实的宿主事实（Pi 1.4.0）

以下结论来自本地安装源码，P0 仍需用真实会话复核。

| 事实 | 位置 |
|---|---|
| 压缩事件含 `preparation`、`branchEntries`、`reason: manual/threshold/overflow`、`signal` | `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:600` |
| 钩子可返回 `compaction{summary, firstKeptEntryId, tokensBefore, details, usage}` 或 `cancel:true` | 同文件 `:1137` |
| 扩展提供 compaction 时跳过默认摘要器；`cancel` 在默认路径前终止 | `dist/core/agent-session.js:2253` |
| 手动压缩入口为 `AgentSession.compact(customInstructions?)` | `dist/core/agent-session.d.ts:726` |
| `buildSessionProjection` 已导出，`ctx.sessionManager` 提供 `getEntries/getBranch` | `dist/core/session-manager.d.ts:178`、`:200` |
| `ctx.getContextUsage()` 可用 | `dist/core/agent-session.d.ts:893` |
| `exposure:"direct"` 合法且默认激活 | `dist/core/extensions/types.d.ts:395`、`:453` |
| `createAgentSession` 可注入 `modelRuntime`/`model`，用于测试 provider 替身 | `dist/core/sdk.d.ts:10`；`ModelRuntime.registerProvider` 在 `dist/core/model-runtime.d.ts:117` |
| compaction entry 记录 `fromExtension` | `dist/core/extensions/types.d.ts:616`、`:634` |

## 4. 已知风险与待验证项

| 项 | 影响 | 处理 |
|---|---|---|
| 测试文件不在 typecheck 范围 | `bun test` 只剥离类型、不做类型检查；重构后测试可能带着错误类型继续运行，CI 只能靠行为断言兜底 | P1 测试增多前评估增加独立 `tsconfig.tests.json`；当前 P0 风险低，但要留意 Pi 类型误用 |
| 根 TypeBox 1.3.32 与 Pi 内置 1.3.27 双副本 | 工具 schema 的类型推断可能出现兼容摩擦 | P0 注册工具时先跑 typecheck；若报错，把根版本对齐到 1.3.27，仍在 peer 范围内 |
| `compact-all` 的空 `firstKeptEntryId` | `CompactionResult.firstKeptEntryId` 类型为非空字符串；`appendCompaction` 用 `??`，空串会原样保存，投影按 ID 匹配不到任何记录，可能得到“只留摘要”的效果。宿主自身的 retain-none 路径按文档写入压缩条目自身 ID，重复压缩和 fork 重映射是否接受空串尚未验证 | 不影响 P0–P3（正常压缩总传真实切点 ID）；P4 做 compact-all 前先加宿主测试，必要时改用宿主明确支持的方式并在此记录 |
| 真实宿主测试污染日常环境 | 可能读写用户真实会话或设置 | 一律使用临时 cwd、临时 agentDir 和临时设置；不读取 `~/.pi/agent` |
| Windows 开发、Ubuntu CI | 路径分隔符、换行和进程行为可能不同 | 测试保留 CRLF 夹具；宿主测试在两边各跑一次，失败时按平台修正，不跳过 |
| 冻结计划的状态行已过时 | 计划仍称项目尚未创建 | 不改计划，以本文第 1 节说明为准 |

## 5. 日常验证

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
bun test tests/host.test.ts tests/lifecycle.test.ts
npm pack --dry-run
```

`tests/host.test.ts` 与 `tests/lifecycle.test.ts` 在 P0/P4 建立，未建立前第二条测试命令不适用。真实会话与模型费用对照只手动运行，不进自动测试。

## 6. 变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-31 | 建立 0.1.0 工作区基线：纳入骨架、冻结设计/计划、legacy 镜像、合成原型资产、测试和文档；忽略依赖、原型运行产物、审查压缩包、备份和打包 tarball |
| 2026-10-31 | 新增本文，作为实现期间的进度与交接入口；`AGENTS.md`、`docs/README.md` 和 CHANGELOG 指向本文 |

## 7. 交接检查

- [ ] 已读设计 §6.4 数据契约、§13 验收标准。
- [ ] 已读计划的 P0 产出与退出条件。
- [ ] 已确认 `node_modules/@earendil-works/pi-coding-agent` 为 1.4.0。
- [ ] 宿主测试使用临时 cwd 和 agentDir。
- [ ] 每次有意义的变更后更新本文件，不修改冻结的设计和计划。
