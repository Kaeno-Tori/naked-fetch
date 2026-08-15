// core/search.js — 搜索引擎解析层（易碎层：搜索引擎 HTML 结构会漂移）
// 注意：这是全项目最脆弱的部分。Bing/Google 改版或反爬升级都会让正则失效，
// 保持 hint/降级路径，不要把"搜索"当作与"抓取"同级的稳定资产。

import { httpGet, MIN_REQUEST_INTERVAL } from './fetch.js';
import { stripHtml, decodeEntities } from './extract.js';

export const ENGINE_TEMPLATES = {
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  ddg: (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
  baidu: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
};

// 修复版 Bing 正则：兼容 <h2 class=""><a ...>（Bing 2026 改版，b_algo 后跟 link 标签）
const BING_RESULT_RE = /<li\s+class="b_algo"[^>]*>[\s\S]*?<h2[^>]*><a\s+(?:[^>]*\s+)?href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>|<div\s+class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)/gi;
const DDG_RESULT_RE = /<a\s+rel="nofollow"\s+class="result-link"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td\s+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

export function extractBing(html, maxResults) {
  const results = [];
  for (const m of html.matchAll(BING_RESULT_RE)) {
    const title = decodeEntities(stripHtml(m[2]));
    const snippet = decodeEntities(stripHtml(m[3] || m[4] || ""));
    if (m[1] && title) results.push({ title, url: m[1], snippet });
    if (results.length >= maxResults) break;
  }
  return results;
}

export function extractDdg(html, maxResults) {
  const results = [];
  for (const m of html.matchAll(DDG_RESULT_RE)) {
    const title = decodeEntities(stripHtml(m[2]));
    const snippet = decodeEntities(stripHtml(m[3] || ""));
    if (m[1] && title) results.push({ title, url: m[1], snippet });
    if (results.length >= maxResults) break;
  }
  return results;
}

// 百度：h3 结果标题；a 的 mu 属性携带真实 URL（href 是 baidu.com/link 跳转）；摘要取 c-abstract。
// 百度结构同样会漂移——保持 hint 降级路径。
const BAIDU_H3_RE = /<h3[^>]*>[\s\S]*?<a[^>]+(?:mu="([^"]*)")?[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/gi;

export function extractBaidu(html, maxResults) {
  const results = [];
  for (const m of html.matchAll(BAIDU_H3_RE)) {
    const realUrl = m[1] || m[2]; // mu 优先（真实 URL），否则用跳转链接
    const title = decodeEntities(stripHtml(m[3])).replace(/\s+/g, " ").trim();
    if (!realUrl || !title) continue;
    const after = html.slice(m.index, m.index + 3000);
    const abs = after.match(/c-abstract[^>]*>([\s\S]*?)<\/div>|<span class="content-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const snippet = abs
      ? decodeEntities(stripHtml(abs[1] || abs[2] || "")).replace(/\s+/g, " ").trim()
      : "";
    results.push({ title, url: realUrl, snippet });
    if (results.length >= maxResults) break;
  }
  return results;
}

/**
 * 执行一次搜索。默认 bing；0 结果自动换指纹重试一次（反爬误伤时常见）。
 * @param {string} query
 * @param {object} [opts] count(默认5)/engine(默认bing)/timeout/signal
 * @returns {{success, query, results, result_count, duration_ms, engine, search_url, hint?}}
 */
export async function searchWeb(query, {
  count = 5,
  engine = "bing",
  timeout,
  signal,
} = {}) {
  const start = Date.now();
  const url = ENGINE_TEMPLATES[engine] ? ENGINE_TEMPLATES[engine](query) : ENGINE_TEMPLATES.bing(query);
  let r = await httpGet(url, { timeout, signal, startTime: start });
  if (!r.success) {
    return { success: false, query, error: r.error || String(r.status_code), results: [], result_count: 0, duration_ms: Date.now() - start, engine, search_url: url };
  }
  let results = engine === "ddg" ? extractDdg(r.content, count)
    : engine === "baidu" ? extractBaidu(r.content, count)
    : extractBing(r.content, count);
  if (results.length === 0) {
    // 换指纹重试一次
    await new Promise((res) => setTimeout(res, MIN_REQUEST_INTERVAL));
    r = await httpGet(url, { timeout, signal, startTime: start });
    if (r.success) {
      results = engine === "ddg" ? extractDdg(r.content, count)
        : engine === "baidu" ? extractBaidu(r.content, count)
        : extractBing(r.content, count);
    }
  }
  return {
    success: results.length > 0,
    query,
    results,
    result_count: results.length,
    duration_ms: Date.now() - start,
    engine,
    search_url: url,
    hint: results.length ? undefined : "未能自动解析搜索结果，可用 fetch 手动访问: " + url,
  };
}
