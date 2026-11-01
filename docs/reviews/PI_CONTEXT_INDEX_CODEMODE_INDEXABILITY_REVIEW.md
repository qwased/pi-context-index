# codemode 脚本与执行结果的可索引、可寻回：需求、宿主核实与范围结论

- 日期：2026-10-31（初稿）；2026-11-02（需求方确认范围）
- 性质：需求与宿主核实记录，含**已确认的 0.1.0 范围结论**；不是实施计划，也不替代设计修订。
- 需求方原文：「codemode 脚本与执行结果也要可索引、可寻回」。
- 需求方确认（2026-11-02）：「codemode 下能够索引并寻回脚本输出结果即可，不需要寻回每一条命令单独的执行结果」。
- 依据：[V0.1 设计](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md)、[V0.1 计划](../plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md)、[进度与交接 §7](../plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md)、已安装 Pi 1.4.0 源码、真实 in-process 宿主探针（合成夹具，无真实会话）。
- 结论一句话：**0.1.0 只承诺 R1–R3**——脚本源、脚本聚合输出、嵌套调用元数据可索引、可按 `e:<entryId>` + JSON Pointer 寻回；**R4（每条嵌套调用的独立执行输出）不需要，0.1.0 不做**。宿主不落盘这类输出，插件不监听事件、不复制正文、不改上游；该限制写入胶囊文案与 README。

## 0. 问题与结论

| 问题 | 结论 | 状态 |
|---|---|---|
| Q1 「执行结果」指脚本聚合输出、每条嵌套调用的输出，还是两者都要 | 指**脚本聚合输出（R2）**；每条嵌套调用的输出（R4）不需要 | 需求方 2026-11-02 确认 |
| Q2 是否需要路径 B（监听 `tool_execution_end` 落盘嵌套输出） | 不需要；0.1.0 不走 B | 由 Q1 决定 |
| Q3 是否把「嵌套输出不可寻回」写成产品级已知限制 | 是；胶囊与 README 写明「要保留就给脚本 `return`/`text()`」 | 由 Q1 决定 |
| Q4 参数 >8KB 被丢弃时如何导航 | 明示「参数已省略（N 字节）」；不索引 `details.calls[i].args` 预览 | 实现期按建议（§7 D2） |
| Q5 自我回声如何剪除 | 读取结果正文加机器标记，建索引时在 codemode 父正文内剪除标记区间 | 实现期按建议（§7 D3） |
| Q6 `codemode.mode:"only"` 下的胶囊/guideline 文案 | 模式中立（「直接调用或经脚本调用」） | 实现期按建议（§7 D5） |

Q4–Q6 需求方没有逐条答复；范围结论已排除唯一需要外部选择的项（R4），其余按本节建议进入 P1/P2。实现时如有偏差，先改本节与 §7，再改实现。

## 1. 需求拆解与范围

| 编号 | 内容 | 默认（无 codemode） | codemode 会话 | 0.1.0 |
|---|---|---|---|---|
| R1 | **脚本源**可索引、可按地址读回 | 不适用 | 等价物是工具参数 `code` | 纳入 |
| R2 | **脚本执行结果（聚合输出）**可索引、可读回 | 每个工具结果各自落盘 | 脚本的 `text()`/`return`/`console` 合并成一条结果正文 | 纳入（以宿主保存的正文为界） |
| R3 | **嵌套调用元数据**（调了什么、成功/失败、错误文本）可索引、可引用 | 不适用 | `nestedCalls` | 纳入（仅元数据，无输出正文） |
| R4 | **每条嵌套调用的执行输出**可索引、可读回 | 天然满足（每条 `toolResult`） | **不落盘** | **不纳入**（产品级已知限制） |

R1–R3 是设计与实现问题；R4 是宿主事实问题，也是本次范围确认唯一排除的项。R3 是 `nestedCalls` 里的元数据，不增加正文副本，沿用设计 §7.1 已有口径。

R2 的「可寻回」有宿主上限：聚合输出默认按 `max_output_tokens`（10,000 token ≈ 40,000 字符）截断，保留头 20,000 + 尾 20,000，全文只写入临时文件。0.1.0 索引和读回的是**宿主已保存的正文**；临时文件路径不入索引（§9、§11）。

## 2. 已核实的宿主事实

证据列中 probe 指本次真实宿主探针：临时 cwd/agentDir/sessions，注入 `createCodemodeExtension()`，脚本混合 `context_index`、`bash`、20KB `write`、不存在的 `read`，`mode` 取 `on` 与 `only` 各一次。

| 编号 | 事实 | 数值 / 形态 | 证据 |
|---|---|---|---|
| F1 | 一次 codemode 调用只落**一条** `toolResult` 条目 | 4 次嵌套调用 → 1 条工具结果 | probe；`dist/core/nested-tool-calls.js` |
| F2 | 嵌套调用**结果不入库** | 脚本 `tools.bash` 的 stdout 在会话任何字段都不存在 | 源码注释 “Nested results are not persisted”；probe `bashOutputInResult:false` |
| F3 | 嵌套记录在父条目的 `message.nestedCalls` | `{calls:[{id,name,arguments?,argumentsBytes?,status,durationMs?,error?}],complete}` | probe |
| F4 | 嵌套参数按字节截断 | 单次 >8192 字节或累计 >32768 字节只留 `argumentsBytes`；>256 条调用丢弃 | `NESTED_CALL_LIMITS`；probe：20,031 字节的 write → `hasArguments:false, argumentsBytes:20031` |
| F5 | 出现截断或存在未完成调用即 `complete:false` | probe 结果 `complete:false`；`snapshot()` 同时检查未完成调用 | 同 F4；probe |
| F6 | 嵌套错误文本截断 | ≤500 字符 | `maxErrorChars`；probe `errorChars:123` |
| F7 | 嵌套调用 id 不是条目 ID | `tool:<ts>:<rand>/N`，且不作为独立调用/结果出现在对话记录里 | `dist/core/extensions/types.d.ts` 注释；probe |
| F8 | `details.calls[i].args` 是**预览字符串** | JSON 截到 200 字符，非结构化；`details.fullOutputPath` 另存临时文件路径 | `ARGS_PREVIEW_CHARS=200`；probe `writeDetailArgsShape:string` |
| F9 | 聚合输出按 token 预算截断 | 默认 10,000 token × 4 = 40,000 字符；超出保留头 20,000 + 尾 20,000 并加警告行；全文写入 `pi-codemode` 临时文件，路径进结果正文与 `details.fullOutputPath` | `truncateOutput`、`CHARS_PER_TOKEN=4`、`DEFAULT_MAX_OUTPUT_TOKENS=10_000` |
| F10 | 脚本源的保存位置 | 助手消息 `content[i]` 的 `{type:"toolCall",name:"codemode",arguments:{code}}` | `message-types.md`；probe 请求体 |
| F11 | `exposure:"direct"` 的工具在两种 mode 下都可从脚本调用 | `on`：声明 + 描述追加 `Codemode: tools.context_index(args) resolves to a string.`；`only`：不声明（声明数 1）但脚本调用 `status:"ok"` | probe |
| F12 | 插件 guideline 两种 mode 都在，位置不同 | `on`：系统提示词 rules；`only`：codemode 描述内（受 `codemode.inlineBudget` 默认 3000 估算 token 约束，编目 cheapest-first） | probe |

F2/F9 划定了本次范围的边界：R2 可寻回的是宿主保存的聚合正文（含 F9 的警告行与分段标记），R4 在会话中没有任何字段可按地址读取。

## 3. 能力矩阵

| 需求 | 落盘地址（`e:<entryId>` 为条目） | 可索引 | 可寻回 | 0.1.0 |
|---|---|---|---|---|
| R1 脚本源 | `…/message/content/<i>/arguments/code` | 是 | 是 | 纳入。单条脚本可达数十 KB，索引成本高于普通参数 |
| R2 聚合输出 | `…/message/content/0/text` | 是 | 是（宿主保存的正文；默认上限 40,000 字符，脚本可调 `max_output_tokens`） | 纳入。超限只有临时文件，非持久；警告行与 `==> text N/M <==` 分段标记保留在正文内 |
| R3 嵌套元数据 | `…/message/nestedCalls/calls/<i>/{name,status,durationMs,arguments,argumentsBytes,error}` | 是 | 是 | 纳入。仅 `argumentsBytes` 时无参数正文 |
| R4 嵌套输出 | **不存在** | 否 | 否 | **不要求**。只能经 R2 间接看到脚本选择打印的部分，且无法归因到具体调用 |
| （不建议）内部预览 | `…/message/details/calls/<i>/args` | 技术上可 | 技术上可 | 不索引。200 字符截断 JSON，Pi 内部 TUI 数据，非稳定契约 |

`on` 与 `only` 在 R1–R3 上没有差别；差别在于模型如何发起调用（直接 vs 脚本），以及 R4 缺口在 `only` 下更大——`only` 下**每一次**读取都是嵌套调用，未被脚本打印的输出永久丢失。0.1.0 接受这一点，并在胶囊与 README 说明。

## 4. 与冻结设计/契约的冲突与处置

| 编号 | 冲突 | 位置 | 0.1.0 处置 |
|---|---|---|---|
| C1 | 候选 W「最近错误/命令结果」与 N「计数片段」假设有工具结果正文 | 设计 §8.2 | 只用父条目正文与嵌套 `error`/`status`；不为不存在的单条命令输出伪造行。脚本打印的结果按父正文片段入选 |
| C2 | `Observation{callId,resultId?}` 与 `CapsuleObservationRef` 无法表达「第 N 条嵌套调用」 | 设计 §6.4（冻结契约） | 加 `nestedIndex?`；`resultId` 表示承载嵌套记录的父结果条目。P1 与设计 §6.4 同批更新 |
| C3 | 所有嵌套调用共享父 `resultId` | §6.4、§6.5 | 配对键改为 `(resultId,nestedIndex)`；按结果去重的错误/计数先按嵌套序号分开 |
| C4 | write/edit 参数 >8KB 时路径消失 | §8.2、§4.1「文件曾收到什么操作请求」 | 输出「参数已省略（N 字节）」，不静默少行；不索引 `details` 预览 |
| C5 | 自我回声按工具名判定失效（回声藏在父正文里） | §6.5、§13.1 第 9 项 | 读取结果正文加机器标记，建索引/候选时在 codemode 父正文内剪除标记区间，保留同脚本其他证据 |
| C6 | `details` 被当作可能的字段来源 | §7.1 未排除 | 字段迭代器跳过 `/message/details/**`；`list ref` 只标注为 Pi 内部预览 |
| C7 | 胶囊文案 `context_index {...}` 假定工具已声明 | §4.1 | 改为「直接调用或经脚本调用」，不假设声明存在 |

## 5. R4 的处理路径

| 路径 | 做法 | 满足 R4 | 代价 / 风险 | 结论 |
|---|---|---|---|---|
| **A 接受限制** | 只做 R1–R3；胶囊/README 明确「嵌套输出不落盘，要保留就让脚本返回它」 | 否 | 用户须改变脚本写法；历史会话无法补 | **已选（2026-11-02）**。与「Pi 记录是事实」一致，不新增副本 |
| **B 事件捕获落盘** | 订阅 `tool_execution_end`（或 `tool_result`），对 `parentToolCallId` 非空的调用把 `toolName`/`args`/`content` 写入 `customType:"pi-context-index.nested"` 的 custom 条目，reader 按 `e:<id>` 读取 | 是（仅插件安装后的会话） | 工具正文复制进会话文件：体积、隐私面、去重与清理策略都要定 | **不采用**。D6 不批准，0.1.0 不写实现；将来要每命令输出须单独立项 |
| **C 上游改动** | 请 Pi 把嵌套结果落盘（或在 `nestedCalls` 加输出片段） | 是（全局） | 不在本仓库控制范围 | 不采用。依赖 Pi >1.4.0，违反当前 peer 锁定 |
| **D 脚本自打印约定** | 靠 guideline/文档要求脚本 `return`/`text()` 关键输出，使 R2 覆盖 R4 的常见需求 | 部分 | 依赖模型行为，不可验证；`max_output_tokens` 与 40,000 字符上限仍会截断 | 作为**文档提示**保留，不作为验收项或产品承诺 |

路径 B 的关键事实与未验证点保留为历史记录：事件里确有 `parentToolCallId`、`toolName`、`args`、`result`（含 `content`）、`isError`、`durationMs`；未验证 `tool_result` 钩子改写后的内容是否与 `nestedCalls` 参数一致，也未验证 `pi.appendEntry()` 与父结果写入的顺序。选 A 后这些点不在 0.1.0 的探针清单里。

## 6. 路径 A 的最小修订清单

| 编号 | 修订 | 落点 | 阶段 |
|---|---|---|---|
| E1 | 字段迭代器覆盖 `/message/nestedCalls/calls/<i>/{arguments,error,status}`；`argumentsBytes` 作为标量字段；**跳过** `/message/details/**` | `src/fields.ts` | P1 |
| E2 | 契约加嵌套序号：`Observation.nestedIndex?`、`CapsuleObservationRef.nestedIndex?`；`resultId` 语义改为「承载该嵌套记录的父结果条目」 | `src/model.ts` + 设计 §6.4（同批） | P1 |
| E3 | 参数被丢弃时输出「参数已省略（N 字节）」，不静默丢弃；W/N 只用父正文与 `error`/`status` | `src/observations.ts`、`src/candidates.ts` | P2 |
| E4 | 自我回声：读取结果正文加固定机器标记，建索引/候选时在 codemode 父正文内剪除标记区间（保留同脚本其他证据） | `src/host.ts`、`src/fields.ts`、`src/render.ts` | P2/P3 |
| E5 | 胶囊与 guideline 措辞模式中立；`only` 下提示可写一行脚本 | `src/host.ts`、`src/budget.ts` | P2 |
| E6 | reader 的 `read` 允许 `field=/message/nestedCalls/…`（现有 JSON Pointer 解析器已能处理，无需新参数） | `src/reader.ts` | P0 已具备，P3 验证 |
| E7 | 胶囊与 README 写明「脚本内嵌套调用的输出不单独保存；要保留就在脚本里 `return`/`text()`」 | `src/render.ts`、`README.md` | P2/P5 |

## 7. 决定与状态

| 编号 | 决定 | 状态 | 落点 |
|---|---|---|---|
| D1 | R4 走 A/B/C/D 哪条 | **已确认：A**（2026-11-02）。R4 不要求、0.1.0 不做；不监听事件、不写副本、不改上游 | §5、§6、§11 |
| D2 | 参数 >8KB 的处理 | 实现期按建议：走 E3 明示已省略；不索引 `details` 预览 | P1/P2 |
| D3 | 自我回声剪除 | 实现期按建议：走 E4 机器标记方案 | P2/P3 |
| D4 | `details` 字段是否入索引 | 不入索引；`list ref` 的结构清单只标注为 Pi 内部预览 | P1 |
| D5 | 胶囊文案 | 模式中立措辞，不假设工具已声明 | P2 |
| D6 | 是否允许扩展新增 custom 条目类型（路径 B 前置） | **不批准**（随 A）。将来若走 B，须单独立项、单独批准 | 无实现 |

D2–D5 是评审建议，需求方未逐条答复；范围结论（Q1–Q3）已消除唯一需要外部选择的项。实现时以本节为准；需求方另有意见时，先改本节与 §6，再改实现。

## 8. 测试矩阵新增（建议并入计划 §6）

| 初始状态 | 触发 | 目标状态/可观察结果 | 归属 |
|---|---|---|---|
| codemode 会话，含 20KB write 嵌套调用 | 压缩 + `list ref` | 出现「参数已省略（20031 字节）」行；不出现伪造路径 | capsule / observations |
| codemode 会话，`complete:false` | 压缩 | 缺参数调用不算成功写入；details 记录 `nestedCalls.complete` | capsule |
| codemode 会话，脚本内并发 4 次 `context_index` 读取 | 一次 agent 运行 | 共用同一 run 预算；在途额度计入 headroom；总字符不超上限 | reader / host |
| 脚本 `return` 了本插件读取结果 | 再次压缩 | 回声被剪除，父正文其他输出仍可入选/搜索 | capsule / fields |
| `codemode.mode:"only"` | 压缩 + 读取 | 胶囊文案仍可执行（经脚本），模型不调用未声明工具 | host |
| 嵌套调用失败（`status:"error"`） | 压缩 | 错误文本（≤500 字符）可引用；不当作成功 | capsule |
| 脚本调用 `bash` 但未把输出写进返回值 | 压缩 + `list`/`search` | 不出现伪造的命令结果/退出码行；父正文只含脚本实际打印的内容 | fields / capsule |
| 脚本聚合输出超过默认保存上限（40,000 字符） | 压缩 + `read` 父结果 | 只索引宿主保存的头尾正文与警告行；临时文件路径不出现在引用中 | fields / reader |

## 9. 数据边界

- 本文与探针只用合成夹具；不含真实会话正文、文件名或绝对路径。
- 0.1.0 不采用路径 B，因此插件不会向会话文件复制工具输出；会话里唯一的 codemode 输出副本来自 Pi 自身保存的聚合正文，并受宿主 `max_output_tokens` 截断约束（默认 40,000 字符）。
- R4 的输出宿主既不落盘，插件也不捕获；历史与未来的 codemode 会话都一样，不承诺恢复。
- 路径 B 的隐私条款（若将来立项）需另写：副本范围、上限、清理与关闭方式。
- 胶囊只引用父正文片段，不把不存在的嵌套输出声明为事实，也不把 `details` 预览当作原文。

## 10. 复现方法（供复核，不含真实会话）

1. 用临时 `cwd`/`agentDir`/`sessions` 建 in-process 宿主会话，向 `DefaultResourceLoader` 传 `additionalExtensionPaths:[index.ts]` 与 `extensionFactories:[{name:"codemode", factory: createCodemodeExtension()}]`。不要设 `noExtensions:true`（内置扩展不会被加载）；也不要自建 `systemPrompt`（会让 rules 段整体缺席，制造「guideline 不见了」的假象）。
2. 用 faux provider 先发一条 `codemode` 工具调用，脚本读一次 `context_index`（指向已知用户条目）、`tools.bash` 打印一行、`tools.write` 写 20KB、`tools.read` 读不存在路径，最后 `return` 各自状态。
3. 读回会话条目，核对：`nestedCalls` 四条的 `status`/`argumentsBytes`/`error`；父正文是否含读取结果（回声）；`details.calls[i].args` 是否为 200 字符字符串。
4. 以 `codemode.mode:"only"` 重复一次，核对声明的工具数与 guideline 位置。

（本次探针是一次性脚本，未入库；建议 P4 固化为 `tests/codemode.test.ts`。）

## 11. 明确不做

- 不把 codemode 脚本当作权限或磁盘事实：脚本内容只表示请求。
- 不解析脚本源码去推断文件操作；文件操作只认 `nestedCalls` 参数。
- **不寻回每条嵌套调用的执行输出（R4）**：不监听 `tool_execution_end`、不新增 custom 条目复制正文（D1/D6）。
- 不把 `details.calls[i].args` 的 200 字符预览当作保存字段或参数来源。
- 不为 `max_output_tokens` 截断后的临时文件建长期索引（临时路径不稳定）。
- 不改 Pi 上游；不依赖 Pi >1.4.0。

## 12. 与设计/计划的衔接

按[进度文档 §1](../plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md)的约定，设计修订与实现同批；本轮只定范围。以下修订在对应阶段落地时同步更新设计，并在进度文档 §6 记录。

| 文档 | 待修订点 | 时机 |
|---|---|---|
| 设计 §6.4 | `Observation.nestedIndex?`、`CapsuleObservationRef.nestedIndex?`；`resultId` 语义 | P1 契约改动同批 |
| 设计 §7.1 | 明确 nestedCalls 字段清单，并跳过 `/message/details/**` | P1 |
| 设计 §8.2 | codemode 下 W/N 只用父正文与嵌套 `error`/`status`；写明 R4 限制 | P2 |
| 设计 §6.5 | 回声按机器标记剪除，而非按工具名 | P2 |
| 设计 §4.1 | 胶囊文案模式中立 + 嵌套输出限制说明 | P2 |
| 计划 §6 | 并入 §8 的 8 行测试；P4 复核 | P4 前 |
| README | 已知限制与「给脚本返回值」提示 | P5 |

## 13. 修订记录

| 日期 | 内容 |
|---|---|
| 2026-10-31 | 初稿：需求拆解 R1–R4、F1–F12 宿主事实、C1–C7 冲突、A/B/C/D 路径、E1–E6、D1–D6 与测试矩阵 |
| 2026-11-02 | 需求方确认范围：R1–R3 纳入、R4 不要求；D1 定为路径 A、D6 不批准、D2–D5 按建议进入实现；补充 R2 截断边界、E7 文案项、F5 准确性说明与 2 条测试行 |
