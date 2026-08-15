// naked-fetch-dsh — DeepSeek Harness 插件
// 把 naked-fetch（极简智能体浏览器）注册为 web_fetch / web_search_bing 两个工具。
//
// 函数插件格式（与 DSH 官方包同构）：
//   export const name / inject / Config / apply
// 注册路径：ctx.tools.register(defineTool(...))——与 @deepseek-ai/dsh-tool-cordis 同构。
//
// 引擎代码内嵌在 vendor/（index.js/cli.js/core/，由 scripts/sync-dsh-core.mjs 从主仓库同步），
// 因此本包零外部依赖——npm i naked-fetch-dsh 即自带全部代码。

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'naked-fetch-dsh'
export const inject = ['tools', 'subprocess']

/** 插件配置：webToolPath 覆盖 cli.js 定位（默认取包内 vendor/cli.js）。 */
export const Config = {
  webToolPath: '',
}

export function apply(ctx, config) {
  const WEB_TOOL = config?.webToolPath
    || join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'cli.js')
  const WEB_TOOL_DIR = dirname(WEB_TOOL)

  async function runWebTool(argsList, signal) {
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) throw new Error('subprocess service unavailable')
    const nodePath = await subprocess.resolveExecutable('node', {}, signal)
    const handle = subprocess.spawn({
      argv: [nodePath, WEB_TOOL, ...argsList, '--json'],
      cwd: WEB_TOOL_DIR,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 5 * 1024 * 1024, spill: { maxBytes: 20 * 1024 * 1024 } },
        stderr: { maxBytes: 1024 * 1024 },
      },
      graceMs: 5000,
      signal,
    })
    const outcome = await handle.done
    const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
    if (outcome.exitCode !== 0) {
      const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
      throw new Error(`naked-fetch failed (exit ${outcome.exitCode}): ${(err || out).trim().slice(0, 800)}`)
    }
    try {
      return JSON.parse(out)
    } catch (e) {
      throw new Error(`naked-fetch output not JSON: ${out.slice(0, 400)}`)
    }
  }

  const webFetch = {
    name: 'web_fetch',
    description: '抓取网页并提取为 AI 友好的去噪文本（标题层级/链接/表格/列表）。内置完整浏览器指纹、SSRF 防护、限速重试；SPA 空壳自动提示，js=true 强制浏览器渲染（Firefox/Playwright，Via 模式复用系统内核）。',
    parameters: {
      url: { type: 'string', required: true, description: '目标网页 URL' },
      timeout: { type: 'number', description: '超时秒数，默认 30' },
      raw: { type: 'boolean', description: 'true 返回原始 HTML' },
      js: { type: 'boolean', description: 'true 强制浏览器渲染' },
      engine: { type: 'string', description: '渲染引擎：auto|firefox|chromium' },
    },
    output: {
      schema: { type: 'json' },
      render(args, value) {
        const v = value || {}
        const lines = []
        if (v.title) lines.push(`# ${v.title}`)
        if (v.description) lines.push(`> ${v.description}`)
        lines.push(`URL: ${v.url || args.url} | 状态: ${v.status_code} | ${v.duration_ms}ms`)
        if (v.render_used) lines.push(`（已用 ${v.render_engine || 'browser'} 渲染）`)
        if (v.spa_suspect && !v.render_used) lines.push('⚠️ 疑似 SPA/JS 渲染空壳，正文可能不全')
        if (v.render_error) lines.push(`[渲染降级] ${v.render_error}`)
        if (v.text) lines.push('', v.text)
        else lines.push('', '(无正文)')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const a = ['fetch', String(args.url)]
      if (args.timeout) a.push('--timeout', String(args.timeout))
      if (args.raw) a.push('--raw')
      if (args.js) a.push('--js')
      if (args.engine) a.push('--engine', String(args.engine))
      return runWebTool(a, exec.signal)
    },
    timeoutMs: 90000,
    isConcurrencySafe() { return true },
  }

  const webSearch = {
    name: 'web_search_bing',
    description: '网页搜索（HTML 解析，无 API key）：bing（默认）/baidu/ddg。返回 title/url/snippet 候选，作为初筛；精读用 web_fetch。',
    parameters: {
      query: { type: 'string', required: true, description: '搜索关键词' },
      count: { type: 'number', description: '结果条数，默认 5' },
      engine: { type: 'string', enum: ['bing', 'baidu', 'ddg', 'google'], description: '搜索引擎' },
    },
    output: {
      schema: { type: 'json' },
      render(args, value) {
        const v = value || {}
        if (!v.success) return [{ type: 'text', text: v.hint || `搜索失败: ${args.query}` }]
        const lines = [`搜索 "${v.query}"（${v.engine}）: ${v.result_count} 条结果`]
        for (const [i, r] of (v.results || []).entries()) {
          lines.push('', `[${i + 1}] ${r.title}`, `    ${r.url}`, `    ${String(r.snippet || '').slice(0, 200)}`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const a = ['search', String(args.query), '--count', String(args.count || 5)]
      if (args.engine) a.push('--engine', String(args.engine))
      return runWebTool(a, exec.signal)
    },
    timeoutMs: 60000,
    isConcurrencySafe() { return true },
  }

  // 注册即 Fiber 生效；disposer 交给 ctx.effect 保证 stop/update 时撤销
  ctx.effect(() => ctx.tools.register(defineTool(webFetch)))
  ctx.effect(() => ctx.tools.register(defineTool(webSearch)))
}
