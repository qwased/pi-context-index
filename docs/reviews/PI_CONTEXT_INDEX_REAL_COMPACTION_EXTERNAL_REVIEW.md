# pi-context-index 真实压缩观察：S0/S1 独立外部评审

- 日期：2026-11-02
- 性质：独立外部审阅意见；不参与实现，不替代设计修订或真实任务验收。
- 评审对象：真实压缩观察记录、指定运行时代码、测试、V0.1 设计与仓库硬规则。
- 数据边界：本文只引用脱敏计数、长度、角色和代码行为，不包含真实会话正文、会话文件名、绝对路径或模型回答。

## 0. 总裁定（修/不修；0.1.0 是否阻塞）

| 问题 | 裁定 | 0.1.0 分类 |
|---|---|---|
| **S0：codemode 多段结果默认取到 header** | **修。** 采用范围受控的默认字段修复，并同步补测试、设计和版本。 | **实现阻断**：不是设计整体有误，而是未规定边界上的实现缺陷；不应作为可接受产品行为发布。 |
| **S1：W 只取最近两条助手文本** | **0.1.0 暂不改。** 保留 W=2，继续收集真实任务证据。 | **非阻断的设计调参项**：实现符合明文设计，单个会话不足以证明 W=3 或信息量选择更优。 |

S0 修复不能只用“最长 text block”：观察中正文最短为 **22 字符**，header 为 **44–47 字符**，最长段规则仍会选错这个已观察案例。因此建议 **0.1.0 仅对 codemode 的多段 text 结果选择最后一个 text block；其他消息和非 codemode 工具结果保持原行为**。

**证据限制：**本评审已只读核查指定仓库代码、测试和文档。评审时未获得真实会话访问方式，因此没有独立核验会话形态；有关长度、计数和恢复成本的判断仅基于观察文档中的脱敏指标，不将其当作统计证据。

## 1. S0（判断 + 修法 + 最小测试）

### 1.1 判断

这是“**设计未明确规定默认字段时的实现缺陷**”，不是设计阻断：

- 实现确实返回第一个 text block：[fields.ts:256–283](../../src/fields.ts#L256-L283)。
- 默认 `read` 直接采用该字段：[reader.ts:125–134](../../src/reader.ts#L125-L134)。
- 普通嵌套调用及聚合结果的胶囊摘录也沿用它；只有嵌套 error 有独立优先路径：[observations.ts:346–362](../../src/observations.ts#L346-L362)。
- 设计要求工具结果可索引、缺省读取“主文本字段”，但没有定义多段 text 的主字段规则：[设计 §7.1](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L320-L326)、[设计 §10.1](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L473-L485)。

正文仍能通过显式字段读取，所以不是索引或寻址失效；但默认读取和默认结果摘录都失去实际结果，已经影响核心可用路径。

### 1.2 推荐修法

**窄范围规则：**

```text
message.role == "toolResult"
且 message.toolName == "codemode"
且 content 为数组：
    选择最后一个 type == "text" 的块
其他情况：
    保持当前规则
```

理由：

1. **覆盖全部已观察形态**，包括正文短于 header 的情况。
2. 不把未经观察的“header+body”假设推广到所有工具，避免影响可能存在“body+footer”的其他结果。
3. 不维护 header 文案列表，不做脆弱的样板文本识别。
4. 只是依据已保存的 `toolName` 和 content 形态选择字段，不引入 codemode 包依赖，也不改变 LLM-free、精确字段地址或三个设置。

“所有 toolResult 一律取最后一段”也能修复本样本，但影响面更大；在没有其他多段工具结果样本时，不建议作为本次最小补丁。

### 1.3 规则下的明确行为

| 形态 | 行为 |
|---|---|
| assistant：thinking + text | **不变**；仍选第一个 text block，thinking 不作为主文本。 |
| 单段 toolResult | **不变**；选择唯一 text block。 |
| codemode 长短两段 | 无论两段长度和顺序如何，均选**最后一个 text block**。 |
| 非 codemode 多段 toolResult | **不变**；仍选第一个 text block，等待更多形态证据。 |
| 最后一段是 JSON 正文 | 作为原始文本选择，不解析 JSON、不按 JSON 内容特判；现有读取、分块和预算规则继续适用。 |
| 嵌套 error | **不变**；独立的 `/nestedCalls/.../error` 字段仍优先于父结果主字段。 |

### 1.4 最小测试集

现有的 codemode 字段夹具和胶囊夹具都只有单段聚合文本，未覆盖此边界：[fields.test.ts:95–132](../../tests/fields.test.ts#L95-L132)、[capsule.test.ts:240–300](../../tests/capsule.test.ts#L240-L300)。

最低应增加：

1. **短正文回归**：合成 header 长、正文短的两段 codemode 结果，断言主字段指向正文。这个用例专门防止误用“最长段”。
2. **长正文回归**：同样断言最后一段被选中。
3. **默认 reader**：不传 `field` 时返回正文；显式传 header 的 JSON Pointer 仍能读取 header。
4. **胶囊结果行**：`R` 摘录包含正文而非 header，且 `details.shown` 的 `field` 指向正文所在字段。
5. **不变行为**：单段 toolResult、非 codemode 多段结果、assistant thinking+text 均保持原规则。
6. **JSON 正文**：最后一段为合成 JSON 字符串时按原文选择，不发生解析或重排。
7. 更新受影响的 golden、精确文本和 `details.shown` 断言，并验证嵌套 error 的既有测试不变。

**两段 text 的合成夹具足以作为 S0 代码修复的合并门槛**；不需要真实会话正文，也不需要用旧插件对照来证明这个字段选择错误。但它不足以证明整体任务续接效果。

## 2. S1（判断 + 修法/延后 + 需要的证据）

### 2.1 判断：0.1.0 延后，不是实现 bug

设计明确规定“最近两条非 live 助手文本”，并允许短助手说明入选：[设计 §8.2](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L376-L388)。实现正是过滤非空助手主文本后 `slice(-CAPSULE_W_ASSISTANTS)`：[candidates.ts:735–757](../../src/candidates.ts#L735-L757)。

预算低利用率也不是分配器故障：

- 候选在预算分配前构造：[render.ts:394–404](../../src/render.ts#L394-L404)。
- 各组加深到没有候选后停止，再执行 U→W→N 借额：[render.ts:455–498](../../src/render.ts#L455-L498)。
- `neededChars` 本来就是固定候选集的成本，而不是必须填满的会话长度：[设计 §9.1](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L437-L439)。

同一会话的两轮压缩不是两个独立样本；“6/9 段长文本 0 入选”也不能直接等同于信息丢失，因为旧助手文本按设计本来就可以是 index-only，且长度不等于结论价值。W=3 恰好命中本次第三条结论，只能构成**待验证假设**。

### 2.2 后续若证据重复出现

再离线比较 W=2、W=3 和额外候选。若采用“预算感知额外候选”，不应按剩余预算临时构造候选——这会冲击“候选先于预算”的约束。更合适的形式是：

- 固定加入一个低优先级的额外助手候选；
- 由现有分配器在有剩余额度时决定是否展示；
- 同批修订设计、提升版本并更新 golden。

现在不应先改常量再补证据。

### 2.3 更根本方案的边界

- **reader 默认拼接所有 text 段**：不建议用于本次修复。若简单拼成单一字段字符串，会破坏当前单 `field + [start,end)` 的精确地址及读取游标语义；若为每段保留独立地址并支持跨字段游标，则不必违背设计，但已是较大的 reader 契约改版。
- **W 按信息量而非时间选择**：可以用确定性词法规则研究，但长度、标题或 BM25 都可能偏爱冗长文本；需要任务级对照，不能直接替换近期性规则。
- **当前状态完全交给 reader**：符合“有限视图 + 精确地址”和无语义状态段的约束。可以继续依靠显式 `list/search/read`，不要为此增加宿主拦截、自动状态注入或生成的 pending/current-state 段。它也不能替代对 W 候选召回效果的评估。

## 3. 最小修改清单（文件、函数、测试、版本）

| 位置 | 最小动作 |
|---|---|
| [fields.ts:256–324](../../src/fields.ts#L256-L324) | 在 `primaryFieldPath` 增加上述窄范围 codemode 最后 text block 规则；其他角色和条目类型不变。 |
| [observations.ts:346–362](../../src/observations.ts#L346-L362) | **无需另写选择逻辑**；继续复用主字段，嵌套 error 特判保持不变。 |
| [reader.ts:125–134](../../src/reader.ts#L125-L134) | **无需修改运行时代码**；通过共享主字段解析自动获得修复。 |
| [render.ts:455–498](../../src/render.ts#L455-L498) | **不改预算分配器**；S0 不是份额或借额问题。 |
| [fields.test.ts:181–210](../../tests/fields.test.ts#L181-L210) | 增加主字段、短/长正文、JSON、assistant 和默认 read 回归。必要时仅扩展合成 fixture helper。 |
| [capsule.test.ts:240–300](../../tests/capsule.test.ts#L240-L300) | 增加两段 codemode 的 `R` 行和 `details.shown` 断言；更新受影响 golden。 |
| [model.ts:119–122](../../src/model.ts#L119-L122) | 提升 `SELECTOR_VERSION`（当前为 1）。字段枚举和地址格式未变，不能以此替代选择器版本升级。 |
| [设计 §6.4](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L271-L297)、[§7.1](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L320-L326)、[§10.1](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L473-L485) | 同批写明 codemode 多段默认字段规则和选择器版本；§8.2 的 W=2 本次不改。 |
| [CHANGELOG.md:3–28](../../CHANGELOG.md#L3-L28) | 增加用户可见修复及 W 的已知限制。 |

S1 若未来修订，必须另批修改候选构造、设计 §8.2、测试、golden 和 `SELECTOR_VERSION`，不能只改 `CAPSULE_W_ASSISTANTS`。

## 4. 0.1.0 发布建议

1. **先阻断发布完成 S0 小补丁**，包括测试、设计、版本和 golden；不需要为 S0 重做预算系统。
2. **不要因 S1 继续调参而阻塞 0.1.0**，但应在已知限制中明确 W=2 的召回边界。
3. S1 非阻断不等于跳过现有验收。三个真实任务及旧插件同任务对照仍是设计 §13.2 的既定要求：[设计 §13.2](../plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md#L648-L657)。
4. 发布说明可使用如下英文表述：

```md
### Fixed

- Default reads and capsule result excerpts now select the result body of multi-part codemode tool results instead of the status header. Explicit field reads remain available.

### Known limitations

- The capsule still selects only the two most recent non-live assistant texts. Older conclusions may remain index-only and require list/search/read recovery; candidate changes await more real-task evidence.
```

发布说明不应声称 S1 已解决，也不应写入真实会话正文、文件名、路径或模型回答。

## 5. 证据缺口与下一步

1. **真实形态尚未由外审独立核验。** 下一步只需在授权环境中复核多段数量、各段长度、默认读取命中的字段及 R 行是否仍为 header；产出仅保留聚合指标。
2. **S0 修后需要一次真实宿主回归。** 合成测试证明规则正确，真实宿主回归确认保存形态没有额外变体；旧插件对照不是该单元修复的必要条件。
3. **S1 需要更多样本。** 按 §13.2 覆盖长编码、长方案讨论、分散更正任务，记录结论所在 recency 位置、胶囊是否包含、reader 恢复次数、重复探索及任务是否成功继续。两轮同会话指标不能外推为普遍频率。
4. **整体发布仍需同规模真实任务和旧插件对照。** 这是既有 §13.2 验收要求，不应全部转嫁给 S0 修复，也不能由一次 codemode 观察替代。
5. **编辑投影是未覆盖边界。** 当前有效记录从存储条目解析主字段；编辑后的 replacement 不携带原始 `toolName`：[source.ts:332–340](../../src/source.ts#L332-L340)、[source.ts:434–439](../../src/source.ts#L434-L439)。若要求编辑后的 codemode 多段结果也采用同一特判，需要另设 owner-aware 解析和测试；本样本不能证明该形态存在或已被覆盖。
