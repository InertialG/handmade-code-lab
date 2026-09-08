/**
 * 纯手工代码鉴定中心 · 无脑代理 Worker
 *
 *   GET /tarball/:owner/:repo/:ref  → codeload.github.com 的 tar.gz（流式）
 *   GET /api/*                      → api.github.com/*
 *
 * 只做转发 + CORS，不做任何分析，也不存储任何内容。
 */

export interface Env {
  /** 可选：给未带 token 的请求兜底提高速率限制 */
  GITHUB_TOKEN?: string;
  /** 可选：逗号分隔的允许来源；缺省为 * */
  ALLOWED_ORIGINS?: string;
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allow = list.length === 0 ? '*' : origin && list.includes(origin) ? origin : list[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Accept,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function upstreamAuth(request: Request, env: Env): Record<string, string> {
  const client = request.headers.get('Authorization');
  if (client) return { Authorization: client };
  if (env.GITHUB_TOKEN) return { Authorization: `Bearer ${env.GITHUB_TOKEN}` };
  return {};
}

const UA = { 'User-Agent': 'handmade-code-lab/1.0 (+https://github.com/)' };

async function proxyApi(request: Request, env: Env, path: string, origin: string | null): Promise<Response> {
  const url = new URL(request.url);
  const target = `https://api.github.com${path}${url.search}`;
  const res = await fetch(target, {
    headers: {
      Accept: request.headers.get('Accept') ?? 'application/vnd.github+json',
      ...UA,
      ...upstreamAuth(request, env),
    },
  });
  const headers = new Headers(corsHeaders(env, origin));
  headers.set('Content-Type', res.headers.get('Content-Type') ?? 'application/json');
  for (const h of ['x-ratelimit-remaining', 'x-ratelimit-reset', 'link']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers });
}

async function proxyTarball(
  request: Request,
  env: Env,
  owner: string,
  repo: string,
  ref: string,
  origin: string | null,
  ctx: ExecutionContext,
): Promise<Response> {
  const target = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
  const cache = caches.default;
  const cacheKey = new Request(target, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  const upstream =
    hit ??
    (await fetch(target, { headers: { ...UA, ...upstreamAuth(request, env) } }));

  if (!hit && upstream.ok) {
    const cacheable = new Response(upstream.clone().body, upstream);
    cacheable.headers.set('Cache-Control', 'max-age=86400');
    ctx.waitUntil(cache.put(cacheKey, cacheable));
  }

  const headers = new Headers(corsHeaders(env, origin));
  headers.set('Content-Type', 'application/gzip');
  headers.set('Cache-Control', 'max-age=86400');
  headers.set('X-HCL-Cache', hit ? 'HIT' : 'MISS');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }
    if (request.method !== 'GET') {
      return new Response('本中心只接受 GET', { status: 405, headers: corsHeaders(env, origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '/health') {
      return new Response('handmade-code-lab proxy: OK', {
        headers: { ...corsHeaders(env, origin), 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (path.startsWith('/api/')) {
      return proxyApi(request, env, path.slice('/api'.length), origin);
    }

    const m = /^\/tarball\/([^/]+)\/([^/]+)\/(.+)$/.exec(path);
    if (m) {
      return proxyTarball(request, env, m[1]!, m[2]!, decodeURIComponent(m[3]!), origin, ctx);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(env, origin) });
  },
};
