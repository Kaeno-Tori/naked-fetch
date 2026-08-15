# naked-fetch — 极简智能体浏览器

![npm](https://img.shields.io/npm/v/naked-fetch) ![npm](https://img.shields.io/npm/dm/naked-fetch) ![license](https://img.shields.io/npm/l/naked-fetch)


**0 额外强制依赖**（Node ≥ 18）的极简智能体浏览器：抓取 → 去噪提取 → 结构化文本，让智能体直接"读懂"网页。

```
抓取（完整浏览器指纹） → 提取（结构化文本） → 分析（交给智能体）
```

## 由 DSH（DeepSeek Harness）自己安装

**这不是比喻，是字面意思**：本项目的插件是在 DeepSeek Harness 会话里，由运行在其中的 AI agent **给自己安装**的——`cordis_define` 定义、`cordis_run` 激活、工具注册、schema DSL 踩坑、`ctx.tools.register(defineTool(...))` 适配，全部在会话内完成并真实跑通（`web_fetch` / `web_search_bing` 两个工具已在 DSH 环境内实际使用）。

### 安装方式

**A. bundle 安装（一次装好所有会话）**——发布包 [naked-fetch-dsh](dsh/)：

```sh
npm i naked-fetch-dsh
# 编辑 ~/.dsh/profiles/<profile>/package.json：
# "dsh": { "profile": { "bundles": [..., "naked-fetch-dsh"] } }
```

**B. agent 自助（动态插件，单会话）**——把 [examples/dsh-plugin.mjs](examples/dsh-plugin.mjs) 交给你的 agent：

> 用 `cordis_define`（code.host 为该文件函数体，`WEB_TOOL` 指向 naked-fetch 的 cli.js），然后 `cordis_run`——工具立即在当前会话可用。

装好后 agent 获得 `web_fetch`（抓取 + AI 去噪提取）与 `web_search_bing`（无 API key 搜索）两个工具。

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

// 抓取 + 提取（SPA 空壳自动尝试浏览器渲染兜底（firefox→chromium））
const page = await fetchPage('https://example.com/article', { timeout: 30 })
console.log(page.title, page.text, page.spa_suspect)

// 搜索（bing 默认，无 API key，HTML 解析）
const r = await searchWeb('deepseek v4', { count: 5 })
console.log(r.results) // [{title, url, snippet}]

// 纯提取（已有 HTML 时）
const extracted = extractReadable(htmlString, baseUrl)
```

## 特性

- **完整浏览器指纹**：9 组 UA×sec-ch-ua 联动（Chrome/Edge/Safari/Firefox/移动端），Safari/Firefox 真实不发 sec-ch-ua 所以也不发；`Sec-Fetch-Site/Mode/Dest/User` 模拟地址栏直达；cookie 会话保持；轮换
- **防反爬**：1s 全局限速、429/503 指数退避重试、搜索 0 结果自动换指纹重试
- **SSRF 防护**：拒绝 localhost/内网/保留地址（含云元数据 169.254.169.254）
- **AI 提取**：`extractReadable` 去噪 + 保结构；`visible` 字段（去链接后字符数）用于 SPA 判定，长 URL 不会虚高
- **SPA 检测 + 可选渲染**：正文过短 + root/app 特征 → `spa_suspect: true`；自动浏览器渲染兜底（[Via 模式](#浏览器渲染内核via-模式)：复用系统 Firefox，回退 chromium），渲染器缺失时优雅降级并提示。
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
- SPA 渲染：playwright 已作为 optionalDependency（npm 自动安装），只需 `npx playwright install chromium` 下载内核（一次性 ~150MB，用户目录，无需 sudo）；Node 18 下核心可用、渲染不可用（playwright 要求 Node ≥ 20）。

## 生态参照

与 readability / trafilatura / firecrawl / Jina Reader 定位相近，差异点：**零强制依赖、完整指纹伪装、引擎可换、输出专为模型 token 预算优化**。

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

## Credits

- 由运行在 [**DeepSeek Harness**](https://github.com/deepseek-ai/deepseek-harness) 上的 AI agent（deepseek-v4-flash）协作开发：指纹层、HTML→AI 提取层、SPA 检测、gecko 引擎、DSH 适配插件均由 agent 在 Harness 环境内编写迭代；人类负责方向与设计决策。
- 真实案例：本项目的 DSH 插件是 agent **给自己写插件**的产物——工具注册、schema DSL 踩坑、`ctx.tools.register(defineTool(...))` 适配全部在会话内完成。
- 测试 11 项（提取/SSRF/指纹/SPA 检测）由 agent 编写，`npm test` 全绿。
