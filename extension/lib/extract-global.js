// core/extract.js — HTML → AI 友好文本提取层
// 目的：给 LLM 喂去噪的结构化文本，而不是整页 HTML 或渲染图。
// 保留：标题层级、链接、表格、列表、代码块；删除：script/style/nav/footer/aside/iframe/表单。

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, "").trim();
}

function decodeEntities(s) {
  return s
    .replace(/&ensp;|&#0183;|&#160;|&nbsp;|&#8194;|&#8195;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&copy;|&#169;/g, "©")
    .replace(/&reg;|&#174;/g, "®")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, "");
}

function toAbsUrl(rel, base) {
  try { return new URL(rel, base).href; } catch { return rel; }
}

/**
 * 将 HTML 文档提取为 AI 友好的 markdown 风格文本。
 * @param {string} html 原始 HTML
 * @param {string} baseUrl 用于把相对链接转绝对
 * @returns {{title: string, description: string, text: string, visible: number, links: number, words: number}}
 */
function extractReadable(html, baseUrl) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripHtml(titleMatch[1])) : "";
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const description = descMatch ? decodeEntities(descMatch[1]) : "";

  let h = html
    // head 块：title/meta/link 已单独提取，避免其文本混入正文
    .replace(/<head[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
    // 删除无内容标签（含内容）
    .replace(/<(script|style|noscript|template|svg|iframe|form|canvas|video|audio|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    // 删除自闭合无内容标签
    .replace(/<(link|meta|input|button|select|option|textarea|label|source|picture)[^>]*\/?>/gi, " ")
    // 删除注释
    .replace(/<!--[\s\S]*?-->/g, " ")
    // 删除噪声语义块（导航/页脚/侧栏/广告）
    .replace(/<nav[^>]*>[\s\S]*?<\/nav\s*>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer\s*>/gi, " ")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside\s*>/gi, " ")
    // 删除无语义装饰属性
    .replace(/\s(class|id|style|data-[a-z-]+|role|aria-[a-z-]+|tabindex|onclick|onload|draggable|contenteditable)=["'][^"']*["']/gi, " ");

  // 标题层级 → markdown
  h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, inner) => {
    const text = decodeEntities(stripHtml(inner)).replace(/\s+/g, " ").trim();
    return text ? "\n" + "#".repeat(Number(level)) + " " + text + "\n" : "";
  });

  // 链接 → [text](url)，去重
  const seenLinks = new Set();
  h = h.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_, href, inner) => {
    const text = decodeEntities(stripHtml(inner)).replace(/\s+/g, " ").trim();
    if (!text) return "";
    const abs = toAbsUrl(href, baseUrl);
    if (seenLinks.has(abs)) return text; // 重复链接只留文字
    seenLinks.add(abs);
    return `[${text}](${abs})`;
  });

  // 图片 → ![alt](src)
  h = h.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, (_, src, alt) => {
    return alt ? `![${decodeEntities(alt)}](${toAbsUrl(src, baseUrl)})` : "";
  });
  h = h.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (_, alt, src) => {
    return alt ? `![${decodeEntities(alt)}](${toAbsUrl(src, baseUrl)})` : "";
  });

  // 表格 → markdown 表格（首行作表头）
  h = h.replace(/<table[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, inner) => {
    const rows = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    let tr;
    while ((tr = trRe.exec(inner)) !== null) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)]
        .map((c) => decodeEntities(stripHtml(c[1])).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim());
      if (cells.length) rows.push(cells);
    }
    if (rows.length === 0) return "";
    const cols = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(cols - r.length).fill("")];
    const lines = [pad(rows[0]).join(" | "), Array(cols).fill("---").join(" | ")];
    for (const row of rows.slice(1)) lines.push(pad(row).join(" | "));
    return "\n" + lines.join("\n") + "\n";
  });

  // 列表项 → "- "
  h = h.replace(/<li[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, inner) => {
    const text = decodeEntities(stripHtml(inner)).replace(/\s+/g, " ").trim();
    return text ? `\n- ${text}` : "";
  });

  // 代码块 → 保留
  h = h.replace(/<pre[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_, inner) => {
    const code = inner.replace(/<code[^>]*>/gi, "").replace(/<\/code\s*>/gi, "").replace(/<[^>]+>/g, "");
    return `\n\`\`\`\n${decodeEntities(code).trim()}\n\`\`\`\n`;
  });
  h = h.replace(/<code[^>]*>([\s\S]*?)<\/code\s*>/gi, (_, inner) => `\`${decodeEntities(stripHtml(inner)).trim()}\``);

  // 引用块
  h = h.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_, inner) => {
    const text = decodeEntities(stripHtml(inner)).replace(/\s+/g, " ").trim();
    return text ? `\n> ${text}\n` : "";
  });

  // 块级标签 → 换行
  h = h.replace(/<\/(p|div|section|article|ul|ol|table|tr|br|hr|h[1-6]|blockquote|pre|li)\s*>/gi, "\n");
  h = h.replace(/<(br|hr)\s*\/?>/gi, "\n");

  // 剩余标签剥掉
  h = h.replace(/<[^>]+>/g, " ");

  // 实体解码 + 空白清理
  h = decodeEntities(h)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 可见字符数：去掉 markdown 链接 URL / 图片 / 符号后的纯文本长度。
  // 不能直接数 text.length——长 URL 会虚高，SPA 空壳会被误判为有内容。
  const visible = h
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // 图片整段去掉
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接只留文字
    .replace(/[#|>`*_\-\n]+/g, " ") // markdown 符号
    .replace(/\s+/g, " ")
    .trim().length;

  return {
    title,
    description,
    text: h,
    visible,
    links: seenLinks.size,
    words: h.split(/\s+/).filter(Boolean).length,
  };
}

// ── SPA 空壳检测 ──
const SPA_HINTS = [/id=["'](root|app|__nuxt|__next|__app)["']/i, /createRoot\(/i, /ReactDOM\.render/i, /data-server-rendered/i];

/** 正文过短 + root/app 特征 → 疑似 SPA/JS 渲染页面。 */
function detectSpa(html, extractedText, visibleChars) {
  if ((visibleChars ?? extractedText.trim().length) >= 200) return false;
  return SPA_HINTS.some((re) => re.test(html));
}
