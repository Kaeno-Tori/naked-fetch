// test/extract.test.js — 提取层单元测试（node:test，不碰网络）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReadable, detectSpa, decodeEntities, stripHtml } from '../core/extract.js';
import { isInternalUrl } from '../core/fetch.js';
import { buildHeaders, FINGERPRINTS } from '../core/fingerprint.js';

test('decodeEntities 解码常见实体', () => {
  assert.equal(decodeEntities('a&nbsp;b&amp;c&lt;d&gt;e&quot;f&#39;g'), 'a b&c<d>e"f\'g');
  assert.equal(decodeEntities('&#x4e2d;&#25991;'), '中文'); // 十六进制兜底走 fromCodePoint
  assert.equal(decodeEntities('&mdash;&ndash;&hellip;'), '—–…');
});

test('stripHtml 剥标签', () => {
  assert.equal(stripHtml('<p>hello <b>world</b></p>'), 'hello world');
});

test('extractReadable: 标题/层级/链接/列表/表格', () => {
  const html = `
<html><head><title>测试页</title>
<meta name="description" content="页面描述">
</head><body>
<nav><a href="/x">导航</a></nav>
<h1>主标题</h1>
<h2>小节</h2>
<p>一段<a href="https://example.com/a">链接文字</a>内容</p>
<ul><li>项一</li><li>项二</li></ul>
<table><tr><th>列A</th><th>列B</th></tr><tr><td>1</td><td>2</td></tr></table>
<footer>页脚</footer>
<script>var x=1;</script>
</body></html>`;
  const r = extractReadable(html, 'https://example.com/page');
  assert.equal(r.title, '测试页');
  assert.equal(r.description, '页面描述');
  assert.match(r.text, /# 主标题/);
  assert.match(r.text, /## 小节/);
  assert.match(r.text, /\[链接文字\]\(https:\/\/example\.com\/a\)/);
  assert.match(r.text, /- 项一/);
  assert.match(r.text, /列A \| 列B/);
  assert.doesNotMatch(r.text, /导航/);      // nav 删除
  assert.doesNotMatch(r.text, /页脚/);      // footer 删除
  assert.doesNotMatch(r.text, /var x=1/);   // script 删除
  assert.doesNotMatch(r.text, /测试页/);    // head 删除（title 不进正文）
});

test('extractReadable: 重复链接去重只留文字', () => {
  const html = '<body><p><a href="https://a.com/x">甲</a>和<a href="https://a.com/x">甲</a></p></body>';
  const r = extractReadable(html, 'https://example.com');
  assert.equal((r.text.match(/甲/g) || []).length, 2);
  assert.equal((r.text.match(/https:\/\/a\.com\/x/g) || []).length, 1);
});

test('extractReadable: 相对链接转绝对', () => {
  const html = '<body><p><a href="/path">相对</a></p></body>';
  const r = extractReadable(html, 'https://example.com/base');
  assert.match(r.text, /https:\/\/example\.com\/path/);
});

test('extractReadable: visible 不含链接 URL（SPA 判定用）', () => {
  const html = '<body><div id="root"><a href="https://very-long-domain.example/a/very/long/path?with=params">短</a></div></body>';
  const r = extractReadable(html, 'https://example.com');
  assert.ok(r.visible < r.text.length, `visible(${r.visible}) 应小于 text.length(${r.text.length})`);
});

test('detectSpa: 空壳 + root 特征 → true', () => {
  const html = '<html><head><title>App</title></head><body><div id="root"></div><script src="app.js"></script></body></html>';
  const r = extractReadable(html, 'https://example.com');
  assert.equal(detectSpa(html, r.text, r.visible), true);
});

test('detectSpa: 有正文 → false', () => {
  const html = '<html><body><div id="root"><p>' + '内容'.repeat(200) + '</p></div></body></html>';
  const r = extractReadable(html, 'https://example.com');
  assert.equal(detectSpa(html, r.text, r.visible), false);
});

test('isInternalUrl: SSRF 拦截', () => {
  assert.equal(isInternalUrl('http://localhost:8080/x'), true);
  assert.equal(isInternalUrl('http://127.0.0.1/x'), true);
  assert.equal(isInternalUrl('http://10.0.0.5/x'), true);
  assert.equal(isInternalUrl('http://192.168.1.1/x'), true);
  assert.equal(isInternalUrl('http://172.16.0.1/x'), true);
  assert.equal(isInternalUrl('http://169.254.169.254/latest/meta-data'), true); // 云元数据
  assert.equal(isInternalUrl('http://foo.local/x'), true);
  assert.equal(isInternalUrl('https://example.com/x'), false);
  assert.equal(isInternalUrl('https://www.ruanyifeng.com/blog/'), false);
});

test('isInternalUrl: 畸形 URL 一律拒绝', () => {
  assert.equal(isInternalUrl('not a url'), true);
  assert.equal(isInternalUrl(''), true);
});

test('fingerprint: UA 与 sec-ch-ua 联动', () => {
  const h = buildHeaders({ fp: FINGERPRINTS[0] });
  assert.ok(h['User-Agent'].includes('Chrome/130'));
  assert.ok(h['sec-ch-ua'].includes('"Google Chrome";v="130"'));
  assert.equal(h['sec-ch-ua-mobile'], '?0');
  assert.equal(h['Sec-Fetch-Dest'], 'document');
  assert.equal(h['Sec-Fetch-Site'], 'none');
  // Safari 不发 sec-ch-ua
  const safari = buildHeaders({ fp: FINGERPRINTS[5] });
  assert.equal(safari['sec-ch-ua'], undefined);
  assert.ok(safari['User-Agent'].includes('Safari/605'));
});
