import test from 'node:test'
import assert from 'node:assert/strict'
import { createIdentityResolver, mergeRules, normalizeUserRule } from '../src/identity-resolver.js'
import { DEFAULT_IDENTITY } from '../src/config.js'

const defaults = { identity: DEFAULT_IDENTITY, harness: 'DeepSeek Harness' }
const builtin = [
  { id: 'glm', harness: 'Zcode', identity: 'You are an AI agent powered by Zcode.', modelPatterns: ['*glm*'], match: 'model', enabled: true, priority: 96 },
  { id: 'deepseek', harness: 'DeepSeek Harness', identity: DEFAULT_IDENTITY, modelPatterns: ['*deepseek*'], match: 'model', enabled: true, priority: 94 },
]

function resolver(config = {}) {
  return createIdentityResolver({ rules: builtin, defaults, readConfig: key => config[key] })
}

test('user rules override built-ins by id', () => {
  const merged = mergeRules(builtin, [{ id: 'glm', harness: 'Custom', identity: 'Custom identity.', priority: 300 }])
  assert.equal(merged.length, 2)
  assert.equal(merged.find(r => r.id === 'glm').harness, 'Custom')
})

test('normalizeUserRule validates required fields and supplies safe defaults', () => {
  assert.equal(normalizeUserRule({ id: 'x', identity: 'Hi.' }).priority, 200)
  assert.equal(normalizeUserRule({ identity: 'Hi.' }), undefined)
  assert.equal(normalizeUserRule({ id: 'x' }), undefined)
  assert.equal(normalizeUserRule({ id: 'x', identity: 'Hi.', enabled: false }).enabled, false)
})

test('resolve uses the winning rule identity', () => {
  const result = resolver().resolve({ provider: 'magpie', model: 'zcode/GLM-5.3-Flash' })
  assert.equal(result.identity, 'You are an AI agent powered by Zcode.')
  assert.equal(result.ruleId, 'glm')
  assert.equal(result.matched, true)
})

test('neutral fallback is byte-identical to the DSH opener', () => {
  const result = resolver().resolve({ provider: 'magpie', model: 'workbuddy/hy4flash-free' })
  assert.equal(result.identity, DEFAULT_IDENTITY)
  assert.equal(result.ruleId, '(fallback)')
  assert.equal(result.matched, false)
})

test('missing model/provider also falls back without throwing', () => {
  assert.equal(resolver().resolve({}).identity, DEFAULT_IDENTITY)
  assert.equal(resolver().resolve({ provider: 'magpie' }).identity, DEFAULT_IDENTITY)
})

test('a user rule can be disabled by id', () => {
  const r = resolver({ userMappingsJson: JSON.stringify({ rules: [{ id: 'glm', enabled: false, priority: 300, identity: 'X' }] }) })
  assert.equal(r.resolve({ model: 'glm-5' }).ruleId, '(fallback)')
})

test('a user rule can override the harness and identity', () => {
  const r = resolver({ userMappingsJson: JSON.stringify([{ id: 'my-glm', modelPatterns: ['glm-*'], match: 'model', identity: 'You are an AI agent powered by My Harness.', harness: 'My Harness', priority: 300 }]) })
  assert.equal(r.resolve({ model: 'glm-5' }).identity, 'You are an AI agent powered by My Harness.')
})

test('identityTemplate interpolates {{harness}}', () => {
  const r = resolver({ identityTemplate: 'You are an AI agent powered by {{harness}} (custom).' })
  assert.equal(r.resolve({ model: 'glm-5' }).identity, 'You are an AI agent powered by Zcode (custom).')
})

test('invalid user JSON is ignored rather than breaking assembly', () => {
  const r = resolver({ userMappingsJson: '{ not json' })
  assert.equal(r.resolve({ model: 'glm-5' }).ruleId, 'glm')
})

test('custom fallbackIdentity is honored', () => {
  const r = resolver({ fallbackIdentity: 'Neutral.' })
  assert.equal(r.resolve({ model: 'unknown' }).identity, 'Neutral.')
})
