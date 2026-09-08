import { seeded, seededInt, seededPick } from './seeded.ts';
import type { RepoSnapshot, Verdict } from './types.ts';

export const BASE_SCORE = 50;
export const MIN_SCORE = 0.3;
export const MAX_SCORE = 99.7;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** score = clamp(50 + Σ delta*weight, 0.3, 99.7)，保留一位小数。 */
export function computeScore(verdicts: Verdict[]): number {
  const sum = verdicts.reduce((n, v) => n + v.delta * (v.weight ?? 1), 0);
  return Math.round(clamp(BASE_SCORE + sum, MIN_SCORE, MAX_SCORE) * 10) / 10;
}

export interface Classification {
  title: string;
  note: string;
}

const BANDS: Array<{ max: number; title: string; note: string }> = [
  { max: 10, title: '纯天然有机手写代码', note: '建议贴标出售，可溯源至具体的一个人和一次失眠' },
  { max: 25, title: '农家自产代码（少量工具辅助）', note: '存在补全痕迹，但主要工序仍由人手完成' },
  { max: 45, title: 'AI 辅助手工艺代码', note: '人机协作，人类仍掌握方向盘，偶尔松手' },
  { max: 60, title: '人机共同署名作品', note: '双方贡献难以拆分，建议共同领奖' },
  { max: 75, title: '重度模型参与代码', note: '人类主要负责按回车与偶尔说"不对"' },
  { max: 90, title: '疑似全自动生成', note: '检出大量流水线特征，人类角色接近产品经理' },
  { max: 101, title: '工业级合成代码（不含人工成分）', note: '本中心在其中未找到任何犹豫的痕迹' },
];

export function classify(score: number): Classification {
  for (const b of BANDS) if (score < b.max) return { title: b.title, note: b.note };
  const last = BANDS[BANDS.length - 1]!;
  return { title: last.title, note: last.note };
}

export interface CompositionRow {
  label: string;
  percent: number;
}

const COMPONENTS = [
  'Claude',
  'Copilot',
  'Stack Overflow 遗留物',
  '作者凌晨三点的决定',
  '不愿承认的复制粘贴',
  '纯手工有机代码',
];

/**
 * 成分分析表：由 sha + 判词派生，保证同一 sha 结果稳定，总和恰为 100.0%。
 * 前两项随 AI 分数上升，后三项随之下降。
 */
export function composition(sha: string, score: number, verdicts: Verdict[]): CompositionRow[] {
  const salt = verdicts.map((v) => `${v.ruleId}:${v.delta}`).join('|');
  const aiShare = score / 100;
  const bias = [aiShare * 1.4, aiShare * 0.9, 0.5, 1 - aiShare, (1 - aiShare) * 0.8, (1 - aiShare) * 1.6];
  const raw = COMPONENTS.map((label, i) => {
    const jitter = 0.35 + seeded(sha, `${salt}#${label}#${i}`) * 0.9;
    return { label, weight: Math.max(0.01, bias[i]! * jitter) };
  });
  const total = raw.reduce((n, r) => n + r.weight, 0);
  const rows = raw.map((r) => ({ label: r.label, percent: Math.round((r.weight / total) * 1000) / 10 }));
  // 修正舍入误差，让总和精确为 100.0
  const diff = Math.round((100 - rows.reduce((n, r) => n + r.percent, 0)) * 10) / 10;
  rows[0]!.percent = Math.round((rows[0]!.percent + diff) * 10) / 10;
  return rows;
}

const CONCLUSIONS = [
  '综合判断，本仓库的代码由 {human}% 的人类意志与 {ai}% 的统计规律共同构成，双方均不愿对最终结果负责。',
  '本中心认为，被鉴定人在写下这些代码时是清醒的，但不完全是自愿的。AI 参与度 {ai}%。',
  '检测结论：{ai}% 的机器痕迹，{human}% 的个人风格，以及 100% 的"能跑就行"。',
  '样本呈现出典型的{cls}特征。建议作者在未来的提交信息中保留更多破绽，以便同行辨认。',
  '在 {rules} 条检测项中，本仓库触发了 {hits} 条。这个数字既不光荣，也不可耻，但它很确定。',
  '鉴定完毕。若您对 {ai}% 这一结果不满，可重新提交同一仓库，我们保证给出完全相同的答案。',
  '本样本的最大疑点在于它看起来太像一个正常项目了。AI 参与度 {ai}%，误差范围：有。',
];

export function conclusion(
  sha: string,
  score: number,
  verdicts: Verdict[],
  totalRules: number,
): string {
  const tpl = seededPick(sha, `conclusion#${verdicts.length}`, CONCLUSIONS);
  return tpl
    .replace('{ai}', score.toFixed(1))
    .replace('{human}', (100 - score).toFixed(1))
    .replace('{cls}', classify(score).title)
    .replace('{rules}', String(totalRules))
    .replace('{hits}', String(verdicts.length));
}

const CONFIDENCE = [
  'Unreasonably high',
  '高得没有道理',
  '与样本量无关',
  '本中心内部已充分自洽',
  '不接受质疑（技术原因）',
];

export interface ReportExtras {
  confidence: string;
  marginOfError: string;
  interval: string;
  inspector: string;
}

export function extras(sha: string, score: number): ReportExtras {
  const half = 0.5 + seededInt(sha, 'interval', 3, 92) / 10;
  const lo = Math.max(MIN_SCORE, Math.round((score - half) * 10) / 10);
  const hi = Math.min(MAX_SCORE, Math.round((score + half) * 10) / 10);
  return {
    confidence: seededPick(sha, 'confidence', CONFIDENCE),
    marginOfError: 'Yes',
    interval: `${lo.toFixed(1)}% – ${hi.toFixed(1)}%（置信度见上）`,
    inspector: '规则引擎 v1（0 参数）',
  };
}

/** 结果页顶部的 ASCII 进度条。 */
export function asciiBar(score: number, width = 40): string {
  const filled = Math.round((score / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`;
}

export interface SampleInfo {
  files: number;
  lines: number;
  commits: number;
  shortSha: string;
}

export function sampleInfo(snap: RepoSnapshot): SampleInfo {
  let lines = 0;
  for (const f of snap.files.values()) lines += f.lines;
  return {
    files: snap.files.size,
    lines,
    commits: snap.commits.length,
    shortSha: snap.meta.sha.slice(0, 7),
  };
}
