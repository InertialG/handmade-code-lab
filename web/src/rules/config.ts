import type { Rule } from '../types.ts';
import { allFiles, hasFile, verdict } from './helpers.ts';

const CONFIG_CHECKS: Array<[string, (p: string) => boolean]> = [
  ['.editorconfig', (p) => p === '.editorconfig'],
  ['ESLint', (p) => /^\.eslintrc|^eslint\.config\./.test(p)],
  ['Prettier', (p) => /^\.prettierrc|^prettier\.config\./.test(p)],
  ['CI workflow', (p) => p.startsWith('.github/workflows/')],
  ['TypeScript 配置', (p) => /^tsconfig(\..*)?\.json$/.test(p)],
];

export const configCompleteness: Rule = {
  id: 'config.completeness',
  name: '正在核对工程配置齐全度',
  run(snap) {
    const present = CONFIG_CHECKS.filter(([, pred]) => hasFile(snap, pred)).map(([n]) => n);
    const missing = CONFIG_CHECKS.filter(([, pred]) => !hasFile(snap, pred)).map(([n]) => n);
    if (present.length >= 4) {
      return [
        verdict(
          'config.completeness',
          `已配置：${present.join('、')}`,
          '格式化、检查、CI 一应俱全，且互相不打架。这种秩序需要解释',
          +10,
        ),
      ];
    }
    if (present.length === 0) {
      return [
        verdict(
          'config.completeness',
          `未发现任何工程配置（缺失：${missing.join('、')}）`,
          '零配置。代码风格由作者的心情统一，人类特征显著',
          -10,
        ),
      ];
    }
    return [
      verdict(
        'config.completeness',
        `已配置 ${present.join('、')}；缺失 ${missing.join('、')}`,
        '配置半途而废，符合真实项目的普遍命运',
        -3,
      ),
    ];
  },
};

const AI_ARTIFACTS: Array<[string, RegExp]> = [
  ['.cursorrules', /^\.cursorrules?$|^\.cursor\//],
  ['CLAUDE.md', /^CLAUDE\.md$|(^|\/)\.claude\//],
  ['copilot-instructions', /^\.github\/copilot-instructions\.md$/],
  ['AGENTS.md', /^AGENTS\.md$/],
  ['.aider', /^\.aider/],
  ['.windsurfrules', /^\.windsurfrules$/],
  ['GEMINI.md', /^GEMINI\.md$/],
  ['.continue', /^\.continue\//],
];

export const aiToolArtifacts: Rule = {
  id: 'config.ai-artifacts',
  name: '正在搜查 AI 工具配置残留',
  run(snap) {
    const files = allFiles(snap);
    const found = AI_ARTIFACTS.filter(([, re]) => files.some((f) => re.test(f.path))).map(
      ([n]) => n,
    );
    if (found.length === 0) return [];
    return [
      verdict(
        'config.ai-artifacts',
        `检出 ${found.join('、')}`,
        '检测器陷入伦理思考：被鉴定人为其协作者准备了专门的说明文档，这已经不是嫌疑，这是雇佣关系',
        +Math.min(35, 18 + found.length * 5),
        { highlight: true },
      ),
    ];
  },
};

export const dependencyCount: Rule = {
  id: 'config.dependencies',
  name: '正在清点依赖数量',
  run(snap) {
    const pkg = snap.files.get('package.json');
    const out = [];
    if (pkg) {
      let deps = 0;
      let dev = 0;
      try {
        const json = JSON.parse(pkg.content) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        deps = Object.keys(json.dependencies ?? {}).length;
        dev = Object.keys(json.devDependencies ?? {}).length;
      } catch {
        out.push(
          verdict(
            'config.dependencies',
            'package.json 无法被解析',
            'JSON 格式错误却仍被提交。模型不会犯这个错，人类会，而且会犯很多次',
            -12,
          ),
        );
        return out;
      }
      const evidence = `package.json 含 ${deps} 个运行依赖、${dev} 个开发依赖`;
      if (deps > 50) {
        out.push(
          verdict('config.dependencies', evidence, '依赖数量惊人：只有人类才敢承担这么多别人的 bug', -9),
        );
      } else if (deps === 0) {
        out.push(
          verdict('config.dependencies', evidence, '零运行依赖，克制得近乎表演，AI 嫌疑 +5%', +5),
        );
      } else {
        out.push(verdict('config.dependencies', evidence, '依赖规模正常，无可指摘', 0));
      }
    }
    const req = snap.files.get('requirements.txt');
    if (req) {
      const lines = req.content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const unpinned = lines.filter((l) => !/[=<>~!]/.test(l));
      if (lines.length > 0 && unpinned.length / lines.length > 0.5) {
        out.push(
          verdict(
            'config.requirements',
            `requirements.txt 共 ${lines.length} 行，其中 ${unpinned.length} 行没有版本号`,
            '不锁版本，把未来交给运气。这是一种非常古老的人类信仰',
            -8,
          ),
        );
      } else if (lines.length > 0) {
        out.push(
          verdict(
            'config.requirements',
            `requirements.txt 共 ${lines.length} 行，版本号齐全`,
            '版本全部钉死，包括那个从来不更新的包，可疑的严谨',
            +4,
          ),
        );
      }
    }
    return out;
  },
};

export const configRules: Rule[] = [configCompleteness, aiToolArtifacts, dependencyCount];
