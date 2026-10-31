# 旧源码与原型移植地图

- 旧仓库：`pi-vcc-codemode`（本机同级目录，MIT），基线 `68145e7` / 0.1.5。
- 本仓库从 0.1.0 重新实现，**不导入旧包运行路径**。镜像只用于阅读、对照和搬运纯函数；不要从 `reference/` 或 `research/` 导入运行代码。
- 设计依据：[V0.1 设计 §14](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md) 与[落地计划 §4](../plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md)。
- 设计/计划中的旧源码链接已改为 `../../reference/legacy-0.1.5/...`；链接文字和行号未改，仍指向 0.1.5 原文。

## 1. 已镜像的旧源码

| 旧文件 | 本仓库镜像 | 新模块 | 保留与重写 |
|---|---|---|---|
| `src/hooks/before-compact.ts` | `reference/legacy-0.1.5/src/hooks/before-compact.ts` | `src/cut.ts` | 保留 `buildOwnCut` 的用户轮边界与工具结果边界；替换 tail 预算输入；不复制旧 provider gate、摘要合并和 pi-vcc 命令路径。 |
| `src/core/brief-history.ts` | `reference/legacy-0.1.5/src/core/brief-history.ts` | `src/source.ts` | 保留完整原始分支、影子 compaction 检查点、编辑投影与检查点下界；输出 owner/storage 定位，不再输出全局 `#N`。 |
| `src/core/recall-full.ts` | `reference/legacy-0.1.5/src/core/recall-full.ts` | `src/fields.ts`、`src/reader.ts`、`src/search.ts` | 字段选择规则改为 `Iterable<TextField>`；字符簇切片改为对独立字段执行；固定范围扫描与 deadline 思路移到内存索引，不再每次线性扫描 JSONL。 |
| `src/core/fences.ts` | `reference/legacy-0.1.5/src/core/fences.ts` | `src/fences.ts`（已移植） | 纯函数与对应测试保留；分支、chunking 与渲染共用同一状态机。见 `src/fences.ts` 与 `tests/fences.test.ts`。 |
| `src/core/token-estimate.ts` | `reference/legacy-0.1.5/src/core/token-estimate.ts` | `src/budget.ts` | 只保留消息内容容量估算，供 tail 和 reader 余量计算；不沿用旧摘要预算公式与校准路径。 |
| `src/codemode/file-ops.ts` | `reference/legacy-0.1.5/src/codemode/file-ops.ts` | `src/observations.ts` | 保留 `read`/`write`/`edit` 的 nestedCalls 识别；与直接工具统一成 `Observation`，不依赖 pi-codemode 包。 |
| `tests/fences.test.ts` | `reference/legacy-0.1.5/tests/fences.test.ts` | `tests/fences.test.ts` | 旧测试含 brief/format 集成；新测试先只覆盖围栏纯函数与独立 oracle，集成断言在 render 落地后补。 |
| `tests/codemode-file-ops.test.ts` | `reference/legacy-0.1.5/tests/codemode-file-ops.test.ts` | `tests/observations.test.ts`（待建） | 用作 nestedCalls 文件操作测试的素材。 |
| `tests/recall-full.test.ts` | `reference/legacy-0.1.5/tests/recall-full.test.ts` | `tests/reader.test.ts`、`tests/fields.test.ts`（待建） | 用作 UTF-16 窗口、字段地址与分页测试的素材；旧 `#N` 与格式化字符串断言不迁移。 |
| `tests/support/load-session.ts` | `reference/legacy-0.1.5/tests/support/load-session.ts` | `tests/support/load-session.ts`（待建） | 只读取本机会话文件时的加载辅助；测试必须使用临时 cwd/agentDir，不读用户配置。 |
| `src/core/global-indices.ts` | `reference/legacy-0.1.5/src/core/global-indices.ts` | 不移植 | 只为 0.2.0 背景评审的源码链接而镜像。新包使用原生 `entryId`，明确不保留全局 `#N` 编号水位。 |

旧包以下内容明确不进入新包：

- `src/core/global-indices.ts` 的全局编号水位。
- 旧角色评分、章节提取器、摘要合并与 `[Session Goal]`/`[Outstanding Context]` 等语义章节。
- 旧 `vcc_recall` 请求解析、格式化与 `#N` 地址体系。
- render-1 至 render-5、`page`/`line` 页表、`cover`、固定 1,200 字符网格与 `max` 打印门。
- 旧 provider gate、权限策略、调试输出格式与非 codemode 兼容分支。

## 2. 原型与调研记录

原型位于 `research/prototype/`，是 2026-10-30 的一次性 Node 原型，不进入 npm 包：

| 文件 | 用途 |
|---|---|
| `fixtures.mjs` | 合成夹具 A/B、context-edit 夹具、真值；新测试夹具的主要素材。 |
| `activation-fixture.mjs` | t5/t6/t6n/t6l 激活夹具与 render 1–5 构造。 |
| `catalog.mjs` | `I/E/X`、live、observations、字段视图。 |
| `render.mjs` / `render3-summary.mjs` / `render5-summary.mjs` | 旧渲染与实验汇总，仅作演进证据。 |
| `reader.mjs` | 旧 view/read/range/scan/touched；新 reader 的地址与窗口经验来源。 |
| `invariants.mjs` | 18 项结构检查；新包不直接复用，但保持同类断言。 |
| `host-pi.mjs` | 真实 in-process Pi SDK 的 24 项工具层检查；**未覆盖 `session_before_compact`**。 |
| `PREREG_RENDER*.md` | 预注册记录，冻结不改。 |
| `out/` | 合成产物与聚合结果；git-ignored，仅本机保留。 |

原型结论以[原型交接](../plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md)和[外审报告](../reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md)为准。最终设计已取代原型的以下部分：`#N` 改为原生 `entryId`，头尾行摘录改为结构分块，删除页表/`page`/`line`，`cover` 合并为 `read full:true`，正常部分结果不再设置 `isError:true`。

## 3. 移植时的判断顺序

1. 先看 V0.1 设计的数据契约（§6.4）与函数边界（落地计划 §5），确定目标形状。
2. 再看旧实现，只搬运纯函数或可验证的边界处理，不搬运旧输出格式。
3. 每搬一个模块，先写状态迁移测试（落地计划 §6），再写实现。
4. 旧代码中的 MIT 版权信息保留在根 `LICENSE` 与 `reference/legacy-0.1.5/LICENSE`。
