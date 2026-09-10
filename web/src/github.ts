import { filesFromTarEntries, makeSnapshot, MAX_REPO_KB } from './snapshot.ts';
import { readLimited, untarGz } from './tar.ts';
import type { CommitInfo, RepoMeta, RepoSnapshot } from './types.ts';
import type { RepoRef } from './parseRepo.ts';
import type { Report } from './analyze.ts';

/**
 * Worker 代理地址。构建时通过 VITE_PROXY_BASE 注入；
 * 开发环境留空则走 vite.config.ts 里的 server.proxy。
 */
export const PROXY_BASE: string = (
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PROXY_BASE ??
  (globalThis as unknown as { __HCL_PROXY_BASE__?: string }).__HCL_PROXY_BASE__ ??
  ''
).replace(/\/$/, '');

/** 构建时设 VITE_SERVER_REPORT=1：由节点克隆并出报告（见 server/），浏览器只收结果。 */
export const SERVER_REPORT: boolean = Boolean(
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_REPORT,
);

export interface FetchOptions {
  token?: string;
  signal?: AbortSignal;
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
  const res = await f(url, { headers, signal: AbortSignal.any([...(o.signal ? [o.signal] : []), AbortSignal.timeout(30000)]) });
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

/** 服务端出报告模式。不带 token：节点只克隆公开仓库，用不上。 */
export async function fetchReport(ref: RepoRef, o: FetchOptions = {}): Promise<Report> {
  const f = o.fetchImpl ?? fetch;
  const q = ref.branch ? `?branch=${encodeURIComponent(ref.branch)}` : '';
  const res = await f(`${PROXY_BASE}/report/${ref.owner}/${ref.repo}${q}`, {
    signal: AbortSignal.any([...(o.signal ? [o.signal] : []), AbortSignal.timeout(120000)]),
  });
  if (!res.ok) throw new Error(`鉴定服务返回 ${res.status}：${await res.text()}`);
  return (await res.json()) as Report;
}

/** 按卷宗号取存档；404 表示档案室没有。 */
export async function fetchCase(caseId: string, signal?: AbortSignal): Promise<Report> {
  const res = await fetch(`${PROXY_BASE}/case/${encodeURIComponent(caseId)}`, { signal });
  if (!res.ok) throw new Error(`鉴定服务返回 ${res.status}：${await res.text()}`);
  return (await res.json()) as Report;
}

/** 完整抓取流程；纯 IO，分析部分见 analyze.ts。 */
export async function fetchSnapshot(ref: RepoRef, o: FetchOptions = {}): Promise<RepoSnapshot> {
  const { owner, repo } = ref;
  o.onStep?.('正在调取仓库档案');
  const info = await getJson<ApiRepo>(apiUrl(`/repos/${owner}/${repo}`), o);
  if (info.size > MAX_REPO_KB) {
    throw new Error(`仓库体积 ${(info.size / 1024).toFixed(1)} MB，过大，本中心拒绝收样`);
  }
  const branch = ref.branch ?? info.default_branch;

  o.onStep?.('正在进行提交考古');
  const head = await getJson<ApiCommit>(apiUrl(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`), o);
  if (!/^[a-f0-9]{40}$/i.test(head.sha)) throw new Error('GitHub 未返回有效提交 SHA');
  const commits: CommitInfo[] = [];
  let historyComplete = false;
  for (let page = 1; page <= 2; page++) {
    const batch = await getJson<ApiCommit[]>(
      apiUrl(`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(head.sha)}&per_page=100&page=${page}`),
      o,
    );
    commits.push(...batch.map(toCommit));
    if (batch.length < 100) { historyComplete = true; break; }
  }

  const meta: RepoMeta = {
    owner,
    repo,
    branch,
    sha: head.sha,
    defaultBranch: info.default_branch,
    sizeKb: info.size,
    createdAt: info.created_at,
    stars: info.stargazers_count,
    language: info.language,
  };

  // ponytail: 只补最近 5 条的 additions/deletions。20 条要 20 个请求，匿名配额一小时只够跑两次
  o.onStep?.('正在称量每次提交的重量');
  const recent = commits.slice(0, 5);
  for (let start = 0; start < recent.length; start += 4) {
    await Promise.all(
      recent.slice(start, start + 4).map(async (c) => {
        try {
          const detail = await getJson<ApiCommit>(
            apiUrl(`/repos/${owner}/${repo}/commits/${c.sha}`),
            o,
          );
          c.additions = detail.stats?.additions ?? 0;
          c.deletions = detail.stats?.deletions ?? 0;
          c.changedFiles = Array.isArray(detail.files) ? detail.files.length : undefined;
        } catch (error) {
          if (o.signal?.aborted) throw error;
          throw new Error('提交统计不完整，请稍后重试');
        }
      }),
    );
  }
  // 首次提交单独补一次，用于"一夜出现"判定
  const first = historyComplete ? commits[commits.length - 1] : undefined;
  if (first && first.changedFiles === undefined) {
    try {
      const detail = await getJson<ApiCommit>(apiUrl(`/repos/${owner}/${repo}/commits/${first.sha}`), o);
      first.additions = detail.stats?.additions ?? 0;
      first.deletions = detail.stats?.deletions ?? 0;
      first.changedFiles = Array.isArray(detail.files) ? detail.files.length : undefined;
    } catch { throw new Error('首次提交统计读取失败，请稍后重试'); }
  }

  o.onStep?.('正在下载并解压样本');
  const f = o.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  const res = await f(tarballUrl(owner, repo, head.sha), { headers, signal: AbortSignal.any([...(o.signal ? [o.signal] : []), AbortSignal.timeout(30000)]) });
  if (!res.ok) throw new Error(`下载 tarball 失败：${res.status} ${res.statusText}`);
  const gz = await readLimited(res.body, 50 * 1024 * 1024);
  const entries = await untarGz(gz);
  const { files, skipped } = filesFromTarEntries(entries);

  return makeSnapshot(meta, commits, files, { skippedFiles: skipped, historyComplete });
}
