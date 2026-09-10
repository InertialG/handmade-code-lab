/**
 * 节点端：git 浅克隆 → RepoSnapshot。
 * 只跑 git 子进程；GitHub API 仅用来拿 size / created_at，拿不到也照常出报告。
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { filesFromTarEntries, makeSnapshot, MAX_REPO_KB } from '../web/src/snapshot.ts';
import { untar } from '../web/src/tar.ts';
import type { CommitInfo, RepoMeta, RepoSnapshot } from '../web/src/types.ts';

const execFile = promisify(execFileCb);
export const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** 分支名：拒绝 git 会当成选项或引用语法的字符 */
export const BRANCH = /^(?!-)(?!.*\.\.)(?!.*@\{)[^\s~^:?*[\\]+(?<!\/)$/;
const RS = '\x1e';
const US = '\x1f';
const HISTORY = 200;
const CLONE_TIMEOUT = 60_000;
const MAX_ARCHIVE = 64 * 1024 * 1024;

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function git(dir: string, args: string[], extra: { timeout?: number } = {}) {
  return execFile('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    timeout: extra.timeout ?? 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

export function parseLog(out: string): CommitInfo[] {
  return out.split(RS).map((r) => r.trim()).filter(Boolean).map((rec) => {
    const [sha = '', authorName = '', authorEmail = '', date = '', ...body] = rec.split(US);
    return { sha, authorName, authorEmail, date, message: body.join(US).trim() };
  });
}

export function parseNumstat(out: string): Map<string, { additions: number; deletions: number; changedFiles: number }> {
  const stats = new Map<string, { additions: number; deletions: number; changedFiles: number }>();
  for (const block of out.split(RS)) {
    const lines = block.trim().split('\n').filter(Boolean);
    const sha = lines.shift();
    if (!sha) continue;
    let additions = 0;
    let deletions = 0;
    for (const l of lines) {
      const [a, d] = l.split('\t');
      additions += Number(a) || 0; // 二进制文件是 "-"
      deletions += Number(d) || 0;
    }
    stats.set(sha, { additions, deletions, changedFiles: lines.length });
  }
  return stats;
}

/** 从本地裸仓库读出快照，离线可测。 */
export async function snapshotFromDir(dir: string, meta: Omit<RepoMeta, 'branch' | 'sha'>): Promise<RepoSnapshot> {
  const [branch, sha, shallow, logOut] = await Promise.all([
    git(dir, ['symbolic-ref', '--short', 'HEAD']).then((r) => r.stdout.trim()),
    git(dir, ['rev-parse', 'HEAD']).then((r) => r.stdout.trim()),
    git(dir, ['rev-parse', '--is-shallow-repository']).then((r) => r.stdout.trim() === 'true'),
    git(dir, ['log', `-${HISTORY}`, `--format=%H${US}%an${US}%ae${US}%aI${US}%B${RS}`]).then((r) => r.stdout),
  ]);
  const commits = parseLog(logOut);
  const historyComplete = !shallow;

  const stats = parseNumstat((await git(dir, ['log', '-5', '--numstat', `--format=${RS}%H`])).stdout);
  const root = commits[commits.length - 1];
  if (historyComplete && root && !stats.has(root.sha)) {
    for (const [k, v] of parseNumstat((await git(dir, ['log', '-1', '--numstat', `--format=${RS}%H`, root.sha])).stdout)) stats.set(k, v);
  }
  for (const c of commits) {
    const s = stats.get(c.sha);
    if (s) Object.assign(c, s);
  }

  let tar: Buffer;
  try {
    tar = (await execFile('git', ['-C', dir, 'archive', '--format=tar', 'HEAD'], { encoding: 'buffer', maxBuffer: MAX_ARCHIVE, timeout: 30_000 })).stdout;
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new HttpError(413, '仓库体积过大，本中心拒绝收样');
    throw e;
  }
  // git archive 没有 owner-repo-sha/ 顶层目录，不剥根
  const { files, skipped } = filesFromTarEntries(untar(new Uint8Array(tar)), false);
  return makeSnapshot({ ...meta, branch, sha }, commits, files, { skippedFiles: skipped, historyComplete });
}

interface ApiRepo { default_branch: string; size: number; created_at: string; stargazers_count: number; language: string | null }

/** 尽力而为：serv00 出口 IP 是共享的，匿名配额随时会被别人用完。 */
async function repoInfo(owner: string, repo: string): Promise<ApiRepo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'handmade-code-lab/1.0', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) throw new HttpError(404, '公海查无此仓库，或该仓库为私有');
    if (!res.ok) return null;
    return (await res.json()) as ApiRepo;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return null;
  }
}

/** 不占 API 配额地拿远端 HEAD 的 sha，用于查存档。查不到即仓库/分支不存在或私有。 */
export async function remoteSha(owner: string, repo: string, branch: string | null): Promise<string> {
  if (!NAME.test(owner) || !NAME.test(repo)) throw new HttpError(400, '仓库名不合法');
  if (branch !== null && !BRANCH.test(branch)) throw new HttpError(400, '分支名不合法');
  let out = '';
  try {
    out = (await execFile('git', ['ls-remote', `https://github.com/${owner}/${repo}.git`, branch ? `refs/heads/${branch}` : 'HEAD'],
      { encoding: 'utf8', timeout: 15_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout;
  } catch { throw new HttpError(404, '公海查无此仓库，或该仓库为私有'); }
  const sha = out.split(/\s/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new HttpError(404, '公海查无此分支');
  return sha;
}

export async function cloneSnapshot(owner: string, repo: string, branch: string | null, dir: string): Promise<RepoSnapshot> {
  if (!NAME.test(owner) || !NAME.test(repo)) throw new HttpError(400, '仓库名不合法');
  if (branch !== null && !BRANCH.test(branch)) throw new HttpError(400, '分支名不合法');
  const info = await repoInfo(owner, repo);
  if (info && info.size > MAX_REPO_KB) throw new HttpError(413, `仓库体积 ${(info.size / 1024).toFixed(1)} MB，过大，本中心拒绝收样`);

  const args = ['clone', '-q', '--bare', '--single-branch', `--depth=${HISTORY}`];
  if (branch) args.push('--branch', branch);
  args.push(`https://github.com/${owner}/${repo}.git`, dir);
  try {
    await execFile('git', args, { timeout: CLONE_TIMEOUT, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch (e) {
    const err = e as { killed?: boolean; stderr?: string };
    if (err.killed) throw new HttpError(504, '克隆超时，样本过大或 GitHub 太慢');
    const msg = err.stderr ?? '';
    if (/not found|Authentication|could not read Username/i.test(msg)) throw new HttpError(404, '公海查无此仓库/分支，或该仓库为私有');
    throw new HttpError(502, `克隆失败：${msg.split('\n')[0] ?? ''}`);
  }
  return snapshotFromDir(dir, {
    owner,
    repo,
    defaultBranch: info?.default_branch ?? '',
    sizeKb: info?.size ?? 0,
    createdAt: info?.created_at ?? '',
    stars: info?.stargazers_count ?? 0,
    language: info?.language ?? null,
  });
}
