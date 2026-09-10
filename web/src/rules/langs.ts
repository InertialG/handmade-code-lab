import type { Rule } from '../types.ts';
import { countAll, countMatches, isTestPath, sourceFiles, totalLines, verdict } from './helpers.ts';

export const goErrRitual: Rule = {
  id: 'langs.go-err',
  name: '正在观察 Go 的错误处理仪式',
  run(snap) {
    const go = sourceFiles(snap).filter((f) => f.ext === 'go');
    if (go.length === 0) return [];
    const n = countAll(go, /if\s+err\s*!=\s*nil\s*\{/g);
    return [
      verdict(
        'langs.go-err',
        `${go.length} 个 Go 文件中出现 ${n} 次 \`if err != nil\``,
        '无法判定，这是语言强制的仪式。人与模型在此处完全无法区分',
        0,
      ),
    ];
  },
};

export const pythonPrints: Rule = {
  id: 'langs.python-print',
  name: '正在寻找 print 调试残留',
  run(snap) {
    const py = sourceFiles(snap).filter((f) => f.ext === 'py' && !isTestPath(f.path));
    if (py.length === 0) return [];
    const n = countAll(py, /^\s*print\(/gm);
    if (n === 0) return [];
    return [
      verdict(
        'langs.python-print',
        `非测试代码中残留 ${n} 处 \`print(\``,
        '调试用的 print 没有删干净。模型会假装自己一次就写对,人类则带着调试的疤',
        -Math.min(12, 3 + Math.floor(n / 3)),
      ),
    ];
  },
};

export const jsConsole: Rule = {
  id: 'langs.js-console',
  name: '正在寻找 console.log 残留',
  run(snap) {
    const js = sourceFiles(snap).filter(
      (f) => ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte'].includes(f.ext) && !isTestPath(f.path),
    );
    if (js.length === 0) return [];
    const n = countAll(js, /console\.(log|debug|dir)\(/g);
    if (n === 0) return [];
    return [
      verdict(
        'langs.js-console',
        `发现 ${n} 处 \`console.log\` 类调用`,
        '现场遗留了照明设备:有人在黑暗中摸索过,而且是摸完就走',
        -Math.min(12, 3 + Math.floor(n / 4)),
      ),
    ];
  },
};

export const tsAny: Rule = {
  id: 'langs.ts-any',
  name: '正在统计 any 的投降次数',
  run(snap) {
    const ts = sourceFiles(snap).filter((f) => f.ext === 'ts' || f.ext === 'tsx');
    if (ts.length === 0) return [];
    const n = countAll(ts, /:\s*any\b|<any>|as\s+any\b/g);
    const lines = Math.max(totalLines(ts), 1);
    const per1k = (n / lines) * 1000;
    if (n === 0) {
      return [
        verdict(
          'langs.ts-any',
          `${ts.length} 个 TypeScript 文件中 \`any\` 出现 0 次`,
          '一次都没有妥协过。人类会在某个周五下午写下 `as any`，此人没有周五',
          +8,
        ),
      ];
    }
    return [
      verdict(
        'langs.ts-any',
        `\`any\` 出现 ${n} 次（${per1k.toFixed(1)}/千行）`,
        '每一个 any 都是一次公开投降,后面通常跟着一句 TODO。模型会把 any 藏得很好',
        -Math.min(12, 2 + Math.floor(per1k)),
      ),
    ];
  },
};

export const langMix: Rule = {
  id: 'langs.mix',
  name: '正在分析语言构成',
  run(snap) {
    const files = sourceFiles(snap);
    if (files.length === 0) return [];
    const byExt = new Map<string, number>();
    for (const f of files) byExt.set(f.ext, (byExt.get(f.ext) ?? 0) + f.lines);
    const sorted = [...byExt.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const top = sorted.slice(0, 3).map(([e, n]) => `.${e} ${n} 行`);
    if (sorted.length >= 6) {
      return [
        verdict(
          'langs.mix',
          `检出 ${sorted.length} 种源文件类型：${top.join('、')}……`,
          '语言种类繁多，作者显然在多个技术栈之间反复横跳，此为人类冲动的证据',
          -5,
        ),
      ];
    }
    return [
      verdict('langs.mix', `主要语言构成：${top.join('、')}`, '技术栈集中，无异常', 0),
    ];
  },
};

const MAGIC_SCOPE = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'go', 'rs'];

// ponytail: 不带 g 标志。模块级 g 正则跨文件复用 exec 会残留 lastIndex，漏掉后续文件
const MAGIC_ANNOTATED = /\b(?:const|let|var|private|public|protected)\s+[A-Za-z_$][\w$]*\s*=\s*(?:0x[0-9a-fA-F]+|\d{3,})\b/;

export const magicNumbers: Rule = {
  id: 'langs.magic-numbers',
  name: '正在追捕裸奔的魔法数字',
  run(snap) {
    const files = sourceFiles(snap).filter((f) => MAGIC_SCOPE.includes(f.ext));
    if (files.length === 0) return [];
    let n = 0;
    let sample = '';
    for (const f of files) {
      const m = MAGIC_ANNOTATED.exec(f.content);
      if (m) {
        n += countMatches(f.content, MAGIC_ANNOTATED);
        if (!sample) sample = `${f.path}: ${m[0]!.trim()}`;
      }
    }
    if (n === 0) return [];
    return [
      verdict(
        'langs.magic-numbers',
        `发现 ${n} 处魔法数字,例如 \`${sample}\``,
        '每个 86400 背后都有一段不想解释的过去。模型会贴心地命名 TIME_OF_DAY_IN_SECONDS,人类直接写 86400',
        -Math.min(12, 3 + Math.floor(n / 2)),
      ),
    ];
  },
};

export const langRules: Rule[] = [goErrRitual, pythonPrints, jsConsole, tsAny, magicNumbers, langMix];
