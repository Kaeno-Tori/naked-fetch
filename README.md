# naked-fetch — AI 专属网页抓取器

**0 额外强制依赖**（Node ≥ 18）的网页抓取器，**为 LLM/AI 设计**：抓取 → 去噪提取 → 结构化文本，让模型直接"读懂"网页。

```
抓取（完整浏览器指纹） → 提取（AI 友好文本） → 分析（交给 LLM）
```

## 为什么是"AI 专属"

| 通用爬虫 | naked-fetch |
|---|---|
| 输出原始 HTML/JSON，模型自己解析 | 输出**去噪 markdown 风格文本**：标题层级/链接/表格/列表保留，script/nav/footer/aside 删除 |
| 反爬靠无头浏览器渲染（重、慢） | **指纹伪装**（UA×sec-ch-ua 联动、Sec-Fetch-*、cookie 会话）+ 限速重试，零强制依赖 |
| 渲染成图给模型"看" | 模型读文本就够——**渲染白瞎**，只有 SPA 空壳才需要 JS 执行（可选 Playwright） |

## 安装

```sh
npm i naked-fetch          # 安装 0 个强制依赖（playwright 为 optional）
```

## CLI

```sh
naked-fetch fetch <url> [--timeout N] [--raw] [--js] [--no-auto-js] [--json]
naked-fetch search <query> [--count N] [--engine bing|ddg|google|baidu] [--json]
```

```sh
$ naked-fetch fetch https://example.com
URL: https://example.com/
状态: 200 | 耗时: 1819ms
标题: Example Domain
正文: 20 词 | 1 链接
────────────────────────────────────────
# Example Domain
This domain is for use in documentation examples without needing permission. Avoid use in operations.
[Learn more](https://iana.org/domains/example)
```

## 库 API

```js
import { fetchPage, searchWeb, extractReadable } from 'naked-fetch'

// 抓取 + 提取（SPA 空壳自动尝试 Playwright 兜底）
const page = await fetchPage('https://example.com/article', { timeout: 30 })
console.log(page.title, page.text, page.spa_suspect)

// 搜索（bing 默认，无 API key，HTML 解析）
const r = await searchWeb('deepseek v4', { count: 5 })
console.log(r.results) // [{title, url, snippet}]

// 纯提取（已有 HTML 时）
const extracted = extractReadable(htmlString, baseUrl)
```

## 特性

- **完整浏览器指纹**：9 组 UA×sec-ch-ua 联动（Chrome/Edge/Safari/Firefox/移动端），Safari/Firefox 真实不发 sec-ch-ua 所以也不发；`Sec-Fetch-Site/Mode/Dest/User` 模拟地址栏直达；cookie 会话保持；随机轮换
- **防反爬**：1s 全局限速、429/503 指数退避重试、搜索 0 结果自动换指纹重试
- **SSRF 防护**：拒绝 localhost/内网/保留地址（含云元数据 169.254.169.254）
- **AI 提取**：`extractReadable` 去噪 + 保结构；`visible` 字段（去链接后字符数）用于 SPA 判定，长 URL 不会虚高
- **SPA 检测 + 可选渲染（Via 模式：复用系统浏览器内核）**：正文过短 + root/app 特征 → `spa_suspect: true`；自动浏览器渲染兜底，**优先复用系统 Firefox**（`core/gecko.js`，geckodriver + 原生 W3C WebDriver，零第二内核），失败回退 Playwright chromium；未装 geckodriver/chromium 时优雅降级并提示。`--engine firefox|chromium|auto` 可显式指定（Windows 上改 `--engine chromium` 或将来 `channel: msedge`）。
- **charset 解码**、5MB 上限、`--json` 结构化输出

## 浏览器渲染内核（Via 模式）

本工具**不打包浏览器内核**——像安卓 Via 一样复用系统已有的：

| 平台 | 复用对象 | 方式 |
|---|---|---|
| Linux | 系统 Firefox（默认浏览器） | geckodriver + W3C WebDriver（原生协议，无第三方库） |
| Windows | 系统 Edge（Chromium 内核） | Playwright `channel: 'msedge'`（规划中） |
| 兜底 | Playwright chromium | `npx playwright install chromium`（一次性下载） |

geckodriver 安装（任选，~5MB）：
```sh
# 从 GitHub releases 下载到项目 bin/（git 已忽略，不入库）
curl -sL -o geckodriver.tar.gz https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-linux64.tar.gz
tar xzf geckodriver.tar.gz && rm geckodriver.tar.gz
# 或 Arch：sudo pacman -S geckodriver
```

## 已知局限（易碎层声明）

- **搜索引擎解析是易碎层**：`core/search.js` 的正则依赖 Bing/DDG/百度当前 HTML 结构，改版/反爬升级会导致解析失效（已内置换指纹重试 + hint 降级）。**抓取 + 提取是稳定资产，搜索是附加能力**——重要检索请用 `fetch` 直接抓已知 URL。
- 国内网络可用性：bing ✅ / 百度 ✅（广告结果可能混入标题，见下）；ddg / google 在部分网络环境不可达。
- 百度解析已知局限：结果区若混入广告块，其标题会拼进首条结果的 title——过滤广告块在路线图内。
- SPA 渲染需要自行 `npm i playwright && npx playwright install chromium`（一次性 ~150MB，用户目录，无需 sudo）。

## 生态参照

与 readability / trafilatura / firecrawl / Jina Reader 定位相近，差异点：**零强制依赖、完整指纹伪装、引擎可换、输出专为模型 token 预算优化**。

## DSH（DeepSeek Harness）集成

见 [examples/dsh-plugin.mjs](examples/dsh-plugin.mjs)——把 `fetchPage`/`searchWeb` 注册为 `web_fetch`/`web_search_bing` 动态工具的完整示例（含 JSON schema、canonical output、render、取消信号、超时预算）。

## 开发

```sh
npm test          # node:test 单元测试（不碰网络）
npm run lint      # 语法检查
```

## 路线

- [ ] 提取层接入 cheerio/parse5 备选（当前正则实现对常见页面够用，无第三方库）
- [ ] 更鲁棒的搜索解析（多引擎结构探测）
- [ ] 并发抓取（遵守限速）

## License

MIT
