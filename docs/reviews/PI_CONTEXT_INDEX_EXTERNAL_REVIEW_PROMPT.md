# 外部评审提示词（离线、无 Pi 背景，第一性原理 + 允许重构）

**用法：** 把解压后的评审包根目录交给评审者，并复制下面“中文版提示词”或“English prompt”整段作为任务。提示词不依赖本对话；材料全部在包内。主设计为中文；英文评审者请先读 **DESIGN_RATIONALE.md** 与 brief §8，并在产出中注明语言限制。

**这份提示词的立场：** 你不是来做合规检查的。你可以不同意作者，质疑设计前提，提出不同的设计理念、替代架构，甚至建议重构或替换。六问是细节，不是边界；如果设计前提错了，直接说错在哪里，并给出你认为更好的方向。唯一的要求是：把“证据支持的结论”和“你的设计判断”分开，不编造材料里没有的数字或 Pi 行为。

---

## 中文版提示词

### 角色

你是独立外部评审专家。你在**离线环境**工作，**没有 Pi coding agent 的文档或先验知识**，也没有参与该原型的开发。所有允许你使用的材料都在这个评审包里。不要联网，不要假设包里没有的实现、真实会话、跨模型结果或生产数据；材料没写的，写“未提供/未验证”，不要用其他 agent 框架的常识补全。

你的任务不是“确认作者做对了”，而是从第一性原理判断：这个问题是否值得这样解、这个设计理念是否成立、哪些假设是承重的、有没有更好的替代方案、现有设计应保留/修改/重构/替换。

### 先给结论：本插件的设计理念（供你质疑，不是让你复述）

**问题陈述。** 传统“语义摘要”压缩产出的是叙事：它压缩了解释，却丢掉了可核对性、覆盖可见性和原文地址。读者无法区分“没发生”“没展示”“读不了”，也容易把摘录当成完整要求；摘要还会生成目标、待办、当前状态、撤销关系这类推断，既不稳定也会过期。

**设计命题。** 压缩的产物不应是“更好的摘要”，而应是：

1. **保存记录的可校验目录**：源快照内所有已分配 #N 的消息都登记；有效历史 E 与外部 X 逐项有原因；E 分为 Live / Quoted / IndexOnly / Unavailable，互斥且 unaccounted=0。
2. **有限展示视图**：只展示有限的结构片段；每个展示跨度是精确源子串，带 #N/字段/UTF-16 偏移；每个隐藏跨度有地址；预算按完整候选成本 needed 截止，不默认花满。
3. **可寻址 reader**：view / read / range / scan / touched 共用同一快照与隐私策略；返回精确子串、字段、偏移、成本和 next；不静默切换快照或替换近似记录。
4. **零模型调用的压缩器**：压缩时只做确定性目录/选择/渲染；不生成目标/待办/当前状态/撤销关系，不做语义评分，不调用 LLM。
5. **成本与失败显式**：预算、cover 总成本、截断、unread、负结果、不可读、策略排除都明确报告；不把工具可达写成任务成功。
6. **版本化演进**：render-1 到 render-5 每一版对应一个结构性失败与一次预注册实验；不把“更大窗口/更强提醒”当通用修复。

**它明确不承诺：** 所有历史/字段直接可见；模型一定会读；压缩在深读场景一定省 token；跨文件 fork 的 #N 一定稳定；启发式秘密扫描零漏检。

**六问是这套命题的后果，不是命题本身。** 如果命题错了，六问的答案可能是“都不重要”；这属于有效评审结论。

### 材料与阅读顺序

1. **README.md**：包内容、校验、排除项。
2. **REVIEWER_GUIDE.md**：术语、文件地图、证据地图、离线命令、常见误读。
3. **docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md**：设计理念与愿景（英文，含中文摘要）。
4. **docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md**：无 Pi 背景必读；宿主 API 事实、24 项检查、已验/未验。
5. **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md**：§0、§1、§6、§7、§12.3–§12.9、§14–§16；表格与“发现/边界”是重点。
6. **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md** §12：送审状态与剩余缺口。
7. **docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md** §2–§6：冻结输入、六问、范围外、证据边界、期望产出；§7 是 claim 到 evidence 索引。
8. 需要核对数字时，按 REVIEWER_GUIDE §6 的证据地图读对应 summary JSON；不要重跑行为实验。

### 冻结输入（不要改，但可以质疑它们是否足够）

- 设计 §12.3、§12.6、§12.7、§12.8 的表；§12.9 的 render-5 表。
- render-1/2/3 字节不变；probe 8/8。
- render-5：105 条主/重复运行全部 valid；28 文件行 / 21 合并行。
- 宿主：24/24 in-process Pi SDK 检查；端点仍是本机 DeepSeek 替身。
- 结构：18/18 不变式；docs 围栏闭合。
- 预注册文件只覆盖 §12.8/§12.9；§12.3/§12.6/§12.7 是设计内记录（见 brief §2.1）。

“不要改”指不要篡改这些记录来圆结论；**不**意味着它们足以支持设计。你可以指出缺口、要求新实验，或建议用不同证据替代。

### 第一性原理评审（必须做，优先于六问）

请用 1–3 页回答，先于具体问题：

**A. 问题重述与层级。** 这个“压缩后不可核对/不可寻址”的问题是否真实、是否重要？压缩是正确的作用层，还是应该由会话存储、宿主、状态插件或外部文件承担？如果问题成立，最关键的失败是什么（正确性、可用性、成本、隐私、信任）？

**B. 设计理念的承重部分。** 用你自己的话重述“目录 + 视图 + reader + 零模型调用 + 不生成状态”。哪些是必要的，哪些是作者的历史选择/偶然约束？如果去掉其中一条（例如允许语义层、允许 sidecar、允许模型参与压缩），设计是否仍成立？

**C. 承重假设与反例。** 至少逐条检查：#N 身份稳定；目录完整可验证；字段/偏移可精确回读；宿主 compaction hook 与工具契约可用；模型会读/会被触发；预算与成本可控；合成夹具能代表真实会话；单模型结果可外推；隐私策略可一致执行。哪些有证据、哪些只是设计假设？给出可能推翻它们的反例或最小实验。

**D. 替代方案。** 至少比较 2 个替代方向，不要只跟“更差的摘要”比。可选：维持现状（不改压缩）；更好的语义摘要；独立状态插件；语义摘要 + 可寻址索引的混合；宿主级长期记忆/自动覆盖；外部文件/任务书为权威；完全不同的索引/reader 协议；把 cover 改成宿主强制循环或预取。按正确性、可核对性、成本、隐私、实现复杂度、用户体验比较。

**E. 修改/重构建议。** 明确区分：保留（keep）、修改（modify）、重构（refactor）、替换（replace）。如果是重构，说明哪些部件应保留（例如 I/E/X、字段跨度、reader 快照、needs 截止），哪些应删除或重做（例如 cover、页表、预算公式、提示词触发、PII 策略、宿主契约）。不要只给“再加一个提醒/再调一个阈值”的局部补丁，如果结构上不成立就直接说。

**F. 证据需求。** 对你建议的方向，最小可接受证据是什么？是否需要新预注册、真实会话、跨模型、真实宿主（取消/调度/权限/TUI/fork）或 100k/200MB？如果现有证据不足以支持任何方向，明确说“证据不足”，不要用设计判断冒充证据。

### 六个具体问题（细节；若前提被否定，可简答或直接说明“不适用”）

**Q1. 深跨度 cover 机制是否成立。** 服务端合并连续窗口、一次返回整段、打印总成本；37K 上 C5 7/9（7 条 cover 全对），C 0/9，同帧 render-3 C 0/9。它是否满足“有限视图 + 原文可寻址 + 精确成本”？coverMax、截断 + next + isError、合并长正文是否需要新契约？

**Q2. 触发层 2/9 缺口。** C5 2/9 完全不调用 cover（1 条 0 调用、1 条只 scan）；A 0/3 覆盖；D5 4/9 不调用。一个“被使用时 7/7 正确、但 2/9 不触发”的机制是否足以作为设计基线？接受并文档化，还是改为宿主层强制覆盖？若继续提示词路线，下一次可证伪实验的主指标是什么？

**Q3. cover 成本与默认政策。** 37K 一次 cover 结果 + 视图约 43.8K chars，超过 39.3K 原文；15K 约 21.7K，超过 17.2K。一次 cover 的累计 prompt 约 14.2K，三次 next 约 28.2K。cover 应不应该默认出现？coverMax 归谁、取多少？是否应设单次 token/字符预算？

**Q4. 15K cover 多余。** 15K 时 max 已覆盖目标，C 9/9；C5 仍 9/9 用 cover，工具字符 +12%。当前“span > readMax 就打印 cover”的规则是否过宽？应改成什么门（span > coverMax、等 max 失败、成本上限）？是否需要新预注册阈值实验？

**Q5. 宿主证据边界。** 24/24 覆盖注册、schema 拒绝、throw/isError、部分结果、工具层并发、扩展侧预算、hidden；端点仍是替身。运行中取消、调度并行、权限扩展端到端、scope:"all"、TUI/HTML、fork/context edit、100 次压缩、托管 provider、Pi 1.0/1.4 对照未验证。证据是否足以接受工具契约？哪些未验证项是设计阻断，哪些是实现阻断？

**Q6. 预注册与计分口径。** 105 条全部 valid，但条件/臂顺序固定、未随机化；S2b 是事后确认；§12.3 的 T4 计分在冒烟后放宽；§12.8 用请求参数、§12.9 用实际返回区间测量覆盖；grounded 由确定性词表重算。独立预注册文件只覆盖 §12.8/§12.9；§12.3/§12.6/§12.7 没有独立文件。偏差是否可接受？是否要求重述（不重跑）或新预注册？Wilson 只描述本样本，是否应保留？

### 输出格式

~~~text
## 0. 第一性原理结论
- 问题是否成立 / 作用层是否正确
- 设计理念的承重部分（你的重述）
- 承重假设与最可能推翻它们的反例
- 替代方案比较（至少 2 个；含成本/隐私/可行性）
- 建议：keep / modify / refactor / replace；哪些保留、哪些重做
- 总体：可送实现 / 有条件可送 / 建议重构后再评 / 不可送

## 1. Q1 ... Q6
每题：
- 结论：接受 / 有条件接受 / 拒绝 / 不适用（前提被否定）
- 依据：引用文件 + 章节/表行；不要用材料外的数字
- 要求的修改：条款/默认值/表格；若要求新实验，写出预注册问题与主指标
- 阻断级别：设计阻断 / 实现阻断 / 非阻断

## 2. 必须修改（design must-fix）
## 3. 建议探索 / 新预注册（exploratory）
## 4. 必须弱化的 claim
## 5. 缺失证据
## 6. 语言与范围限制
~~~

### 评审边界与禁止

- 不要把“工具可达”当成“模型会调用”；不要把“7/9”当成概率或显著性。
- 不要把 §12.8 的 0/24 与 §12.9 的 7/9 当成同一时间序列或同一测量口径。
- 不要把 in-process SDK + 替身端点当成真实 CLI/托管 provider/TUI/fork 已验证。
- 不要把合成夹具、单模型、3/9 次的结果写成生产保证。
- 不要要求或假设真实会话数据；不要在产出中复制工具结果/模型回答正文。
- 不要篡改冻结表、render-1/2/3 字节或设计结论来“修复”数字。
- **可以**质疑设计前提、提出不同理念、替代架构、重构或替换建议；请把“证据”和“设计判断”分开写。
- 每条批评尽量配一个具体替代方案或一个可证伪测试；如果暂时没有，写“需要探索”，不要用更强提醒语代替结构修改。

### 时间与篇幅

建议 90–120 分钟，3–6 页；第一性原理部分必须写，六问可简答。不需要重跑行为实验。可选离线校验：在解压根目录运行 node verify-bundle.mjs（约 1 秒，无网络）。如果某题无法回答，写“证据不足”并说明缺什么。

---

## English prompt

You are an independent external reviewer. You work offline, have no prior knowledge of the Pi coding agent, and did not participate in this prototype. Everything you may use is in this review bundle. Do not use the network, do not assume an implementation, real sessions, cross-model results or production data that are not in the bundle. If the material does not state a fact, write “not provided / not verified”; do not fill gaps with generic agent-framework knowledge.

You are not a compliance checker. You may disagree with the authors, challenge the premises, propose a different design philosophy, an alternative architecture, a refactor, or a replacement. The six questions are details, not the boundary. If the premise is wrong, say so and propose a better direction. Keep “what the evidence supports” separate from “what I would design”. Do not invent numbers or Pi behavior.

### The design in one page (to be challenged, not repeated)

The problem: semantic compaction produces a narrative. It compresses interpretation but loses checkability, visible coverage and exact addresses. A reader cannot distinguish “did not happen” from “was hidden” from “unreadable”, and may treat an excerpt as the complete requirement. The summary also manufactures goals, todos, current state and supersedes; these are unstable and go stale.

The thesis: the artifact should not be “a better summary”; it should be:

1. **A verifiable directory of saved records.** Every allocated #N message in the snapshot is registered; effective history E and outside X have per-item reasons; E is partitioned into Live / Quoted / IndexOnly / Unavailable, mutually exclusive, with unaccounted = 0.
2. **A deliberately limited view.** Only bounded structural excerpts; every shown span is an exact source substring with #N/field/UTF-16 offsets; every hidden span has an address; the budget stops at the complete candidate cost (needed), not at a quota to fill.
3. **An addressable reader.** view / read / range / scan / touched share one snapshot and privacy policy; they return exact substrings, fields, offsets, costs and next; they never silently switch snapshots or substitute a similar record.
4. **A zero-model-call compressor.** Compaction is deterministic directory/selection/rendering; no goals, todos, current state, supersedes, or semantic ranking; no LLM call.
5. **Explicit cost and failure.** Budget, cover total cost, truncation, unread, negative results, unreadable and policy-excluded are reported; tool reachability is not task success.
6. **Versioned evolution.** render-1 to render-5 each responds to a structural failure and a preregistered experiment; “larger window / stronger reminder” is not treated as a general fix.

It explicitly does **not** promise: all history/fields visible; the model will read; compression always saves tokens on deep reads; cross-file fork #N stability; zero-leak secret scanning.

The six questions are consequences of this thesis, not the thesis itself. If the thesis is wrong, “not applicable” is a valid answer.

### Read in this order

1. **README.md** — package contents, verification, exclusions.
2. **REVIEWER_GUIDE.md** — glossary, file map, evidence map, offline commands, common misreadings.
3. **docs/references/PI_CONTEXT_INDEX_DESIGN_RATIONALE.md** — design rationale and vision (English; Chinese abstract).
4. **docs/references/PI_CONTEXT_INDEX_HOST_PRIMER.md** — minimum Pi contract; essential if you do not know Pi.
5. **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md** — §0, §1, §6, §7, §12.3–§12.9, §14–§16.
6. **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md** §12 — review status and gaps.
7. **docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md** §2–§6 — frozen inputs, six questions, out of scope, evidence boundaries, expected output; §7 is the claim-to-evidence index.
8. Use REVIEWER_GUIDE §6 for the summary files; do not re-run behavioral experiments.

### Frozen inputs (do not edit; you may question whether they are sufficient)

The tables in design §12.3, §12.6, §12.7, §12.8 and the render-5 table in §12.9; render-1/2/3 bytes; 105 render-5 runs, all valid; 28 file rows / 21 combined; 24/24 host checks; 18/18 invariants; closed doc fences. Standalone preregistration files cover only §12.8/§12.9; §12.3/§12.6/§12.7 are recorded inside the design.

“Do not edit” means do not change the records to fit a conclusion. It does **not** mean the records are sufficient to support the design. You may identify gaps, require new experiments, or propose a different evidence base.

### First-principles review (mandatory, before Q1–Q6)

**A. Problem and layer.** Is the “uncheckable/unaddressable compaction” problem real and important? Is compaction the right layer, or should session storage, the host, a state plugin, or external files own it? What is the key failure: correctness, usability, cost, privacy, trust?

**B. Load-bearing parts of the thesis.** Restate “directory + view + reader + zero model calls + no state generation” in your words. Which parts are necessary, and which are historical choices or incidental constraints? If you remove one (allow a semantic layer, allow a sidecar, allow the model into compaction), does the design still stand?

**C. Assumptions and counterexamples.** Check at least: #N identity stability; verifiable directory completeness; exact field/offset read-back; host compaction hook and tool contract; the model will read / can be triggered; budget and cost control; the synthetic fixture represents real sessions; single-model results generalize; privacy policy can be enforced consistently. Which have evidence, which are assumptions? Give a counterexample or a minimal experiment that could overturn each.

**D. Alternatives.** Compare at least two alternatives, not only “a worse summary”. Options: change nothing; a better semantic summary; a separate state plugin; a hybrid semantic summary + addressable index; host-level long-term memory / automatic coverage; external files/task books as authority; a different index/reader protocol; host-enforced cover instead of a model-triggered one. Compare correctness, checkability, cost, privacy, implementation complexity and UX.

**E. Modification / refactor.** Separate keep / modify / refactor / replace. If refactor, say what survives (e.g. I/E/X, field spans, reader snapshot, needed cutoff) and what should be deleted or redone (e.g. cover, page table, budget formula, prompt trigger, privacy policy, host contract). Do not limit yourself to a local patch if the structure is wrong.

**F. Evidence needed.** What is the minimum acceptable evidence for your recommendation? New preregistration? Real sessions? Cross-model? A real host (cancellation/scheduling/permissions/TUI/fork)? 100k/200MB? If the current evidence cannot support any direction, say “insufficient evidence”; do not dress a design judgment as evidence.

### The six questions (details; answer briefly or mark “not applicable” if the premise is rejected)

**Q1. Is the deep-span cover mechanism sound?** The server merges consecutive windows into one result and prints the total cost. On 37K, C5 is 7/9 (all seven cover runs correct), C is 0/9, same-frame render-3 C is 0/9. Does it satisfy the bounded-view / addressable-original / exact-cost contract? Do coverMax, partial cover with next + isError, and a merged long body require new contract clauses?

**Q2. The 2/9 trigger gap.** Two of nine C5 runs never call cover (one zero-call, one scan only); A covers 0/3; D5 has 4/9 non-calls. Is a mechanism that is 7/7 correct when used but 2/9 non-trigger acceptable as a design baseline? Accept and document, or enforce coverage at the host layer? If prompt rules continue, what is the primary metric for a falsifiable next test?

**Q3. Cover cost and default policy.** On 37K, one cover result plus the view is about 43.8K chars, above the 39.3K original; on 15K it is about 21.7K, above 17.2K. One cover costs about 14.2K cumulative prompt tokens; three next calls cost about 28.2K. Should cover ever be default? Who owns coverMax, and what value? Should a per-call token/char ceiling exist?

**Q4. The 15K cover is redundant.** At 15K, max already covers the target and C is 9/9; C5 still uses cover 9/9 and adds 12% tool characters. Is “span > readMax prints cover” too broad? What gate should replace it? Is a new preregistered threshold experiment required?

**Q5. Host evidence boundary.** 24/24 covers registration, schema rejection, throw/isError, partial results, tool-layer concurrency, extension-side budget and hidden; the endpoint is a stand-in. Running cancellation, scheduler parallelism, permission-extension end-to-end, scope:"all", TUI/HTML, fork/context edit, 100 compactions, hosted provider and Pi 1.0/1.4 comparison are unverified. Is this enough to accept the tool contract? Which gaps block design, and which block implementation?

**Q6. Preregistration and scoring.** 105 runs are valid, but condition/arm order is fixed and not randomized; S2b is post-hoc; T4 scoring was widened after a smoke run; §12.8 measures coverage from request parameters while §12.9 uses the actual returned range; grounded is recomputed by a deterministic word list. Standalone preregistrations cover only §12.8/§12.9; §12.3/§12.6/§12.7 have no separate files. Are these deviations acceptable? Do you require a restatement (no re-run) or a new preregistration? Should the descriptive Wilson intervals stay?

### Output format

~~~text
## 0. First-principles conclusion
- Is the problem real / is the layer right?
- Load-bearing parts of the thesis (your restatement)
- Assumptions and the counterexamples most likely to overturn them
- Alternative comparison (at least 2; cost/privacy/feasibility)
- Recommendation: keep / modify / refactor / replace; what survives, what is redone
- Overall: ready / conditionally ready / refactor then review / not ready

## 1. Q1 ... Q6
For each:
- Verdict: accept / conditionally accept / reject / not applicable (premise rejected)
- Evidence: file + section/table row; no numbers outside the material
- Required changes: clause/default/table; if a new experiment is required, state the preregistered question and primary metric
- Blocking level: design / implementation / non-blocking

## 2. Design must-fix
## 3. Explore / new preregistration
## 4. Claims to weaken
## 5. Missing evidence
## 6. Language and scope limits
~~~

### Boundaries and prohibitions

- Do not treat tool reachability as model behavior; do not treat 7/9 as a probability or significance.
- Do not compare §12.8’s 0/24 with §12.9’s 7/9 as one time series or one measurement basis.
- Do not treat the in-process SDK + stand-in endpoint as real CLI / hosted provider / TUI / fork verification.
- Do not turn synthetic, single-model, 3-or-9-run results into production guarantees.
- Do not request or assume real session data; do not copy tool-result or model-answer text into the review.
- Do not edit frozen tables, render-1/2/3 bytes or design conclusions to “fix” numbers.
- **You may** challenge the premise, propose a different philosophy, an alternative architecture, a refactor or a replacement. Keep evidence and design judgment separate. Every criticism should carry a concrete alternative or a falsifiable test where possible; if none, write “needs exploration”, not a stronger reminder.

**Time and length.** 90–120 minutes, 3–6 pages. The first-principles section is mandatory; Q1–Q6 may be brief. No behavioral re-run is required. Optional offline check: node verify-bundle.mjs (about one second, no network). If a question cannot be answered, write “insufficient evidence” and say what is missing.
