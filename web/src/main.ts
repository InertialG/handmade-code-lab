import { analyze, reportToText, type Report } from './analyze.ts';
import { fetchSnapshot } from './github.ts';
import { formatRepoRef, parseRepoInput } from './parseRepo.ts';
import { rules } from './rules/index.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const form = $<HTMLFormElement>('#repo-form');
const input = $<HTMLInputElement>('#repo-input');
const tokenInput = $<HTMLInputElement>('#pat-input');
const logEl = $<HTMLPreElement>('#log');
const stageProgress = $<HTMLElement>('#stage-progress');
const stageResult = $<HTMLElement>('#stage-result');
const resultEl = $<HTMLElement>('#result');
const errorEl = $<HTMLElement>('#error');
const copyBtn = $<HTMLButtonElement>('#copy-btn');
const againBtn = $<HTMLButtonElement>('#again-btn');

const TOKEN_KEY = 'hcl.pat';
const CACHE_PREFIX = 'hcl.report.';

let current: Report | null = null;

const savedToken = localStorage.getItem(TOKEN_KEY);
if (savedToken) tokenInput.value = savedToken;
tokenInput.addEventListener('change', () => {
  const v = tokenInput.value.trim();
  if (v) localStorage.setItem(TOKEN_KEY, v);
  else localStorage.removeItem(TOKEN_KEY);
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(line: string): void {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** 判词里允许 `code` 反引号，其余转义。 */
function inline(s: string): string {
  return escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderReport(r: Report): void {
  current = r;
  const rows = r.composition
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.label)}</td><td class="num">${c.percent.toFixed(1)}%</td>
         <td class="meter"><span style="width:${Math.min(100, c.percent)}%"></span></td></tr>`,
    )
    .join('');

  const evidence = r.verdicts
    .map((v) => {
      const sign = v.delta > 0 ? `+${v.delta}` : v.delta < 0 ? `${v.delta}` : '±0';
      const cls = v.delta > 0 ? 'up' : v.delta < 0 ? 'down' : 'flat';
      return `<li class="${v.highlight ? 'hit' : ''}">
        <div class="ev">${inline(v.evidence)}</div>
        <div class="rk">${inline(v.remark)}</div>
        <div class="dl ${cls}">${sign}%</div>
        <div class="rid">${escapeHtml(v.ruleId)}</div>
      </li>`;
    })
    .join('');

  resultEl.innerHTML = `
    <div class="stamp">已鉴定</div>
    <div class="score-block">
      <div class="score-label">AI PARTICIPATION SCORE</div>
      <div class="score">${r.score.toFixed(1)}<span>%</span></div>
      <pre class="bar">${r.bar}</pre>
      <div class="kv"><span>Classification</span><b>${escapeHtml(r.classification.title)}</b></div>
      <div class="kv note">${escapeHtml(r.classification.note)}</div>
      <div class="kv"><span>Confidence</span><b>${escapeHtml(r.extras.confidence)}</b></div>
      <div class="kv"><span>Margin of error</span><b>${escapeHtml(r.extras.marginOfError)}</b></div>
      <div class="kv"><span>置信区间</span><b>${escapeHtml(r.extras.interval)}</b></div>
    </div>

    <h2>证据清单<small>（${r.verdicts.length} 项，共运行 ${r.ruleCount} 条检测规则）</small></h2>
    <ul class="evidence">${evidence}</ul>

    <h2>成分分析</h2>
    <table class="composition"><tbody>${rows}</tbody></table>

    <h2>鉴定结论</h2>
    <p class="conclusion">${escapeHtml(r.conclusion)}</p>

    <h2>本次抽检</h2>
    <p class="sample">样本 <code>${escapeHtml(r.repo)}</code> · 分支 <code>${escapeHtml(r.branch)}</code> ·
      ${r.sample.files} 个文件 · ${r.sample.lines} 行 · ${r.sample.commits} 条提交 ·
      sha <code>${escapeHtml(r.sample.shortSha)}</code> · 鉴定师：${escapeHtml(r.extras.inspector)}</p>
  `;
  stageResult.hidden = false;
}

function cacheKey(repo: string, sha: string): string {
  return `${CACHE_PREFIX}${repo}@${sha}`;
}

async function run(raw: string): Promise<void> {
  errorEl.hidden = true;
  errorEl.textContent = '';
  stageResult.hidden = true;
  logEl.textContent = '';
  stageProgress.hidden = false;

  const ref = parseRepoInput(raw);
  if (!ref) {
    stageProgress.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = '无法解析该地址。本中心接受 owner/repo 或 GitHub 仓库链接。';
    return;
  }

  const url = new URL(location.href);
  url.searchParams.set('repo', formatRepoRef(ref));
  history.replaceState(null, '', url);

  log(`受理样本：${formatRepoRef(ref)}`);
  try {
    const token = tokenInput.value.trim() || undefined;
    const snap = await fetchSnapshot(ref, { token, onStep: (m) => log(`${m}……`) });

    const key = cacheKey(`${ref.owner}/${ref.repo}`, snap.meta.sha);
    const cached = localStorage.getItem(key);
    if (cached) {
      log('检出历史检测记录，结果与上次完全一致（本中心从不改口）');
      await sleep(300);
      renderReport(JSON.parse(cached) as Report);
      stageProgress.hidden = true;
      return;
    }

    const perRuleDelay = Math.min(60, Math.floor(2400 / Math.max(rules.length, 1)));
    const pending: string[] = [];
    const report = analyze(snap, {
      onProgress: (name, i) => {
        pending.push(`${String(i + 1).padStart(2, '0')} ${name}……`);
      },
    });
    for (const line of pending) {
      log(line);
      await sleep(perRuleDelay);
    }
    log('鉴定完毕，正在盖章');
    await sleep(200);

    try {
      localStorage.setItem(key, JSON.stringify(report));
    } catch {
      /* 存不下就算了 */
    }
    renderReport(report);
  } catch (e) {
    errorEl.hidden = false;
    errorEl.textContent = `鉴定中断：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    stageProgress.hidden = true;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void run(input.value);
});

copyBtn.addEventListener('click', async () => {
  if (!current) return;
  const text = reportToText(current);
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '已复制到剪贴板';
  } catch {
    copyBtn.textContent = '复制失败，请手动选择';
  }
  setTimeout(() => (copyBtn.textContent = '复制结果'), 2000);
});

againBtn.addEventListener('click', () => {
  stageResult.hidden = true;
  input.focus();
});

const initial = new URL(location.href).searchParams.get('repo');
if (initial) {
  input.value = initial;
  void run(initial);
}
