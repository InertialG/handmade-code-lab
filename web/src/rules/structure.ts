import type { Rule } from '../types.ts';
import { allFiles, hasFile, verdict } from './helpers.ts';

export const utilFiles: Rule = {
  id: 'structure.utils',
  name: '正在检查 utils 的存在性',
  run(snap) {
    const files = allFiles(snap).filter((f) =>
      /(^|\/)(utils?|helpers?|misc|common|stuff|tools?)\.(ts|js|py|go|rb|java|rs)$/i.test(f.path),
    );
    if (files.length === 0) return [];
    return [
      verdict(
        'structure.utils',
        `发现 ${files.length} 个杂物文件，例如 \`${files.map((f) => f.path).sort()[0]}\``,
        '`utils` 是人类给"想不出该放哪"起的名字，模型通常会硬凑一个更体面的目录',
        -Math.min(10, 3 + files.length * 2),
      ),
    ];
  },
};

export const indexFiles: Rule = {
  id: 'structure.index',
  name: '正在清点 index 文件',
  run(snap) {
    const n = allFiles(snap).filter((f) => /(^|\/)index\.(ts|tsx|js|jsx)$/.test(f.path)).length;
    if (n <= 10) return [];
    return [
      verdict(
        'structure.index',
        `发现 ${n} 个 \`index.ts\` / \`index.js\``,
        '桶文件构成完整的模块导出体系，工整程度超出该项目实际需求',
        +7,
      ),
    ];
  },
};

export const dirDepth: Rule = {
  id: 'structure.depth',
  name: '正在测量目录深度',
  run(snap) {
    const files = allFiles(snap);
    if (files.length < 5) return [];
    const depths = files.map((f) => f.path.split('/').length - 1);
    const max = Math.max(...depths);
    const avg = depths.reduce((a, b) => a + b, 0) / depths.length;
    if (max >= 7) {
      return [
        verdict(
          'structure.depth',
          `最深目录层级 ${max} 层，平均 ${avg.toFixed(1)} 层`,
          '目录深到需要面包屑导航。此为架构热情过剩的典型表现',
          +6,
        ),
      ];
    }
    if (avg < 0.6) {
      return [
        verdict(
          'structure.depth',
          `平均目录层级仅 ${avg.toFixed(1)} 层`,
          '所有文件平铺在根目录：一种朴素、坦率、拒绝分层的人类美学',
          -7,
        ),
      ];
    }
    return [];
  },
};

export const licenseRule: Rule = {
  id: 'structure.license',
  name: '正在核查许可证',
  run(snap) {
    const licenses = allFiles(snap).filter((f) => /(^|\/)(LICENSE|LICENCE|COPYING)/i.test(f.path));
    if (licenses.length === 0) {
      return [
        verdict(
          'structure.license',
          '未找到 LICENSE 文件',
          '没有许可证。作者既不打算负责，也不打算解释，非常人类',
          -6,
        ),
      ];
    }
    if (licenses.length > 1) {
      return [
        verdict(
          'structure.license',
          `发现 ${licenses.length} 个许可证文件：${licenses.map((f) => f.path).sort().join('、')}`,
          '同时持有多份许可证，本中心不予评价，仅表示困惑',
          0,
        ),
      ];
    }
    return [
      verdict('structure.license', `存在 \`${licenses[0]!.path}\``, '许可证齐备，流程意识良好', +3),
    ];
  },
};

export const emptyRepo: Rule = {
  id: 'structure.empty',
  name: '正在确认仓库内是否真的有东西',
  run(snap) {
    if (snap.tooLarge) return [];
    const files = allFiles(snap);
    const nonDoc = files.filter((f) => !/^(readme|license|licence|\.gitignore)/i.test(f.path));
    if (files.length === 0) {
      return [
        verdict(
          'structure.empty',
          '未提取到任何可读文件',
          '本中心拒绝对空气进行鉴定。请先写点什么，哪怕是错的',
          0,
          { highlight: true },
        ),
      ];
    }
    if (nonDoc.length === 0) {
      return [
        verdict(
          'structure.empty',
          `仓库仅含 ${files.length} 个说明性文件，无源代码`,
          '本中心拒绝对空气进行鉴定：这里只有一个承诺，没有实现',
          0,
          { highlight: true },
        ),
      ];
    }
    return [];
  },
};

export const oversized: Rule = {
  id: 'structure.oversized',
  name: '正在评估仓库体积',
  run(snap) {
    if (!snap.tooLarge) return [];
    return [
      verdict(
        'structure.oversized',
        `GitHub 报告体积 ${(snap.meta.sizeKb / 1024).toFixed(1)} MB，超出本中心检测能力`,
        '仓库体积超出本中心检测能力，疑似 node_modules 已入库',
        +28,
        { highlight: true },
      ),
    ];
  },
};

export const gitignoreRule: Rule = {
  id: 'structure.gitignore',
  name: '正在阅读 .gitignore',
  run(snap) {
    if (!hasFile(snap, (p) => p === '.gitignore')) {
      return [
        verdict('structure.gitignore', '不存在 .gitignore', '没有 .gitignore。勇者，或者第一次', -5),
      ];
    }
    const f = snap.files.get('.gitignore')!;
    const rules = f.content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
    if (rules > 40) {
      return [
        verdict(
          'structure.gitignore',
          `.gitignore 含 ${rules} 条规则`,
          '忽略规则数量远超项目实际生态位，疑似模板批发',
          +5,
        ),
      ];
    }
    return [verdict('structure.gitignore', `.gitignore 含 ${rules} 条规则`, '基本卫生习惯达标', 0)];
  },
};

export const structureRules: Rule[] = [
  utilFiles,
  indexFiles,
  dirDepth,
  licenseRule,
  emptyRepo,
  oversized,
  gitignoreRule,
];
