/**
 * Detect the live model selection from a prompt assembly context.
 *
 * DSH records the model choice per step. `context.modelSelection` is that
 * captured selection; the Agent's startup options are only a fallback for
 * diagnostic assemblies that have no step context.
 *
 * @module dsh-dynamic-model-identity/src/model-detector
 */

/**
 * @typedef {import('./provider-matcher.js').Selection} Selection
 */

/**
 * Normalize a raw selection into a comparable shape.
 * @param {{ provider?: unknown, model?: unknown, reasoningEffort?: unknown }|undefined} raw - raw selection.
 * @returns {Selection & { reasoningEffort?: string }} normalized selection, with empty strings omitted.
 */
export function normalizeSelection(raw) {
  if (raw === null || typeof raw !== 'object') return {}
  const provider = typeof raw.provider === 'string' ? raw.provider : ''
  const model = typeof raw.model === 'string' ? raw.model : ''
  const reasoningEffort = typeof raw.reasoningEffort === 'string' ? raw.reasoningEffort : ''
  return {
    ...provider === '' ? {} : { provider },
    ...model === '' ? {} : { model },
    ...reasoningEffort === '' ? {} : { reasoningEffort },
  }
}

/**
 * Read the live selection from a `systemPrompt.assemble()` context.
 * @param {import('@deepseek-ai/dsh-system-prompt').AssembleContext & {
 *   modelSelection?: Selection, agent?: { options?: { provider?: string, model?: string } }
 * }} context - assembly context supplied by the agent loop.
 * @returns {Selection & { source: 'step'|'agent-options'|'none' }} detected selection and its origin.
 */
export function detectSelection(context) {
  const stepSelection = normalizeSelection(context?.modelSelection)
  if (stepSelection.provider !== undefined && stepSelection.model !== undefined) {
    return { ...stepSelection, source: 'step' }
  }
  const options = context?.agent?.options
  const fallback = normalizeSelection({
    provider: options?.provider,
    model: options?.model,
  })
  if (fallback.provider !== undefined && fallback.model !== undefined) {
    return { ...fallback, source: 'agent-options' }
  }
  return { ...stepSelection, ...fallback, source: 'none' }
}

/**
 * Build a stable human-readable label for a selection.
 * @param {Selection} selection - selection to label.
 * @returns {string} label such as `magpie-anthropic/zcode/GLM-5.3-Flash`.
 */
export function selectionLabel(selection) {
  if (selection.provider === undefined && selection.model === undefined) return '(unknown)'
  if (selection.provider === undefined) return selection.model
  if (selection.model === undefined) return selection.provider
  return `${selection.provider}/${selection.model}`
}
