# Dynamic model identity

Adapts the DSH harness identity to the model that is actually serving each step.

## What it does

DSH ships the fixed opener `You are an AI agent powered by DeepSeek Harness.` at prompt order `-1000`. When you use a model whose official agent platform differs — for example a GLM model whose theoretical home is Zcode — this plugin replaces the opener for that Agent with `You are an AI agent powered by Zcode.`

The replacement is scoped to each Agent and is resolved on every prompt assembly from `context.modelSelection`, which the agent loop captures per step. Switching models therefore changes the identity on the next step without a restart, and works for the main Agent, subagents, resumed Agents and workflow children.

## Usage

1. Install and enable the plugin.
2. Open **Plugins → Dynamic model identity** to inspect the detected provider/model, the matched rule and the resulting identity.
3. Change the model from the composer's model selector. The identity on the next request follows the new model.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch. When false, the built-in opener is left as shipped. |
| `fallbackIdentity` | `You are an AI agent powered by DeepSeek Harness.` | Identity used when no rule matches. |
| `identityTemplate` | `''` | Optional template; `{{harness}}` is replaced by the winning rule's harness. Empty uses the rule's own identity. |
| `userMappingsJson` | `''` | JSON array (or `{ "rules": [...] }`) of user rules. Same `id` overrides a built-in rule; `enabled: false` disables it. Use priority >= 200 to outrank built-ins. |

Rules are matched locally. Patterns are case-insensitive; `*` matches any sequence, including `/`. A pattern without `*` is an exact full-string match. Conflict resolution: priority, then match mode (`model-and-provider` > `model` > `provider`), then pattern specificity, then id.

## Known limitations

- Provider alone is not a reliable vendor signal: one gateway can serve several vendors' models. Model-name rules take precedence by design.
- The settings page shows the **default** model selection for preview. A specific session may override it; the authoritative identity is always resolved from that session's own step selection.
- Identity text changes invalidate the system-prompt prefix cache. This is expected when the model changes.
- Only the same-named `harness:identity` section is replaced. Other plugins' sections, tool schemas and runtime contexts are untouched.
