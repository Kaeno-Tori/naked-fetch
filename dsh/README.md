# naked-fetch-dsh — DeepSeek Harness 适配插件

把 [naked-fetch](../README.md)（零依赖 AI 网页抓取器）注册为 DSH agent 的 **`web_fetch`** / **`web_search_bing`** 两个工具。

## 安装（两种方式）

### 方式 A：profile 安装（推荐，一次装好所有会话）

```sh
# 1. 安装 npm 包（含 naked-fetch 依赖）
npm i -g naked-fetch-dsh        # 或装到 DSH profile 的 node_modules

# 2. 把 bundle 加入 profile
#    编辑 ~/.dsh/profiles/<profile>/package.json：
#    "dsh": { "profile": { "bundles": [..., "naked-fetch-dsh"] } }
```

重启 dsh 后，所有会话的 agent 都能调用 `web_fetch` / `web_search_bing`。

### 方式 B：agent 自助（动态插件，单会话）

把你的 agent 指向下面的"自助安装"说明（或直接让它读本 README）：

> 用 `cordis_define`（idPrefix: `webt`，code.host 为 `examples/dsh-plugin.mjs` 的函数体，把 `WEB_TOOL` 改为 `require('naked-fetch/package.json')` 解析出的 cli.js 路径），然后 `cordis_run`。工具立即在当前会话可用；重启后需重装（动态插件不持久）。

## 工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `web_fetch` | url*, timeout, raw, js, engine | 抓取 + AI 去噪提取；SPA 空壳自动渲染兜底（firefox→chromium，Via 模式） |
| `web_search_bing` | query*, count, engine | 网页搜索（bing/baidu/ddg），无 API key |

## 设计

- 函数插件格式（`name/inject/Config/apply`），与 DSH 官方包同构
- 注册走 `ctx.tools.register(ToolDefinition)`，disposer 交给 `ctx.effect`（stop/update 自动撤销）
- 执行走 `ctx.subprocess` spawn `node naked-fetch cli.js --json`（`exec.signal` 绑定进程树终止）
- `config.webToolPath` 可覆盖 cli.js 定位

## 打包发布

```sh
cd dsh
npm publish    # 依赖 naked-fetch 先发
```
