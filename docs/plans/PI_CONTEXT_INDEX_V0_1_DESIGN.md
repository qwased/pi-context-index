# pi-context-index 0.1.0 初版设计

- 定稿日期：2026-10-31。
- 定位：Pi Coding Agent 的 LLM-free 会话压缩与历史检索插件。
- 状态：初版开发依据；代码实现按[落地计划](./PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md)推进。
- 本文取代原型文档中的产品方案与未决项；原型、交接和外审保留为历史依据，不回改实验记录。

## 1. 产品决定

**将会话压缩成一份可继续工作的“续接包”，将完整会话保留为可直接读取的档案。**

续接包优先回答三个问题：用户交代过什么、刚才工作到哪里、缺少细节时到哪里找。它由用户原文、近期助手原文、工具观测和简短目录组成，全部通过本地确定性算法生成。

0.1.0 按以下决定实施：

| 项目 | 决定 |
|---|---|
| 产品形态 | 独立包 `pi-context-index`，版本从 0.1.0 开始；Pi 最低版本 1.4.0，peer 范围 `>=1.4.0 <2.0.0` |
| 压缩入口 | 接管手动 `/compact`、阈值压缩和上下文溢出恢复，三者使用同一流水线 |
| LLM-free | 压缩、建索引、排序、提取标题、搜索和读取全部本地执行；不调用模型、embedding 服务或外部检索服务 |
| 目标连续性 | 直接保留用户请求和近期指令；不要求用户另装状态插件或维护任务文件 |
| 历史检索 | 一个常驻工具 `context_index`，三个动作：`list`、`search`、`read`；压缩前后均可使用 |
| 引用 | 使用 Pi 原生记录 ID，显示为 `e:<entryId>`；不再维护 `#N` 编号系统 |
| 长文本 | 结构分块、完整片段优先；提供标题导航、命中附近读取和显式全文读取 |
| 预算 | 续接包、单次读取、一次 agent 运行的累计回注分别限额；所有正常结果的结构文字一并计费 |
| 存储 | Pi 会话是事实来源；进程内索引可重建；首版不写 sidecar 数据库 |
| 开发策略 | 一个新包、一个压缩路径、一套 reader；先交付真实闭环，再用实际任务反馈调参数 |

本插件只处理当前 Pi 会话保存的信息。初版直接采用会话现有的明文访问方式，不建设额外隐私策略、脱敏系统或权限体系。外部文件只保留会话里出现的路径和读取记录；需要文件当前内容时，由 agent 使用正常文件工具读取。

## 2. 第一性原理

### 2.1 两种记忆承担不同任务

有限上下文适合放“现在继续工作最可能用到的信息”，完整会话适合保存“之后可能需要核对的信息”。把所有历史都塞进压缩结果，与把所有内容都变成一个链接，同样偏离产品目标。

因此采用两层结构：

1. **工作记忆：续接包 + 宿主保留的近期原始消息。** 用户请求保持醒目，近期结论具有足够深度，日常继续工作不必先搜索。
2. **档案记忆：当前会话记录 + 本地索引 + reader。** 精确问题直接定位原文；长文需要全文时一次返回足量内容。

评价顺序是：继续工作的正确性、找回原文的便利性、累计输入成本、压缩速度。目录覆盖是工程基础，不是产品最终成绩。

### 2.2 LLM-free 不等于拒绝一切信息选择

标题识别、词法匹配、BM25 排序、时间优先和重复片段合并都属于可复现的普通算法。初版主动使用这些方法选择内容，而不是只按头尾位置机械抽样。

算法选择的是**值得展示的源片段**，不是生成新的自然语言结论。例如“用户指令”章节可以直接引用用户说过的话；“近期工作”可以直接引用助手最后的实施说明；工具行可以报告某次调用返回的退出码。这足以服务工作连续性，不需要先推断一份完整任务状态机。

### 2.3 保留目标的具体方法

每次压缩重新访问当前分支原始记录，选择：

- 最早一条非空用户消息，保留任务起点。
- 最近三条将移出上下文的用户消息，保留当前方向与更正。
- 与当前工作词汇相关的较早用户消息，补足分散在中段的要求。
- 最近的助手工作说明及工具结果，保留实现位置和下一步讨论的上下文。

当前仍在 live tail 中的消息不重复放入续接包，但参与相关性查询。发生需求反转时，把新旧原文按时间顺序提供给 agent，由 agent 结合当前用户指令继续工作。

这比“插件完全不负责目标，只负责目录”的原型定位更贴合本次产品要求。

## 3. 原型与外审的最终取舍

| 议题 | 初版决定 | 实际收益 |
|---|---|---|
| 可重建目录、有效历史、精确源跨度 | 保留，目录状态按需计算 | 原文可找回，展示内容可核对 |
| `needed` 截止 | 保留 | 短会话和低信息量会话自然产生短续接包 |
| 删除一切目标类展示 | 改为“用户指令原文” | 不生成目标摘要，也让目标持续可见 |
| H/U0/EC/O/U1/A 逐级支付 | 改为按用途保底、借用余额 | 用户长文、旧错误或大量路径不会饿死近期工作说明 |
| 用户长文固定头尾行 | 改为结构分块 + 查询相关片段 + 明确间隔 | 直接展示更多中段内容；非连续片段有清楚断点 |
| 固定网格页表、`page`、`line` 多套地址 | 删除 | 一套字段与偏移即可支持全部定位 |
| `max`、`cover` 及 24K 打印阈值 | 合并为 `read` 的普通窗口与显式 `full:true` | 统一读取语义，避免按特定夹具目标位置设计阈值 |
| 正常截断返回 `isError:true` | 修正为正常部分结果 | agent 可直接使用已返回内容并继续读取 |
| 只给路径或记录号 | 保留简短值/片段 + 引用 | 常见问题可直接回答，复杂问题仍可回读 |
| `#N`、父编号水位、跨文件映射 | 改为原生 `entryId` | 利用 Pi fork 保留消息 ID 的现有行为 |
| 每次压缩持久化全量状态数组 | 改为只保存选择清单和 recipe | 避免会话越长、重复压缩元数据越大 |
| 隐私策略、固定模型研究流程 | 从产品首版移出 | 集中完成实际压缩与继续工作的闭环 |
| 强制全文预取、拦截模型最终答案 | 不进入首版 | 保持与宿主正常执行流程一致，按需支付读取成本 |

外审推荐的标题导航值得实施，但标题存在不等于目标必然被找回；外审的 24K 阈值也不是由一般规律推导出来的。初版采用更直接的接口：知道主题就搜索，知道记录就浏览结构，需要完整要求就全文读取。

## 4. 使用体验与续接包

### 4.1 Agent 看到什么

以下为格式示意，数字和 ID 为合成值。

```text
[Context index v1 | snapshot=7d24b89a6e31]
Saved messages: 470; effective: 467; live: 30; quoted: 12; index-only: 425.
First saved: e:10ac93de; last saved: e:93eaa14c. Browse: context_index {"action":"list"}.
Below are dated source excerpts and recorded tool results. Continue with the latest user instructions; read a source when its omitted details matter.

[用户指令原文]
U e:10ac93de | partial | field=/message/content | 2180/17184 chars shown
“为这个插件实现不调用模型的上下文压缩。”
[省略 420-7210；以下为另一段原文]
“验收时保留原始测试夹具，并补上上下文编辑场景。”
...
U e:5b22c046 | full
“先完成 CLI 闭环，UI 调整放到后面。”

[近期工作原文]
A e:7b0c8101 | partial
“字段定位已接通。接下来把压缩返回值交给宿主，再检查重启后的引用。”
[其余内容见原文；context_index {"action":"read","ref":"e:7b0c8101"}]
R e:913a85df | bun test tests/reader.test.ts | reported: 42 pass / 0 fail

[操作与历史入口]
edit src/reader/read.ts x3 | latest call=e:892df9a4 result=e:913a85df
write tests/reader.test.ts x1 | call=e:122883d1 result=e:35344cd1
长文 e:10ac93de：实现要求 @0；验收方式 @7010；交付内容 @13540。
浏览全部用户消息：context_index {"action":"list","role":"user"}
```

实际渲染不添加示意中的引号或 `...` 代替原文：引用块只输出选定源子串；任何省略都使用带范围的结构标记。示例中的读取 JSON 为可执行形状，具体字段地址由实际源记录生成。

### 4.2 三条阅读路线

1. **继续做事**：读用户原文与最近工作说明，结合 live tail 继续执行。
2. **核对历史细节**：`search` 得到命中片段和读取参数，需要更多上下文时直接 `read` 命中附近。
3. **核对完整要求**：`list` 指定记录查看字段与章节，随后 `read full:true` 读取所需字段；不依赖连续猜关键词。

常驻工具提示词使用一段短规则，目标长度 400 UTF-16 字符以内：

> Use the latest user instructions with the live tail. The context index quotes saved history. When an omitted instruction matters, use context_index: list to browse, search to locate, read to inspect. Use full:true when the complete instruction is needed. A partial result includes the next read. Reuse source text already present in context.

不为每种隐藏跨度再追加一条提示规则。

## 5. 架构

```text
Pi SessionManager / session_before_compact
                |
       host adapter + cut
                |
       immutable run snapshot
        /                 \
 raw record catalog    effective branch projection
        |                 |
 fields + chunks + postings + observations
        |                 |
   list/search/read    candidates -> budget -> render
        |                 |
 context_index tool    compaction.summary + compact details
```

初版只有一个发布包，内部按职责分层。

```text
pi-context-index/
  index.ts
  src/
    host.ts
    cut.ts
    model.ts
    source.ts
    fields.ts
    chunks.ts
    observations.ts
    search.ts
    candidates.ts
    budget.ts
    render.ts
    fences.ts
    reader.ts
    settings.ts
  tests/
    fixtures/
    host.test.ts
    source.test.ts
    fields.test.ts
    search.test.ts
    capsule.test.ts
    reader.test.ts
    lifecycle.test.ts
```

`host.ts` 隔离 Pi API；算法模块只接受普通数据。`fields.ts` 统一字段口径，供摘录、搜索和读取使用；`budget.ts` 集中保存可调常量。初版不建立插件式 extractor 注册框架、数据库层或多种兼容渲染器。

## 6. 来源、引用与数据模型

### 6.1 以宿主内存记录作为一次操作的输入

通过 `getEntries()` 取得当前会话保存记录，通过 `getBranch()` 取得当前分支；一次构建固定数组边界和分支头。采用宿主已经解析的数据，避免每次压缩再次读取、解析、哈希整个 JSONL 文件。

重启时由 Pi 加载会话，本插件重建进程内索引。普通追加只补充新记录；分支切换和 context edit 到来时重建有效历史与候选成员关系。首版保留宿主对象引用和位置索引，不复制所有正文到多个格式化字符串。

### 6.2 引用规则

- `e:<entryId>` 指向当前会话文件内的原生记录 ID，不是排序编号。
- 记录先后用目录中的 `order` 表达；引用不随排序、压缩和展示选择而变化。
- 同文件切树后，显式 `read ref` 仍能读取该文件内的记录，并返回是否属于当前分支。
- fork 复制的消息保留原 ID，因此继承的引用直接解析到子会话中的同一条记录。未复制的记录返回 `not_found`，不自动打开父会话文件。
- 快照 ID 用于清单来源和分页续读；不要求每次 `read` 都携带某次压缩的 view ID。

这样既保存来源身份，又避免“新压缩后所有旧工具地址失效”。

### 6.3 有效历史与编辑

续接包从当前分支的原始消息重新构建，不把上次压缩文本再次摘要。处理步骤：

1. 在原始分支上先确定保留切点。
2. 沿用旧实现已使用的影子检查点方式：在临时投影输入中把 compaction 节点替换为不贡献文本的 custom 节点，保留 `id/parentId`。
3. 调用 Pi 1.4 的 `buildSessionProjection` 应用 context edits。
4. `replacement:null` 的消息退出展示候选；替换后的正文以最新生效 edit entry 的 `/replacement/content/...` 为地址。
5. 若 context edit 修改了压缩检查点，从该检查点之后建立续接候选；被编辑的旧检查点文本不进入新续接包。此前保存记录仍可按原始 ID 读取。
6. live tail、续接候选和目录状态均按真实成员集合计算，不用“ID 大于某值”近似。

修改后的消息保留原始消息身份用于排序、角色与目录统计；其显示文字指向实际储存替换文字的 edit entry。例如行头显示 `U owner=e:old source=e:edit field=/replacement/content/0/text`，读取参数为 `ref=e:edit, field=/replacement/content/0/text`。渲染器与搜索结果一律用 `Span.storageId` 生成读取入口；未编辑时 owner 与 source 相同，只显示一个 ID。

`read ref` 始终读取这个实际存储条目，不自动把旧记录替换成最新版。`list ref=e:old` 展示原始字段，并额外给出当前生效修订的 `ref=e:edit` 入口；`list ref=e:edit` 列出 replacement 字段。主文本字段从被指定的存储条目解析，edit entry 的主字段为 replacement 中的文本字段。这消除了同一地址有时表示原始正文、有时表示投影正文的歧义。

工具结果的主文本字段按已保存的角色与工具名选择；具体规则在 §7.1。编辑后的 replacement 不携带原 `toolName`，仍按 replacement 中的文本字段解析，属于已知边界。

### 6.4 最小数据契约

```ts
type EntryRef = string;
type FieldPath = string; // JSON Pointer，例如 /message/content/0/text

type Span = {
  ownerId: EntryRef;
  storageId: EntryRef;
  field: FieldPath;
  start: number;
  end: number;
};

type RecordInfo = {
  id: EntryRef;
  order: number;
  role: string;
  onBranch: boolean;
  effective: boolean;
  live: boolean;
  excludedReason?: "off-branch" | "system" | "edited" | "checkpoint" | "self-echo";
  contentStorageId: EntryRef;
  primaryField?: FieldPath;
};

type TextField = {
  ownerId: EntryRef;
  storageId: EntryRef;
  path: FieldPath;
  kind: "text" | "argument" | "result" | "scalar";
  text: string;
};

type Chunk = {
  span: Span;
  heading?: Span;
  ordinal: number;
  terms: Map<string, number>;
};

type Observation = {
  ownerId: EntryRef;
  callId: string;
  tool: string;
  operation?: "read" | "write" | "edit" | "command";
  path?: string;
  command?: string;
  resultId?: EntryRef; // 嵌套调用时为承载 nestedCalls 的父结果条目
  nestedIndex?: number; // 0 起的 calls[i]；与 resultId 组成配对键
  argumentsBytes?: number; // 嵌套参数被 Pi 丢弃时记录的原大小；输出“参数已省略”
  isError?: boolean;
  sources: Span[];
  valueSpan?: Span;
};

type CapsuleDetails = {
  kind: "pi-context-index";
  schemaVersion: 1;
  sourceSessionId: string;
  sourceHeadId: string | null;
  sourceWatermarkId: string | null;
  firstKeptEntryId: string;
  snapshotId: string;
  recipe: {
    selectorVersion: 2;
    fieldVersion: 1;
    budgetChars: number;
    contextWindow: number;
    keep: number;
  };
  shown: Span[];
  observations: Array<{ callId: string; resultId?: EntryRef; nestedIndex?: number }>;
  counts: {
    saved: number;
    effective: number;
    live: number;
    quoted: number;
    indexOnly: number;
    outside: number;
  };
  usedChars: number;
};
```

嵌套调用没有独立结果条目，`resultId` 固定为承载 `nestedCalls` 的父结果条目，配对键为 `(resultId, nestedIndex)`；直接工具没有 `nestedIndex`。该修订来自 [0.1.0 进度 §7.2](PI_CONTEXT_INDEX_V0_1_PROGRESS.md)。

`recipe.selectorVersion` 于 2026-11-02 由 1 升至 2：codemode 多段工具结果的默认字段改为最后一个 text block。字段枚举和地址格式未变，`fieldVersion` 保持 1；原因与测试见 [进度 §2.11](PI_CONTEXT_INDEX_V0_1_PROGRESS.md#L176)。

`TextField.text` 复用已保存字符串，`Chunk` 保存跨度而不是正文副本。`details` 保存来源、选择跨度和小型统计，不再保存逐消息状态数组或正文副本。工具结果的 `details` 也只保存读取区间、成本、游标等结构。

### 6.5 目录口径

`I` 是本次快照内的 message 与 custom_message 身份集合；context_edit、compaction 和其他状态条目另作元数据登记。`E` 是当前分支经过编辑、system 与自回声过滤后的有效身份集合；`X=I\E` 保存排除原因。

在内存快照中，`E=Live ⊎ Quoted ⊎ IndexOnly`：

- `Live`：由宿主保留原文。
- `Quoted`：至少一个有效源跨度进入续接包，包括被引用的工具观测字段。
- `IndexOnly`：有效但未展示。

`list` 按需计算这些状态和某条记录的 shown/hidden 区间。源记录不存在时，reader 返回定位错误；首版不维护历史失效墓碑系统。压缩生成物和本工具回声登记为派生记录，不进入新候选和默认搜索；显式按 ID 仍可查看保存字段。

`context_index` 自身的调用参数不是结果回声，但其中的查询串会让每次搜索命中自己的请求；因此默认搜索跳过直接调用与 codemode `nestedCalls` 中 `context_index` 的参数字段（参数被丢弃时只剩 `argumentsBytes`，不含查询文本），显式 `list`/`read` 仍可访问。该修订来自 [0.1.0 进度 §2.10](PI_CONTEXT_INDEX_V0_1_PROGRESS.md) 的 P4 真实宿主测试。

## 7. 核心算法一：字段、分块与搜索

### 7.1 统一字段视图

`enumerateFields(entry)` 返回字段列表，而不是带标题的长拼接字符串。

自动索引包括用户/助手文本、直接工具参数、工具结果文本、bashExecution 的 command/output、codemode 已保存的 nestedCalls 参数/错误/状态；数值与布尔值使用规范标量字符串，保留字段地址。图片二进制和 thinking 块不进入默认候选与搜索。显式字段读取可以访问该记录中已保存的文本或标量。

默认主字段按条目类型和已保存的 `toolName` 选择：普通消息与普通工具结果取第一个 text block；`toolName === "codemode"` 的多段工具结果取最后一个 text block。Pi 1.4 把 codemode 结果保存为 `[{status header}, ...output]`，因此最后一段是正文/错误，而不是状态 header。该例外只影响默认字段和观测摘录；显式 `field` 与字段枚举不变，其他工具的多段形态在获得证据前仍取第一段。

字段路径采用 JSON Pointer，解决任意参数键中包含点号时的寻址歧义。字符偏移统一采用 JavaScript UTF-16 半开区间 `[start,end)`。原始 CRLF 不归一化；Unicode 字符簇边界通过 `Intl.Segmenter` 对齐，结果回显实际区间。

### 7.2 分块与结构路标

1. 用围栏状态机识别代码围栏，围栏内部不识别 Markdown 标题。
2. 提取 Markdown 标题，以及独占一行、长度 4–80 字符并以 `:` 或 `：` 结尾的节标题。
3. 按空行、标题和列表项分块；相邻短块合并，目标 400–800 字符。
4. 超长段落或单行在字符簇边界分块，不因没有换行而整条放弃。
5. 每个块保存原始跨度、所属标题和词项。标题只是原文路标，不推断“决定”“例外”或优先级。

`list ref` 可以列出所有字段与章节，不生成 1,200 字符页网格。

### 7.3 词法检索

采用进程内 BM25 倒排索引，参数 `k1=1.2`、`b=0.75`。英文标识符拆分 camelCase、下划线和路径分隔符，同时保留完整标识符与路径；连续汉字产生二字词项；Latin 文本转小写。查询和索引共用分词器。

归一化只用于匹配；返回片段始终来自原始字段。普通查询的片段范围就是命中块跨度，不从归一化文本反推字符偏移。`match:"literal"` 对原始字符串精确扫描，返回真正命中偏移，适合版本号、错误信息、数字和代码。

排序：词法得分优先，完整字面命中加分，时间只作小幅加分和稳定 tie-break。每页先返回不同记录最好的命中，再补同记录的其他命中，避免一个超长日志霸占全部结果。

```ts
async function search(query, snapshot, options, signal) {
  const fields = fieldsInScope(snapshot, options.scope ?? "branch");
  if (options.match === "literal") {
    const scan = await scanLiteralFields(fields, query, options.cursor?.scan, {
      signal,
      timeSliceMs: 3000,
      maxHits: 10,
    });
    return renderLiteralPage(scan, options.outputBudget);
  }
  const hits = bm25Hits(snapshot.postings, tokenize(query), fields);
  const ranked = stableSort(hits, byScoreThenRecentThenFieldOffset);
  const diverse = roundRobinByOwner(ranked);
  return renderSearchPage(diverse, options.cursor?.page, options.outputBudget);
}
```

每个命中返回：记录角色、源片段、字段、实际范围、是否来自当前分支、可复制的 `read` 参数。索引构建和遍历每处理一批记录检查 `signal` 并让出事件循环。字面扫描按记录、字段、字符偏移顺序返回，支持 3 秒工作时间片；到时返回已有命中与续扫位置 `{fieldOrdinal,offset}`，不声称已经搜索完整范围。若输出预算装不下本批全部命中，游标回到第一个未返回命中的位置。

词法搜索使用排名分页；其文档数、词频统计、候选和排序全部以快照水位为界。新增记录可以进入实时索引，但不能改变旧 cursor 的统计口径与结果顺序。

## 8. 核心算法二：续接内容选择

### 8.1 当前工作查询

查询来自最近三条有实质文本的用户消息，包括 live tail。“实质文本”按去空白后至少 32 字符定义；若没有符合项，使用最近三条非空用户消息。每条最多取首尾各 1,000 字符，附加最近工具参数中的路径/命令标识符，去重后最多保留 64 个词项。

这只是相关性线索。新用户消息不会被改写为一个由插件宣称的“当前任务”。手动 `/compact` 的自由文本指示也作为查询词加入；`keep:N` 单独解析为切点参数。

### 8.2 候选集合先于预算构造

候选目标与上限固定，不能随着预算变大而无限增加旁白。

| 类别 | 候选来源 | 单项目标 |
|---|---|---|
| U：用户指令 | 首条非空用户消息、最近三条非 live 用户消息、最多四条词法相关的较早用户消息，按 ID 去重 | 不超过 3,000 字符时争取全文；更长时选择最多 3,000 字符的源块 |
| W：近期工作 | 最近两条非 live 助手文本；最近三个历史用户轮内的最近两条错误结果、最近一条命令结果，去重 | 助手每条最多 4,000 字符；错误/命令结果每条最多 800 字符 |
| N：操作导航 | 按 `(operation,path)` 合并操作，优先近期与查询相关，最多 12 行；最多 4 行有调用作用域的计数片段 | 路径、次数、最近调用/结果 ID；数值保留源片段 |

短助手说明同样可入选；助手消息仅含 thinking 或工具调用时，不占用“助手文本”名额。尚无近期错误或工具结果时，空名额直接释放。

工具观测覆盖直接工具和 nestedCalls。write/edit 记录使用“调用/请求”标签；测试计数保留原句并附命令、调用与结果 ID。初版识别常见 `N pass / M fail`、`N passed`、`N failed` 输出行；未匹配的输出仍通过近期结果摘录与搜索可见，不引入通用日志理解器。

### 8.3 单条长消息怎样选

短消息优先保持完整。长消息先提供首块和末块，再按以下结构评分选择中段块：

```text
score(chunk) = normalizedBM25(chunk, currentQuery)
             + 0.25 × hasHeading
             + 0.15 × isListItem
```

归一化范围是本条消息内的候选块。除首尾块外，用轮转方式优先覆盖不同章节，再加深已选章节。没有任何查询命中、也没有标题时，按段落序号等距选取中段块；这仅是有界抽样，读取接口仍提供全文路线。

同一源字段的相邻跨度合并。渲染时重新按源顺序排序；不相邻的跨度之间必须打印省略范围。头尾不再直接拼成看似连续的正文。插入的围栏关闭/重开、引用头、省略标记均属于结构成本。

### 8.4 保底与配额

先支付实际封面和固定说明成本，正文初始份额为：

- U 用户指令：55%。
- W 近期工作：30%。
- N 操作导航：15%。

保底只覆盖：首条用户消息、最近三条历史用户消息各最多 160 字符；最新助手文本最多 256 字符；最新错误最多 128 字符。保底同样是可精确寻址的片段，并计入各自份额。缺项不占预算。

随后在各组份额内加深：U 先最近三条，再任务起点，再相关旧消息；W 先最新助手说明，再错误和命令结果，再次新助手；N 先近期操作，再相关操作与计数。剩余配额按 U → W → N 借用，直到没有候选需要加深。分配顺序固定，输出仍保持组内时间顺序。

这是一组便于真实使用调优的首版参数，不把角色比例写成永久协议。

## 9. 核心算法三：预算与渲染

### 9.1 续接包预算

令 `W` 为当前模型的 contextWindow，单位为 token。初版固定换算尺度仅用于规划字符额度：

```text
Bcap   = min(viewMaxChars, max(2400, floor(0.06 × W)))
B      = min(Bcap, neededChars)
默认 viewMaxChars = 12000
```

| 模型窗口 W | 续接包字符上限 |
|---:|---:|
| 32,768 | 2,400 |
| 128,000 | 7,680 |
| 200,000 | 12,000 |
| 1,000,000 | 12,000 |

`0.06×W` 大致对应按 3 字符/token 估算的 2% 窗口额度；**硬约束是实际 UTF-16 字符长度**，token 数用于容量估算，不冒充精确计费。预算跟模型容量走，不因某次压缩前文本膨胀而自动提高。

`neededChars` 是 §8 固定候选集按目标深度全部渲染后的成本，不是全会话长度。只需要 3,000 字符就输出 3,000 字符。封面、标签、地址、分隔符和围栏修复全部纳入 `summary.length`。

### 9.2 选择与计费伪代码

```ts
function buildCapsule(snapshot, cut, config, modelWindow) {
  const history = effectiveHistory(snapshot, cut);
  const query = buildWorkingQuery(history);
  const candidates = makeCandidates(history, query);
  const full = render(candidates.atTargetDepth(), snapshot, cut);
  const cap = Math.min(config.viewMaxChars, Math.max(2400, Math.floor(0.06 * modelWindow)));
  const budget = Math.min(cap, full.text.length);
  if (full.text.length <= budget) return finalize(full, snapshot, cut, budget);

  const selection = seedRequiredExcerpts(candidates);
  const bodyBudget = budget - renderCover(selection, snapshot, cut).length;
  allocateWithinShares(selection, candidates, bodyBudget, [0.55, 0.30, 0.15]);
  lendUnusedQuota(selection, candidates, ["U", "W", "N"]);

  let result = render(selection, snapshot, cut);
  while (result.text.length > budget) {
    removeLowestPriorityUpgrade(selection);
    result = render(selection, snapshot, cut);
  }
  return finalize(result, snapshot, cut, budget);
}
```

实现中封面计数随选择重算。分配器将每次接受的升级记入栈，`removeLowestPriorityUpgrade` 严格按接受顺序逆序撤回，即后追加的深度先撤回，每次至少移除一个升级单元；它不删除保底。保底连同记录头和地址作为完整渲染单元计费，测试固定其在 2,400 字符窄端内可容纳。配置入口拒绝低于 2,400 的 viewMaxChars。如果单个字符簇过大，保留该记录地址而不强行拆字。正文中的重复源跨度只收费和展示一次。

`snapshotId` 为 sourceSessionId、分支头、水位、recipe 和选择跨度的规范序列化摘要前 12 位。它是追踪标识；不承担跨文件消息身份。

## 10. 核心算法四：统一 reader

### 10.1 参数与默认行为

工具使用普通 TypeBox 对象声明参数，由 `action` 决定合法组合。

| 动作 | 参数 | 返回 |
|---|---|---|
| `list` | `role?`、`scope?`、`cursor?` | 按时间顺序浏览记录，默认每页 20 项 |
| `list` 指定记录 | `ref`、`cursor?` | 字段、长度、章节标题及读取参数 |
| `search` | `query`、`match?:"terms"\|"literal"`、`role?`、`scope?`、`cursor?` | 默认最多 10 个命中，附原始片段和直接读取参数 |
| `read` | `ref`、`field?`、`offset?`、`length?`、`full?`、`cursor?` | 指定保存字段的原文区间，附实际范围、是否读完及下一步 |

`scope` 为 `branch` 或 `session`：默认搜索当前分支的有效文本；`session` 搜索本文件保存的原始文本与编辑记录，并标明分支/修订来源。显式 `read ref` 是地址读取，可以读取本文件内的历史原始记录。`field` 缺省使用该条目的主文本字段（codemode 多段工具结果取最后一个 text block，见 §7.1）；多字段通过 `list ref` 选择。显式 `field` 始终按 JSON Pointer 读取存储条目。

```json
{"action":"list","role":"user"}
{"action":"list","ref":"e:10ac93de"}
{"action":"search","query":"allocator golden 验收"}
{"action":"search","query":"422 pass / 0 fail","match":"literal","scope":"session"}
{"action":"read","ref":"e:913a85df","field":"/message/content/0/text","offset":21120,"length":800}
{"action":"read","ref":"e:10ac93de","full":true}
```

普通读取默认请求 6,000 字符，`length` 最大 12,000；`full:true` 从字段起点请求整个字段，不能同时传 `offset/length`。首次调用提供 ref；续读可只提供 `action` 和 cursor，定位信息由 cursor 恢复，不接受另外一组冲突的定位参数。全文部分结果的 cursor 保留 full 模式与实际续读位置。

全文模式仍服从运行累计额度。结果同时给出 `remainingChars`、`runRemainingChars` 和 `resume:"now"|"next-run"`；额度不足时保存 cursor，在下一次 agent 运行继续，而不是在本轮反复重试。正常 37K 字段在一次 4K 浏览后仍可于默认 48K 运行额度内完整读取；更大的字段按预算分批。这是按需读取的产品规则，不增加绕过预算的续读特例。

不在每条时间线里重复打印两个长 JSON。每个被截断记录最多附一个简短读取入口；`list ref` 和 `search` 负责返回具体字段/偏移。完整读取成本在 `list ref` 中按字段长度显示，执行结果回显实际字符数和剩余数。

### 10.2 读取预算

| 参数 | 初版默认 | 计费对象 |
|---|---:|---|
| list/search 输出上限 | 4,000 字符 | 整个工具文本结果 |
| 普通 read 输出上限 | 12,000 字符 | 正文 + 结果头 + 下一步 |
| full read 输出上限 | 48,000 字符 | 正文 + 结果头 + 下一步 |
| 一次 agent 运行累计额度 | 48,000 字符 | 已获准工具结果的完整文本 |
| 一次 agent 运行获准调用数 | 8 次 | list/search/read 合计 |

累计额度在 `before_agent_start` 开账，不在每次 `turn_start` 重置；后者会在工具循环里反复触发。额度耗尽只回短诊断，不回注原文。正常分页、容量截断和到达全文读取上限均为 `isError:false`，`details.incomplete=true`；参数错误、不存在的引用或取消才走错误路径。

每次读取还计算上下文余量，统一返回字符单位：

```text
usedTokens    = ctx.getContextUsage().tokens，未知时估算系统提示与当前投影消息
reserveTokens = min(8192, model.maxTokens) + ceil(0.05 × W)
freeTokens    = max(0, W - usedTokens - reserveTokens)
headroomChars = max(0, floor(3 × freeTokens) - inFlightChars)
grantChars    = min(requestedOutputCap, runRemainingChars, headroomChars)
```

未知用量的估算使用消息各内容字段字符量除以 3，图片按固定容量计入，与源码中已有的内容容量估算方式保持一致。系数 3 是 reader 容量估算值，不是精确 token 计量。`reserve` 对不足额度返回较小授权；`grantChars <= 512` 时直接产生 `budget_exhausted` 短诊断，不创建预留、不进入窗口切片。

并行调用在第一次 await 之前同步预留字符和调用额度，结束后退回未使用部分；取消也退回。预留表同时登记在途结果，容量估算扣除在途额度，避免兄弟调用各自吃满同一份空间。额度绑定 run 对象，旧调用结束不会修改新 run 的账本。

### 10.3 执行伪代码

```ts
async function executeRead(args, ctx, runBudget, signal) {
  const request = resolveReadArgs(args);
  const snapshot = resolveSnapshot(request.snapshot, ctx.sessionManager);
  const field = resolveStoredField(snapshot, request.ref, request.field);
  const requested = resolveRequestedRange(field, request);
  const outputCap = request.full ? 48000 : 12000;
  const grant = runBudget.reserve(outputCap, estimateContextHeadroomChars(ctx));

  try {
    signal.throwIfAborted();
    const window = fitGraphemeWindow(field.text, requested, grant.chars - RESULT_FRAME_RESERVE);
    const result = renderReadResult(field, window, snapshot, grant, runBudget);
    runBudget.settle(grant, result.contentText.length);
    return { content: [{ type: "text", text: result.contentText }], details: result.details };
  } catch (error) {
    runBudget.release(grant);
    throw error;
  }
}
```

`RESULT_FRAME_RESERVE=512`，为范围行、成本和续读参数保留空间；最终结果再测长度。`requested` 的长度是源正文请求量，输出预算不足时返回较短实际区间，并给出 next。full 模式不需要真的按 12K 循环读取再拼接，直接对目标字段作有界切片即可。

### 10.4 快照与分页

首次 list/search/read 固定当前源边界；cursor 保存版本、会话 ID、分支头、水位、原动作参数及其摘要。续点按动作区分：list/词法搜索为 `{page:{nextOrdinal}}`，字面扫描为 `{scan:{fieldOrdinal,offset}}`，read 为 `{read:{storageId,field,nextOffset,full}}`。

普通追加时当前分支头是原头的后继，仍按原水位完成分页；切到其他树路径或出现影响投影的新编辑时，有效历史游标失效，返回重新发起该动作的提示。原始字段 read 游标只需对应存储条目仍存在。

cursor 使用版本化编码状态，记录数组通过水位复原；不依赖只有进程内才存在的随机句柄。显式 `read ref` 不受旧游标失效影响。查询结果空时说明检索动作、范围和匹配方式，便于 agent 换词或浏览用户时间线。

## 11. 宿主集成与切点

### 11.1 注册与 LLM-free 保证

启动时常驻注册 `context_index`，`exposure:"direct"`。无需先 hidden 再激活；没有压缩记录的会话照样可以检索。

`session_before_compact` 对 manual、threshold、overflow 一律返回自己的 compaction。无法构建或收到取消信号时返回 `{cancel:true}`，让宿主终止此次压缩，而不是返回空值触发宿主默认模型摘要。

```ts
pi.on("session_before_compact", async (event, ctx) => {
  try {
    const snapshot = source.capture(ctx.sessionManager, event.branchEntries);
    const cut = chooseCut(snapshot, event, ctx);
    const capsule = buildCapsule(snapshot, cut, settings, getModelWindow(ctx));
    event.signal.throwIfAborted();
    return {
      compaction: {
        summary: capsule.text,
        details: capsule.details,
        firstKeptEntryId: cut.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  } catch (error) {
    reportCompactionError(error, ctx);
    return { cancel: true };
  }
});
```

正常 agent 回答依然调用用户选择的模型；“零模型调用”限定为插件自身的压缩与索引工作。安装时只启用一个接管压缩的插件，新包与旧 `pi-vcc-codemode` 二选一。

### 11.2 切点决定

复用现有用户轮切点和工具结果边界处理，不把原型算法重新发明一遍：

- 默认保留最近一个用户轮，接受 `/compact keep:N`。
- tail 的 token 估算上限为 `min(16000, floor(0.25×W))`；超过上限时移动到最近可用的消息/工具事务边界。
- overflow 路径收紧为 `min(8000, floor(0.15×W))`，为重试释放更多空间。
- 工具调用和已有配对结果作为一个事务考虑，tail 不以孤立 toolResult 开头。
- 显式 keep 指定优先表达用户轮数量；若该范围本身超过 tail 上限，按上限切分并在压缩通知中显示实际保留范围。
- compact-all 沿用宿主可接受的空 `firstKeptEntryId` 方式；由真实宿主测试固定行为。

cut 只决定 live tail，续接包仍从完整有效历史重新选取原文。保留不足的近期用户内容自动进入 U 候选。

### 11.3 生命周期

| 事件 | 动作 |
|---|---|
| `session_start`：startup/reload/new/resume/fork | 清理旧会话缓存，绑定当前记录；按需建索引 |
| `session_tree` | 重建当前分支有效集合；保留同文件原始地址能力 |
| `before_agent_start` | 新建本次运行的 reader 预算对象 |
| `session_before_compact` | 捕获快照、切点、重新选取源片段、返回续接包 |
| `session_compact` | 记录本次 manifest，刷新目录展示状态，通知实际压缩规模 |
| 工具调用 | 补充源索引，固定本次查询快照，执行预算化读取 |

普通压缩不重置当前运行的读取额度，防止“读满—压缩—额度清零—再读满”。重启后只恢复最新有效 manifest 的选择信息；历史 compaction 文本仍是历史展示记录，不需要保留旧 renderer 实现来重新生成它。

## 12. 首版参数、实现弹性与成本口径

用户设置先只暴露 `viewMaxChars`（默认 12,000，范围 2,400–24,000）、`keepUserTurns`（默认 1，范围 0–10）、`runReadMaxChars`（默认 48,000，范围 12,000–96,000），都为整数；其余是集中在 budget/selector 模块的版本化默认常量。设置文件放 Pi agentDir 下的 `pi-context-index.json`，不会修改 Pi 全局设置文件。配置越界在加载时给出错误并要求修正，不将窄端无效配置交给分配器。

扩展通过三个普通函数边界进行：

- `makeCandidates()` 可增加新的源片段策略。
- `extractObservations()` 可增加一个已知工具或日志格式。
- `search()` 可替换词法排序器，但继续输出相同 Span 和 reader 地址。

预算、阅读协议和引用模型保持解耦；调整 U/W/N 份额不需要迁移会话记录，增加工具适配不需要修改 reader。

成本记录分开统计：续接包字符、每次工具新增字符、一次 agent 运行累计回注字符、压缩耗时、检索耗时；端到端评测另记宿主实际 prompt token 用量。全文回读本身可能比一次小窗口更大，但若避免多轮重发整个上下文，累计成本可能更低。产品优化以任务完成效果和累计成本为准，不以单次返回长度代替全部收益。

## 13. 首版验收标准

### 13.1 必须自动通过

1. 三种压缩原因均进入插件路径；默认摘要模型调用次数为 0。
2. `summary.length <= min(Bcap,neededChars)`；围栏、标签、地址和换行全部计费。
3. 用户起点、近期用户指令和最新助手说明具有规定的保底；live 内容不重复选取。
4. 所有引用片段等于声明的保存字段子串；中文、emoji、组合字符、CRLF 和超长单行均可回读。
5. I/E/X 守恒、Live/Quoted/IndexOnly 互斥；同一 owner 的多个投影片段不重复计数。
6. search 返回的每一个读取参数都能执行；字面命中偏移准确，词法命中返回真实块范围。
7. full 部分结果为正常结果，next/cursor 可继续；正常结果严格计入本次运行预算。
8. 两个并发读取共用额度；工具循环不重置额度；运行中取消及时停止。
9. 连续 10 次压缩后仍能读回第一条用户消息、早期数字与中段更正；原有 compaction 和 reader 回声不进入候选。
10. 真实 SDK 中验证手动压缩、自动阈值、overflow、恢复会话、切树、fork 和 context edit 的基本路径。

### 13.2 用真实任务决定是否可用

首版试用至少覆盖：长编码任务、长方案讨论、存在分散更正的多轮任务。每个任务在压缩后检查：

- agent 能否说清楚正在完成的用户要求并继续下一步。
- 能否找到一个早期具体数字、一条中段更正和一项近期未展开的工作说明。
- 原文找回需要几次调用，是否出现重复全文读取。
- 与同任务的旧插件续接过程相比，是否减少重新解释、重新探索和重复执行。

小型固定题集使用 12 个问题：目标/更正 4 个，近期工作 3 个，历史数值/错误/文件 3 个，15K 第二窗口和 37K 深段各 1 个。目标是至少 10/12 有源依据地回答，4 个目标/更正题全部通过；每题以实际结果区间核对原文暴露，不只检查工具参数或最终布尔答案。这是首版试用目标，不是现有原型已经取得的成绩。

性能以开发机上的 10K 条消息、50MB 混合会话为首轮基准：冷建索引不超过 2 秒，热查询/普通读取不超过 200ms，纯续接选择渲染不超过 200ms。超时首先检查重复序列化和重复分词，再决定是否值得增加磁盘缓存。

## 14. 已核实基础与设计依据

本轮读取三份指定材料，并核实当前源码和已安装 Pi 1.4.0。以下为实现锚点，不把原型的实验通过数当成新插件已完成。

| 事实/用途 | 证据 |
|---|---|
| 原型与新插件尚未实现的状态 | [原型交接：5](./PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md#L5) |
| 原型基线、预算与 reader 经验 | [原型设计：304](./PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md#L304)、[1155](./PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md#L1155) |
| 外审指出摘录拼接、部分结果和真实压缩入口问题 | [外审：87](../reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md#L87)、[137](../reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md#L137)、[187](../reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md#L187) |
| 当前用户轮切点与 tail 预算 | [before-compact.ts：279](../../reference/legacy-0.1.5/src/hooks/before-compact.ts#L279)、[351](../../reference/legacy-0.1.5/src/hooks/before-compact.ts#L351) |
| 原始分支重建、影子检查点和编辑投影 | [brief-history.ts：83](../../reference/legacy-0.1.5/src/core/brief-history.ts#L83) |
| 原字段枚举思路与 Unicode 窗口 | [recall-full.ts：76](../../reference/legacy-0.1.5/src/core/recall-full.ts#L76)、[163](../../reference/legacy-0.1.5/src/core/recall-full.ts#L163)；其旧返回值为格式化字符串，新包改为字段迭代器 |
| 围栏状态机 | [fences.ts：70](../../reference/legacy-0.1.5/src/core/fences.ts#L70) |
| context edit 的实际保存字段 | [Pi session-manager.d.ts：119](../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts#L119) |
| fork 保留非 label 消息 ID、复制 compaction details | [Pi session-manager.js：1227](../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js#L1227) |
| 自制 compaction 优先，cancel 终止默认模型摘要 | [Pi agent-session.js：2253](../../node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js#L2253) |
| 压缩后 token 用量可能为 null；系统提示可读取 | [Pi types.d.ts：197](../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts#L197)、[248](../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts#L248) |

图索引用于定位，引用源码已直接核实；宿主 node_modules 与原型 research 不在图索引范围内，宿主结论来自当前安装版本的源码读取。实现完成后，以新包测试和真实使用记录更新验收结果。
