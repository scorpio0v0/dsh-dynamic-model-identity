/**
 * DSH dynamic model identity adapter.
 *
 * Replaces the built-in `harness:identity` section per Agent with a section
 * whose text is resolved from the live model selection at each prompt
 * assembly. No core source, profile patch, or node_modules is modified.
 *
 * @module dsh-dynamic-model-identity
 */

import { createRequire } from 'node:module'
import { Config, readField } from './src/config.js'
import { createIdentityResolver } from './src/identity-resolver.js'
import { createPromptAdapter } from './src/prompt-adapter.js'

const require = createRequire(import.meta.url)
const mappings = require('./src/data/provider-mappings.json')

export { Config }
// Property access to `ctx.systemPrompt` (prompt-adapter) requires the service
// to be declared; an empty inject list makes every `agent/created` listener
// throw `cannot get property "systemPrompt" without inject`, which fails
// Agent creation and with it every session.
export const inject = ['systemPrompt']

/**
 * Plugin entry.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 * @param {Record<string, any>} config - validated volatile plugin config.
 */
export function apply(ctx, config) {
  const resolver = createIdentityResolver({
    rules: mappings.rules,
    defaults: mappings.defaults,
    readConfig: key => readField(config, key),
  })
  const adapter = createPromptAdapter({ ctx, config, resolver })

  ctx.effect(() => adapter.install(), 'dsh-dynamic-model-identity: prompt sections and runtime contexts')

  // The plugin ships its own Client settings page, so suppress the generated
  // settings entry. The child fiber stays pending in profiles without settings.
  ctx.inject(['settings'], child => {
    child.effect(
      () => child.settings.configure({ auto: false }, ctx.fiber),
      'dsh-dynamic-model-identity: hide generated settings',
    )
  })

  ctx.logger?.info?.('dsh-dynamic-model-identity: installed dynamic harness identity adapter')
}
