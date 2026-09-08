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
const errorCard = $<HTMLElement>('#error-card');
const incidentBadge = $<HTMLElement>('#incident-badge');
const incidentTitle = $<HTMLElement>('#incident-title');
const incidentDetail = $<HTMLElement>('#incident-detail');
const incidentActions = $<HTMLElement>('#incident-actions');
const advancedDetails = $<HTMLDetailsElement>('#advanced-details');
const checkQuotaBtn = $<HTMLButtonElement>('#check-quota-btn');
const quotaMsg = $<HTMLElement>('#quota-msg');
const copyBtn = $<HTMLButtonElement>('#copy-btn');
const againBtn = $<HTMLButtonElement>('#again-btn');

let current: Report | null = null;
let running = false;
let controller: AbortController | null = null;
const submitBtn = $<HTMLButtonElement>('button[type=submit]');
$('#cancel-btn').addEventListener('click', () => controller?.abort());
// Remove tokens and reports persisted by previous versions, including private evidence.
try {
  localStorage.removeItem('hcl.pat');
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('hcl.report.')) localStorage.removeItem(key);
  }
} catch { /* Storage may be unavailable. */ }

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

function getStampConfig(score: number): { text: string; className: string } {
  if (score <= 15) return { text: '纯手工认证', className: 'stamp pure-handmade' };
  if (score <= 35) return { text: '微量添加', className: 'stamp' };
  if (score <= 65) return { text: '半人半机', className: 'stamp' };
  if (score <= 85) return { text: '重度合成', className: 'stamp extreme-ai' };
  return { text: '100%纯硅基', className: 'stamp extreme-ai' };
}

function renderReport(r: Report): void {
  current = r;
  const stampCfg = getStampConfig(r.score);
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
    <div class="${stampCfg.className}">${stampCfg.text}</div>
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

    <div class="certificate-footer">
      <div class="signatures">
        <div>主检鉴定师：<b>${escapeHtml(r.extras.inspector)}</b></div>
        <div>技术复核：<b>赵工（感觉工程所）</b></div>
        <div>出证日期：<b>${new Date().toISOString().slice(0, 10)}</b></div>
      </div>
      <div class="official-seal" aria-hidden="true">
        <span>检验专用章</span>
        <span class="seal-star">★</span>
        <span>HCL-LAB</span>
      </div>
    </div>
  `;
  if (r.samplingNote) {
    const note = document.createElement('p');
    note.className = 'sample';
    note.textContent = r.samplingNote;
    resultEl.append(note);
  }
  stageResult.hidden = false;
}

interface IncidentInfo {
  badge: string;
  title: string;
  detail: string;
  actions?: { label: string; onClick?: () => void; href?: string; primary?: boolean }[];
  highlightAdvanced?: boolean;
}

function showIncident(info: IncidentInfo): void {
  incidentBadge.textContent = info.badge;
  incidentTitle.textContent = info.title;
  incidentDetail.innerHTML = info.detail;
  incidentActions.innerHTML = '';

  if (info.actions) {
    for (const act of info.actions) {
      if (act.href) {
        const a = document.createElement('a');
        a.href = act.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = act.primary ? 'primary-btn' : 'secondary-btn';
        a.textContent = act.label;
        incidentActions.appendChild(a);
      } else if (act.onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = act.primary ? '' : 'secondary-btn';
        btn.textContent = act.label;
        btn.addEventListener('click', act.onClick);
        incidentActions.appendChild(btn);
      }
    }
  }

  errorCard.hidden = false;
  if (info.highlightAdvanced) {
    advancedDetails.open = true;
    advancedDetails.classList.add('highlight-pulse');
    tokenInput.focus();
    setTimeout(() => advancedDetails.classList.remove('highlight-pulse'), 3500);
  }
}

function hideIncident(): void {
  errorCard.hidden = true;
}

function handleException(e: unknown, rawInput: string, aborted: boolean): void {
  if (aborted) {
    showIncident({
      badge: 'CASE-ABORTED',
      title: '当事人中途撕毁送检协议',
      detail: '送检人突然心虚或反悔，在化验设备运作中强行拔出插头抱走了样本。检测程序已实施安全熔断，本中心已将本次撤案载入《可疑心虚人类观察通报》备查。',
      actions: [
        {
          label: '假装无事发生，重新送检',
          primary: true,
          onClick: () => start(rawInput),
        },
      ],
    });
    return;
  }

  const msg = e instanceof Error ? e.message : String(e);

  // 1. Rate limit
  if (msg.includes('rate limit') || msg.includes('403') || msg.includes('API rate limit')) {
    showIncident({
      badge: 'ERR-403-RATION-EXHAUSTED',
      title: '大厅无记名号筹已抢光（Rate Limit 超限）',
      detail: 'GitHub 官方办事窗口每小时仅向全球匿名游客施舍 60 张普通粮票，此刻已被彻底刷爆。<br>请在下方<strong>高级设置</strong>中填入您的私人特许粮票（Personal Access Token），即可走 5000 次/小时干部绿色通道。',
      highlightAdvanced: true,
      actions: [
        {
          label: '去 GitHub 户籍科领一张无权限粮票',
          href: 'https://github.com/settings/tokens/new?scopes=&description=HandmadeCodeLab-ReadOnly',
        },
        {
          label: '填好粮票后点此立即重试',
          primary: true,
          onClick: () => start(rawInput),
        },
      ],
    });
    return;
  }

  // 2. 404 / Not Found
  if (msg.includes('404') || msg.includes('Not Found') || msg.includes('未找到') || msg.includes('不存在')) {
    showIncident({
      badge: 'ERR-404-VANISHED',
      title: '公海查无此单位或属于涉密机构',
      detail: `本所外勤侦查员在公海（GitHub）拉网式搜寻，未发现 <code>${escapeHtml(rawInput)}</code> 的任何踪迹。<br>可能原因：① 户籍名填错或打错字母；② 该仓库系私人保密地堡（Private Repo，需在高级设置中凭特许 Token 调阅）；③ 团队已跑路删除代码跑路。`,
      actions: [
        {
          label: '重新检查样本名称',
          primary: true,
          onClick: () => {
            input.focus();
            input.select();
          },
        },
      ],
    });
    return;
  }

  // 3. 超大仓库
  if (msg.includes('too large') || msg.includes('过大') || msg.includes('limit') || msg.includes('oversized')) {
    showIncident({
      badge: 'ERR-OVERWEIGHT',
      title: '卡车严重超载，压坏化验天平',
      detail: `${escapeHtml(msg)}。<br>送检样本体积过于磅礴，已严重超出本中心土制化验仪器之承受上限。样本尚未开箱，本中心不对未经化验的材料发表任何鉴定意见。`,
      actions: [
        {
          label: '送检其他瘦身样本',
          primary: true,
          onClick: () => {
            input.value = '';
            input.focus();
          },
        },
      ],
    });
    return;
  }

  // 4. 网络故障 / 服务中断
  if (msg.includes('Network') || msg.includes('Failed to fetch') || msg.includes('500') || msg.includes('502') || msg.includes('504')) {
    showIncident({
      badge: 'ERR-BLACKOUT',
      title: '化验室电闸跳闸或国际光缆受损',
      detail: `化验机器与远程机房失去联络（<code>${escapeHtml(msg)}</code>）。可能是海底光缆被鲸鱼误吞，或是本地网络正处于原始农耕状态。`,
      actions: [
        {
          label: '猛拍机器两下并重新化验',
          primary: true,
          onClick: () => start(rawInput),
        },
      ],
    });
    return;
  }

  // 默认兜底
  showIncident({
    badge: 'ERR-PARANORMAL',
    title: '遭遇无法以唯物主义解释之未知故障',
    detail: `化验仪器在运行中吐出了一张语义未明的符纸：<br><code>${escapeHtml(msg)}</code><br>该项故障已登记在案，建议喝杯茶后再试或联系当值值班人员。`,
    actions: [
      {
        label: '再试一次',
        primary: true,
        onClick: () => start(rawInput),
      },
    ],
  });
}

async function run(raw: string): Promise<void> {
  const task = new AbortController();
  controller = task;
  current = null;
  hideIncident();
  stageResult.hidden = true;
  logEl.textContent = '';
  stageProgress.hidden = false;

  const ref = parseRepoInput(raw);
  if (!ref) {
    stageProgress.hidden = true;
    showIncident({
      badge: 'ERR-INVALID-FORMAT',
      title: '样本条形码无法识别',
      detail: '本中心只接受 <code>owner/repo</code> 格式（如 <code>torvalds/linux</code>）或完整的 GitHub 仓库链接。请勿将随身携带的无关杂物塞入送样口。',
      actions: [
        {
          label: '修改输入',
          primary: true,
          onClick: () => {
            input.focus();
            input.select();
          },
        },
      ],
    });
    return;
  }

  const url = new URL(location.href);
  url.searchParams.set('repo', formatRepoRef(ref));
  history.replaceState(null, '', url);

  log(`受理样本：${formatRepoRef(ref)}`);
  try {
    const token = tokenInput.value.trim() || undefined;
    const snap = await fetchSnapshot(ref, { token, signal: task.signal, onStep: (m) => log(`${m}……`) });

    const perRuleDelay = Math.min(60, Math.floor(2400 / Math.max(rules.length, 1)));
    const pending: string[] = [];
    const report = analyze(snap, {
      onProgress: (name, i) => {
        pending.push(`${String(i + 1).padStart(2, '0')} ${name}……`);
      },
    });
    for (const line of pending) {
      task.signal.throwIfAborted();
      log(line);
      await sleep(perRuleDelay);
    }
    log('鉴定完毕，正在盖章');
    await sleep(200);

    task.signal.throwIfAborted();
    renderReport(report);
  } catch (e) {
    handleException(e, raw, task.signal.aborted);
  } finally {
    stageProgress.hidden = true;
  }
}

function start(raw: string): void {
  if (running) return;
  running = true;
  submitBtn.disabled = true;
  void run(raw).finally(() => { running = false; submitBtn.disabled = false; controller = null; });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  start(input.value);
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

// 点击预置样本一键送检
document.querySelectorAll<HTMLButtonElement>('.sample-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const repo = chip.dataset.repo;
    if (repo) {
      input.value = repo;
      start(repo);
    }
  });
});

// 粮票余额核验
checkQuotaBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  checkQuotaBtn.disabled = true;
  quotaMsg.hidden = false;
  quotaMsg.textContent = '正在联系 GitHub 户籍科查验粮票账目……';

  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('https://api.github.com/rate_limit', { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rate?: { limit: number; remaining: number; reset: number } };
    const rate = data.rate;
    if (rate) {
      const resetTime = new Date(rate.reset * 1000).toLocaleTimeString();
      if (token) {
        quotaMsg.textContent = `【特许粮票查验合格】额度上限: ${rate.limit} 次/时 · 剩余可挥霍: ${rate.remaining} 次（重置时间: ${resetTime}）。经核验，确系尊贵干部待遇。`;
      } else {
        quotaMsg.textContent = `【无记名临时号筹】额度上限: ${rate.limit} 次/时 · 剩余仅存: ${rate.remaining} 次（重置时间: ${resetTime}）。若额度告急，建议尽快申领个人粮票。`;
      }
    } else {
      quotaMsg.textContent = '查验结果格式异常，粮票真伪难辨。';
    }
  } catch (err) {
    quotaMsg.textContent = `核验失败：户籍科窗口无应答（${err instanceof Error ? err.message : String(err)}）。`;
  } finally {
    checkQuotaBtn.disabled = false;
  }
});

const initial = new URL(location.href).searchParams.get('repo');
if (initial) {
  input.value = initial;
  start(initial);
}
