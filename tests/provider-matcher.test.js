import test from 'node:test'
import assert from 'node:assert/strict'
import { compilePattern, matchesPattern, evaluateRule, pickRule } from '../src/provider-matcher.js'

const rule = (id, overrides = {}) => ({
  id,
  identity: `You are an AI agent powered by ${id}.`,
  harness: id,
  match: 'model',
  enabled: true,
  priority: 10,
  ...overrides,
})

test('exact patterns are case-insensitive full-string matches', () => {
  assert.equal(matchesPattern('glm-4.6', 'GLM-4.6'), true)
  assert.equal(matchesPattern('glm-4.6', 'glm-4.6-turbo'), false)
  assert.equal(compilePattern('anthropic').test('magpie-anthropic'), false)
})

test('wildcards match any sequence including slashes', () => {
  assert.equal(matchesPattern('*glm*', 'zcode/GLM-5.3-Flash'), true)
  assert.equal(matchesPattern('workbuddy/*', 'workbuddy/hy4flash-free'), true)
  assert.equal(matchesPattern('zcode/*', 'zcode/GLM-5.2'), true)
  assert.equal(matchesPattern('gpt-*', 'chatgpt-5'), false)
})

test('match modes respect their dimensions', () => {
  const both = rule('both', { modelPatterns: ['glm-*'], providerPatterns: ['zai'], match: 'model-and-provider' })
  assert.equal(evaluateRule(both, { model: 'glm-5', provider: 'zai' }).matched, true)
  assert.equal(evaluateRule(both, { model: 'glm-5', provider: 'magpie' }).matched, false)
  const providerOnly = rule('p', { providerPatterns: ['magpie'], match: 'provider' })
  assert.equal(evaluateRule(providerOnly, { model: 'anything', provider: 'magpie' }).matched, true)
  assert.equal(evaluateRule(providerOnly, { model: 'magpie-x', provider: 'openai' }).matched, false)
})

test('priority outranks mode and specificity', () => {
  const winner = pickRule([
    rule('low', { modelPatterns: ['*glm*'], match: 'model', priority: 5 }),
    rule('high', { modelPatterns: ['glm-*'], match: 'model', priority: 100 }),
  ], { model: 'glm-5', provider: 'x' })
  assert.equal(winner.rule.id, 'high')
})

test('mode specificity breaks priority ties', () => {
  const winner = pickRule([
    rule('model-only', { modelPatterns: ['*glm*'], match: 'model', priority: 50 }),
    rule('both', { modelPatterns: ['*glm*'], providerPatterns: ['zai'], match: 'model-and-provider', priority: 50 }),
  ], { model: 'glm-5', provider: 'zai' })
  assert.equal(winner.rule.id, 'both')
})

test('pattern specificity then id break remaining ties deterministically', () => {
  const winner = pickRule([
    rule('z-generic', { modelPatterns: ['*glm*'], match: 'model', priority: 50 }),
    rule('a-specific', { modelPatterns: ['glm-5*'], match: 'model', priority: 50 }),
  ], { model: 'glm-5.3', provider: 'x' })
  assert.equal(winner.rule.id, 'a-specific')
  assert.equal(pickRule([
    rule('z-exact', { modelPatterns: ['glm-5'], match: 'model', priority: 50 }),
    rule('a-exact', { modelPatterns: ['glm-5'], match: 'model', priority: 50 }),
  ], { model: 'glm-5', provider: 'x' }).rule.id, 'a-exact')
})

test('disabled rules never win', () => {
  const winner = pickRule([
    rule('disabled', { modelPatterns: ['*'], match: 'model', priority: 999, enabled: false }),
    rule('enabled', { modelPatterns: ['glm-*'], match: 'model', priority: 1 }),
  ], { model: 'glm-5', provider: 'x' })
  assert.equal(winner.rule.id, 'enabled')
})
