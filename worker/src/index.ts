/** Repository-only GitHub proxy. Credentials belong to the current request only. */
export interface Env {
  ALLOWED_ORIGINS?: string;
}

const UA = { 'User-Agent': 'handmade-code-lab/1.0' };
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = new Headers({
      'Access-Control-Allow-Origin': allowed.length ? (origin && allowed.includes(origin) ? origin : allowed[0]!) : '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Accept,Content-Type',
      'Access-Control-Expose-Headers': 'x-ratelimit-remaining,x-ratelimit-reset,link,retry-after',
      'Vary': 'Origin',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const reply = (body: string, status: number) => new Response(body, { status, headers });
    if (origin && allowed.length && !allowed.includes(origin)) return reply('Origin not allowed', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply('Method not allowed', 405);
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return reply('handmade-code-lab proxy: OK', 200);

    let parts: string[];
    try { parts = url.pathname.split('/').slice(1).map(decodeURIComponent); }
    catch { return reply('Invalid encoding', 400); }
    let target: URL;
    if (parts[0] === 'api' && parts[1] === 'repos' && (parts.length === 4 || (parts[4] === 'commits' && (parts.length === 5 || parts.length === 6)))) {
      if (!NAME.test(parts[2]!) || !NAME.test(parts[3]!)) return reply('Invalid repository', 400);
      if (parts.length === 6 && (!parts[5] || parts[5] === '.' || parts[5] === '..')) return reply('Invalid ref', 400);
      target = new URL(`https://api.github.com/${parts.slice(1).map(encodeURIComponent).join('/')}`);
      for (const [key, value] of url.searchParams) {
        if (parts.length !== 5 || !['sha', 'per_page', 'page'].includes(key)) return reply('Unsupported query', 400);
        if (key === 'per_page' && (!/^\d+$/.test(value) || +value < 1 || +value > 100)) return reply('Invalid page size', 400);
        if (key === 'page' && (!/^\d+$/.test(value) || +value < 1 || +value > 2)) return reply('Invalid page', 400);
        target.searchParams.set(key, value);
      }
    } else if (parts[0] === 'tarball' && parts.length === 4) {
      if (!NAME.test(parts[1]!) || !NAME.test(parts[2]!) || !/^[a-f0-9]{40}$/i.test(parts[3]!)) return reply('Archive requires a commit SHA', 400);
      if (url.search) return reply('Unsupported query', 400);
      target = new URL(`https://codeload.github.com/${parts[1]}/${parts[2]}/tar.gz/${parts[3]}`);
    } else return reply('Not found', 404);

    const upstreamHeaders = new Headers({ ...UA, Accept: 'application/vnd.github+json' });
    const token = request.headers.get('Authorization');
    if (token) upstreamHeaders.set('Authorization', token);
    try {
      const res = await fetch(target, { headers: upstreamHeaders, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        return reply('Upstream redirect refused; use the canonical repository name', 502);
      }
      headers.set('Content-Type', parts[0] === 'tarball' && res.ok ? 'application/gzip' : 'application/json');
      for (const name of ['x-ratelimit-remaining', 'x-ratelimit-reset', 'link', 'retry-after']) {
        const value = res.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(res.body, { status: res.status, headers });
    } catch { return reply('GitHub upstream unavailable', 502); }
  },
};
