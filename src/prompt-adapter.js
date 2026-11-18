/**
 * Registers a scoped, per-agent prompt section that shadows the built-in
 * `harness:identity`. The section text is resolved on every prompt assembly.
 *
 * @module dsh-dynamic-model-identity/src/prompt-adapter
 */

import { DEFAULT_IDENTITY, readField } from './config.js'
import { detectSelection } from './model-detector.js'

/** Name shared with DSH's first-party identity section. */
export const IDENTITY_SECTION_NAME = 'harness:identity'

/**
 * Contributions from `@deepseek-ai/dsh-harness-dev-context` that carry the
 * harness brand: the checkout guidance section/context and the Web GUI
 * guidance section/context (plus any legacy paragraphs a Session replays).
 */
const RUNTIME_CONTEXT_NAMES = new Set(['harness:source', 'app:web-surface'])

/** Neutral brand the runtime-context paragraphs ship with. */
const NEUTRAL_BRAND = 'DeepSeek Harness'

/**
 * Swap the harness brand inside one runtime-context paragraph. Standalone
 * `DSH` follows the brand; lowercase CLI spellings (`dsh web`) and
 * `window.__DSH_BOOT__` stay untouched — case and word boundaries exclude
 * them, and those commands must keep working.
 * @param {string} text - paragraph text.
 * @param {string} harness - matched harness label.
 * @returns {string} branded paragraph.
 */
export function adaptRuntimeContextText(text, harness) {
  if (typeof text !== 'string') return text
  return text.replaceAll(NEUTRAL_BRAND, harness).replace(/\bDSH\b/g, harness)
}

/**
 * Create the adapter that installs identity sections on every Agent.
 * @param {object} options - adapter options.
 * @param {import('@deepseek-ai/cordis').Context} options.ctx - plugin context.
 * @param {Record<string, any>} options.config - volatile plugin config.
 * @param {{resolve: (selection: object) => object}} options.resolver - identity resolver.
 * @returns {{ install: () => () => void, text: (context: object) => string, last: () => object|undefined }} adapter.
 */
export function createPromptAdapter(options) {
  const { ctx, config, resolver } = options
  /** @type {Map<any, () => void>} */
  const disposers = new Map()
  let lastResolution

  /**
   * Resolve the section text for one assembly.
   * @param {object} context - assembly context.
   * @returns {string} final harness identity.
   */
  function text(context) {
    if (readField(config, 'enabled') === false) return DEFAULT_IDENTITY
    const selection = detectSelection(context)
    const result = resolver.resolve(selection)
    lastResolution = { ...result, selection, at: Date.now() }
    return result.identity
  }

  /**
   * Install the scoped section on one Agent's context.
   * @param {any} agent - live Agent from `agent/created`.
   */
  function installOnAgent(agent) {
    if (disposers.has(agent)) return
    const agentCtx = agent.ctx
    const off = agentCtx.effect(() => agentCtx.systemPrompt.section({
      name: IDENTITY_SECTION_NAME,
      order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
      interpolate: false,
      text,
    }), `dynamic-model-identity:${agent.id}`)
    disposers.set(agent, off)
  }

  /**
   * Listen on the presentation waterfall and brand the harness-dev runtime
   * contexts per step. Runs after `next()` so it sees the final presentation;
   * every failure degrades to the untouched presentation — a throwing
   * listener would fail Agent creation.
   * @returns {() => void} listener disposer.
   */
  function installRuntimeContextAdaptation() {
    return ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const presentation = await next()
      try {
        if (readField(config, 'enabled') === false || readField(config, 'adaptRuntimeContexts') === false) return presentation
        const selection = detectSelection(context)
        const { harness } = resolver.resolve(selection)
        if (harness === NEUTRAL_BRAND) return presentation
        const swap = (entry) => RUNTIME_CONTEXT_NAMES.has(entry.name) && typeof entry.text === 'string'
          ? { ...entry, text: adaptRuntimeContextText(entry.text, harness) }
          : entry
        return {
          ...presentation,
          sections: presentation.sections.map(swap),
          contexts: presentation.contexts.map(swap),
        }
      } catch {
        return presentation
      }
    }, { global: true })
  }

  /**
   * Start listening for Agent creation.
   * @returns {() => void} disposer for the listeners and all installed sections.
   */
  function install() {
    const offCreated = ctx.on('agent/created', ({ agent }) => {
      installOnAgent(agent)
    }, { global: true })
    const offAssemble = installRuntimeContextAdaptation()
    return () => {
      offCreated()
      offAssemble()
      dispose()
    }
  }

  /** Dispose every installed section. */
  function dispose() {
    for (const off of disposers.values()) off()
    disposers.clear()
  }

  return { install, text, last: () => lastResolution }
}
