/**
 * Model-name and provider-name pattern matching for dynamic harness identity.
 *
 * A pattern is either exact (no `*`) or a wildcard glob where `*` matches any
 * sequence of characters. Matching is case-insensitive. Patterns are applied to
 * the raw model/provider id, so vendor-prefixed ids such as
 * `zcode/GLM-5.3-Flash` and `workbuddy/glm-5.3-flash` are supported.
 *
 * @module dsh-dynamic-model-identity/src/provider-matcher
 */

/**
 * @typedef {object} MatchRule
 * @property {string} id
 * @property {string} harness
 * @property {string} identity
 * @property {string[]} [modelPatterns]
 * @property {string[]} [providerPatterns]
 * @property {'model'|'provider'|'model-and-provider'} [match]
 * @property {boolean} [enabled]
 * @property {number} [priority]
 * @property {string} [source]
 */

/**
 * @typedef {object} Selection
 * @property {string} [provider]
 * @property {string} [model]
 */

/**
 * Escape a literal pattern and turn `*` wildcards into `.*`.
 * @param {string} pattern - pattern to compile.
 * @returns {RegExp} anchored case-insensitive regular expression.
 */
export function compilePattern(pattern) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`, 'i')
}

/**
 * Count literal (non-wildcard) characters — used as a specificity tiebreaker.
 * @param {string} pattern - pattern to score.
 * @returns {number} count of non-`*` characters.
 */
export function patternSpecificity(pattern) {
  return String(pattern).replace(/\*/g, '').length
}

/**
 * Test one pattern against one value.
 * @param {string} pattern - exact or wildcard pattern.
 * @param {string|undefined} value - value to test.
 * @returns {boolean} whether the pattern matches.
 */
export function matchesPattern(pattern, value) {
  if (typeof value !== 'string' || value.length === 0) return false
  return compilePattern(pattern).test(value)
}

/**
 * Return the highest specificity among the patterns that match a value.
 * @param {string[]|undefined} patterns - patterns to try.
 * @param {string|undefined} value - value to test.
 * @returns {number} best specificity, or 0 when nothing matches.
 */
function bestSpecificity(patterns, value) {
  if (!Array.isArray(patterns)) return 0
  let best = 0
  for (const pattern of patterns) {
    if (matchesPattern(pattern, value)) {
      best = Math.max(best, patternSpecificity(pattern))
    }
  }
  return best
}

const MODE_SPECIFICITY = {
  'model-and-provider': 3,
  'model': 2,
  'provider': 1,
}

/**
 * Evaluate a rule against a model selection.
 * @param {MatchRule} rule - enabled rule to evaluate.
 * @param {Selection} selection - selection supplied by the assembly context.
 * @returns {{ matched: boolean, score: [number, number, number, string] }} match result and comparison tuple.
 */
export function evaluateRule(rule, selection) {
  const mode = rule.match === 'provider' || rule.match === 'model-and-provider'
    ? rule.match
    : 'model'
  const modelScore = bestSpecificity(rule.modelPatterns, selection?.model)
  const providerScore = bestSpecificity(rule.providerPatterns, selection?.provider)

  let matched = false
  let specificity = 0
  if (mode === 'model') {
    matched = modelScore > 0
    specificity = modelScore
  } else if (mode === 'provider') {
    matched = providerScore > 0
    specificity = providerScore
  } else {
    matched = modelScore > 0 && providerScore > 0
    specificity = modelScore + providerScore
  }

  return {
    matched,
    score: [rule.priority ?? 0, MODE_SPECIFICITY[mode], specificity, rule.id ?? ''],
  }
}

/**
 * Compare two match tuples. Higher values win; the id is compared in reverse
 * so that the lexicographically smaller rule id wins a full tie.
 * @param {[number, number, number, string]} left - first tuple.
 * @param {[number, number, number, string]} right - second tuple.
 * @returns {number} positive when left wins, negative when right wins.
 */
export function compareScores(left, right) {
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return left[3] < right[3] ? 1 : left[3] > right[3] ? -1 : 0
}

/**
 * Select the winning rule for a selection. Conflict resolution: highest
 * priority, then most specific mode (model+provider > model > provider), then
 * most specific pattern, then lexicographically smallest rule id.
 * @param {MatchRule[]} rules - enabled rules.
 * @param {Selection} selection - current model selection.
 * @returns {{ rule: MatchRule|undefined, score: [number,number,number,string]|undefined }} winner.
 */
export function pickRule(rules, selection) {
  let winner
  let winnerScore
  for (const rule of rules) {
    if (rule.enabled === false) continue
    const { matched, score } = evaluateRule(rule, selection)
    if (!matched) continue
    if (winnerScore === undefined || compareScores(score, winnerScore) > 0) {
      winner = rule
      winnerScore = score
    }
  }
  return { rule: winner, score: winnerScore }
}
