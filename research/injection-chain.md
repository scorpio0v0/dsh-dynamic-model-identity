# DSH System Prompt 注入链路逆向分析

> 目标：确定“模型选择 → System Prompt 装配 → 模型请求”的完整真实链路，以及插件可安全接入的位置。
> 安装版本：`@deepseek-ai/dsh` 0.2.2-rc.3（source checkout：`D:\deepseek-harness\deepseek-harness`）。
> 所有结论来自源码追踪；关键事实均给出文件路径与行号。

---

## 1. 完整调用链

```mermaid
flowchart TD
  A[用户在 UI / 工具切换模型<br/>session-controller.selectModel] --> B[agent.model.select<br/>append model/selection 事件]
  B --> C[modelSelectionProjectionDefinition.apply<br/>pending = 新选择]
  C --> D[AgentModel.current()<br/>pending ?? lastUsed<br/>回退 AgentOptions.provider/model]

  D --> E[Agent.preStep]
  E --> F["const selection = this.model.current()<br/>agent.ts:294"]
  F --> G["tools.resolve({agent, modelSelection: selection})<br/>agent.ts:298"]
  G --> H["systemPrompt.assemble({<br/>  ...assembleContextFor(this), <br/>  modelSelection: selection, toolSet<br/>})<br/>agent.ts:300"]

  H --> I["SystemPrompt.assemble()<br/>system-prompt/src/index.ts:621"]
  I --> I1[解析变量 provider/model/modelSelection]
  I --> I2["section.text(context) 求值<br/>:669 —— 每次装配动态执行"]
  I --> I3[合并作用域层 + 排序 + complete 检测]
  I --> I4[waterfall system-prompt/assemble]
  I1 --> J["renderPrompt(assembly)<br/>agent.ts:448 → 严格插值 + 空段删除 + 空行拼接"]
  I2 --> J
  I3 --> J
  I4 --> J

  J --> K["systemPrompt.project() → append system/message<br/>agent.ts:459-466"]
  K --> L["prepareRequest → 模型请求<br/>system 角色消息来自派生历史"]

  M[插件：agent/created 监听] --> N["agent.ctx.systemPrompt.section({<br/>  name: 'harness:identity',<br/>  text: context => resolve(context.modelSelection)<br/>})"]
  N -.作用域遮蔽全局同名段.-> I2
```

---

## 2. 链路各阶段详解

### 2.1 用户选择模型的入口

`packages/api/session-controller/src/commands.ts:166-194`：

```ts
async selectModel(request: SessionSelectModelRequest) {
  const agent = await this.resolveAgent(request.sessionId)
  ...
  const selected: AgentModelSelection = {
    provider: request.provider,
    model: request.model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort: brandString(...) }),
  }
  await this.ctx.llm.resolveCallConfig(selected)   // 先验证模型可用
  agent.model.select(selected)                     // 写入 Session 事件
  void this.ctx.agentDefaultModel.saveSelection(selected).catch(...)
  return { selected: { ...selected } }
}
```

另有 `packages/api/session-controller/src/index.ts:338` 在创建/恢复时调用 `agentDefaultModel.saveSelection(selection)`。

### 2.2 Model Selection 数据结构

`packages/core/agent/src/types.ts` / `runtime-types.ts`：

```ts
interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
}
```

Durable projection（`core/agent/src/model-selection.ts:19-24`）：

```ts
interface ModelSelectionProjectionState {
  readonly lastUsed: ModelSelection | null   // 最近一次已记录请求使用的选择
  readonly pending: ModelSelection | null    // 已记录但尚未被匹配请求消费的选择
}
```

fold 规则（`:78-86`）：

- `model/selection` 事件 → 更新 `pending`；
- `request/header` 事件 → `lastUsed = selectionOfHeader(...)`，若与 pending 相同则清空 pending。

Wire 视图（`:87-90`）：`{ lastUsed, next: pending ?? lastUsed }` —— 这就是 Client UI 显示“当前模型/下一个模型”的依据。

### 2.3 Provider 与 Model ID 的解析位置

**不在 System Prompt 插件中解析**，而是：

1. `llm` 适配层按 `provider` 找到 adapter，按 `model` 解析调用配置（`session-controller` 中 `ctx.llm.resolveCallConfig(selected)`）。
2. `AgentModel.current()`（`model-selection.ts:106-111`）把 projection 的选择转成 `{provider, model, reasoningEffort}`。
3. `assemble()` 的 context 只携带字符串 `provider`/`model`，由 Section 自行解释。

对本项目而言，`context.modelSelection.provider` 是 **route/API provider id**（如 `magpie`、`magpie-anthropic`），`context.modelSelection.model` 是 **provider 拥有的 model id**（如 `workbuddy/hy4flash-free`、`zcode/GLM-5.3-Flash`）。二者都不等于“模型厂商”。

### 2.4 Agent Loop 如何获得当前模型选择

`packages/core/agent-loop/src/agent.ts:289-303`：

```ts
private async preStep(target, position) {
  const signal = this.phase.abort.signal
  const claimed = this.inbox.claim(target, position.turn)
  const selection = this.model.current()        // ← 实时选择（每 step 重新读取）
  if (selection === undefined) throw ...
  const toolSet = await this.loopCtx.tools.resolve({ agent: this, modelSelection: selection, signal })
  const assembly = await this.loopCtx.systemPrompt.assemble({
    ...assembleContextFor(this, signal),
    modelSelection: selection,                  // ← 注入到 AssembleContext
    toolSet,
  })
  const decision = await this.dispatch.waterfall('agent/pre-step', {
    messages: claimed, ...position, signal, modelSelection: selection,
  }, ...)
  return { ...decision, assembly, selection, toolSet }
}
```

`assembleContextFor(agent, signal)`（`core/agent/src/dispatch.ts:174-176`）返回 `{ agent, scope: agent, signal? }`，因此 **scope 就是 agent 本身**，agent 作用域的 section 会参与该次装配。

`AssembleContext` 的声明合并（`core/agent/src/runtime-types.ts:18-25`）：

```ts
declare module '@deepseek-ai/dsh-system-prompt' {
  interface AssembleContext {
    agent?: Agent
    /** Captured step selection, retained across retries; ... */
    modelSelection?: Readonly<ModelSelection>
  }
}
```

> 这直接回答了“插件能否获得每次请求对应的实时模型信息”：**可以**，且是官方公开字段。

### 2.5 System Prompt 如何开始装配 / Section 如何注册

- 注册入口：`ctx.systemPrompt.section(section)` → `SystemPrompt.section()`（`system-prompt/src/index.ts:485-494`）。返回 `ctx.effect` 的 disposer；重复名称在同一层抛错。
- 作用域：`scope === agent` 的 section 遮蔽同名全局 section（`ScopedLayers.merge`，`src/index.ts:638`）。`PERSONA_PREFIX_SECTION` 注释（`:191-197`）明确说明预设靠同名 section 替换部署 persona 而非产生重复 —— 同一机制可用于 `harness:identity`。
- 动态求值：`src/index.ts:665-674`：

```ts
const sections = sectionDefinitions.map((section) => {
  const assembled = {
    name: section.name,
    text: typeof section.text === 'function' ? section.text(context) : section.text,
    ...
  }
  if (section.complete === true) completeSection = { ...assembled }
  return assembled
})
```

每次 `assemble()` 都重新调用 `text(context)`，因此把身份解析放在这里即可实现“切换模型后自动生效、无需重启”。

### 2.6 Section 排序

`comparePromptSections`（`src/index.ts:254-257`）：先按 `order` 数值升序，再按 `name` 的 code-unit 顺序。order 由 `SECTION_ORDERS`（`:136-173`）集中分配；外部插件可用任意有限数字，但应使用 `ctx.systemPrompt.getSectionOrder(name)` 取得仓库保留位置。

身份段 order = -1000（最早）。本项目替换的是**同名段**，order 天然保持一致，不会插入新位置。

### 2.7 `system-prompt/assemble` 执行

`src/index.ts:684-687`：

```ts
const transformed = await this.ctx.waterfall(
  scopeTarget(this, scope), 'system-prompt/assemble', assembly, context,
  () => Promise.resolve(assembly),
)
```

- 是 **waterfall**，监听器必须调用 `next()`；
- 按 scope 过滤分发；
- 可改写 `sections` / `contexts` / `variables`，但**不能改工具声明**；
- 若有 `complete: true` 段，waterfall 之后会恢复该段为唯一 prompt section（`:690-695`）。

**本项目不使用此事件**：`dsh-doc/references/practices.md:17` 明确要求“Do not listen to `system-prompt/assemble` to add or remove tools or text”，且 waterfall 改写会与其他插件的注册顺序耦合。

### 2.8 `renderPrompt` 与请求进入

- `renderPrompt(assembly)`（`src/index.ts:297-302`）严格插值 `{{变量}}`、过滤空段、以 `\n\n` 连接。
- `agent.ts:448` 在 `step()` 中调用；`:459-466` 通过 `systemPrompt.project()` 生成 `system/message` session 事件（surface node 0 或历史内更新）。
- `:452-454` 的 `refreshContext(assembly, {...modelSelection})` 只刷新运行时上下文（user-role 快照），不重新求值 section 文本。
- `README.md:142` 确认：“渲染后的提示词作为派生历史中的 system 角色消息到达模型；loop request 与 `request/header` 均不含单独 `system` 字段。”

### 2.9 模型切换后的实时更新机制

1. UI/工具调用 `selectModel` → `agent.model.select()` → append `model/selection`。
2. projection 更新 `pending`。
3. 下一个 `preStep` 中 `this.model.current()` 返回 `pending`；`decision.selection` 捕获它。
4. `assemble()` 再次执行，Section 的 `text(context)` 读到新 `context.modelSelection` → 新 identity。
5. 同一 step 内的重试复用 `decision.selection`（`runtime-types.ts:22` 注释），identity 保持稳定，不会回退到旧模型。

### 2.10 主 Agent / Subagent / Workflow Child

| 场景 | 创建路径 | `agent/created` 是否触发 | 结论 |
|---|---|---|---|
| 主 Agent | `agentLoop.create` / `agents.create` / restore | 是（`core/agent/src/index.ts:564` `ctx.serial(entry.carrier, 'agent/created', ...)`） | 覆盖 |
| Subagent | `subagent/manager.ts:859` `ownerCtx.agents.create({...})` | 是 | 覆盖 |
| Workflow Child | `workflow/workflow-ptc/src/host.ts:218` → `subagents.startActivation` → 上述 manager 路径 | 是 | 覆盖 |
| Resume 的 Agent | `agents.resume` → announce | 是（`source: 'resume'`） | 覆盖 |

因此“在 `agent/created` 中为每个 agent 注册 scoped section”可覆盖全部场景，并且每个子 Agent 使用自己的 `modelSelection`（子 Agent 可独立选模型），不会串味。

---

## 3. 插件接入位置（推荐方案）

### 3.1 推荐实现

```ts
export function apply(ctx: Context, config: Config): void {
  const disposers = new Map<Agent, () => void>()

  ctx.effect(() => {
    const offCreated = ctx.on('agent/created', ({ agent }) => {
      const agentCtx = agent.ctx
      const offSection = agentCtx.effect(() => agentCtx.systemPrompt.section({
        name: 'harness:identity',                 // 与全局同名 → 作用域遮蔽
        order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'), // -1000
        text: (context) => {
          const selection = context.modelSelection ?? (
            context.agent?.options.provider && context.agent.options.model
              ? { provider: context.agent.options.provider, model: context.agent.options.model }
              : undefined
          )
          return resolveIdentity(selection, config)   // 本地映射，无网络
        },
        interpolate: false,                        // 文本已是最终值，避免严格插值失败
      }))
      disposers.set(agent, offSection)
    })

    return () => {
      offCreated()
      for (const off of disposers.values()) off()
      disposers.clear()
    }
  })
}
```

要点：

1. **同名遮蔽而非 `complete: true`**：不产生重复身份，不破坏其他 section。
2. **`text(context)` 读取实时 modelSelection**：每次装配重新解析。
3. **注册在 `agent.ctx`**：随 agent 销毁自动释放；同时在插件 effect 中保留 disposer，满足 `practices.md:19` 的双重所有权要求。
4. **`interpolate: false`**：身份文本由插件自行生成，不引入新变量，避免未注册变量导致装配失败。
5. **中性回退**：无法识别时返回 `You are an AI agent powered by DeepSeek Harness.`，或按配置的 `fallbackIdentity`。

### 3.2 为什么不用其他机制

| 机制 | 不采用原因 |
|---|---|
| 修改 `system-prompt` 配置 `includeHarnessIdentity: false` | 需要改 profile patch，是全局且静态的；插件禁用后会缺失身份；不满足“按模型动态”。 |
| `system-prompt/assemble` waterfall | `practices.md` 禁止用它加/删文本；与其他插件顺序耦合；需自行保护其他 section。 |
| `complete: true` section | 接管整个提示词，必然破坏其他插件贡献。 |
| 注册新名字的 section | 会与原 `harness:identity` 并存 → **重复 Harness Identity**，违反验收要求。 |
| `agent/request` / `agent/pre-step` 改写 | 前者不能改消息；后者只改 step 决策，此时 assembly 已完成；没有必要。 |
| 启动时读一次配置 | 违反“切换模型自动生效”；必须用每 step 的 `context.modelSelection`。 |

---

## 4. 数据结构与关键符号索引

| 符号 | 路径 | 作用 |
|---|---|---|
| `ModelSelection` | `core/agent/src/types.ts` | `{provider, model, reasoningEffort?}` |
| `ModelSelectionProjectionState` | `core/agent/src/model-selection.ts:19` | `{lastUsed, pending}` |
| `modelSelectionProjectionDefinition` | `core/agent/src/model-selection.ts:73` | session 投影 fold + wire view |
| `AgentModel.current()/select()` | `core/agent/src/model-selection.ts:99-122` | 实时选择读写 |
| `AssembleContext` 扩展 | `core/agent/src/runtime-types.ts:18-25` | `agent` + `modelSelection` 对插件可见 |
| `assembleContextFor()` | `core/agent/src/dispatch.ts:174` | 组装 `{agent, scope: agent, signal}` |
| `Agent.preStep()` | `core/agent-loop/src/agent.ts:289` | 捕获 selection、装配 prompt |
| `SystemPrompt.assemble()` | `core/system-prompt/src/index.ts:621` | 注册表 + waterfall |
| `section.text(context)` 求值 | `core/system-prompt/src/index.ts:669` | 动态身份注入点 |
| `renderPrompt()` | `core/system-prompt/src/index.ts:297` | 严格插值 + 拼接 |
| `agent/created` 派发 | `core/agent/src/index.ts:564` | 每 agent 注册 scoped section 的入口 |
| `selectModel` 命令 | `api/session-controller/src/commands.ts:166` | 模型切换入口 |
| `agentDefaultModel` 服务 | Inspect `Service.listService` 实测 | `currentSelection()` / `saveSelection()` |

---

## 5. 兼容性与风险

1. **重复注册**：同一插件实例被 Cordis 重复挂载时，`harness:identity` 在同一 agent 作用域重复会抛错；需保证 `agent/created` 监听器只在插件 apply 时注册一次，并用 Map 按 agent 去重。
2. **插件卸载**：`agent.ctx` 的注册不随插件卸载自动销毁；必须在插件 effect 的 cleanup 中逐个调用 disposer。
3. **HMR**：bundle 更新会生成新的 JS module generation；重新激活时若旧 disposer 未释放，会残留 section。测试需覆盖 dispose fiber 后 section 消失。
4. **`includeHarnessIdentity: false` 的部署**：此时全局没有 `harness:identity`，我们的 scoped section 会成为唯一身份来源 —— 这正是期望行为（插件接管身份）；若插件被禁用，则回到该部署的原状。
5. **其他插件也遮蔽 `harness:identity`**：若多个插件在同一 agent 作用域注册同名 section，后者会覆盖前者（或抛错，取决于实现）。文档需在“已知限制”中说明。
6. **模型信息缺失**：`context.modelSelection` 可能 absent（诊断装配）。此时回退到 `agent.options`，再回退到中性默认身份；绝不抛错阻断装配。
7. **同一 provider 多厂商模型**（实测 `magpie`）：必须以 model 为主键判断；provider 只在 model 无法判断时作为次要信号，且默认不得改变身份。
8. **工具/Agent Loop 不受影响**：本插件只替换一个 section 的文本，不改工具 schema、不改 `agent/pre-step` 决策、不注册变量，因此不会影响工具调用或 loop 行为。
9. **KV cache**：身份文本变化会改变提示词前缀，符合预期；切换模型本就应使缓存失效。

---

## 6. 注入点一句话总结

> **在 `agent/created` 中为每个 Agent 的 `agent.ctx` 注册一个名为 `harness:identity`、order 为 `-1000`、`interpolate: false` 的 section；其 `text(context)` 每次装配时读取 `context.modelSelection`，用本地映射数据库解析出对应 Harness Identity。**
