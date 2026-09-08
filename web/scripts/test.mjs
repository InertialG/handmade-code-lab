#!/usr/bin/env node
/**
 * 测试入口。
 *
 * 用 Node 内置的 test runner + 类型擦除（node --experimental-strip-types）跑
 * test/*.test.ts。测试只依赖 node:test / node:assert，因此零依赖即可运行。
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const testDir = resolve(root, 'test');
const files = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => resolve(testDir, f));

console.log(`[test] 使用 node:test 运行 ${files.length} 个测试文件`);
const r = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--no-warnings', '--test', ...files],
  { cwd: root, stdio: 'inherit' },
);
process.exit(r.status ?? 1);
