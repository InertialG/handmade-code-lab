import type { Rule } from '../types.ts';
import { countAll, sourceFiles, verdict } from './helpers.ts';

const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}|except[^\n:]*:\s*\n\s*pass\b|rescue\s*\n\s*end\b/g;

export const emptyCatch: Rule = {
  id: 'errors.empty-catch',
  name: '正在检查错误处理的勇气水平',
  run(snap) {
    const files = sourceFiles(snap);
    if (files.length === 0) return [];
    const n = countAll(files, EMPTY_CATCH);
    if (n === 0) return [];
    return [
      verdict(
        'errors.empty-catch',
        `发现 ${n} 处空的 catch / except: pass`,
        'AI 通常没这么勇。此处异常被静静地埋葬，且没有立碑，判定为人类行为',
        -Math.min(15, 4 + n * 2),
      ),
    ];
  },
};

export const nestedTry: Rule = {
  id: 'errors.nested-try',
  name: '正在测量 try 的嵌套深度',
  run(snap) {
    const files = sourceFiles(snap);
    let deepest = 0;
    let where = '';
    for (const f of files) {
      let depth = 0;
      let max = 0;
      for (const line of f.content.split('\n')) {
        if (/\b(try\s*\{|try\s*:)/.test(line)) {
          depth++;
          max = Math.max(max, depth);
        } else if (/^\s*\}\s*(catch|finally)?/.test(line) && depth > 0) {
          depth--;
        }
      }
      if (max > deepest) {
        deepest = max;
        where = f.path;
      }
    }
    if (deepest < 3) return [];
    return [
      verdict(
        'errors.nested-try',
        `\`${where}\` 中出现 ${deepest} 层嵌套 try/fallback`,
        '要么 AI 写的，要么线上真炸过。本中心倾向于前者，但对后者致以敬意',
        +8,
      ),
    ];
  },
};

export const rustUnwrap: Rule = {
  id: 'errors.rust-unwrap',
  name: '正在统计 unwrap() 的数量',
  run(snap) {
    const rs = sourceFiles(snap).filter((f) => f.ext === 'rs');
    if (rs.length === 0) return [];
    const n = countAll(rs, /\.unwrap\(\)|\.expect\(/g);
    const out = [
      verdict(
        'errors.rust-presence',
        `检测到 ${rs.length} 个 Rust 源文件`,
        '无法判定，双方都过于喜欢类型系统',
        0,
      ),
    ];
    if (n > 0) {
      out.push(
        verdict(
          'errors.rust-unwrap',
          `发现 ${n} 处 \`unwrap()\` / \`expect()\``,
          'AI 嫌疑下降，项目风险上升。本中心建议您在 panic 之前先备份',
          -Math.min(12, 3 + Math.floor(n / 4)),
        ),
      );
    }
    return out;
  },
};

export const errorRules: Rule[] = [emptyCatch, nestedTry, rustUnwrap];
