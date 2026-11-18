# dsh-dynamic-model-identity 使用说明

> 更新：2026-11-18。本版本包含一次严重故障的修复（见 §7 故障排查），**修改代码后必须重启 DSH 才会加载新的 Host 模块**。

## 1. 这个插件做什么

DSH 出厂时在每条 System Prompt 的 `-1000` 位固定写入开场白 `You are an AI agent powered by DeepSeek Harness.`。本插件在每次提示词装配时读取**当前这一步实际使用的 Provider/Model**（来自 `context.modelSelection`，每步捕获、随切换即时生效），在本地规则库中查表，把开场白替换为该模型官方 Agent 平台的身份，例如：

| 模型 | 替换后的开场白 |
|---|---|
| GLM / Z.AI 系列 | `You are an AI agent powered by Zcode.` |
| GPT / Codex 系列 | `You are an AI agent powered by OpenAI Codex.` |
| Claude 系列 | `You are an AI agent powered by Claude Code.` |
| Gemini 系列 | `You are an AI agent powered by Google Gemini CLI.` |
| Qwen 系列 | `You are an AI agent powered by Qwen Code.` |
| Kimi 系列 | `You are an AI agent powered by Kimi Code.` |
| DeepSeek 系列 | 不变（出厂开场白） |
| 未知 / 本地模型 | 不变（中性回退） |

特点：

- 主 Agent、子 Agent（Subagent）、恢复的会话、Workflow 子任务全部生效；
- 切换模型后下一步自动生效，无需重启；
- 全程本地判断，无网络请求；
- 不使用 `complete: true`、不监听 `system-prompt/assemble`，其他插件的 Section、工具 Schema 均不受影响；
- 不修改 DSH 核心源码、profile patch 或 `node_modules`。

## 2. 安装 / 启用

**从 GitHub（任意终端一键安装）**：

```sh
dsh plugin --profile web add "github:scorpio0v0/dsh-dynamic-model-identity"
```

（可加 `#v1.1.0` 之类后缀固定版本；GUI 里则是在 **Plugins → Add plugin** 中粘贴同样的规格。）

**本地开发安装**：

```sh
dsh plugin --profile web add "file:/path/to/dsh-dynamic-model-identity"
```

> `file:`/`link:` 本地安装时，若设置页一直不出现，请把环境变量 `DSH_INSTALL_DIR` 指向某个 DSH 检出的 `apps/cli` 目录（让设置 schema 能解析 `@deepseek-ai/schemastery`）；git 安装会经由 profile 依赖图自动解析，无需设置。

**注意：Host 端代码的装载发生在 DSH 进程启动时。新安装可经 HMR 生效，但替换已安装版本的代码后必须重启 DSH**（托盘退出后重新启动，或用 CLI 重新拉起）。不重启时旧模块仍在运行。

## 3. 设置页在哪

打开 **Plugins（插件页）→ 已安装列表 → 点击 `@local/dsh-dynamic-model-identity` 进入该 bundle 的详情页**，配置卡片位于详情页描述与行列表之间，包含：

- 总开关（ON/OFF 徽标 + 复选框）；
- 当前默认 Provider / Model 预览、据此推算的 Harness、生效 Identity、命中的规则 ID；
- 自定义 Identity 模板（`{{harness}}` 会被替换为命中的 Harness 名）；
- 用户映射规则（JSON 文本框 + 保存 / 导入 / 导出 / 恢复默认）。

预览说明：卡片预览用的是**默认**模型选择；单个会话可能覆盖默认选择。权威身份由 Host 在每步装配时解析。

## 4. 配置字段

可在设置页改，也可写在 `cordis.patch.yml`：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关；关闭时出厂身份原样保留 |
| `fallbackIdentity` | `You are an AI agent powered by DeepSeek Harness.` | 无规则命中时使用 |
| `identityTemplate` | `''` | 可选模板；含 `{{harness}}` 时按命中规则的 Harness 插值 |
| `userMappingsJson` | `''` | 用户规则，JSON 数组或 `{ "rules": [...] }` |

所有字段都是 volatile：设置页保存后**下一步装配立即生效**，无需重启。

## 5. 用户映射规则

规则字段：`id`（必填）、`identity`（必填）、`harness`、`modelPatterns`、`providerPatterns`、`match`（`model` / `provider` / `model-and-provider`）、`enabled`、`priority`。

- 按 `id` 合并：与内置规则同 `id` 即覆盖；`enabled: false` 即禁用该 id。
- 匹配不区分大小写；`*` 匹配任意序列（含 `/`）；无 `*` 的 pattern 为全串精确匹配。
- 冲突消解：priority 高者优先 → match 模式（`model-and-provider` > `model` > `provider`）→ pattern 具体度 → id 字典序。内置规则占 10–100，**用户覆盖请用 200+**。

示例：

```json
{
  "rules": [
    {
      "id": "my-glm",
      "harness": "My Zcode",
      "identity": "You are an AI agent powered by My Zcode.",
      "modelPatterns": ["*glm*", "zcode/*"],
      "providerPatterns": [],
      "match": "model",
      "enabled": true,
      "priority": 300
    }
  ]
}
```

非法 JSON 会被忽略（只用内置规则），不会阻断提示词装配。

### 5.1 WorkBuddy 路由的默认身份（v1.2.0 起）

自 v1.2.0 起，内置规则 `workbuddy-model-any-provider`（priority 96）把**所有 `workbuddy/` 前缀的路由**——`workbuddy/hy4flash-free`、`workbuddy/deepseek-*`、`workbuddy/glm-*`、`workbuddy/kimi-*`——以及裸 `hy4flash*`/`hunyuan*` 模型，统一判定为：

```
You are an AI agent powered by WorkBuddy.
```

该规则优先级高于厂商模型规则（DeepSeek 94 / Zcode 96 平手靠 pattern 具体度 / Kimi 80），所以 `workbuddy/deepseek-*` 不再落到 DeepSeek Harness。未带 `workbuddy/` 前缀的厂商模型不受影响（`deepseek-chat` → DeepSeek Harness、`zcode/GLM-*` → Zcode）。

想让某条 workbuddy 路由恢复厂商身份：加一条 priority ≥ 300 的用户规则，例如把 `workbuddy/deepseek-*` 判回 DeepSeek Harness：

```json
{
  "rules": [
    {
      "id": "workbuddy-deepseek-vendor",
      "harness": "DeepSeek Harness",
      "identity": "You are an AI agent powered by DeepSeek Harness.",
      "modelPatterns": ["workbuddy/deepseek-*"],
      "providerPatterns": [],
      "match": "model",
      "enabled": true,
      "priority": 300
    }
  ]
}
```

### 5.1.1 想改默认规则，改哪个文件？

两层，按意图选：

| 层 | 位置 | 生效方式 | 适用场景 |
|---|---|---|---|
| **用户规则（推荐）** | 设置页"用户映射规则"文本框，或 `cordis.patch.yml` 里插件行的 `userMappingsJson` 字段 | 下一次装配即生效，无需重启；插件升级不受影响 | 个人映射、覆盖某条内置规则 |
| **内置规则库** | 插件目录下的 [src/data/provider-mappings.json](src/data/provider-mappings.json)（每条规则一个 JSON 对象） | `link:` 安装：重启 DSH；git 安装：重跑安装命令或走 Plugins 更新流程 | 想直接改插件出厂默认值（相当于 fork） |

内置规则库共 33 条：21 条启用（v1.2.0 把原中性规则升级为 WorkBuddy 正向规则）+ 12 条默认关闭的模板。

### 5.2 匹配机制速查

- **匹配对象**：模型 ID 与 Provider ID 两列，不区分大小写；`*` 匹配任意字符序列（含 `/`）；不含 `*` 的 pattern 是全串精确匹配（`anthropic` 不会命中 `magpie-anthropic`）。
- **胜负判定**（得分高者胜）：① priority 大者优先；② 匹配模式 `model-and-provider` > `model` > `provider`；③ pattern 具体度（非 `*` 字符多者优先）；④ id 字典序。
- **内置规则**：priority 10–100（GLM 100 / DeepSeek 95-94 / GPT 93-90 / Claude 93-90 / Gemini 89-88 / Qwen 82 / Kimi 80 / provider 兜底 70-54 / Hunyuan 中性 40）。
- **用户规则**：建议 priority ≥ 200；相同 id 覆盖内置；`enabled:false` 按 id 禁用。
- **回退**：无规则命中或命中中性规则 → 出厂开场白。
- 设置页"规则是怎么匹配的"区域可直接查看以上说明与全部内置规则清单（点击展开）。

### 5.3 runtime context 段落也跟着换（adaptRuntimeContexts）

系统提示词末尾还有两段固定文案来自 `@deepseek-ai/dsh-harness-dev-context`：checkout 引导段（"The runtime context names the DeepSeek Harness implementation checkout..."）和 Web GUI 引导段（"You are interacting with the user through the DeepSeek Harness Web GUI..."）。插件默认（`adaptRuntimeContexts: true`）通过受保护的 `system-prompt/assemble` waterfall 监听，把这两段（以及 `Current DeepSeek Harness implementation checkout: ...` / `Current DeepSeek Harness Web GUI URL: ...` 两个值段、旧会话回放的 legacy 段落）里的 `DeepSeek Harness` 与独立词 `DSH` 替换为当步命中的 Harness 标签。

- 不动的东西：checkout 路径、GUI URL 原样保留；`pnpm run dev:web`、`dsh web`、`window.__DSH_BOOT__` 等命令字样（大小写与词边界隔离）不会被误替换。
- 语义须知：替换只是**品牌一致性**——checkout 实际仍是 DSH 源码树、GUI 仍是 DSH 的 Web 应用。换名后模型对"这是谁家的运行环境"的认知与开场白一致，但对"这套源码是谁的实现"的认知变得名义化。设置页有开关可随时关闭。
- 每步按当次 modelSelection 实时替换；监听器全程 try/catch，任何异常都退回未修改的 presentation，不会影响会话创建。

## 6. 回滚 / 卸载

- 临时停用：设置页取消勾选，或 Plugins 里把行开关关掉。
- 彻底移除：

```sh
dsh plugin --profile web remove @local/dsh-dynamic-model-identity
```

下一次模型装配即恢复 DSH 出厂 `harness:identity`。插件从不修改核心文件，卸载即完全回滚。

## 7. 故障排查记录（2026-11-18 事故）

**现象**：插件经 HMR 激活后，新建会话报错

```
navigation.ts:166 new session failed: SessionCreateError: session create failed:
gateway/internal: failed to create session: Error: cannot get property "systemPrompt" without inject
```

所有现存会话在对话框提示"会话不可用"，且 Plugins 页看不到任何设置入口。

**根因（两处，互不相干）**：

1. **会话全挂**：`index.js` 声明了 `export const inject = []`。cordis 规定：上下文属性方式访问服务（`ctx.systemPrompt`）必须在插件声明的 `inject` 里列出该服务，否则抛 `cannot get property "systemPrompt" without inject`。插件在 `agent/created` 监听器里访问了 `ctx.systemPrompt.getSectionOrder(...)`，于是**每一次 Agent 创建都失败**；`agent/created` 是串行监听，监听器抛错即 Agent 创建失败并触发 `agent/disposed` → 会话创建失败 → 全部会话不可用。内置 30 个测试没有拦住它，因为集成测试是手工在 fixture 里注册 section（且 fixture 声明了 inject），没有走真实 `apply()` → `agent/created` → Agent 创建链路；`plugin_manager install_bundle` 的验收（`fiberPhase: active`）只证明插件启动成功，不证明 Agent 能创建。
2. **设置页不见**：卡片注册到了 `plugins.item` 槽位，而该槽位按 DSH 槽位契约**保留给官方插件**（"a bundle's configuration belongs in `plugins.bundle.config` or `plugins.row.config` instead"），bundle 的配置卡应注册到**按包名索引**的 `plugins.bundle.config`；同时插件又用 `settings.configure({ auto: false })` 关掉了自动生成的设置页——两边叠加，设置入口彻底消失。

**修复**（3 处，均已回测 30/30 通过）：

1. `index.js`：`inject` 由 `[]` 改为 `['systemPrompt']`；
2. `client.js`：设置卡改注册到 `plugins.bundle.config`（key = 包名），与正常工作的 modsearch 插件同款写法；
3. `cordis.patch.yml`：`fallbackIdentity` 默认值去掉多余逗号，与 DSH 出厂开场白逐字节一致。

**恢复步骤**：重启 DSH（托盘退出 → 重新启动）。重启后新模块装载，会话创建恢复正常；此前中断的会话历史都在，可正常继续。

**经验教训**：凡是属性方式访问 DSH 服务（`ctx.xxx`），一律要在插件 `inject` 里声明；判断"插件是否真的能工作"要看一次真实会话往返，`fiberPhase: active` 不算数。

### 7.1 事故二：修复后 bundle 详情页仍没有配置卡片（2026-11-18 晚）

**现象**：重启后会话恢复，但 Plugins → 该 bundle 详情页看不到配置卡片。

**根因**：故障期间曾在 Plugins 界面把插件**禁用**过。DSH 的禁用语义（`boot/plugin-manager/src/index.ts:1294`、`patch.ts:74`）是两层落盘：

1. profile `package.json` 的 `dsh.profile.bundles` 列表**移除**该 bundle → 下次启动整个 bundle（Host 端与 Client 端模块）都不装载；
2. 用户 `cordis.patch.yml` 追加 `- id: dynamic-model-identity / disabled: true`。

bundle 未装载 → client 模块不在模块图里 → 没有任何东西注册 `plugins.bundle.config` 槽位 → 详情页的 `configured` 门槛为 false，配置区整段不渲染。用 `dsh --profile web --dump-config` 离线组合可见：其他 bundle 层都在，唯独缺本 bundle 的层（当时也顺带解释了会话恢复——被禁用的坏插件压根没启动）。

**恢复**：Plugins → 找到 `@local/dsh-dynamic-model-identity` → 打开启用开关 → 重启 DSH。启用会自动回写 bundles 列表并移除 disabled 行。

**注意**：配置卡片位于 **bundle 详情页内**（描述与行列表之间的配置区），不在 Plugins 列表页，也不在 Settings 页。若启用后仍看不到卡片，按 F12 看 Console 是否有 `dynamic-model-identity` / `plugins.bundle.config` 相关报错。

### 7.2 事故三：卡片区域出现后仍空白，Console 报 `selector is not a function`（2026-11-19）

**现象**：重新启用后，卡片槽位成功注册并开始渲染，但立即崩溃回收（`slot entry crashed in 'plugins.bundle.config'`），区域空白。

**根因**：槽位系统为 `inject().hooks` 里的每个源生成 `use<Name>` Hook，其签名为 `useSelector(sel)`（`ui-renderer/src/client/bind.ts`，**selector 是必填参数**，无默认值）。插件 Page 组件以无参形式调用 `props.useForm()` / `props.useModelForm()`，`undefined` 一路传进 `useSyncExternalStoreWithSelector` 即抛 `TypeError: selector is not a function`。槽位条目崩溃后按框架设计被隔离回收（其余界面不受影响），于是表现为"卡片区域消失"。

**修复**：`client.js` 中改为 `props.useForm(snapshot)` / `props.useModelForm(snapshot)`，传入恒等 selector——返回整个 `ConfigFormSnapshot`，其 `.value` 即各配置字段。

**恢复**：client.js 修改后，运行中的 Host 有 HMR watcher 感知文件变更；刷新一次工作区页面即可。若仍见旧报错，重启 DSH 再刷新。

## 8. 已知限制

- 设置页预览用默认模型选择；会话级覆盖以每步实际装配为准。
- 身份文本变化会使 System Prompt 前缀缓存失效（换模型时本就如此）。
- 若其他插件也在同一 Agent 作用域遮蔽 `harness:identity`，会相互覆盖/冲突；当前 profile 未发现。
- 部署若配置 `includeHarnessIdentity: false` 且本插件启用，身份段由本插件提供（无命中时为标准开场白）。
- 客户端设置页未在真实浏览器里做过完整回归（本次修复后建议打开一次确认卡片渲染）。
