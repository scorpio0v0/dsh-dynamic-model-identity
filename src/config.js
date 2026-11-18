/**
 * Plugin configuration schema and volatile-field readers.
 *
 * Fields are volatile so the Client settings page can change them without a
 * DSH restart. Section text reads every field through {@link readField} on each
 * assembly, so edits take effect on the very next model step.
 *
 * @module dsh-dynamic-model-identity/src/config
 */

import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Resolve DSH's schemastery from the normal module graph, falling back to the
 * running CLI installation for a locally linked bundle or a test run.
 *
 * Git/registry installs get their peer dependencies into the package's
 * resolution scope, so the bare import succeeds there. Local `link:` installs
 * rely on `DSH_INSTALL_DIR` (or launching `dsh` from a checkout root, whose
 * `apps/cli` anchors the resolution).
 * @returns {any|undefined} schemastery default export, when available.
 */
async function loadSchemastery() {
  try {
    return (await import('@deepseek-ai/schemastery')).default
  } catch {
    const bases = [
      process.env.DSH_INSTALL_DIR,
      path.join(process.cwd(), 'apps/cli'),
    ].filter(base => typeof base === 'string' && base !== '')
    for (const base of bases) {
      try {
        const require = createRequire(`${base.replace(/\\/g, '/')}/package.json`)
        const module = require('@deepseek-ai/schemastery')
        return module.default ?? module
      } catch {
        // Try the next known DSH installation anchor.
      }
    }
    return undefined
  }
}

const z = await loadSchemastery()

/** Neutral fallback matching DSH's first-party opener exactly. */
export const DEFAULT_IDENTITY = 'You are an AI agent powered by DeepSeek Harness.'

/** Default plugin configuration values. */
export const CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  fallbackIdentity: DEFAULT_IDENTITY,
  identityTemplate: '',
  userMappingsJson: '',
  adaptRuntimeContexts: true,
})

/** Loader-time configuration schema; undefined when schemastery is not mounted. */
export const Config = z === undefined ? undefined : z.object({
  /** Master switch; when false, the built-in harness identity is left untouched. */
  enabled: z.boolean().default(true).volatile(),
  /** Identity used when no rule matches. */
  fallbackIdentity: z.string().default(DEFAULT_IDENTITY).volatile(),
  /** Optional template; `{{harness}}` is replaced with the winning rule's harness. Empty uses the rule's identity. */
  identityTemplate: z.string().default('').volatile(),
  /** JSON string of user mapping rules (array, or `{ rules: [...] }`). */
  userMappingsJson: z.string().default('').volatile(),
  /** Also swap the harness brand inside the `harness:source` / `app:web-surface` runtime-context paragraphs. */
  adaptRuntimeContexts: z.boolean().default(true).volatile(),
})

/**
 * Read a possibly volatile config field.
 * @param {Record<string, any>} config - config object supplied to `apply`.
 * @param {string} key - field name.
 * @returns {any} current field value, or undefined when absent.
 */
export function readField(config, key) {
  const field = config?.[key]
  if (field === undefined) return undefined
  return typeof field.get === 'function' ? field.get() : field
}

/**
 * Read all config fields as plain values.
 * @param {Record<string, any>} config - config object supplied to `apply`.
 * @returns {typeof CONFIG_DEFAULTS} plain current configuration.
 */
export function readConfig(config) {
  return {
    enabled: readField(config, 'enabled') ?? CONFIG_DEFAULTS.enabled,
    fallbackIdentity: readField(config, 'fallbackIdentity') ?? CONFIG_DEFAULTS.fallbackIdentity,
    identityTemplate: readField(config, 'identityTemplate') ?? CONFIG_DEFAULTS.identityTemplate,
    userMappingsJson: readField(config, 'userMappingsJson') ?? CONFIG_DEFAULTS.userMappingsJson,
    adaptRuntimeContexts: readField(config, 'adaptRuntimeContexts') ?? CONFIG_DEFAULTS.adaptRuntimeContexts,
  }
}
