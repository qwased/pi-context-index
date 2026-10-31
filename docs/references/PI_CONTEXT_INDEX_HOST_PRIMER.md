# Pi 宿主入门（给离线、无 Pi 背景的评审者）

- 适用宿主：**@earendil-works/pi-coding-agent 1.4.0**（本仓库 bun.lock 固定）；peer 范围 **>=1.0.0 <2.0.0**
- 性质：**摘录性说明**，不是 Pi 官方文档；包内不包含 Pi 源码/文档。材料没写的行为，标“未验证”，不要用其他 agent 框架的常识补全。
- 事实来源：本机 Pi 1.4.0 的 docs/compaction.md、docs/extensions.md、docs/sdk.md、examples/extensions/hello.ts，以及 research/prototype/host-pi.mjs 的实际运行结果。

## 1. Pi 的最小模型

Pi 是一个编码 agent。一个会话是持久的 **entry 树**（JSONL）：消息、custom、compaction、branch summary 等；当前分支有一个 leaf。SessionManager 拥有这棵树和 leaf；createAgentSession 创建一个会话，拥有模型、工具、队列、压缩状态与扩展运行时。

对本设计重要的只有三件事：

1. **压缩**：Pi 在自动压缩或 /compact 前触发 **session_before_compact**；扩展可以取消或返回自定义 compaction。Pi 追加一个 compaction entry，并用“summary + firstKeptEntryId 之后的条目”重建下一次请求的上下文。
2. **工具**：扩展用 **defineTool** 定义工具，用 **pi.registerTool** 注册；模型发结构化 tool_call，宿主校验参数后调用 execute，再把工具结果作为 toolResult 消息送回模型。
3. **扩展生命周期**：pi.on(...) 注册事件；工具、命令、prompt 片段/规则、exposure 与 active set 都由扩展注册。

## 2. session_before_compact 契约（1.4.0）

~~~ts
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // preparation.messagesToSummarize  要摘要的消息
  // preparation.turnPrefixMessages   拆分轮次时的用户消息前缀
  // preparation.previousSummary      上一次压缩摘要
  // preparation.fileOps              宿主提取的文件操作
  // preparation.tokensBefore         压缩前上下文 token
  // preparation.firstKeptEntryId     保留消息的起点
  // preparation.settings             应用模型覆盖后的有效设置
  // branchEntries                    当前分支的全部 entry（供自定义状态）
  // reason                           manual | threshold | overflow
  // willRetry                        溢出恢复时是否重试被中断的回合
  // signal                           AbortSignal

  return {
    compaction: {
      summary: "...",                       // 进入下一次上下文
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { /* 结构数据；给 UI/状态重建，不进入模型上下文 */ },
      // usage: optional
    },
  };
  // 或者 return { cancel: true };
});
~~~

- 重复压缩时，摘要范围从上一轮的 firstKeptEntryId 开始；Pi 也会从重建后的投影重算 tokensBefore。
- **本设计的使用方式**：summary 是视图文本；details 保存 view id、选择跨度、recipe 等结构；不调用模型生成 summary；不读取实时文件。
- **details 不是模型输入**：模型只看到 toolResult 的 content；compaction 的 details 供 UI/状态重建。

## 3. 工具契约（1.4.0）

官方示例（examples/extensions/hello.ts）的最小形状：

~~~ts
import { Type } from "typebox"; // 官方 hello 示例从 @earendil-works/pi-ai 导入 Type；本仓库 peer 依赖是 typebox
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const tool = defineTool({
  name: "context_index",
  label: "context index",
  description: "Read saved session history outside the compressed view. One action per call.",
  parameters: Type.Object({
    view: Type.Optional(Type.String()),
    read: Type.Optional(Type.Object({
      index: Type.Integer({ minimum: 0 }),
      field: Type.Optional(Type.String()),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      length: Type.Optional(Type.Integer({ minimum: 1, maximum: 12000 })),
    }, { additionalProperties: false })),
  }, { additionalProperties: false }),
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  executionMode: "parallel",
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: "..." }],   // 模型看到
      details: { viewId: "v...", spans: [] },     // UI/状态重建，不进入模型上下文
    };
  },
});

export default (pi: ExtensionAPI) => {
  pi.registerTool(tool);
};
~~~

关键事实：

| 事实 | 含义 |
|---|---|
| execute 签名 | execute(toolCallId, params, signal, onUpdate, ctx)；参数是已校验的 TypeBox 值。 |
| content vs details | content 是模型可见文本；details 是结构化渲染/状态，不进入模型上下文。details 不得复制正文。 |
| throw | execute 抛错变成失败的工具结果（isError:true）；模型看到错误文本。 |
| isError:true + content | “有数据的部分失败”：模型看到错误，但正文/cursor 仍可用。本设计的 cover 截断用这个路径。 |
| terminate | 仅当同一批所有已完成工具都同意时，跳过自动 follow-up；本设计不使用。 |
| schema 校验 | 宿主在 execute 之前按 TypeBox 校验；非法参数不会进入 execute。 |
| annotations | readOnlyHint 等只是提示；权限由独立扩展/ tool_call 钩子执行，不是 annotations 自动授权。 |
| executionMode | 本探针用 parallel；同一 assistant 消息的工具调用可以并行。 |

## 4. 注册、提示词与 exposure

- **pi.registerTool(tool)** 注册工具。注册 direct 或 model-only 工具会激活它；其他 exposure 不会自动激活。
- **promptSnippet** 与 **promptGuidelines** 是工具定义字段，进入系统提示词；探针验证了 snippet 与 guideline 都出现（系统提示词 11,392 chars）。本设计据此把“何时读保存原文/何时用 cover”作为结构规则，而不是塞进视图正文。
- **exposure**（1.4.0）：

| 值 | 含义 |
|---|---|
| direct | 模型可见可调；注册即激活。本设计的 reader 用这个。 |
| model-only | 只声明给模型，不能被其他工具调用；适合编排/问用户。 |
| codemode | 可供 codemode 脚本调用；不在模型工具列表，除非显式激活。 |
| deferred | 类似 codemode，但 tool_search 可发现/激活。 |
| hidden | 已注册但不可达；用于撤回。**不能按名重新激活**：宿主 _applyToolLoadout 直接丢弃 hidden；要撤回就重新注册为 hidden。 |

- **不能真正注销工具**：撤回 = 重新注册 hidden。本设计的“无 view 时隐藏工具、压缩后再注册 direct”必须按这个语义写，不能写成“先隐藏、后按名恢复”。
- **没有内建 per-turn 工具预算**：宿主不按回合限制工具调用次数；扩展必须自己计数并抛 budget_exhausted。探针第 4 次调用验证了这一点。
- **权限**：tool_call 事件（扩展层）或 runToolCall 的 beforeToolCall 回调（探针层）可以在 execute 前拦截；{block:true, reason} 变成错误结果。annotations 不是授权。
- **运行中取消**：execute 收到 ctx.signal/signal；预 abort 会被 signal.aborted 捕获。**运行中取消未验证**；只验证了预 abort。

## 5. 宿主探针做了什么（host-pi.mjs）

探针用真实 in-process Pi SDK，临时 cwd/agentDir，只启用 context_index：

~~~ts
const runtime = await ModelRuntime.create({ modelsPath, authPath });
const model = runtime.getModel("local-deepseek", "deepseek-v4.1-flash-1017");
const loader = new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [(pi) => pi.registerTool(tool)] });
await loader.reload();
const { session } = await createAgentSession({
  cwd, agentDir, modelRuntime: runtime, model, resourceLoader: loader,
  sessionManager: SessionManager.inMemory(cwd),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
  tools: ["context_index"],
  thinkingLevel: "off",
});
~~~

结构调用用 **@earendil-works/pi-agent-core** 的 **runToolCall** 直接走真实校验/执行路径；模型闭环用真实会话订阅事件。

24 项检查（分类）：

| 类别 | 项数 | 内容 |
|---|---:|---|
| schema 接受/拒绝 | 7 | 1 项接受 cover；6 项非法参数（额外顶层属性、length 超上限、负 index、status 大小写、空 scan、range 只有 1 项）在 execute 前被拒 |
| 编码错误 | 5 | unknown field、page 越界、cover+length、stale view、missing record → throw → isError |
| 权限钩子 | 1 | beforeToolCall 在 execute 前 block |
| 预 abort | 1 | 已 abort 的 signal 返回 Operation aborted |
| 部分成功 | 1 | coverMax=20,000 返回 20,000 正文 + next + isError:true |
| 工具层并发 | 1 | 两个 runToolCall 并发都完成 |
| 扩展侧预算 | 1 | 第 4 次调用抛 budget_exhausted |
| allowlist | 1 | getActiveToolNames() = ["context_index"] |
| 系统提示词 | 1 | promptSnippet 与 promptGuideline 进入系统提示词 |
| hidden | 1 | hidden 工具不活跃；setActiveToolsByName 不能按名激活 |
| details 无正文 | 1 | details 只含 viewId/action/refs/spans/costChars |
| 模型闭环 | 3 | N1 一次 T6 运行（read/scan 管线）；N2 逐字 cover 端到端；N3 field_missing 回送模型 |

**N1 是 1 次管线运行**：模型发结构化 tool_call，宿主执行并回送 5 个工具结果；本次使用 read/scan，没有调用 cover；details 无正文。本次运行答案是 record_changelog=true；答案理由不在包内，不能作为有据或隐藏覆盖证据。因此 N1 只证明链路成立，不证明 cover 触发、正确性或隐藏覆盖，也不是条件比较，不与 105 条 JSON 臂合并计分。cover 的端到端由 N2 逐字验证（37,615 chars）。

## 6. 已验证与未验证

| 层 | 已验证 | 未验证 |
|---|---|---|
| schema | TypeBox 参数、6 类非法参数在 execute 前拒绝 | 与 Pi 1.0.0 的行为对照 |
| 错误传播 | throw → isError:true；5 类编码错误；beforeToolCall；预 abort | 运行中取消；宿主吞错/改写 |
| 结果 | content 文本、details 无正文、部分 cover 的 isError+next | TUI/HTML 渲染、日志 |
| 并发/预算 | 工具层两个 runToolCall 并发；扩展侧第 4 次 budget_exhausted | 同一 assistant 消息的宿主调度并行 |
| exposure | hidden 不活跃且不能按名激活 | 真实 UI 的撤回体验 |
| 模型 | 1 次结构化调用闭环（N1） | 运行中取消、权限扩展端到端、scope:"all" 确认、fork/context edit、100 次压缩、托管 provider、跨模型 |
| 端点 | 本机 OpenAI 兼容 DeepSeek 替身 | 真实托管 DeepSeek provider |

**24/24 不等于“真实宿主完整验证”**：宿主运行时是真的，模型端点是替身；权限扩展、TUI、fork、取消、调度并行、100 次压缩都未闭环。

## 7. 评审时如何使用这些事实

1. 判断设计是否把宿主事实写进契约，而不是只写在实现里：hidden 不能按名恢复、没有内建 per-turn 预算、annotations 不是权限、details 不是模型输入。
2. 判断“已验证”的措辞是否越界：设计说“in-process SDK 的主要环节”，不说“真实 CLI/托管 provider 已验证”。
3. 判断窗口/示例是否被当成能力差异：native schema 的 length 上界与文本替身示例窗口不同；设计明确说“协议/示例是行为变量，不是模型能力”。
4. 判断 1 次 N1 是否被当成行为结论：设计明确标注“1 次管线证据，不与条件臂合并”。

## 8. 源码位置

- **research/prototype/host-pi.mjs**：完整探针（注册、schema、错误、权限、部分、并发、预算、hidden、N1/N2/N3）。
- **research/prototype/out/host-checks.json**：24 项精简结果（无回答/正文）。
- **design §7.4 / §12.9 / §14 风险 13、18**：宿主契约与边界。
- **REVIEWER_GUIDE.md §3、§8**：给非 Pi 读者的摘要与常见误读。
