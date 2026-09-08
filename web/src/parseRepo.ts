export interface RepoRef {
  owner: string;
  repo: string;
  /** 用户在 URL 里显式指定的分支（/tree/xxx），否则为 null */
  branch: string | null;
}

const NAME = /^[A-Za-z0-9._-]+$/;

/**
 * 支持：
 *   owner/repo
 *   owner/repo/tree/branch
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo/tree/feature/foo
 */
export function parseRepoInput(raw: string): RepoRef | null {
  let s = (raw ?? '').trim();
  if (!s) return null;

  s = s.replace(/^git\+/, '');
  s = s.replace(/^git@github\.com:/i, 'https://github.com/');
  s = s.replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/');

  if (/^https?:\/\//i.test(s) || /^(www\.)?github\.com\//i.test(s)) {
    s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    if (!/^github\.com\//i.test(s)) return null;
    s = s.slice('github.com/'.length);
  }

  s = s.replace(/[?#].*$/, '');
  s = s.replace(/\.git$/i, '');
  s = s.replace(/^\/+|\/+$/g, '');

  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts as [string, string];
  if (!NAME.test(owner) || !NAME.test(repo)) return null;

  let branch: string | null = null;
  if (parts.length > 2 && (parts[2] === 'tree' || parts[2] === 'blob')) {
    const rest = parts.slice(3).join('/');
    branch = rest || null;
  }

  return { owner, repo, branch };
}

/** 归一化成 `owner/repo` 展示串。 */
export function formatRepoRef(ref: RepoRef): string {
  return ref.branch ? `${ref.owner}/${ref.repo}/tree/${ref.branch}` : `${ref.owner}/${ref.repo}`;
}
