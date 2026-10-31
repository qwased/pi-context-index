# pi-vcc-codemode 0.1.5 reference mirror

只读镜像，用于对照移植。基线是旧仓库 `pi-vcc-codemode` 的 `68145e7` / 0.1.5，许可证见同目录 `LICENSE`（MIT，Copyright (c) 2026 sting8k）。

**不要从本目录导入运行代码。** 新包按 V0.1 设计重新实现；镜像只用于阅读纯函数、边界处理与测试素材。镜像里的旧测试不能直接在新包运行。

| 镜像文件 | 新位置 | 说明 |
|---|---|---|
| `src/core/fences.ts` | `src/fences.ts` | 已移植；纯函数保持一致。 |
| `src/core/token-estimate.ts` | `src/budget.ts` | 只复用内容容量估算，不复用旧摘要预算。 |
| `src/codemode/file-ops.ts` | `src/observations.ts` | nestedCalls 文件操作识别。 |
| `src/hooks/before-compact.ts` | `src/cut.ts` | 用户轮与工具结果边界；不复制旧摘要/provider 路径。 |
| `src/core/brief-history.ts` | `src/source.ts` | 原始分支、影子检查点、编辑投影。 |
| `src/core/recall-full.ts` | `src/fields.ts`、`src/reader.ts`、`src/search.ts` | 字段枚举、字符簇窗口与扫描思路。 |
| `tests/fences.test.ts` | `tests/fences.test.ts` | 旧测试含旧集成断言；新测试只取纯函数部分。 |
| `tests/codemode-file-ops.test.ts` | `tests/observations.test.ts`（待建） | nestedCalls 测试素材。 |
| `tests/recall-full.test.ts` | `tests/reader.test.ts`、`tests/fields.test.ts`（待建） | UTF-16 窗口与地址测试素材。 |
| `tests/support/load-session.ts` | `tests/support/load-session.ts`（待建） | 会话文件加载辅助。 |
| `src/core/global-indices.ts` | 不移植 | 仅为背景评审的源码链接而镜像；新包使用原生 `entryId`，不保留全局编号水位。 |

完整对照表见 [docs/references/LEGACY_CODE_MAP.md](../../docs/references/LEGACY_CODE_MAP.md)。
