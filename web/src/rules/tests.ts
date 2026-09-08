import type { Rule } from '../types.ts';
import { allFiles, isTestPath, sourceFiles, totalLines, verdict } from './helpers.ts';

export const testPresence: Rule = {
  id: 'tests.presence',
  name: '正在寻找测试文件',
  run(snap) {
    const src = sourceFiles(snap);
    if (src.length === 0) return [];
    const tests = src.filter((f) => isTestPath(f.path));
    if (tests.length === 0) {
      return [
        verdict(
          'tests.presence',
          `${src.length} 个源文件，0 个测试文件`,
          '强烈的人类自信：作者已在脑内跑通全部用例',
          -12,
        ),
      ];
    }
    const testLines = totalLines(tests);
    const codeLines = Math.max(totalLines(src) - testLines, 1);
    const ratio = testLines / codeLines;
    const evidence = `测试 ${tests.length} 个文件 / ${testLines} 行，比源码 ${ratio.toFixed(2)}:1`;
    if (ratio > 1) {
      return [
        verdict('tests.presence', evidence, '疑似测试是后补的，且补得过于热情', +10),
      ];
    }
    if (ratio > 0.3) {
      return [verdict('tests.presence', evidence, '测试覆盖认真，AI 嫌疑 +4%', +4)];
    }
    return [verdict('tests.presence', evidence, '有测试，但点到为止，符合人类作息', -2)];
  },
};

export const testNaming: Rule = {
  id: 'tests.naming',
  name: '正在检查测试文件命名的整齐度',
  run(snap) {
    const tests = allFiles(snap).filter((f) => isTestPath(f.path));
    if (tests.length < 3) return [];
    const suffixes = new Set(
      tests.map((f) => {
        const m = /(\.(test|spec)\.[a-z]+)$/.exec(f.path) ?? /(_test\.[a-z]+)$/.exec(f.path);
        return m ? m[1]! : 'other';
      }),
    );
    if (suffixes.size === 1 && !suffixes.has('other')) {
      return [
        verdict(
          'tests.naming',
          `${tests.length} 个测试文件全部使用 \`${[...suffixes][0]}\` 后缀`,
          '命名整齐划一，没有一个漏网的 `test2.ts`。可疑的秩序感',
          +6,
        ),
      ];
    }
    return [
      verdict(
        'tests.naming',
        `测试文件出现 ${suffixes.size} 种命名风格`,
        '命名风格随时间漂移，这是有机生长的证据',
        -4,
      ),
    ];
  },
};

export const testRules: Rule[] = [testPresence, testNaming];
