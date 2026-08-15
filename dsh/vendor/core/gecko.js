// core/gecko.js — 复用系统 Firefox 内核（Via 模式）
// 零依赖：原生 W3C WebDriver 协议（geckodriver 提供 HTTP 服务，node fetch 直接对话），
// 不引入 selenium。需要系统装有 Firefox + geckodriver 二进制（下载到项目 bin/ 或 pacman 安装，见 README）。
//
// 与 core/browser.js（playwright chromium）同构：返回 {success,url,status_code,content,...}。

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let _driverProc = null;
let _driverBase = null;
let _sessionId = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 找到 geckodriver 可执行文件。逐级向上找 bin/geckodriver：
 *   - 内嵌场景（dsh/vendor/core → ../../bin，即 dsh/bin）
 *   - 主仓库场景（core → ../bin）
 *   - node_modules/.bin（npm 包装）
 *   - PATH 兜底
 */
function findGeckodriver() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [];
  for (let depth = 0; depth <= 2; depth++) {
    const base = depth === 0 ? here : join(here, ...Array(depth).fill('..'));
    candidates.push(join(base, 'bin', 'geckodriver'));
  }
  candidates.push(join(here, '..', 'node_modules', '.bin', 'geckodriver'));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'geckodriver'; // 走 PATH
}

/** 启动 geckodriver（单例）。固定端口 + 轮询 /status，避免解析日志输出。 */
function ensureDriver() {
  if (_driverProc) return _driverBase;
  const bin = findGeckodriver();
  const port = 4444 + Math.floor(Math.random() * 100); // 避开占用
  _driverProc = spawn(bin, ['--port', String(port), '--log', 'warn'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  _driverBase = (async () => {
    for (let i = 0; i < 60; i++) {
      if (_driverProc.exitCode !== null) throw new Error('geckodriver 提前退出');
      try {
        const res = await fetch(base + '/status', { signal: AbortSignal.timeout(3000) });
        if (res.ok) return base;
      } catch { /* 未就绪，重试 */ }
      await sleep(250);
    }
    throw new Error('geckodriver 启动超时');
  })();
  return _driverBase;
}

async function wdRequest(method, path, body, timeout = 60000) {
  const base = await ensureDriver();
  if (base instanceof Error) throw base;
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout * 1000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.value?.message || json?.value?.error || `${res.status}`;
    throw new Error(`WebDriver ${method} ${path} 失败: ${msg}`);
  }
  return json.value;
}

async function ensureSession() {
  if (_sessionId) return _sessionId;
  const caps = await wdRequest('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          args: ['--headless'],
        },
        'goog:loggingPrefs': { browser: 'OFF' },
      },
    },
  }, 90);
  _sessionId = caps.sessionId;
  return _sessionId;
}

/** 关掉当前会话（下次调用自动开新会话）。 */
export async function closeSession() {
  if (_sessionId) {
    try { await wdRequest('DELETE', `/session/${_sessionId}`, undefined, 30); } catch { /* ignore */ }
    _sessionId = null;
  }
}

/**
 * 用系统 Firefox 渲染页面。
 * @param {string} url
 * @param {object} [opts] timeout(默认30)/settleMs(导航后等 JS 渲染的缓冲，默认 2500)
 * @returns 与 httpGet 同构的响应对象。
 */
export async function fetchWithFirefox(url, { timeout = 30, settleMs = 2500 } = {}) {
  const startTime = Date.now();
  try {
    const id = await ensureSession();
    // 导航（阻塞到 load 完成）
    await wdRequest('POST', `/session/${id}/url`, { url }, timeout);
    // SPA 在 load 后仍异步渲染：给缓冲
    if (settleMs > 0) await sleep(settleMs);
    const source = await wdRequest('GET', `/session/${id}/source`, undefined, timeout);
    return {
      success: true,
      url,
      status_code: 200,
      content: String(source),
      content_type: 'text/html',
      encoding: 'utf-8',
      duration_ms: Date.now() - startTime,
      retries: 0,
    };
  } catch (e) {
    return {
      success: false, url, error: `Firefox 渲染失败: ${e.message}`, status_code: 0,
      content: '', content_type: '', encoding: 'utf-8', duration_ms: Date.now() - startTime, retries: 0,
    };
  }
}

/** 清理：退出 geckodriver 进程。 */
export async function shutdownDriver() {
  await closeSession();
  if (_driverProc) {
    _driverProc.kill();
    _driverProc = null;
    _driverBase = null;
  }
}
