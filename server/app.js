/**
 * 节点端入口：静态托管 web/dist，并提供 GET /report/:owner/:repo[?branch=]。
 * 零依赖；Passenger 或 `node server/app.js` 都能跑。
 */
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../web/src/analyze.ts';
import { cloneSnapshot, HttpError, NAME, remoteSha } from './snapshot.ts';
import { caseIdOf } from '../web/src/analyze.ts';
import { CASE_ID, Store } from './store.ts';

const DIST = fileURLToPath(new URL('../web/dist/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PER_IP_PER_HOUR = 30;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };

const store = new Store(fileURLToPath(new URL('../data/reports/', import.meta.url)));
const hits = new Map(); // ip -> { at, n }
let queue = Promise.resolve(); // ponytail: 全局串行队列。serv00 限 20 个进程，一次 clone 就要占 4 个

function text(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function json(res, body, xCache) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': xCache });
  res.end(JSON.stringify(body));
}

async function getCase(res, id) {
  if (!CASE_ID.test(id)) return text(res, 400, '卷宗号格式不对');
  const s = await store.read(id);
  return s ? json(res, s.report, 'case') : text(res, 404, '档案室里没有这份卷宗');
}

function tooMany(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 3600_000) { hits.set(ip, { at: now, n: 1 }); return false; }
  return ++h.n > PER_IP_PER_HOUR;
}

async function buildReport(owner, repo, branch) {
  const dir = await mkdtemp(join(tmpdir(), 'hcl-'));
  try {
    return analyze(await cloneSnapshot(owner, repo, branch, dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function report(req, res, url) {
  const m = /^\/report\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!m || !NAME.test(m[1]) || !NAME.test(m[2])) return text(res, 400, '仓库名不合法');
  const branch = url.searchParams.get('branch') || null;
  const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  if (tooMany(ip)) return text(res, 429, '本时段送检次数已达上限，请一小时后再来');

  try {
    // 先问远端 sha：同一提交的卷宗已存在且规则版本一致，就不再克隆
    const cached = await store.fresh(caseIdOf(await remoteSha(m[1], m[2], branch)));
    if (cached) return json(res, cached, 'hit');
    const job = queue.then(() => buildReport(m[1], m[2], branch));
    queue = job.catch(() => {});
    const report = await job;
    report.issuedAt = new Date().toISOString().slice(0, 10);
    await store.write(report);
    json(res, report, 'miss');
  } catch (e) {
    if (e instanceof HttpError) return text(res, e.status, e.message);
    console.error(e);
    text(res, 500, '化验仪器故障');
  }
}

function serveStatic(res, pathname) {
  let rel;
  try { rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ''); } catch { return text(res, 400, 'Bad path'); }
  if (rel === '' || rel.endsWith(sep)) rel += 'index.html';
  const file = join(DIST, rel);
  if (!file.startsWith(DIST)) return text(res, 403, 'Forbidden');
  let st;
  try { st = statSync(file); } catch { return text(res, 404, 'Not found'); }
  if (!st.isFile()) return text(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/report/')) return void report(req, res, url);
  if (url.pathname.startsWith('/case/')) return void getCase(res, url.pathname.slice(6));
  serveStatic(res, url.pathname);
}).listen(PORT, () => console.log(`handmade-code-lab server on :${PORT}`));
