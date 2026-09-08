import type { Rule } from '../types.ts';
import { countMatches, findFile, sourceFiles, totalLines, verdict } from './helpers.ts';

function readme(snap: Parameters<Rule['run']>[0]) {
  return findFile(snap, (p) => /^readme(\.[a-z]+)?$/i.test(p));
}

export const readmeRatio: Rule = {
  id: 'readme.ratio',
  name: '正在称量 README 与代码的比重',
  run(snap) {
    const r = readme(snap);
    if (!r) {
      return [
        verdict('readme.ratio', '未找到 README', '没有 README。作者认为代码即文档，这是一种信仰', -7),
      ];
    }
    const code = Math.max(totalLines(sourceFiles(snap)), 1);
    const ratio = r.lines / code;
    const evidence = `README ${r.lines} 行 / 源码 ${code} 行（比值 ${ratio.toFixed(3)}）`;
    if (r.lines <= 3) {
      return [
        verdict('readme.ratio', evidence, '人类开源项目典型症状：README 只有一个标题和一行谦辞', -10),
      ];
    }
    if (ratio > 0.35) {
      return [
        verdict('readme.ratio', evidence, 'README 解释了每一个按钮，包括那个还没写的按钮', +11),
      ];
    }
    if (ratio > 0.12) {
      return [verdict('readme.ratio', evidence, '文档热情高于行业平均水平，AI 嫌疑 +5%', +5)];
    }
    return [verdict('readme.ratio', evidence, 'README 长度克制，符合人类惜字如金的传统', -3)];
  },
};

export const readmeStyle: Rule = {
  id: 'readme.style',
  name: '正在鉴定 README 的排版气质',
  run(snap) {
    const r = readme(snap);
    if (!r) return [];
    const out = [];
    const emojiHeads = countMatches(
      r.content,
      /^#{1,3}\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gmu,
    );
    const featureHead = /^#{1,3}\s*(Features|✨|🚀|Getting Started|Installation|快速开始|特性)/gim.test(
      r.content,
    );
    if (emojiHeads >= 2 || featureHead) {
      out.push(
        verdict(
          'readme.style',
          `README 含 ${emojiHeads} 个 emoji 标题${featureHead ? '，并具备标准 "## Features" 段落' : ''}`,
          '结构工整、分节完备、emoji 位置精准。人类写 README 时不会这么冷静',
          +9,
        ),
      );
    }
    const badges = countMatches(r.content, /!\[[^\]]*\]\(https?:\/\/[^)]*(badge|shields\.io)[^)]*\)/gi);
    if (badges > 5) {
      out.push(
        verdict(
          'readme.badges',
          `README 顶部悬挂 ${badges} 枚徽章`,
          '徽章数量超过实际功能数量，这是一种需要被理解的行为，但依然 +7%',
          +7,
        ),
      );
    } else if (badges > 0) {
      out.push(verdict('readme.badges', `README 含 ${badges} 枚徽章`, '徽章使用适度，未构成炫耀', 0));
    }
    return out;
  },
};

export const readmeRules: Rule[] = [readmeRatio, readmeStyle];
