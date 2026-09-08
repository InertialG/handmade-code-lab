import type { Rule } from '../types.ts';
import { countAll, isTestPath, sourceFiles, totalLines, verdict } from './helpers.ts';

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
        '调试用的 print 没有删干净。模型会假装自己一次就写对了',
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
        '现场遗留了照明设备，说明有人曾在黑暗中摸索过',
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
        '每一个 any 都是一次公开投降，具有强烈的人类气息',
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

export const langRules: Rule[] = [goErrRitual, pythonPrints, jsConsole, tsAny, langMix];
