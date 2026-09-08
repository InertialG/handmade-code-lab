import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchSnapshot } from '../src/github.ts';
import { formatRepoRef, parseRepoInput } from '../src/parseRepo.ts';
import { readLimited } from '../src/tar.ts';
const sha = 'a'.repeat(40);
const ref = { owner: 'a', repo: 'b', branch: 'feature/foo' };
test('branch links roundtrip', () => assert.deepEqual(parseRepoInput(formatRepoRef(ref)), ref));
test('snapshot pins history and archive to SHA and forwards user credentials', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url, init) => {
    const path = String(url); calls.push(path);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (path.startsWith('/tarball/')) return new Response(readFileSync(new URL('./fixtures/sample-repo.tar.gz', import.meta.url)));
    if (path === '/api/repos/a/b') return Response.json({ default_branch: 'main', size: 1 });
    const commit = { sha, commit: { message: 'fix', author: null }, stats: { additions: 1, deletions: 0 }, files: [] };
    return Response.json(path.includes('?') ? [commit] : commit);
  }) as typeof fetch;
  const snap = await fetchSnapshot(ref, { token: 'test-token', fetchImpl });
  assert.equal(snap.meta.sha, sha);
  assert.equal(snap.historyComplete, true);
  assert.ok(calls.includes(`/tarball/a/b/${sha}`));
  assert.ok(calls.some(p => p.includes(`?sha=${sha}&`)));
});
test('failed history requests do not produce cached-looking snapshots', async () => {
  let n = 0;
  const fetchImpl = (async () => ++n === 1 ? Response.json({ default_branch: 'main', size: 1 }) : n === 2 ? Response.json({ sha }) : new Response('limited', { status: 403 })) as typeof fetch;
  await assert.rejects(fetchSnapshot(ref, { fetchImpl }), /403/);
});
test('stream limit cancels before retaining oversized output', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readLimited(stream, 10), /安全大小限制/);
  assert.equal(cancelled, true);
});

test('truncated history skips rules requiring the initial commit', async () => {
  const { initialDump, repoAge } = await import('../src/rules/commits.ts');
  const fetchImpl = (async (url) => {
    const path = String(url);
    if (path === '/api/repos/a/b') return Response.json({ default_branch: 'main', size: 1, created_at: '2024-01-01T00:00:00Z' });
    if (path.startsWith('/tarball/')) return new Response(readFileSync(new URL('./fixtures/sample-repo.tar.gz', import.meta.url)));
    const commit = { sha, commit: { message: 'fix', author: null }, stats: { additions: 1, deletions: 0 }, files: [] };
    return Response.json(path.includes('?') ? Array.from({ length: 100 }, () => commit) : commit);
  }) as typeof fetch;
  const snap = await fetchSnapshot(ref, { fetchImpl });
  assert.equal(snap.historyComplete, false);
  assert.equal(snap.commits.length, 200);
  assert.deepEqual(initialDump.run(snap), []);
  assert.deepEqual(repoAge.run(snap), []);
});
