// examples/dsh-plugin.mjs — 把 naked-fetch 注册为 DeepSeek Harness 动态工具
//
// 这是真实运行过的接入代码（webt-1 插件），说明：
//   - harness.defineTool() 包装后 harness.registerTool(ctx, tool) 注册
//   - 工具注册自动随插件 Fiber 撤销（stop/update 即移除）
//   - schema DSL 约束：不用 minimum/maximum；output.schema 的 object 必须显式
//     additionalProperties；parameters 根必须保持开放（与 output.schema 相反）
//   - execute 用 ctx.subprocess 服务 spawn node cli.js --json，exec.signal 绑定进程树终止
//
// 在 DSH 会话中用 cordis_define 定义（code.host 为此函数体），cordis_run 激活。
// 使用前把 WEB_TOOL 指向你本项目的 cli.js 绝对路径。

const WEB_TOOL = '/absolute/path/to/naked-fetch/cli.js'

return {
  apply(ctx) {
    async function runWebTool(argsList, signal) {
      const subprocess = ctx.get('subprocess')
      if (subprocess === undefined) throw new Error('subprocess service unavailable')
      const nodePath = await subprocess.resolveExecutable('node', {}, signal)
      const handle = subprocess.spawn({
        argv: [nodePath, WEB_TOOL, ...argsList, '--json'],
        cwd: WEB_TOOL.slice(0, WEB_TOOL.lastIndexOf('/')),
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

    harness.registerTool(ctx, harness.defineTool({
      name: 'web_fetch',
      description: '抓取网页并提取为 AI 友好的去噪文本（标题层级/链接/表格/列表）。完整浏览器指纹、SSRF 防护、限速重试；SPA 空壳自动提示，js=true 强制浏览器渲染（需 playwright）。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页 URL' },
          timeout: { type: 'number', description: '超时秒数，默认 30' },
          raw: { type: 'boolean', description: 'true 返回原始 HTML', default: false },
          js: { type: 'boolean', description: 'true 强制浏览器渲染（需 playwright）', default: false },
        },
        required: ['url'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean' },
            url: { type: 'string' },
            status_code: { type: 'number' },
            duration_ms: { type: 'number' },
            title: { type: 'string' },
            description: { type: 'string' },
            words: { type: 'number' },
            links: { type: 'number' },
            spa_suspect: { type: 'boolean' },
            text: { type: 'string' },
            hint: { type: 'string' },
            render_error: { type: 'string' },
          },
        },
        render(args, value) {
          const v = value || {}
          const lines = []
          if (v.title) lines.push(`# ${v.title}`)
          lines.push(`URL: ${v.url || args.url} | 状态: ${v.status_code}`)
          if (v.spa_suspect) lines.push('⚠️ 疑似 SPA 空壳')
          if (v.text) lines.push('', v.text)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      async execute(args, exec) {
        const a = ['fetch', String(args.url)]
        if (args.timeout) a.push('--timeout', String(args.timeout))
        if (args.raw) a.push('--raw')
        if (args.js) a.push('--js')
        return runWebTool(a, exec.signal)
      },
      timeoutMs: 90000,
      isConcurrencySafe() { return true },
    }))

    harness.registerTool(ctx, harness.defineTool({
      name: 'web_search_bing',
      description: 'Bing 网页搜索（HTML 解析，无 API key）。返回 title/url/snippet 候选，作为初筛；精读用 web_fetch。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          count: { type: 'number', description: '结果条数，默认 5' },
          engine: { type: 'string', enum: ['bing', 'ddg', 'google', 'baidu'] },
        },
        required: ['query'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            success: { type: 'boolean' },
            query: { type: 'string' },
            result_count: { type: 'number' },
            duration_ms: { type: 'number' },
            engine: { type: 'string' },
            search_url: { type: 'string' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                  snippet: { type: 'string' },
                },
              },
            },
          },
        },
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
    }))
  },
}
