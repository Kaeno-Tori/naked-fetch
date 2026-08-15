// core/fetch.js — HTTP 获取层
// 完整浏览器指纹请求、SSRF 防护、全局限速、429/503 指数退避、cookie 会话、charset 解码。
// cookie 会话与限速时钟是本模块的进程级状态：多调用共享同一会话与限速（有意为之的礼貌限速）。

import { buildHeaders, pickFingerprint } from './fingerprint.js';

export const DEFAULT_TIMEOUT = 30;
export const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
export const MIN_REQUEST_INTERVAL = 1000; // ms
export const MAX_RETRIES = 3;
export const RETRYABLE_STATUSES = new Set([429, 503]);

// ── SSRF 防护 ──
const PRIVATE_RANGES = [
  [/^127\./, "loopback"], [/^10\./, "private"], [/^192\.168\./, "private"],
  [/^172\.(1[6-9]|2\d|3[01])\./, "private"], [/^169\.254\./, "link-local"],
  [/^0\./, "unspecified"], [/^::1$/, "loopback"], [/^fc|^fd/, "ula"], [/^fe8/, "link-local"],
];
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "0.0.0.0", "::1", "[::1]"]);

/** 内网/保留地址 → true（拒绝抓取）。 */
export function isInternalUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (BLOCKED_HOSTS.has(host.toLowerCase())) return true;
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    return PRIVATE_RANGES.some(([re]) => re.test(host));
  } catch { return true; }
}

// 进程级会话状态
const cookieJar = new Map();
let lastRequestAt = 0;

export function rateLimitWait() {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL - Date.now();
  if (wait > 0) return new Promise((r) => setTimeout(r, wait));
  return Promise.resolve();
}

function parseRetryAfter(resp) {
  const ra = resp.headers.get("retry-after");
  if (!ra) return null;
  const s = parseFloat(ra);
  return Number.isFinite(s) ? s * 1000 : null;
}

function saveCookies(resp, domain) {
  const setCookie = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const m = c.match(/^([^=;]+)=([^;]*)/);
    if (m) cookieJar.set(m[1], m[2]);
  }
}

function cookieString() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * GET 一个 URL，带重试/限速/指纹/cookie。
 * @param {string} url
 * @param {object} [opts] timeout/maxSize/extraHeaders/maxRetries/signal
 * @returns 结构化的响应对象；网络失败时 success=false + error。
 */
export async function httpGet(url, {
  timeout = DEFAULT_TIMEOUT,
  maxSize = MAX_RESPONSE_SIZE,
  extraHeaders = {},
  maxRetries = MAX_RETRIES,
  signal,
  startTime = Date.now(),
} = {}) {
  let lastError = null, lastStatus = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    try {
      const resp = await fetch(url, {
        headers: buildHeaders({ extra: extraHeaders, cookies: cookieString() }),
        redirect: "follow",
        signal: signal ?? AbortSignal.timeout(timeout * 1000),
      });
      saveCookies(resp, new URL(url).hostname);
      if (RETRYABLE_STATUSES.has(resp.status) && attempt < maxRetries) {
        const wait = parseRetryAfter(resp) ?? Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        lastStatus = resp.status;
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      const content = buf.length > maxSize ? buf.subarray(0, maxSize) : buf;
      const ct = resp.headers.get("content-type") || "";
      const m = ct.match(/charset=([\w-]+)/i);
      const encoding = m ? m[1] : "utf-8";
      const text = new TextDecoder(encoding, { fatal: false }).decode(content);
      return {
        success: resp.status >= 200 && resp.status < 400,
        url: resp.url || url,
        status_code: resp.status,
        content: text,
        content_type: ct,
        encoding,
        duration_ms: Date.now() - startTime,
        retries: attempt,
      };
    } catch (e) {
      lastError = e.name === "TimeoutError" ? `请求超时（${timeout}秒）` : `请求失败: ${e.message}`;
      lastStatus = 0;
      if (attempt < maxRetries) continue;
    }
  }
  return { success: false, url, error: lastError || "未知错误", content: "", status_code: lastStatus, content_type: "", encoding: "", duration_ms: Date.now() - startTime, retries: maxRetries };
}

/** 手动取一个指纹（供 CLI 展示/调试）。 */
export function nextFingerprint() {
  return pickFingerprint();
}
