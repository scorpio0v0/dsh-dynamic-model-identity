/**
 * User rule merging and identity resolution.
 *
 * All decisions are local: no network request is made during prompt assembly.
 * User rules are merged by `id`; a user rule with the same id replaces the
 * built-in rule, and `enabled: false` disables it. User rules are expected to
 * use priority >= 200 so they win over built-ins.
 *
 * @module dsh-dynamic-model-identity/src/identity-resolver
 */

import { pickRule } from './provider-matcher.js'
import { selectionLabel } from './model-detector.js'

/**
 * @typedef {import('./provider-matcher.js').MatchRule} MatchRule
 * @typedef {import('./provider-matcher.js').Selection} Selection
 */

/**
 * @typedef {object} ResolveResult
 * @property {string} identity - final identity text for the section.
 * @property {string} harness - harness name, or the neutral fallback name.
 * @property {string} ruleId - winning rule id, or `'(fallback)'`.
 * @property {string} reason - short explanation for diagnostics/UI.
 * @property {boolean} matched - whether a rule matched.
 */

/**
 * Merge built-in rules with user rules by id.
 * @param {MatchRule[]} builtinRules - rules from the shipped database.
 * @param {MatchRule[]} userRules - user-provided rules (overrides and additions).
 * @returns {MatchRule[]} merged rule list.
 */
export function mergeRules(builtinRules, userRules) {
  const merged = new Map()
  for (const rule of builtinRules) merged.set(rule.id, { ...rule })
  for (const rule of userRules) {
    if (rule === null || typeof rule !== 'object' || typeof rule.id !== 'string' || rule.id === '') continue
    merged.set(rule.id, { ...rule })
  }
  return [...merged.values()]
}

/**
 * Validate a rule object loaded from user configuration.
 * @param {unknown} value - candidate rule.
 * @returns {MatchRule|undefined} a normalized rule, or undefined when invalid.
 */
export function normalizeUserRule(value) {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = /** @type {Record<string, unknown>} */ (value)
  if (typeof candidate.id !== 'string' || candidate.id === '') return undefined
  if (typeof candidate.identity !== 'string' || candidate.identity === '') return undefined
  const mode = candidate.match === 'provider' || candidate.match === 'model-and-provider'
    ? candidate.match
    : 'model'
  const priority = typeof candidate.priority === 'number' && Number.isFinite(candidate.priority)
    ? candidate.priority
    : 200
  return {
    id: candidate.id,
    harness: typeof candidate.harness === 'string' ? candidate.harness : candidate.id,
    identity: candidate.identity,
    ...Array.isArray(candidate.modelPatterns)
      ? { modelPatterns: candidate.modelPatterns.filter(item => typeof item === 'string') }
      : {},
    ...Array.isArray(candidate.providerPatterns)
      ? { providerPatterns: candidate.providerPatterns.filter(item => typeof item === 'string') }
      : {},
    match: mode,
    enabled: candidate.enabled !== false,
    priority,
    ...typeof candidate.source === 'string' ? { source: candidate.source } : {},
    ...typeof candidate.notes === 'string' ? { notes: candidate.notes } : {},
  }
}

/**
 * Create a resolver bound to one rule database.
 * @param {object} options - resolver options.
 * @param {MatchRule[]} options.rules - built-in rules.
 * @param {{identity: string, harness: string}} options.defaults - neutral fallback.
 * @param {(key: string) => any} options.readConfig - read a volatile config field.
 * @returns {{ resolve: (selection: Selection) => ResolveResult, rules: () => MatchRule[] }} resolver.
 */
export function createIdentityResolver(options) {
  const { rules, defaults, readConfig } = options

  function activeRules() {
    const raw = readConfig('userMappingsJson')
    let userRules = []
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw)
        const candidates = Array.isArray(parsed) ? parsed : parsed?.rules
        if (Array.isArray(candidates)) {
          userRules = candidates.map(normalizeUserRule).filter(rule => rule !== undefined)
        }
      } catch {
        // Invalid user JSON must not break the prompt: use built-ins only.
        userRules = []
      }
    }
    return mergeRules(rules, userRules)
  }

  function resolve(selection) {
    const label = selectionLabel(selection)
    const fallbackIdentity = typeof readConfig('fallbackIdentity') === 'string' && readConfig('fallbackIdentity') !== ''
      ? readConfig('fallbackIdentity')
      : defaults.identity
    const { rule, score } = pickRule(activeRules(), selection)
    if (rule === undefined) {
      return {
        identity: fallbackIdentity,
        harness: defaults.harness,
        ruleId: '(fallback)',
        reason: `no rule matched ${label}`,
        matched: false,
      }
    }
    const identityTemplate = readConfig('identityTemplate')
    const identity = typeof identityTemplate === 'string' && identityTemplate.includes('{{harness}}')
      ? identityTemplate.replaceAll('{{harness}}', rule.harness)
      : rule.identity
    return {
      identity,
      harness: rule.harness,
      ruleId: rule.id,
      reason: `rule ${rule.id} matched ${label} (priority ${score[0]})`,
      matched: true,
    }
  }

  return { resolve, rules: activeRules }
}
