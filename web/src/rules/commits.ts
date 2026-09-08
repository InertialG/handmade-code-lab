import type { CommitInfo, Rule } from '../types.ts';
import { pct, verdict } from './helpers.ts';

const SHORT_MSG = /^(fix|update|updates|wip|test|tmp|\.+|asdf|aaa+|1+|commit|change|改|修|提交|优化)$/i;

function firstLine(c: CommitInfo): string {
  return c.message.split('\n')[0]!.trim();
}

export const shortMessages: Rule = {
  id: 'commits.short-messages',
  name: '正在阅读提交信息',
  run(snap) {
    const cs = snap.commits;
    if (cs.length < 3) return [];
    const short = cs.filter((c) => {
      const l = firstLine(c);
      return SHORT_MSG.test(l) || l.length <= 4;
    });
    const ratio = short.length / cs.length;
    if (ratio > 0.25) {
      const sample = short.map(firstLine).filter(Boolean).sort()[0] ?? 'fix';
      return [
        verdict(
          'commits.short-messages',
          `${short.length}/${cs.length}（${pct(short.length, cs.length)}）条提交信息不超过 4 个字符，例如 "${sample}"`,
          '一个字都不肯多写：本中心确认屏幕前坐着一个疲惫的人类',
          -Math.round(6 + ratio * 20),
        ),
      ];
    }
    return [];
  },
};

export const verboseMessages: Rule = {
  id: 'commits.verbose-messages',
  name: '正在测量提交信息的字数',
  run(snap) {
    const cs = snap.commits;
    if (cs.length < 3) return [];
    const avg = cs.reduce((n, c) => n + c.message.length, 0) / cs.length;
    const bulleted = cs.filter((c) => /\n\s*[-*]\s+/.test(c.message)).length;
    const formal = cs.filter((c) => /This commit|本次提交|该提交/.test(c.message)).length;
    const evidence = `提交信息平均 ${avg.toFixed(0)} 字符，其中 ${bulleted} 条带无序列表、${formal} 条以 "This commit" 开场`;
    if (avg > 120 && (bulleted > 0 || formal > 0)) {
      return [
        verdict(
          'commits.verbose-messages',
          evidence,
          'AI，或者一位令人不安的专业人士',
          +13,
        ),
      ];
    }
    if (avg > 120) {
      return [verdict('commits.verbose-messages', evidence, '提交信息篇幅可观，疑似有人代笔', +6)];
    }
    return [verdict('commits.verbose-messages', evidence, '提交信息长度朴素，未见文学野心', -2)];
  },
};

const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]*\))?!?:\s+/;

export const conventionalCommits: Rule = {
  id: 'commits.conventional',
  name: '正在核对 Conventional Commits 合规性',
  run(snap) {
    const cs = snap.commits;
    if (cs.length < 5) return [];
    const ok = cs.filter((c) => CONVENTIONAL.test(firstLine(c)));
    const ratio = ok.length / cs.length;
    const evidence = `${ok.length}/${cs.length}（${pct(ok.length, cs.length)}）条符合 Conventional Commits`;
    if (ratio === 1) {
      return [
        verdict(
          'commits.conventional',
          evidence,
          '100% 合规，一次都没有破功。人类会在深夜写下 "fix"，此人没有',
          +12,
        ),
      ];
    }
    if (ratio > 0.7) {
      return [verdict('commits.conventional', evidence, '规范执行良好，但仍留有破绽，判定为受过训练的人类', +4)];
    }
    if (ratio > 0) {
      return [verdict('commits.conventional', evidence, '规范时有时无，符合真实工程环境', -3)];
    }
    return [verdict('commits.conventional', evidence, '完全不使用提交规范，本中心表示尊重', -5)];
  },
};

export const emojiCommits: Rule = {
  id: 'commits.emoji',
  name: '正在识别提交信息中的表情符号',
  run(snap) {
    const cs = snap.commits;
    if (cs.length === 0) return [];
    const withEmoji = cs.filter((c) =>
      /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(firstLine(c)),
    );
    if (withEmoji.length === 0) return [];
    return [
      verdict(
        'commits.emoji',
        `${withEmoji.length}/${cs.length} 条提交以 emoji 开头`,
        '无法判定：emoji 提交是一种跨物种的通用行为，仅作记录',
        0,
      ),
    ];
  },
};

const COAUTHOR = /Co-authored-by:.*(Claude|Copilot|ChatGPT|GPT-4|Cursor|Codex|Devin|Aider|Windsurf)/i;

export const aiCoauthor: Rule = {
  id: 'commits.ai-coauthor',
  name: '正在检索提交尾注中的合著者',
  run(snap) {
    const hits = snap.commits.filter((c) => COAUTHOR.test(c.message));
    if (hits.length === 0) return [];
    const names = new Set<string>();
    for (const c of hits) {
      const m = COAUTHOR.exec(c.message);
      if (m) names.add(m[1]!);
    }
    return [
      verdict(
        'commits.ai-coauthor',
        `${hits.length} 条提交带有 \`Co-authored-by: ${[...names].sort().join(' / ')}\``,
        '直接命中。被鉴定人已在提交记录中自行签署供词，本中心无需再做工作',
        +Math.min(38, 20 + hits.length * 2),
        { highlight: true },
      ),
    ];
  },
};

export const giantCommits: Rule = {
  id: 'commits.giant',
  name: '正在测量单次提交的体积',
  run(snap) {
    const withStats = snap.commits.filter((c) => typeof c.additions === 'number');
    if (withStats.length === 0) return [];
    const biggest = withStats
      .slice()
      .sort((a, b) => (b.additions ?? 0) - (a.additions ?? 0) || (a.sha < b.sha ? -1 : 1))[0]!;
    const add = biggest.additions ?? 0;
    if (add > 5000) {
      return [
        verdict(
          'commits.giant',
          `提交 \`${biggest.sha.slice(0, 7)}\` 一次新增 ${add} 行`,
          '检测仪开始冒烟。人类的手腕在第 900 行就会提出抗议',
          +Math.min(20, 8 + Math.floor(add / 2000)),
        ),
      ];
    }
    if (add > 1200) {
      return [
        verdict(
          'commits.giant',
          `最大单次提交新增 ${add} 行（\`${biggest.sha.slice(0, 7)}\`）`,
          '单次提交体积偏大，疑似存在外部助力',
          +5,
        ),
      ];
    }
    return [
      verdict(
        'commits.giant',
        `最大单次提交仅新增 ${add} 行`,
        '提交切得很碎，是一种缓慢而痛苦的人类节奏',
        -4,
      ),
    ];
  },
};

export const initialDump: Rule = {
  id: 'commits.initial-dump',
  name: '正在回溯首次提交',
  run(snap) {
    const cs = snap.commits;
    if (cs.length < 2 || snap.files.size === 0) return [];
    const first = cs[cs.length - 1]!;
    const changed = first.changedFiles;
    if (typeof changed !== 'number') return [];
    const ratio = changed / snap.files.size;
    if (ratio > 0.8) {
      return [
        verdict(
          'commits.initial-dump',
          `首次提交即包含 ${changed} 个文件，占当前文件总数的 ${pct(changed, snap.files.size)}`,
          '一夜出现。整个项目在世界上的第一个瞬间就已经是完成品',
          +14,
        ),
      ];
    }
    return [
      verdict(
        'commits.initial-dump',
        `首次提交包含 ${changed} 个文件（占 ${pct(changed, snap.files.size)}）`,
        '项目由小到大逐步长出，符合有机生长曲线',
        -5,
      ),
    ];
  },
};

export const commitHours: Rule = {
  id: 'commits.hours',
  name: '正在绘制提交时间分布',
  run(snap) {
    const cs = snap.commits;
    if (cs.length < 5) return [];
    let night = 0;
    let office = 0;
    for (const c of cs) {
      const h = new Date(c.date).getUTCHours();
      if (h >= 2 && h < 6) night++;
      if (h >= 9 && h < 18) office++;
    }
    const out = [];
    if (night / cs.length > 0.15) {
      out.push(
        verdict(
          'commits.night',
          `${night}/${cs.length} 条提交发生在凌晨 2–5 点（UTC）`,
          '作者凌晨三点的决定：这类代码具有不可复现的人类质感',
          -Math.round(6 + (night / cs.length) * 20),
        ),
      );
    }
    if (office / cs.length > 0.85) {
      out.push(
        verdict(
          'commits.office-hours',
          `${pct(office, cs.length)} 的提交集中在 9–18 点（UTC）`,
          '作息过于健康。健康的作息是本中心已知的最强 AI 指标之一',
          +9,
        ),
      );
    }
    if (out.length === 0) {
      out.push(
        verdict(
          'commits.hours',
          `提交时间分布：夜间 ${night} 条、工作时段 ${office} 条`,
          '时间分布无异常，说明作者拥有正常但不完美的人生',
          -1,
        ),
      );
    }
    return out;
  },
};

export const authorCount: Rule = {
  id: 'commits.authors',
  name: '正在统计作者数量',
  run(snap) {
    const cs = snap.commits;
    if (cs.length === 0) return [];
    const authors = new Set(cs.map((c) => c.authorEmail || c.authorName));
    const n = authors.size;
    if (n === 1) {
      return [
        verdict(
          'commits.authors',
          `全部 ${cs.length} 条提交来自 1 位作者`,
          '独狼项目。没有人审查，也没有人阻止',
          -3,
        ),
      ];
    }
    if (n > 10) {
      return [
        verdict(
          'commits.authors',
          `检出 ${n} 位提交者`,
          'AI 无法忍受这么多人的意见，判定为人类协作产物',
          -8,
        ),
      ];
    }
    return [verdict('commits.authors', `检出 ${n} 位提交者`, '小队规模，暂无结论', 0)];
  },
};

export const repoAge: Rule = {
  id: 'commits.repo-age',
  name: '正在核对仓库年龄',
  run(snap) {
    const cs = snap.commits;
    if (cs.length === 0 || !snap.meta.createdAt) return [];
    const created = Date.parse(snap.meta.createdAt);
    const first = Date.parse(cs[cs.length - 1]!.date);
    if (!Number.isFinite(created) || !Number.isFinite(first)) return [];
    const minutes = Math.abs(first - created) / 60000;
    const spanDays = Math.max(
      0,
      (Date.parse(cs[0]!.date) - first) / 86400000,
    );
    if (minutes < 60 && cs.length < 15) {
      return [
        verdict(
          'commits.repo-age',
          `仓库创建后 ${minutes.toFixed(0)} 分钟内即完成首次提交，累计 ${cs.length} 条提交、跨度 ${spanDays.toFixed(1)} 天`,
          '从建仓到成品一气呵成，中间没有任何犹豫、外卖或走神',
          +11,
        ),
      ];
    }
    return [
      verdict(
        'commits.repo-age',
        `仓库存续 ${spanDays.toFixed(0)} 天，共 ${cs.length} 条提交`,
        '项目在时间中缓慢磨损，这一点很难伪造',
        -3,
      ),
    ];
  },
};

export const commitRules: Rule[] = [
  shortMessages,
  verboseMessages,
  conventionalCommits,
  emojiCommits,
  aiCoauthor,
  giantCommits,
  initialDump,
  commitHours,
  authorCount,
  repoAge,
];
