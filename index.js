// index.js — web-tool 可编程 API
// 组合 core/ 各层：抓取 + 提取 + SPA 检测 + 可选浏览器兜底。
// 零依赖（playwright 可选），Node >= 18。

import { httpGet, isInternalUrl, rateLimitWait } from './core/fetch.js';
import { extractReadable, detectSpa } from './core/extract.js';
import { fetchWithBrowser } from './core/browser.js';

export { httpGet, isInternalUrl, rateLimitWait, DEFAULT_TIMEOUT, MAX_RESPONSE_SIZE } from './core/fetch.js';
export { extractReadable, detectSpa, decodeEntities, stripHtml, SPA_HINTS } from './core/extract.js';
export { searchWeb, ENGINE_TEMPLATES, extractBing, extractDdg } from './core/search.js';
export { fetchWithBrowser, PLAYWRIGHT_INSTALL_HINT } from './core/browser.js';
export { FINGERPRINTS, buildHeaders, pickFingerprint } from './core/fingerprint.js';

/**
 * 抓取一个网页并返回 AI 友好的结构化结果。
 * 默认 fetch；SPA 空壳时（spa_suspect=true）自动尝试 Playwright 渲染兜底，
 * 未装 playwright 时优雅降级（render_used=false + render_error 提示）。
 *
 * @param {string} url 目标 URL
 * @param {object} [opts]
 *   timeout 秒数（默认 30）
 *   raw 是否返回原始 HTML（默认 false，返回提取文本）
 *   js 强制浏览器渲染（默认 false）
 *   noAutoJs 关闭 SPA 自动兜底（默认 false）
 *   signal AbortSignal
 * @returns 结构化结果：{success,url,status_code,title,description,words,visible,links,spa_suspect,text,render_used,...}
 */
export async function fetchPage(url, {
  timeout = 30,
  raw = false,
  js = false,
  noAutoJs = false,
  signal,
} = {}) {
  if (isInternalUrl(url)) {
    return { success: false, url, error: "出于安全原因，不允许访问内网地址", status_code: 0, content: "", title: "", text: "" };
  }
  await rateLimitWait();
  let r = await httpGet(url, { timeout, signal });
  if (!r.success) {
    return { success: false, url, error: r.error || String(r.status_code), status_code: r.status_code, content: "", title: "", text: "" };
  }
  if (raw) return { ...r, success: true };
  let extracted = extractReadable(r.content, r.url);
  let spa = detectSpa(r.content, extracted.text, extracted.visible);
  let renderUsed = false;
  let renderError = null;
  const wantRender = js === true || (spa && noAutoJs !== true);
  if (wantRender) {
    const br = await fetchWithBrowser(url, { timeout });
    if (br.success) {
      r = br;
      extracted = extractReadable(br.content, br.url);
      spa = detectSpa(br.content, extracted.text, extracted.visible);
      renderUsed = true;
    } else {
      renderError = br.error;
    }
  }
  return {
    success: true,
    url: r.url,
    status_code: r.status_code,
    content_type: r.content_type,
    duration_ms: r.duration_ms,
    retries: r.retries,
    render_used: renderUsed,
    title: extracted.title,
    description: extracted.description,
    words: extracted.words,
    visible: extracted.visible,
    links: extracted.links,
    spa_suspect: spa,
    text: extracted.text,
    hint: spa && !renderUsed
      ? "正文过短，疑似 SPA/JS 渲染页面。fetch 只能拿到空壳 HTML，需要执行 JS（Playwright）才能拿到真实内容。"
      : undefined,
    render_error: renderError ?? undefined,
  };
}
