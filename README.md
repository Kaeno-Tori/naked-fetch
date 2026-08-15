# naked-fetch — 极简智能体浏览器

**0 额外强制依赖**（Node ≥ 18）的网页抓取器：抓取 → 去噪提取 → 结构化文本。

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 生态插件，由运行在 Harness 内的 AI agent 开发并自装（[naked-fetch-dsh](dsh/)）。

## 安装

```sh
git clone https://github.com/Kaeno-Tori/naked-fetch.git
./naked-fetch/cli.js fetch <url>
```

DSH 插件（引擎内嵌，一条命令装完）：

```sh
npm i naked-fetch-dsh
# ~/.dsh/profiles/<profile>/package.json → dsh.profile.bundles 加 "naked-fetch-dsh"
```

## 用法

```sh
naked-fetch fetch <url> [--timeout N] [--raw] [--js] [--engine auto|firefox|chromium] [--json]
naked-fetch search <query> [--count N] [--engine bing|baidu|ddg|google] [--json]
```

```js
import { fetchPage, searchWeb, extractReadable } from 'naked-fetch'

const page = await fetchPage('https://example.com')  // 抓取 + 提取
const r = await searchWeb('deepseek', { count: 5 })  // 搜索（无 API key）
```

## 特性

- 完整浏览器指纹（UA×sec-ch-ua 联动、Sec-Fetch-*、cookie 会话）
- SSRF 防护（内网/保留地址/非 http(s) 协议）
- AI 友好提取：去噪（head/script/nav/footer/aside），保留标题层级/链接/表格/列表
- SPA 检测 + 可选渲染（`js: true`；复用系统 Firefox，回退 Chromium）
- 限速与重试、charset 解码、`--json` 输出

## 已知局限

- 搜索引擎解析依赖当前 HTML 结构，改版可能失效（返回 `error: 'parse_error'` 可识别）
- 渲染需系统 Firefox（或 Playwright，可选安装）
- 其他平台（Windows/macOS）的复用内核路径在规划中

## 开发

```sh
npm test          # node:test 单元测试（不碰网络）
npm run lint      # 语法检查
```

## License

MIT
