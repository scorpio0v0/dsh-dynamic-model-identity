# dsh-dynamic-model-identity

English | [简体中文](README.zh-CN.md)

A DSH plugin that keeps the system prompt's harness identity consistent with the model actually serving each step.

DSH ships the fixed opener `You are an AI agent powered by DeepSeek Harness.` at prompt order `-1000`. When a GLM model is selected, this plugin changes that opener to `You are an AI agent powered by Zcode.`; for GPT models to `You are an AI agent powered by OpenAI Codex.`, and so on. The decision is made locally on every prompt assembly from the live `context.modelSelection`.

## Requirements

- DSH 0.2.2-rc.3 or a compatible release (Node >= 24.9)
- The `web` profile (or any profile that mounts `dsh-system-prompt` and `dsh-agent-loop`)

## Install

From the DSH GUI: **Plugins → Add plugin**, paste the repository spec, then enable **Dynamic model identity**. One-click from any terminal once this repository is published:

```sh
dsh plugin --profile web add "github:scorpio0v0/dsh-dynamic-model-identity"
```

Pin a tag or commit by appending `#v1.1.0`. An agent with the `plugin_manager` tool can install the same bundle with:

```
plugin_manager(action="install_bundle", target="github:scorpio0v0/dsh-dynamic-model-identity")
```

For local development, install from a directory instead:

```sh
dsh plugin --profile web add "file:/path/to/dsh-dynamic-model-identity"
```

After installation, confirm the plugin row is enabled. Installing a new bundle can activate through HMR; replacing an installed package version needs a restart to load the new module generation.

> Local `file:`/`link:` installs may need `DSH_INSTALL_DIR` pointed at a DSH checkout's `apps/cli` directory so the settings schema can resolve `@deepseek-ai/schemastery`; git installs resolve it through the profile's dependency graph automatically.

## Uninstall

- GUI: **Plugins → Dynamic model identity → Remove** (or disable the row to keep files but stop the effect).
- CLI:

```sh
dsh plugin --profile web remove @local/dsh-dynamic-model-identity
```

Disabling or removing restores DSH's shipped identity on the next prompt assembly. No core file or profile patch is modified by this plugin itself.

## Configuration

Open **Plugins → Dynamic model identity** for: the master switch, current default provider/model, detected harness, effective identity, matched rule, custom identity template, user mapping rules, import/export and restore defaults.

Fields (also settable in `cordis.patch.yml`):

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `fallbackIdentity` | `You are an AI agent powered by DeepSeek Harness.` | Used when no rule matches. |
| `identityTemplate` | `''` | Optional; `{{harness}}` expands to the winning harness. |
| `userMappingsJson` | `''` | JSON array or `{ "rules": [...] }`. |
| `adaptRuntimeContexts` | `true` | Also swap `DeepSeek Harness` / standalone `DSH` to the matched harness inside the `harness:source` and `app:web-surface` runtime-context paragraphs. Paths, URLs, and CLI spellings (`dsh web`, `__DSH_BOOT__`) stay untouched. Note: the checkout and the Web GUI are still served by DSH itself — the swap aligns branding with the claimed identity, not the serving software. |

Example user rule:

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

Rules are merged by `id`. A user rule with an existing id replaces the built-in; `enabled: false` disables it. Built-ins occupy priorities 10–100; use 200+ for user overrides. Matching is case-insensitive, `*` matches any sequence (including `/`), and a pattern without `*` is an exact full-string match. Conflict order: priority, match mode (`model-and-provider` > `model` > `provider`), pattern specificity, id.

## How it works

- Registers a section named `harness:identity` on each Agent's scoped context, with order `-1000` and `interpolate: false`. A scoped section shadows the global default, so there is exactly one identity section.
- The section's `text(context)` reads `context.modelSelection` (the selection captured for the current step) and resolves it against the local mapping database. No network request is made.
- Registered in `agent/created`, so the main Agent, subagents, resumed Agents and workflow children are all covered. Disposers are retained by the plugin so unloading removes every section.
- Does not use `complete: true` and does not listen to `system-prompt/assemble` **for the identity itself**. It does attach one guarded `system-prompt/assemble` waterfall listener (global) that — when `adaptRuntimeContexts` is on — re-brands the `harness:source` / `app:web-surface` runtime-context paragraphs to the matched harness; every other section, tool schema and context passes through untouched, and any listener failure degrades to the unmodified presentation.

See [research/default-system-prompt.md](research/default-system-prompt.md), [research/injection-chain.md](research/injection-chain.md) and [research/provider-mapping.md](research/provider-mapping.md).

## Supported model families (built-in rules)

| Family | Example model IDs | Harness |
|---|---|---|
| GLM / Z.AI | `glm-4.6`, `zcode/GLM-5.3-Flash`, `workbuddy/glm-5.3-flash` | Zcode |
| DeepSeek | `deepseek-chat`, `deepseek-v4.1-flash`, `workbuddy/deepseek-v4.1-flash` | DeepSeek Harness |
| GPT / Codex | `gpt-5`, `codex-*`, `openai/gpt-5` | OpenAI Codex |
| Claude | `claude-sonnet-4-5`, `anthropic/claude-*` | Claude Code |
| Gemini | `gemini-2.5-pro` | Google Gemini CLI |
| Qwen | `qwen3-coder`, `Qwen/Qwen3-Coder` | Qwen Code |
| Kimi | `kimi-k3.1-pro`, `workbuddy/kimi-*` | Kimi Code |
| Hunyuan / WorkBuddy | `workbuddy/hy4flash-free` | neutral fallback (no official harness confirmed) |
| Unknown / local | anything else | neutral fallback |

Provider-only templates for OpenRouter, SiliconFlow, Together AI, Fireworks AI, Ollama, vLLM, LM Studio and `magpie` are shipped **disabled**: these are routers or hosts, not the model's official agent platform.

## Tests

```sh
node tests/provider-matcher.test.js
node tests/identity-resolver.test.js
node tests/prompt-adapter.test.js
node tests/integration.test.js
```

32/32 passing (integration tests need `DSH_CLI_DIR` pointed at a DSH checkout — `packages/core/system-prompt` recommended). See [research/test-report.md](research/test-report.md) for the full matrix and real before/after prompt.

## Rollback

Disable the plugin in **Plugins**, or remove it with the uninstall command above. The next model step uses DSH's original `harness:identity` section again. No source file, profile patch or `node_modules` content is changed by the plugin.

## Known limitations

- The settings page previews the **default** model selection; a session may override it. The authoritative identity is computed per step on the Host.
- Identity changes invalidate the system-prompt prefix cache; expected when the model changes.
- If another plugin shadows `harness:identity` in the same Agent scope, the last registration wins or fails; avoid duplicate registrations.
- When `includeHarnessIdentity: false` is configured by the deployment and the plugin is enabled, this plugin supplies the identity section (standard opener if no rule matches).
