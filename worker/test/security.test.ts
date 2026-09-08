import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

const sha = 'a'.repeat(40);
test('proxy security boundaries', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; auth: string | null }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), auth: new Headers(init?.headers).get('Authorization') });
    return new Response(new Headers(init?.headers).has('Authorization') ? 'private' : 'public');
  }) as typeof fetch;
  try {
    const env = { GITHUB_TOKEN: 'must-not-be-used', ALLOWED_ORIGINS: 'https://allowed.test' };
    const get = (path: string, headers = {}) => worker.fetch(new Request(`https://proxy.test${path}`, { headers }), env);
    for (const path of ['/api/user/repos', '/api/repos/a/b/issues', '/api/repos/a/b/contents/secret', '/api/repos/a/b?other=1', '/tarball/a/b/main', '/tarball/a/b/%FF']) {
      assert.ok((await get(path)).status >= 400, path);
    }
    assert.equal(calls.length, 0);
    assert.equal((await get('/api/repos/a/b', { Origin: 'https://evil.test' })).status, 403);
    assert.equal(calls.length, 0);
    await get('/api/repos/a/b');
    assert.equal(calls.at(-1)?.auth, null);
    const privateResult = await get(`/tarball/a/b/${sha}`, { Authorization: 'Bearer user-token' });
    assert.equal(await privateResult.text(), 'private');
    assert.equal(privateResult.headers.get('Cache-Control'), 'private, no-store');
    const publicResult = await get(`/tarball/a/b/${sha}`);
    assert.equal(await publicResult.text(), 'public');
    assert.equal(calls.at(-1)?.auth, null);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } });
    assert.equal((await get('/api/repos/a/b')).status, 502);
    globalThis.fetch = async () => { throw new Error('secret upstream details'); };
    assert.equal(await (await get('/api/repos/a/b')).text(), 'GitHub upstream unavailable');
  } finally { globalThis.fetch = original; }
});
