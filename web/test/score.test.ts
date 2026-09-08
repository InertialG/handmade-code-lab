import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, seeded, seededInt, seededPick } from '../src/seeded.ts';
import {
  asciiBar,
  classify,
  composition,
  computeScore,
  conclusion,
  extras,
  MAX_SCORE,
  MIN_SCORE,
} from '../src/score.ts';
import type { Verdict } from '../src/types.ts';

const v = (delta: number, weight?: number): Verdict => ({
  ruleId: 'x',
  evidence: 'e',
  remark: 'r',
  delta,
  weight,
});

describe('种子哈希', () => {
  it('确定性：同输入同输出', () => {
    assert.equal(seeded('abc', 's'), seeded('abc', 's'));
    assert.equal(hash32('中文也要参与混合'), hash32('中文也要参与混合'));
  });

  it('不同 salt 得到不同结果', () => {
    assert.notEqual(seeded('abc', 's1'), seeded('abc', 's2'));
  });

  it('取值范围正确', () => {
    for (let i = 0; i < 200; i++) {
      const x = seeded('sha', `salt${i}`);
      assert.ok(x >= 0 && x < 1, `越界：${x}`);
      const n = seededInt('sha', `salt${i}`, 3, 9);
      assert.ok(n >= 3 && n <= 9 && Number.isInteger(n));
    }
  });

  it('seededPick 稳定挑选', () => {
    const arr = ['a', 'b', 'c', 'd'];
    assert.equal(seededPick('sha', 'k', arr), seededPick('sha', 'k', arr));
    assert.ok(arr.includes(seededPick('sha', 'k', arr)));
  });
});

describe('计分', () => {
  it('无判词时为基准分 50', () => {
    assert.equal(computeScore([]), 50);
  });

  it('按 delta 累加并应用权重', () => {
    assert.equal(computeScore([v(10), v(-4)]), 56);
    assert.equal(computeScore([v(10, 2)]), 70);
  });

  it('上下限被夹住', () => {
    assert.equal(computeScore([v(1000)]), MAX_SCORE);
    assert.equal(computeScore([v(-1000)]), MIN_SCORE);
  });

  it('分档至少 6 档且单调覆盖', () => {
    const titles = new Set<string>();
    for (let s = 0; s <= 100; s += 1) titles.add(classify(s).title);
    assert.ok(titles.size >= 6, `档位太少：${titles.size}`);
  });

  it('ASCII 进度条长度固定', () => {
    assert.equal([...asciiBar(37.5, 40)].length, 42);
    assert.equal([...asciiBar(0, 40)].length, 42);
    assert.equal([...asciiBar(100, 40)].length, 42);
  });
});

describe('成分分析与结论', () => {
  const verdicts = [v(12), v(-7), v(0)];

  it('成分总和为 100.0%', () => {
    for (const score of [3.4, 50, 88.8]) {
      const rows = composition('deadbeef', score, verdicts);
      const sum = rows.reduce((n, r) => n + r.percent, 0);
      assert.ok(Math.abs(sum - 100) < 0.051, `总和 ${sum}`);
      assert.equal(rows.length, 6);
    }
  });

  it('同一 sha 得到完全相同的成分表与结论', () => {
    assert.deepEqual(
      composition('deadbeef', 61.2, verdicts),
      composition('deadbeef', 61.2, verdicts),
    );
    assert.equal(conclusion('deadbeef', 61.2, verdicts, 42), conclusion('deadbeef', 61.2, verdicts, 42));
    assert.deepEqual(extras('deadbeef', 61.2), extras('deadbeef', 61.2));
  });

  it('结论会替换占位符', () => {
    const text = conclusion('deadbeef', 61.2, verdicts, 42);
    assert.ok(!text.includes('{'), text);
  });
});
