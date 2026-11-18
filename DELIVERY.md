# 交付报告 — dsh-dynamic-model-identity

## 1. 实际新增/修改的文件

全部位于 `D:\deepseek-harness\dsh-dynamic-model-identity`（新建目录），未修改 DSH 核心源码、profile patch 或全局 `node_modules`。

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch` + `dsh.client`，peer 依赖声明 |
| `cordis.patch.yml` | 插入 `dynamic-model-identity` 插件行及默认配置 |
| `index.js` | Host 插件入口：`apply(ctx, config)`，注册 per-agent 动态 section |
| `client.js` | Web 设置页（`plugins.item` 卡片，9 项功能） |
| `src/config.js` | schemastery Config schema（volatile 字段）、读取助手 |
| `src/identity-resolver.js` | 用户规则合并、身份解析 |
| `src/model-detector.js` | 从 `AssembleContext` 读取实时 `modelSelection` |
| `src/provider-matcher.js` | 精确/通配符匹配、冲突消解 |
| `src/prompt-adapter.js` | per-agent scoped section 注册与释放 |
| `src/storage.js` | 规则导入/导出/恢复默认 |
| `src/data/provider-mappings.json` | 32 条映射规则（20 启用 / 12 模板） |
| `locale/en.json`, `locale/zh.json` | Plugin Manager 标题/描述/详情路径 |
| `icon.svg`, `docs/DETAIL.md` | 原创图标与详情页 |
| `research/*.md` | 4 份研究报告（默认提示词、映射、注入链路、测试报告） |
| `tests/*.js` | 4 个测试文件，30 个用例 |
| `README.md` | 安装/卸载/配置/回滚说明 |

安装包：`D:\deepseek-harness\dsh-dynamic-model-identity.zip`（同时已通过 `plugin_manager install_bundle` 安装到当前 `web` profile）。

## 2. 新增功能

- 自动识别每次装配时的 Provider ID / Model ID（来自 `context.modelSelection`）。
- 动态生成 Harness Identity：Zcode / OpenAI Codex / Claude Code / Google Gemini CLI / Qwen Code / Kimi Code / DeepSeek Harness / 中性回退。
- 模型切换自动生效，不需要重启或手动改提示词。
- 覆盖主 Agent、Subagent、Workflow Child、Resume Agent。
- 支持多 Profile、多 Provider 并存；不影响其他 Prompt Section。
- 可配置映射：Provider 级 / Model 级、精确 / 通配符、用户覆盖、禁用规则、默认映射。
- Web 设置页：总开关、当前模型/Provider/Harness/Identity、规则管理、自定义 Identity、导入导出、恢复默认。

## 3. 使用的 DSH API（均已通过源码 + 运行时 Inspect 核实）

- `ctx.systemPrompt.section()` / `getSectionOrder('HARNESS_IDENTITY')` / `interpolate: false`
- `ctx.on('agent/created', ..., { global: true })` + `agent.ctx.effect()`
- `AssembleContext.modelSelection`（`core/agent/src/runtime-types.ts` 声明合并）
- `ctx.effect()`、`ctx.inject(['settings'], ...)`、`settings.configure({ auto: false }, ctx.fiber)`
- Client：`ctx.slots.inject()` / `ctx.slots.register()`、`ctx.locale.register/bind`、`ctx.configForms.get/whileServed`、`ConfigForm.set`
- 只读检查：`cordis_inspect_list`、`Service.listService`（确认 `systemPrompt`、`agentDefaultModel` 契约）

## 4. System Prompt 注入位置

`agent/created` → 对每个 `agent.ctx` 注册名为 `harness:identity`、order `-1000`、`interpolate: false` 的 section。该 scoped section 遮蔽 DSH 全局同名 section，因此只出现一个身份段，不产生重复。section 的 `text(context)` 在 `SystemPrompt.assemble()`（`system-prompt/src/index.ts:669`）每次装配时求值。未使用 `complete: true`，未监听 `system-prompt/assemble`。

## 5. 模型识别机制

- 主路径：`context.modelSelection`（agent loop 在每步 preStep 捕获，`README.md:70` 明确为 "captured step selection, retained across retries"）。
- 回退：`context.agent.options.provider/model`（与 agent-loop 内置变量一致）。
- 切换：`selectModel` → `model/selection` session 事件 → projection `pending` → 下一步 `AgentModel.current()` → 新身份。重试复用同一 captured selection。

## 6. 映射规则

32 条：20 条启用（Zcode、DeepSeek、OpenAI Codex、Claude Code、Gemini CLI、Qwen Code、Kimi Code、中性 Hunyuan/WorkBuddy 等），12 条默认关闭模板（OpenRouter/SiliconFlow/Together/Fireworks/Ollama/vLLM/LM Studio/magpie/xAI/MiniMax/本地中性/用户覆盖示例）。优先级 10–100 为内置，200+ 保留给用户。冲突顺序：priority → match 模式 → pattern 具体度 → id。所有判断本地完成，无网络请求。

## 7. 已通过的测试

30/30（`provider-matcher` 7、`identity-resolver` 10、`prompt-adapter` 6、`integration` 7）。涵盖要求的模型切换矩阵、Provider 矩阵、异常场景、重复身份、Section 保留、卸载与重启。真实调用 DSH `assemble()`/`renderPrompt()` 检查最终提示词。详见 `research/test-report.md`。

安装验证：`plugin_manager install_bundle` 返回 `application: applied`；`list_plugins` 显示 `include:dynamic-model-identity` 为 `enabled: true`、`fiberPhase: active`。

## 8. 尚未支持 / 未验证的情况

- Web 设置页未在连接浏览器中实际渲染验证（需要运行页面与浏览器控制）；客户端 HMR 未验证。
- 未调用真实 LLM API（无密钥），验证止于 Prompt Assembly API。
- 未逐一枚举完整 profile 的成百个工具 section（机制上不触碰它们）。
- 同一 agent 作用域若有其他插件也遮蔽 `harness:identity`，会发生覆盖/冲突；当前 profile 未发现。
- 无官方第一方 coding agent 的模型（Hunyuan/WorkBuddy、xAI Grok、MiniMax 等）使用中性回退或关闭模板。

## 9. 回滚

在 **Plugins** 中禁用或移除该插件，或执行：

```sh
dsh plugin --profile web remove @local/dsh-dynamic-model-identity
```

下一次模型装配即恢复出厂 `harness:identity`。插件不修改任何核心文件、profile patch 或 `node_modules` 内容。
