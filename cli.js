#!/usr/bin/env node
// cli.js — web-tool 命令行入口
// 用法:
//   web-tool fetch <url> [--timeout N] [--raw] [--js] [--no-auto-js] [--json]
//   web-tool search <query> [--count N] [--engine bing|ddg|google|baidu] [--json]
//   web-tool extract <url> [--timeout N] [--json]   # 同 fetch（默认行为）

import { fetchPage, searchWeb } from './index.js';

async function cmdFetch(args) {
  const url = args._[1];
  if (!url) { console.error("用法: web-tool fetch <url> [--timeout N] [--raw] [--js] [--engine auto|firefox|chromium] [--json]"); process.exit(2); }
  const r = await fetchPage(url, {
    timeout: args.timeout || 30,
    raw: args.raw === true,
    js: args.js === true,
    noAutoJs: args["no-auto-js"] === true,
    engine: args.engine || 'auto',
  });
  if (!r.success) {
    if (args.json) { console.log(JSON.stringify(r)); return; }
    console.error(r.error || `获取失败: ${r.status_code}`);
    process.exit(1);
  }
  if (args.raw) {
    if (args.json) { console.log(JSON.stringify(r)); return; }
    console.log(`状态码: ${r.status_code} | 类型: ${r.content_type} | 耗时: ${r.duration_ms}ms | 重试: ${r.retries}`);
    console.log(r.content);
    return;
  }
  if (args.json) { console.log(JSON.stringify(r)); return; }
  console.log(`URL: ${r.url}`);
  console.log(`状态: ${r.status_code} | 类型: ${r.content_type} | 耗时: ${r.duration_ms}ms | 重试: ${r.retries}${r.render_used ? ` | 渲染: ${r.render_engine || 'browser'}` : ""}`);
  if (r.title) console.log(`标题: ${r.title}`);
  if (r.description) console.log(`描述: ${r.description.slice(0, 160)}`);
  console.log(`正文: ${r.words} 词 | ${r.links} 链接${r.spa_suspect ? " | ⚠️ 疑似 SPA 空壳" : ""}`);
  console.log("─".repeat(40));
  console.log(r.text || "(无正文)");
  if (r.spa_suspect && !r.render_used) console.log("\n[提示] " + r.hint);
  if (r.render_error) console.log("\n[提示] " + r.render_error);
}

async function cmdSearch(args) {
  const q = args._[1];
  if (!q) { console.error("用法: web-tool search <query> [--count N] [--engine bing|ddg|google|baidu] [--json]"); process.exit(2); }
  const r = await searchWeb(q, { count: args.count || 5, engine: args.engine || "bing" });
  if (args.json) { console.log(JSON.stringify(r, null, 2)); return; }
  if (!r.success) {
    console.error(r.error || "搜索失败");
    console.log(r.hint || "");
    process.exit(1);
  }
  console.log(`引擎: ${r.engine} | 结果: ${r.result_count} 条 | 耗时: ${r.duration_ms}ms`);
  r.results.forEach((item, i) => {
    console.log(`\n[${i + 1}] ${item.title}\n    ${item.url}\n    ${String(item.snippet || "").slice(0, 200)}`);
  });
}

// ── CLI 解析 ──
const args = { _: [], json: false };
const raw = process.argv.slice(2);
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[++i] : true;
    args[k] = v;
  } else args._.push(a);
}
const sub = args._[0];
if (sub === "fetch" || sub === "extract") await cmdFetch(args);
else if (sub === "search") await cmdSearch(args);
else {
  console.log(`web-tool — AI 专属网页抓取器（零依赖核心，Node >= 18）

用法:
  web-tool fetch <url> [--timeout N] [--raw] [--js] [--no-auto-js] [--json]
      # 抓取并提取为 AI 友好文本；SPA 空壳自动尝试 Playwright 渲染（--js 强制，--no-auto-js 关闭）
  web-tool search <query> [--count N] [--engine bing|ddg|google|baidu] [--json]
  web-tool extract <url> [--timeout N] [--json]   # 同 fetch（默认行为）

特性:
  - 完整浏览器指纹：UA×sec-ch-ua 联动池、Sec-Fetch-*、cookie 会话、随机轮换
  - 防反爬：1s 限速、429/503 指数退避重试、搜索 0 结果自动换指纹重试
  - SSRF 防护：拒绝内网/保留地址
  - AI 提取：去噪（head/script/nav/footer/aside）、保留标题层级/链接/表格/列表/代码
  - SPA 检测：正文过短 + root/app 特征 → 自动用 Playwright 渲染兜底（输出仍是文本）
  - Playwright 可选：npm i playwright && npx playwright install chromium（未装时自动降级并提示）
  - --raw 输出原始 HTML；--json 输出结构化结果

作为库使用:
  import { fetchPage, searchWeb, extractReadable } from 'web-tool'
`);
}
