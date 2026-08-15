#!/usr/bin/env node
// scripts/sync-dsh-core.mjs — 把主仓库发布面同步进 dsh/vendor（内嵌，避免双份漂移）
// 用法: node scripts/sync-dsh-core.mjs

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = root;
const dest = join(root, 'dsh', 'vendor');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// 发布面：index.js / cli.js / core/
cpSync(join(src, 'index.js'), join(dest, 'index.js'));
cpSync(join(src, 'cli.js'), join(dest, 'cli.js'));
cpSync(join(src, 'core'), join(dest, 'core'), { recursive: true });

console.log(`✓ 已同步到 dsh/vendor/`);
