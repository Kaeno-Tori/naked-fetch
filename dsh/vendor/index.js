// index.js — naked-fetch 可编程 API
// 组合 core/ 各层：抓取 + 提取 + SPA 检测 + 可选浏览器兜底。
// 零依赖（playwright 可选），Node >= 18。

import { httpGet, isInternalUrl, rateLimitWait } from './core/fetch.js';
import { extractReadable, detectSpa } from './core/extract.js';
import { fetchWithBrowser } from './core/browser.js';
import { fetchWithFirefox } from './core/gecko.js';

export { httpGet, isInternalUrl, rateLimitWait, DEFAULT_TIMEOUT, MAX_RESPONSE_SIZE } from './core/fetch.js';
export { extractReadable, detectSpa, decodeEntities, stripHtml, SPA_HINTS } from './core/extract.js';
export { searchWeb, ENGINE_TEMPLATES, extractBing, extractDdg } from './core/search.js';
export { fetchWithBrowser, PLAYWRIGHT_INSTALL_HINT } from './core/browser.js';
export { fetchWithFirefox, closeSession as closeFirefoxSession, shutdownDriver as shutdownFirefoxDriver } from './core/gecko.js';
export { FINGERPRINTS, buildHeaders, pickFingerprint } from './core/fingerprint.js';

/**
 * 渲染引擎选择：
 *   'firefox' 复用系统 Firefox（Via 模式，零第二内核，需 geckodriver）
 *   'chromium' 用 Playwright 自带 chromium（已下载即本机内核）
 *   'auto'（默认）先 firefox，失败回退 chromium
 */
export async function pickRenderEngine(prefer = 'auto') {
  if (prefer === 'firefox' || prefer === 'chromium') return prefer;
  // auto：探测 geckodriver + 系统 firefox
  try {
    const { existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, 'bin', 'geckodriver'),
      join(here, 'node_modules', '.bin', 'geckodriver'),
    ];
    const hasDriver = candidates.some((p) => existsSync(p));
    const hasFirefox = await import('node:child_process').then(({ execFileSync }) => {
      try { execFileSync('firefox', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
    });
    if (hasDriver && hasFirefox) return 'firefox';
  } catch { /* fall through */ }
  return 'chromium';
}

/**
 * 抓取一个网页并返回 AI 友好的结构化结果。
 * 默认 fetch；SPA 空壳时（spa_suspect=true）自动尝试浏览器渲染兜底（引擎见 {@link pickRenderEngine}），
 * 渲染器不可用时优雅降级（render_used=false + render_error 提示）。
 *
 * @param {string} url 目标 URL
 * @param {object} [opts]
 *   timeout 秒数（默认 30）
 *   raw 是否返回原始 HTML（默认 false，返回提取文本）
 *   js 强制浏览器渲染（默认 false）
 *   noAutoJs 关闭 SPA 自动兜底（默认 false）
 *   engine 渲染引擎：'auto'（默认）| 'firefox' | 'chromium'
 *   signal AbortSignal
 * @returns 结构化结果：{success,url,status_code,title,description,words,visible,links,spa_suspect,text,render_used,render_engine,...}
 */
export async function fetchPage(url, {
  timeout = 30,
  raw = false,
  js = false,
  noAutoJs = false,
  engine = 'auto',
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
  let renderEngine = null;
  let renderError = null;
  const wantRender = js === true || (spa && noAutoJs !== true);
  if (wantRender) {
    const chosen = await pickRenderEngine(engine);
    renderEngine = chosen;
    if (chosen === 'firefox') {
      const br = await fetchWithFirefox(url, { timeout });
      if (br.success) {
        r = br;
        extracted = extractReadable(br.content, br.url);
        spa = detectSpa(br.content, extracted.text, extracted.visible);
        renderUsed = true;
      } else {
        renderError = br.error;
        // firefox 失败 → 回退 chromium（auto 语义）
        const br2 = await fetchWithBrowser(url, { timeout });
        if (br2.success) {
          renderEngine = 'chromium';
          r = br2;
          extracted = extractReadable(br2.content, br2.url);
          spa = detectSpa(br2.content, extracted.text, extracted.visible);
          renderUsed = true;
          renderError = null;
        }
      }
    } else {
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
  }
  return {
    success: true,
    url: r.url,
    status_code: r.status_code,
    content_type: r.content_type,
    duration_ms: r.duration_ms,
    retries: r.retries,
    render_used: renderUsed,
    render_engine: renderEngine,
    title: extracted.title,
    description: extracted.description,
    words: extracted.words,
    visible: extracted.visible,
    links: extracted.links,
    spa_suspect: spa,
    text: extracted.text,
    hint: spa && !renderUsed
      ? "正文过短，疑似 SPA/JS 渲染页面。fetch 只能拿到空壳 HTML，需要执行 JS（Playwright/Firefox）才能拿到真实内容。"
      : undefined,
    render_error: renderError ?? undefined,
  };
}
