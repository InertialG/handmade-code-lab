import { countLines, extOf, makeSnapshot } from '../src/snapshot.ts';
import type { CommitInfo, FileEntry, RepoMeta, RepoSnapshot } from '../src/types.ts';

export function file(path: string, content: string): FileEntry {
  return { path, content, lines: countLines(content), ext: extOf(path) };
}

export function meta(over: Partial<RepoMeta> = {}): RepoMeta {
  return {
    owner: 'octocat',
    repo: 'sample-repo',
    branch: 'main',
    sha: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
    defaultBranch: 'main',
    sizeKb: 128,
    createdAt: '2024-01-01T00:00:00Z',
    stars: 3,
    language: 'JavaScript',
    ...over,
  };
}

export function commit(over: Partial<CommitInfo> = {}): CommitInfo {
  return {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    message: 'fix',
    authorName: '人类',
    authorEmail: 'human@example.com',
    date: '2024-02-02T14:00:00Z',
    ...over,
  };
}

export function snapshot(
  files: FileEntry[] = [],
  commits: CommitInfo[] = [],
  metaOver: Partial<RepoMeta> = {},
): RepoSnapshot {
  const map = new Map(files.map((f) => [f.path, f]));
  return makeSnapshot(meta(metaOver), commits, map);
}
