# pi-context-index prototype

这是 2026-10-30 的一次性原型，从旧仓库 `pi-vcc-codemode`（基线 `68145e7` / 0.1.5）的 `research/prototype/` 原样复制。它用于理解设计演进、搬运合成夹具和核对历史读数，不是新包的运行代码。

## 文件地图

| 文件 | 作用 |
|---|---|
| `fixtures.mjs` | 合成夹具 A/B、context-edit 夹具与真值 |
| `activation-fixture.mjs` | t5/t6/t6n/t6l 激活夹具与 render 1–5 构造 |
| `catalog.mjs` | `I/E/X`、live、observations、字段视图 |
| `render.mjs` | render-1/2 的预算、渲染与变体 |
| `reader.mjs` | view/read/range/scan/touched；地址、窗口与分页经验 |
| `invariants.mjs` | 18 项结构检查 |
| `host-pi.mjs` | 真实 in-process Pi SDK 的 24 项工具层检查（未覆盖 `session_before_compact`） |
| `bench-large.mjs` | 10K 条合成消息性能 |
| `experiments.mjs`、`focused-experiments.mjs`、`activation-experiments.mjs` | 行为实验主臂 |
| `*summary.mjs` | 聚合与重计分 |
| `PREREG_RENDER*.md` | 预注册记录，冻结不改 |
| `out/` | 合成产物、runs 与日志；git-ignored |

## 注意

- 全部数据为合成夹具；不要在这里加入真实会话、真实路径或模型完整回答。
- 原型的 `page`/`line` 页表、`cover`、头尾行摘录、`#N` 与 `isError:true` 部分结果均已被 V0.1 设计取代。读原型时以[外审报告](../../docs/reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md)和[V0.1 设计](../../docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md)的裁定为准。
- 原型端点固定为 `http://127.0.0.1:8787/v1`（本机 DeepSeek 替身），不包含任何密钥。
- `build-artifacts.mjs` 与 `legacy-build.mjs` 直接导入旧仓库的 `src/core/summarize.ts`，只能从旧工作区运行；其余纯原型脚本可在本目录运行（`node invariants.mjs` 18/18）。
- 不重跑旧实验来改变结论；新证据需要新的预注册与新夹具。
