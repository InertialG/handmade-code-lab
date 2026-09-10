/** 报告落盘：data/reports/<卷宗号>.json。几 KB 一份，不做清理。 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hash32 } from '../web/src/seeded.ts';
import type { Report } from '../web/src/analyze.ts';

export const CASE_ID = /^HCL-[0-9A-F]{10}$/;
const RULES_DIR = fileURLToPath(new URL('../web/src/rules/', import.meta.url));
/** 规则源码的哈希：规则一改，旧报告不再当缓存用，但仍可按卷宗号查阅。 */
export const RULES_HASH = readdirSync(RULES_DIR).sort()
  .reduce((h, f) => (hash32(`${h}:${readFileSync(RULES_DIR + f, 'utf8')}`)), 0).toString(16);

export interface Stored { rulesHash: string; report: Report }

export class Store {
  private dir: string;
  constructor(dir: string) { this.dir = dir; mkdirSync(dir, { recursive: true }); }
  async read(id: string): Promise<Stored | null> {
    if (!CASE_ID.test(id)) return null;
    try { return JSON.parse(await readFile(`${this.dir}/${id}.json`, 'utf8')) as Stored; } catch { return null; }
  }
  /** 只有规则版本一致的存档才算缓存命中 */
  async fresh(id: string): Promise<Report | null> {
    const s = await this.read(id);
    return s && s.rulesHash === RULES_HASH ? s.report : null;
  }
  async write(report: Report): Promise<void> {
    const body: Stored = { rulesHash: RULES_HASH, report };
    await writeFile(`${this.dir}/${report.caseId}.json`, JSON.stringify(body));
  }
}
