# 测试报告 — dsh-dynamic-model-identity

> 测试时间：2026-11-17（Asia/Shanghai）
> 环境：Node v26.13.0，pnpm 11.28.5，DSH 0.2.2-rc.3（source checkout）
> 运行方式：逐个 `node tests/<file>.test.js`（`node --test` 会派生子进程，受本机 Windows 沙箱 `spawn EPERM` 限制，因此采用等价的进程内执行）。

## 1. 结果汇总

| 测试文件 | 通过 | 失败 |
|---|---:|---:|
| `tests/provider-matcher.test.js` | 7 | 0 |
| `tests/identity-resolver.test.js` | 10 | 0 |
| `tests/prompt-adapter.test.js` | 6 | 0 |
| `tests/integration.test.js` | 7 | 0 |
| **合计** | **30** | **0** |

集成测试使用 DSH 自身的 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-scope` 与 `@deepseek-ai/dsh-system-prompt` 构建产物，调用真实的 `ctx.systemPrompt.assemble()` 与 `renderPrompt()`，**检查最终装配出的 System Prompt**，而非仅检查插件是否加载。

## 2. 模型切换测试（真实装配结果）

序列：DeepSeek → GLM → GPT → Claude → Gemini → DeepSeek。每一步断言首段身份与“仅出现一次 Harness Identity”。

| 输入 `modelSelection` | 最终 System Prompt 首段 |
|---|---|
| `magpie` / `workbuddy/deepseek-v4.1-flash` | `You are an AI agent powered by DeepSeek Harness.` |
| `magpie-anthropic` / `zcode/GLM-5.3-Flash` | `You are an AI agent powered by Zcode.` |
| `openai` / `gpt-5` | `You are an AI agent powered by OpenAI Codex.` |
| `anthropic` / `claude-sonnet-4-5` | `You are an AI agent powered by Claude Code.` |
| `google` / `gemini-2.5-pro` | `You are an AI agent powered by Google Gemini CLI.` |
| `magpie` / `workbuddy/deepseek-v4.1-flash` | `You are an AI agent powered by DeepSeek Harness.` |

## 3. Provider 测试

| Provider | Model | 结果 |
|---|---|---|
| `zai`（官方） | `glm-4.6` | Zcode |
| `openrouter`（路由器） | `openai/gpt-5` | OpenAI Codex（按模型名，不按路由商） |
| `siliconflow` | `Qwen/Qwen3-Coder` | Qwen Code |
| `together` | `deepseek-v3` | DeepSeek Harness |
| `fireworks` | `accounts/fireworks/models/llama` | 中性回退 |
| `ollama`（本地） | `qwen2.5-coder` | Qwen Code |
| `vllm`（本地服务） | `glm-4.5` | Zcode |
| `lmstudio` | `local-model` | 中性回退 |

关键设计验证：`magpie` 同一 provider 同时承载 GLM / DeepSeek / Kimi / Hunyuan 模型，模型级规则优先，provider-only 的 `magpie` 规则默认关闭，未发生身份劫持。

## 4. 异常测试

- Provider 缺失、Model ID 缺失、完全无选择：均使用中性回退，不抛错，装配成功。
- 未知模型 / 未知 Provider：中性回退。
- 映射规则冲突：用户规则以 `priority >= 200` 覆盖内置规则；`enabled: false` 可禁用某条规则（按 id）。
- 非法用户 JSON：被忽略，回退到内置规则，不阻断提示词装配。
- 用户自定义 `identityTemplate` 含 `{{harness}}`：正确插值。
- 插件卸载（dispose section）：恢复 DSH 出厂身份，无残留。
- 重启（全新 Context + SystemPrompt）：结果可复现。
- 重复 Harness Identity：所有用例中 `You are an AI agent` 出现次数恒为 1。
- 其他 Section：persona 与测试注入的 guidance section 均保留。

## 5. System Prompt 修改前后对比（真实装配）

输入：`{ provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' }`，web profile persona `You are a coding agent powered by the {{model}} model.`

**修改前（DSH 出厂）：**

```text
You are an AI agent powered by DeepSeek Harness.

You are a coding agent powered by the zcode/GLM-5.3-Flash model.
```

**修改后（插件生效）：**

```text
You are an AI agent powered by Zcode.

You are a coding agent powered by the zcode/GLM-5.3-Flash model.
```

仅第一个 section（order `-1000` 的 `harness:identity`）发生变化；persona、工具指导、运行时上下文均未改变。

> 字节校验：DSH 出厂文本的 `agent` 后为空格（hex `...6167656e7420706f776572...`，无逗号）。插件的中性回退与其逐字一致。

## 6. 尚未验证 / 限制

- **Web Settings 页面渲染**：静态实现了 `plugins.item` 卡片与全部配置项，但未在连接页面中实际渲染验证（需要运行中的 GUI 与浏览器控制）；Client HMR 未验证。
- **端到端真实模型请求**：未调用真实 LLM API（无对应密钥）；验证止于 DSH 的 Prompt Assembly API 输出。
- **完整 profile 的成百条工具 section**：集成测试使用最小可复现上下文；机制上仅替换同名 section，不影响其他 section，但未逐一枚举验证。
- **同一 agent 作用域内其他插件也遮蔽 `harness:identity`**：后注册者覆盖先注册者或报错，属于共享扩展点的通用限制；当前 profile 未发现此类插件。
