/**
 * Browser half: plugin settings card in Plugin Manager.
 *
 * Hand-written dynamic Client artifact. It uses only the slots, locale and
 * configForms services; no Harness package is imported as a module.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-dynamic-model-identity',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState } = React

    const NS = 'dynamic-model-identity'

    const en = {
      title: 'Dynamic model identity',
      enabled: 'Enable dynamic identity',
      enabledHint: 'Adapt the harness opener to the selected model on every step.',
      adapt: 'Adapt runtime-context paragraphs too',
      adaptHint: 'Also swap "DeepSeek Harness" / "DSH" inside the checkout and Web-GUI guidance paragraphs to the matched harness. Paths, URLs, and CLI spellings (dsh web, __DSH_BOOT__) stay untouched.',
      current: 'Current selection',
      provider: 'Provider',
      model: 'Model',
      harness: 'Detected harness',
      identity: 'Effective identity',
      noModel: 'No model selection is available yet.',
      previewNote: 'Preview uses the default model selection. Sessions may override it; the authoritative identity is resolved per step on the Host.',
      rules: 'User mapping rules',
      rulesHint: 'JSON array or { "rules": [...] }. Same id overrides a built-in rule; enabled: false disables it. Use priority 200 or higher.',
      saveRules: 'Save rules',
      saved: 'Saved',
      invalidJson: 'Invalid JSON',
      custom: 'Custom identity',
      customHint: 'Leave empty to use the rule identity. {{harness}} is replaced by the detected harness.',
      import: 'Import',
      export: 'Export',
      reset: 'Restore defaults',
      matchedRule: 'Matched rule',
      fallback: 'No rule matched',
      explainTitle: 'How matching works',
      explain1: 'Patterns apply to the model ID and the provider ID, case-insensitive. `*` matches any sequence (including /); a pattern without `*` is an exact full-string match. "glm-*" hits glm-4.6 but not chatgpt-5.',
      explain2: 'The winner is the highest-scoring rule: priority first (higher wins), then match mode (model-and-provider > model > provider), then pattern specificity (more literal characters), then rule id.',
      explain3: 'Built-in rules occupy priority 10-100. User rules should use 200+ to override; a user rule with the same id replaces the built-in one, and enabled:false disables that id.',
      explain4: 'No rule matched → the factory opener is kept (neutral fallback).',
      builtins: 'Built-in rules (enabled, click to expand)',
      templatesNote: '12 more template rules ship disabled by default (OpenRouter, SiliconFlow, Ollama, vLLM, LM Studio, magpie...). Enable one by adding a user rule with the same id and enabled:true.',
      fallbackNote: 'No rule matched, so the factory opener is kept. Add a user rule below to map this model.',
    }
    const zh = {
      title: '动态模型身份适配',
      enabled: '启用动态身份',
      enabledHint: '每一步都根据当前模型调整 Harness 开场白。',
      adapt: '同时适配 runtime context 段落',
      adaptHint: '把 checkout 与 Web GUI 引导段里的 "DeepSeek Harness" / "DSH" 也替换为命中的 Harness。路径、URL 与命令字样（dsh web、__DSH_BOOT__）保持原样。',
      current: '当前模型选择',
      provider: 'Provider',
      model: '模型',
      harness: '识别到的 Harness',
      identity: '当前生效的 Identity',
      noModel: '当前没有可用的模型选择。',
      previewNote: '预览使用默认模型选择。单个会话可能覆盖它；真正生效的身份由 Host 在每步装配时解析。',
      rules: '用户映射规则',
      rulesHint: 'JSON 数组或 { "rules": [...] }。相同 id 覆盖内置规则；enabled: false 禁用规则。请使用 200 以上的 priority。',
      saveRules: '保存规则',
      saved: '已保存',
      invalidJson: 'JSON 无效',
      custom: '自定义 Identity',
      customHint: '留空则使用规则自带的 identity。{{harness}} 会被替换为识别到的 Harness。',
      import: '导入',
      export: '导出',
      reset: '恢复默认设置',
      matchedRule: '命中的规则',
      fallback: '没有规则命中',
      explainTitle: '规则是怎么匹配的',
      explain1: 'pattern 作用于「模型 ID」与「Provider ID」两列，不区分大小写。`*` 匹配任意字符序列（含 /）；不含 `*` 的 pattern 为全串精确匹配。例如 "glm-*" 命中 glm-4.6，但不会命中 chatgpt-5。',
      explain2: '命中规则取「得分最高」者：先比 priority（数字大者优先），再比匹配模式（model-and-provider > model > provider），再比 pattern 具体度（字面字符多者优先），最后比 id 字典序。',
      explain3: '内置规则占用 priority 10–100；用户规则请用 200 以上才能压过内置。相同 id 直接覆盖内置规则；enabled:false 表示按 id 禁用。',
      explain4: '没有任何规则命中时 → 保留出厂开场白（中性回退）。',
      builtins: '内置规则（已启用，点击展开）',
      templatesNote: '另有 12 条默认关闭的模板规则（OpenRouter、SiliconFlow、Together、Fireworks、Ollama、vLLM、LM Studio、magpie 等——它们是路由器/宿主，不是模型官方平台）。想启用某条：在用户规则里写相同 id 并 enabled:true。',
      fallbackNote: '没有规则命中，保留出厂开场白。可在下方用户规则里为该模型添加映射。',
    }

    // Compact snapshot of the enabled built-in rules, used for the preview
    // only. The Host resolves the authoritative identity from the full DB.
    const RULES = [
      { id: 'zai-glm-official', harness: 'Zcode', identity: 'You are an AI agent powered by Zcode.', m: ['glm-*', '*glm*', 'zcode/*'], p: ['zai', 'zhipu', 'zhipuai', 'z.ai', 'zcode', 'zai-org'], mch: 'model-and-provider', pri: 100 },
      { id: 'zcode-model-any-provider', harness: 'Zcode', identity: 'You are an AI agent powered by Zcode.', m: ['*zcode/*', '*glm*'], p: [], mch: 'model', pri: 96 },
      { id: 'deepseek-model-official', harness: 'DeepSeek Harness', identity: 'You are an AI agent powered by DeepSeek Harness.', m: ['*deepseek*'], p: ['deepseek', 'deepseek-official', 'deepseek-ai', 'deepseek-account'], mch: 'model-and-provider', pri: 95 },
      { id: 'deepseek-model-any-provider', harness: 'DeepSeek Harness', identity: 'You are an AI agent powered by DeepSeek Harness.', m: ['*deepseek*', 'workbuddy/deepseek*', 'auto/deepseek*'], p: [], mch: 'model', pri: 94 },
      { id: 'openai-codex-model-official', harness: 'OpenAI Codex', identity: 'You are an AI agent powered by OpenAI Codex.', m: ['gpt-*', 'codex-*', 'o1*', 'o3*', 'o4*', 'o5*', 'chatgpt-*'], p: ['openai', 'openai-official'], mch: 'model-and-provider', pri: 93 },
      { id: 'anthropic-claude-model-official', harness: 'Claude Code', identity: 'You are an AI agent powered by Claude Code.', m: ['claude-*'], p: ['anthropic'], mch: 'model-and-provider', pri: 93 },
      { id: 'openai-codex-model-any-provider', harness: 'OpenAI Codex', identity: 'You are an AI agent powered by OpenAI Codex.', m: ['gpt-*', 'codex-*', 'o1*', 'o3*', 'o4*', 'o5*'], p: [], mch: 'model', pri: 90 },
      { id: 'anthropic-claude-model-any-provider', harness: 'Claude Code', identity: 'You are an AI agent powered by Claude Code.', m: ['claude-*'], p: [], mch: 'model', pri: 90 },
      { id: 'google-gemini-model-official', harness: 'Google Gemini CLI', identity: 'You are an AI agent powered by Google Gemini CLI.', m: ['gemini-*'], p: ['google', 'google-generative-ai', 'gemini'], mch: 'model-and-provider', pri: 89 },
      { id: 'google-gemini-model-any-provider', harness: 'Google Gemini CLI', identity: 'You are an AI agent powered by Google Gemini CLI.', m: ['gemini-*'], p: [], mch: 'model', pri: 88 },
      { id: 'qwen-model-any-provider', harness: 'Qwen Code', identity: 'You are an AI agent powered by Qwen Code.', m: ['qwen*', '*qwen*'], p: [], mch: 'model', pri: 82 },
      { id: 'moonshot-kimi-model-any-provider', harness: 'Kimi Code', identity: 'You are an AI agent powered by Kimi Code.', m: ['kimi-*', '*kimi*', 'moonshot/*', 'workbuddy/kimi*'], p: [], mch: 'model', pri: 80 },
      { id: 'deepseek-provider-only', harness: 'DeepSeek Harness', identity: 'You are an AI agent powered by DeepSeek Harness.', m: [], p: ['deepseek', 'deepseek-official', 'deepseek-ai', 'deepseek-account'], mch: 'provider', pri: 70 },
      { id: 'zai-provider-only', harness: 'Zcode', identity: 'You are an AI agent powered by Zcode.', m: [], p: ['zai', 'zhipu', 'zhipuai', 'z.ai', 'zcode', 'zai-org'], mch: 'provider', pri: 60 },
      { id: 'openai-provider-only', harness: 'OpenAI Codex', identity: 'You are an AI agent powered by OpenAI Codex.', m: [], p: ['openai', 'openai-official'], mch: 'provider', pri: 60 },
      { id: 'anthropic-provider-only', harness: 'Claude Code', identity: 'You are an AI agent powered by Claude Code.', m: [], p: ['anthropic'], mch: 'provider', pri: 60 },
      { id: 'google-provider-only', harness: 'Google Gemini CLI', identity: 'You are an AI agent powered by Google Gemini CLI.', m: [], p: ['google', 'google-generative-ai', 'gemini'], mch: 'provider', pri: 58 },
      { id: 'qwen-provider-only', harness: 'Qwen Code', identity: 'You are an AI agent powered by Qwen Code.', m: [], p: ['qwen', 'dashscope', 'alibaba', 'aliyun'], mch: 'provider', pri: 55 },
      { id: 'moonshot-provider-only', harness: 'Kimi Code', identity: 'You are an AI agent powered by Kimi Code.', m: [], p: ['moonshot', 'moonshot-ai', 'kimi'], mch: 'provider', pri: 54 },
      { id: 'workbuddy-model-any-provider', harness: 'WorkBuddy', identity: 'You are an AI agent powered by WorkBuddy.', m: ['workbuddy/*', 'hy4flash*', '*hy4flash*', 'hunyuan*', '*hunyuan*'], p: [], mch: 'model', pri: 96 },
    ]

    function matches(pattern, value) {
      if (typeof value !== 'string' || value === '') return false
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')
      return new RegExp('^' + escaped + '$', 'i').test(value)
    }
    function specificity(patterns, value) {
      let best = 0
      for (const pattern of patterns || []) {
        if (matches(pattern, value)) best = Math.max(best, pattern.replace(/\*/g, '').length)
      }
      return best
    }
    function pick(provider, model, config) {
      let user = []
      try {
        if (config.userMappingsJson) {
          const parsed = JSON.parse(config.userMappingsJson)
          user = Array.isArray(parsed) ? parsed : parsed.rules || []
        }
      } catch { /* ignore invalid user rules in preview */ }
      const all = RULES.concat(user.filter(r => r && r.enabled !== false && typeof r.id === 'string'))
      const modeScore = { provider: 1, model: 2, 'model-and-provider': 3 }
      let winner, best
      for (const rule of all) {
        const ms = specificity(rule.m !== undefined ? rule.m : rule.modelPatterns, model)
        const ps = specificity(rule.p !== undefined ? rule.p : rule.providerPatterns, provider)
        const mode = rule.mch === 'provider' || rule.mch === 'model-and-provider' ? rule.mch : 'model'
        const mode2 = rule.match === 'provider' || rule.match === 'model-and-provider' ? rule.match : mode
        const ok = mode2 === 'model' ? ms > 0 : mode2 === 'provider' ? ps > 0 : ms > 0 && ps > 0
        if (!ok) continue
        const score = [Number(rule.pri ?? rule.priority ?? 0), modeScore[mode2], Math.max(ms, ps)]
        if (!best || score[0] > best[0] || (score[0] === best[0] && (score[1] > best[1] || (score[1] === best[1] && score[2] > best[2])))) {
          winner = rule; best = score
        }
      }
      const fallback = config.fallbackIdentity || 'You are an AI agent powered by DeepSeek Harness.'
      if (!winner) return { harness: 'DeepSeek Harness', identity: fallback, ruleId: 'fallback' }
      const identityRule = winner.identity || ''
      const template = config.identityTemplate || ''
      const identity = template.includes('{{harness}}')
        ? template.replaceAll('{{harness}}', winner.harness || '')
        : identityRule || fallback
      return { harness: winner.harness || winner.id, identity, ruleId: winner.id, priority: best[0] }
    }

    const card = {
      padding: '16px 18px',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '13px',
      lineHeight: 1.55,
    }
    const section = { marginTop: 16, borderTop: '0.5px solid var(--dsw-alias-border-l2)', paddingTop: 14 }
    const label = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, marginBottom: 6 }
    const row = { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }
    const value = { color: 'var(--dsw-alias-label-primary)', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', textAlign: 'right' }
    const input = {
      width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
      border: '0.5px solid var(--dsw-alias-border-l3)', background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)', fontSize: 12, fontFamily: 'monospace',
    }
    const button = {
      padding: '6px 12px', borderRadius: 8, border: '0.5px solid var(--dsw-alias-border-l3)',
      background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)',
      fontSize: 12, cursor: 'pointer',
    }
    const hint = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, marginTop: 6 }
    const badge = { padding: '2px 8px', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-link)' }

    // The generated `use<Name>` slot hooks require an explicit selector
    // (bind.ts has no default); the identity selector returns the whole
    // ConfigFormSnapshot, whose `.value` holds the section fields.
    const snapshot = (state) => state

    function Page(props) {
      const t = props.t || ((key) => (en[key] || key))
      const identityForm = props.useForm(snapshot)
      const modelForm = props.useModelForm(snapshot)
      const config = (identityForm && identityForm.value) || {}
      const modelValue = (modelForm && modelForm.value) || {}
      const [rulesText, setRulesText] = useState(config.userMappingsJson || '')
      const [status, setStatus] = useState('')

      const provider = modelValue.provider || ''
      const model = modelValue.model || ''
      const result = pick(provider, model, config)
      const enabled = config.enabled !== false

      return h('div', { style: card },
        h('div', { style: { ...row, alignItems: 'center' } },
          h('strong', null, t('title')),
          h('span', { style: { ...badge, opacity: enabled ? 1 : 0.5 } }, enabled ? 'ON' : 'OFF'),
        ),
        h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 } },
          h('input', {
            type: 'checkbox', checked: enabled,
            onChange: e => props.setField('enabled', e.target.checked),
          }),
          h('span', null, t('enabled')),
        ),
        h('div', { style: hint }, t('enabledHint')),
        h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 } },
          h('input', {
            type: 'checkbox', checked: config.adaptRuntimeContexts !== false,
            onChange: e => props.setField('adaptRuntimeContexts', e.target.checked),
          }),
          h('span', null, t('adapt')),
        ),
        h('div', { style: hint }, t('adaptHint')),

        h('div', { style: section },
          h('div', { style: label }, t('current')),
          h('div', { style: row }, h('span', null, t('provider')), h('span', { style: value }, provider || '—')),
          h('div', { style: row }, h('span', null, t('model')), h('span', { style: value }, model || '—')),
          provider === '' && model === '' ? h('div', { style: hint }, t('noModel')) : null,
          h('div', { style: row }, h('span', null, t('harness')), h('span', { style: value }, result.harness)),
          h('div', { style: row }, h('span', null, t('identity')), h('span', { style: value }, result.identity)),
          h('div', { style: row }, h('span', null, t('matchedRule')), h('span', { style: value }, result.ruleId + (result.priority !== undefined ? ' · P' + result.priority : ''))),
          result.ruleId === 'fallback' ? h('div', { style: hint }, t('fallbackNote')) : null,
          h('div', { style: hint }, t('previewNote')),
        ),

        h('div', { style: section },
          h('div', { style: label }, t('explainTitle')),
          h('div', { style: hint }, t('explain1')),
          h('div', { style: hint }, t('explain2')),
          h('div', { style: hint }, t('explain3')),
          h('div', { style: hint }, t('explain4')),
          h('details', { style: { marginTop: 8 } },
            h('summary', { style: { cursor: 'pointer', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('builtins')),
            h('div', { style: { marginTop: 6 } }, RULES.map(rule =>
              h('div', { key: rule.id, style: { marginBottom: 8 } },
                h('div', { style: { ...row, fontFamily: 'monospace', fontSize: 11 } },
                  h('span', null, `${rule.id} · P${rule.pri} · ${rule.mch}`),
                  h('span', { style: value }, rule.harness),
                ),
                h('div', { style: { ...hint, fontFamily: 'monospace' } },
                  rule.m.length > 0 ? `model: ${rule.m.join('  |  ')}` : null,
                  rule.m.length > 0 && rule.p.length > 0 ? '  ＋  ' : null,
                  rule.p.length > 0 ? `provider: ${rule.p.join('  |  ')}` : null,
                ),
              ),
            )),
            h('div', { style: hint }, t('templatesNote')),
          ),
        ),

        h('div', { style: section },
          h('div', { style: label }, t('custom')),
          h('input', {
            style: input, value: config.identityTemplate || '',
            placeholder: 'You are an AI agent powered by {{harness}}.',
            onChange: e => props.setField('identityTemplate', e.target.value),
          }),
          h('div', { style: hint }, t('customHint')),
        ),

        h('div', { style: section },
          h('div', { style: label }, t('rules')),
          h('textarea', {
            style: { ...input, minHeight: 130, resize: 'vertical' },
            value: rulesText,
            onChange: e => setRulesText(e.target.value),
          }),
          h('div', { style: hint }, t('rulesHint')),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
            h('button', {
              style: button,
              onClick: () => {
                const parsed = props.parseRules(rulesText)
                if (!parsed.ok) { setStatus(t('invalidJson')); return }
                props.setField('userMappingsJson', parsed.text)
                setStatus(t('saved'))
              },
            }, t('saveRules')),
            h('button', { style: button, onClick: () => props.exportRules(rulesText) }, t('export')),
            h('label', { style: { ...button, position: 'relative', overflow: 'hidden' } },
              t('import'),
              h('input', {
                type: 'file', accept: 'application/json',
                style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
                onChange: e => {
                  const file = e.target.files && e.target.files[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const parsed = props.parseRules(String(reader.result))
                    if (parsed.ok) { setRulesText(parsed.text); setStatus(t('saved')) }
                    else setStatus(t('invalidJson'))
                  }
                  reader.readAsText(file)
                },
              }),
            ),
            h('button', { style: button, onClick: () => { props.resetAll(); setRulesText(''); setStatus(t('saved')) } }, t('reset')),
            status ? h('span', { style: hint }, status) : null,
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-dynamic-model-identity: dictionaries')
        const t = ctx.locale.bind(NS)
        const form = ctx.configForms.get(NS)
        const modelForm = ctx.configForms.get('agent-default-model')

        // A local bundle's configuration belongs in `plugins.bundle.config`,
        // keyed by the bundle's package name, rendered on the bundle's own
        // page. `plugins.item` is reserved for official plugins and never
        // renders for bundles.
        const PACKAGE_NAME = '@local/dsh-dynamic-model-identity'
        ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.bundle.config', function* () {
          yield ctx.slots.register({
            name: 'plugins.bundle.config',
            key: PACKAGE_NAME,
            order: 45,
            label: () => t('title'),
            locale: NS,
          inject: () => ({
            hooks: { form, modelForm },
            setField: (key, value) => form.set(key, value),
            parseRules: text => {
              if (!text || text.trim() === '') return { ok: true, text: '' }
              try {
                const parsed = JSON.parse(text)
                const rules = Array.isArray(parsed) ? parsed : parsed.rules
                if (!Array.isArray(rules)) return { ok: false, text }
                return { ok: true, text: JSON.stringify({ version: 1, rules }, null, 2) }
              } catch { return { ok: false, text } }
            },
            exportRules: text => {
              const blob = new Blob([text || '{\n  "rules": []\n}'], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'dynamic-model-identity-rules.json'
              a.click()
              URL.revokeObjectURL(url)
            },
            resetAll: () => {
              form.set('enabled', true)
              form.set('fallbackIdentity', 'You are an AI agent powered by DeepSeek Harness.')
              form.set('identityTemplate', '')
              form.set('userMappingsJson', '')
            },
          }),
        }, Page)})), 'dsh-dynamic-model-identity: settings page')
      },
    }
  },
})
