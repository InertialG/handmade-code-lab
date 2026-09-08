import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRepoRef, parseRepoInput } from '../src/parseRepo.ts';

describe('parseRepoInput', () => {
  it('接受 owner/repo', () => {
    assert.deepEqual(parseRepoInput('octocat/Hello-World'), {
      owner: 'octocat',
      repo: 'Hello-World',
      branch: null,
    });
  });

  it('接受完整 URL 并去掉 .git 与查询串', () => {
    assert.deepEqual(parseRepoInput('https://github.com/octocat/Hello-World.git?tab=readme'), {
      owner: 'octocat',
      repo: 'Hello-World',
      branch: null,
    });
  });

  it('接受 /tree/branch', () => {
    assert.deepEqual(parseRepoInput('https://github.com/o/r/tree/feature/x'), {
      owner: 'o',
      repo: 'r',
      branch: 'feature/x',
    });
  });

  it('接受 ssh 形式', () => {
    assert.deepEqual(parseRepoInput('git@github.com:o/r.git'), {
      owner: 'o',
      repo: 'r',
      branch: null,
    });
  });

  it('拒绝垃圾输入', () => {
    for (const bad of ['', '   ', 'octocat', 'https://gitlab.com/a/b', 'https://github.com/']) {
      assert.equal(parseRepoInput(bad), null, `应拒绝：${JSON.stringify(bad)}`);
    }
  });

  it('formatRepoRef 带分支时输出 @branch', () => {
    assert.equal(formatRepoRef({ owner: 'o', repo: 'r', branch: 'dev' }), 'o/r@dev');
    assert.equal(formatRepoRef({ owner: 'o', repo: 'r', branch: null }), 'o/r');
  });
});
