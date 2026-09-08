import type { Rule } from '../types.ts';
import { sourceFiles, verdict } from './helpers.ts';

export const longFiles: Rule = {
  id: 'size.long-file',
  name: '正在寻找超长单文件',
  run(snap) {
    const files = sourceFiles(snap).filter((f) => f.lines > 800);
    if (files.length === 0) return [];
    files.sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1));
    const top = files[0]!;
    return [
      verdict(
        'size.long-file',
        `\`${top.path}\` 共 ${top.lines} 行，另有 ${files.length - 1} 个文件超过 800 行`,
        'Claude 曾试图拆分，但作者拒绝了建议',
        +7,
      ),
    ];
  },
};

const FUNC_START = /^(\s*)(?:export\s+)?(?:async\s+)?(?:function\s+\w+|def\s+\w+|fn\s+\w+|func\s+\w+|\w+\s*\([^)]*\)\s*\{)/;

interface FuncStat {
  path: string;
  length: number;
}

export function functionStats(content: string, path: string): FuncStat[] {
  const lines = content.split('\n');
  const stats: FuncStat[] = [];
  let open: { indent: number; start: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = FUNC_START.exec(line);
    if (m) {
      if (open) stats.push({ path, length: i - open.start });
      open = { indent: m[1]!.length, start: i };
    } else if (open) {
      const trimmed = line.trim();
      if (trimmed && line.search(/\S/) <= open.indent && !/^[})\]]/.test(trimmed)) {
        stats.push({ path, length: i - open.start });
        open = null;
      }
    }
  }
  if (open) stats.push({ path, length: lines.length - open.start });
  return stats.filter((s) => s.length > 0);
}

export const functionLength: Rule = {
  id: 'size.function-length',
  name: '正在估算函数长度分布',
  run(snap) {
    const files = sourceFiles(snap);
    const stats: FuncStat[] = [];
    for (const f of files) stats.push(...functionStats(f.content, f.path));
    if (stats.length < 5) return [];
    const avg = stats.reduce((n, s) => n + s.length, 0) / stats.length;
    const variance =
      stats.reduce((n, s) => n + (s.length - avg) ** 2, 0) / stats.length;
    const sd = Math.sqrt(variance);
    const out = [];
    const longest = stats.slice().sort((a, b) => b.length - a.length || (a.path < b.path ? -1 : 1))[0]!;
    if (longest.length > 200) {
      out.push(
        verdict(
          'size.function-monster',
          `\`${longest.path}\` 中存在约 ${longest.length} 行的单个函数`,
          '任何模型都会在第 90 行提议"要不要抽个函数"。此处没有。判定为人类的固执',
          -9,
        ),
      );
    }
    if (avg < 18 && sd < 10) {
      out.push(
        verdict(
          'size.function-uniform',
          `共识别 ${stats.length} 个函数，平均 ${avg.toFixed(1)} 行，标准差 ${sd.toFixed(1)}`,
          '函数长度整齐得像流水线产品，AI 嫌疑 +8%',
          +8,
        ),
      );
    } else {
      out.push(
        verdict(
          'size.function-uniform',
          `共识别 ${stats.length} 个函数，平均 ${avg.toFixed(1)} 行，标准差 ${sd.toFixed(1)}`,
          '函数长度分布杂乱，符合"边写边想"的人类工作模式',
          -3,
        ),
      );
    }
    return out;
  },
};

/** 6 行窗口归一化哈希，找跨文件重复块。 */
export const duplicateBlocks: Rule = {
  id: 'size.duplicate-blocks',
  name: '正在比对复制粘贴痕迹',
  run(snap) {
    const files = sourceFiles(snap).filter((f) => f.lines >= 12);
    if (files.length < 2) return [];
    const seen = new Map<string, string>();
    let dupes = 0;
    const pairs = new Set<string>();
    for (const f of files) {
      const norm = f.content
        .split('\n')
        .map((l) => l.trim().replace(/\s+/g, ' '))
        .filter((l) => l.length > 3);
      for (let i = 0; i + 6 <= norm.length; i += 3) {
        const key = norm.slice(i, i + 6).join('');
        if (key.length < 60) continue;
        const prev = seen.get(key);
        if (prev === undefined) {
          seen.set(key, f.path);
        } else if (prev !== f.path) {
          dupes++;
          pairs.add(`${prev} ↔ ${f.path}`);
        }
      }
    }
    if (dupes === 0) return [];
    const sample = [...pairs].sort()[0]!;
    return [
      verdict(
        'size.duplicate-blocks',
        `发现 ${dupes} 处跨文件重复代码块，例如 ${sample}`,
        '复制粘贴的相同 bug：这是一种作者签名',
        -Math.min(13, 3 + dupes),
      ),
    ];
  },
};

export const sizeRules: Rule[] = [longFiles, functionLength, duplicateBlocks];
