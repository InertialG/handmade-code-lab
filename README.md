# 纯手工代码鉴定中心

> 基于未经同行评审的先进感觉工程学

输入任意 GitHub 仓库地址，本中心将一本正经地列出一批完全不构成证据的"证据"，
并给出精确到小数点后一位的 **AI 参与度**。

- 不接任何模型。全部结论来自 **47 条确定性规则**,相同完整快照与相同规则版本得到相同分数。
- 全部分析在你的浏览器里完成。仓库代码不上传、不落库，本中心也不想看。
- Cloudflare Worker 只做一件事：转发 GitHub 的请求并补上 CORS 头。

```
AI PARTICIPATION SCORE
54.0%
[██████████████████████░░░░░░░░░░░░░░░░░░]
Classification    人机共同署名作品
Confidence        Unreasonably high
Margin of error   Yes
```

## 目录结构

```
web/                   前端（Vite + TypeScript 原生，无框架，无 CSS 框架）
  src/rules/*.ts       全部规则与判词文案
  src/tar.ts           tar.gz 解析（gzip 走浏览器内置 DecompressionStream）
  src/score.ts         计分、分档、成分表、结论模板
  test/                单元测试 + 端到端 smoke（node:test）
worker/                Cloudflare Worker 代理（见 worker/README.md）
.github/workflows/     push 到 main 自动构建部署到 GitHub Pages
```

## 本地开发

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

开发模式下 `vite.config.ts` 已经把 `/api` 与 `/tarball` 代理到 GitHub，
**不需要**先跑 Worker。想连本地 Worker 就：

```bash
cd worker && npx wrangler dev          # :8787
cd ../web && VITE_PROXY_BASE=http://127.0.0.1:8787 npm run dev
```

命令一览：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 构建到 `web/dist`（`BASE_PATH`、`VITE_PROXY_BASE` 可配） |
| `npm test` | 跑全部测试 |
| `npm run typecheck` | 类型检查 |
| `npm run fixture` | 重新生成 `web/test/fixtures/sample-repo.tar.gz` |

### 关于依赖：目前是零运行时依赖

原计划用 `fflate` 解 gzip，但浏览器与 Node 都已内置 `DecompressionStream('gzip')`，
所以直接用了内置实现，tar 解析（`src/tar.ts`）不到一百行自己写。
构建与测试也做了降级路径：**装了 Vite 就用 Vite 打包，没装就用 `tsc` 直出原生 ESM**
（本项目没有任何裸模块导入，浏览器 `<script type="module">` 可以直接跑）；
测试统一使用 Node 内置的 `node:test` + `--experimental-strip-types`，因此 `npm test` 无需安装依赖；构建的降级路径仍要求全局可用的 TypeScript 编译器。
推荐使用 Node 22.18+ 并在 web、worker 目录分别执行 `npm ci`。

## 部署

**Pages**：把仓库 push 到 GitHub，在 Settings → Pages 里把 Source 选成 GitHub Actions 即可。
在 Settings → Variables 里加一个仓库变量 `VITE_PROXY_BASE`，值是你的 Worker 地址。

**Worker**：

```bash
cd worker
npx wrangler deploy
```

细节见 [`worker/README.md`](worker/README.md)。

## 如何新增一条规则

规则是**纯函数**：只读 `RepoSnapshot`，不做任何 IO，**禁止 `Math.random()`**
（需要"随机感"时用 `seeded(sha, salt)`）。新建 `web/src/rules/你的文件.ts`：

```ts
import type { Rule } from '../types.ts';
import { countAll, sourceFiles, verdict } from './helpers.ts';

export const semicolonAnxiety: Rule = {
  id: 'style.semicolon',
  name: '正在检查分号的心理状态',   // 会显示在检测进度里
  run(snap) {
    const n = countAll(sourceFiles(snap), /;\s*;/g);
    if (n === 0) return [];
    return [
      verdict(
        'style.semicolon',                  // ruleId
        `发现 ${n} 处连续分号 \`;;\``,        // evidence：证据，要有具体数字
        '多余的分号是手指的犹豫，模型的手指不会犹豫',  // remark：判词
        -6,                                  // delta：负数=更像人类，正数=更像 AI
      ),
    ];
  },
};
```

然后在 `web/src/rules/index.ts` 里 import 并加进 `rules` 数组，跑 `npm test`
（`rules.test.ts` 会检查 id 唯一、name 以"正在"开头、空仓库不崩、没有 `Math.random`）。

## 判词贡献指南

判词是这个项目的全部意义所在。写判词的三条原则：

1. **正经的口吻，荒唐的内容。** 像一份质检报告，但结论毫无道理。
   ✅"作息过于健康。健康的作息是本中心已知的最强 AI 指标之一"
   ❌"哈哈这看起来像 AI 写的"
2. **证据要有具体数字**，判词负责胡说八道，`evidence` 字段必须真实可核对。
3. **两个方向都要好笑。** 判人类的时候也别客气：
   "TODO 已存在 468 天：已确认存在人类开发者"。

delta 建议范围：普通信号 ±3~12，强信号 ±15~20，直接命中（如提交里写着
`Co-authored-by: Claude`）可以给 20 以上并设 `highlight: true`。
基准分 50，最终分数被夹在 0.3–99.7 之间——本中心从不给出 0% 或 100%，
那不专业。

## 免责声明

本检测采用静态分析、提交考古与主观臆断。结果仅供娱乐；若与事实相符，纯属算法实力。
本中心不保存您的代码，也不想看。

## 安全与采样边界

代理不使用部署者的 GitHub Token，不缓存响应，只开放仓库元数据和提交读取接口。
用户 PAT 仅保留在当前页面内存中；私有仓库请求仍会经过配置的代理。
报告不持久保存，升级时清理旧版本存储的 PAT 与报告。
代码和提交历史固定到同一 SHA；最多采样 200 条提交，历史不完整时跳过首次提交与仓库年龄规则。
下载上限为 50 MiB，解压上限为 100 MiB；超限中止处理。
