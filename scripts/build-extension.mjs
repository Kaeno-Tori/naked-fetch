#!/usr/bin/env node
// scripts/build-extension.mjs — 从 core/extract.js 生成扩展可用的全局脚本
// core/extract.js 是纯 ESM（零 node 依赖），但扩展的 content script / background 需要
// 全局函数形式（MV3 限制）。本脚本剥掉 export 关键字，输出 extension/lib/extract-global.js。
// 用法: node scripts/build-extension.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'core', 'extract.js'), 'utf8');

let out = src
  // 去掉 export 前缀（export function/const → function/const）
  .replace(/^export\s+function\s+/gm, 'function ')
  .replace(/^export\s+const\s+/gm, 'const ')
  .replace(/^export\s+class\s+/gm, 'class ')
  // 去掉行尾的 export { ... }
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

// 确保全局可达（content script / background 的顶层 var 即 window 全局，无需额外处理）

const dest = join(root, 'extension', 'lib', 'extract-global.js');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`✓ 已生成 ${dest} (${out.length} bytes)`);
