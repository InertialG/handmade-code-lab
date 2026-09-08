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
    if (files.length <= 2) {
      return [
        verdict(
          'structure.utils',
          `发现 ${files.length} 个 utils/helpers 类文件,例如 \`${files.map((f) => f.path).sort()[0]}\``,
          '`utils` 是最常见的归类,人类和模型都会这么干,本中心认为这条线索不构成任何证据',
          0,
        ),
      ];
    }
    return [
      verdict(
        'structure.utils',
        `发现 ${files.length} 个 utils/helpers 类文件,例如 \`${files.map((f) => f.path).sort()[0]}\``,
        files.length > 8
          ? '`utils` 文件夹已经大到本身就是一个待重构项目。模型会把它拆成 services、lib、core……此处没有,人类嫌疑上升'
          : '`utils` 文件夹开始膨胀。模型通常在第一版就会分门别类,人类的杂物则随时间自然堆积',
        -Math.min(10, 2 + files.length),
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
          `最深目录层级 ${max} 层,平均 ${avg.toFixed(1)} 层`,
          '目录深到每个文件都要写一遍自己的家庭住址。模型会把这种热情用在别处',
          +6,
        ),
      ];
    }
    if (avg < 0.6) {
      return [
        verdict(
          'structure.depth',
          `平均目录层级仅 ${avg.toFixed(1)} 层`,
          '所有文件平铺在根目录。模型会害羞地建一个 src,人类则把 src 也省了',
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
          '没有许可证:一种"先跑了再说"的态度。模型没有资格跑,因为它哪儿也去不了',
          -6,
        ),
      ];
    }
    if (licenses.length > 1) {
      return [
        verdict(
          'structure.license',
          `发现 ${licenses.length} 个许可证文件:${licenses.map((f) => f.path).sort().join('、')}`,
          '多份许可证并列,作者大概想把自己同时卖给所有人。本中心不予置评',
          0,
        ),
      ];
    }
    return [
      verdict(
        'structure.license',
        `存在 \`${licenses[0]!.path}\``,
        '许可证齐备:一种"我连法律风险都替你考虑好了"的热情。模型也爱这么干',
        +2,
      ),
    ];
  },
};

export const emptyRepo: Rule = {
  id: 'structure.empty',
  name: '正在确认仓库内是否真的有东西',
  run(snap) {
    const files = allFiles(snap);
    const nonDoc = files.filter((f) => !/^(readme|license|licence|\.gitignore)/i.test(f.path));
    if (files.length === 0) {
      return [
        verdict(
          'structure.empty',
          '未提取到任何可读文件',
          '本中心拒绝鉴定空气。连模型都不至于提交一个空仓库',
          0,
          { highlight: true },
        ),
      ];
    }
    if (nonDoc.length === 0) {
      return [
        verdict(
          'structure.empty',
          `仓库仅含 ${files.length} 个说明性文件,无源代码`,
          '本中心拒绝鉴定空气:这里有 README、有 LICENSE,唯独没有代码,像个装修完没入住的样板间',
          0,
          { highlight: true },
        ),
      ];
    }
    return [];
  },
};

export const gitignoreRule: Rule = {
  id: 'structure.gitignore',
  name: '正在阅读 .gitignore',
  run(snap) {
    if (!hasFile(snap, (p) => p === '.gitignore')) {
      return [
        verdict('structure.gitignore', '不存在 .gitignore', '没有 .gitignore。要么是勇者,要么是第一次用 git', -5),
      ];
    }
    const f = snap.files.get('.gitignore')!;
    const rules = f.content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
    if (rules > 40) {
      return [
        verdict(
          'structure.gitignore',
          `.gitignore 含 ${rules} 条规则`,
          '忽略规则多到像是从某模板仓库原样搬来的。人类一般只记得 node_modules 和 .env',
          +5,
        ),
      ];
    }
    return [verdict('structure.gitignore', `.gitignore 含 ${rules} 条规则`, '基本卫生习惯达标', 0)];
  },
};

export const rootJunk: Rule = {
  id: 'structure.root-junk',
  name: '正在清点根目录的杂物',
  run(snap) {
    const files = allFiles(snap);
    const junk = files.filter(
      (f) =>
        !f.path.includes('/') &&
        /\.(bak|old|orig|tmp|swp|log|zip|rar|7z|tar|gz|out)$/i.test(f.path),
    );
    if (junk.length === 0) return [];
    return [
      verdict(
        'structure.root-junk',
        `根目录散落 ${junk.length} 个备份/压缩包:${junk.map((f) => f.path).sort().slice(0, 4).join('、')}${junk.length > 4 ? ' 等' : ''}`,
        '压缩包和 .bak 是数字时代的人类化石。模型从不需要备份,因为它不会后悔',
        -Math.min(12, 3 + junk.length),
      ),
    ];
  },
};

export const structureRules: Rule[] = [
  utilFiles,
  indexFiles,
  dirDepth,
  licenseRule,
  rootJunk,
  emptyRepo,
  gitignoreRule,
];
