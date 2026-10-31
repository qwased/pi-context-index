# pi-context-index 原型设计方案

- 日期：2026-10-30
- 性质：**原型设计 + 一次性验证记录**，不是发布承诺，也不是实施完成的证明。
- 依据：[0.2.0 独立第一性原理设计评审](../reviews/CODEMODE_0.2.0_INDEPENDENT_FIRST_PRINCIPLES_REVIEW.md)、[0.1.5 使用感受与 0.2.0 重构方向](../reviews/CODEMODE_0.1.5_EXPERIENCE_AND_0.2.0_DIRECTION.md)、[0.2.0 评审提示词](../reviews/CODEMODE_0.2.0_REVIEW_BRIEF.md)。
- 代码基线：本仓库 0.1.5（`68145e7`）。新插件是独立包，不修改、不迁移、不倒填本仓库的旧摘要。
- 数据边界：本文只使用合成夹具、聚合计数和合成样例；没有真实会话正文、真实会话路径或会话文件名。原型与实验脚本位于 git-ignored 的 `research/prototype/`，不进入 npm 包。
- 验证方式：一次性 Node 原型（目录、分区、渲染、reader）加真实 `deepseek-v4.1-flash-1017` API 调用。原型不是生产实现；真实会话、宿主集成、fork 与规模化性能仍未验证。

## 0. 结论摘要

1. **接受独立新插件、零模型调用、取消旧格式兼容、放开预算上限的方向。** 新包工作名为 `pi-context-index`，独立版本线从 0.1.0 起；与 `pi-vcc-codemode` 不能同时安装，因为两者都注册 `session_before_compact`。
2. **产物不是摘要，而是“保存记录的可校验目录 + 有限展示视图”。** 视图回答“记录过什么、原文在哪、哪些没展示”；不回答“现在要做什么、做到哪一步”。后者属于状态插件或用户维护的持久文件。
3. **双层分母，字段级覆盖。** 身份目录 `I` 枚举源快照内全部已分配 `#N` 的消息；有效历史 `E` 按当前分支、编辑投影和隐私策略冻结；`X = I \ E` 逐项记录结构原因。`E` 的消息级状态互斥分区为 `Live ⊎ Quoted ⊎ IndexOnly ⊎ Unavailable`，`unaccountedCount` 必须为 0。对 `Quoted` 的每个源字段，已展示跨度、未展示跨度、策略禁止跨度必须精确分区。
4. **顶部覆盖行必须给出保存区间，而不只是数量。** 原型实验发现：只写 `saved=470` 时，模型把最早保存记录答成 `#1`；改成 `saved=470 (#0-#469)` 后才可回答 `#0`。覆盖行同时给出状态计数、`X` 原因计数、`custom` 计数与可执行的 `view` 入口。
5. **预算按 `needed` 截止，不默认花满。** `C(ctx)=min(4000, 2000+0.005×max(0,ctx−200000))`，`T=clamp(15×blocks,1100,C)`，`Bcap=floor(T×c)`，`B=min(Bcap,neededChars)`。候选按 `H → U0 → EC → O → U1 → A` 支付；`needed` 是完整候选的最终渲染成本。原型中 7,850/8,217/9,583/12,560 四档生成完全相同的 7,096 字符视图；只有 6,287 档发生截断。更大的上限被允许，但没有理由用旁白填满。
6. **“值 + 引用”是台账行的最低形态，reader 必须有字段和偏移。** 只给 `read #5` 会把读者送进 19K/200K 记录的第一页；`scan` 命中必须返回字段路径、命中偏移、中心片段和可直接执行的 `read` 调用。`range`/`scan`/`read`/`touched`/`view` 共用同一快照与隐私策略。
7. **引用身份先保住 `#N` 与 `entryId`，不把短指纹设成逐行强制格式。** 内部保存完整摘要与 entryId；视图共享一次 source/snapshot；reader 校验来源域、entryId、字段跨度和内容摘要。跨文件 fork 若没有宿主持久化的继承映射与水位，就明确拒绝旧引用，不拿内容哈希假装补上。
8. **首版不落 sidecar。** 目录与视图从源流重建；sidecar 只能保存可丢弃的定位偏移和事件索引，不能保存独有的引用身份、曾展示文本或权威状态。删除/截断/乱序 sidecar 必须得到相同视图；源被删除时如实报告不可读。
9. **删除三个语义章节及其替身。** 不实现 `[Session Goal]`、`[Outstanding Context]`、`[User Preferences]`；不建 `plan`/`goal`/`preference`/`outstanding`/`currentState`/`authoritativeContract` 数据实体；不写 `task contract: authoritative`；不写 `[Decisions] not indexed` 这类假章节。位置不是计划，路径不是权威，未做语义索引也不应伪装成语义章节。
10. **原型验证的边界。** 18/18 结构不变式通过；合成夹具 470 条消息、467 条有效记录、30 条 live、71 条唯一操作、3 个错误、3 组计数向量；目录/视图/reader 的 p95 在单机约 7–8ms（仅该夹具）。真实 API 的行为结果见 §12；激活实验（§12.6）显示只给工具协议时本模型已会主动调用，提示词没有可测正确率增益。§12.7 给 U 行与 `view` 补上隐藏跨度的字段、起始偏移和可执行 `read`（render-2）后：T5 式 follow-up 12/12 正确、未再出现 §12.6 的 scan 词不匹配失败；但无关键词线索的 T6 在 A 下仍 2/3 出现 0 调用直接答错，且当目标位于约 15K 隐藏跨度的中段时，C/D 即使调用也多数到不了目标（12 条里仅 2 条把隐藏句带回，且这 2 条才答对）。§12.8 的 render-3 把 15K 跨度的地址写成 `span/pages/windows` + 成本化 `max` 窗口：C 合并 9/9（render-2 为 2/9），9 条都复制了 `offset=889 length=12000`；但 A 合并仍只有 1/9、7/9 零调用答错，37K 长跨度 24 条 0 条覆盖目标、0 条跟随 `next`，页表/`page`/`line` 在全部臂 0 次使用，分页规则 C2/D2 无可测增益，render-4 的 37K 全跨度只有 2/9 直接读、3/9 覆盖目标。§12.9 用 render-5 的宿主侧合并读取（`cover`：一次调用取完连续窗口、打印整段成本）补上覆盖：37K 上 C5 7/9 目标覆盖（7 条 cover 全对）；同视图 C 0/9、同帧 render-3 C 0/9。但触发仍未解决（C5 2/9 完全不调用、A 0/3 覆盖），15K 时 cover 多余（C 9/9、C5 +12% 工具字符），一次 cover 的 prompt 约 14.2K 而三次 `next` 约 28.2K。§7.4 的宿主层已在真实 in-process Pi SDK 上验证注册、schema 拒绝、`throw`/`isError`、权限钩子、部分结果、并发、预算与 hidden 撤回语义，模型端点仍是本机替身；运行中取消、调度并行、权限扩展、TUI、fork 与 100 次压缩未验证。单模型、单夹具、每条件 3–9 次、固定顺序，不构成总体概率或统计显著性；深跨度的产品默认、触发层与完整宿主集成仍未证明。

## 1. 产品契约

### 1.1 谁读、读后做什么

主要读者是压缩后继续工作的 agent；次要读者是核对历史的人。读者必须能区分三种东西：

| 读者看到的 | 含义 | 失败后果 |
|---|---|---|
| 视图中的逐字原文片段 | 某个保存字段的精确跨度，带 `#N`/字段/偏移/视图号 | 误读旧状态、错误引用，属于正确性失败 |
| 目录证明存在、但视图未展示的原文 | 有可执行地址，按需读取 | 多花检索轮次，属于可用性失败 |
| 目录也无法提供的内容 | 源缺失、损坏、策略排除或不可寻址投影 | 必须明确报告，不能伪装成可恢复 |

压缩器只描述 “发生过什么” 和 “原文在哪”。它不生成目标、待办、当前状态、撤销关系或“未验证”推断。没有当前任务来源时，正确结果是“继续工作所需信息不足”，而不是让压缩器生成目标。

### 1.2 必须可回答的问题

以下清单同时是评测问题族，不是新增语义章节。

| 问题 | 产物或 reader 必须给出的答案 | 不允许的替代 |
|---|---|---|
| 这是哪个会话、哪个分支、哪次快照？ | `refSpaceId`、snapshot、branch head、view id | 只有一个无来源的 `#N` |
| 最早还有多早？中间还有没有被隐藏的记录？ | `saved #0-#M`、`E` 计数、`view` 分页清单、`IndexOnly`/`Unavailable` 数量 | 用已选引用的最小值冒充历史起点 |
| 此处没写，是历史没有、被隐藏，还是读不了？ | `Live/Quoted/IndexOnly/Unavailable` 与原因；`scan` 负结果必须带范围 | 从未展示推断从未发生 |
| 这个数是谁、在什么记录中报告的？ | 值、作用域、字段路径、偏移、调用/结果引用 | 用另一版本、另一运行的数字代答 |
| 文件曾收到什么操作请求？ | 操作类型、字面路径、次数、各次来源；`host` 聚合另记 | 把工具调用直接叫成磁盘变更或最终文件状态 |
| 某条旧要求原文是什么，后来还有哪些用户发言？ | 可按序枚举的用户消息及缺失行地址 | 生成“当前约束”或推测撤销关系 |
| 记录中曾如何表达验收要求、限制或更正？ | 对原文的可定位读取；展示覆盖可查 | 从没有对应工具记录推断“尚未验收” |
| `#N` 现在仍指向当初那条记录吗？ | 身份/内容/快照校验结果；失配不返回别条 | 最近编号、相似文本或扫描结果自动顶替 |
| 如何继续读取一个超长记录的命中处？ | 字段、命中偏移、范围页、稳定游标 | 只让读者从记录第一页重新开始 |
| 哪些工具或内容类别没被台账识别？ | 支持范围、`unsupported` 计数、原始记录仍可读 | 声称操作台账等于全部真实文件变化 |
| 文件路径指向什么？ | 历史中出现的字面路径及出处；当前内容由文件工具另读 | 压缩器复述文件或替用户指定权威文件 |
| 离开此会话后到哪里找任务？ | 用户/状态插件维护的持久文件；压缩器只保留已有字面出处 | 让随会话消失的视图成为目标的唯一保存地 |

目录可以证明一条记录可达，不能保证模型点击它、正确解释它。结构可达率与任务正确率必须分开报告。

### 1.3 明确的非目标

| 不做 | 原因 |
|---|---|
| 不实现 `[Session Goal]`、`[Outstanding Context]`、`[User Preferences]` | 意图/状态/偏好推断；中文与自由表达下不稳定；与 AGENTS.md 重复且会过期 |
| 不读取 `/plan`、`/GOAL` 或任何任务文件 | 压缩器不替用户决定权威文件；外部文件会变化 |
| 不识别插件名、不为任何 `customType` 写特殊代码分支 | 唯一接触点是配置 `skipCustomTypes` |
| 不生成“谁推翻谁”“supersedes”“当前状态”“未验证/待办” | 时间顺序只证明先后，不证明撤销；状态由状态插件负责 |
| 不要求逐行 `#N@6hex` | 短指纹只检出部分失配，不保留身份；视图共享来源域/快照即可 |
| 不承诺所有历史/所有字段直接可见 | 有限预算不可能无损编码任意增长的历史；承诺改为“目录完整、原文可寻址、覆盖可查” |
| 不承诺自动识别所有敏感信息 | 只做精确策略与宿主显式标记；启发式秘密扫描不是零漏检保证 |
| 不把工具调用日志当磁盘事实 | 外部进程、自定义工具和失败请求使台账与工作树不同 |

### 1.4 两种首消息形态

不做“任务书识别”。形态差异由 `U` 的实际字节自然体现：

- **形态 A：首条消息本身是长任务书。** 用户原文成本高；长消息按完整行头尾摘录，短消息整条保留；未展示行有精确行范围和地址。
- **形态 B：短指令 + 外部任务书文件路径。** 用户原文很短，视图只保留指令原文和字面路径；不读取、不复述文件内容。若历史中恰有该文件的读取记录，只记录那次读取的调用/结果出处；文件当前内容由读者另读。路径本身也可能敏感，不能因为“只是路径”就自动打开。

两种形态使用同一个分配器；形态 B 的 `needed` 更小。原型中形态 A 的完整 `needed` 为 7,096 字符，形态 B 为 4,903 字符；不是新的测量结论，而是合成夹具的成本。

### 1.5 职责边界与状态插件

| 压缩器不做 | 状态插件不依赖 |
|---|---|
| 写状态指针行、读任务文件、识别 `/goal` 一类插件名 | 不依赖摘要内容（视图可能省略它的行） |
| 把插件状态复制进视图、出现 `done/verified/success` 这类状态断言 | 不依赖 tail 一定保留自己（keep-tail 是启发式） |
| 为任何 `customType` 写特殊代码分支 | 不把状态只存在某次工具结果里 |
| 为“未解决/待办”新增推断章节 | 在压缩插件被禁用或换回 Pi core 压缩时仍要能工作 |

五种“非自愿接触”的处置：

| 机制 | 本设计处置 |
|---|---|
| 每轮注入进入摘要 | 可识别的 `custom_message` 由 `skipCustomTypes` 排除展示与派生索引正文；目录只保留结构计数；不能转成 user 后丢掉来源再过滤 |
| `custom_message` 不占 `#N` | 不改计数规则；custom 以 `entryId` 登记，不混进数值范围；被排除时不显示正文 |
| `keep:N` 只数 user | 仍只按宿主可辨识的真实 user 边界处理；普通 user 注入且无机器来源标志时，明确不保证 keep 计数不被污染；不靠文本或插件名猜 |
| 重复注入污染召回 | 可识别 custom 排除策略同步到 `view/scan/read/range/touched`；普通 user 的精确重复可合并检索展示，但保留全部来源、顺序并可展开；不从目录删除 |
| 自建写工具没进 Files | 只把明确支持的结构调用/宿主 `fileOps` 进操作台账；其他记录仍可读；报告 `unsupported` 数量，不承诺全部真实文件变化 |

### 1.6 禁用断言的边界（本设计的一项决定）

原始方向禁止产物出现 `done/verified/success`；独立评审指出，这与“任意原文逐字展示”矛盾。本设计采用**按来源区分**的规则，而不是把包含这些词的原文行整体隐藏：

- **生成的模板/结构行**（覆盖行、note、行标签、省略标记、`view`/`read` 提示）不得把 `done`、`verified`、`success`、`complete` 当作状态断言；不得生成“已完成/已验证/成功”语义。
- **逐字源跨度**可以包含任何词，包括这些词；它必须带 `#N`、字段、偏移/行范围和视图号，并被明确标记为引用。引用不是断言：覆盖行与 note 已声明“历史记录，不是当前状态或成功证明”。
- 测试分两层：模板词法扫描失败即阻断；引用跨度用源子串精确校验，不允许删词后冒充逐字。
- 这是对独立评审 §11.3 严格字面读法的主动偏离。若未来仍要求“任何位置都不出现这些词”，必须同时接受“包含这些词的源行只能 IndexOnly”，并按产品决定显式修改契约；不能由实现者悄悄放宽。

## 2. 不变量与可测断言

| 不变量 | 可自动测试的断言 |
|---|---|
| 双层分母 | 用独立源枚举器构造 `I`；`E` 是分支/投影/策略的结果，`X=I\E` 逐项有原因；`E + X = I`（按消息计数） |
| 消息级完整分区 | `E = Live ⊎ Quoted ⊎ IndexOnly ⊎ Unavailable`；四集合互斥；`unaccountedCount=0`；故意漏一条/重复一条测试必须失败 |
| 精确范围 | 生成 system、分支洞、编辑、噪声、custom 交错序列；展开所有 `saved` 区间后等于登记集合，绝不把 min/max 中的洞认作已展示 |
| 字段级完整 | 对每个 Quoted 字段，`shown ⊎ hidden ⊎ policyExcluded = allowed`，互不重叠；只引用首行不等于覆盖整条 19K 消息 |
| 指针不静默消失 | 每个未显示项可经顶部 `view` 和有限分页到达；末页显式结束；删掉页或游标续页校验失败 |
| 身份单调 | 同一追加式会话 `I_t ⊆ I_(t+1)`，既有 `n→entryId` 不变；摘要选集变化不影响它；不可读项保留身份墓碑 |
| 不要求展示单调 | 允许 `Shown_t ⊄ Shown_(t+1)`；已移出显示的项必须转入 live/indexOnly/其他明确状态，不得丢目录地址 |
| 引用可校验 | 所有引用验证来源域、entryId、源跨度和内容摘要；内容/文件身份变动时返回失配，不静默改指向 |
| 原文保真 | 每段引用严格等于声明字段的 `[start,end)` 子串；模板、插入的闭围栏和观测聚合分别标注为结构产物 |
| 数字有作用域 | 每个计数校验同一次记录/调用的来源与字段；放入相同数字、不同版本或不同运行的干扰项，不得通过数值相等蒙混 |
| 结构事实不冒充效果 | 工具请求、结果存在、错误标志、报告计数分别核对；`write` 调用本身不产生“文件已变更”事实 |
| 时间保真 | 正文按源顺序及字段偏移排列；不因优先级选择而倒置；不自动产生 supersedes/current state 字段 |
| 预算真实 | 最终 UTF-16 长度不超过 `B`；引用、区间、分隔符、围栏修复、来源头全部计费；超长单行也不得越界 |
| 确定性 | 相同完整输入（源前缀、分支、切点、版本、配置、隐私策略、`c`、预算参数）重复运行得到相同字节与清单摘要；禁用时钟和缓存命中作为选择依据 |
| 可重建 | 删除/截断/打乱 sidecar 后，从相同源与版本重建，目录、选择跨度、视图文本逐字相同；不使用缓存才能恢复的隐藏状态 |
| 编辑与尾部 | 给定同一源身份的编辑投影，不重复复制 live 的同一跨度；尾部滑出时旧跨度仍在目录，并重新参与本轮选集 |
| 隐私一致 | 被排除内容在 summary、view、scan、read、range、touched、缓存和日志中均不可返回；直接 `read #N` 不得绕过策略 |
| 标记可执行 | 每个渲染出的结构调用交给真实 parser 和 reader 执行；不接受没有 query 的 scan 伪指令 |
| 无摘要自喂 | 历史 compaction 文本和 recall 自回声不成为新叙事候选；只按允许的元数据用途处理，跨 100 次压缩仍成立 |
| 围栏结构 | 使用实际围栏状态机，而非“行数为偶”；头/尾摘录切断围栏时先闭合再标记再重开；结构头与标记在围栏外 |
| 形态无关 | 同一分配器处理 A/B；A 的 `U` 成本自然大，B 的 `U` 成本自然小；不靠任务书识别、不复述外部文件 |

## 3. 数据模型

### 3.1 权威来源与快照

```ts
Source {
  schemaVersion: 3
  refSpaceId: string            // 会话/分支引用域；不是临时绝对路径
  snapshot: {
    sourceId: string            // 会话头 id 或稳定摘要
    sourceEndBytes: number      // 快照时的文件大小；之后的追加不污染
    prefixDigest: string        // 到 sourceEndBytes 的流式 SHA-256
    branchHeadId: string        // 当前分支叶子
    messageCount: number        // I 的消息数
  }
  recipe: {
    cut: { firstKeptEntryId: string; mode: "user-turn"|"budget"|"compact-all"; keepUserTurns: number }
    projectionVersion: "proj-1"
    extractorVersion: "obs-1"
    rendererVersion: "render-1"       // render-3 另有 span/pages/max/cost；按版本冻结
    pageChars: number                 // 1200；隐藏跨度页网格
    readMaxChars: number              // 12000 默认；宿主策略；48000 仅探索臂
    policyDigest: string
    ctxTokens: number           // 本次压缩输入的宿主计量，不重估
    blocks: number              // E 在噪声过滤前的结构块数
    charsPerToken: number       // 固定到 recipe；只用于分配，真实费用另计
    capChars: number
    neededChars: number
    usedChars: number
  }
}
```

`prefixDigest` 用于判断快照是否仍可校验；session 追加到 `sourceEndBytes` 之后不影响旧快照。`refSpaceId` 不能用临时绝对路径充当；输出/details 不打印原始路径。

### 3.2 Entry、Span、Observation、View、Cursor

```ts
Entry {
  n: number | null              // 消息的会话全局 #N；custom/compaction 为 null
  entryId: string               // 宿主 entry id
  sourceLocator: { lineStartByte: number; lineEndByte: number } | null
  sourceDigest: string          // 完整 SHA-256（内部校验，不逐行打印）
  origin: { role: string; customType?: string; hostKind?: string }
  membership: { branch: boolean; effective: boolean; live: boolean; reason?: string }
  access: "readable" | "policyExcluded" | "unavailable"
  sourceChars: number
  revisionEntryId?: string      // 该消息的有效文本来自哪条 context_edit
}

Span {
  entryId: string
  n: number | null
  fieldPath: string             // content, content.0.text, ...arguments.path, nestedCalls....
  startUtf16: number
  endUtf16: number
  revisionEntryId?: string
}

Observation {
  kind: "toolCall" | "pairedResult" | "errorFlag" | "reportedCounter" | "hostFileOp"
  sources: Span[]               // 调用、结果、字段跨度
  literal: { tool?: string; op?: "write"|"edit"|"other"; path?: string;
             command?: string; pass?: number; fail?: number; value?: string; raw?: string }
  scope: { recordId?: string; toolCallId?: string; runKey?: string; command?: string }
  resultIndex?: number | null
}

View {
  id: string                    // "v" + 8 hex
  source: { refSpaceId: string; snapshot: Source["snapshot"] }
  entries: Array<{
    n: number | null
    entryId: string
    status: "Live" | "Quoted" | "IndexOnly" | "Unavailable"
    reason?: string
    sourceChars: number
    shownChars: number
    spans?: Span[]              // 只对 Quoted；IndexOnly 的整条记录默认全隐藏
  }>
  custom: Array<{ entryId: string; customType: string; status: string; reason?: string }>
  counts: {
    saved: number; effective: number; live: number; quoted: number
    indexOnly: number; unavailable: number; outside: number
    byReason: Record<string, number>
    custom: number; customExcluded: number
    unsupported: number; hostOps: number
    unaccounted: number; blocks: number
  }
  cost: {
    neededChars: number; capChars: number; usedChars: number
    fixedChars: number; coverChars: number; noteChars: number; timelineChars: number
  }
}

Cursor {
  viewId: string
  snapshotDigest: string
  mode: "view" | "read" | "range" | "scan" | "touched"
  nextEntry?: number | null
  nextField?: string
  nextOffset?: number
  query?: string
  scope?: "view" | "all"
}
```

### 3.3 身份与引用

- `#N` 按保存文件中 `type=message` 的计数顺序分配，跨压缩、跨同文件废弃分支；不是窗口序号。
- 同文件追加/retry：旧 `#N` 保持；变化的是分支/有效投影成员关系，另记 `X` 原因。
- context-edit：目标消息保留 `#N` 与原始 `sourceDigest`；有效文本来自 edit entry，`revisionEntryId` 指向它。`read #N` 默认返回原始保存记录；`read #N revision=<editId>` 返回投影文本；缺可寻址投影时不展示，明确结构限制。
- 跨文件 fork：子文件若不能从物理序列推导父映射，必须在权威会话元数据保存 `parentRefSpaceId`、编号水位和必要的继承映射；否则新文件使用新 `refSpaceId`，旧 `#N` 返回 `refSpace mismatch`，不静默重编号。该项是发布阻断项，不能由 sidecar 或内容哈希补上。
- 视图内部保存完整摘要与 entryId；视图共享一次 `refSpaceId/snapshot`，不逐行重复 6/16/64 hex。短指纹只用于显示或候选过滤时也必须带来源域，且不能替代完整校验。

### 3.4 custom/compaction

- `custom_message`、`branch_summary`、`compaction` 不占 `#N`；以 `entryId` 登记。
- 被 `skipCustomTypes` 排除的 custom：`CustomPolicyExcluded`，正文不进入视图/扫描/读取/日志；只保留允许的结构计数。
- 未被排除的 custom：`CustomLive/CustomQuoted/CustomIndexOnly/CustomUnavailable` 分区；视图行使用 `e:<entryId>`，reader 支持按 entryId 读取。
- compaction/branch summary 是历史摘要，不能成为新工作事实或助手锚点；只登记存在性和元数据，防止摘要自喂。

### 3.5 sidecar 取舍

| 选择 | 判断 |
|---|---|
| 首版不落 sidecar，流式重建 | 推荐作为正确性基准；先测目录/分页 p95，再决定缓存 |
| 可丢弃的字节偏移/事件索引缓存 | 可接受；缓存键含源前缀、身份域、分支、投影/解析版本和隐私策略 |
| sidecar 存独有引用身份、曾展示文本或手工修订 | 拒绝；删除缓存就会改变历史或引用语义 |
| 在 compaction details 中保存 view 选择跨度和 recipe | 可接受；这是“当时显示了什么”的结构事实，不是当前状态 |
| `cited` 与 `shown` 两集合 | 不足；必须有独立全集、排除原因、可读性与字段跨度 |

首版细节实现建议：`details.view` 保存状态数组和 `Quoted` 的展示跨度（O(E+B)），不保存正文；`IndexOnly` 只保存原因和整条绑定；隐藏跨度由源字段与策略在读取时复算。这样 details 不随巨型工具输出膨胀。

## 4. 构建流程

### 4.1 输入

`session_before_compact` 事件提供 `preparation`、`branchEntries`、`customInstructions`；上下文提供 `sessionManager.getEntries()`、`getBranch()`、`getSessionFile()`、当前模型/预览等。新插件使用：

- `preparation.tokensBefore` 作为 `ctxTokens`；
- `branchEntries` 作为当前分支顺序；
- `getEntries()` 作为完整文件顺序（含废弃分支、system、custom）；
- `getSessionFile()` 作为流式回退；
- `preparation.fileOps` 作为宿主文件操作聚合；
- `preparation.previousSummary` 只用于识别旧摘要/自喂，不作为新视图正文来源。

### 4.2 流式目录

1. 固定快照：文件大小 `sourceEndBytes`、分支头 `branchHeadId`、前缀摘要。
2. 单次流式读取 JSONL：为每条 `type=message` 分配 `#N`，记录 entryId、字节位置、完整消息摘要、role、是否 system；为 custom/compaction 记录 entryId 和类型。跳过错行但计数损坏行，报告 `malformedLines`。
3. 计算 `branchIds`（从 head 回溯 parent 链），投影 context edits；得到有效消息序列。一个源消息投影成多个消息/块时，`E` 按 entryId 去重身份，块数另计。
4. 计算 `E`：排除 system、`bashExecution.excludeFromContext`、策略排除、`skipCustomTypes`（custom）；不可读项进入 `Unavailable`。
5. 计算 `X`：`I` 中未进入 `E` 的消息，逐项原因 `system`、`off-branch`、`context-edit-excluded`、`policy-excluded`、`not-effective`。
6. 计算 `live`：当前切点到 head 的实际消息成员集合，不是 `n>=liveFrom` 的包围盒。
7. 计算 `blocks`：`normalize(E)` 在噪声过滤前的块数；system/skip custom/策略排除不涨预算；消息数、投影块数分开记录。
8. 提取 observations：工具调用/结果配对、嵌套调用、错误标志、报告计数、宿主文件聚合、unsupported；所有行记录 source spans/scope。
9. 生成候选单元并选择视图；渲染；计算 `viewId`；写 details。

### 4.3 内存与巨型输出

- 目录只保存 `entryId`、`#N`、字节位置、长度、role、摘要；不保存全部正文。
- 巨型工具输出由 `sourceLocator` 定位；候选/扫描只读取有界窗口；命中处用字段偏移直接读取，不把整条 200K 记录复制进内存多次。
- `E` 的身份去重与块数分开；一个工具结果投影成多个块不产生多个身份。
- `scan` 流式处理，按页返回命中；`read` 只解析目标行/字段；`touched` 用目录中的路径→引用索引，不读正文。

### 4.4 切点

新插件复用既有切点行为（默认 `keep:1`、smart keep-tail 5K–25K、显式 `keep:N`、compact-all 回退、无用户锚点时的 token 预算切点），把它封装为 `cut.ts`。切点不是本设计的创新点；它决定 `firstKeptEntryId` 与 `live` 集合，必须记录到 recipe，并由宿主集成测试钉住。上下文编辑的目标若落在 tail 内，先解析切点再投影，保证编辑作用于旧消息。

## 5. 预算与选择算法

### 5.1 公式

```text
C(ctx) = min(4000, 2000 + 0.005 × max(0, ctx − 200000))       // token 额度
T      = clamp(15 × blocks, 1100, C(ctx))                     // token 额度
Bcap   = floor(T × c)                                         // UTF-16 chars
B      = min(Bcap, neededChars)
```

- `ctx` 是本次压缩输入的宿主计量（`preparation.tokensBefore`），不是重放时从摘要估出来的新数。
- `c` 固定到 recipe 的 `charsPerToken`；只用于分配，真实模型费用另用实际 tokenizer 计量。建议沿用现有校准并 clamp 到 `[2,6]`。
- `blocks` 是允许进入本视图的有效内容在展示噪声过滤前的结构块数；system、跳过策略、策略排除不涨预算；消息数、投影块数分开记录。
- `floor` 保证字符上限；最终 UTF-16 长度仍须实测。原型使用 `c=3.14`、`blocks=467`、`ctx=410,462`，得到 `C=3052`、`Bcap=9583`。
- 该函数是分段线性；600K 左右达到 4,000 上限，不必到 800K。

### 5.2 `needed` 与候选

`neededChars` 是**完整候选集的最终渲染成本**，包含覆盖行、note、分隔符、引用、区间、围栏修复和所有结构字节。先构造候选、算 `needed`，再决定 `B`；不允许“预算有多大就生成多少候选”。

候选类别与支付顺序：

| 序 | 类别 | 内容 | 说明 |
|---|---|---|---|
| 1 | **H** | 最小结构封面 | 来源/快照、`saved #0-#M`、`E`、各状态计数、`X` 原因计数、custom/unsupported/hostOps、`view` 入口；缺内容时不打印空洞提醒 |
| 2 | **U0** | 用户原文核心 | 短消息整条；长消息按完整行取头/尾核心（原型 2+2 行，实验对照 4+4）；所有用户消息先各得一个单位 |
| 3 | **EC** | 结构错误 + 有作用域的计数 | 解析协议支持或原文跨度完整的观测；错误带调用/结果引用；计数带值、字段、偏移 |
| 4 | **O** | 操作请求台账 | 按 `(op,path)` 合并，保留全部来源列表；`host` 聚合另记；`unsupported` 另计 |
| 5 | **U1** | 用户原文加深 | 长消息逐轮增加完整行，头/尾交替；只在 O 完整后使用剩余预算 |
| 6 | **A** | 可选助手锚点 | 每个真实用户轮选首/末助手文本轮转，完整行，总目标 ≤800 chars；只是结构抽样，不命名为计划，不承诺保全未验证项 |

选择规则：

1. 若 `needed ≤ Bcap`，全选，`B=needed`；不填满上限。
2. 若 `H + U_full ≤ B`，先全选用户原文（“U 全量放得下就不截断”），再依次 EC、O、A；后续类别可因预算不足而部分/全部 IndexOnly。
3. 否则，先选 U0 核心：每条用户消息至少一个完整行单位；短消息整条；长消息首/尾完整行。**不对单条长消息做字符切**；单行超过 `MAX_LINE_CHARS` 时该行不展示，整条转 IndexOnly/oversize。
4. 选 EC（错误优先于计数，组内源顺序）；选 O（按首次调用的源顺序；同一 `(op,path)` 合并，引用超过上限时列出前 N + 余数，完整清单在 `view`）。
5. 若 O 完整且仍有余额，执行 U1 逐轮加深；最后选 A。
6. 高层类别只要有单位因预算放不下，就停止进入更低层（A/加深不抢已部分失败类别的预算）；U0 的 oversize/no-display 不算预算失败，不阻断 EC/O。
7. 输出按源顺序排列；选择优先级只影响“选什么”，不影响“怎么排序”。同类内按公开结构顺序（`#N`、首次调用、源顺序），不做语义评分、不按关键词找禁令。
8. 最终重新计算覆盖行计数；若精确字节超过 `B`，从最低优先级、最晚的单位开始回退，直到满足。

### 5.3 四档算例（c=3.14，blocks=487）

| ctx | C(token) | T(token) | Bcap(chars) | 说明 |
|---:|---:|---:|---:|---|
| 200,000 | 2,000 | 2,000 | 6,280 | 旧 6,287 来自 c=3.1435/round 口径；按 floor 契约是 6,280 |
| 300,000 | 2,500 | 2,500 | 7,850 | |
| 410,462 | 3,052 | 3,052 | 9,583 | 方向文档写作 9,588 的同一量级 |
| 500,000 | 3,500 | 3,500 | 10,990 | |
| 800,000 | 4,000 | 4,000 | 12,560 | 上限 |

- 1,100 token 窄端，`c=3.14` 时 `Bcap=3,454`；结构封面约 200–250 chars，其余按 U0/EC/O 顺序。
- 4,000 上限时 `Bcap=12,560`；若 `needed` 只有 7,096，视图停在 7,096，不用旁白填满。
- 这些是算术验证，不是某次真实会话的渲染实测；真实成本以实际 tokenizer 为准。

### 5.4 原型中的 `needed` 结果

合成夹具（470 条消息、467 条有效、30 live、71 条操作）在 `c=3.14` 下：

| 档位 | 视图字符 | 说明 |
|---|---:|---|
| 6,287 | 6,273 | 部分 O/锚点被 IndexOnly |
| 7,850 | 7,096 | 完整 `needed`；不填满 |
| 8,217 | 7,096 | 完整；与 7,850 逐字相同 |
| 9,583 | 7,096 | 完整；与 7,850 逐字相同 |
| 12,560 | 7,096 | 完整；与 7,850 逐字相同 |

这直接验证了“允许更大上限，但不默认花满”：超过 `needed` 的预算不产生任何新字节。0.1.5 在同一夹具、9,583 预算下仍有 9,560 字符，保留 62/66 条工具行（旧分类计数）；但 API 对照中模型只列出 57/71 个路径，旧行没有形成完整台账。格式差异与预算差异必须分开归因。

## 6. 渲染格式

### 6.1 覆盖行

原型格式（精确计数由目录计算，不由选集反推）：

```text
[Index] r=1ea8114d s=640fc02b saved=470 (#0-#469) E=467 live=30 quoted=78 indexOnly=359 unavail=0 X=3{system=1,branch=2} custom=1{excluded=1} view=v6361211c
```

生产建议用更可读的键：

```text
[Index] source=1ea8114d snapshot=640fc02b saved=#0-#469 (470) effective=467 live=30 quoted=78 indexOnly=359 unavailable=0 outside=3{system=1,branch=2} custom=1{excluded=1} view=v6361211c
```

要点：

- `saved` 必须带**保存区间**，不能只写数量；否则读者无法回答“最早还有多早”。
- `E` 是所有有效消息身份数；`live + quoted + indexOnly + unavailable = E`。
- `outside` 是 `X`；原因只打印非零项。`custom` 是分支上的 custom 数，`excluded` 是策略排除数。
- `view` 是当前视图号；`context_index` 的 `view` 动作可列出完整清单。
- 覆盖行属于固定成本，计入预算；它不参与“header 20%”那类可裁剪预算（本设计没有语义 header）。
- 没有内容时不要打印空封面；没有某类缺口时不打印该类提醒。

### 6.2 note

```text
Quoted source and recorded observations; not current state or proof. #N saved message; v view; use context_index. O = recorded call request, not a disk effect. C = reported counter with field/offset.
```

- 约 200 chars；固定成本。
- 不出现 `done/verified/success` 状态断言；`not current state or proof` 是否定句。
- 如果产品决定允许引用中的这些词，note 必须明确“引用不是断言”；见 §1.6。
- note 只声明工具存在；何时调用由 §10.5 的系统提示词规则负责，不把长提醒塞进视图正文。

### 6.3 时间线

单一 `[Timeline]`，按源顺序排列，不按类别重排。行类型：

| 行 | 形态 | 说明 |
|---|---|---|
| `U` | `U #1 [lines 1-10, 145-154 of 154; hidden 11-144; field=content 809-15943 of 17173; read: {"read":1,"field":"content","offset":809,"length":1200}; view v…]` + 逐字行 | 用户原文；完整行；隐藏行范围、字段、起始偏移和可执行 `read` |
| `A` | `A #157 (full 87 chars)` + 逐字行 | 可选助手锚点；完整行；不命名计划 |
| `O` | `O edit src/ops/op-007.ts (#26; result #27) {error observed}` | 操作请求；`op/path` 字面；引用/结果；同 `(op,path)` 合并时 `xN` 与引用列表 |
| `E` | `E error tool=write nested:1 {#142; result #143} "permission denied"` | 观测错误；工具/嵌套/引用/原始错误首行 |
| `C` | `C bun test …: 422 pass / 0 fail {#5; result #6; content.0.text@21165}` | 报告计数；值、作用域、字段、偏移、引用 |
| `O host` | `O host write src/host-only.ts (host aggregate; no record ref)` | 宿主聚合；无 `#N`；不冒充调用记录 |

示例（合成）：

```text
[Timeline]
O write src/allocator.ts (#3; result #4)
C bun test tests/allocator-golden.test.ts: 422 pass / 0 fail {#5; result #6; content.0.text@21165}
U #7 (full 65 chars)
Keep tests isolated; use a temporary config path for the harness.
O edit src/ops/op-007.ts (#26; result #27) {error observed}
E error tool=edit {#26; result #27} "edit failed: pattern not found"
A #151 (full 133 chars)
I will continue with the ledger and the structural tests. The TUI manual check was not run; the real-session hook replay was not run.
```

- 引用行不得把 `(#N)` 插进围栏 info string；`attachRef` 的教训保留。
- 完整行摘录：head 若结束在未闭合围栏内，先补闭合行；tail 若起点在围栏内，先补原始 opener；省略标记和结构行在围栏外。插入的围栏行是结构产物，成本计入。
- 隐藏跨度必须带字段、UTF-16 起始偏移和可执行 `read`（render-2）；只有行号时，模型只能从字段 0 开始或猜一个 `scan` 词，§12.6 的 T5/C 就是这样失败的。地址行是结构产物，计入预算（render-2 每条部分引用约 +110 chars；render-3 的 `span/pages/windows/max/cost` 再加约 40 chars），可能挤掉同一 U 行的一级加深；§12.7 的 t5n 视图因此从 6,233 降到 6,135 chars，§12.8 的 t6 从 6,137 增到 6,177 chars。地址只指向隐藏跨度起点，不保证深在中段的目标落在第一页内；§12.8 的 max 窗口可以一次覆盖 12K，但超过 12K 仍要第二次读取，而 24 条长跨度运行 0 条跟随 `next`。这是结构缺口，不是地址格式错误。
- 单行超过 `MAX_LINE_CHARS` 不按字符切；整行隐藏，提供精确字符/行地址。
- 行前缀是结构，不是原文；每个逐字块在 manifest 中有源跨度。读原文用 `read`，不把前缀当作源文本。
- 不生成 `[Decisions] not indexed; scan …` 这类假章节；`scan` 的负结果由 reader 返回。

### 6.4 预算计费

- 覆盖行、note、`[Timeline]`、行标记、引用、隐藏范围与地址（`field=… read: {…}`）、围栏修复、换行全部计入最终 UTF-16 长度。
- 预算是真实字符，不是 token 或词；换行也是字符。
- `usedChars == summary.length`；`usedChars <= B`；`B = min(Bcap,needed)`。
- 任何为了围栏/结构插入的字节都要重新计费；不能用“修复不计费”掩盖超限。

## 7. Reader 协议

### 7.1 工具与动作

工具名建议 `context_index`（独立于旧 `vcc_recall`；两插件不共存）。参数是单动作优先：

```json
{"view":"v6361211c","offset":0,"limit":20}
{"view":"v6361211c","status":"IndexOnly","offset":0,"limit":20}
{"read":42,"field":"content.0.text","offset":18600,"length":800,"revision":"edit-id"}
{"read":1,"field":"content","page":2}
{"read":1,"field":"content","line":90,"length":1200}
{"range":[0,80],"role":"user","page":1}
{"scan":"422 pass / 0 fail","scope":"view"}
{"scan":"pass","scope":"view","cursor":"opaque"}
{"touched":"src/ops/op-007.ts"}
```

- `view`：按状态过滤、分页；每项一行：`#N status role src=… shown=… reason=… spans=… hidden=… read: {…}`；`Quoted` 行必须同时给出 hidden 跨度的字段/偏移和可执行 `read`，不能只给行号；`IndexOnly` 行把整条主文本字段当作 hidden 跨度给出地址。末页显式 `end of view`；custom 单列；失败页/游标明确报错。实际形态（render-2，合成）：
  ```text
  #1 Quoted user src=17173 shown=2019 spans=content:0-75,content:76-131,… hidden=field content 809-15943 of 17173; read: {"read":1,"field":"content","offset":809,"length":1200}
  #6 IndexOnly toolResult src=21195 shown=0 reason=unselected hidden=field content.0.text 0-21195 of 21195; read: {"read":6,"field":"content.0.text","offset":0,"length":1200}
  ```
  只含换行的相邻间隙不算 hidden 跨度，不生成地址；一页最多列 2 个 hidden 跨度，其余以 `+N more` 提示，完整范围由下一页/字段读取取得。
  render-3 对每个超过 1,200 chars 的 hidden 跨度加页表：`span=… pages=… windows=…; pages@889,2089,…,14089,+1 more (last@15289); max: {…} ~3822tok; page: {…}`。页从跨度起点按 1,200 chars 固定网格切，末页可短；页表是精确偏移表，不是语义索引，页号本身不告诉读者目标在哪一页。页表只随 `view` 取回，时间线不复制它。
- `read`：字段 + 偏移/页/行 + 长度；返回精确子串、字段名、范围、下一页。`read #N` 默认原始保存记录；`revision` 读投影；`scope:"all"` 显式读分支外/编辑前缀原始记录；策略排除永远报错。`page=k` 从该记录最大 hidden 跨度的第 k 页（1-based）解析到 `start+1200(k-1)`；`line=L` 解析到字段第 L 行的起点；`page`/`line` 互斥且不能与 `offset` 同用；越界返回明确范围，不静默夹取。render-3 的 `read` 结果附加 `[cost N chars ~Ttok; hidden span a-b, unread U]`，成本是按 recipe 的 `c` 估算，不是计费。
- `range`：按 `#N` 顺序列出记录元数据/首行预览；`role` 可筛用户时间线；分页；不把巨型记录整条塞进一页。
- `scan`：字面、大小写不敏感；返回记录、role、字段路径、命中偏移、中心片段、可直接执行的 `read` 建议；同一长记录可有多个命中；cursor 绑定 view/query/scope/snapshot；负结果说明搜索范围。`scan` 的命中片段不是完整字段；要继续读命中处，用返回的 `read` 地址，不要从字段 0 重开。
- `touched`：按字面路径列出记录中的操作请求/读取/宿主聚合；不是当前工作树 diff。
- 所有动作共用同一快照、隐私策略和引用域；策略/分支/快照变化使游标失效，不悄悄切到最新历史。`view` 缺省时绑定**最近一次 compaction 的 view**；宿主必须在 `content` 首行或 `details.viewId` 回显绑定的 id，显式 `view` 不匹配则报错，不静默切换。宿主应鼓励每个动作带 `view`，因为历史视图可能保留多个快照。原型 reader 的 `view` 动作已回显 id；`read`/`scan` 等动作依赖固定 view 实例、不回显，这是宿主集成时要补齐的一处，不能把原型的省略当成产品行为。

### 7.2 读取深偏移的例子

```text
#6 [toolResult] field=content.0.text 21165-21185 of 21195
422 pass / 0 fail
[next: read #6 field="content.0.text" offset=21185 length=1200]
```

- 目标在 19K/200K 记录尾部时，一次 `read` 直达，不要求从第一页翻。
- `scan` 先给字段与偏移，再给 `read`；不要只给 `#6`。
- `U` 行的 `hidden` 是行号；同一行/对应 `view` 行必须给出隐藏跨度的字段、起始偏移和可执行 `read`。§12.6 的 T5/C 失败说明只有行号时，模型会读字段开头或 scan 一个不匹配的词，然后停在可见段。
- 隐藏跨度地址的实际形态（render-2，合成）：

  ```text
  U #1 [lines 1-10, 145-154 of 154; hidden 11-144; field=content 809-15943 of 17173; read: {"read":1,"field":"content","offset":809,"length":1200}; view vc812ed8b]
  ```

  该 `read` 直接返回 `#1 field=content 809-2009 of 17173` 和隐藏段开头；下一页用返回的 `[next: … offset=2009 …]`。
- render-3 的地址（合成）：

  ```text
  U #1 [lines 1-10, 146-154 of 154; hidden 11-145; field=content 889-16077 of 17184; span=15188 pages=13 windows=2; max: {"read":1,"field":"content","offset":889,"length":12000} ~3822tok; view vfdaf9adb]
  ```

  执行 `max` 返回 `#1 field=content 889-12889 of 17184`，一次覆盖 10/13 页；末尾是 `[cost 12000 chars ~3822tok; hidden span 889-16077, unread 3188]` 和 `[next: … offset=12889 length=12000]`。目标在 9,720 时，这一次读取就覆盖；§12.8 的 C 条件合并 9/9 都复制了这条 `max`，而 render-2 的 C 只有 2/9 自己选了 12K。
- `max` 只覆盖一个窗口。15,188 跨度的 `windows=2`，第二个窗口起点 12,889；37,328 跨度是 `windows=4`，目标 20,751 在第二窗口。§12.8 的 24 条长跨度运行没有一条在 12,889 读取，C2/D2 的分页规则也没有改变；所以“地址 + max”只能保证**一个窗口内**的到达，不能保证多窗口覆盖。
- render-4 的探索把 `max` 提到全跨度 37,328（`windows=1`，约 11,888 tok）：9 条里 2 条直接读全跨度、3 条覆盖目标（其中 1 条用两次 20K），6 条仍选 2K–8K 小窗口。成本是真实的（全跨度读取约 6× 视图），不能作为默认策略；超过一个窗口的跨度仍未解决。
- `page=k` 与 `line=L` 是精确跳转，不是内容提示：`page` 从跨度起点按 1,200 网格解析，`line` 用 U 标记里的字段行号。它们能让一次读取落在指定页/行，但不能告诉读者“目标在哪一页”；§12.8 全部臂的 `page`/`line` 使用次数为 0，模型只用 `offset`/`length`。
- 超出范围返回 EOF/范围错误，不返回“最近一个看起来像”的内容；`page` 越界、`line` 越界、`page`+`line` 冲突、`offset`+`page` 冲突都返回明确错误与可用范围。

### 7.3 负结果与不可读

- `scan` 未命中：`no match for "x" in view fields (N records, M fields); this is a negative result for this range and policy, not proof of absence.` 不带 query 的 scan 是参数错误。
- `Unavailable`：`#N is unavailable (source record missing or unreadable).` 不给伪恢复承诺。
- `read` 的 `field` 不存在：返回 `field "x" is not in #N; available fields: ...`，并给出主文本字段；不得返回“没有文本字段”让模型误以为记录无内容。激活实验中已观察到模型把工具结果的 `content.0.text` 误写成 `content`，旧的错误提示直接导致一次 T2 失败。
- 策略排除：`#N is not readable under the current policy.` 不返回空字符串冒充“没有内容”。
- 分支外/编辑排除：默认拒绝，提示 `scope:"all"` 显式读取原记录；不静默返回原始内容。
- 引用失配：`reference mismatch: refSpace/snapshot/entry digest differs; re-open the view.` 不自动改指向。
- 页/行越界：`page 999 is outside 1-13 for this hidden span; last page starts at 15289.`；`line 9999 is outside 1-154 of field "content".`；不夹取到末页。
- 定位冲突：`read error: page and line are mutually exclusive.`；`read error: use offset, or page/line, not both.` 不猜读者意图。
- 长度上限：`length` 超过当前策略的 `readMaxChars`（默认 12,000）时，生产宿主应在 schema 层拒绝并返回 `length_exceeds_cap`；原型为了实验按上限夹取，并在结果的范围行里显示实际返回的 `a-b of total`。两者不能混写：夹取不是成功，拒绝也不是答错。
- 成本行：`[cost N chars ~Ttok; hidden span a-b, unread U]` 的 `N` 必须等于实际返回的 UTF-16 长度；`~Ttok` 是估算，不写账单。`unread` 只对本次读取落在隐藏跨度内时有意义。
- 暴露可能是拆开的：目标句可能跨两个工具结果（§12.8 render-4/D2 的 2×20K 读取）。单条结果的“完整隐藏句出现”是保守指标；读者把两段拼起来仍可答对。报告要同时给“目标偏移被某次读取覆盖”和“单条结果包含完整句”，不能只用一个。

### 7.4 原生工具 schema 与文本替身

真实宿主（Pi）把 `context_index` 注册成工具：模型返回结构化 `tool_calls`，宿主用 `execute()` 执行后以工具消息送回结果。原型早期用“正文里输出一行 JSON”作实验替身；替身不是产品协议，而且会改变调用形状（§12.7）。本节区分三件事：**产品 schema**（下）、**宿主注册与错误传播**（§12.9 已在真实 in-process Pi SDK 上验证主要环节；模型端点仍是本机替身，CLI/托管 provider/完整权限链未验证）、**本机替身端点**（只证明 reader 与文本协议闭环，不是完整宿主验证）。

宿主注册形状（Pi 1.x 的 `defineTool` + 扩展 `registerTool`，与 examples/extensions 的方向一致；具体导入名以宿主版本为准）：

```ts
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const contextIndex = defineTool({
  name: "context_index",
  label: "context index",
  description: "Read saved session history outside the compressed view. One action per call: view, read, range, scan, touched.",
  parameters: Type.Object({
    // 与下方 JSON schema 逐字段对应：view/status/offset/limit/range/scan/touched
    // + read{index, field, offset|page|line, length, revision, scope}
  }, { additionalProperties: false }),
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 1. validate exactly one action and one read locator;
    // 2. resolve view id + snapshot + policy;
    // 3. run the reader with the call deadline;
    // 4. return { content: [{ type: "text", text }], details } or throw a coded error.
  },
});

export default (pi: ExtensionAPI) => { pi.registerTool(contextIndex); };
```

工具实例绑定**最近一次 `session_before_compact` 返回的 `details.view` 与当时快照**，不读实时文件。新压缩产生新 view 后，旧 view 的地址/游标返回 `view_stale`，模型从新覆盖行取新 id；没有 view 的会话（尚未压缩）返回 `no_view`，宿主可以在此时隐藏工具（`exposure:"hidden"`），压缩后再注册为 `direct`。不在 `execute` 里重新扫描源流来“自动修复”旧 view，否则快照与引用的可校验性就没了。

`execute` 返回 `{ content, details }`：`content` 是给模型的文本，`details` 只放结构（`viewId`、`action`、`refs`、`spans`、`costChars`、`cursor`），不复制正文，供 TUI/HTML 重建。工具只读、幂等、无外部世界访问；不需要 `withFileMutationQueue`。注册为 `exposure:"direct"`（默认，模型可见可调）；不要用 `model-only`（模型不可调用）或 `codemode`（只给脚本）。`readOnlyHint` 可让权限扩展跳过确认，但“读保存的会话内容”仍可能敏感，`scope:"all"` 应可被权限层单独确认。Pi 不能真正注销工具；撤回时重新注册 `exposure:"hidden"`。

建议的宿主 schema（单动作对象；JSON 视图，TypeBox 是同一形状）：

```json
{
  "name": "context_index",
  "description": "Read saved session history outside the compressed view. One action per call: view lists entries, read returns a field range, range lists #N records, scan searches literally, touched lists recorded operations for a path.",
  "parameters": {
    "type": "object",
    "properties": {
      "view": { "type": "string", "description": "View id from the cover line; guards every action." },
      "status": { "type": "string", "enum": ["Live", "Quoted", "IndexOnly", "Unavailable"] },
      "offset": { "type": "integer", "minimum": 0 },
      "limit": { "type": "integer", "minimum": 1, "maximum": 20 },
      "read": {
        "type": "object",
        "properties": {
          "index": { "type": "integer", "minimum": 0, "description": "#N saved message" },
          "field": { "type": "string", "description": "content, content.0.text, …" },
          "offset": { "type": "integer", "minimum": 0, "description": "UTF-16 offset; use offset or page/line, not both" },
          "page": { "type": "integer", "minimum": 1, "description": "1-based page of the largest hidden run; 1,200-char grid" },
          "line": { "type": "integer", "minimum": 1, "description": "1-based field line, as printed in the U marker" },
          "length": { "type": "integer", "minimum": 1, "maximum": 12000, "description": "host readMaxChars; default 12,000, policy may lower, never silently raise" },
          "revision": { "type": "string" },
          "scope": { "type": "string", "enum": ["all"] }
        },
        "required": ["index"],
        "additionalProperties": false
      },
      "range": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 },
      "scan": { "type": "string", "minLength": 1 },
      "scope": { "type": "string", "enum": ["view", "all"] },
      "touched": { "type": "string" }
    },
    "additionalProperties": false
  }
}
```

- 单动作、`additionalProperties:false`；`view` 是快照守卫；`status` 只接受四个状态；`scan` 必须有非空 query；`length` 上界 12,000。
- 宿主必须接受结构化 tool call；正文里的 `<｜DSML｜ invoke …>` 在文本替身下是格式无效，不是答错（§12.6 D/T5 1 次、§12.7 T5n/D 1 次）。
- 示例窗口影响调用形状。文本替身的示例写 800/1,200，模型多数沿用；native schema 的 `length` 上界让 §12.7 的 A/B 各 2/2 直接读 12,000 chars，覆盖了约 17K 字段的前 12K，因而在 T6 同夹具上命中 9.7K 处的目标。这不是“native 模型更强”，而是协议/示例把读取窗口设得更大；比较协议时必须固定窗口提示。§12.8 进一步显示：把 `max` 打印成 12,000 后，render-3/C 的 9/9 都复制了这条调用；把 `max` 打印成 37,328 的全跨度后，只有 2/9 直接读全跨度、3/9 覆盖目标。**示例和上限是行为变量，不是装饰。**
- **错误传播。** 分三层：schema 校验（宿主拒绝非法参数，不进入 `execute`）、`execute` 内的可预期失败（抛带错误码的 Error）、部分成功（`isError:true` + `content`/`details`）。错误码至少包括 `invalid_args`、`unknown_action`、`no_view`、`view_stale`、`field_missing`、`locator_conflict`、`page_out_of_range`、`line_out_of_range`、`offset_out_of_range`、`length_exceeds_cap`、`policy_excluded`、`reference_mismatch`、`unavailable`、`cursor_invalid`、`deadline_exceeded`、`budget_exhausted`。文本必须带 `#N`/字段/可用范围/下一步；不得返回空字符串冒充“没有内容”。**无数据的失败用 throw；有数据的部分结果用 `isError:true`，让模型看到错误但仍能用 cursor。** 宿主不得吞掉 `isError`，也不得把抛错改写成空成功。
- **并发、取消、预算。** 同一条 assistant 消息的兄弟工具调用可以并行；reader 对固定 view/snapshot 只读，无共享可变状态，读操作可并行；`scan` 按会话串行以保护 CPU，cursor 绑定 view/query/scope/snapshot。`ctx.signal` 取消时必须停止并在结果/错误里说明；宿主按 turn 计数，超过上限返回 `budget_exhausted`，不能只靠提示词的“最多 3 次”。`scan` 的 3s 预算到点应返回部分命中 + cursor 并标 `deadline_exceeded`（`isError:true`），不能丢掉已得结果。
- **权限。** `readOnlyHint` 只是提示，不是授权；策略排除永远报错；`scope:"all"` 可要求单独确认；日志、`details`、HTML 导出都不含正文；严格策略可以隐藏计数元信息。权限扩展若只按 `readOnlyHint` 放行，必须知道“读的是保存的会话内容”这一数据类别。
- **窗口策略。** 默认 `readMaxChars=12000`；48,000 只出现在 §12.8 的 render-4 探索臂（成本约 6× 视图，2/9 直接读、3/9 覆盖），不是默认。schema 的 `maximum`、view 里的 `max` 地址和 reader 的夹取上限必须由**同一个** policy 生成；改变 `pageChars`/`readMaxChars` 会改变视图字节与 view id，必须记入 recipe（§3.1），不能拿旧 id 冒充新视图。
- **已验证/未验证。** 下表区分“本机替身端点”和“真实 Pi 宿主”；§12.7/§12.8 的全部行为数字都属于前者，§12.9 的宿主层用真实 in-process Pi SDK，模型端点仍是本机替身。

  | 层 | 本机替身端点 | 真实 Pi 宿主（in-process SDK） |
  |---|---|---|
  | schema 形状 | 文本 JSON + OpenAI function schema | 已验证：TypeBox 参数与 `runToolCall` 的真实校验路径；6 类非法参数在 execute 前被拒 |
  | 结构化 `tool_calls` | 仅流式重组（非流式丢） | 已验证：模型发结构化调用并收到工具结果（1 次行为运行，管线证据） |
  | `execute`/`content`/`details` | reader 文本直接返回 | 已验证：content 为文本、details 仅结构、无正文；cover 端到端 37,615 chars |
  | throw / `isError:true` | 未测 | 已验证：5 类编码错误、`beforeToolCall` 拦截、预 abort、部分 cover 的 `isError:true` + 正文 + next |
  | 权限/annotations | 未测 | annotations 随定义注册；`beforeToolCall` 已验证；权限扩展端到端未验证 |
  | 并行/取消/预算 | 未测 | 工具层并发与扩展侧 `budget_exhausted` 已验证；运行中取消、宿主调度并行未验证 |
  | `details`/TUI/HTML | 未测 | details 无正文已验证；TUI/HTML 渲染未验证 |

- **`exposure:"hidden"` 的宿主语义（实测）。** 宿主 `_applyToolLoadout` 会直接丢弃 hidden 工具，`setActiveToolsByName` 也不能按名重新激活它。因此“撤回”应重新注册为 hidden，而不是先 hidden 再按名恢复；hidden 不是“休眠、可随时唤醒”。
- **宿主集成测试清单（部分已运行）。** 已跑：工具列表/描述、非法参数被 schema 拒绝、5 个错误码、部分 cover 的 `isError:true`、工具层并行 `read`、扩展侧预算、details 无正文、hidden 撤回语义。仍未跑：`scan` deadline 的部分结果、运行中取消、宿主调度并行、权限扩展端到端、`scope:"all"` 单独确认、policy canary 在 view/scan/read/range/touched/details/日志中都不出现、`details`/HTML 渲染、fork/context edit、100 次压缩后的自喂、Pi 1.0.0 与 1.4.0 的对照。清单通过前，不写“真实宿主已验证”到这些项。
- **替身端点限制。** 本地替身的非流式响应只返回 `finish_reason:"tool_calls"` 和空 message，`tool_calls` 只在流式增量中；§12.7 的 native 运行因此走流式重组。真实宿主直接给结构化调用，不需要这个绕行；但“绕行能跑”不等于“宿主能跑”。

## 8. 隐私与访问控制

- 策略来源：
  - `skipCustomTypes`（既有配置；只作为状态插件接触点）。
  - 精确 `excludeEntryIds`、`excludePathPrefixes`、`excludeToolNames`（用户配置；字面匹配，不是语义分类器）。
  - 宿主显式隐私标记（若存在）。
- 策略作用：摘要输入、视图、`view` 清单、`scan`、`read`、`range`、`touched`、缓存、日志、审计计数（可配置隐藏计数）。
- 被排除内容不得先复制到索引再尝试删除；索引删除不等于 session 原文删除；过去已发送给模型的内容不能收回。
- 计数也可能泄露元信息；严格策略允许只显示 `policy excluded: hidden`，同时报告覆盖口径受限。
- 不承诺自动识别所有秘密；启发式扫描最多是额外防线，不是零漏检保证。用 canary 夹具覆盖用户文本、custom、工具结果、路径、nested 参数、日志。
- 直接 `read #N` 不得绕过策略；旧游标、`touched`、`range` 同样不能。
- `policyDigest` 进入 recipe；策略变严格后重放是不同输入，不能声称“输入相同”。

## 9. 确定性与可重建

- 输入：源前缀（`sourceEndBytes`/`prefixDigest`）、分支头、切点、投影/提取/渲染版本、策略摘要、`c`、`ctxTokens`、`blocks`、预算参数。只有 session 文本相同、其他参数不同，不要求视图字节相同。
- 视图 id：对上述输入 + 选择清单（状态与跨度）做 SHA-256，取 8 hex；不含时钟、随机数、缓存命中、文件遍历顺序。
- 选择顺序：源顺序/首次调用/entryId 稳定比较；不使用 locale 相关排序。
- 历史视图：details 保存 recipe 与选择跨度；未来 renderer 必须保留 `render-1` 的冻结实现，否则报告“renderer unavailable”，不能拿当前默认值冒充历史输入。
- sidecar：可删除、截断、乱序；重建目录/选择/视图逐字一致。缓存只保存可复算的偏移/事件索引，不保存独有身份或展示文本。
- 源损坏/删除：停在可验证边界，报告 `Unavailable`；不以猜测修补；不把缓存当作源。
- 政策变化：`policyDigest` 不同，旧视图不能复用；可减少可见内容，但必须如实说明。

## 10. 宿主集成与生命周期

### 10.1 Hook

`session_before_compact` 返回 `{ compaction: { summary, details, tokensBefore, firstKeptEntryId } }`。新插件只处理自己；与旧插件不能同时安装。切点、紧凑策略、`keep:N`、smart keep-tail 复用既有行为；`firstKeptEntryId` 必须落在当前分支的消息/合法边界上。

### 10.2 上下文编辑

- 使用宿主 `buildSessionProjection`（若存在）；不存在时 fail closed，不复活被编辑/删除的内容。
- 编辑目标消息保留原 `#N`/摘要；有效文本来自 edit entry；`revisionEntryId` 进入 span。
- 编辑 checkpoint 导致前缀不重建时，`X` 登记跳过区间与原因，不把“之前没有历史”当作事实。
- `skipCustomTypes` 可能影响前缀可渲染性/切点回退；宿主集成测试必须分别测试“用户轮统计不变”和“空前缀处理”，不能照抄旧文档的“绝不影响切点”。

### 10.3 fork/retry

- 同文件 append/retry：`#N` 稳定；废弃分支进 `I` 的 `off-branch` 墓碑；视图只引用当前 `E`，但 `read scope:"all"` 可显式读取。
- 同文件 retry 的旧记录不因选集变化丢失；`view` 可看到 `X` 计数。
- 跨文件 fork：见 §3.3；无权威继承元数据时拒绝旧引用，这是发布阻断项。宿主 API 是否提供该元数据必须用真实 fork 操作验证，不能从注释推断。
- 并行分支：各自引用域；跨会话引用必须带 `refSpaceId`。

### 10.4 包结构与复用

```text
pi-context-index/
  index.ts
  src/
    hook/register.ts
    cut.ts
    source/snapshot.ts
    source/catalog.ts
    source/effective.ts
    source/observations.ts
    view/cover.ts
    view/candidates.ts
    view/budget.ts
    view/render.ts
    view/fences.ts
    reader/tool.ts
    reader/view.ts
    reader/read.ts
    reader/scan.ts
    reader/range.ts
    reader/touched.ts
    reader/cursor.ts
    policy.ts
    details.ts
    settings.ts
    hash.ts
  tests/...
```

可复用的旧实现（需要重新审查，不直接依赖旧包）：`fences.ts` 的围栏状态机/闭合/孤立收尾；`jsonl.ts` 的流式行读取；`global-indices.ts` 的 `#N` 计数规则；`recall-full.ts` 的 grapheme-safe 窗口；`token-estimate.ts` 的校准思想。**不复用**：`extract/*` 语义章节、`rank.ts` 的角色配额/语义评分、`summarize.ts` 的 legacy/mergeHeaderParts、`brief.ts` 的摘要候选评分。

### 10.5 提示词与激活

工具可用不等于模型会用。reader 协议（§7）只回答“怎么调用”；“什么时候调用”必须由系统提示词和视图结构共同承担，二者不能互相替代。

- **协议在工具描述/系统提示词。** `context_index` 的名称、参数、最多调用次数和输出格式属于协议，始终可用。
- **激活规则单独一条，按结构门控。** 只有当本次视图含 `IndexOnly > 0` 或某个 `U` 行带 `hidden` 区间时，才在宿主 `promptGuidelines` 追加一条规则；没有这些结构时不追加，避免每轮打扰和“为了保险而 recall”。
- **规则是正向条件，不是负向兜底。** 0.1.5 的 `before concluding it is unavailable` 只在模型准备说“不可用”时生效；它覆盖不了“模型以为摘录就是完整要求，于是直接作答”。新规则在作答前检查 `U` 行是否完整。
- **规则绑定结构信号，不做语义判断。** 触发条件是 `hidden` 区间、`IndexOnly`、`#N`/覆盖范围，不是“这段重要”或关键词。这样不把语义评分请回来，也不替代覆盖行/可寻址结构。

建议的系统提示词规则（英文，保持短）：

> After compaction, the view is a navigation index, not the full task. Before answering a question about a user instruction or requirement, check whether its `U` line is complete. If the line has hidden ranges, or the record is `IndexOnly`, or only a `#N`/cover range is present, call `context_index` and read the saved original at the given field/offset. Do not infer a requirement from an excerpt. If the saved history has no such text, say it is not recorded instead of guessing.

可选的第二行结构说明（只在模型对 `IndexOnly` 语义不熟时使用）：

> `IndexOnly` means the record is saved but its text is not shown. `U` lines with `hidden` ranges show only a head/tail excerpt. Read the saved original before treating a requirement as absent.

视图 note 保持 §6.2 的短句 `use context_index`；不要把这条规则复制进视图正文，否则每次压缩都重复计费并挤占候选预算。§12.6 的结果：在本夹具/本模型上，工具协议本身已足以触发调用；B/C/D 没有可测正确率增益，C 的平均调用数更高。规则保留为安全网，但不能写成“提示词会让模型主动 recall”的保证。更重要的结构修复是：U 行的 hidden 区间必须给出字段、起始偏移和可执行 `read`（见 §7.1/§7.2）；只给行号会让模型想读也只能从头部或猜 scan 词。

**§12.7 的更新（render-2 + T6 + native）。**

- **地址已落实，T5 式 follow-up 12/12。** U 行/`view` 现在给出 `field=… start-end of total; read: {…}`。同夹具 T5（A/B/C/D × 3）12/12 正确，未再出现 §12.6 的 scan 词不匹配失败；但 12 条中只有 1 条真的从地址起点读取，多数改用 `scan "allocator-golden"` 这个更宽的词元，另一些顺着 scan 命中读附近。示例差异与非确定性仍在，不能把 3/3 全归因于地址。
- **近距控制 t5n。** 目标位于地址后第一页内；11 条有效样本全对，1 次格式无效（`<｜DSML｜ invoke …>`），不算答错。
- **T6“无关键词线索”出现 0 调用直接答错。** 可见行写“套件通过即可记录 changelog”，隐藏区才有“never sufficient; require an independent rerun”，问题不点名任何隐藏词。A 无提示 0/3 正确，其中 2/3 是 0 调用直接答错；B 1/3（另 1/3 也是 0 调用）。C/D 全部调用，但目标深在约 15K 隐藏跨度的 9.7K 处：12 条中只有 2 条把隐藏句带回，且这 2 条才答对；其余读到 1.2K–9K 窗口就停在可见段或近旁。
- **近距控制 t6n。** 目标在地址后第一页内：A 2/3（1 次 0 调用答错）、B/C/D 3/3；11/11 暴露隐藏句的样本全对，唯一没暴露的样本答错。说明地址 + 一次 read 足够时，C/D 能解决；剩余问题是触发与分页，不是字段格式。
- **地址是起点，不是定位器。** 目标在一个读页内时可解；深在中段时需要连续翻页或显式更大窗口。§12.7 的 native A/B 各 2/2 直接读 12,000 chars、覆盖 9.7K 目标而命中；文本替身的示例写 800/1,200，模型多数沿用。窗口提示会改变结果，不能把“native 比文本 JSON 好”当作模型能力差异。
- **协议位置。** 工具名、参数、上限属于工具 schema（§7.4）；激活规则属于系统提示词。native 运行没有格式无效；文本替身仍出现 1 次 `<｜DSML｜ invoke …>`。真实宿主必须用结构化 tool call；正文拼 JSON 只是实验替身。
- **不要把规则写成保证。** 规则保留为安全网；T6 表明“看起来可答”时 0 调用仍会发生，C/D 也只解决了“目标在一页内”的情形。下一次结构改进应是隐藏跨度的分页/索引，而不是再加一句更强的提醒。

**§12.8 的更新（render-3/4、页表、分页规则）。**

- **有效的是“正向条件规则 + 可执行的 max 地址”这个组合，不是任一单独。** T6 同夹具：C 在 render-3 合并 9/9（P1 3/3 + R1 6/6），9 条都复制了 `max` 的 `offset=889 length=12000`；C 在 render-2 合并 2/9，两次成功也是模型自己选了 12K/17K。无提示 A 在 render-3 仍 1/9、7/9 零调用答错。§10.5 的规则保留，但视图必须同时给可执行 `max`；只写规则不够，只写地址也不够。
- **C2/D2 的分页规则没有可测增益。** P2（规则、无 max）C2 1/3（1 条无据）、D2 1/3；P3（规则+max）的 C2/D2 为 3/3、3/3，P1 的 C/D 为 3/3、2/2（D 有效 2，另 1 条非 JSON 排除），都在天花板附近，无法区分规则增益；长跨度 C2/D2 0/12 目标覆盖、0 条跟随 `next`。**不把这条规则加入默认 promptGuidelines**；保留为可选安全网，不写成修复。
- **页表、`page`、`line` 在本样本 0 次使用。** 时间线的 `max` 被大量复制，`view` 的页表没有被取用，`page`/`line` 从未调用。页表只在 `view` 里（取用才付费），不要写成“分页已解决”；v1 可以只保留 `span/pages/windows/max/cost` 与 `next`，把页表留作可选。
- **触发层仍是缺口。** “看起来可答”的 T6 在 A 下 7/9 零调用答错；`max` 地址本身不会触发。规则只绑定结构信号（hidden 跨度、`max`、`next`），不做语义判断；也不写“模型会自动 recall”。
- **成本必须进入设计。** 15K 跨度一次 max 读 12,000 chars ≈ 3,822 tok；37K 全跨度读 ≈ 11,888 tok，约 6× 视图；render-4 只有 2/9 直接读全跨度、3/9 覆盖。压缩的收益取决于隐藏文本是否被立即/重复读取；不要默认全跨度读。
- **下一步是宿主侧覆盖或压缩策略，不是再加一句提醒。** 让宿主按 `next` 取完并合并成一个带总成本的结果，或让超大用户跨度不被拆成多窗口；两者都要新预注册对照。当前不改默认产品行为。

**§12.9 的更新（render-5 + 真实宿主）。**

- **覆盖规则只绑定打印出来的合并调用。** render-5 在跨度超过一个读窗口时打印 `max`（第一窗口）与 `cover`（整段、总成本）。新条件 C5/D5 的规则只说“若问题依赖隐藏中段且跨度超过一个窗口，用打印的 `cover`，不要停在 `max` 或一次 `next`”。37K 上 C5 7/9 目标覆盖（7 条 cover 全对），C 0/9、同帧 render-3 C 0/9；15K 上 C 9/9，cover 多余，C5 仍 9/9 用 cover（+12% 工具字符）。因此规则只在视图确实打印 `cover` 时附加，且默认视图应只在跨度超过一个窗口时打印 cover；不为短跨度加规则。
- **规则不是触发保证。** C5 的 2 条失败都没有调用 cover（1 条 0 调用直接答 true，1 条只 scan）；D5 4/9 同类。A 0/3 覆盖说明“打印 cover 地址”本身不会让模型去读。规则保留为安全网，不写成“模型会主动覆盖”。
- **分页规则仍不作为默认。** C2 3/9 覆盖，靠 2–3 次 `next`，prompt 20,463 vs C5 13,570；它是没有 cover 能力时的兼容路径，不是优于 cover 的默认。D5 的 STRUCTURE 行没有可测增益（5/9 vs 7/9，区间重叠）。
- **成本按路由算。** 37K 一次 cover 的 prompt 约 14.2K，三次 next 约 28.2K；15K 一次 cover 9.3K，两次 max 15.1K。单次工具字符更大不等于端到端更贵；但 cover + 视图仍超过被隐藏的原文（37K：约 43.8K > 39,324；15K：约 21.5K > 17,184），所以不能默认全跨度读。
- **真实 Pi 宿主已验证工具协议的主要环节。** §7.4 的 `defineTool`/TypeBox/registerTool、schema 拒绝、`throw`/`isError:true`、部分结果、`beforeToolCall` 权限钩子、工具层并发、扩展侧预算、`hidden` 撤回语义都在 in-process SDK 宿主上跑过；`promptSnippet`/`promptGuidelines` 进入系统提示词。未验证的是运行中取消、宿主调度并行、权限扩展端到端、`scope:"all"` 确认、TUI/HTML、fork/context edit 与 100 次压缩。

## 11. 测试与验收

### 11.1 结构/属性测试

1. 分区：E 四状态互斥并集；`unaccounted=0`；I/E/X 计数守恒；custom 分区守恒。
2. 精确范围：system、分支洞、编辑、噪声、custom 交错；展开区间等于登记集合；min/max 中的洞不得算已展示。
3. 字段分区：Quoted 的 shown/hidden/policy 互斥且覆盖；每个 shown 等于源子串；不得只引用首行冒充整条。
4. 目录：view 分页枚举全部项；末页显式；删页/改游标失败；`IndexOnly` 可按原因过滤；每个部分引用/`IndexOnly` 行给出 hidden 字段、起始偏移和可执行 `read`，回读结果等于该偏移的源子串。render-3 还断言：超过 1,200 chars 的跨度给出 `span/pages/windows/max`；`pages@` 的每个起点在 1,200 网格上；`max` 的 `offset/length` 与跨度一致；`page` 回读等于该页源子串；`line` 回读等于该行起点；`page`/`line` 冲突与越界报错；`[cost N chars]` 的 N 等于实际返回长度；视图仍不超过 cap。
5. 身份：追加式会话 `#N` 单调；同文件 retry/off-branch 保留墓碑；跨文件缺失映射拒绝。
6. 引用：refSpace/snapshot/entryId/字段/摘要校验；失配不改指向。
7. 预算：最终 UTF-16 ≤B；成本复算；emoji/组合字/巨型单行/围栏；needed 截止；`B=min(Bcap,needed)`。
8. 确定性：同输入重复运行逐字相同；不同策略/版本产生不同 id；不使用时钟/缓存。
9. 可重建：无 sidecar/空/截断/乱序缓存重建一致；源损坏报告 Unavailable。
10. 编辑/尾部：编辑投影不复制 live 同跨度；尾部滑出后旧跨度仍可寻址并参与下一轮。
11. 隐私：canary 在 view/scan/read/range/touched/日志/缓存中均不出现；严格模式计数可隐藏。
12. 标记可执行：每个 `view`/`read`/`range`/`scan`/`touched` 标记用真实 parser 执行；scan 必须有 query。
13. 无自喂：历史 compaction/recall 输出不成为新候选；100 次压缩后仍成立。
14. 围栏：状态机断言结束闭合；结构头/标记在围栏外；头/尾切断修复；孤立收尾。
15. 时间：正文按源顺序；不生成 supersedes/current state。
16. 结构事实：write 调用不产生磁盘变更事实；hostOps 与调用计数分开；unsupported 计数正确。
17. 首消息形态：A/B 同一分配器；B 不复述外部文件；路径字面；不读文件。
18. 模板词法：生成行无 `done/verified/success` 状态断言；引用跨度可含这些词且精确。

### 11.2 宿主集成

- Pi 1.0.0 与 1.4.0（peer 范围）；hook 返回 details；UI toast/命令不回归。
- context edits（宿主 projection 存在/不存在）；编辑 checkpoint；删除前缀。
- compact-all、无 user、纯工具、单条巨型输出、nested codemode、直接工具、custom skip、重复注入。
- retry/同文件 fork/裁剪新文件 fork/无继承元数据；并行分支；跨会话引用。
- `keep:N` 显式、默认 smart keep-tail、预算切点、空前缀回退。
- 真实会话脱敏归档只做聚合；不把正文写入文档/提交。

### 11.3 性能门

- 目录构建：50MB 会话 p95 < 250ms；200MB < 1s；内存不随巨型字段复制多份。
- 视图选择/渲染：p95 < 100ms（不含源读取）；`needed` 计算有界。
- reader：`view`/`range` 页 p95 < 50ms；`scan` 页 p95 < 1s（3s 预算内）；`read` 深偏移 < 50ms。
- 原型 470 条消息、467 块、21K 巨型结果：目录+视图 p95 约 7–8ms（单机合成，不代表生产）。
- 原型 10,000 条消息、9,999 条有效、9,999 块、一条 199,033 字符结果：5 次目录+视图 133–218ms；`scan` 一次 200ms；深偏移 `read` 0.17ms；Node heap 约 113MB。该数据只说明原型在 10k 条/单条 200K 输出上仍可用；100k 条、200MB 会话、多个巨型字段未测。
- 性能不达标时才考虑可丢弃 sidecar；缓存不能改变视图。

### 11.4 行为实验

- 预注册问题族：约束、旧数值、错误定位、验收原文、决策反转、文件指针、覆盖理解、越界事实弃答。
- 条件：原生/0.1.5/本视图/仅尾部；k=0、k=1、k=3；同 tail、同问题、同参数、同计分器；重复与随机化顺序；按会话聚类报告区间。
- 指标：答案正确且有据、找全率（分母固定真值全集）、引用精确率、引用读取成功率、无据断言率、弃答率、每题工具次数、p95 延迟、端到端 token/费用。
- 激活/主动性对照（预注册）：A 无提示、B 0.1.5 式负向提示、C 正向条件提示、D C + 结构说明；问题族 T1 当前可答、T2 仅 hidden/IndexOnly、T3 保存历史也没有、T4 摘录目标/完整要求在原文；追加 T5“看起来可答”（可见行给出表面答案、隐藏区有例外），单独一轮 A/B/C/D × 3；记录首次动作（tool/answer）、T2/T4 召回率、T1 无谓召回率、T3 弃答/编造、T4 精确引用/转述、直接答错/召回后答错、每题调用数与 token；每条件 3 次，同一模型/夹具；预注册提示与计分。结果见 §12.6。
- 隐藏地址 follow-up（预注册，§12.7）：render-2 在 U 行/`view` 增加 `field=… start-end of total; read: {…}`；同夹具 T5 与近距控制 t5n（目标在地址后第一页内）各 A/B/C/D × 3；T6 无关键词线索（可见行看似完整、隐藏区有例外、问题不点名隐藏词）与近距控制 t6n 各 A/B/C/D × 3；记录首次动作、调用数、`hiddenExposed`（工具结果是否带回隐藏句）、`usedAddress`（是否从地址起点读）、`zeroCallWrong`、`grounded`（答案是否落到隐藏更正）；预注册 truth 与计分，D 的格式无效单独计。native 协议对照只测 T6/t6n（A/B/C/D × 2），并固定“文本替身示例窗口”这一混杂。
- 隐藏地址实验只允许合成夹具；不碰真实会话；不把 `out/` 正文写入文档。
- 隐藏跨度页表/成本化窗口 follow-up（预注册，§12.8）：render-3 只对超过 1,200 chars 的跨度加 `span/pages/windows/max/cost`，`view` 给页表，`read` 支持 `page`/`line` 与成本行；默认 `readMaxChars=12000`。主臂为 render-2 vs render-3 的 T6 A/B/C/D × 3，新增条件 C2/D2（分页规则）× 3，近距 t6n × 3，长跨度 t6l × 3；另有 6 次重复（A/C）和 render-4 全跨度探索（t6l，`readMaxChars=48000`，C/C2/D2 × 3、A × 3）。记录 `targetCoveredByRead`（读区间是否覆盖目标偏移，独立于答案）、`pagesCovered`（1,200 网格覆盖页数）、`usedMax`、`usedPage`、`zeroCallWrong`、工具字符与 prompt tokens；布尔正确与 `grounded` 分开计，非 JSON/`<invoke>` 格式无效单独排除。页表/规则“结构存在但 0 次使用”必须如实报告，不能写成增益。
- 不把“工具可达”记为“任务成功”；不把“新增预算”归因于“分配器重构”；单模型/小样本只报点估计与区间。

### 11.5 发布阻断项

- 任何未登记区间/重复身份/字段分区失败。
- 任何隐私旁路（view/scan/read/range/touched/日志/缓存）。
- 任何引用失配仍返回别条/自行重编号。
- 跨文件 fork 无权威继承映射却宣称旧 `#N` 稳定。
- 模板出现状态断言；预算超限；围栏吞掉结构行/标记。
- 旧 `[Session Goal]`/`Outstanding Context`/`User Preferences` 以任何形式复活；summary 自喂；把工具请求写成磁盘事实。
- 真实 API 行为未达到预注册净收益门槛时，不写“接近全事实覆盖/概率提升”。

## 12. 原型与真实 API 验证

### 12.1 合成夹具

- 470 条计数消息（另含 1 条 custom、2 条 off-branch 消息、1 条 system）；`E=467`；`live=30`；`X=3`（system 1、off-branch 2）；custom 1（policy excluded 1）。
- 71 条唯一 write/edit 请求（1 条 early write + 60 direct + 10 nested），71 个唯一路径；3 个观测错误（direct edit、nested write、failed typecheck）；3 组计数向量 422/243/1139；一条 21,195 字符的早期测试结果（字段 `content.0.text`），422 事实位于偏移 21,165；30 条 tail 含最终 1139、git status `87 changed / 155 unchanged`、commit/tag/push、`npm publish was not run`。
- 形态 A：首条消息 2,290 字符任务书，8 条约束分布在首/中/尾；形态 B：短指令 + `docs/plans/task-book.md` 路径，任务书作为外部文件提供。
- 结构不变式：18/18 通过；包括 71 条台账、字段精确分区、view 全量分页、深偏移读取、off-branch scope、policy 排除、context edit revision、预算四档、needed 截止。

### 12.2 产物规模

| 产物 | 字符 | 说明 |
|---|---:|---|
| 0.1.5 基线（6,287 预算） | 6,225 | `Session Goal` + Files+Changes + 24 条工具行；模型列出 16/71 个路径 |
| 0.1.5 基线（9,583 预算） | 9,560 | 62/66 条 mutation 工具行；模型列出 57/71 个路径 |
| 新视图 6,287 | 6,273 | 部分操作/锚点 IndexOnly |
| 新视图 7,850/8,217/9,583/12,560 | 7,096 | `needed` 截止；四档逐字相同 |
| 新视图 形态 B（9,583） | 4,903 | 短指令 + 路径；all ops；外部文件不计入视图 |
| u-full / u-line / u-char / u-none | 7,096 / 5,453 / 5,929 / 4,782 | 用户原文形态对照 |

### 12.3 真实 API 结果

以下为回填后的结果。条件：`deepseek-v4.1-flash-1017`，`temperature=0`，`reasoning_effort=minimal`，每条件 3 次（变体 2 次）；同 tail、同问题、同参数。仅聚合计数，不引用模型原文。

**统计口径**：主条件每组 3 次，变体每组 2 次；`temperature=0`，`reasoning_effort=minimal`，同一合成夹具与同一尾部。表中“对/3”是正确次数，“均/分母”是该组正确项均值。`错引用` 接受调用编号或结果编号；`覆盖 indexOnly/view` 写作 “3/3 null” 表示应填 null 且确实填 null。`index-8217` 的 ctx 有 1 次输出不是合法 JSON，按 n=2 计。单模型、单夹具、小样本；不构成总体概率或显著性。

**主条件（3 次/组）**

| 条件 | 最早测试（对/3） | 向量（对/3） | 路径（均/71） | 错误引用（均/3） | 约束（均/8） | 未验证（均/3） | 状态（均/4） | 覆盖 earliest（对/3） | 覆盖 indexOnly/view |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 仅尾部 | 0 | 1.0 | 0 | 0 | 0 | 1.0 | 4.0 | 0 | 3/3 null |
| 0.1.5 @6,287 | 0 | 1.0 | 16 | 3.0 | 4.7 | 1.0 | 4.0 | 0 | 3/3 null |
| 0.1.5 @9,583 | 0 | 1.0 | 57 | 3.0 | 6.7 | 3.0 | 4.0 | 0 | 3/3 null |
| 新视图 @6,287 | 3 | 3.0 | 67 | 3.0 | 7.0 | 1.0 | 4.0 | 3 | 3/3 |
| 新视图 @8,217 | 3 | 3.0 | 71 | 3.0 | 6.5\* | 3.0 | 4.0 | 3 | 3/3 |

`*` 1 次无效 JSON，n=2。`pi_1_0_0` 在主 facts 提示中带有“没有就填 null、不要用其他版本代答”的提示，故主表的 null 命中不能当作诚实性证据；单独的中性提示见 §12.5。

**变体（2 次/组）**

| 条件 | 最早测试（对/2） | 向量（对/2） | 路径（均/71） | 约束（均/8） | 未验证（均/3） | 状态（均/4） | 覆盖 earliest / indexOnly / view / mayCommit |
|---|---:|---:|---:|---:|---:|---:|---|
| 新视图，旧覆盖头 | — | — | — | — | — | — | 2/2；0/2；0/2；2/2 |
| 新视图，无覆盖头 | — | — | — | — | — | — | 0/2；2/2 null；2/2 null；2/2 |
| 只给引用（去值） | 0 | 1.0 | — | — | — | — | — |
| 无计数行 | 0 | 1.0 | — | — | — | — | — |
| u-full | — | — | — | 6.0 | 3.0 | 4.0 | — |
| u-line（首条 4+4 行） | — | — | — | 6.0 | 3.0 | 4.0 | — |
| u-char（首条 510+510 chars） | — | — | — | 4.5 | 3.0 | 4.0 | — |
| u-none（去掉首条） | — | — | — | 2.0 | 3.0 | 4.0 | — |
| 形态 B @9,583 | 2 | 3.0（refs 3.0/2） | 71 | 8.0 | 3.0 | 4.0 | 2/2；2/2；2/2；1/2 |

- `index-legacy-cover` 的 `indexOnly/view` 0/2 表示模型在只有旧式 `saved #0-#469; brief covers #1-#439` 的头部时，仍然猜了一个非 null 的未展示数/视图号；旧覆盖头没有提供这些事实。
- `index-no-cover` 的 `earliest 0/2` 表示没有覆盖头时模型没有填 null；它无法可靠回答最早保存记录。
- `u-full` 与 `u-line` 在主 ctx 题（允许列后续用户消息）中同为 6.0/8；首条消息 6 个唯一约束的聚焦题见 §12.5，主 ctx 题不作为形态结论。
- 形态 B 的 `mayCommit` 1/2：视图中同时存在旧禁令和后来的提交指令，模型有一次仍按旧禁令回答 false。压缩器不生成撤销关系；这是读者对时间线的解释问题，不是“视图缺少后来指令”。
- `只给引用` 与 `无计数行` 两档的最早测试均为 0/2、向量均 1.0/2；没有值只剩引用/只有尾部时，模型无法可靠得到 422。对照完整新视图的 3/3 与 3.0/3，说明“值 + 引用”不是可选的装饰。
- 旧覆盖头能回答 `earliest_saved`（2/2，因为写了 `saved #0-#469`），但不能回答未展示数/视图号（0/2）；无覆盖头连 earliest 也只有 0/2。覆盖头不是“有就行”，必须包含可核对的字段。

**结构可见性（不是行为分数）**：只看首条消息中 6 条不重复的约束（`allocator-golden.json`、`Math.min`、`failing test`、`200 lines`、`line-level`、`task book file`）在视图文本中的字面出现：

| 产物 | 首条约束字面出现 |
|---|---:|
| u-full | 6/6 |
| u-line（4+4 行） | 4/6 |
| u-char（510+510 chars） | 4/6 |
| u-none | 0/6 |
| 新视图 @6,287 / @8,217 | 6/6 |
| 0.1.5 @6,287 / @9,583 | 6/6（文本存在，但模型在聚焦题中只命中 3–4/6） |
| 形态 B 视图 | 0/6（外部文件提供 6/6） |

这张表只证明“哪些字节在视图里”，不证明模型会读出来。行级/字符级摘录确实会隐藏中间两行；0.1.5 的 6/6 文本仍在，模型也只命中 3–4/6。这说明“文本在”与“读者能找到”是两层问题，不能从字面存在推出模型会抽取。

### 12.4 关键发现（结构 + 行为）

- **覆盖行必须带保存区间。** 只写 `saved=470` 时，模型把 `earliest_saved` 答成 `#1`；加上 `(#0-#469)` 后才能答 `#0`。这是从真实调用中得到的界面修正，不是理论偏好。
- **needed 截止真实生效。** 7,850/8,217/9,583/12,560 四档视图逐字相同；只有 6,287 档截断。更大的预算没有自动带来更多字节，符合“允许上限、不默认花满”。
- **0.1.5 的预算增加不等于台账覆盖。** 0.1.5 在 9,583 下保留了 62/66 条工具行，但模型仍只列出 57/71 个路径；旧行没有形成完整台账。新视图在 7,096 下覆盖 71/71 个操作行与引用。
- **值 + 引用与“只给引用”必须做对照。** 原型 `index-ref-only` 保留 `C` 行的引用但去掉值；`index-no-counter` 连计数行都没有。两者用于验证“读者拿到值”与“读者必须读取”的差别。
- **用户原文形态先改变结构，是否改变行为由模型决定。** u-full/u-line/u-char/u-none 四档只改变首条长消息的展示形态。结构可见性明确：u-full 6/6、u-line 4/6、u-char 4/6、u-none 0/6（6 条不重复首条约束）。但聚焦行为题中 u-full 3.5/6、u-line 4/6、u-char 4/6、u-none 0/6：文本全在视图里也不保证模型把 6 个计分约束全部抽出；u-line/u-char 恰好命中其可见的 4 个计分约束（模型还会列出其他约束）。不能据此宣称“全量原文必然提高行为”。行级摘录的目标仍是保留行边界和精确地址，而不是承诺中间禁令必然被模型读取。0.1.5 与新视图的对照见 §12.5。
- **形态 B 不需要复述文件。** 短指令 + 路径视图只有 4,903 字符，仍能覆盖 71 个操作；任务书约束由外部文件提供。压缩器不读取文件，也不把文件全文提升成第二份权威副本。
- **tail 只解决当前状态。** 仅尾部条件通常能回答状态位和最终计数，但无法回答早期 422、71 条操作路径或旧约束；这正是目录/视图的边际价值所在。
- **reader 的字段/偏移是可用性差异，不是语义差异。** 无计数行视图下，主 reader 新协议 2/2 答对最早 422（各 2 次调用）；旧式对照 1/2（各 3 次调用，一次弃答）。聚焦题把 `offset` 纳入后：新协议 3/3 值/ref，2/3 exact offset（第二次答 21169，与 `scan` 返回的 “pass” 词元偏移一致，而真值是计数短语起点 21165，仍落在同一短语内），3 次调用；旧式对照 2/3 值/ref，0/3 offset，3 次调用。旧式 reader 偶尔能从中心片段看到数字，但不能给出字段偏移。`scan` 的命中偏移是查询词元的位置；若某行需要计数短语起点，渲染时已知该起点，应直接把它作为地址，而不是让模型从词元位置反推。

### 12.5 聚焦实验（已完成）

三组实验与 §12.3 使用同一模型和同一合成夹具：`deepseek-v4.1-flash-1017`，`temperature=0`，`reasoning_effort=minimal`；每条件 2–3 次；只记录聚合命中与可复核的调用轨迹，不引用模型原文。原始 `focused.log` 与四个 JSON 在 git-ignored 的 `research/prototype/out/`；本文只引用聚合计数，不复制其中正文。

**首条消息 6 个唯一约束（2 次/条件）**

问题只允许列第一条用户消息明确写出的约束；计分的是 6 个不重复短语（`allocator-golden.json`、`Math.min`、`failing test`、`200 lines`、`line-level`、`task book file`），它们在 2,290 字符的首条消息中全部逐字存在。模型最多可列 12 条，因此“命中/6”只统计这 6 个，不衡量它列出的其他约束是否也来自首条消息。

| 条件 | 产物文本中字面可见 | 有效样本 | 命中/6（每次） | 有效均值 |
|---|---:|---:|---|---:|
| u-full | 6/6 | 2/2 | 3, 4 | 3.5 |
| u-line（4+4 行） | 4/6 | 2/2 | 4, 4 | 4.0 |
| u-char（510+510 chars） | 4/6 | 2/2 | 4, 4 | 4.0 |
| u-none | 0/6 | 2/2 | 0, 0 | 0 |
| 新视图 @6,287 | 6/6 | 1/2 | 3（另 1 次无效） | 3.0（n=1） |
| 新视图 @8,217 | 6/6 | 2/2 | 4, 3 | 3.5 |
| 0.1.5 @6,287 | 6/6 | 2/2 | 3, 4 | 3.5 |
| 0.1.5 @9,583 | 6/6 | 2/2 | 3, 3 | 3.0 |

`新视图 @6,287` 的一次调用返回 HTTP 200 但内容为空，按无效样本剔除；有效的一次为 3/6。若把空响应当作 0/6，均值会是 1.5，但那会把端点空输出误记为模型答错，故不采用；原始日志保留该无效调用。

读法：结构可见性明确支持“行级/字符级隐藏中间行”；但行为分数没有显示“全量原文必然更好”。u-full 与 index/0.1.5 的 6/6 文本仍在，模型在 6 个计分约束中只命中 3–4 个（同时还会列出其他约束）；u-line/u-char 只含 4 个可见计分约束，模型恰好命中这 4 个；u-none 0/6 是干净的下界。结论只能到“文本在/可寻址”，不能到“模型必然提取全部”，也不能从每条件 2 次样本推出形态优劣。

**无提示的 `Pi 1.0.0` 弃答（中性措辞，3 次/条件）**

材料中只有 Pi 1.4.0 的通过数 1139、失败数 0；没有任何 `Pi 1.0.0` 的计数。问题明确允许“无法确定就填 null”。

| 条件 | `null` | 答 1139 | 其他 |
|---|---:|---:|---:|
| 仅尾部 | 3/3 | 0 | 0 |
| 0.1.5 @6,287 | 3/3 | 0 | 0 |
| 0.1.5 @9,583 | 3/3 | 0 | 0 |
| 新视图 @6,287 | 3/3 | 0 | 0 |
| 新视图 @8,217 | 3/3 | 0 | 0 |

本次共 15/15 填 null，没有把 1.4.0 的 1139 当成 1.0.0。方向文档记录过真实会话里原生/0.1.5 摘要编出 1139 的对照；本实验与它不一致，可能来自模型、夹具或提示差异。它只说明“本夹具 + 本提示下弃答可实现”，不能宣称“邻近数字污染已解决”，也不能外推到其他版本陷阱或更强的诱导提示。

**带 offset 的 reader（3 次/协议；同一无计数行视图）**

问题要求给出最早一次测试的 pass/fail、记录引用和保存字段中的字符偏移；最多 3 次只读工具调用。新协议返回字段路径、命中偏移和可执行的 `read`；旧式对照从记录第一页起步，按拼接字段返回，不按字段寻址，也不返回保存字段偏移。

| 协议 | 值/ref 正确 | exact offset | 每次工具调用 | 失败形态 |
|---|---:|---:|---:|---|
| 新协议 `context_index` | 3/3 | 2/3 | 3, 3, 3 | 第二次答 21169（与 `scan` 返回的 `pass` 词元偏移一致），真值是计数短语起点 21165；仍落在计数短语内 |
| 旧式 reader（对照） | 2/3 | 0/3 | 3, 3, 3 | 一次弃答；两次从 `scan` 片段得到值但给不出字段偏移 |

新协议的 3 次都给出值、ref 和可执行地址；2 次精确命中 21,165，1 次答在“pass”词元的起点（21,169），与计数短语起点差 4 个字符，仍落在同一计数短语内。旧式对照的 2 次正确值来自 `scan` 的 300 字符中心片段（片段包含数字但没有字段/偏移），另一次只用 `range` + `read`，三次调用没有到达 21K 记录的尾部；它的 `read` 从记录第一页起步且不返回保存字段偏移，因此 0/3 offset。该对照使用与新协议相同的提示和调用形状，是协议级比较，不是对真实 `vcc_recall` 实现的公平基准；它只证明“协议不提供字段/偏移时，读者无法稳定给出地址”。

这两个结果合起来支持：台账行给“值 + 引用”；reader 给“字段 + 偏移”；只给引用/只给第一页，仍可能把读者送错位置。偏移按 UTF-16 代码单元计；本夹具为 ASCII，未测 emoji/组合字边界。

### 12.6 激活实验（新增）

§12.3–§12.5 都直接给模型工具和问题，测的是“被叫用时检索是否准”，不是“模型会不会在视图缺料时主动调用”。§12.6 补测后者，并比较系统提示词规则是否改变行为。

**夹具与条件。** 只改首条用户消息：加长到 17,055 字符，使 U0 只显示 `lines 1-11, 144-153`（`hidden 12-143`），在中段埋入目标要求；视图 6,169 字符，`#6` 为 `IndexOnly`，尾部仍含最终 1139；其余事实与 §12.1 相同。全部为合成材料；原始日志在 git-ignored 的 `out/`。条件只改系统提示词，工具协议相同：

- **A 无提示**：只给工具名、参数、最多 3 次、输出格式。
- **B 负向**：加 0.1.5 式 `before concluding it is unavailable`。
- **C 正向条件**：§10.5 的规则（检查 `U` 行是否完整；`hidden`/`IndexOnly`/`#N` 时读取原文；不得从摘录推断）。
- **D 正向 + 结构说明**：C 加 `IndexOnly`/`hidden` 的含义。

**问题。** T1 当前可答（最后 1139）；T2 仅 hidden/IndexOnly（最早 422/0，`#6`）；T3 保存历史也没有（Pi 1.0.0）；T4 摘录目标（release checklist 要求，目标在 hidden 中段）；T5“看起来可答”（可见行写“不要重新生成 allocator-golden.json”，hidden 中段才有“用户明确批准新夹具时例外”，单独一轮）。

**主实验（T1–T4，3 次/条件）**

| 条件 | T1 正确 / 无谓召回 | T2 正确 / 首次工具（字段错误） | T3 null / 答 1139 | T4 正确 / 首次工具 |
|---|---:|---|---:|---|
| A 无提示 | 3/3 / 1 | 3/3 / 3（0） | 3/3 / 0 | 3/3 / 3 |
| B 负向 | 3/3 / 0 | 2/3 / 3（2；1 次未恢复） | 3/3 / 0 | 3/3 / 3 |
| C 正向条件 | 3/3 / 0 | 3/3 / 3（0） | 3/3 / 0 | 3/3 / 3 |
| D 正向 + 结构 | 3/3 / 1 | 3/3 / 3（0） | 3/3 / 0 | 2/2 / 2（1 次格式无效） |

**T5“看起来可答”（单独一轮，3 次/条件）**

| 条件 | 正确 | 首次工具 | 平均调用 | 失败形态 |
|---|---:|---:|---:|---|
| A 无提示 | 3/3 | 3/3 | 1.0 | 无 |
| B 负向 | 3/3 | 3/3 | 1.33 | 无 |
| C 正向条件 | 2/3 | 3/3 | 2.67 | 1 次 `scan "allocator-golden.json"` 只命中可见行（隐藏例外写作 `allocator-golden rule`），读 #1 头部后答 null |
| D 正向 + 结构 | 2/2（1 次格式无效） | 2/2 | 2.5 | 1 次改用 native `<｜DSML｜ invoke>` 工具调用，文本 JSON 协议未识别 |

**读法。**

1. **主动性已经存在，工具协议是充分条件。** 无提示的 A 在 T2/T3/T4/T5 都是首次工具：T2/T4/T5 全对，T3 3/3 弃答，没有把 1.4.0 的 1139 当成 1.0.0。B/C/D 没有带来可测正确率增益；C 的 T5 平均调用 2.67、A 为 1.0，规则增加了检索成本但没有换来正确率。不能把 A 的结果外推为所有模型都会主动 recall；它只说明本模型在本夹具上不需要额外提醒。**边界：** 这组问题的可见摘录与提问都带着“需要检索”的线索；§12.7 的 T6 在可见行看似完整、问题不点名隐藏词时，A 有 2/3 直接作答（0 调用），所以“充分”只适用于 T1–T5 的问题形状。
2. **“看起来可答”没有出现“0 调用直接答错”。** T5 中 A/B 仍然先 scan；C 的唯一失败也不是没调用，而是 scan 词与隐藏例外不匹配（`.json` vs `rule`），模型读了 #1 头部后答 null。真正的问题不是“缺少更强提醒”，而是**隐藏区间没有可直接读取的地址**。
3. **隐藏区间必须给地址。** U 行的 `hidden 12-143` 是行号；`read` 用字段/偏移；当前 `view` 只列 shown spans。模型想读隐藏段时只能从字段 0 开始或猜一个 scan 词；T5 的 C 失败正是这个缺口。U 行/`view` 必须直接给出隐藏跨度的字段、起始偏移和可执行 `read`（见 §7.1/§7.2）。这比再加一句提示更可靠，也符合 §13.2“结构优先于提醒语”。**边界：** 地址给的是起点；目标深在 15K 跨度的 9.7K 时，一页 1,200 chars 到不了。§12.7 的 T6 证明“有地址”仍会 0 调用答错或调用后停在一页；下一步需要分页/索引，不能把本项写成任意深度定位。
4. **协议鲁棒性。** D/T4 与 D/T5 各有 1 次使用 `<｜DSML｜ invoke>` 原生工具调用语法，文本 JSON 协议未识别，按格式无效剔除，不算答错；真实宿主应使用 native tool schema，而不是让模型在正文里拼 JSON。
5. **reader 字段错误。** B/T2 有 2 次把工具结果的字段写成 `content`（正确是 `content.0.text`）；旧 reader 返回“has no saved text fields”，其中 1 次未恢复。已把 §7.3 的错误提示要求改为列出可用字段，并在原型 `reader.mjs` 中实现；18/18 结构检查复跑通过。
6. **计分。** T4 的 1 次中文转述“不得…”被旧否定词表漏判，汇总按放宽词表重算；原始分与重算分都在 `out/`。T4 的逐字引用比例为 0，T5 为 1/12；模型多数转述。`correct` 以关键词/语义等价计，不等于逐字引用。
7. **边界。** 单模型、单夹具、每条件 3 次；真实会话、其他模型、长期对话未测。T5 的隐藏例外是合成句，scan 词与目标句的匹配是人为设计；不要把“A 已经会调用”外推为所有模型/会话，也不要把“规则无增益”外推为规则无用——它是安全网，不是已验证的增益。T5 表使用 render-1；render-2 的同夹具 follow-up 与 T6 见 §12.7，两表不能混读。

### 12.7 隐藏跨度地址、T6 无关键词线索与原生协议（新增）

§12.6 的 T5 表使用 render-1：U 行只有 `hidden 12-144` 行号，没有字段/偏移/`read`。§12.7 在 `render.mjs`/`reader.mjs` 增加 render-2（`hiddenAddress`，默认关闭以保持 §12.1–§12.6 的 render-1 字节不变），并做三组预注册 follow-up。全部为合成夹具；模型只用 `deepseek-v4.1-flash-1017`（temperature=0，`reasoning_effort=minimal`）。约束到达前的一次非 DeepSeek 探测已从输出与汇总中删除，不贡献任何数字，也不在本文引用。

**render-2 的结构。** 每个部分引用的 `U`/`A` 行与 `view` 行都带隐藏跨度的字段、UTF-16 起始偏移、跨度长度和可直接执行的 `read`；`IndexOnly` 行把整条主文本字段作为隐藏跨度给出地址。地址是结构行，计入同一预算；它可能挤掉同一 U 行的一级加深。

| 夹具 | render-1 视图 / id | render-2 视图 / id | 隐藏起点 | 目标偏移 | 目标在地址后第一页 |
|---|---:|---:|---:|---:|---|
| t5（同 §12.6，15K 隐藏） | 6,169 / vd4800054 | 6,180 / vc812ed8b | 809 | 9,715 | 否 |
| t5n（近距控制） | 6,233 / v021a042e | 6,135 / vf21511ac | 780 | 993 | 是 |
| t6（同夹具，15K 隐藏） | 6,201 / vae2e0d09 | 6,137 / v3b06626c | 889 | 9,720 | 否 |
| t6n（近距控制） | 6,201 / v70d68dca | 6,174 / v23075d99 | 819 | 1,032 | 是 |

render-2 的体积不一定更大：t5n 的地址 + 约 110 chars 使 U 深度从 `lines 1-12` 退到 `lines 1-11`，视图反而少 98 chars。四档都 ≤ 6,287 上限。

**T5 式 follow-up（3 次/条件）。** 同夹具保留 §12.6 的 15K 隐藏中段与 `allocator-golden rule` 的措辞；近距控制 t5n 把例外移到可见头之后，目标在地址后第一页内。正确 = 明确“只有用户明确批准新 fixture 才可重新生成”。计分在正式运行前放宽为 `approval ∧ new-fixture` 两个正则组：一次冒烟回答把中文“明确批准”和英文“新的 fixture”混用，第一版固定词组漏判；正式运行使用放宽版。

| 条件 | §12.6 T5（render-1）正确 / 平均调用 | render-2 同夹具 正确 / 首次工具 / 平均调用 | render-2 近距 正确 / 平均调用 |
|---|---:|---|---:|
| A 无提示 | 3/3 / 1.00 | 3/3 / 3/3 / 1.33 | 3/3 / 1.33 |
| B 负向 | 3/3 / 1.33 | 3/3 / 3/3 / 1.33 | 3/3 / 1.67 |
| C 正向条件 | 2/3 / 2.67 | 3/3 / 3/3 / 1.67 | 3/3 / 1.00 |
| D 正向 + 结构 | 2/2 / 2.50（1 次格式无效） | 3/3 / 3/3 / 2.00 | 2/2 / 1.00（1 次格式无效） |

- 同夹具 12 条全部把隐藏句带回（`hiddenExposed=12`），12/12 正确；§12.6 的 C 2/3 没有复现，C/D 不再因 scan 词不匹配而失败。
- 但归因要收紧：12 条里 11 条用 `scan`（11 次调用），其中多数扫的是更宽的词元 `"allocator-golden"`，命中隐藏句“allocator-golden rule”；7 条用了 `read`，其中 6 条顺着 scan 命中读附近；只有 1 条（C）真的从 U 行地址起点读（`read #1 offset=809 length=16000`，reader 截到 12,000）。§12.6 失败用的 `scan "allocator-golden.json"`（带后缀）在本轮没有出现。因此“C 从 2/3 变 3/3”不能单独归因于地址；可复核的是地址可执行且被使用 1 次。
- 近距控制 11 条有效全对；用地址起点读的只有 B 1 次、C 2 次（共 3 次），其余从字段 0 或 scan 命中读；D 另有 1 次 `<｜DSML｜ invoke …>` 格式无效，按无效剔除，不算答错。

**T6 无关键词线索（3 次/条件）。** 可见头写“Changelog checklist: a passing full test suite is sufficient; record the changelog entry immediately after it passes.”；隐藏中段写“Release-note correction: a single green run is never sufficient; require an independent rerun before the entry is recorded.”。问题问“完整测试套件通过后可以直接记录 changelog 吗”，只共享可见词的 `Changelog`/`commit`/`test suite`，不点名 `Release-note`/`independent rerun`/`green run`。预注册：truth=false；`correct = record_changelog === false`；`grounded` = `why` 落到独立重跑/never sufficient；`zeroCallWrong` = 首轮直接作答且不正确。

| 条件 | 同夹具 正确 | 首次工具 / 首次作答 | 0 调用答错 | 隐藏句带回 | 用地址读 | 调用数 |
|---|---:|---|---:|---:|---:|---|
| A 无提示 | 0/3 | 1 / 2 | 2 | 0 | 0 | 2, 0, 0 |
| B 负向 | 1/3 | 2 / 1 | 1 | 1 | 0 | 1, 1, 0 |
| C 正向条件 | 1/3 | 3 / 0 | 0 | 1 | 1 | 1, 1, 2 |
| D 正向 + 结构 | 0/3 | 3 / 0 | 0 | 0 | 0 | 2, 2, 1 |

| 条件 | 近距 正确 | 首次工具 / 首次作答 | 0 调用答错 | 隐藏句带回 | 用地址读 | 调用数 |
|---|---:|---|---:|---:|---:|---|
| A 无提示 | 2/3 | 2 / 1 | 1 | 2 | 1 | 1, 0, 1 |
| B 负向 | 3/3 | 3 / 0 | 0 | 3 | 1 | 1, 2, 1 |
| C 正向条件 | 3/3 | 3 / 0 | 0 | 3 | 3 | 1, 2, 1 |
| D 正向 + 结构 | 3/3 | 3 / 0 | 0 | 3 | 1 | 1, 3, 1 |

- **0 调用直接答错首次出现。** A 同夹具 2/3、B 1/3 在首轮直接答 true；可见行看似回答全部，问题又没有隐藏词线索。地址存在但 A 没有用它；B 的负向规则也没有覆盖“看起来可答”。
- **调用不等于到达。** 同夹具 12 条里 7 条调用了却没把隐藏句带回：A 1 条读 0-2,000 后 `scan "changelog"`；B 1 条读 2,000；C 2 条读 1,200/2,200 后停下；D 3 条读 2,000、2,000-9,000、4,000。D 的第二条只差 720 chars 到目标（9,720）。C 的第三条确实从地址起点读（`read #1 offset=889 length=1200`），但仍停在隐藏段第一页。
- **暴露决定正确。** 同夹具只有 2 条把隐藏句带回（B 1、C 1），这 2 条都答对；其余 10 条都没带回，全部答错。近距 11 条带回、11 条正确；唯一没带回的 A 第 2 次答错。T5 同夹具 12/12、近距 11/11 也都是“带回即正确”。在这组合成数据里，失败是检索到达问题，不是答案组织问题。
- **近距控制说明地址有效。** 目标在第一页内时 C/D 3/3、A 2/3；用地址起点读的共 6 次（A 1、B 1、C 3、D 1），其余从字段 0 或后续页读。A 仍有 1 次 0 调用答错，说明触发层与到达层要分开报告。

**原生协议（2 次/条件，3 次上限）。** §7.4 的 schema 通过 `tools` 传入，模型发结构化 `tool_calls`，宿主执行后以 `role:"tool"` 送回；本地替身只在流式增量里给 `tool_calls`，所以运行走流式重组。

| 夹具 | 条件 | 正确 | 调用数 | 隐藏句带回 | 格式无效 |
|---|---|---:|---|---:|---:|
| 同夹具 | A | 2/2 | 2, 2 | 2 | 0 |
| 同夹具 | B | 2/2 | 2, 2 | 2 | 0 |
| 同夹具 | C | 1/2 | 3, 3 | 1 | 0 |
| 同夹具 | D | 1/2 | 2, 1 | 1 | 0 |
| 近距 | A | 2/2 | 2, 1 | 2 | 0 |
| 近距 | B | 2/2 | 3, 1 | 2 | 0 |
| 近距 | C | 2/2 | 1, 1 | 2 | 0 |
| 近距 | D | 2/2 | 1, 2 | 2 | 0 |

- native 的 8 个条件（16 行）没有格式无效；文本替身在 T5 近距 D 仍有 1 次 `<｜DSML｜ invoke …>`，在 §12.6 D/T5 也有 1 次。原生调用语法在文本协议下必须按无效记录，不能算答错。
- native 同夹具 A/B 2/2 的直接原因是读取窗口：A 的两次运行都先读 `offset=0 length=12000`（其中一次随后再读 6,000），B 读 12,000 + 6,000/5,200，覆盖了 9,720 的目标；文本替身示例写 800/1,200，JSON 组的 A 只读 2,000 后 scan。协议/示例改变了窗口，不是模型能力差异。正式对照必须固定窗口提示（例如都允许 `length` 到 12,000，或都限制到 1,200）。
- native 的 C/D 各有 1 条读到 3,000-9,200 就停，仍未到目标；所以“结构化协议”只解决格式与参数，不解决深度分页。

**计分与边界。** 所有行只来自上述 DeepSeek 模型；每条件 2–3 次；夹具是合成的，扫描词、填充行数和目标位置都是人为设计；`hiddenExposed` 以隐藏句是否出现在工具结果中计，`usedAddress` 以 `read` 是否从 U 行打印的起点开始计；两者都是结构指标，不是答案质量。`exposure ⇒ correct` 是本夹具内的经验规律，不是定理：真实会话里模型可能带回原文仍解释错，也可能没带回原文却从别处答对。原日志在 git-ignored 的 `research/prototype/out/`；本文只引用聚合计数，不复制其中正文。

### 12.8 隐藏跨度页表、成本化窗口与分页规则（新增）

§12.7 的结论是“地址是起点，不是任意深度定位”。§12.8 把这句话变成可测的结构：render-3 在隐藏跨度上给出 `span/pages/windows`、成本化 `max` 窗口，`view` 给出页表，`read` 支持 `page`/`line` 与成本行；再用 T6 同夹具做预注册 A/B/C/D × 3、C2/D2 × 3、近距控制、长跨度控制、6 次重复和 render-4 全跨度探索。§12.3、§12.6、§12.7 的表都未改；本节是后续结果。全部为合成夹具；模型只用 `deepseek-v4.1-flash-1017`（temperature=0，minimal reasoning）；原始输出只在 git-ignored 的 `research/prototype/out/`，本文只引用聚合计数。

**机制。** 只有隐藏跨度超过一页（`PAGE=1200` chars）才改变地址；更短的跨度保持 render-2 的字节。时间线示例（合成）：

```text
U #1 [lines 1-10, 146-154 of 154; hidden 11-145; field=content 889-16077 of 17184; span=15188 pages=13 windows=2; max: {"read":1,"field":"content","offset":889,"length":12000} ~3822tok; view vfdaf9adb]
```

- `pages=ceil(span/1200)`，页从隐藏跨度起点按 1,200 chars 固定网格切；`windows=ceil(span/12000)`，一个窗口是一次 `read` 的上限。末页可以更短。
- `max` 是可执行的一次读取：起点为跨度起点，长度 `min(12000, span)`；`~Ntok` 是按 recipe 的 `c=3.14` 估算的分配成本，标为估算，不是计费。`read` 结果加一行 `[cost N chars ~Ttok; hidden span a-b, unread U]`，并保留 `next` 偏移。
- `view` 对前两个隐藏跨度列出页表：`span=… pages=… windows=…; pages@889,2089,…,14089,+1 more (last@15289); max: {…}`；`read` 的 `page=k` 从跨度起点解析到 `start+1200(k-1)`，`line=L` 解析到字段第 L 行的起点；`page`/`line` 互斥，且不能与 `offset` 同用。
- 默认 `readMaxChars=12000`；render-4 只在探索臂把它放到 48,000，用一次读取覆盖 37K 跨度，地址与结果都打印全跨度的成本。48,000 不是默认策略。
- 地址是结构文本，计入预算。T6 视图从 render-2 的 6,137（`v3b06626c`）增到 6,177（`vfdaf9adb`，+40）；t6n 从 6,174（`v23075d99`）增到 6,211（`v761c5494`，+37）；t6l 6,177（`v0dabfee8`）；render-4 t6l 6,178（`v46263d34`）。render-1/2 的快照哈希在改动前后逐字一致（`render-snapshot.mjs`）。

**预注册。** 三份文件在运行前写入：`PREREG_RENDER3.md`、`PREREG_RENDER3_REPLICATION.md`、`PREREG_RENDER4.md`。主臂固定为 P0 render-2/T6/A,B,C,D×3；P1 render-3/T6/A,B,C,D×3；P2 render-2/T6/C2,D2×3；P3 render-3/T6/C2,D2×3；S1 render-3/t6n/A,B,C,D×3；S2 render-3/t6l/A,B,C,D,C2,D2×3。实际运行顺序是 P0、P1、P2、P3、R0、R1、S1、S2、S2b、F1、F2：重复臂插在主预注册的 S1/S2 之前，属于**顺序偏差**，已在此记录；每臂内部条件顺序固定。C2/D2 是**新增条件**：C 或 D 加同一条分页规则（原文）：

> If a `U` line has a `hidden` span longer than 1,200 chars, or a tool result ends with a `next` offset, the span is not fully read. Continue from that `next` offset, or use the printed `max` read, until the span is covered or the text the question depends on is found. Do not answer from the first page alone.

规则只绑定结构信号（跨度长度、`max`、`next`），不做语义判断。主结果之后另做 6 次重复（R0 render-2、R1 render-3，A/C）和 render-4 探索（F1 C,C2,D2，F2 A；t6l）。重复与探索都在自己的预注册文件里，不能替换主臂。

**夹具。** T6 与 §12.7 相同：可见头写“完整套件通过即可记录”，隐藏中段写“单次 green run 永远不够，必须独立重跑”；问题不点名隐藏词；truth=false。t6n 把目标放在地址后第一页内。t6l 只增加填充行，把目标推到 55.6% 处，使第一个 12K 窗口到不了。

| 夹具 | 隐藏跨度 | span | pages | windows(12K) | 目标偏移 | 目标在第一页 | 视图 |
|---|---:|---:|---:|---:|---:|---|---:|
| t6 | 889-16077 | 15,188 | 13 | 2 | 9,720 | 否 | 6,177 / vfdaf9adb |
| t6n | 819-5877 | 5,058 | 5 | 1 | 1,032 | 是 | 6,211 / v761c5494 |
| t6l（render-3） | 889-38217 | 37,328 | 32 | 4 | 20,751 | 否 | 6,177 / v0dabfee8 |
| t6l（render-4） | 889-38217 | 37,328 | 32 | 1 | 20,751 | 否 | 6,178 / v46263d34 |

**主臂（3 次/条件；T6 15K 跨度）。** P0 是本次的**同帧新基线**（render-2，视图 v3b06626c），不是 §12.7 那 12 条的复跑；同视图、同提示、相隔数十分钟仍有差异（§14 第 1 条）。 “正确/有效”排除空响应、`<invoke>` 格式无效和非 JSON 作答；这些单独计数。原始汇总每行记录 `firstAction`、`calls`、`hiddenExposed`、`targetCoveredByRead`、`usedAddress`（从地址起点读）、`usedMax`、`usedPage`、`readCalls`/`targetReadCalls`（翻页次数）、`pagesCovered`（1,200 网格覆盖页数）、`maxOffsetReached`、`correct`、`groundedCorrect`、`zeroCallWrong`、`toolChars`、`promptTokens`；下面表格只挑与结论相关的列，完整字段在 `render3-summary.json`。`grounded` 只对 T6 的 `why` 是否落到独立重跑/never sufficient 计；`目标被读覆盖` 是读区间是否真的包含目标偏移，独立于模型答案。

| 臂 | render | 条件 | 有效 | 正确 | grounded | 目标被读覆盖 | 0 调用答错 | 调用数 | 工具字符均值 |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| P0 | 2 | A | 3 | 0 | 0 | 0 | 3 | 0,0,0 | 0 |
| P0 | 2 | B | 3 | 0 | 0 | 0 | 1 | 2,0,1 | 2,089 |
| P0 | 2 | C | 3 | 0 | 0 | 0 | 0 | 1,2,1 | 3,845 |
| P0 | 2 | D | 3 | 0 | 0 | 0 | 0 | 2,2,3 | 2,476 |
| P1 | 3 | A | 3 | 0 | 0 | 0 | 3 | 0,0,0 | 0 |
| P1 | 3 | B | 3 | 1 | 1 | 1 | 1 | 2,0,1 | 5,633 |
| P1 | 3 | C | 3 | 3 | 3 | 3 | 0 | 1,1,1 | 12,165 |
| P1 | 3 | D | 2* | 2 | 2 | 2 | 0 | 1,2 | 14,373 |
| P2 | 2 | C2 | 3 | 1 | 0† | 0 | 0 | 3,2,1 | 2,252 |
| P2 | 2 | D2 | 3 | 1 | 1 | 1 | 0 | 3,1,1 | 5,082 |
| P3 | 3 | C2 | 3 | 3 | 3 | 3 | 0 | 2,1,1 | 13,637 |
| P3 | 3 | D2 | 3 | 3 | 3 | 3 | 0 | 1,1,1 | 12,165 |

`*` P1/D 有 1 次 0 调用、非 JSON 作答，按格式无效排除（不计答错）。`†` P2/C2 的唯一正确答把可见规则反过来答 false，但 `why` 编造了材料没有的额外前置条件，`grounded=false`；这说明**布尔正确不等于有据**。

**重复（6 次/条件；A/C，T6 同夹具）与合并。**

| 批次 | render | 条件 | 有效 | 正确 | grounded | 目标覆盖 | 0 调用答错 | 调用数 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| R0 | 2 | A | 6 | 0 | 0 | 0 | 5 | 1,0,0,0,0,0 |
| R0 | 2 | C | 6 | 2 | 2 | 2 | 0 | 1,3,1,2,1,2 |
| R1 | 3 | A | 6 | 1 | 1 | 1 | 4 | 0,0,0,0,1,2 |
| R1 | 3 | C | 6 | 6 | 6 | 6 | 0 | 1,1,1,1,1,1 |

| 合并单元格 | 正确/有效 | Wilson 95% | grounded | 目标覆盖 | 0 调用答错 |
|---|---:|---|---:|---:|---:|
| A / render-2（P0+R0） | 0/9 | [0.00, 0.30] | 0 | 0 | 8 |
| A / render-3（P1+R1） | 1/9 | [0.02, 0.44] | 1 | 1 | 7 |
| C / render-2（P0+R0） | 2/9 | [0.06, 0.55] | 2 | 2 | 0 |
| C / render-3（P1+R1） | 9/9 | [0.70, 1.00] | 9 | 9 | 0 |

C 的两个区间不重叠；这是描述性方向，不是显著性检验。A 的两个区间重叠，**触发缺口没有因 render-3 而改善**。C/render-2 的 2 次成功也不是小窗口：一次读 `offset=889 length=12000`，一次读 `offset=0 length=17184`（reader 截到 12,000）再读 6,000；也就是说 12K 窗口在 render-2 也可用，只是没有被地址提示。P1/P3 的 C/C2/D2 共 9 条全部复制了地址里的 `offset=889 length=12000`，一次调用覆盖目标；这把差异定位为**窗口选择/协议提示**，不是模型能力。

**近距控制（S1，t6n，3 次/条件）。** A/B/C/D 共 12 条全部正确、全部 grounded、全部目标覆盖、全部使用地址的 `max`（5,058 chars）；调用数 1–2，工具字符 5,214–5,648。近距时地址加一次读取足够，四个条件没有差异；这与 §12.7 的 t6n 方向一致，A 从 2/3 变为 3/3，但 render 与批次都不同，样本也太小，不能据此说提示词有效。

**长跨度控制（S2 + S2b，t6l，37K 跨度，24 条）。**

| 范围 | 有效 | 正确 | grounded | 目标覆盖 | 隐藏句暴露 | 读到第二窗口起点 | 0 调用答错 |
|---|---:|---:|---:|---:|---:|---:|---:|
| A/B/C/D（S2，12 条） | 11* | 1 | 0 | 0 | 0 | 0 | 3 |
| C2/D2（S2，6 条） | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| C2/D2（S2b，6 条；事后确认，未预注册） | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 合计 24 条 | 23* | 1 | 0 | 0 | 0 | 0 | 3 |

`*` S2/A 有 1 次 `<invoke>` 格式无效，按排除计（没有空响应）。唯一“正确”是 S2/D 的一次布尔 true→false 猜中，`why` 没有落到隐藏更正，`grounded=false`，不能算恢复。24 条里没有一条在第二窗口起点 `offset=12889` 读取；C2/D2 的 12 条（S2 6 + S2b 6）也没有。1 条 C2（S2b）读了跨度末页 `offset=38217`，仍错过 20,751。分页规则、`windows=4`、页表、`next` 文本同时存在，仍没有产生第二次窗口读取；代价却是每条约 10–20K 工具字符、12–21K prompt tokens。S2b 是看到 S2 结果后追加的确认批，**不在预注册主臂内**；去掉 S2b 时 S2 的 18 条已经 0 目标覆盖，结论不变。

**render-4 探索（t6l，全跨度 48K 策略）。** 地址把 `max` 写成 `length=37328 ~11888tok`，`windows=1`；`read` 上限 48,000。C/C2/D2 共 9 条，3 条正确/grounded/目标覆盖，6 条仍选 2K–8K 的小窗口或只 scan；A 3 条 0 正确、2 条 0 调用答错。render-4 **只跑文本替身**；native schema 的 `maximum` 仍是 12,000，48K 需要宿主 policy 同时改 schema 与 view 地址，未验证，不能把本表写成 native 能力。

| 条件 | 有效 | 正确 | grounded | 目标覆盖 | 读到全跨度 | 工具字符均值 | prompt tokens 均值 |
|---|---:|---:|---:|---:|---:|---:|---:|
| C | 3 | 1 | 1 | 1 | 1 | 16,802 | 12,031 |
| C2 | 3 | 1 | 1 | 1 | 1 | 14,852 | 16,551 |
| D2 | 3 | 1 | 1† | 1 | 0（2×20K） | 13,927 | 13,657 |
| A（F2） | 3 | 0 | 0 | 0 | 0 | 191 | 3,707 |

`†` D2 的命中被拆在两次 20,000-char 读取里：第一次到 20,800，第二次从 20,800 起；目标句跨在两个工具结果之间，单条结果的 `hiddenExposed` 为 false，但 `targetCoveredByRead=true` 且答案 grounded。全跨度命中的三条工具字符 37,491/38,684/39,069，prompt 13,986/25,676/25,305；约为 6,177 字符视图的 6.1–6.3 倍。**更大的窗口能被选中时能覆盖，但只有 2/9 直接读全跨度、3/9 覆盖目标；成本是真实的，不能作为默认策略。**

**发现。**

1. **打印出的 max 窗口 + 正向条件规则是当前最有效的组合，但不是能力差异。** C/render-3 合并 9/9，全部一次 `read offset=889 length=12000`；C/render-2 合并 2/9，且两次成功都是模型自己选了 12K/17K。A/render-3 仍 1/9、7 次 0 调用答错。地址是必要条件，不是充分条件；“给出窗口”改变的是选择分布。
2. **触发层仍未解决。** “看起来可答”的 T6 在无提示 A 下 render-3 也只有 1/9 正确、7/9 零调用答错；`max` 地址本身不会让模型去读。正向条件规则 C 与 max 同时存在时才 9/9。不要把“工具可达/地址可执行”写成“模型会主动 recall”。
3. **分页规则没有可测增益。** P2（规则、无 max）C2 1/3（其中 1 条无据）、D2 1/3；P3（规则 + max）的 C2/D2 为 3/3、3/3，P1 的 C/D 为 3/3、2/2（D 有效 2，另 1 条非 JSON 排除），都在天花板附近，无法区分规则增益；长跨度 C2/D2 0/12 目标覆盖（S2 6 + 事后确认 S2b 6），0 条跟随 `next`。规则保留为可选安全网可以，但不能写成修复；本设计**不把它加入默认 promptGuidelines**。
4. **页表/可跳转索引在本样本 0 次使用。** 所有臂的 `usedPage` 都是 0；`page` 与 `line` 从未被调用，模型只用 `offset`/`length`。页表是结构上可执行、行为上未被使用的导航；它只在 `view`（取用时才付费）里，时间线只付 `span/pages/windows/max/cost`。不要把“页表存在”写成“分页已解决”。若 v1 要减复杂度，可以只保留 max+next+cost，把页表留作可选。
5. **超过一个读窗口的跨度仍未解决。** 24 条长跨度运行 0 覆盖、0 暴露、0 跟随 `next`；render-4 把全跨度成本明示后也只有 2/9 直接读全跨度、3/9 覆盖目标。下一次结构改进应是宿主侧强制覆盖循环（服务端按 `next` 取完并合并成一个结果、明示总成本），或改变压缩策略使超大用户跨度不被隐藏成多窗口；两条都需要新的预注册对照，不能拿“把窗口调大”当作通用修复。
6. **成本必须计入盈亏。** 15,188-char 隐藏跨度的一次 max 读是 12,000 chars ≈ 3,822 tok，加 6,177-char 视图（约 1,967 tok）共约 18K chars，已超过被隐藏的 15K 原文；37,328-char 全跨度读加视图约 43.5K chars，超过 39.3K 的原文，且 prompt 到 14–25K tokens。压缩只有在隐藏文本不被立即读取、或视图跨多次请求复用时才划算；重复读取会叠加成本。这个算术是设计约束，不是某次账单。
7. **正确不等于有据；暴露可能是拆开的。** P2/C2 的 1 条正确答无据；S2/D 的 1 条也是猜中。render-4/D2 的目标句跨两个结果，单结果 `hiddenExposed=false` 但目标被覆盖且答案 grounded；所以 `hiddenExposed` 是保守指标，`targetCoveredByRead` + grounded 更接近可用性。报告必须同时给两者。
8. **同帧基线不可省，顺序未随机化。** P0 的 0/12 与 §12.7 T6 的 2/12 不同；同一 render-2、同夹具、同提示，相隔数十分钟就有差异。P0 先跑、R0 后跑，R0/render-2 仍只有 2/6，说明 C/render-3 的 9/9 不能简单归因于时间漂移；但本批没有随机化条件顺序，也没有跨模型，结论只到“本模型、本夹具、本顺序的描述性方向”。每格 2–9 次，Wilson 区间已给；不写显著性。
9. **原生协议未重跑。** §12.8 全部是文本 JSON 替身；§12.7 的 native 只在本机替身端点上闭环，非流式丢 `tool_calls`、只能流式重组。真实 Pi 宿主的注册、权限、错误传播、并发与取消仍未验证；设计见 §7.4，不能写成“真实宿主已验证”。

**边界。** 单模型（DeepSeek）、单合成夹具族、每格 2–9 次、固定顺序；目标位置、填充行、扫描词都是人为设计；没有真实会话、其他模型、100k/200MB、真实 fork 或真实宿主。`exposure ⇒ correct` 只在“带回隐藏句”的子集里成立，且不是定理；本节的负结果（长跨度 0/24、页表 0 使用、规则无增益）是本样本的强警告，不是对所有模型/会话的普适定律。

### 12.9 服务端合并覆盖（render-5）与真实 Pi 宿主（新增）

§12.8 留下的主缺口是：隐藏跨度超过一个 `max` 窗口（12,000 chars）时，24 条长跨度运行 0 条覆盖目标、0 条跟随 `next`；页表与 `page`/`line` 在全部臂 0 次使用；render-4 把窗口放到全跨度后也只有 2/9 直接读、3/9 覆盖。§12.9 实现并测试**宿主侧覆盖循环**：服务端按 `next` 取完连续窗口，合并成一个带总成本的结果（render-5 的 `cover`），再按 §7.4 在**真实 Pi 宿主**上验证工具注册、schema 拒绝、错误传播、权限钩子与部分结果。§12.3、§12.6、§12.7、§12.8 的表与 render-1/2/3 的字节未改；本节是新 render、新条件与新验证层。全部为合成夹具；模型只用 `deepseek-v4.1-flash-1017`（temperature=0，minimal reasoning）；原始输出只在 git-ignored 的 `research/prototype/out/`，本文只引用聚合计数。

**与 §12.8 的关系。** §12.8 的发现 5（“下一次结构改进应是宿主侧覆盖循环”）与发现 9（“真实 Pi 宿主的注册、权限、错误传播、并发与取消仍未验证”）是 §12.8 当时的状态；本节已实现并测试覆盖循环，并在真实 in-process Pi SDK 上验证了注册、schema 拒绝、错误传播、部分结果、工具层并发、扩展侧预算与 hidden 语义的主要环节。§12.8 的表与结论保持当时批次不变，不回溯修改；阅读状态以本节为准：发现 5 的机制缺口已由 cover 补上（37K 上 C5 7/9），触发缺口与默认政策仍未解决；发现 9 中注册、schema、错误传播、部分结果、工具层并发、预算与 hidden 已闭环，运行中取消、宿主调度并行、权限扩展端到端仍未闭环。

**机制（render-5）。** 只对超过一个读窗口（span > 12,000）的隐藏跨度打印 `cover`；`max`、页表、`page`/`line`、schema 的 `length` 上界（12,000）都不变。地址（合成）：

```text
U #1 [lines 1-9, 326-334 of 334; hidden 10-325; field=content 803-38217 of 39324; span=37414 pages=32 windows=4; max: {"read":1,"field":"content","offset":803,"length":12000} ~3822tok; cover: {"read":1,"field":"content","offset":803,"cover":true} ~11916tok (all windows); view v3614f5ed]
```

- reader 的 `cover`：从给定 offset（缺省为最大隐藏跨度起点）连续拼接到该隐藏跨度末尾，**一个工具结果**返回精确子串；结果头是 `#1 [user] field=content 803-38217 of 39324 (cover: 4 windows merged, hidden span 803-38217)`，并给 `[cost 37414 chars ~11916tok; hidden span 803-38217, unread 0]`。读完时 `[end of hidden span; field continues to 39324]`；未读完（`coverMax` 更小）时 `[cover incomplete: 20000 of 37414 chars; next: read #1 field="content" offset=20803 length=12000]`。
- `coverMax=48000` 是独立的宿主策略，不是读窗口：它决定一次合并能覆盖多少；超过它的跨度显式部分覆盖并给 `next`。`cover` 与 `length`/`page`/`line` 互斥（明确报错）；打印成本是**整个被覆盖区间**的估算，不是单个窗口。
- 地址计入同一 6,287 chars 预算，代价是真实的：t6（15K）与 t6l（37K）各挤掉一条 U 行被引用行（`1-10 → 1-9`），隐藏跨度因此增加 86 chars（15,188→15,274；37,328→37,414），视图 6,177→6,176 / 6,177→6,177；t6n（5,058）不打印 cover，字节与 render-3 完全相同（6,211 / v761c5494）。render-5 的 t6/t6l 视图 id 是 vff37f466 / v3614f5ed；render-1/2/3 的 id 与长度逐字不变。
- 结构检查并入既有 18 项（没有新增条目）：`node research/prototype/probe-render5.mjs` 断言 cover 正文严格等于源切片、成本行 chars 等于返回长度、`all windows` 时 `unread 0`、`coverMax=20000` 时 t6l 返回 `cover incomplete: 20000 of 37414` 且 `next offset=20803` 可执行、cover+length / cover+page 明确报错、`view` 行里的同一个 cover 调用可执行；`node research/prototype/invariants.mjs` 仍为 18/18。

**预注册与运行。** 主臂预注册 `PREREG_RENDER5.md` 在任何本批请求前写入；重复批 `PREREG_RENDER5_REPLICATION.md` 在主结果后、重复前写入。固定顺序：R5-A（t6l/render-5/A,B,C,D,C2,D2,C5,D5 × 3）、R5-B（t6l/render-3/A,C,D × 3）、R5-C（t6/render-5/同 8 条件 × 3）、R5-D（t6n/render-5/C,C5 × 3）；随后 R5-R1（t6l/render-5/C,C2,C5,D5 × 6）、R5-R2（t6l/render-3/C × 6）、R5-R3（t6/render-5/C,C5 × 6）。共 105 条运行，全部 `valid`：invalid 0、formatErrors 0、unparsed 0。条件顺序与臂顺序固定、未随机化，按顺序偏差记录。C5/D5 是新增条件，与 C/D 的唯一差别是一条绑定结构信号的规则（原文）：

> A `U` line whose hidden span is longer than one read window prints two calls: `max` covers the first window only, and `cover` returns the whole span in one result with its total cost. If the question depends on the hidden middle and the span is longer than one window, use the printed `cover` call; do not stop after `max` or after one `next` page.

**主结果（t6l，37K 跨度；主 3 次 + 重复 6 次）。** 计分只对 T6 的 `record_changelog`；`grounded` 只对 `why` 是否落到独立重跑/never sufficient。`targetCoveredByRead` 与 `pagesCovered` 本批改用**结果头里的实际返回区间**（夹取与合并读取按真实区间计），因此与 §12.8 的请求参数口径不可逐格对比。每行原始字段还含 `firstAction`、`readCalls`、`scanCalls`、`viewCalls`、`maxOffsetReached`、`usedAddress/usedMax/usedCover`、`coverCalls/coverChars/coverComplete`、`readLengths`、`toolChars`、`promptTokens`；下表只挑与结论相关的列，完整字段在 `render5-summary.json`。

| 条件 | 有效 | 正确 | grounded | 目标被读覆盖 | 隐藏句暴露 | cover 运行 | usedMax | 0 调用答错 | 调用数 | 工具字符均值 | prompt tokens 均值 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| A 无提示 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1,1,0 | 4,246 | 5,557 |
| B 负向 | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1,1,1 | 4,953 | 6,680 |
| C 正向条件 | 9 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 2,2,2,1,2,2,1,2,1 | 11,267 | 11,734 |
| D 正向 + 结构 | 3 | 1 | 1 | 0 | 1 | 0 | 2 | 0 | 3,2,2 | 9,440 | 13,985 |
| C2 正向 + 分页 | 9 | 3 | 3 | 3 | 3 | 0 | 9 | 0 | 3,3,3,3,3,2,3,1,2 | 20,004 | 20,463 |
| D2 结构 + 分页 | 3 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2,2,2 | 11,677 | 13,794 |
| C5 正向 + 覆盖 | 9 | 7 | 7 | 7 | 7 | 7 | 0 | 1 | 2,1,1,1,1,0,1,1,1 | 29,452 | 13,570 |
| D5 结构 + 覆盖 | 9 | 5 | 5 | 5 | 5 | 5 | 4 | 0 | 2,1,1,2,2,1,1,1,3 | 26,679 | 14,826 |
| render-3 C（同帧） | 9 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | 2,1,2,3,1,2,2,2,3 | 11,378 | 13,341 |
| render-3 A / D（同帧） | 3 / 3 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 2 | 0 / 0 | 1,1,2 / 2,2,1 | 786 / 12,534 | 6,655 / 11,952 |

- C5 的 Wilson 95% 为 7/9 [0.45, 0.94]，D5 5/9 [0.27, 0.81]，C 0/9 [0.00, 0.30]，C2 3/9 [0.12, 0.65]；同帧 render-3 C 0/9 [0.00, 0.30]。这是描述性方向，不是显著性检验。
- **覆盖机制在被使用时有效，但不是触发保证。** C5 的 7 条 cover 运行全部正确、有据、目标覆盖且 `unread 0`，各覆盖 32/32 页，`readCalls` 1–2（cover 本身计为一次读；第 1 条另读已显示的尾部）；2 条失败都没有调用 cover：1 条 0 调用直接答 true（`pagesCovered=0`），1 条只 `scan "changelog"` 后答 true（`pagesCovered=0`）。合并 9 条的 `pagesCovered` 均值 24.9。D5 的 5 条 cover 各 32/32；4 条失败也没有调用 cover（3 条只读 `max`、1 条 scan+max+头部读取），合并均值 22.2。
- **同视图无规则仍不覆盖。** C 0/9、D 0/9、D2 0/3，均未使用 cover；C 的 8/9 读了 `max`（12,000，覆盖范围到 12,803），仍停在目标 20,751 之前。D 的唯一“正确”是 `scan "release" scope:"all"` 的片段命中：`hiddenExposed=true`、`targetCoveredByRead=false`，片段含隐藏句但读取区间没有覆盖目标偏移；不能算深跨度恢复。
- **C2 的分页规则有时能到达目标，但成本更高。** 3/9 覆盖：两条在重复批里连续跟 `next`（12,000 + 12,000，其中一条多读一窗），一条在主臂里跟三次；成功条目工具字符约 24–36.5K、prompt 约 21.6–28.2K。C2 的均值 prompt 20,463，高于 C5 的 13,570。
- **D5 没有优于 C5。** 5/9 vs 7/9，区间重叠；两者只差 STRUCTURE 一行。不写因果，也不把结构行当修复。

**15K 与近距控制（render-5）。**

| 夹具/条件 | 有效 | 正确 | 目标覆盖 | cover 运行 | usedMax | 调用数 | 工具字符均值 | prompt tokens 均值 |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| t6 / C | 9 | 9 | 9 | 2 | 7 | 1,1,1,2,1,1,1,1,2 | 13,904 | 10,083 |
| t6 / C5 | 9 | 9 | 9 | 9 | 0 | 1,1,1,1,1,1,1,2,1 | 15,538 | 9,706 |
| t6 / D5 | 3 | 3 | 3 | 3 | 0 | 1,1,1 | 15,474 | 9,432 |
| t6 / A | 3 | 1 | 1 | 0 | 1 | 0,0,1 | 4,055 | 5,299 |
| t6n / C | 3 | 3 | 3 | 0 | 3 | 1,2,1 | 5,648 | 8,429 |
| t6n / C5 | 3 | 3 | 3 | 0 | 3 | 1,1,1 | 5,214 | 7,129 |

- 15K 时 `max` 已覆盖目标（9,720 在第一窗口内），cover 是**多余**的：C5 仍 9/9 使用 cover，工具字符从 C 的 13,904 增到 15,538（约 +12%），单次 `cover` 的工具结果 15,474 chars（正文 15,274 chars ≈ 4,865 tok）。C 在无规则下也有 2/9 自发使用 cover（15K 的打印成本 4,865 tok 比 37K 的 11,916 tok 更容易被接受）；这只是本样本的描述性选择，不能写成成本阈值定律。
- t6n 的 render-5 与 render-3 字节相同（6,211 / v761c5494），C/C5 各 3/3、cover 0 次；近距没有回归。
- 15K 的 C 有 1 条用了两次 `max`（工具 16,701、prompt 15,090），比一次 cover（15,474 / 9,342）更贵：**单次读取的字符更多，不等于端到端更贵**。

**成本账。** 37K 的一次 cover 工具结果是 37,615 chars（正文 37,414 chars ≈ 11,916 tok），加 6,177 chars 视图约 43.8K chars，已超过 39,324 chars 的原文；15K 的 cover 工具结果 + 视图约 21.7K，也超过 17,184 chars 原文。这个算术没有变，也不能用“全跨度读”当默认。真正的对比是**路由**：

| 37K 上到达目标的路由 | 调用 | 工具字符 | prompt tokens（累计） |
|---|---:|---:|---:|
| 一次 cover | 1 | 37,615 | 14,208 |
| cover + 再读已显示尾部 | 2 | 38,808 | 25,777 |
| 连续两个 next 窗口 | 2 | 24,334 | 21,614 |
| 三个 next 窗口 | 3 | 36,498–36,501 | 28,167–28,171 |

一次 cover 的 prompt 成本约为三次 next 的一半，因为每次 next 都会把之前的 12K 结果重新发送。压缩的收益仍取决于隐藏文本是否被立即/重复读取；但在“必须到达深目标”的情况下，一次明确成本的 cover 比盲目翻页更省总输入 token。成本行是估算（`c=3.14`），不是账单。

**真实 Pi 宿主（§7.4 的实现与验证）。** `research/prototype/host-pi.mjs` 用 in-process Pi SDK 建会话：临时 `cwd`/`agentDir`、只启用 `context_index`、`defineTool` + TypeBox + `pi.registerTool`；模型走本机 OpenAI 兼容的 DeepSeek 替身端点。宿主是真实 Pi 运行时，端点不是。开发中因探针 bug（工具未激活、预算耗尽、重名）运行过多次，最终 `host-pi.json` 只记录修复后的一轮；这些都不是条件实验，不计分。24/24 项检查通过：

- **注册与声明。** 工具出现在 `getActiveToolNames()`（仅 `context_index`），`promptSnippet` 与 `promptGuidelines` 进入系统提示词（11,392 chars）；annotations（`readOnlyHint`、`idempotentHint`、`destructiveHint:false`、`openWorldHint:false`）随定义注册，但宿主不会自动执行权限，权限仍是独立扩展的职责。
- **schema 拒绝。** 6 类非法参数（额外顶层属性、`length>12000`、负 `index`、`status` 大小写不匹配、空 `scan`、`range` 只有 1 项）都由 `runToolCall` 的真实校验路径拒绝，`execute` 没有被调用，结果 `isError:true`。
- **错误传播。** 5 类可预期失败（未知字段、页越界、cover+length、过期 view、不存在的 `#N`）以带错误码的 `throw` 变成 `isError:true` 的工具结果；`beforeToolCall` 的 `{block:true}` 在 execute 前拦截；已 abort 的 signal 返回 `Operation aborted`。
- **部分成功。** `coverMax=20000` 的 t6l 返回 20,000 chars 正文 + `[cover incomplete … next]`，`isError:true` 且 `details.incomplete/next` 保留；正文没有丢。
- **并行与预算。** 两个 `runToolCall` 并发都完成且互不影响；工具侧第 4 次调用抛 `budget_exhausted`（宿主没有内建 per-turn 工具预算，必须由扩展计数，不能只靠提示词）。
- **exposure。** `exposure:"hidden"` 的工具不活跃，**且不能通过 `setActiveToolsByName` 按名激活**（宿主 `_applyToolLoadout` 直接丢弃 hidden）；因此“撤回”是重新注册 hidden，而不是先隐藏、后按名恢复。
- **模型闭环。** N1 一次 T6 运行：模型发结构化 `tool_call`，宿主执行并回送 5 个工具结果；**本次 N1 使用 read/scan，没有调用 cover**，`details` 只含 `viewId/action/refs/spans/costChars` 结构，不含正文；模型作答，本次答案是 `record_changelog: true`；答案理由不在包内，不能作为有据或隐藏覆盖证据。因此 N1 只证明“模型发结构化调用 → 宿主执行 → content/details 回送 → 模型作答”的管线成立，不证明 cover 触发、答对或隐藏覆盖。N2 用逐字参数验证 cover 端到端（37,615 chars、span 803-38217、正文含隐藏句）；N3 验证 `field_missing` 以 `isError:true` 回到模型，模型答 `{"observed":"field_missing"}`。N1 只有 1 次，是管线证据，不是条件比较，不与 §12.9 的 JSON 臂合并计分。
- **未验证。** 运行中的取消（只测了预 abort 的 signal）；同一 assistant 消息里两个工具调用的宿主调度（只测了工具层并发）；权限扩展的端到端确认（只测了 `beforeToolCall`）；`scope:"all"` 的单独确认；`details`/TUI/HTML 渲染；fork/context edit；100 次压缩；真实 DeepSeek 托管 provider（只测本机替身端点）；真实会话。不能写“真实宿主已验证”到这些项。

**预测与证伪（预注册的执行）。** 主臂 P1（C5/D5 各 ≥2/3 覆盖）成立（3/3、2/3）；P2（C/D/C2/D2 ≤1/3）成立（0/9、0/3、1/3、0/3）；P3（A 仍 ≥2/3 零调用答错）**不成立**（1/3，另 2 条各读了一次 `max`）——A 的覆盖仍 0/3，所以“地址本身会触发覆盖”没有被证实，但零调用比例比 §12.8 低；P5（近距字节相同、3/3、cover 0）成立；P6（cover 运行 ≥37,000 工具字符）成立，7 条 cover 全部正确。重复批 P1（C5 ≥5/6）**不成立**（4/6，合并 7/9）；P4（D5 ≥4/6）**不成立**（3/6，合并 5/9）；P4 的“C5 prompt 更高”也不成立（15K 上 C5 9,706 vs C 10,083，因为 C 有两次读取的条目）。证伪项按预注册保留，不回改条件或重挑样本。

**发现。**

1. **服务端合并覆盖是当前唯一在 >12K 跨度上被实际使用并覆盖目标的机制。** 37K 上 C5 7/9（7 条 cover 全对），C 0/9、同帧 render-3 C 0/9；cover + 正向条件规则同时存在时才出现。它是必要条件之一，不是充分条件。
2. **触发层仍未解决。** 7/9 的失败全部是“没有调用 cover”，其中 1 条 0 调用、1 条只 scan；D5 4/9 同类。A 0/3 覆盖、C 0/9 覆盖说明打印 cover 不会让模型自动读；15K 时 C 的 2/9 自发 cover 只说明成本与选择有关，不是通用触发。
3. **分页规则是低可靠、较高成本的替代路径。** C2 3/9 覆盖，靠 2–3 次 `next`；prompt 20,463 vs C5 13,570。它可以作为没有 cover 能力时的兼容路径，但不优于 cover，也不加入默认提示词。
4. **结构行没有可测增益。** D5 5/9 vs C5 7/9，区间重叠；STRUCTURE 一行不改变“是否用 cover”。
5. **15K 的 cover 是多余的。** `max` 已覆盖目标，C 9/9；C5 仍 9/9 用 cover，+12% 工具字符。默认策略应只在跨度超过一个窗口（或 `max` 已证明不足）时打印 cover；本节的 t6 视图仍打印了 cover，这是预注册的结构，不是推荐的产品默认。
6. **成本要按路由算，不按单次结果算。** 一次 cover 的工具字符大于一次 max，但 prompt 累计可能更低：37K 一次 cover 14,208 vs 三次 next 28,171；15K 一次 cover 9,342 vs 两次 max 15,090。真正的节省来自少一次上下文重发，不是少读字符。
7. **正确、有据、覆盖、暴露本批一致，但仍有边界。** 所有 7 条 cover 正确条目都 grounded 且目标覆盖；D 的 1 条“正确”来自 scan 片段（暴露但不覆盖目标），说明 `hiddenExposed` 不能单独当覆盖证据。报告仍必须同时给 `correct`、`groundedCorrect`、`targetCoveredByRead`、`hiddenExposed`。
8. **真实宿主闭环了 §7.4 的注册/校验/错误/部分结果/预算/exposure，但没有闭环取消、调度并行、权限扩展与渲染。** N1 只有 1 次，不能当行为结论；它的价值是证明“模型发结构化调用 → 宿主执行工具 → content/details 回送 → 模型作答”这条链路在真实 Pi 运行时上成立；本次 N1 未使用 cover，cover 端到端由 N2 逐字验证。

**边界。** 单模型（DeepSeek）、单合成夹具族、每格 3 或 9 次、固定顺序；目标位置、填充行、coverMax（48,000）与成本都是人为设计；没有真实会话、其他模型、真实托管 provider、100k/200MB、宿主 fork、真实权限扩展或 TUI。Wilson 区间只描述本样本；不写显著性，不写生产保证。render-5 的默认化、`coverMax` 的产品值、以及“何时打印 cover 而不是 max”都需要产品评审，不能从本节直接推出。

## 13. 实施计划

### 13.1 里程碑

| 阶段 | 交付 | 退出条件 |
|---|---|---|
| P0 契约与夹具 | 数据结构、覆盖语义、合成夹具、真值生成器 | 分区/字段/预算的单元测试先失败后通过 |
| P1 目录与分区 | 流式 I、E、X、custom 分区、live 成员、observations | `unaccounted=0`；身份单调；off-branch/edit/policy 原因正确 |
| P2 视图与预算 | H/U0/EC/O/U1/A 候选、`needed`、渲染、围栏、golden | 最终 UTF-16 ≤B；needed 截止；确定性与字段精确 |
| P3 Reader | `context_index` 的 view/read/range/scan/touched、游标、负结果；U/`view` 的隐藏跨度字段/偏移/可执行 `read`；render-3 的 `span/pages/windows/max/cost`、页表、`page`/`line`、成本行；render-5 的 `cover` 合并读取与 `coverMax` 政策 | 深偏移一次读取；分页枚举；隐藏地址回读；页网格/页行回读；成本行与实际字符一致；cover 精确切片/总成本/unread 0/截断 next；游标失效；隐私旁路测试；页表/规则的“0 次使用”不当作成功 |
| P4 宿主集成 | hook、cut、context edits、Pi 1.0/1.4、toast/命令；`defineTool`/TypeBox/registerTool、schema 拒绝、`throw`/`isError`、部分结果、预算、exposure | in-process SDK 主要环节已验证（§12.9）；仍需真实 CLI 回放、运行中取消、调度并行、权限扩展、编辑/尾部/compact-all/空前缀、Pi 1.0/1.4 对照 |
| P5 隐私与 fork | 策略 digest、canary、同文件/跨文件 fork、refSpace | 无旁路；跨文件缺映射明确拒绝 |
| P6 性能与发布 | 大文件基准、包结构、README/CHANGELOG、安装互斥 | 性能门；真实 API 预注册门槛；发布检查 |

### 13.2 不做的事

- 不为 0.1.5 做兼容层、不迁移旧摘要、不复活旧语义章节。
- 不把 `#N@6hex` 设为强制逐行格式；不把短指纹当身份。
- 不增加“预算开关”；预算随会话规模自动，`needed` 截止。
- 不把 sidecar 变成权威；不把缓存命中作为选择依据。
- 不用语义评分/关键词找禁令；不用“更强提醒语”替代结构。
- 不把激活规则写成“重要内容就 recall”的语义判断；规则只绑定 `IndexOnly`、`U` 行 hidden 区间和 `#N` 这类结构信号。
- 不把隐藏跨度的起点地址当成任意深度定位；不把 native 的大读取窗口当成模型能力差异；不把“工具可达/地址可执行”写成“任务成功”。
- 不把页表/`page`/`line` 的结构存在写成“分页已解决”：§12.8 全部臂 0 次使用；不把 C2/D2 分页规则加入默认提示词（37K 上 3/9 覆盖、prompt 20,463，成本高于 cover）；不把 render-4 的 48K 全跨度读设为默认（2/9 直接读、3/9 覆盖，约 6× 视图成本）。
- 不把 render-5 的 cover 默认化：只对跨窗口跨度打印；15K 时 `max` 已够（C 9/9），C5 反而 +12% 工具字符；C5 仍有 2/9 不调用。`coverMax` 与“何时打印 cover 而非 max”需要产品评审，不写成通用修复。
- 不把单条结果的 `hiddenExposed=false` 写成“没看到”：目标句可能跨两个结果；报告 `targetCoveredByRead` 与 `groundedCorrect`。
- 不把“工具可达”说成“任务完成”；不写“接近 71/71”这类未验证结论。

### 13.3 文档与包

- 新包自带 `README.md`/`AGENTS.md`/`CHANGELOG.md`；README 写明：与 `pi-vcc-codemode` 安装互斥；产物是索引/视图不是摘要；不含当前状态；隐私策略与 reader 协议。
- 本仓库冻结在 0.1.5；本文档只记录设计，不修改源码、版本或发布状态。
- 实验脚本与合成夹具留在 `research/prototype/`；不进入 npm 包，不提交真实会话数据。

## 14. 风险与未证明

1. **单一合成夹具、单一模型、每条件 3–9 次，条件顺序未随机化。** 行为结果只能读作方向与量级，不是总体概率或统计显著性。P0 的 0/12 与 §12.7 T6 的 2/12 是同配置、同夹具、相隔数十分钟的差异；§12.9 的 C5 主臂 3/3、重复 4/6 也是同一配置的波动。同帧基线不可省，重复只覆盖部分条件。
2. **宿主 fork 语义未验证。** 跨文件继承映射、水位、并行分支的权威元数据必须用真实宿主操作验证；没有证据就不能宣称跨文件 `#N` 稳定。
3. **context edits 的投影细节未完全验证。** 本文只验证了简单替换/删除和 revision 读取；多段编辑、checkpoint 编辑、影子投影需要宿主集成测试。
4. **性能只测到 10k 条消息。** 470 条与 10,000 条（含一条 199K 输出）有原型数据；100k 条、200MB 会话、多个巨型字段、并发压缩的内存与 p95 未测；不继承 0.1.5 的 28ms。
5. **隐私不是“同目录同权限”一句话。** 计数泄露、缓存、日志、历史已发送内容、秘密扫描的零漏检都无法保证；严格策略可能降低可见性。
6. **预算仍可能不足。** 极窄 1,100 token、短指令 + 超大任务书、71+ 操作、全工具会话都需要场景实验；`needed` 截止不等于“全事实可见”。
7. **没有语义推断能力。** 旧禁令/验收要求/决策反转只能靠原文、顺序和 reader；不能保证任意自然语言问题在三次检索内解决。
8. **文件效果不是台账能重建的。** 外部进程、自定义工具、失败写请求使操作台账与磁盘事实不同；`touched` 只表示记录中的操作。
9. **历史视图的可重放依赖 renderer 版本。** 未来版本必须保留 `render-1` 或明确报告不可重放；不能拿当前默认值冒充历史输入。
10. **API 实验的提示与计分器是合成的。** 不同提示、不同模型、不同真值口径会改变结果；正式发布前必须冻结题库与候选规则，禁止看答案后调优先级。
11. **主动性与激活规则只做了合成验证。** §12.6 显示无提示时本模型会在 T2/T3/T4/T5 首次调用；B/C/D 没有可测正确率增益。§12.7 给地址后，T5 式 follow-up 12/12；T6“无关键词线索”在 A 下出现 0 调用直接答错。§12.8 的有效组合是“正向条件规则 + 可执行 max 地址”：C/render-3 合并 9/9，C/render-2 2/9，A/render-3 1/9 且 7/9 零调用答错。§12.9 把 max 换成“max + 合并 cover”：C5/render-5 7/9 覆盖（7 条 cover 全对），C/render-5 0/9、同帧 render-3 C 0/9；但 C5 仍有 2/9 不调用 cover（1 条 0 调用、1 条只 scan），A 0/3 覆盖。触发层仍未解决；不能把任一单独因素写成充分条件，更不能写成“模型会主动 recall/覆盖”。
12. **隐藏跨度的深覆盖只被“宿主侧合并读取”部分解决。** render-3 的 `span/pages/windows/max/cost`、页表与 `page`/`line` 没有解决 37K：24 条 0 覆盖、0 跟随 `next`、页表 0 使用。render-5 的 `cover` 在一次调用里合并连续窗口、打印整段成本；C5 7/9 覆盖（7 条 cover 全对、`unread 0`），同帧 render-3 C 0/9、render-5 C 0/9。仍未解决的是触发：2/9 完全不调用 cover；分页规则 C2 3/9 且 prompt 20,463 vs C5 13,570；D5 的结构行没有可测增益（5/9 vs 7/9）。coverMax=48,000 与“何时打印 cover”仍是待评审的产品政策，不能把“更大窗口/全跨度读”当通用修复。
13. **原生协议已在真实 in-process Pi 宿主上闭环主要环节，模型端点仍是替身。** §12.9 的 `host-pi.mjs` 用真实 SDK 会话验证：`defineTool`/TypeBox/registerTool、schema 拒绝（6 类）、`throw`/`isError:true`（5 类）、`beforeToolCall` 拦截、预 abort、部分 cover 的 `isError:true` + 正文 + next、工具层并发、扩展侧预算、hidden 撤回语义、details 无正文；模型发结构化调用并收到工具结果（1 次管线运行；本次 N1 使用 read/scan，未调用 cover；cover 端到端由 N2 逐字验证）。仍未验证：运行中取消、同一 assistant 消息的宿主调度并行、权限扩展端到端、`scope:"all"` 单独确认、TUI/HTML、fork/context edit、100 次压缩、Pi 1.0.0/1.4.0 对照、托管 DeepSeek provider。窗口/示例仍是行为变量，不能把协议差异当成模型能力。
14. **DeepSeek 单一模型。** 本文所有行为数字只用 `deepseek-v4.1-flash-1017`；跨模型外推未测。T6 的 0 调用失败可能是模型特定的“看起来可答”倾向；不能写成所有模型都会/都不会主动 recall。
15. **成本可能超过收益，但路由比单次大小更重要。** 15K 隐藏跨度的一次 cover 工具结果 15,474 chars + 6,176-char 视图约 21.7K chars，超过 17,184 原文；37K 的 37,615-char 工具结果 + 6,177 视图约 43.8K，超过 39,324 原文。单看字符，cover 比 max 贵；但 37K 上一次 cover 的累计 prompt 约 14.2K，三次 next 约 28.2K，15K 上一次 cover 9.3K、两次 max 15.1K：少一次上下文重发可以抵消更大的单次结果。压缩只有在隐藏文本不被立即/重复读取、或视图跨多次请求复用时才划算；不能默认全跨度读，也不能只用工具字符判断盈亏。
16. **暴露、正确、有据、覆盖不是同一件事。** P2/C2 有 1 条布尔正确但编造条件（ungrounded）；S2/D 有 1 条猜中；render-4/D2 的目标句跨两个工具结果，单结果 `hiddenExposed=false` 但 `targetCoveredByRead=true` 且答案 grounded；§12.9/D 有 1 条 `scan "release"` 的 60-char 片段命中隐藏句，`hiddenExposed=true` 但读取区间没覆盖目标偏移。报告必须分开 `correct`、`groundedCorrect`、`targetCoveredByRead`、`hiddenExposed`；`exposure ⇒ correct` 只是本夹具子集内的经验。
17. **cover 的产品政策未定。** §12.9 的 `coverMax=48000` 是探索值；默认值、何时打印 cover（跨度为多少、是否只在 `max` 失败后）以及是否把 C5 规则加入默认 `promptGuidelines`，都需要产品评审。地址在 t6/t6l 上各挤掉一条被引用行（隐藏跨度 +86 chars），这是可测的预算代价；15K 时 cover 多余（`max` 已覆盖目标，C 9/9），说明“有跨度就打印 cover”不是好默认。render-5 默认关闭，不改变 render-1/2/3 的字节。
18. **宿主行为需要按真实语义写进集成层，不能只写设计。** `exposure:"hidden"` 的工具不能被 `setActiveToolsByName` 按名激活（宿主直接丢弃 hidden），所以撤回是重新注册 hidden；宿主没有内建 per-turn 工具预算，预算必须由扩展计数（否则只能靠提示词）；annotations 只是提示，不是权限执行；`details` 已证明不含正文，但 TUI/HTML 渲染与日志仍未验证。把这些写成“已实现”会误导集成方。

## 15. 与独立评审的裁定对照

### 15.1 直接采纳

- 独立新插件、零模型调用、取消旧格式兼容、旧仓库冻结。
- 保存记录的目录 + 有限展示视图；不是另一种声称保全意义的摘要。
- 双层分母 I/E/X；消息级四状态互斥；字段级分区；`unaccounted=0`。
- 覆盖行给出状态计数、`X` 原因和完整 `view` 入口；不静默丢指针。
- 时间顺序不生成撤销关系；不写当前状态/待办/目标。
- 删除三个语义章节及 `plan`/`task contract`/假 section 替身。
- 删除强制叙事配额、固定四分位、无条件 395 chars note。
- 预算阶梯与 `min(Bcap,needed)`；先支付用户原文与结构证据，再买助手锚点。
- 不强制逐行短指纹；内部完整摘要/entryId；视图共享来源域/快照。
- 首版无 sidecar；缓存可丢弃；细节保存 recipe/选择跨度。
- 跨文件 fork 无权威映射是发布阻断项。
- reader 支持 view/read/range/scan/touched；负结果带范围；不假装恢复。

### 15.2 本设计的主动偏离/细化

| 议题 | 评审原文 | 本设计 | 理由 |
|---|---|---|---|
| 禁用词 | 严格字面：包含 `done/verified/success` 的源行不进视图 | 模板禁用；逐字引用可含，但必须带来源并声明“引用不是断言” | 避免把 “when done, run tests” 这类真实约束整体隐藏；用来源区分断言与引用 |
| U 的支付顺序 | H, U, EC, O, A；U 全量优先 | U 拆成 U0 核心与 U1 加深；U0 在 EC/O 前，U1 在 O 后、A 前 | 防止一条 19K 用户消息在 U 全量不成立时吞掉全部预算，同时保留每条消息的可见核心 |
| 覆盖行长度 | 建议约 200 chars，可比较紧凑/长提醒 | 约 220–260 chars，必须含 `saved #0-#M` | 真实调用中只写数量的封面导致最早记录答错；区间是契约成本 |
| custom | 以 entryId 登记，不混进 `#N` | 增加独立 custom 分区；v1 原型只验证 excluded 路径，生产支持 `e:<id>` 读取 | 不伪造 `#N`，也不把未排除 custom 静默丢掉 |
| A 锚点 | 可选、可消融、≤800 | 同；选每个用户轮的首/末**有文本**助手消息，跳过纯工具调用 | 纯工具 assistant 消息没有叙事内容，不能当锚点 |
| O 组内顺序 | 未规定；方向文档建议 write 优先 | 按首次调用源顺序；不按语义/重要性 | 时间保真、可复现；write/edit 都是结构事实 |
| EC 组内顺序 | 未规定 | 错误先于计数；组内源顺序 | 错误为正确性失败，优先保留；可消融但不得看答案后调 |
| 深跨度地址 | 未规定 | render-3 给 `span/pages/windows/max/cost`；`view` 页表；`page`/`line`；render-5 对超过一个窗口的跨度加服务端合并的 `cover`（总成本、`coverMax=48000` 政策）；C2/D2 分页规则与 C5/D5 覆盖规则都作为新条件测试 | §12.8：15K 跨度 C 9/9 vs render-2 2/9；37K 0/24 覆盖；页表/页行 0 次使用；规则无可测增益。§12.9：37K C5 7/9 vs C 0/9，7 条 cover 全对；15K cover 多余（C 9/9），C5 +12% 工具字符；一次 cover 的 prompt 低于 2–3 次 next。保留 max+next+cost，cover 仅对跨窗口跨度为候选默认并需产品评审，页表可选，分页规则不加入默认 |
| 模板词 `proof` | 禁止 `done/verified/success` | note 使用 `not current state or proof` | 否定句不构成状态断言；词法扫描只查肯定模板 |

### 15.3 仍不同意或要求评审再确认的点

1. **“行级头尾 = 禁令不会静默消失”仍不成立。** 本设计只承诺：已展示行逐字；隐藏行有精确地址；用户消息可按序枚举；不承诺中间禁令必然可见。原型 u-line/u-char 对照就是为此设计的；若行为实验显示行级摘录不足以保留约束，应增加 U0 行数/整条策略，而不是声称结构保证。
2. **“短指纹能保证身份”不成立。** 本设计只在内部保留完整摘要；视图共享来源域/快照，不逐行打印短 hash。跨文件继承必须靠权威映射，不能靠 hash。
3. **“引用集合单调”不属于可见视图。** 视图可变；目录身份不变。测试只要求 `I` 单调与旧地址可读，不要求 `Shown` 单调。
4. **“所有未来禁令/验收要求直接可见”不可实现。** 有限预算 + 无语义推断下，任何选集都有反例；本设计把承诺降为目录完整、原文可寻址、覆盖可查。
5. **“候选优先级是正确性定理”不成立。** H/U0/EC/O/U1/A 是待测策略；错误先于计数、O 按源顺序都应在预注册实验中消融，不得看答案后调整。

## 16. 附录：实验与复现边界

- 原型代码：`research/prototype/{fixtures,catalog,render,reader,invariants,build-artifacts,experiments,focused-experiments,focused-summary,activation-fixture,activation-experiments,activation-summary,followup-summary,render-snapshot,render3-summary,render5-summary,bench-large,probe-hidden,probe-render3,probe-render4,probe-render5,host-pi}.mjs`；仅在本地运行，git-ignored。`render.mjs` 的 `hiddenAddress` 默认关闭（render-1，逐字复现 §12.1–§12.6）；`hiddenAddress:true` 为 §12.7 的 render-2；`pageTable:true`（并 `maxRead`，默认 12,000）为 §12.8 的 render-3；`maxRead:48000` 为 §12.8 的 render-4 探索；`cover:true`（并 `coverMax`，默认 48,000）为 §12.9 的 render-5。`render-snapshot.mjs` 只输出 render-1/2 视图的 SHA-256 与长度，不存正文；改动前后哈希一致。`activation-fixture.mjs` 是实验与探针共用的合成夹具构造，避免两处漂移。
- 结构检查：`node research/prototype/invariants.mjs`，18 项；隐藏地址、页表、`page`/`line`、成本行、cap 与 render-5 cover（精确切片、总成本、unread 0、`coverMax` 截断 + next、互斥错误）的断言并入了既有检查，没有新增条目。`node research/prototype/probe-render5.mjs` 输出 render-3/5 的视图 id/长度、地址代价与 cover 端到端结果，只含计数与短结构行，不含长正文。输出只含计数/结果，不含会话正文。
- §12.7 原始输出：`followup-t5-distant`、`followup-t5-near`、`followup-t6-distant`、`followup-t6-near`、`followup-t6-distant-native`、`followup-t6-near-native` 的 `.json`/`.log`；汇总 `node research/prototype/followup-summary.mjs` → `followup-summary.json`。仅 DeepSeek；扫描词、填充行数和目标位置均为合成。
- §12.8 预注册与原始输出：`PREREG_RENDER3.md`、`PREREG_RENDER3_REPLICATION.md`、`PREREG_RENDER4.md`（均在运行前写）；臂 `render3-p0`、`render3-p1`、`render3-p2`、`render3-p3`、`render3-r1-p0`、`render3-r1-p1`、`render3-s1`、`render3-s2`、`render3-s2b`（**事后确认批，未预注册**）、`render4-f1`、`render4-f2` 的 `.json`/`.log`；汇总 `node research/prototype/render3-summary.mjs` → `render3-summary.json` / `render3-all-summary.json`。每行包含参数、调用轨迹的前 400 字符、结构指标与用量；文档只引用聚合计数。
- §12.9 预注册与原始输出：`PREREG_RENDER5.md`、`PREREG_RENDER5_REPLICATION.md`（均在各自批次运行前写）；臂 `render5-a`、`render5-b`、`render5-c`、`render5-d`、`render5-r1`、`render5-r2`、`render5-r3` 的 `.json`/`.log`；汇总 `node research/prototype/render5-summary.mjs` → `render5-summary.json`（含 per-file 与跨批 combined）。每行包含参数、调用轨迹前 400 字符、实际返回区间、覆盖/成本指标与用量；文档只引用聚合计数。`render5-smoke` 是一次冒烟，未计入 105 条主/重复样本。
- 真实 Pi 宿主：`node research/prototype/host-pi.mjs` → `host-pi.json`；使用 in-process Pi SDK、临时 `cwd`/`agentDir`、`defineTool` + TypeBox + `registerTool`，只启用 `context_index`；模型端点仍是本机 OpenAI 兼容替身。24/24 检查通过；N1 是 1 次管线运行，不与 JSON 臂合并计分。探针在开发中因 bug 运行过多次，最终文件只保留修复后的一轮。
- 复现主臂（示例）：
  ```sh
  ACT_VARIANT=t6 ACT_OUT=render3-p0 ACT_REPS=3 ACT_CONDITIONS=A,B,C,D ACT_QUESTIONS=T6 ACT_RENDER=2 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6 ACT_OUT=render3-p1 ACT_REPS=3 ACT_CONDITIONS=A,B,C,D ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6l ACT_OUT=render3-s2 ACT_REPS=3 ACT_CONDITIONS=A,B,C,D,C2,D2 ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
  R3_IN=render3-p0,render3-p1,render3-p2,render3-p3,render3-r1-p0,render3-r1-p1,render3-s1,render3-s2,render3-s2b,render4-f1,render4-f2 node research/prototype/render3-summary.mjs
  ACT_VARIANT=t6l ACT_OUT=render5-a ACT_REPS=3 ACT_CONDITIONS=A,B,C,D,C2,D2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6l ACT_OUT=render5-b ACT_REPS=3 ACT_CONDITIONS=A,C,D ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6  ACT_OUT=render5-c ACT_REPS=3 ACT_CONDITIONS=A,B,C,D,C2,D2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6n ACT_OUT=render5-d ACT_REPS=3 ACT_CONDITIONS=C,C5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6l ACT_OUT=render5-r1 ACT_REPS=6 ACT_CONDITIONS=C,C2,C5,D5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6l ACT_OUT=render5-r2 ACT_REPS=6 ACT_CONDITIONS=C ACT_QUESTIONS=T6 ACT_RENDER=3 node research/prototype/activation-experiments.mjs
  ACT_VARIANT=t6  ACT_OUT=render5-r3 ACT_REPS=6 ACT_CONDITIONS=C,C5 ACT_QUESTIONS=T6 ACT_RENDER=5 node research/prototype/activation-experiments.mjs
  R5_IN=render5-a,render5-b,render5-c,render5-d,render5-r1,render5-r2,render5-r3 node research/prototype/render5-summary.mjs
  node research/prototype/probe-render5.mjs
  node research/prototype/host-pi.mjs
  ```
- 产物：`research/prototype/out/*.txt` 为合成视图/尾部；`artifacts.json` 为合成产物元数据；`render-snapshot-*.json` 只有哈希与长度；**不进入仓库提交**。
- 真实 API：本机 OpenAI 兼容端点（仅本地实验），模型只用 `deepseek-v4.1-flash-1017`；`activation-experiments.mjs` 对非 DeepSeek 模型直接报错；脚本只发送合成产物与合成尾部；文档只引用聚合分数。§12.7 的 native 通过流式 `tool_calls` 重组；文本 JSON 只是替身。§12.9 的 `host-pi.mjs` 在真实 in-process Pi SDK 上验证工具层，模型端点仍是本机替身；未对托管 DeepSeek provider、CLI 宿主或 Pi 1.0.0/1.4.0 双版本做对照。
- 计分真值由合成夹具确定性计算；不是人工评分，也不含真实会话事实。`correct`、`groundedCorrect`、`targetCoveredByRead`、`hiddenExposed` 分开统计；非 JSON/`<invoke>` 格式无效单独排除。§12.9 的 `targetCoveredByRead`/`pagesCovered` 用读者**实际返回区间**（结果头）测量，夹取与合并 cover 按真实区间计；§12.8 用的是请求参数，两者不可逐格对比。
- 复现限制：模型可能随版本变化；提示模板、温度、max_tokens、reasoning 档位都会影响结果；同一配置重复运行也有波动（§14 第 1 条）；本文不把它们当作产品保证。
