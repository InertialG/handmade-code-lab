# handmade-code-lab-proxy

仅代理本项目所需的 GitHub 仓库读取接口：

- `GET /api/repos/:owner/:repo`
- `GET /api/repos/:owner/:repo/commits`（仅接受 sha、per_page 1–100、page 1–2）
- `GET /api/repos/:owner/:repo/commits/:ref`
- `GET /tarball/:owner/:repo/:sha`（只接受 40 位提交 SHA）
- `GET /health` 与 CORS 预检

只转发当前请求的 Authorization，不使用部署者的 GITHUB_TOKEN。
匿名请求使用 GitHub 匿名配额；私有仓库必须提供用户自己的 PAT。
所有响应均为 `private, no-store`，不读取或写入 Cache API，不跟随上游重定向。
仓库重命名产生重定向时，请使用新的规范仓库名称。

`ALLOWED_ORIGINS` 可设置为逗号分隔的前端来源；不匹配的 Origin 会返回 403。
该设置是浏览器来源约束，不是身份认证；无 Origin 的客户端仍可读取公开仓库。
代理运营者能够接触请求中的 PAT，因此只使用自己信任的代理。

## 本地开发与部署

```bash
npm ci
npm test
npm run typecheck
npx wrangler dev
# 部署时执行：
npx wrangler deploy
```

前端构建配置 `VITE_PROXY_BASE` 为代理地址。
升级旧部署后，删除已不再使用的 GITHUB_TOKEN secret，并清理旧部署留下的共享缓存。
新版代码不会再读取这些旧缓存；清理仍有助于删除此前缓存的仓库内容。
若旧版本曾使用具备私有资源权限的服务端 Token，应撤销并检查其访问记录。
