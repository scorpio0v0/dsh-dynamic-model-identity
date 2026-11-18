# 模型 → 官方平台（Harness）映射研究

> 项目：`dsh-dynamic-model-identity`　|　目标文件：`src/data/provider-mappings.json`　|　DSH 版本：`0.2.2-rc.3`
>
> 本文描述如何把 `context.modelSelection` 解析成一条“身份声明”（identity string），例如
> `You are an AI agent powered by Zcode.`，以及该映射数据库的数据结构、冲突消解算法与扩展方式。

---

## 1. 概念区分（非常重要）

本数据库映射的不是“厂商名”，而是**模型 ID（可叠加 provider）→ 该模型理论上运行的官方 Harness / 编码 Agent 平台**。四个概念必须分开：

| 概念 | 例子 | 说明 |
|---|---|---|
| 模型厂商 (model vendor) | OpenAI、Anthropic、Google、Z.AI、DeepSeek、Moonshot、Alibaba、Tencent | 模型的实际出品方。 |
| API Provider id | `openai`、`anthropic`、`zai`、`deepseek-official`、`magpie`、`magpie-anthropic`、`openrouter` | DSH 配置里的网关 / 路由标识。**一个 provider 可以服务多家厂商的模型**，例如本机的 `magpie`。 |
| 模型 ID | `gpt-5`、`claude-sonnet-4-5`、`glm-4.6`、`zcode/GLM-5.3-Flash`、`workbuddy/hy4flash-free` | 可带厂商前缀（`zcode/`、`workbuddy/`、`auto/`）。匹配时必须支持 `/`。 |
| Harness / 官方运行时 | OpenAI Codex、Claude Code、Google Gemini CLI、Zcode、DeepSeek Harness、Kimi Code、Qwen Code | 该厂商**自己的**编码 Agent 平台。这才是 identity 字符串里出现的名字。 |

插件在提示词组装时读取 `context.modelSelection`（形状为 `{ provider: string, model: string, reasoningEffort?: string }`），查询本数据库，产出 identity；匹配失败时使用中性默认值。

### DSH 侧已核对的事实

- 固定的第一方开场白位于 [`packages/core/system-prompt/src/index.ts:456-461`](../../deepseek-harness/packages/core/system-prompt/src/index.ts#L456-L461)：section 名 `harness:identity`，顺序 `−1000`，文本为 `You are an AI agent powered by DeepSeek Harness.`（`agent` 后没有逗号；已用源码与构建产物的字节校验确认，字符 19 是空格 32 而非逗号 44）。任务描述中的 `You are an AI agent.` 是简化写法。为了让插件在“无法识别模型”时不改变现有行为，本项目的中性回退采用与 DSH 出厂文本逐字一致的 `You are an AI agent powered by DeepSeek Harness.`。插件若要替换这句话，应覆盖同名 section，避免重复开场。
- `context.modelSelection` 是每一步模型调用前捕获的 `{ provider, model, reasoningEffort? }`，并同时出现在 `agent/pre-step.modelSelection`；见 [`packages/core/agent-loop/README.md:93`](../../deepseek-harness/packages/core/agent-loop/README.md#L93) 与 [`packages/core/agent-loop/src/index.ts:336-337`](../../deepseek-harness/packages/core/agent-loop/src/index.ts#L336-L337)。
- Host 服务 `agentDefaultModel` 暴露 `currentSelection(): ModelSelection` 与 `async saveSelection(next): Promise<void>`（见 [`packages/core/agent-default-model/src/index.ts:68`](../../deepseek-harness/packages/core/agent-default-model/src/index.ts#L68) 及 [`README.md:50-57`](../../deepseek-harness/packages/core/agent-default-model/README.md#L50-L57)），Client 设置页可据此显示 / 修改“新 Agent 的默认选择”。但按该 README 的说明，**会话级选择优先**；本插件在提示词组装阶段应始终读 `context.modelSelection`，而不是 `agentDefaultModel.currentSelection()`，否则会读错路由。

---

## 2. 生态调研表

“Harness”一栏只填**官方第一方编码 Agent**。路由器、推理托管、本地运行时没有自己的官方 Agent，故不产生身份声明。

| 生态 / 厂商 | 官方或常见模型 ID | 官方 / 常见 API provider id | 官方 Harness / Agent 平台 | 置信度 |
|---|---|---|---|---|
| OpenAI | `gpt-5`, `gpt-5-codex`, `gpt-5.2-codex`, `o3`, `o4-mini`, `codex-mini` | `openai`, `openai-official` | **OpenAI Codex**（Codex CLI / 云端 Codex） | 高 |
| Anthropic | `claude-sonnet-4-5`, `claude-opus-4-1`, `claude-3-5-sonnet` | `anthropic` | **Claude Code** | 高 |
| Google | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` | `google`, `google-generative-ai` | **Google Gemini CLI**（官方开源终端 Agent） | 高 |
| Z.AI / 智谱 | `glm-4.5`, `glm-4.6`, `glm-4.7`, `GLM-4-Plus`；本机 `zcode/GLM-5.3-Flash`, `zcode/GLM-5.2`, `zcode/GLM-5-Turbo`, `zcode/GLM-5.3`, `zcode/GLM-5.3-Trial`, `zcode/GLM-5.3-Flash-Trial`, `workbuddy/glm-5.3-flash`, `auto/glm-5.3-flash` | `zai`, `zhipu`, `zhipuai`, `z.ai`, `zcode` | **Zcode**（Z.AI 官方 Agentic Development Environment） | 高 |
| DeepSeek | `deepseek-chat`(V3), `deepseek-reasoner`(R1), `deepseek-v3`, `deepseek-v4-flash`, 本机 `workbuddy/deepseek-v4.1-flash` | `deepseek`, `deepseek-official`, `deepseek-account` | **DeepSeek Harness**（DSH 自身） | 高 |
| Moonshot AI | `kimi-k3.1-pro`（本机）, `kimi-k2`, `moonshot-v1-*` | `moonshot`, `moonshot-ai` | **Kimi Code**（官方 CLI，支持 ACP） | 高 |
| Alibaba / Qwen | `qwen3-coder`, `qwen-max`, `qwen-plus`, `qwen-turbo` | `qwen`, `dashscope` | **Qwen Code**（官方开源 CLI，改编自 Gemini CLI） | 高 |
| MiniMax | `MiniMax-M1`, `MiniMax-Text-01`, `minimax-*` | `minimax` | 未确认官方编码 Agent（`mmx-cli` 是通用多模态 CLI） | 低 / 模板默认关闭 |
| xAI | `grok-code-fast-1`, `grok-4`, `grok-3` | `xai` | 未确认第一方编码 Agent（只有编码模型） | 低 / 模板默认关闭 |
| OpenRouter | `openrouter/auto`, `anthropic/...`, `openai/...` | `openrouter` | 无（路由聚合器） | 不适用，规则关闭 |
| SiliconFlow | 各家模型 | `siliconflow` | 无（推理托管） | 不适用，规则关闭 |
| Together AI | 各家模型 | `together`, `togetherai` | 无（推理托管） | 不适用，规则关闭 |
| Fireworks AI | 各家模型 | `fireworks`, `fireworksai` | 无（推理托管） | 不适用，规则关闭 |
| Ollama | `llama3`, `qwen3`, 本地模型 | `ollama` | 无（本地运行时） | 不适用，规则关闭 |
| vLLM | 任意被服务模型 | `vllm` | 无（推理引擎） | 不适用，规则关闭 |
| LM Studio | 本地模型 | `lmstudio`, `lm-studio` | 无（本地桌面应用） | 不适用，规则关闭 |
| Tencent Hunyuan / WorkBuddy | `workbuddy/hy4flash-free`, `hy4flash*`, `hunyuan*` | `magpie`（本机网关） | 未确认官方编码 Harness → 走中性默认 | 低，已在报告中标注不确定 |

依据：[OpenAI Codex](https://openai.com/index/introducing-gpt-5-2-codex/)、[Claude Code 模型配置](https://code.claude.com/docs/en/model-config)、[Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5)、[Gemini CLI](https://geminicli.com/) / [仓库](https://github.com/google-gemini/gemini-cli)、[ZCode 官网](https://zcode.z.ai/en) / [文档](https://zcode.z.ai/en/docs/welcome) / [GLM-4.6](https://z.ai/blog/glm-4.6) / [GLM-4.5 仓库](https://github.com/zai-org/GLM-4.5)、[DeepSeek API 更新日志](https://api-docs.deepseek.com/updates)、[Kimi Code](https://www.kimi.com/code/en) / [仓库](https://github.com/MoonshotAI/kimi-code)、[Qwen Code](https://qwen.ai/qwencode) / [Qwen3-Coder](https://qwenlm.github.io/blog/qwen3-coder/)、[Grok Code Fast 1](https://x.ai/news/grok-code-fast-1)、[MiniMax CLI](https://github.com/MiniMax-AI/cli)、[OpenRouter 路由文档](https://openrouter.ai/docs/guides/routing/routers/auto-router)。

---

## 3. JSON 数据结构（schema）

完整定义见 [`src/data/provider-mappings.json`](../src/data/provider-mappings.json)。顶层：

```jsonc
{
  "version": 1,
  "defaults": {
    "identity": "You are an AI agent powered by DeepSeek Harness.",   // 无任何规则命中时的中性回退
    "harness": "DeepSeek Harness"          // 仅作来源/元数据说明
  },
  "rules": [ Rule ]
}
```

单条规则：

```jsonc
{
  "id": "zai-glm",                 // 字符串，数据库内唯一，也是覆盖合并的键
  "harness": "Zcode",              // 平台名（元数据 + 缺省 identity 的插值来源）
  "identity": "You are an AI agent powered by Zcode.",  // 命中时原样输出的身份声明
  "modelPatterns": ["glm-*", "*glm*"],
  "providerPatterns": ["zai", "zhipu", "zhipuai"],
  "match": "model-and-provider",   // "model" | "provider" | "model-and-provider"
  "enabled": true,
  "priority": 100,                 // 整数，越大越优先；内建取值 10–100
  "source": "https://...",         // 证据 URL；本地观察可留空字符串
  "notes": "English-only explanation"  // 可选，仅作文档用途
}
```

### 3.1 `match` 的三种语义

| 取值 | 求值方式 |
|---|---|
| `model` | 只检查 `modelPatterns`，`providerPatterns` 被忽略（可为空数组）。 |
| `provider` | 只检查 `providerPatterns`，`modelPatterns` 被忽略（可为空数组）。 |
| `model-and-provider` | 两个维度都必须满足；任一必查维度为空数组时该规则永不命中。 |

同一维度内的多个 pattern 是 **OR**（任一命中即可）；`model-and-provider` 的两个维度之间是 **AND**。

### 3.2 通配符与精确匹配语义

- 匹配**大小写不敏感**（两侧统一转小写后再比较）。
- 整个 pattern 对**整个字符串**锚定匹配，不是子串搜索。
- `*` 匹配任意长度的字符序列，**包括空串和 `/`**。因此带厂商前缀的 ID 能被正确匹配。
- 不含 `*` 的 pattern 是**精确匹配**（大小写不敏感的全字符串相等）。
- 多个 `*` 允许；不做正则、不做转义。
- 因此想表达“包含某段”必须写首尾通配，例如 `*glm*` 同时命中 `glm-4.6`、`zcode/GLM-5.3-Flash`、`auto/glm-5.3-flash`、`workbuddy/glm-5.3-flash`；`glm-*` 只命中以 `glm-` 开头的 ID。

> 实现提示：`^` + 把 pattern 中的 `*` 替换为 `.*`、其余字符做正则转义 + `$`，加 `i` 标志即可；或写成等价的首尾/分段字符串判断。

### 3.3 identity 的生成

1. 命中规则的 `identity` 非空时**原样使用**该字符串。
2. 若用户自定义规则省略 `identity`，则回退为 ``You are an AI agent powered by ${harness}.``。
3. 没有任何规则命中（或全部关闭）时使用 `defaults.identity`，即 `You are an AI agent powered by DeepSeek Harness.`。`defaults.harness` 只记录 DSH 出厂文本来源，不参与字符串拼接。

---

## 4. 完整映射规则表

共 32 条：20 条启用、12 条默认关闭的模板（其中 `custom-user-override-template` 为优先级 250 的覆盖示例）。

| # | id | priority | match | modelPatterns | providerPatterns | Harness | identity（命中时原样输出） | enabled |
|---:|---|---:|---|---|---|---|---|:---:|
| 1 | `zai-glm-official` | 100 | model-and-provider | `glm-*`, `*glm*`, `zcode/*` | `zai`, `zhipu`, `zhipuai`, `z.ai`, `zcode`, `zai-org` | Zcode | `You are an AI agent powered by Zcode.` | ✅ |
| 2 | `zcode-model-any-provider` | 96 | model | `*zcode/*`, `*glm*` | — | Zcode | `You are an AI agent powered by Zcode.` | ✅ |
| 3 | `deepseek-model-official` | 95 | model-and-provider | `*deepseek*` | `deepseek`, `deepseek-official`, `deepseek-ai`, `deepseek-account` | DeepSeek Harness | `You are an AI agent powered by DeepSeek Harness.` | ✅ |
| 4 | `deepseek-model-any-provider` | 94 | model | `*deepseek*`, `workbuddy/deepseek*`, `auto/deepseek*` | — | DeepSeek Harness | `You are an AI agent powered by DeepSeek Harness.` | ✅ |
| 5 | `openai-codex-model-official` | 93 | model-and-provider | `gpt-*`, `codex-*`, `o1*`, `o3*`, `o4*`, `o5*`, `chatgpt-*` | `openai`, `openai-official` | OpenAI Codex | `You are an AI agent powered by OpenAI Codex.` | ✅ |
| 6 | `anthropic-claude-model-official` | 93 | model-and-provider | `claude-*` | `anthropic`（**精确**，不是 `*anthropic*`） | Claude Code | `You are an AI agent powered by Claude Code.` | ✅ |
| 7 | `openai-codex-model-any-provider` | 90 | model | `gpt-*`, `codex-*`, `o1*`, `o3*`, `o4*`, `o5*`, `*gpt*`, `*codex*` | — | OpenAI Codex | `You are an AI agent powered by OpenAI Codex.` | ✅ |
| 8 | `anthropic-claude-model-any-provider` | 90 | model | `claude-*`, `*claude*` | — | Claude Code | `You are an AI agent powered by Claude Code.` | ✅ |
| 9 | `google-gemini-model-official` | 89 | model-and-provider | `gemini-*` | `google`, `google-generative-ai`, `gemini` | Google Gemini CLI | `You are an AI agent powered by Google Gemini CLI.` | ✅ |
| 10 | `google-gemini-model-any-provider` | 88 | model | `gemini-*`, `*gemini*` | — | Google Gemini CLI | `You are an AI agent powered by Google Gemini CLI.` | ✅ |
| 11 | `qwen-model-any-provider` | 82 | model | `qwen*`, `*qwen*` | — | Qwen Code | `You are an AI agent powered by Qwen Code.` | ✅ |
| 12 | `moonshot-kimi-model-any-provider` | 80 | model | `kimi-*`, `*kimi*`, `moonshot/*`, `workbuddy/kimi*` | — | Kimi Code | `You are an AI agent powered by Kimi Code.` | ✅ |
| 13 | `deepseek-provider-only` | 70 | provider | — | `deepseek`, `deepseek-official`, `deepseek-ai`, `deepseek-account` | DeepSeek Harness | `You are an AI agent powered by DeepSeek Harness.` | ✅ |
| 14 | `zai-provider-only` | 60 | provider | — | `zai`, `zhipu`, `zhipuai`, `z.ai`, `zcode`, `zai-org` | Zcode | `You are an AI agent powered by Zcode.` | ✅ |
| 15 | `openai-provider-only` | 60 | provider | — | `openai`, `openai-official` | OpenAI Codex | `You are an AI agent powered by OpenAI Codex.` | ✅ |
| 16 | `anthropic-provider-only` | 60 | provider | — | `anthropic`（精确） | Claude Code | `You are an AI agent powered by Claude Code.` | ✅ |
| 17 | `google-provider-only` | 58 | provider | — | `google`, `google-generative-ai`, `gemini` | Google Gemini CLI | `You are an AI agent powered by Google Gemini CLI.` | ✅ |
| 18 | `qwen-provider-only` | 55 | provider | — | `qwen`, `dashscope`, `alibaba`, `aliyun` | Qwen Code | `You are an AI agent powered by Qwen Code.` | ✅ |
| 19 | `moonshot-provider-only` | 54 | provider | — | `moonshot`, `moonshot-ai`, `kimi` | Kimi Code | `You are an AI agent powered by Kimi Code.` | ✅ |
| 20 | `tencent-hunyuan-workbuddy-neutral` | 40 | model | `hy4flash*`, `*hy4flash*`, `workbuddy/*`, `hunyuan*`, `*hunyuan*` | — | （未确认，元数据记为 DeepSeek Harness） | `You are an AI agent powered by DeepSeek Harness.`（中性默认） | ✅ |
| 21 | `openrouter-provider-override` | 10 | provider | — | `openrouter`, `openrouter-ai` | OpenRouter | `You are an AI agent powered by OpenRouter.` | ❌ 模板 |
| 22 | `siliconflow-provider-override` | 10 | provider | — | `siliconflow`, `siliconflow-cn` | SiliconFlow | `You are an AI agent powered by SiliconFlow.` | ❌ 模板 |
| 23 | `togetherai-provider-override` | 10 | provider | — | `together`, `togetherai`, `together-ai` | Together AI | `You are an AI agent powered by Together AI.` | ❌ 模板 |
| 24 | `fireworksai-provider-override` | 10 | provider | — | `fireworks`, `fireworksai` | Fireworks AI | `You are an AI agent powered by Fireworks AI.` | ❌ 模板 |
| 25 | `ollama-provider-override` | 10 | provider | — | `ollama` | Ollama | `You are an AI agent powered by Ollama.` | ❌ 模板 |
| 26 | `vllm-provider-override` | 10 | provider | — | `vllm` | vLLM | `You are an AI agent powered by vLLM.` | ❌ 模板 |
| 27 | `lmstudio-provider-override` | 10 | provider | — | `lmstudio`, `lm-studio` | LM Studio | `You are an AI agent powered by LM Studio.` | ❌ 模板 |
| 28 | `magpie-provider-override` | 10 | provider | — | `magpie`, `magpie-anthropic` | Magpie | `You are an AI agent powered by Magpie.` | ❌ 模板（关键） |
| 29 | `xai-grok-code-optional` | 10 | model | `grok-*`, `*grok*` | — | Grok Code（未确认） | `You are an AI agent powered by Grok Code.` | ❌ 模板 |
| 30 | `minimax-cli-optional` | 10 | model | `minimax-*`, `*minimax*` | — | MiniMax CLI（未确认） | `You are an AI agent powered by MiniMax CLI.` | ❌ 模板 |
| 31 | `local-model-neutral-template` | 10 | model | `*` | — | （中性） | `You are an AI agent powered by DeepSeek Harness.` | ❌ 模板 |
| 32 | `custom-user-override-template` | 250 | model-and-provider | `*` | `*` | `Your Harness`（示例） | `You are an AI agent powered by Your Harness.` | ❌ 模板 |

本表 identity 栏与 JSON 中每条规则的 `identity` 字段逐字一致。

---

## 5. 冲突消解算法

对一次 `modelSelection = { provider, model }`：

1. **过滤**：丢弃所有 `enabled === false` 的规则。
2. **求值**：按每条规则的 `match` 检查相应维度；pattern 命中即加入候选集。
3. **无候选**：返回 `defaults.identity`（`You are an AI agent powered by DeepSeek Harness.`），结束。
4. **排序**：候选按以下四级键排序，取第一名：
   1. `priority` **降序**（数值大者胜）；
   2. 若 priority 相同，按 `match` 的具体度降序：`model-and-provider`(3) > `model`(2) > `provider`(1)；
   3. 若仍相同，按命中 pattern 中非通配符字符数（具体度）降序；
   4. 最后按 `id` 的字典序升序（保证结果确定、可测试）。
5. **输出**：使用胜出规则的 `identity`（缺省时按 3.3 推导）。

### 5.1 真实冲突案例（来自本机活动 profile）

本机 profile [`cordis.patch.yml`](C:/Users/Scorpio/.dsh/profiles/web/cordis.patch.yml) 第 8–12 行设置的默认选择为 `provider: magpie`、`model: workbuddy/hy4flash-free`；第 33–157 行的 `llm-pi-ai` 配置显示：

- `magpie-anthropic`（`api: anthropic-messages`）提供 `zcode/GLM-5.3-Flash`、`zcode/GLM-5.2`、`zcode/GLM-5-Turbo`、`zcode/GLM-5.3`、`zcode/GLM-5.3-Trial`、`zcode/GLM-5.3-Flash-Trial`，显示名带 `· ZCode`。
- `magpie`（`api: openai-completions`）同时提供 `auto/glm-5.3-flash`、`workbuddy/deepseek-v4.1-flash`、`workbuddy/glm-5.3-flash`、`workbuddy/kimi-k3.1-pro`、`workbuddy/hy4flash-free`。

因此 **`provider` 单独完全不可信**：同一个 `magpie` 背后有 Zcode / DeepSeek / Kimi / Hunyuan 四家模型，`magpie-anthropic` 这个字符串里含 `anthropic` 却提供 GLM。规则设计做了两件事：

- 所有模型级规则（priority 80–96）都高于 provider 级规则（54–70）；模型名优先。
- `anthropic` 的 provider pattern 是**精确匹配**，`magpie-anthropic` 不会被误判为 Claude Code；`magpie` 的 provider-only 规则保持 `enabled: false`。

推演结果：

| 输入 `{provider, model}` | 命中（最高优先级） | 输出 identity |
|---|---|---|
| `magpie-anthropic`, `zcode/GLM-5.3-Flash` | `zcode-model-any-provider`(96) | `You are an AI agent powered by Zcode.` |
| `magpie`, `workbuddy/glm-5.3-flash` | `zcode-model-any-provider`(96) | `You are an AI agent powered by Zcode.` |
| `magpie`, `workbuddy/deepseek-v4.1-flash` | `deepseek-model-any-provider`(94) | `You are an AI agent powered by DeepSeek Harness.` |
| `magpie`, `workbuddy/kimi-k3.1-pro` | `moonshot-kimi-model-any-provider`(80) | `You are an AI agent powered by Kimi Code.` |
| `magpie`, `workbuddy/hy4flash-free` | `tencent-hunyuan-workbuddy-neutral`(40) | `You are an AI agent powered by DeepSeek Harness.` |
| `openrouter`, `anthropic/claude-sonnet-4-5` | `anthropic-claude-model-any-provider`(90) | `You are an AI agent powered by Claude Code.` |

---

## 6. 高置信度与不确定项

### 高置信度（默认启用）
- **Zcode / GLM**：Z.AI 官网明确将 ZCode 称为 GLM 的官方 Agentic Development Environment；本机模型显示名也直接写 `· ZCode`。
- **OpenAI Codex / Claude Code / Google Gemini CLI / DeepSeek Harness**：均有官方产品文档与 DSH 源码中的第一方身份文本支撑。DeepSeek 额外享有最高一档模型规则（priority 95/94/70）。
- **Kimi Code / Qwen Code**：分别有 Moonshot AI 与 Qwen 官方仓库 / 产品页确认是 CLI Agent。
- 路由聚合器 / 推理托管 / 本地运行时（OpenRouter、SiliconFlow、Together、Fireworks、Ollama、vLLM、LM Studio）**不是模型厂商也不是 Agent**，其 provider-only 规则一律默认关闭，绝不覆盖模型真实平台。

### 不确定（默认关闭或标注中性，等用户确认后再启用）
- **xAI Grok**：`grok-code-fast-1` 是面向 agentic coding 的模型，但未查到与 Codex / Claude Code 对等的官方第一方编码 Agent；因此 `xai-grok-code-optional` 默认关闭。
- **MiniMax**：`mmx-cli` 是通用多模态 CLI，`mmx agent setup` 只是把 MiniMax 配进 Codex / Claude Code 等第三方 Agent；未确认第一方编码 Harness，故默认关闭。
- **Tencent Hunyuan / WorkBuddy**：`workbuddy/hy4flash-free` 是当前默认路由，但未查到官方第一方编码 Agent。规则 20 输出**中性默认** `You are an AI agent powered by DeepSeek Harness.`，同时保留 `harness: "DeepSeek Harness"` 仅作来源元数据；如果后续确认腾讯官方 CLI（例如 CodeBuddy 类产品），用户可在覆盖文件里新增高优先级规则。
- 任何以 `auto/` 开头的路由组 ID 都应按其中实际模型判断，不要给 `auto/*` 单独配身份；当前 `*glm*` 已能命中 `auto/glm-5.3-flash`。

---

## 7. 用户扩展与覆盖

不要修改内置文件 `src/data/provider-mappings.json`。用户可新增第二个 JSON 文件（例如 `src/data/provider-mappings.user.json`，或放在插件配置指定路径），结构相同，`version` 必须为 `1`。

合并规则（**按 `id` 合并**）：

1. `defaults`：用户文件中出现的字段覆盖内置 `defaults`，未出现的字段保留内置值。
2. `rules`：以 `id` 为键。
   - 相同 `id`：**整条替换**内置规则（包括 `enabled`、`priority`、`patterns`、`identity`）。想禁用某条内置规则，就复制它的完整定义并把 `enabled` 改成 `false`。
   - 新 `id`：追加到规则集。
   - 合并后不依赖数组顺序；最终由第 5 节的排序决定胜者。
3. 优先级约定：内置规则占用 `10–100`；**`200` 及以上保留给用户覆盖**（模板 `custom-user-override-template` 用 250 示范）。用户若想让自己的规则稳赢，设 `priority: 500`。
4. 校验：`version` 不匹配、`id` 重复（在**同一个**文件内）、`match` 非法、必查 pattern 数组为空、非整数 priority 都应在加载时报错，而不是静默跳过。
5. 覆盖示例（只贴用户文件里的一条）：

```jsonc
{
  "version": 1,
  "rules": [
    {
      "id": "my-company-gateway",
      "harness": "Acme Gateway",
      "identity": "You are an AI agent powered by Acme Gateway.",
      "modelPatterns": ["acme-*"],
      "providerPatterns": ["acme"],
      "match": "model-and-provider",
      "enabled": true,
      "priority": 500,
      "source": ""
    }
  ]
}
```

---

## 8. 来源清单

- 官方产品 / 文档：[OpenAI Codex](https://openai.com/index/introducing-gpt-5-2-codex/) · [Anthropic Claude Code 模型配置](https://code.claude.com/docs/en/model-config) · [Claude Sonnet 4.5](https://www.anthropic.com/news/claude-sonnet-4-5) · [Gemini CLI](https://geminicli.com/) · [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) · [ZCode](https://zcode.z.ai/en) · [ZCode Docs](https://zcode.z.ai/en/docs/welcome) · [GLM-4.6](https://z.ai/blog/glm-4.6) · [zai-org/GLM-4.5](https://github.com/zai-org/GLM-4.5) · [Z.AI DevPack](https://docs.z.ai/devpack/overview) · [DeepSeek 更新日志](https://api-docs.deepseek.com/updates) · [Kimi Code](https://www.kimi.com/code/en) · [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) · [Qwen Code](https://qwen.ai/qwencode) · [Qwen3-Coder](https://qwenlm.github.io/blog/qwen3-coder/) · [Grok Code Fast 1](https://x.ai/news/grok-code-fast-1) · [MiniMax CLI](https://github.com/MiniMax-AI/cli)
- 聚合 / 托管 / 本地运行时（仅用于说明“不产生身份声明”）：[OpenRouter 路由文档](https://openrouter.ai/docs/guides/routing/routers/auto-router) · [SiliconFlow](https://docs.siliconflow.com/) · [Together AI](https://docs.together.ai/) · [Fireworks AI](https://docs.fireworks.ai/) · [Ollama](https://docs.ollama.com/) · [vLLM](https://docs.vllm.ai/) · [LM Studio](https://lmstudio.ai/docs)
- DSH 源码（本地检出）：[system-prompt/src/index.ts:456-461](../../deepseek-harness/packages/core/system-prompt/src/index.ts#L456-L461) · [agent-loop/README.md:93](../../deepseek-harness/packages/core/agent-loop/README.md#L93) · [agent-default-model/src/index.ts:68](../../deepseek-harness/packages/core/agent-default-model/src/index.ts#L68) · 本机 profile `C:\Users\Scorpio\.dsh\profiles\web\cordis.patch.yml`（第 8–12、31–157 行）。
