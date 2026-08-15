// core/fingerprint.js — 浏览器指纹层
// UA 与 sec-ch-ua 联动（版本一致）、Sec-Fetch-*、cookie 会话、随机轮换。

/** 指纹池：Safari/Firefox 真实不发 sec-ch-ua，所以这里也不发。 */
export const FINGERPRINTS = [
  // Chrome 130 / Windows
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa: '"Not.A/Brand";v="99", "Chromium";v="130", "Google Chrome";v="130"',
    platform: '"Windows"', mobile: false },
  // Chrome 130 / macOS
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa: '"Not.A/Brand";v="99", "Chromium";v="130", "Google Chrome";v="130"',
    platform: '"macOS"', mobile: false },
  // Chrome 130 / Linux
  { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa: '"Not.A/Brand";v="99", "Chromium";v="130", "Google Chrome";v="130"',
    platform: '"Linux"', mobile: false },
  // Chrome 131 / Windows（最新代）
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"Windows"', mobile: false },
  // Edge 130 / Windows
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    secChUa: '"Not.A/Brand";v="99", "Chromium";v="130", "Microsoft Edge";v="130"',
    platform: '"Windows"', mobile: false },
  // Safari 18 / macOS（不发 sec-ch-ua）
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    platform: '"macOS"', mobile: false },
  // Firefox 132 / Windows（不发 sec-ch-ua）
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    platform: '"Windows"', mobile: false },
  // Chrome 131 / Android（移动）
  { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    platform: '"Android"', mobile: true },
  // Safari / iPhone（不发 sec-ch-ua）
  { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    platform: '"iOS"', mobile: true },
];

let _fpIndex = -1;

/** 轮换取下一个指纹。 */
export function pickFingerprint() {
  _fpIndex = (_fpIndex + 1) % FINGERPRINTS.length;
  return FINGERPRINTS[_fpIndex];
}

/**
 * 构建带完整指纹的请求头。
 * @param {object} fp - pickFingerprint() 的结果；缺省自动取一个。
 * @param {object} extra - 额外头（如 Referer）。
 * @param {string} cookies - 已有 cookie 串（由调用方传入，保持 fetch.js 持有会话状态）。
 * @returns {Record<string,string>}
 */
export function buildHeaders({ fp = pickFingerprint(), extra = {}, cookies = "" } = {}) {
  const h = {
    "User-Agent": fp.ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    ...(fp.secChUa ? { "sec-ch-ua": fp.secChUa } : {}),
    ...(fp.platform ? { "sec-ch-ua-platform": fp.platform } : {}),
    ...(fp.mobile !== undefined ? { "sec-ch-ua-mobile": fp.mobile ? "?1" : "?0" } : {}),
    // 导航请求（地址栏直达）：none / navigate / document / ?1
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-User": "?1",
    ...extra,
  };
  if (cookies) h.Cookie = cookies;
  return h;
}
