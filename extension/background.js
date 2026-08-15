// background.js — web-tool 扩展后台（MV3 event page）
// 职责：
//   1. 跨域抓取任意 URL（host_permissions 绕过 CORS，真实浏览器 UA/网络栈）
//   2. 消息路由：popup ⇄ content script
//   3. 右键菜单："用 web-tool 提取当前页"
// extract-global.js 已在此页面前加载（manifest background.scripts），提供全局 extractReadable。

const MAX_BODY = 5 * 1024 * 1024;

async function fetchUrl(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      credentials: 'omit', // 跨域抓取不带 cookie（保护用户登录态）
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf.slice(0, MAX_BODY));
    return { ok: resp.ok, status: resp.status, finalUrl: resp.url, html: text };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? '请求超时' : String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// 从 HTML 提取（background 环境也能跑纯函数）
function extractFromHtml(html, baseUrl) {
  const r = extractReadable(html, baseUrl);
  return {
    title: r.title,
    description: r.description,
    words: r.words,
    visible: r.visible,
    links: r.links,
    spa_suspect: typeof detectSpa === 'function' ? detectSpa(html, r.text, r.visible) : false,
    text: r.text,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'fetch-url') {
    (async () => {
      try {
        const r = await fetchUrl(msg.url, msg.timeoutMs);
        if (!r.ok) {
          sendResponse({ ok: false, error: r.error || `HTTP ${r.status}` });
          return;
        }
        sendResponse({ ok: true, ...extractFromHtml(r.html, r.finalUrl || msg.url), url: r.finalUrl, status: r.status });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true; // 异步 sendResponse
  }
  if (msg?.type === 'extract-current') {
    // 转发给目标 tab 的 content script
    const tabId = msg.tabId;
    if (tabId === undefined) { sendResponse({ ok: false, error: '缺少 tabId' }); return; }
    (async () => {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'extract-page' });
        sendResponse(res || { ok: false, error: 'content script 无响应' });
      } catch (e) {
        sendResponse({ ok: false, error: '无法连接页面脚本: ' + (e.message || e) });
      }
    })();
    return true;
  }
  return false;
});

// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'webtool-extract-page',
    title: '用 web-tool 提取本页',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'webtool-extract-page' || !tab?.id) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page' });
    if (res?.ok) {
      // 打开 popup 展示（通过 storage 传结果）
      await chrome.storage.session.set({ lastExtract: res.data, lastExtractUrl: res.url });
      chrome.action.openPopup?.();
    }
  } catch (e) {
    console.error('提取失败:', e);
  }
});
