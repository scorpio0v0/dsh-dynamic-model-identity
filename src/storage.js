/**
 * Local import/export helpers for user mapping rules.
 *
 * No network access and no DSH API calls: everything is JSON text manipulation
 * over the volatile `userMappingsJson` config field.
 *
 * @module dsh-dynamic-model-identity/src/storage
 */

/**
 * Parse user mapping text.
 * @param {string} text - JSON array or `{ rules: [...] }` object.
 * @returns {{ ok: boolean, rules: any[], error?: string }} parse result.
 */
export function parseUserMappings(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: true, rules: [] }
  try {
    const parsed = JSON.parse(text)
    const rules = Array.isArray(parsed) ? parsed : parsed?.rules
    if (!Array.isArray(rules)) return { ok: false, rules: [], error: 'Expected a JSON array or an object with a "rules" array.' }
    return { ok: true, rules }
  } catch (error) {
    return { ok: false, rules: [], error: error instanceof Error ? error.message : 'Invalid JSON.' }
  }
}

/**
 * Serialize rules for export or for writing back to config.
 * @param {any[]} rules - rules to serialize.
 * @returns {string} pretty-printed JSON with a `rules` wrapper.
 */
export function serializeUserMappings(rules) {
  return JSON.stringify({ version: 1, rules }, null, 2)
}

/**
 * Build the config patch that restores all defaults.
 * @returns {{ enabled: boolean, fallbackIdentity: string, identityTemplate: string, userMappingsJson: string }} patch.
 */
export function defaultConfigPatch() {
  return {
    enabled: true,
    fallbackIdentity: 'You are an AI agent powered by DeepSeek Harness.',
    identityTemplate: '',
    userMappingsJson: '',
  }
}
