// core/browser.js — 可选 Playwright 渲染（兜底 SPA/JS 页面）
// 核心保持零依赖：playwright 未安装时动态 import 失败，优雅降级并给出安装提示。
// 输出仍是文本（page.content() 的 HTML 走同一套 extract），不是截图——AI 读文本不读图。

import { pickFingerprint } from './fingerprint.js';

export const PLAYWRIGHT_INSTALL_HINT = "playwright 未安装。运行: npm i playwright && npx playwright install chromium";

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "imageset"]);
let _pwChromium = null; // null=未探测, false=不可用, object=可用

async function getChromium() {
  if (_pwChromium !== null) return _pwChromium;
  for (const mod of ["playwright", "playwright-core"]) {
    try {
      const { chromium } = await import(mod);
      if (chromium) { _pwChromium = chromium; return chromium; }
    } catch { /* 未安装，尝试下一个 */ }
  }
  _pwChromium = false;
  return null;
}

/**
 * 用 headless Chromium 渲染页面（参数对齐 APet Python 版 _fetch_with_browser）。
 * @param {string} url
 * @param {object} [opts] timeout(默认30)/blockMedia(默认true，拦截图片媒体加速)
 * @returns 与 httpGet 同构的响应对象；playwright 不可用或失败时 success=false。
 */
export async function fetchWithBrowser(url, { timeout = 30, blockMedia = true } = {}) {
  const chromium = await getChromium();
  if (!chromium) {
    return { success: false, url, error: PLAYWRIGHT_INSTALL_HINT, status_code: 0, content: "", content_type: "", encoding: "utf-8", duration_ms: 0, retries: 0 };
  }
  const startTime = Date.now();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "zh-CN",
      userAgent: pickFingerprint().ua,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout * 1000);
    if (blockMedia) {
      await page.route("**/*", (route) => {
        const t = route.request().resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(t)) route.abort();
        else route.continue();
      });
    }
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeout * 1000 });
    const status = resp ? resp.status() : 0;
    const content = await page.content();
    return {
      success: status >= 200 && status < 400,
      url: page.url(),
      status_code: status,
      content,
      content_type: resp?.headers()["content-type"] ?? "text/html",
      encoding: "utf-8",
      duration_ms: Date.now() - startTime,
      retries: 0,
    };
  } catch (e) {
    return {
      success: false, url, error: `浏览器渲染失败: ${e.message}`, status_code: 0,
      content: "", content_type: "", encoding: "utf-8", duration_ms: Date.now() - startTime, retries: 0,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
