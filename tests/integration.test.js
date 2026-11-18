import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDsh } from './dsh-loader.js'
import { createIdentityResolver } from '../src/identity-resolver.js'
import { IDENTITY_SECTION_NAME } from '../src/prompt-adapter.js'
import { DEFAULT_IDENTITY } from '../src/config.js'
import mappings from '../src/data/provider-mappings.json' with { type: 'json' }

async function boot(config = {}, personaPrefix = 'You are a coding agent powered by the {{model}} model.') {
  const { Context } = await loadDsh('@deepseek-ai/cordis')
  const { createScope, scopeOf } = await loadDsh('@deepseek-ai/dsh-scope')
  const SystemPromptModule = await loadDsh('@deepseek-ai/dsh-system-prompt')
  const ctx = new Context()
  await ctx.plugin(SystemPromptModule.default, { personaPrefix, personaSuffix: '' })
  // agent-loop registers these in production; mirror them for the fixture.
  ctx.systemPrompt.variable('model', context => context.modelSelection?.model ?? 'unspecified-model')
  ctx.systemPrompt.variable('provider', context => context.modelSelection?.provider ?? 'unspecified-provider')
  let scope
  await ctx.plugin(Object.assign((inner) => {
    scope = createScope(inner, { name: 'integration-agent' })
  }, { inject: ['systemPrompt'] }))
  const resolver = createIdentityResolver({
    rules: mappings.rules,
    defaults: mappings.defaults,
    readConfig: key => config[key],
  })
  const off = scope.ctx.systemPrompt.section({
    name: IDENTITY_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    interpolate: false,
    text: context => {
      const selection = context.modelSelection ?? {}
      return resolver.resolve(selection).identity
    },
  })
  return {
    render: async selection => SystemPromptModule.renderPrompt(await ctx.systemPrompt.assemble({
      scope: scopeOf(scope.ctx), ...selection === undefined ? {} : { modelSelection: selection },
    })),
    dispose: off,
  }
}

const identityOf = prompt => prompt.split('\n\n')[0]

test('model switch matrix: WorkBuddy → GLM → GPT → Claude → Gemini → WorkBuddy', async () => {
  const app = await boot()
  const sequence = [
    [{ provider: 'magpie', model: 'workbuddy/deepseek-v4.1-flash' }, 'You are an AI agent powered by WorkBuddy.'],
    [{ provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' }, 'You are an AI agent powered by Zcode.'],
    [{ provider: 'openai', model: 'gpt-5' }, 'You are an AI agent powered by OpenAI Codex.'],
    [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }, 'You are an AI agent powered by Claude Code.'],
    [{ provider: 'google', model: 'gemini-2.5-pro' }, 'You are an AI agent powered by Google Gemini CLI.'],
    [{ provider: 'magpie', model: 'workbuddy/deepseek-v4.1-flash' }, 'You are an AI agent powered by WorkBuddy.'],
  ]
  for (const [selection, expected] of sequence) {
    const prompt = await app.render(selection)
    assert.equal(identityOf(prompt), expected)
    assert.equal(prompt.split('You are an AI agent').length - 1, 1, 'no duplicate identity')
  }
})

test('provider matrix: official, OpenAI-compatible, routers, local', async () => {
  const app = await boot()
  const cases = [
    [{ provider: 'zai', model: 'glm-4.6' }, 'You are an AI agent powered by Zcode.'],
    [{ provider: 'openrouter', model: 'openai/gpt-5' }, 'You are an AI agent powered by OpenAI Codex.'],
    [{ provider: 'siliconflow', model: 'Qwen/Qwen3-Coder' }, 'You are an AI agent powered by Qwen Code.'],
    [{ provider: 'together', model: 'deepseek-v3' }, DEFAULT_IDENTITY],
    [{ provider: 'fireworks', model: 'accounts/fireworks/models/llama' }, DEFAULT_IDENTITY],
    [{ provider: 'ollama', model: 'qwen2.5-coder' }, 'You are an AI agent powered by Qwen Code.'],
    [{ provider: 'vllm', model: 'glm-4.5' }, 'You are an AI agent powered by Zcode.'],
    [{ provider: 'lmstudio', model: 'local-model' }, DEFAULT_IDENTITY],
  ]
  for (const [selection, expectedIdentity] of cases) {
    const prompt = await app.render(selection)
    assert.equal(identityOf(prompt), expectedIdentity, `${selection.provider}/${selection.model}`)
  }
})

test('abnormal cases never throw and never duplicate identity', async () => {
  const app = await boot()
  const cases = [
    undefined,
    {},
    { provider: 'unknown-provider', model: 'unknown-model' },
    { provider: 'magpie' },
    { model: 'glm-5' },
  ]
  for (const selection of cases) {
    const prompt = await app.render(selection)
    assert.equal(prompt.split('You are an AI agent').length - 1, 1)
    assert.ok(identityOf(prompt).startsWith('You are an AI agent'))
  }
})

test('mapping conflict: a disabled user rule cannot override; an enabled one can', async () => {
  const disabled = await boot({ userMappingsJson: JSON.stringify([{ id: 'off', modelPatterns: ['*glm*'], match: 'model', priority: 500, identity: 'Wrong.', enabled: false }]) })
  assert.match(await disabled.render({ provider: 'zai', model: 'glm-5' }), /^You are an AI agent powered by Zcode\./)
  const enabled = await boot({ userMappingsJson: JSON.stringify([{ id: 'on', modelPatterns: ['*glm*'], match: 'model', priority: 500, identity: 'You are an AI agent powered by User Rule.' }]) })
  assert.match(await enabled.render({ provider: 'zai', model: 'glm-5' }), /^You are an AI agent powered by User Rule\./)
})

test('plugin disposal restores the shipped identity (unload)', async () => {
  const app = await boot()
  const before = await app.render({ provider: 'zai', model: 'glm-5' })
  assert.match(before, /Zcode\./)
  app.dispose()
  const after = await app.render({ provider: 'zai', model: 'glm-5' })
  assert.equal(identityOf(after), DEFAULT_IDENTITY)
})

test('fresh boot reproduces the same result (DSH restart)', async () => {
  const first = await boot()
  const second = await boot()
  const selection = { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' }
  assert.equal(await first.render(selection), await second.render(selection))
})

test('identity change does not remove tool guidance sections', async () => {
  const app = await boot()
  const prompt = await app.render({ provider: 'openai', model: 'gpt-5' })
  assert.match(prompt, /You are a coding agent powered by the gpt-5 model\./)
  assert.equal(prompt.split('You are an AI agent').length - 1, 1)
})
