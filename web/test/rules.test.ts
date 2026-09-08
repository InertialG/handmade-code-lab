import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rules } from '../src/rules/index.ts';
import { genericNames, humanSuffixNames, numberedNames } from '../src/rules/naming.ts';
import { emptyCatch } from '../src/rules/errors.ts';
import { aiComments, todoMarkers } from '../src/rules/comments.ts';
import { testPresence } from '../src/rules/tests.ts';
import { aiCoauthor, conventionalCommits } from '../src/rules/commits.ts';
import { aiToolArtifacts } from '../src/rules/config.ts';
import { longFiles, blankLineRatio } from '../src/rules/size.ts';
import { rootJunk } from '../src/rules/structure.ts';
import { magicNumbers } from '../src/rules/langs.ts';
import { aiCompletions } from '../src/rules/commits.ts';
import { commit, file, snapshot } from './factory.ts';

describe('规则总表', () => {
  it('至少 25 条规则且 id 唯一', () => {
    assert.ok(rules.length >= 25, `只有 ${rules.length} 条规则`);
    assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  });

  it('每条规则都有中文进度名', () => {
    for (const r of rules) {
      assert.ok(r.name.length > 0, `${r.id} 缺少 name`);
      assert.match(r.name, /^正在/, `${r.id} 的 name 不符合"正在…"格式`);
    }
  });

  it('源码中不存在 Math.random', () => {
    // 规则必须是确定性纯函数
    for (const r of rules) {
      assert.doesNotMatch(r.run.toString(), /Math\.random/, `${r.id} 使用了 Math.random`);
    }
  });

  it('对空仓库不会崩溃', () => {
    const snap = snapshot([], []);
    for (const r of rules) assert.doesNotThrow(() => r.run(snap), r.id);
  });
});

describe('naming', () => {
  it('泛名密度高时加分', () => {
    const src = Array.from({ length: 20 }, (_, i) => `const data${i} = result; // temp value obj`).join('\n');
    const [vd] = genericNames.run(snapshot([file('src/a.ts', src)]));
    assert.ok(vd);
    assert.ok(vd.delta > 0, `delta=${vd.delta}`);
  });

  it('_final / _v2 类命名减分', () => {
    const [vd] = humanSuffixNames.run(
      snapshot([file('src/a.ts', 'const config_final = 1;\nconst config_v2 = 2;\nlet x_backup = 3;')]),
    );
    assert.ok(vd && vd.delta < 0);
  });

  it('data2/list3 式命名减分,但版本号不算', () => {
    const [vd] = numberedNames.run(
      snapshot([file('src/a.ts', 'const data2 = 1;\nconst list3 = 2;\nconst utf8 = "x";\nconst es2022 = 0;')]),
    );
    assert.ok(vd, '应触发 numbered 规则');
    assert.ok(vd.delta < 0, `delta=${vd.delta}`);
  });

  it('没有 data2 式命名时不触发', () => {
    assert.deepEqual(
      numberedNames.run(snapshot([file('src/a.ts', 'const data = 1;\nconst utf8 = "x";\nconst es2022 = 0;')])),
      [],
    );
  });
});

describe('errors', () => {
  it('空 catch 判为人类', () => {
    const [vd] = emptyCatch.run(
      snapshot([file('src/a.js', 'try { go(); } catch (e) {}\ntry { go(); } catch {}')]),
    );
    assert.ok(vd);
    assert.ok(vd.delta < 0);
    assert.match(vd.evidence, /2 处/);
  });
});

describe('comments', () => {
  it('模型口癖大幅加分并高亮', () => {
    const [vd] = aiComments.run(snapshot([file('src/a.ts', "// Certainly! Here's the updated function")]));
    assert.ok(vd);
    assert.ok(vd.delta >= 12);
    assert.equal(vd.highlight, true);
  });

  it('代码里的字符串字面量不算口癖', () => {
    // 词表本身写在源码里，不能反过来把规则文件判成 AI
    assert.deepEqual(aiComments.run(snapshot([file('src/a.ts', "const P = ['Certainly', 'Let me'];")])), []);
  });

  it('TODO 数量参与判定', () => {
    const [vd] = todoMarkers.run(
      snapshot(
        [file('src/a.ts', '// TODO: 修\n// FIXME: 也修\n// HACK\n// XXX\n// TODO 再修')],
        [commit({ date: '2024-03-01T00:00:00Z' }), commit({ sha: 'b', date: '2024-01-01T00:00:00Z' })],
      ),
    );
    assert.ok(vd && vd.delta < 0);
    assert.match(vd.remark, /已存在 60 天/);
  });
});

describe('tests / size', () => {
  it('没有测试则判为人类自信', () => {
    const [vd] = testPresence.run(snapshot([file('src/a.ts', 'export const a = 1;')]));
    assert.ok(vd && vd.delta <= -10);
  });

  it('超长文件加分', () => {
    const [vd] = longFiles.run(snapshot([file('src/big.ts', 'const x = 1;\n'.repeat(900))]));
    assert.ok(vd && vd.delta > 0);
    assert.match(vd.evidence, /src\/big\.ts/);
  });

  it('空行过多判为人类式喘气', () => {
    const body = Array.from({ length: 40 }, (_, i) => (i % 2 ? '' : `const a${i}=1;`)).join('\n');
    const [vd] = blankLineRatio.run(snapshot([file('src/a.ts', body)]));
    assert.ok(vd && vd.delta < 0, `delta=${vd && vd.delta}`);
  });

  it('空行几乎为零判为 AI', () => {
    const [vd] = blankLineRatio.run(snapshot([file('src/a.ts', Array.from({ length: 40 }, () => 'const x=1;').join('\n'))]));
    assert.ok(vd && vd.delta > 0, `delta=${vd && vd.delta}`);
  });
});

describe('structure 新规则', () => {
  it('根目录备份/压缩包判为人类', () => {
    const [vd] = rootJunk.run(
      snapshot([
        file('src/a.ts', 'export const a=1;'),
        file('backup.zip', 'x'),
        file('notes.old', 'x'),
      ]),
    );
    assert.ok(vd && vd.delta < 0, `delta=${vd && vd.delta}`);
    assert.match(vd.evidence, /backup\.zip/);
  });

  it('无根目录垃圾则不触发', () => {
    assert.deepEqual(
      rootJunk.run(snapshot([file('src/a.ts', 'export const a=1;')])),
      [],
    );
  });
});

describe('langs 新规则', () => {
  it('裸奔魔法数字判为人类', () => {
    const [vd] = magicNumbers.run(
      snapshot([file('src/a.ts', 'const SECONDS = 86400;\nconst TIMEOUT = 30000;')]),
    );
    assert.ok(vd && vd.delta < 0, `delta=${vd && vd.delta}`);
  });
});

describe('commits / config', () => {
  it('Co-authored-by 直接命中', () => {
    const [vd] = aiCoauthor.run(
      snapshot([], [commit({ message: 'feat: x\n\nCo-authored-by: Claude <noreply@anthropic.com>' })]),
    );
    assert.ok(vd);
    assert.ok(vd.delta >= 20);
    assert.equal(vd.highlight, true);
  });

  it('100% Conventional Commits 加分', () => {
    const cs = ['feat: a', 'fix: b', 'docs: c', 'chore: d', 'refactor: e'].map((m, i) =>
      commit({ sha: `s${i}`, message: m }),
    );
    const [vd] = conventionalCommits.run(snapshot([], cs));
    assert.ok(vd && vd.delta > 0);
    assert.match(vd.evidence, /100\.0%/);
  });

  it('AI 工具配置残留被检出', () => {
    const [vd] = aiToolArtifacts.run(snapshot([file('CLAUDE.md', '# 指南'), file('.cursorrules', 'x')]));
    assert.ok(vd);
    assert.ok(vd.delta > 15);
    assert.equal(vd.highlight, true);
  });

  it('AI 提交完成语被检出并高亮', () => {
    const cs = ['feat: x', 'Implemented the fix', 'This commit addresses the issue', 'done'].map((m, i) =>
      commit({ sha: `s${i}`, message: m }),
    );
    const [vd] = aiCompletions.run(snapshot([], cs));
    assert.ok(vd);
    assert.ok(vd.delta >= 8);
    assert.equal(vd.highlight, true);
  });
});
