// content.js — 提取当前页（用户真实指纹环境：登录态/渲染完毕/真实 UA）
// extract-global.js 已注入（manifest content_scripts），提供全局 extractReadable/detectSpa。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'extract-page') return false;
  try {
    const html = document.documentElement.outerHTML;
    const r = extractReadable(html, location.href);
    sendResponse({
      ok: true,
      url: location.href,
      title: r.title,
      description: r.description,
      words: r.words,
      visible: r.visible,
      links: r.links,
      spa_suspect: detectSpa(html, r.text, r.visible),
      text: r.text,
    });
  } catch (e) {
    sendResponse({ ok: false, error: String(e.message || e) });
  }
  return true;
});
