/**
 * Resolves DSH packages from a running checkout for tests that exercise the
 * real Prompt Assembly API. Anchors, in order: DSH_CLI_DIR, DSH_INSTALL_DIR,
 * then `apps/cli` under the current working directory. Point DSH_CLI_DIR at
 * `packages/core/system-prompt` of a checkout — apps/cli's graph lacks
 * `@deepseek-ai/dsh-scope`.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const candidates = [
  process.env.DSH_CLI_DIR,
  process.env.DSH_INSTALL_DIR,
  process.cwd() + '/apps/cli',
].filter(base => typeof base === 'string' && base !== '').map(base => String(base).replace(/\\/g, '/'))

const cliDir = candidates.find(base => existsSync(base + '/package.json'))

if (cliDir === undefined) {
  throw new Error(
    'dsh-dynamic-model-identity integration tests need a DSH checkout. '
    + 'Set DSH_CLI_DIR to a checkout directory that resolves @deepseek-ai/cordis, '
    + '@deepseek-ai/dsh-scope and @deepseek-ai/dsh-system-prompt — for example '
    + '<checkout>/packages/core/system-prompt (apps/cli works for the latter two but has no dsh-scope).',
  )
}

const require = createRequire(`${cliDir}/package.json`)

/**
 * Import a DSH package from the CLI's resolved dependency graph.
 * @param {string} specifier - package specifier.
 * @returns {Promise<any>} module namespace.
 */
export function loadDsh(specifier) {
  return import(pathToFileURL(require.resolve(specifier)).href)
}
