import type { Rule } from '../types.ts';
import { namingRules } from './naming.ts';
import { errorRules } from './errors.ts';
import { sizeRules } from './size.ts';
import { commentRules } from './comments.ts';
import { readmeRules } from './readme.ts';
import { testRules } from './tests.ts';
import { commitRules } from './commits.ts';
import { structureRules } from './structure.ts';
import { configRules } from './config.ts';
import { langRules } from './langs.ts';

/**
 * 全部规则。顺序即"检测流程"的显示顺序，改动会改变进度行的顺序，
 * 但不会改变最终分数（分数只由 delta 之和决定）。
 */
export const rules: Rule[] = [
  ...structureRules,
  ...namingRules,
  ...errorRules,
  ...sizeRules,
  ...commentRules,
  ...readmeRules,
  ...testRules,
  ...langRules,
  ...configRules,
  ...commitRules,
];

export function ruleById(id: string): Rule | undefined {
  return rules.find((r) => r.id === id);
}
