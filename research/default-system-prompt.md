# DSH 默认 System Prompt 调查报告

> 调查时间：2026-11-17（Asia/Shanghai）
> 调查对象：当前工作区实际运行的 DSH，而非记忆中的通用版本。
> 所有结论均标注源码路径；关键结果通过 DSH 自身的 Prompt Assembly API 实测获得。

---

## 0. 结论速览

| 问题 | 结论 |
|---|---|
| 默认 System Prompt 存放在哪里？ | 不是单一文件。由 `@deepseek-ai/dsh-system-prompt` 插件的服务在运行时装配；固定开场白硬编码在 `packages/core/system-prompt/src/index.ts:460`。 |
| 默认 Harness Identity 是什么？ | **`You are an AI agent powered by DeepSeek Harness.`**（`agent` 后没有逗号；任务描述里举例的 `You are an AI agent.` 是简化写法）。已通过源码字节校验（字符 19 为空格 32，不是逗号 44）。 |
| 默认提示词由哪些模块组成？ | `dsh-system-prompt`（身份 + persona + 顺序框架）、`dsh-agent-loop`（`provider`/`model` 变量）、各工具插件（`tool:*` section）、上下文插件（`*`、`deployment:persona-suffix`）、Web 表层插件等。 |
| 排序规则？ | 按 `order` 升序，相同 `order` 按 section 名称的 code-unit 顺序； centrally allocated order 见 `SECTION_ORDERS`。 |
| 何时装配？ | 每个 step 开始前，在 `Agent.preStep()` 中调用一次 `systemPrompt.assemble(...)`（`agent.ts:300`）。 |
| 请求发送前还会改吗？ | 提示词文本在 `preStep` 中由 `renderPrompt(assembly)` 确定；请求发送前只通过 `refreshContext()` 刷新**运行时上下文**（user-role 快照），不再改 section 文本。重试使用同一个已装配的 `decision.selection`。 |
| 模型选择信息在哪里产生？ | `AgentModel.current()`（`core/agent/src/model-selection.ts:106`）读取 durable projection（`pending ?? lastUsed`），回退到 `AgentOptions.provider/model`；选择由 `model/selection` session 事件记录。 |
| 插件能否获得实时模型信息？ | **能**。`assemble()` 的 `AssembleContext` 被声明合并扩展了 `agent` 和 `modelSelection` 字段（`core/agent/src/runtime-types.ts:18-25`），section 的 `text(context)` 回调每次装配都能读到 `context.modelSelection`。这是本项目推荐接入点。 |

---

## 1. 工作区与运行环境

### 1.1 路径与版本

| 项目 | 值 | 来源 |
|---|---|---|
| 当前工作目录 | `D:\deepseek-harness` | 会话上下文 |
| DSH 安装根目录 | `D:\deepseek-harness\deepseek-harness` | `DSH_INSTALL_DIR` = `...\apps\cli`，向上验证为 source checkout |
| CLI 包 | `@deepseek-ai/dsh` | `apps/cli/package.json:2` |
| DSH 版本 | **0.2.2-rc.3** | `apps/cli/package.json:4`、`package.json:3` |
| 根包 | `@deepseek-ai/dsh-root` | `package.json:2` |
| Node.js | **v26.13.0** | `node --version` |
| pnpm | **11.28.5** | `pnpm --version`（与 `packageManager` 字段一致） |
| npm | 12.2.2 | `npm --version` |
| 当前 Profile | **web** | `$env:DSH_PROFILE` |
| Profile 目录 | `C:\Users\Scorpio\.dsh\profiles\web` | `$env:DSH_PROFILE_DIR` |
| DSH_HOME | `C:\Users\Scorpio\.dsh` | `$env:DSH_HOME` |
| Web GUI | `http://127.0.0.1:3080` | 会话上下文 |

验证为 **source checkout**（非 npm 安装包、非 Desktop ASAR）：根目录存在 `pnpm-workspace.yaml`、`package.json`（`@deepseek-ai/dsh-root`）、`apps/cli/package.json`（`@deepseek-ai/dsh`）；技能目录位于 `packages/preset/agent-preset/skills/dsh-doc`。

### 1.2 Profile 配置与插件加载机制

Profile 目录内容：

```
C:\Users\Scorpio\.dsh\profiles\web\
├── cordis.yml            # 空 entry list（注释说明：编辑 cordis.patch.yml）
├── cordis.patch.yml      # 用户 patch 层（最后应用，优先级最高）
├── package.json          # 依赖 + dsh.profile.bundles
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── node_modules\         # 仅 profile 安装的 bundle
├── .dsh-market\
└── .plugin-manager\
```

`package.json` 中的 bundle 层（按声明顺序应用）：

```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
dshmarket
@deepseek-ai/dsh-experimental-inspector-profile
dsh-context
@michengai/dsh-skills-manager
cc-safety-net
@liustack/modsearch
```

加载机制（来自 `dsh-doc` 的 `plugin-development.md` 与 `host-plugin.md`）：

- DSH 是 **all-plugin Cordis harness**。bundle 是一个 `package.json` 声明 `dsh.bundle.patch` 的包；YAML patch 用 `insert`/按 `id` 覆盖的方式插入 plugin entry。
- patch 会**替换目标 row 的整个 `config`**（`web-app/cordis.patch.yml:5-6` 明确说明）。
- 层顺序：各 bundle 的 patch → profile 的 `cordis.patch.yml` → `--patch` overlay。
- 插件两种导出形式：`export function apply(ctx, config)`（可选 `inject`/`Config`）或默认导出 Service 类；不可混用。
- 所有注册必须通过 `ctx.effect()` / `ctx.on()`，返回 disposer；插件卸载时释放。
- `plugin_manager install_bundle` 负责把本地目录装进 profile 并选中 bundle；不要手工写 profile 的 `package.json` 或 `cordis.patch.yml`。

### 1.3 当前模型与 Provider 配置

来自 `C:\Users\Scorpio\.dsh\profiles\web\cordis.patch.yml`：

```yaml
- id: agent-default-model
  config:
    provider: magpie
    model: workbuddy/hy4flash-free
    reasoningEffort: high
```

Provider 由 `llm-pi-ai` 插件配置（`cordis.patch.yml:33-157`）：

- `magpie`：OpenAI-compatible（`openai-completions`），`baseURL: http://127.0.0.1:3425/v1`，含模型 `workbuddy/hy4flash-free`、`workbuddy/deepseek-v4.1-flash`、`workbuddy/glm-5.3-flash`、`workbuddy/kimi-k3.1-pro`、`auto/glm-5.3-flash`。
- `magpie-anthropic`：Anthropic messages API，`baseURL: http://127.0.0.1:3425`，含模型 `zcode/GLM-5.3-Flash`、`zcode/GLM-5.2`、`zcode/GLM-5-Turbo`、`zcode/GLM-5.3` 等，显示名含 `· ZCode`。
- 子 Agent 允许的模型单独由 `subagent-model-selection-settings` 配置（`magpie-anthropic/zcode/GLM-5.3-Flash`）。

> 关键观察：**同一个 provider（`magpie`）承载多个厂商的模型**，因此映射判定必须以 model ID 为主、provider 为辅。

`agentDefaultModel` Host 服务提供 `currentSelection(): ModelSelection` 与 `async saveSelection(next)`（通过 `cordis_inspect_list`/`Service.listService` 实测确认），可用于 Settings 页面读取/切换当前模型。

---

## 2. 默认 System Prompt 的组成

### 2.1 固定身份定义

文件：`packages/core/system-prompt/src/index.ts`

```ts
// src/index.ts:456-462
if (config.includeHarnessIdentity ?? true) {
  this.section({
    name: 'harness:identity',
    order: this.getSectionOrder('HARNESS_IDENTITY'), // -1000
    text: 'You are an AI agent powered by DeepSeek Harness.',
  })
}
```

- section 名：`harness:identity`
- order：`SECTION_ORDERS.HARNESS_IDENTITY = -1000`（`src/index.ts:137`）
- 配置开关：`Config.includeHarnessIdentity`，默认 `true`（`src/index.ts:438`）；设为 `false` 只省略这一个 opener。
- 设计意图：注释写明 "Keep harness-owned openers independent of the selected loop plugin"（与具体 agent-loop 实现解耦）。

### 2.2 Persona 前缀与后缀

```ts
// src/index.ts:463-473
this.section({
  name: PERSONA_PREFIX_SECTION,            // 'deployment:persona-prefix'
  order: this.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'), // 0
  text: config.personaPrefix ?? '',
})
this.section({
  name: PERSONA_SUFFIX_SECTION,            // 'deployment:persona-suffix'
  order: this.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'), // 10200
  text: config.personaSuffix ?? '',
})
```

当前 web profile 覆盖（`packages/bundle/web-app/cordis.patch.yml:17-20`）：

```yaml
- id: system-prompt
  config:
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.
```

`{{model}}` 由 `dsh-agent-loop` 注册的变量提供（`agent-loop/src/index.ts:336-337`）：

```ts
ctx.systemPrompt.variable('provider', context => context.modelSelection?.provider ?? context.agent?.options.provider)
ctx.systemPrompt.variable('model', context => context.modelSelection?.model ?? context.agent?.options.model)
```

> 注意：这里的 `{{model}}` 插值已经具备“按当前模型变化”的能力，但它只出现在 persona 中；**harness identity 仍是硬编码字符串**。本项目正是要把同样的动态能力应用到 identity。

### 2.3 Section 顺序表

来源：`packages/core/system-prompt/src/index.ts:136-173`（`SECTION_ORDERS`）与 `:178-186`（`CONTEXT_ORDERS`）。

| order | section | 说明 |
|---:|---|---|
| -1000 | `harness:identity` | 固定开场白 |
| 0 | `deployment:persona-prefix` | 部署 persona（web profile 含 `{{model}}`） |
| 500 | plan policy | |
| 600 | team policy | |
| 800 | PTC only | |
| 900 | file reference | |
| 1000 / 1010 | tool:bash / tool:pwsh | |
| 1100 / 1200 / 1300 / 1350 | read / write / edit / apply_patch | |
| 1400 / 1500 | glob / grep | |
| 1600 / 1700 / 1710 | jobs / pty / pty panel | |
| 2000 / 2100 | web search / web fetch | |
| 2200 / 2300 | lsp / session query | |
| 2400 / 2500 / 2600 / 2700 | goal / schedule / workflow / ralph | |
| 2800 / 2900 / 3000 | subagent / report / computer use | |
| 3100 | MCP servers | |
| 5000 | tools SDK | 通用工具指导 |
| 9000 | deliverable file references | |
| 9900 | structured output | |
| 10000 | harness source | 环境信息后缀 |
| 10100 | web surface | |
| 10200 | `deployment:persona-suffix` | |

排序实现（`src/index.ts:254-257`）：

```ts
function comparePromptSections(a: PromptSection, b: PromptSection): number {
  return a.order - b.order || compareNames(a.name, b.name)
}
```

运行时上下文（user-role 快照）独立排序：`WORKING_DIRECTORY=100`、`SANDBOX_POLICY=110`、`APPROVAL_POLICY=115`、`SUBAGENT_DELEGATION=120`、`HARNESS_SOURCE=200`、`WEB_SURFACE=210`。

### 2.4 装配与渲染流水线

`src/index.ts:621-696` 的 `SystemPrompt.assemble(context)`：

1. 解析所有 prompt 变量（全局 → 作用域链，近者覆盖远者）；
2. 合并全局 + 作用域的 sections / contexts，同名作用域段遮蔽全局段；
3. 收集 tool schema providers，按 `toolOrder` 规范化；
4. section 的 `text` 在此刻求值：`typeof section.text === 'function' ? section.text(context) : section.text`（`:669`）；
5. 按 order/name 排序；检测多个 `complete: true` 段（>1 抛错）；
6. 运行 `system-prompt/assemble` waterfall（`:684-687`）；
7. 若有 effective `complete` 段，则恢复为唯一 prompt section；
8. 应用 runtime-context suppressor。

`renderPrompt(assembly)`（`:297-302`）：对每段做严格 `{{variable}}` 插值（未知/未定义引用会抛错）、丢弃空段、用空行拼接。

> `complete: true` 会接管整个系统提示词，且会覆盖其他插件贡献；本项目**不使用**该机制。

### 2.5 何时装配、请求前是否修改

调用链（`packages/core/agent-loop/src/agent.ts`）：

- `:294` `const selection = this.model.current()` —— 取当前（实时）模型选择；
- `:298` `tools.resolve({ agent, modelSelection: selection, signal })`；
- `:300` `systemPrompt.assemble({ ...assembleContextFor(this, signal), modelSelection: selection, toolSet })` —— **每个 step 一次**；
- `:302-312` `agent/pre-step` waterfall（section 已装配完毕）；
- `:448` `renderPrompt(assembly)` 得到最终文本；
- `:451` `prepareRequest(turn, step, decision.selection, signal)`；
- `:452-454` `refreshContext(assembly, { ...assembleContextFor(this, signal), modelSelection: decision.selection })` —— 只刷新运行时上下文，不改 section 文本；
- `:459-466` `systemPrompt.project(renderedPrompt, ...)` 并 append `system/message` 到 session；
- 渲染后的提示词作为**派生历史中的 system 角色消息**进入模型请求；loop request 与 `request/header` 不含独立 `system` 字段。

重试：`decision.selection` 在 preStep 捕获并跨重试保留（`runtime-types.ts:22` 注释 "captured step selection, retained across retries"），因此同一 step 的重试使用相同 identity，不会出现“重试时旧模型身份残留”。

---

## 3. 实测：通过 DSH Prompt Assembly API 获得最终提示词

由于 `pnpm dsh --profile web --dump-config` 在本会话受 Windows 沙箱的 `spawn EPERM`（esbuild 子进程管道）限制无法运行，改用 DSH 自带的 `@deepseek-ai/dsh-system-prompt` 构建产物直接调用官方 `assemble()` / `renderPrompt()` API（在 `apps/cli` 目录下运行，使用其链接好的 node_modules）：

```js
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
const ctx = new Context()
await ctx.plugin(SystemPrompt, {
  personaPrefix: 'You are a coding agent powered by the {{model}} model.',
  personaSuffix: '',
})
ctx.systemPrompt.variable('model', () => 'workbuddy/hy4flash-free')
ctx.systemPrompt.variable('provider', () => 'magpie')
const assembly = await ctx.systemPrompt.assemble()
console.log(renderPrompt(assembly))
```

实测输出（当前 web profile 的最小可复现系统提示词）：

```text
You are an AI agent powered by DeepSeek Harness.

You are a coding agent powered by the workbuddy/hy4flash-free model.
```

完整 profile 还会叠加各工具插件注入的 `tool:*` section（order 1000–9900）与 `harness source` / `web surface` 后缀（10000–10100）。仓库测试中给出的真实装配示例（`packages/core/agent-loop/tests/loop.spec.ts:548`）：

```text
You are an AI agent powered by DeepSeek Harness.

You are a test agent on mock.

Use the noop tool wisely.
```

### 3.1 结果分类

| 类别 | 内容 | 来源 |
|---|---|---|
| Harness Identity | `You are an AI agent powered by DeepSeek Harness.` | `system-prompt/src/index.ts:460` |
| Persona | `You are a coding agent powered by the {{model}} model.` → 插值当前 model | `web-app/cordis.patch.yml:19-20` + `agent-loop/src/index.ts:337` |
| Tool Guidance | `tool:*` sections，order 1000–9900，由各工具插件注册 | `SECTION_ORDERS` + 各 `packages/*/*/src/index.ts` |
| Runtime Context | user-role 快照（工作目录、沙箱策略、审批策略等），与 section 分离 | `CONTEXT_ORDERS`、`refreshContext()` |
| 其他插件 Section | `plan policy`、`team policy`、`MCP servers`、`deliverable file references` 等 | `SECTION_ORDERS` |
| 最终装配顺序 | 身份 → persona → 策略 → 工具指导 → SDK/结构化输出 → 环境后缀 | `comparePromptSections` |

---

## 4. 对插件开发的直接结论

1. **不要修改核心源码**，也不要改 `node_modules`。使用官方 `ctx.systemPrompt.section()`。
2. **不要使用 `complete: true`**：它会接管整条系统提示词并破坏其他插件贡献。
3. **不要监听 `system-prompt/assemble` 来加/删文本**（`dsh-doc/references/practices.md:17` 明确禁止）；用 section 注册。
4. **覆盖默认 identity 的官方方式**：section 名 `harness:identity` 在**agent 作用域**注册会遮蔽全局同名 section，从而不产生重复。这是 `ScopedLayers.merge` 的既定语义，也是 `PERSONA_PREFIX_SECTION` 用于预设覆盖的同一机制。
5. **动态读取模型**：section 的 `text(context)` 回调在每次 `assemble()` 时求值，`context.modelSelection` 即为本次 step 的实时选择；回退链为 `context.modelSelection?.provider ?? context.agent?.options.provider`（与内置变量一致）。
6. **覆盖所有 agent**：在 `agent/created`（serial 事件）中拿到 `agent.ctx` 注册 scoped section；按 `practices.md:19` 同时把 disposer 保存在插件自身的 effect 中，保证插件卸载时释放。
7. **避免变量插值失败**：identity section 直接返回最终文本即可，不需要注册新变量；若使用 `{{...}}` 必须确保所有变量已注册且有值。

---

## 5. 代码来源索引

| 主题 | 路径 |
|---|---|
| SystemPrompt 服务、装配、渲染 | `packages/core/system-prompt/src/index.ts` |
| 配置字段与默认值 | `packages/core/system-prompt/src/index.ts:264-286, 437-444` |
| 固定身份字符串 | `packages/core/system-prompt/src/index.ts:456-462` |
| Section/Context order 分配 | `packages/core/system-prompt/src/index.ts:136-189` |
| 装配 API 契约 | `packages/core/system-prompt/README.md:54-80, 100-118` |
| `provider`/`model` 变量注册 | `packages/core/agent-loop/src/index.ts:336-337` |
| 每 step 装配与请求准备 | `packages/core/agent-loop/src/agent.ts:289-319, 441-467` |
| AssembleContext 声明合并 | `packages/core/agent/src/runtime-types.ts:17-25` |
| `assembleContextFor()` | `packages/core/agent/src/dispatch.ts:167-176` |
| 模型选择 projection / AgentModel | `packages/core/agent/src/model-selection.ts:19-122` |
| Web profile persona | `packages/bundle/web-app/cordis.patch.yml:17-20` |
| 当前模型与 provider | `C:\Users\Scorpio\.dsh\profiles\web\cordis.patch.yml:8-12, 33-157` |
| 插件实践约束 | `packages/preset/agent-preset/skills/dsh-doc/references/practices.md` |
