import test from 'node:test'
import assert from 'node:assert/strict'
import { loadDsh } from './dsh-loader.js'
import { createIdentityResolver } from '../src/identity-resolver.js'
import { createPromptAdapter, IDENTITY_SECTION_NAME } from '../src/prompt-adapter.js'
import { DEFAULT_IDENTITY } from '../src/config.js'
import mappings from '../src/data/provider-mappings.json' with { type: 'json' }

/**
 * Exercises the plugin against DSH's real SystemPrompt service. A minted scope
 * plays the role of an Agent's scoped context, which is where the plugin
 * registers its shadowing section in production.
 */
async function mount() {
  const { Context } = await loadDsh('@deepseek-ai/cordis')
  const { createScope, scopeOf } = await loadDsh('@deepseek-ai/dsh-scope')
  const SystemPromptModule = await loadDsh('@deepseek-ai/dsh-system-prompt')
  const SystemPrompt = SystemPromptModule.default
  const { renderPrompt } = SystemPromptModule

  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {
    personaPrefix: 'You are a coding agent powered by the {{model}} model.',
    personaSuffix: '',
  })
  // agent-loop registers these in production; mirror them for the fixture.
  ctx.systemPrompt.variable('model', context => context.modelSelection?.model ?? 'unspecified-model')
  ctx.systemPrompt.variable('provider', context => context.modelSelection?.provider ?? 'unspecified-provider')
  let scope
  await ctx.plugin(Object.assign((inner) => {
    scope = createScope(inner, { name: 'identity-test-agent' })
  }, { inject: ['systemPrompt'] }))
  return { ctx, scope, scopeKey: scopeOf(scope.ctx), renderPrompt }
}

function installSection(scope, ctx, config) {
  const resolver = createIdentityResolver({
    rules: mappings.rules,
    defaults: mappings.defaults,
    readConfig: key => config[key],
  })
  const adapter = createPromptAdapter({ ctx, config, resolver })
  scope.ctx.systemPrompt.section({
    name: IDENTITY_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    interpolate: false,
    text: adapter.text,
  })
  return adapter
}

test('real assembly: GLM model yields the Zcode identity with no duplicate opener', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  installSection(scope, ctx, {})
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({
    scope: scopeKey,
    modelSelection: { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' },
  }))
  assert.match(prompt, /^You are an AI agent powered by Zcode\./)
  assert.equal(prompt.split('You are an AI agent').length - 1, 1, 'exactly one harness identity')
  assert.match(prompt, /You are a coding agent powered by the zcode\/GLM-5\.3-Flash model\./)
})

test('real assembly: switching models changes identity without re-registration', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  installSection(scope, ctx, {})
  const cases = [
    [{ provider: 'magpie', model: 'workbuddy/deepseek-v4.1-flash' }, 'You are an AI agent powered by WorkBuddy.'],
    [{ provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' }, 'You are an AI agent powered by Zcode.'],
    [{ provider: 'openai', model: 'gpt-5' }, 'You are an AI agent powered by OpenAI Codex.'],
    [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }, 'You are an AI agent powered by Claude Code.'],
    [{ provider: 'google', model: 'gemini-2.5-pro' }, 'You are an AI agent powered by Google Gemini CLI.'],
    [{ provider: 'magpie', model: 'workbuddy/hy4flash-free' }, 'You are an AI agent powered by WorkBuddy.'],
  ]
  for (const [selection, expected] of cases) {
    const prompt = renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: selection }))
    assert.equal(prompt.split('\n\n')[0], expected, `identity for ${selection.provider}/${selection.model}`)
    assert.equal(prompt.split('You are an AI agent').length - 1, 1, `single identity for ${selection.model}`)
  }
})

test('real assembly: other sections and persona are preserved', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  ctx.systemPrompt.section({ name: 'test:guidance', order: 100, text: 'Extra guidance.' })
  installSection(scope, ctx, {})
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({
    scope: scopeKey,
    modelSelection: { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' },
  }))
  assert.match(prompt, /Extra guidance\./)
  assert.match(prompt, /You are a coding agent powered by/)
})

test('real assembly: missing selection falls back neutrally', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  installSection(scope, ctx, {})
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeKey }))
  assert.equal(prompt.split('\n\n')[0], DEFAULT_IDENTITY)
})

test('real assembly: user override wins over built-in rule', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  installSection(scope, ctx, {
    userMappingsJson: JSON.stringify([{
      id: 'my-zcode', modelPatterns: ['*glm*'], match: 'model', priority: 300,
      identity: 'You are an AI agent powered by My Zcode.', harness: 'My Zcode',
    }]),
  })
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({
    scope: scopeKey,
    modelSelection: { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' },
  }))
  assert.match(prompt, /^You are an AI agent powered by My Zcode\./)
})

test('disposing the section restores the built-in identity', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  const dispose = scope.ctx.systemPrompt.section({
    name: IDENTITY_SECTION_NAME,
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    interpolate: false,
    text: () => 'You are an AI agent powered by Zcode.',
  })
  const withPlugin = renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: { model: 'glm-5' } }))
  assert.match(withPlugin, /Zcode\./)
  dispose()
  const withoutPlugin = renderPrompt(await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: { model: 'glm-5' } }))
  assert.equal(withoutPlugin.split('\n\n')[0], DEFAULT_IDENTITY)
})

test('runtime-context paragraphs are branded per step via the assemble waterfall', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  // Mirror @deepseek-ai/dsh-harness-dev-context's global contributions.
  ctx.systemPrompt.section({
    name: 'harness:source', order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'), interpolate: false,
    text: 'The runtime context names the DeepSeek Harness implementation checkout. Use this checkout only to inspect or extend DSH itself.',
  })
  ctx.systemPrompt.context({
    name: 'app:web-surface', order: ctx.systemPrompt.getContextOrder('WEB_SURFACE'), interpolate: false,
    text: 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. Only dsh web injects window.__DSH_BOOT__.',
  })
  const resolver = createIdentityResolver({ rules: mappings.rules, defaults: mappings.defaults, readConfig: key => ({}) })
  const adapter = createPromptAdapter({ ctx, config: {}, resolver })
  const dispose = adapter.install()
  const offIdentity = scope.ctx.systemPrompt.section({
    name: IDENTITY_SECTION_NAME, order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    interpolate: false, text: adapter.text,
  })
  try {
    // GLM step: brand swapped in the section and the context, commands untouched, opener branded.
    const glm = await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' } })
    const glmPrompt = renderPrompt(glm)
    assert.match(glmPrompt, /the Zcode implementation checkout/)
    assert.match(glmPrompt, /inspect or extend Zcode itself/)
    assert.equal(glmPrompt.split('\n\n')[0], 'You are an AI agent powered by Zcode.')
    const glmWeb = glm.contexts.find(entry => entry.name === 'app:web-surface')
    assert.match(glmWeb.text, /the Zcode Web GUI/)
    assert.match(glmWeb.text, /Only dsh web injects window\.__DSH_BOOT__/)

    // DeepSeek step: brand is already neutral — text stays byte-identical.
    const deepseek = await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: { provider: 'magpie', model: 'deepseek-chat' } })
    const deepseekPrompt = renderPrompt(deepseek)
    assert.match(deepseekPrompt, /the DeepSeek Harness implementation checkout/)
    assert.match(deepseekPrompt, /inspect or extend DSH itself/)
    assert.match(deepseek.contexts.find(entry => entry.name === 'app:web-surface').text, /the DeepSeek Harness Web GUI/)
  } finally {
    offIdentity()
    dispose()
  }
})

test('adaptRuntimeContexts: false leaves runtime-context paragraphs untouched', async () => {
  const { ctx, scope, scopeKey, renderPrompt } = await mount()
  ctx.systemPrompt.section({
    name: 'harness:source', order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'), interpolate: false,
    text: 'The runtime context names the DeepSeek Harness implementation checkout.',
  })
  const resolver = createIdentityResolver({ rules: mappings.rules, defaults: mappings.defaults, readConfig: key => ({}) })
  const adapter = createPromptAdapter({ ctx, config: { adaptRuntimeContexts: false }, resolver })
  const dispose = adapter.install()
  const offIdentity = scope.ctx.systemPrompt.section({
    name: IDENTITY_SECTION_NAME, order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    interpolate: false, text: adapter.text,
  })
  try {
    const glm = await ctx.systemPrompt.assemble({ scope: scopeKey, modelSelection: { provider: 'magpie-anthropic', model: 'zcode/GLM-5.3-Flash' } })
    assert.match(renderPrompt(glm), /the DeepSeek Harness implementation checkout/)
    assert.equal(renderPrompt(glm).split('\n\n')[0], 'You are an AI agent powered by Zcode.')
  } finally {
    offIdentity()
    dispose()
  }
})
