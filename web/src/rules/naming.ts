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
          '全仓库找不到一个 `data`,也找不到一个 `temp`。这种自律要么属于强迫症人类,要么属于刚被批评过的模型',
          +3,
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
          '每个函数都有 `data`,每个回调都是 `res`。命名从不为难任何人,包括命名者自己。人类的命名会至少假装挣扎一下',
          +11,
        ),
      ];
    }
    if (density > 5) {
      return [verdict('naming.generic', evidence, '泛名密度偏高。模型图省事,人类偶尔也图省事,区别在于人类会为此愧疚', +6)];
    }
    return [
      verdict(
        'naming.generic',
        evidence,
        '泛名用得克制。要么作者在命名上受过苦,要么作者根本没写几个变量',
        -4,
      ),
    ];
  },
};

// ponytail: 前缀必须是纯字母，否则 `512`、`403`、`win32`、`es2022` 都会被算成手工痕迹
const HUMAN_SUFFIX = /\b[A-Za-z_][A-Za-z_]{2,}(?:[23]|_final|_new|_old|_v[23]|_backup|_bak|_copy|_real|_ok|Final|New|Old|Copy)\b/g;

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
          ? '`_final_v2_new_backup` 一应俱全。模型一次就写对,只有人类需要留这么多条后路'
          : '`_new`、`_final`、`_v2`:命名里带着"上次改坏了"的血泪史,模型没有上次',
        -strength,
      ),
    ];
  },
};

// ponytail: 匹配 data1 / result2 / list3 这类"复制后改个数字"的命名,不带下划线,与 _v2 区分
const NUMBERED = /\b[A-Za-z_][A-Za-z_]{2,}[0-9]{1,2}\b/g;

export const numberedNames: Rule = {
  id: 'naming.numbered',
  name: '正在寻找复制后改数字的命名',
  run(snap) {
    const files = sourceFiles(snap);
    if (files.length === 0) return [];
    const risky = /\b(?:es|utf|md|aes|sha|tls|http|ipv|win|mac|arm|x|node)[0-9]{1,2}\b/gi;
    // 只数不在字符串/注释里的命中,避免把判词举例当成真变量
    let pure = 0;
    for (const f of files) {
      for (const line of f.content.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('//') || t.startsWith('*')) continue;
        if (/['"`]/.test(line)) continue; // 含引号的行大概率是字符串/判词
        const m = line.match(NUMBERED) ?? [];
        const r = line.match(risky) ?? [];
        pure += Math.max(0, m.length - r.length);
      }
    }
    if (pure <= 0) return [];
    return [
      verdict(
        'naming.numbered',
        `发现 ${pure} 处 \`xxx1\` / \`xxx2\` 式命名(如 \`data2\`、\`list3\`)`,
        '给复制出来的第二份代码加个数字,是人类最古老也最有效的命名法。模型会起名叫 copyOfData 或 secondData',
        -Math.min(13, 3 + Math.floor(pure / 2)),
      ),
    ];
  },
};

export const namingRules: Rule[] = [genericNames, humanSuffixNames, numberedNames];
