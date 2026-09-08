#!/usr/bin/env node
/**
 * 构建入口。
 *
 * 优先使用 Vite（依赖已安装时）；如果 node_modules 里没有 Vite——例如在没有 npm
 * registry 访问权限的环境里——就退化为「tsc 直出原生 ESM」：浏览器本来就支持
 * <script type="module">，本项目没有任何需要打包的裸模块导入，所以产物照样能跑。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const proxyBase = process.env.VITE_PROXY_BASE ?? '';

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

if (existsSync(resolve(root, 'node_modules/vite'))) {
  console.log('[build] 使用 Vite');
  process.exit(run('npx', ['vite', 'build']) ? 0 : 1);
}

console.log('[build] 未安装 Vite，退化为 tsc + 原生 ESM 构建');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

if (!run('tsc', ['-p', 'tsconfig.build.json'])) {
  console.error('[build] tsc 失败');
  process.exit(1);
}

cpSync(resolve(root, 'src/style.css'), resolve(dist, 'src/style.css'));

const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  .replace('./src/main.ts', `${base}src/main.js`)
  .replace('./src/style.css', `${base}src/style.css`)
  .replace(
    '</head>',
    `  <script>globalThis.__HCL_PROXY_BASE__ = ${JSON.stringify(proxyBase)};</script>\n  </head>`,
  );
writeFileSync(resolve(dist, 'index.html'), html);
// GitHub Pages 不要对产物做 Jekyll 处理
writeFileSync(resolve(dist, '.nojekyll'), '');

console.log(`[build] 完成 → ${dist}（base=${base}，proxy=${proxyBase || '(未设置)'}）`);
