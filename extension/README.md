# web-tool 浏览器扩展（Firefox MV3）

复用**真实浏览器指纹**的 AI 网页提取：用户自己的 UA/WebGL/GPU/cookie/登录态——零伪装，因为就是真浏览器在访问。

## 与 CLI 的区别

| | CLI（web-tool fetch） | 扩展 |
|---|---|---|
| 指纹 | 伪装（UA 池） | **真实**（用户浏览器） |
| 登录态 | 无 cookie | 当前页提取 = 用户视角内容 |
| 渲染 | geckodriver/chromium | 页面已渲染完毕 |
| 反爬 | 对抗 | 天然免疫（就是用户自己） |

## 安装（开发模式，Firefox）

1. 构建共享提取层：`node scripts/build-extension.mjs`（生成 `extension/lib/extract-global.js`）
2. Firefox 打开 `about:debugging#/runtime/this-firefox`
3. 点 **临时加载附加组件** → 选 `extension/manifest.json`

或打包安装：`python3 -m zipfile` 打包 extension/ 目录为 xpi（见下）。

## 使用

- **提取当前页**：点工具栏图标 → "提取当前页"；或右键页面 → "用 web-tool 提取本页"
- **抓取任意 URL**：弹窗输入 URL → "抓取"（background fetch，跨域绕过 CORS；`credentials: omit` 不带 cookie 保护登录态）
- 结果：标题/链接/词数 + 去噪文本，可复制给 LLM

## 特性

- 提取层与 CLI **共享同一份 `core/extract.js`**（构建脚本剥 export 生成全局脚本，单一事实源）
- content script 提取当前页（登录态、渲染完毕）；background 跨域抓取（真实 UA）
- SPA 检测同 CLI（`spa_suspect` 提示）

## 构建产物

```sh
node scripts/build-extension.mjs        # 生成 extension/lib/extract-global.js
cd extension && python3 -c "import zipfile,os; z=zipfile.ZipFile('../extension.xpi','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),'.')) for r,d,fs in os.walk('.') for f in fs]; z.close()"
```

## 已知边界

- MV3 background 是 event page（Firefox）：空闲回收，长任务需注意
- 抓取新 URL 用 background fetch（`credentials: omit`）——要"像用户一样带 cookie 抓取"需扩展为隐藏标签页导航（路线图）
- `host_permissions: <all_urls>` 是敏感权限，商店发布需审核说明；本地开发无碍
