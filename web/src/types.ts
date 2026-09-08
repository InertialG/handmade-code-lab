/**
 * 本中心的核心数据结构。
 * 所有规则只允许读取 RepoSnapshot，不允许做任何 IO。
 */

export interface FileEntry {
  /** 相对仓库根目录的路径，例如 `src/main.ts` */
  path: string;
  /** 文本内容（二进制文件在快照阶段已被丢弃） */
  content: string;
  /** 行数 */
  lines: number;
  /** 小写扩展名，不含点；无扩展名时为空字符串 */
  ext: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601 字符串 */
  date: string;
  /** 仅最近若干条提交会补齐 */
  additions?: number;
  deletions?: number;
  /** 该提交涉及的文件数（若已补齐） */
  changedFiles?: number;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  /** 实际检测的分支 */
  branch: string;
  /** 用于缓存与种子的 sha（通常是 HEAD 提交 sha，取不到时退化为分支名） */
  sha: string;
  defaultBranch: string;
  /** GitHub 报告的仓库体积，单位 KB */
  sizeKb: number;
  createdAt: string;
  stars: number;
  language: string | null;
}

export interface RepoSnapshot {
  meta: RepoMeta;
  commits: CommitInfo[];
  files: Map<string, FileEntry>;
  /** 因为体积/数量限制被跳过的文件数，仅用于展示 */
  skippedFiles: number;
  /** 是否因为仓库过大而没有下载代码 */
  tooLarge: boolean;
}

export interface Verdict {
  ruleId: string;
  /** 证据，例如 "发现 17 处 `data`、9 处 `result`" */
  evidence: string;
  /** 判词 */
  remark: string;
  /** 对 AI 分数的影响，可正可负 */
  delta: number;
  /** 权重，默认 1 */
  weight?: number;
  /** 是否高亮（直接命中类证据） */
  highlight?: boolean;
}

export interface Rule {
  id: string;
  /** 进度条上显示的名字，例如 "正在分析变量命名" */
  name: string;
  run(snap: RepoSnapshot): Verdict[];
}
