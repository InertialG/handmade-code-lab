import { rules } from './rules/index.ts';
import {
  asciiBar,
  classify,
  composition,
  computeScore,
  conclusion,
  extras,
  sampleInfo,
  type Classification,
  type CompositionRow,
  type ReportExtras,
  type SampleInfo,
} from './score.ts';
import type { RepoSnapshot, Verdict } from './types.ts';

export interface Report {
  /** 卷宗号，由 HEAD sha 派生，同一提交永远同号 */
  caseId: string;
  /** 出证日期，由存档方写入；未存档时前端用当天 */
  issuedAt?: string;
  repo: string;
  branch: string;
  sha: string;
  score: number;
  bar: string;
  classification: Classification;
  verdicts: Verdict[];
  composition: CompositionRow[];
  conclusion: string;
  extras: ReportExtras;
  sample: SampleInfo;
  ruleCount: number;
  samplingNote: string;
}

export interface AnalyzeOptions {
  /** 每跑完一条规则回调一次，用于打印进度行 */
  onProgress?: (name: string, index: number, total: number) => void;
}

export function caseIdOf(sha: string): string {
  return `HCL-${sha.slice(0, 10).toUpperCase()}`;
}

/** 纯函数：同一个 snapshot 必然得到完全相同的 Report。 */
export function analyze(snap: RepoSnapshot, opts: AnalyzeOptions = {}): Report {
  const verdicts: Verdict[] = [];
  rules.forEach((rule, i) => {
    let produced: Verdict[] = [];
    try {
      produced = rule.run(snap);
    } catch {
      produced = [
        {
          ruleId: rule.id,
          evidence: `规则 \`${rule.id}\` 在执行中崩溃`,
          remark: '检测设备本身出现故障，该项不计入评分，但计入本中心的心理阴影',
          delta: 0,
        },
      ];
    }
    verdicts.push(...produced);
    opts.onProgress?.(rule.name, i, rules.length);
  });

  const score = computeScore(verdicts);
  const sha = snap.meta.sha || `${snap.meta.owner}/${snap.meta.repo}`;

  return {
    caseId: caseIdOf(sha),
    repo: `${snap.meta.owner}/${snap.meta.repo}`,
    branch: snap.meta.branch,
    sha,
    score,
    bar: asciiBar(score),
    classification: classify(score),
    verdicts,
    composition: composition(sha, score, verdicts),
    conclusion: conclusion(sha, score, verdicts, rules.length),
    extras: extras(sha, score),
    sample: sampleInfo(snap),
    ruleCount: rules.length,
    samplingNote: `${snap.historyComplete === false ? '仅包含最近最多 200 条提交，首次提交与仓库年龄规则已跳过。' : ''}${snap.skippedFiles ? `跳过 ${snap.skippedFiles} 个文件（目录、类型或大小/数量限制）。` : ''}`,
  };
}

/** 结果转纯文本，用于"复制结果"。 */
export function reportToText(r: Report): string {
  const lines: string[] = [];
  lines.push(`纯手工代码鉴定中心 / 检测报告 / 卷宗号 ${r.caseId}`);
  lines.push(`样本：${r.repo}@${r.sha.slice(0, 7)}（分支 ${r.branch}）`);
  lines.push('');
  lines.push(`AI Participation Score: ${r.score.toFixed(1)}%`);
  lines.push(r.bar);
  lines.push(`Classification: ${r.classification.title}`);
  lines.push(`Confidence: ${r.extras.confidence}`);
  lines.push(`Margin of error: ${r.extras.marginOfError}`);
  lines.push(`置信区间: ${r.extras.interval}`);
  lines.push('');
  if (r.samplingNote) lines.push(`采样说明：${r.samplingNote}`);
  lines.push('— 证据 —');
  for (const v of r.verdicts) {
    const sign = v.delta > 0 ? `+${v.delta}` : `${v.delta}`;
    lines.push(`• ${v.evidence}`);
    lines.push(`  ${v.remark}（${sign}%）`);
  }
  lines.push('');
  lines.push('— 成分分析 —');
  for (const c of r.composition) lines.push(`${c.label.padEnd(18, ' ')} ${c.percent.toFixed(1)}%`);
  lines.push('');
  lines.push(`结论：${r.conclusion}`);
  lines.push(
    `本次抽检：${r.sample.files} 个文件 / ${r.sample.lines} 行 / ${r.sample.commits} 条提交 / sha ${r.sample.shortSha} / 鉴定师：${r.extras.inspector}`,
  );
  lines.push('本检测采用静态分析、提交考古与主观臆断。结果仅供娱乐；若与事实相符，纯属算法实力。');
  return lines.join('\n');
}
