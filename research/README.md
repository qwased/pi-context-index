# Research records

本目录保存 pi-context-index 的调研与原型资产。它不是运行代码，也不进入 npm 包。

## 数据边界

- 允许提交：合成夹具、预注册文件、原型脚本、聚合计数与不含正文的结构化结果。
- 禁止提交：真实会话正文、真实会话文件名、本机绝对路径、模型完整回答、回放文件、备份。
- `.gitignore` 已忽略 `research/.backup/`、`research/sessions/`、`research/replays/`、`research/prototype/out/` 和评审包 zip/sha256。即使某些合成产物临时被跟踪，也不要把真实数据放进本目录。
- 提交信息、PR 和文档都不得引用会话正文。

## 内容

| 路径 | 内容 | 来源 |
|---|---|---|
| `prototype/` | 2026-10-30 的一次性 Node 原型：夹具、目录、渲染、reader、invariants、宿主探针、预注册与合成产物 | 旧仓库 `pi-vcc-codemode`，基线 `68145e7` / 0.1.5 |
| `prototype/out/` | 原型运行产物；git-ignored，本机保留 | 同上 |
| `review-bundle/` | 外审包的 zip 与 SHA-256；git-ignored，本机保留 | 同上 |

原型的设计读数和结论以以下文件为准：

- [原型交接](../docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md)
- [外审报告](../docs/reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md)
- [V0.1 设计 §14 已核实基础](../docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md)

**最终设计已经取代原型的部分结论**：原生 `entryId` 取代 `#N`，结构分块取代头尾行摘录，删除页表/`page`/`line`，`cover` 合并为 `read full:true`，正常部分结果不再设置 `isError:true`。原型保留为证据和设计演进记录，不回改。

## 运行原型

原型是 Node ESM，不依赖新包：

```sh
node research/prototype/invariants.mjs
node research/prototype/followup-summary.mjs
node research/prototype/render5-summary.mjs
```

`host-pi.mjs` 和实验脚本需要旧仓库的 `node_modules`、本机 DeepSeek 替身端点与对应的会话环境，不是新仓库的日常检查。新包的自动测试只使用合成夹具和临时目录。

不要为了改实验结论重跑旧批次；若需要新证据，先在 `docs/plans/` 写清问题和指标，再决定是否重建原型。
