import type { FileEntry, RepoSnapshot, Verdict } from '../types.ts';

export const SOURCE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'cc', 'cs', 'rb', 'php', 'swift', 'scala', 'sh', 'lua', 'dart', 'vue', 'svelte', 'sql', 'zig',
]);

export function allFiles(snap: RepoSnapshot): FileEntry[] {
  return [...snap.files.values()];
}

export function sourceFiles(snap: RepoSnapshot): FileEntry[] {
  return allFiles(snap).filter((f) => SOURCE_EXT.has(f.ext));
}

export function isTestPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    /(^|\/)(tests?|__tests__|spec|specs)\//.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p) ||
    /(^|\/)test_[^/]+\.py$/.test(p) ||
    /_test\.(go|py|rb)$/.test(p)
  );
}

export function totalLines(files: FileEntry[]): number {
  return files.reduce((n, f) => n + f.lines, 0);
}

export function countMatches(text: string, re: RegExp): number {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let n = 0;
  while (r.exec(text) !== null) {
    n++;
    if (r.lastIndex === 0) break;
  }
  return n;
}

export function countAll(files: FileEntry[], re: RegExp): number {
  return files.reduce((n, f) => n + countMatches(f.content, re), 0);
}

/** 找到第一个匹配某谓词的文件路径，按路径序，保证确定性。 */
export function findFile(snap: RepoSnapshot, pred: (path: string) => boolean): FileEntry | null {
  const hit = allFiles(snap)
    .filter((f) => pred(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return hit[0] ?? null;
}

export function hasFile(snap: RepoSnapshot, pred: (path: string) => boolean): boolean {
  return findFile(snap, pred) !== null;
}

/** 百分比，保留一位小数。 */
export function pct(part: number, whole: number): string {
  if (whole <= 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function verdict(
  ruleId: string,
  evidence: string,
  remark: string,
  delta: number,
  extra: Partial<Verdict> = {},
): Verdict {
  return { ruleId, evidence, remark, delta, ...extra };
}

/** 把所有注释行拼成一段文本，供只关心注释的规则使用。 */
export function commentText(files: FileEntry[]): string {
  const out: string[] = [];
  for (const f of files) {
    for (const l of f.content.split('\n')) if (isCommentLine(l)) out.push(l);
  }
  return out.join('\n');
}

/** 常见注释行的粗略判定（覆盖 // # /* * -- 五种开头）。 */
export function isCommentLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return (
    t.startsWith('//') ||
    t.startsWith('#') ||
    t.startsWith('/*') ||
    t.startsWith('*') ||
    t.startsWith('--')
  );
}
