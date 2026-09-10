import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { untarGz } from '../src/tar.ts';
import { filesFromTarEntries, makeSnapshot } from '../src/snapshot.ts';
import { analyze, reportToText } from '../src/analyze.ts';
import { rules } from '../src/rules/index.ts';
import { commit, meta } from './factory.ts';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/sample-repo.tar.gz');

const COMMITS = [
  commit({ sha: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c', message: 'fix', date: '2024-03-02T03:11:00Z', additions: 120, deletions: 4, changedFiles: 3 }),
  commit({ sha: '1111111111111111111111111111111111111111', message: 'feat: 加点东西\n\n- 顺手改了别的', date: '2024-02-20T10:00:00Z', additions: 40, deletions: 1, changedFiles: 2 }),
  commit({ sha: '2222222222222222222222222222222222222222', message: 'wip', date: '2024-01-05T22:30:00Z', additions: 300, deletions: 0, changedFiles: 6 }),
];

async function buildSnapshot() {
  const gz = new Uint8Array(readFileSync(FIXTURE));
  const { files, skipped } = filesFromTarEntries(await untarGz(gz));
  return makeSnapshot(meta(), COMMITS, files, { skippedFiles: skipped });
}

describe('端到端 smoke', () => {
  it('从 tar.gz 一路跑到报告，结构合法', async () => {
    const snap = await buildSnapshot();
    const steps: string[] = [];
    const report = analyze(snap, { onProgress: (name) => steps.push(name) });

    assert.equal(steps.length, rules.length);
    assert.ok(report.score >= 0.3 && report.score <= 99.7);
    assert.equal(Math.round(report.score * 10) % 1, 0, '分数应保留一位小数');
    assert.ok(report.verdicts.length > 5, `证据太少：${report.verdicts.length}`);
    assert.equal(report.composition.length, 6);
    assert.ok(Math.abs(report.composition.reduce((n, c) => n + c.percent, 0) - 100) < 0.051);
    assert.equal(report.repo, 'octocat/sample-repo');
    assert.equal(report.caseId, 'HCL-0F1E2D3C4B');
    assert.equal(report.sample.files, 7);
    assert.ok(report.sample.lines > 0);
    assert.equal(report.sample.commits, 3);
    assert.ok(report.conclusion.length > 0);
    assert.ok(report.classification.title.length > 0);

    for (const v of report.verdicts) {
      assert.ok(v.ruleId && v.evidence && v.remark, JSON.stringify(v));
      assert.equal(typeof v.delta, 'number');
      assert.ok(Number.isFinite(v.delta));
      assert.ok(rules.some((r) => v.ruleId.startsWith(r.id.split('.')[0]!)));
    }

    const text = reportToText(report);
    assert.match(text, /AI Participation Score/);
    assert.match(text, /成分分析/);
  });

  it('两次完整运行结果完全一致', async () => {
    const a = analyze(await buildSnapshot());
    const b = analyze(await buildSnapshot());
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(reportToText(a), reportToText(b));
  });

  it('固定样本的固定分数（回归基线）', async () => {
    const snap = await buildSnapshot();
    const report = analyze(snap);
    // 这个数字会随规则调整而变化；改动规则时请一并更新，并确认变化是你想要的。
    assert.equal(report.score, 11);
  });
});
