import type { CommitInfo, FileEntry, RepoMeta, RepoSnapshot } from './types.ts';
import { stripRootDir, type TarEntry } from './tar.ts';

export const MAX_FILE_BYTES = 200 * 1024;
export const MAX_FILES = 2000;
/** 单位 KB，GitHub 的 repo.size 就是 KB */
export const MAX_REPO_KB = 50_000;

const SKIP_DIR = [
  'node_modules/',
  'vendor/',
  'dist/',
  'build/',
  '.git/',
  'target/',
  '__pycache__/',
  '.next/',
  '.venv/',
  'venv/',
  'third_party/',
];

const SKIP_FILE = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
];

export function shouldSkipPath(path: string): boolean {
  if (!path || path.endsWith('/')) return true;
  const lower = path.toLowerCase();
  for (const d of SKIP_DIR) {
    if (lower === d.slice(0, -1) || lower.startsWith(d) || lower.includes(`/${d}`)) return true;
  }
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (SKIP_FILE.includes(base)) return true;
  if (/\.min\.(js|css)$/i.test(base)) return true;
  return false;
}

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'pdf', 'zip', 'gz', 'tgz', 'bz2',
  'xz', '7z', 'rar', 'jar', 'class', 'so', 'dylib', 'dll', 'exe', 'bin', 'o', 'a', 'wasm',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'webm', 'wav', 'psd', 'sketch',
]);

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i + 1).toLowerCase();
}

/** 含 NUL 字节即视为二进制。 */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

export function countLines(content: string): number {
  if (content.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) n++;
  if (content.endsWith('\n')) n--;
  return Math.max(n, 1);
}

export interface FilesResult {
  files: Map<string, FileEntry>;
  skipped: number;
}

/** 把 tar 条目过滤成快照文件表。条目按路径排序，保证结果确定。 */
export function filesFromTarEntries(entries: TarEntry[], stripRoot = true): FilesResult {
  const files = new Map<string, FileEntry>();
  let skipped = 0;

  const normalized = entries
    .filter((e) => e.type === '0' || e.type === '\0' || e.type === '')
    .map((e) => ({ path: stripRoot ? stripRootDir(e.name) : e.name, data: e.data }))
    .filter((e) => e.path !== '')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const e of normalized) {
    if (shouldSkipPath(e.path)) {
      skipped++;
      continue;
    }
    if (e.data.length > MAX_FILE_BYTES) {
      skipped++;
      continue;
    }
    const ext = extOf(e.path);
    if (BINARY_EXT.has(ext) || looksBinary(e.data)) {
      skipped++;
      continue;
    }
    if (files.size >= MAX_FILES) {
      skipped++;
      continue;
    }
    const content = decoder.decode(e.data);
    files.set(e.path, { path: e.path, content, lines: countLines(content), ext });
  }

  return { files, skipped };
}

export function makeSnapshot(
  meta: RepoMeta,
  commits: CommitInfo[],
  files: Map<string, FileEntry>,
  opts: { skippedFiles?: number; historyComplete?: boolean } = {},
): RepoSnapshot {
  return {
    historyComplete: opts.historyComplete,
    meta,
    commits,
    files,
    skippedFiles: opts.skippedFiles ?? 0,
  };
}
