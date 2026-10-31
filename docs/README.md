# 工作文档索引

本目录保存 pi-context-index 的设计依据、落地计划、原型记录、外部评审和移植参考。仓库当前处于 **0.1.0 实现前的工作区阶段**：运行代码尚未开始，安装、发布和真实会话验证都没有发生。当前进度与交接以 [plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md](plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md) 为准。

## 先读什么

1. [plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md](plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md) — 初版设计的唯一产品依据：产品决定、数据契约、字段与检索、续接包选择、预算、reader、宿主集成和验收标准。
2. [plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md](plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md) — 落地计划：P0–P5 顺序、每阶段产出与退出条件、复用清单、必测状态迁移和测试夹具。
3. [plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md](plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md) — **持续更新**的工作进度与交接：当前状态、验证结果、已知风险、变更记录和下一步。
4. [references/PI_CONTEXT_INDEX_HOST_PRIMER.md](references/PI_CONTEXT_INDEX_HOST_PRIMER.md) — Pi 1.4.0 宿主最小知识：压缩 hook、工具契约、`exposure`、真实宿主已验证与未验证边界。
5. [references/LEGACY_CODE_MAP.md](references/LEGACY_CODE_MAP.md) — 旧插件源码、原型文件和本次工作区镜像的对应关系；开始移植前先看这张表。

接着按需要阅读原型与外审材料。

## 计划与设计

- [plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md](plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md) — **当前有效**的 0.1.0 设计。取代原型文档中的产品方案与未决项。
- [plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md](plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md) — **当前有效**的落地计划，代码实现按它的 P0–P5 推进。
- [plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md](plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md) — 历史原型设计（1371 行）：`I/E/X` 目录、有限视图、reader、render-1 至 render-5 与合成实验。保留为证据和设计演进记录，不回改。
- [plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md](plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md) — 原型交接：完成状态、实验读数、文件地图、送审状态和后续入口。

## 外部评审

- [reviews/pi-context-index 原型设计：独立第一性原理外部评审报告.md](reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md) — 独立外审：有条件可送实现、六问裁定、MF-1 至 MF-6 修改清单、被证伪的预注册预测与缺失证据清单。
- [reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md](reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md) — 送审 brief：评审对象、冻结输入、六个问题、范围外与证据边界。
- [reviews/PI_CONTEXT_INDEX_EXTERNAL_REVIEW_PROMPT.md](reviews/PI_CONTEXT_INDEX_EXTERNAL_REVIEW_PROMPT.md) — 可直接交给离线评审者的提示词（中文 + English）。
- [reviews/CODEMODE_0.1.5_EXPERIENCE_AND_0.2.0_DIRECTION.md](reviews/CODEMODE_0.1.5_EXPERIENCE_AND_0.2.0_DIRECTION.md) — 0.1.5 使用感受与 0.2.0 重构方向，是原型设计的三份依据之一。
- [reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md](reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md) — 0.2.0 独立第一性原理评审。
- [reviews/CODEMODE_0.2.0_REVIEW_BRIEF.md](reviews/CODEMODE_0.2.0_REVIEW_BRIEF.md) — 0.2.0 外部评审提示词。
- [reviews/CODEMODE_0.2.0_SCOPE_AND_COVERAGE_DISCUSSION.md](reviews/CODEMODE_0.2.0_SCOPE_AND_COVERAGE_DISCUSSION.md) — 0.2.0 边界与覆盖范围讨论。

### 背景材料（旧插件 0.1.5 / 0.2.0）

以下文件是重构方向的直接背景，不是新插件的产品规范：

- [plans/CODEMODE_0.1.5_UPGRADE_PLAN.md](plans/CODEMODE_0.1.5_UPGRADE_PLAN.md) — 旧插件 0.1.5 的升级计划：围栏、结果导航、直接工具通道、长文本深度与预算元数据。
- [reviews/CODEMODE_BRIEF_FENCE_TRUNCATION_BUG.md](reviews/CODEMODE_BRIEF_FENCE_TRUNCATION_BUG.md) — 旧摘要围栏被截断的缺陷报告。
- [reviews/CODEMODE_0.1.4_FIELD_REVIEW.md](reviews/CODEMODE_0.1.4_FIELD_REVIEW.md) — 0.1.4 现场复核。
- [reviews/CODEMODE_0.1.2_DISCUSSION_RECORD.md](reviews/CODEMODE_0.1.2_DISCUSSION_RECORD.md) — 0.1.2 讨论记录。
- [patches/0.1.5-brief-navigation.md](patches/0.1.5-brief-navigation.md) — 旧插件 0.1.5 的实施记录。

这些历史文档可能链接到未镜像的旧模块（例如 `brief.ts`、`rank.ts`、`summarize.ts`）。新插件不使用这些模块；链接失效时以 `reference/legacy-0.1.5/` 和[移植地图](references/LEGACY_CODE_MAP.md)为准。

## 参考材料

- [references/PI_CONTEXT_INDEX_HOST_PRIMER.md](references/PI_CONTEXT_INDEX_HOST_PRIMER.md) — Pi 宿主最小知识（英文），含 hook 契约、工具契约、`exposure` 语义和 24 项宿主检查。
- [references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md](references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md) — 设计理念与愿景（英文，含中文摘要）：为什么是目录/视图/reader，而不是更好的摘要。
- [references/PI_CONTEXT_INDEX_REVIEWER_GUIDE.md](references/PI_CONTEXT_INDEX_REVIEWER_GUIDE.md) — 评审者指南：术语、文件地图、证据地图、离线命令与常见误读。
- [references/PI_CONTEXT_INDEX_PRIOR_ART_SURVEY.md](references/PI_CONTEXT_INDEX_PRIOR_ART_SURVEY.md) — 2026-10-31 同类上下文管理插件调查：VCC/pi-vcc/LCM 等谱系、按设计维度的对照与定位建议。
- [references/LEGACY_CODE_MAP.md](references/LEGACY_CODE_MAP.md) — 旧源码、原型与工作区镜像的移植地图。

## 链接与数据边界

- V0.1 设计/计划中指向旧插件 `src/...` 的链接已经改为本地镜像 `reference/legacy-0.1.5/src/...`，链接文字和行号保持原样。
- 旧插件 0.1.5/0.2.0 背景文档保持原样，可能仍指向未镜像的旧模块；这是历史记录，不是新包的实现依据。
- 指向 `node_modules/@earendil-works/...` 的链接在 `bun install` 后可直接打开，对应当前锁定的 Pi 1.4.0。
- `PI_CONTEXT_INDEX_HOST_PRIMER.md` 写在原型阶段，文中 peer 范围是旧范围；新包的基线是 Pi 1.4.0，见根 `package.json` 与 V0.1 设计。
- 这里不使用真实会话正文、会话文件名或本机绝对路径；原型数据均为合成夹具。真实会话与回放数据只允许留在 git-ignored 的 `research/` 下，且不进入文档、提交或发布物。

## 文档状态

| 文件 | 状态 | 用途 |
|---|---|---|
| V0_1_DESIGN | 定稿，0.1.0 开发依据 | 产品、数据、算法与验收 |
| V0_1_IMPLEMENTATION_PLAN | 定稿，执行依据 | 阶段、产出、退出条件与夹具 |
| V0_1_PROGRESS | 持续更新，交接依据 | 当前进度、验证、风险与下一步 |
| PROTOTYPE_DESIGN / HANDOFF | 冻结的历史依据 | 设计演进与一次性验证读数 |
| 外审报告 | 冻结的历史依据 | MF 清单、证据分级与已知缺口 |
| PRIOR_ART_SURVEY | 调研快照，随生态变化 | 同类项目、对照维度与定位建议 |
| references/* | 背景与移植参考 | 宿主契约、设计理念、评审术语、旧码映射 |
