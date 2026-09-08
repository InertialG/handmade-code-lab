# handmade-code-lab-proxy

一个只会转发的 Cloudflare Worker。它存在的唯一理由是：浏览器不允许直接跨域抓
`codeload.github.com` 的 tarball。

## 路由

| 路由 | 行为 |
| --- | --- |
| `GET /tarball/:owner/:repo/:ref` | 转发 `https://codeload.github.com/:owner/:repo/tar.gz/:ref`，流式返回，带 `Cache-Control: max-age=86400`，并用 Cache API 缓存 |
| `GET /api/*` | 转发 `https://api.github.com/*`，透传 query 与 `Authorization` |
| `GET /health` | 存活检查 |
| `OPTIONS *` | CORS 预检 |

鉴权优先级：客户端传来的 `Authorization` 头（用户自己的 PAT）> Worker 环境变量 `GITHUB_TOKEN`。

## 本地开发

```bash
cd worker
npm install
npx wrangler dev        # 默认 http://127.0.0.1:8787
```

前端指向它：

```bash
cd ../web
VITE_PROXY_BASE=http://127.0.0.1:8787 npm run dev
```

## 部署

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN   # 可选，用于提高匿名请求的速率上限
```

可选地在 `wrangler.toml` 里设置 `ALLOWED_ORIGINS`，把 CORS 限制到你自己的 Pages 域名。

部署完拿到的地址（形如 `https://handmade-code-lab-proxy.<账号>.workers.dev`）填进前端构建时的
`VITE_PROXY_BASE` 即可。
