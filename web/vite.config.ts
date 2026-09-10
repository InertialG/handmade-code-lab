import { defineConfig } from 'vite';

/**
 * 站点子路径通过 BASE_PATH 注入，例如 BASE_PATH=/handmade-code-lab/。
 * 本地开发不设代理地址时，直接把 /api 与 /tarball 代理到 GitHub，
 * 这样本地不需要任何代理服务也能跑起来。
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: {
    proxy: {
      '/api': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
      '/tarball': {
        target: 'https://codeload.github.com',
        changeOrigin: true,
        rewrite: (p: string) => {
          const m = /^\/tarball\/([^/]+)\/([^/]+)\/(.+)$/.exec(p);
          return m ? `/${m[1]}/${m[2]}/tar.gz/${m[3]}` : p;
        },
        // ponytail: codeload 回 Content-Disposition: attachment，浏览器下载管理器插件会来抢；
        // 线上由节点出报告不走这条路，所以只在 dev 代理里剥掉。
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => { delete proxyRes.headers['content-disposition']; });
        },
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
