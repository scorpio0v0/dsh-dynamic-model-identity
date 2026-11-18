# dsh-dynamic-model-identity

[English](README.md) | 简体中文

一个 DSH 插件：让系统提示词中的 Harness 身份与"当前这一步真正在服务的模型"保持一致。

DSH 出厂时在提示词顺序 `-1000` 处固定写入开场白 `You are an AI agent powered by DeepSeek Harness.`。选择 GLM 模型时，本插件把开场白换成 `You are an AI agent powered by Zcode.`；GPT 系列换成 `You are an AI agent powered by OpenAI Codex.`，依此类推。判定在每次提示词装配时本地完成，数据来源是实时的 `context.modelSelection`。

## 环境要求

- DSH 0.2.2-rc.3 或兼容版本（Node >= 24.9）
- `web` profile（或任何挂载了 `dsh-system-prompt` 与 `dsh-agent-loop` 的 profile）

## 安装

DSH GUI：**Plugins → Add plugin**，粘贴仓库规格，然后启用 **Dynamic model identity**。仓库发布后，任意终端一键安装：

```sh
dsh plugin --profile web add "github:scorpio0v0/dsh-dynamic-model-identity"
```

在末尾追加 `#v1.2.0` 可固定到某个标签或提交。拥有 `plugin_manager` 工具的 Agent 也可以用同样的规格安装：

```
plugin_manager(action="install_bundle", target="github:scorpio0v0/dsh-dynamic-model-identity")
```

本地开发时改为从目录安装：

```sh
dsh plugin --profile web add "file:/path/to/dsh-dynamic-model-identity"
```

安装后确认插件行处于启用状态。新安装的 bundle 可以经 HMR 直接激活；替换已安装版本的代码则需要重启 DSH 才会装载新模块代际。

> 本地 `file:`/`link:` 安装可能需要把 `DSH_INSTALL_DIR` 指向某个 DSH 检出的 `apps/cli` 目录，设置 schema 才能解析 `@deepseek-ai/schemastery`；git 安装会经由 profile 依赖图自动解析，无需设置。

## 卸载

- GUI：**Plugins → Dynamic model identity → Remove**（或只关闭行开关：保留文件但停止生效）。
- CLI：

```sh
dsh plugin --profile web remove @local/dsh-dynamic-model-identity
```

禁用或移除后，下一次提示词装配即恢复 DSH 出厂身份。本插件不修改任何核心文件或 profile patch。

## 配置

打开 **Plugins → Dynamic model identity**：总开关、当前默认 Provider/Model、识别到的 Harness、生效 Identity、命中的规则、自定义 Identity 模板、用户映射规则、导入/导出与恢复默认。

字段（也可写在 `cordis.patch.yml`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关。 |
| `fallbackIdentity` | `You are an AI agent powered by DeepSeek Harness.` | 无规则命中时使用。 |
| `identityTemplate` | `''` | 可选模板；`{{harness}}` 展开为命中的 Harness 名。 |
| `userMappingsJson` | `''` | JSON 数组或 `{ "rules": [...] }`。 |
| `adaptRuntimeContexts` | `true` | 同时把 `harness:source` 与 `app:web-surface` 两段 runtime context 里的 `DeepSeek Harness` / 独立词 `DSH` 替换为命中的 Harness。路径、URL 与命令字样（`dsh web`、`__DSH_BOOT__`）保持原样。注意：checkout 与 Web GUI 实际仍由 DSH 提供——替换只是让品牌与开场白声称的身份一致，不代表服务软件变了。 |

用户规则示例：

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

规则按 `id` 合并：用户规则与内置规则同 `id` 即覆盖；`enabled: false` 表示按 id 禁用。内置规则占用 priority 10–100，用户覆盖请用 200 以上。匹配不区分大小写，`*` 匹配任意字符序列（含 `/`），不含 `*` 的 pattern 为全串精确匹配。冲突消解顺序：priority、匹配模式（`model-and-provider` > `model` > `provider`）、pattern 具体度、id。

### 修改内置规则

两层，按意图选择：

- **推荐——用户规则覆盖**（上面的 `userMappingsJson`，或 `cordis.patch.yml` 里的同名字段）：同 id 即替换，插件更新不受影响，下一次装配即生效、无需重启。个人映射规则放这里。
- **内置规则库本身**——[src/data/provider-mappings.json](src/data/provider-mappings.json)：出厂默认规则（每条一个 JSON 对象：`id`、`harness`、`identity`、`modelPatterns`、`providerPatterns`、`match`、`enabled`、`priority`）。想给插件本身换默认值时改它；`link:` 安装改完重启 Host 即生效，git 安装则重跑安装命令（或走 Plugins 页的更新流程）。

## 工作原理

- 在每个 Agent 的作用域上下文注册名为 `harness:identity` 的 section，顺序 `-1000`、`interpolate: false`。作用域 section 遮蔽全局默认，因此始终只有一个身份段。
- section 的 `text(context)` 读取 `context.modelSelection`（当前步捕获的选择），对照本地映射数据库解析。全程无网络请求。
- 监听 `agent/created` 注册，因此主 Agent、子 Agent、恢复的 Agent 与 Workflow 子任务全部覆盖。插件持有全部 disposer，卸载时一并移除。
- 身份本身不使用 `complete: true`，也**不**依赖 `system-prompt/assemble`。但会挂一个受保护的 `system-prompt/assemble` waterfall 监听（全局）——当 `adaptRuntimeContexts` 开启时，把 `harness:source` / `app:web-surface` 两段 runtime context 的品牌替换为命中的 Harness；其余 section、工具 schema 与 context 原样放行，监听器任何异常都退回未修改的 presentation。

详见 [research/default-system-prompt.md](research/default-system-prompt.md)、[research/injection-chain.md](research/injection-chain.md) 与 [research/provider-mapping.md](research/provider-mapping.md)。

## 支持的模型家族（内置规则）

| 家族 | 示例模型 ID | Harness |
|---|---|---|
| GLM / Z.AI | `glm-4.6`、`zcode/GLM-5.3-Flash`、`workbuddy/glm-5.3-flash` | Zcode |
| DeepSeek | `deepseek-chat`、`deepseek-v4.1-flash`、`workbuddy/deepseek-v4.1-flash` | DeepSeek Harness |
| GPT / Codex | `gpt-5`、`codex-*`、`openai/gpt-5` | OpenAI Codex |
| Claude | `claude-sonnet-4-5`、`anthropic/claude-*` | Claude Code |
| Gemini | `gemini-2.5-pro` | Google Gemini CLI |
| Qwen | `qwen3-coder`、`Qwen/Qwen3-Coder` | Qwen Code |
| Kimi | `kimi-k3.1-pro`、`workbuddy/kimi-*` | Kimi Code |
| WorkBuddy 路由 | `workbuddy/*`——`workbuddy/hy4flash-free`、`workbuddy/deepseek-*`、`workbuddy/glm-*`、`workbuddy/kimi-*`，及裸 `hy4flash*`/`hunyuan*` | WorkBuddy |
| 未知 / 本地 | 其他任意模型 | 中性回退 |

OpenRouter、SiliconFlow、Together AI、Fireworks AI、Ollama、vLLM、LM Studio 与 `magpie` 的 provider 级模板默认**关闭**：它们是路由器或宿主，不是模型的官方 Agent 平台。

## 测试

```sh
node tests/provider-matcher.test.js
node tests/identity-resolver.test.js
node tests/prompt-adapter.test.js
node tests/integration.test.js
```

当前 32/32 通过（集成测试需要 `DSH_CLI_DIR` 指向一个 DSH 检出，推荐 `packages/core/system-prompt`）。完整矩阵与真实前后对比见 [research/test-report.md](research/test-report.md)。

## 回滚

在 **Plugins** 里禁用插件，或用上面的卸载命令移除。下一次模型步即恢复使用 DSH 原生的 `harness:identity` section。插件不修改任何源码文件、profile patch 或 `node_modules` 内容。

## 已知限制

- 设置页预览的是**默认**模型选择；单个会话可能覆盖它。权威身份由 Host 在每步装配时计算。
- 身份文本变化会使系统提示词前缀缓存失效——换模型时本就如此。
- 若另一个插件在同一 Agent 作用域也遮蔽 `harness:identity`，后注册者胜出或报错；请避免重复注册。
- 当部署配置了 `includeHarnessIdentity: false` 且本插件启用时，身份段由本插件提供（无规则命中时为标准开场白）。
