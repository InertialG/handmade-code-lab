import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BRANCH, parseNumstat, snapshotFromDir } from '../snapshot.ts';

test('本地 git 仓库 → 快照：文件、提交、统计、历史完整性', async () => {
  const work = mkdtempSync(join(tmpdir(), 'hcl-src-'));
  const bare = join(work, 'bare.git');
  const run = (args: string[], cwd = work) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: '人类', GIT_AUTHOR_EMAIL: 'h@x.io', GIT_COMMITTER_NAME: '人类', GIT_COMMITTER_EMAIL: 'h@x.io' } });
  try {
    run(['init', '-q', '-b', 'main']);
    writeFileSync(join(work, 'a.ts'), 'const a = 1;\n');
    writeFileSync(join(work, 'README.md'), '# hi\n');
    run(['add', '.']); run(['commit', '-q', '-m', 'init']);
    writeFileSync(join(work, 'a.ts'), 'const a = 1;\nconst b = 2;\n');
    run(['add', '.']); run(['commit', '-q', '-m', 'feat: b\n\nCo-authored-by: Claude <noreply@anthropic.com>']);
    run(['clone', '-q', '--bare', work, bare]);

    const snap = await snapshotFromDir(bare, { owner: 'o', repo: 'r', defaultBranch: 'main', sizeKb: 1, createdAt: '', stars: 0, language: null });
    assert.equal(snap.meta.branch, 'main');
    assert.match(snap.meta.sha, /^[0-9a-f]{40}$/);
    assert.equal(snap.historyComplete, true);
    assert.equal(snap.commits.length, 2);
    assert.equal(snap.commits[0]!.message, 'feat: b\n\nCo-authored-by: Claude <noreply@anthropic.com>');
    assert.equal(snap.commits[0]!.additions, 1);
    assert.equal(snap.commits[1]!.changedFiles, 2);
    assert.deepEqual([...snap.files.keys()].sort(), ['README.md', 'a.ts']);
    assert.equal(snap.files.get('a.ts')!.lines, 2);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('numstat 解析容忍二进制行', () => {
  const s = parseNumstat('\x1eabc\n\n3\t1\tx.ts\n-\t-\tlogo.png\n');
  assert.deepEqual(s.get('abc'), { additions: 3, deletions: 1, changedFiles: 2 });
});

test('分支名校验', () => {
  for (const ok of ['main', 'feature/foo', 'v1.2.3', 'release-2024']) assert.ok(BRANCH.test(ok), ok);
  for (const bad of ['-upload-pack=x', 'a..b', 'a b', 'x/', 'a@{1}', 'a^b']) assert.ok(!BRANCH.test(bad), bad);
});
