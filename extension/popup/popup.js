// popup.js — 扩展弹出 UI
const $ = (id) => document.getElementById(id);

function showResult(r) {
  if (!r.ok) {
    $('status').textContent = '✗ ' + (r.error || '失败');
    $('meta').textContent = '';
    return;
  }
  const parts = [];
  if (r.title) parts.push('标题: ' + r.title);
  parts.push(`URL: ${r.url} | ${r.words} 词 | ${r.links} 链接`);
  if (r.description) parts.push('描述: ' + r.description.slice(0, 120));
  $('meta').textContent = parts.join('\n'); // 避免 innerHTML 注入
  $('out').value = r.text || '(无正文)';
  $('status').textContent = r.spa_suspect ? '⚠️ 疑似 SPA 空壳' : '✓ 提取完成';
  $('status').className = r.spa_suspect ? 'status spa' : 'status';
}

$('btn-fetch').addEventListener('click', async () => {
  const url = $('url').value.trim();
  if (!url) { $('status').textContent = '请输入 URL'; return; }
  $('status').textContent = '抓取中…';
  const res = await chrome.runtime.sendMessage({ type: 'fetch-url', url });
  showResult(res);
});

$('btn-current').addEventListener('click', async () => {
  $('status').textContent = '提取中…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { $('status').textContent = '无法获取当前标签页'; return; }
  const res = await chrome.runtime.sendMessage({ type: 'extract-current', tabId: tab.id });
  showResult(res);
});

$('btn-copy').addEventListener('click', async () => {
  const text = $('out').value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $('status').textContent = '✓ 已复制';
  $('status').className = 'status copy-ok';
});

$('btn-clear').addEventListener('click', () => {
  $('out').value = '';
  $('meta').textContent = '';
  $('status').textContent = '';
});

// 从右键菜单过来的结果
chrome.storage.session?.get('lastExtract').then(({ lastExtract, lastExtractUrl } = {}) => {
  if (lastExtract) {
    $('out').value = lastExtract;
    $('meta').textContent = lastExtractUrl ? 'URL: ' + lastExtractUrl : '';
    $('status').textContent = '✓ 右键菜单提取';
    chrome.storage.session.remove('lastExtract');
  }
}).catch(() => {});
