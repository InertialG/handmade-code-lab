import { filesFromTarEntries, makeSnapshot, MAX_REPO_KB } from './snapshot.ts';
import { untarGz } from './tar.ts';
import type { CommitInfo, RepoMeta, RepoSnapshot } from './types.ts';
import type { RepoRef } from './parseRepo.ts';

/**
 * Worker 代理地址。构建时通过 VITE_PROXY_BASE 注入；
 * 开发环境留空则走 vite.config.ts 里的 server.proxy。
 */
export const PROXY_BASE: string = (
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PROXY_BASE ??
  (globalThis as unknown as { __HCL_PROXY_BASE__?: string }).__HCL_PROXY_BASE__ ??
  ''
).replace(/\/$/, '');

export interface FetchOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  onStep?: (msg: string) => void;
}

function apiUrl(path: string): string {
  return `${PROXY_BASE}/api${path}`;
}

function tarballUrl(owner: string, repo: string, ref: string): string {
  return `${PROXY_BASE}/tarball/${owner}/${repo}/${encodeURIComponent(ref)}`;
}

async function getJson<T>(url: string, o: FetchOptions): Promise<T> {
  const f = o.fetchImpl ?? fetch;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  const res = await f(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub 请求失败：${res.status} ${res.statusText}（${url}）`);
  }
  return (await res.json()) as T;
}

interface ApiRepo {
  default_branch: string;
  size: number;
  created_at: string;
  stargazers_count: number;
  language: string | null;
}

interface ApiCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
  };
  stats?: { additions: number; deletions: number };
  files?: unknown[];
}

function toCommit(c: ApiCommit): CommitInfo {
  return {
    sha: c.sha,
    message: c.commit.message ?? '',
    authorName: c.commit.author?.name ?? '',
    authorEmail: c.commit.author?.email ?? '',
    date: c.commit.author?.date ?? '1970-01-01T00:00:00Z',
  };
}

/** 完整抓取流程；纯 IO，分析部分见 analyze.ts。 */
export async function fetchSnapshot(ref: RepoRef, o: FetchOptions = {}): Promise<RepoSnapshot> {
  const { owner, repo } = ref;
  o.onStep?.('正在调取仓库档案');
  const info = await getJson<ApiRepo>(apiUrl(`/repos/${owner}/${repo}`), o);
  const branch = ref.branch ?? info.default_branch;

  o.onStep?.('正在进行提交考古');
  const commits: CommitInfo[] = [];
  for (let page = 1; page <= 2; page++) {
    const batch = await getJson<ApiCommit[]>(
      apiUrl(`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100&page=${page}`),
      o,
    ).catch(() => [] as ApiCommit[]);
    commits.push(...batch.map(toCommit));
    if (batch.length < 100) break;
  }

  const meta: RepoMeta = {
    owner,
    repo,
    branch,
    sha: commits[0]?.sha ?? branch,
    defaultBranch: info.default_branch,
    sizeKb: info.size,
    createdAt: info.created_at,
    stars: info.stargazers_count,
    language: info.language,
  };

  if (info.size > MAX_REPO_KB) {
    return makeSnapshot(meta, commits, new Map(), { tooLarge: true });
  }

  // 最近 20 条补齐 additions/deletions；失败即跳过
  o.onStep?.('正在称量每次提交的重量');
  const recent = commits.slice(0, 20);
  await Promise.all(
    recent.map(async (c) => {
      try {
        const detail = await getJson<ApiCommit>(
          apiUrl(`/repos/${owner}/${repo}/commits/${c.sha}`),
          o,
        );
        c.additions = detail.stats?.additions ?? 0;
        c.deletions = detail.stats?.deletions ?? 0;
        c.changedFiles = Array.isArray(detail.files) ? detail.files.length : undefined;
      } catch {
        /* 跳过 */
      }
    }),
  );
  // 首次提交单独补一次，用于"一夜出现"判定
  const first = commits[commits.length - 1];
  if (first && first.changedFiles === undefined) {
    try {
      const detail = await getJson<ApiCommit>(apiUrl(`/repos/${owner}/${repo}/commits/${first.sha}`), o);
      first.additions = detail.stats?.additions ?? 0;
      first.deletions = detail.stats?.deletions ?? 0;
      first.changedFiles = Array.isArray(detail.files) ? detail.files.length : undefined;
    } catch {
      /* 跳过 */
    }
  }

  o.onStep?.('正在下载并解压样本');
  const f = o.fetchImpl ?? fetch;
  const res = await f(tarballUrl(owner, repo, branch));
  if (!res.ok) throw new Error(`下载 tarball 失败：${res.status} ${res.statusText}`);
  const gz = new Uint8Array(await res.arrayBuffer());
  const entries = await untarGz(gz);
  const { files, skipped } = filesFromTarEntries(entries);

  return makeSnapshot(meta, commits, files, { skippedFiles: skipped });
}
