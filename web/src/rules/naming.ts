import type { Rule } from '../types.ts';
import { countAll, sourceFiles, totalLines, verdict } from './helpers.ts';

const GENERIC = [
  'data', 'result', 'temp', 'tmp', 'foo', 'bar', 'obj', 'item', 'value', 'res', 'payload',
  'handler', 'helper', 'manager', 'processor',
];

export const genericNames: Rule = {
  id: 'naming.generic',
  name: '正在分析变量命名',
  run(snap) {
    const files = sourceFiles(snap);
    if (files.length === 0) return [];
    const counts = GENERIC.map((w) => ({
      w,
      n: countAll(files, new RegExp(`\\b${w}\\b`, 'gi')),
    })).filter((c) => c.n > 0);
    if (counts.length === 0) {
      return [
        verdict(
          'naming.generic',
          '未发现任何泛用变量名',
          '全仓库找不到一个 `data`，这种克制不属于人类，也不属于模型，本中心暂列为"可疑的自律"',
          +4,
        ),
      ];
    }
    counts.sort((a, b) => b.n - a.n || (a.w < b.w ? -1 : 1));
    const top = counts.slice(0, 4);
    const total = counts.reduce((n, c) => n + c.n, 0);
    const lines = Math.max(totalLines(files), 1);
    const density = (total / lines) * 1000;
    const evidence = `发现 ${top.map((c) => `${c.n} 处 \`${c.w}\``).join('、')}，泛名密度 ${density.toFixed(1)}/千行`;
    if (density > 12) {
      return [
        verdict(
          'naming.generic',
          evidence,
          '命名策略高度统一，疑似由一个从不为命名痛苦的实体完成',
          +11,
        ),
      ];
    }
    if (density > 5) {
      return [verdict('naming.generic', evidence, '存在批量生产的命名气味，AI 嫌疑 +6%', +6)];
    }
    return [
      verdict(
        'naming.generic',
        evidence,
        '泛名使用节制，说明作者在命名上受过苦，人类特征明显',
        -4,
      ),
    ];
  },
};

const HUMAN_SUFFIX = /\b\w+(?:2|3|_final|_new|_old|_v2|_v3|_backup|_bak|_copy|_real|_ok|Final|New|Old|Copy)\b/g;

export const humanSuffixNames: Rule = {
  id: 'naming.human-suffix',
  name: '正在检索"data2"级手工痕迹',
  run(snap) {
    const files = sourceFiles(snap);
    if (files.length === 0) return [];
    const n = countAll(files, HUMAN_SUFFIX);
    if (n === 0) return [];
    const strength = Math.min(14, 3 + Math.floor(n / 3));
    return [
      verdict(
        'naming.human-suffix',
        `发现 ${n} 处 \`xxx2\` / \`_final\` / \`_new\` 类命名`,
        n > 10
          ? '纯天然手工痕迹：只有真正的人类才会在 `_final_v2_new` 之后继续写下去'
          : '纯天然手工痕迹，检测仪出现轻微欣慰反应',
        -strength,
      ),
    ];
  },
};

export const namingRules: Rule[] = [genericNames, humanSuffixNames];
