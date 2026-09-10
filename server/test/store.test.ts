import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RULES_HASH, Store } from '../store.ts';
import type { Report } from '../../web/src/analyze.ts';

test('存档按卷宗号读写，规则版本不同则不算缓存', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcl-store-'));
  try {
    const store = new Store(dir);
    const report = { caseId: 'HCL-0123456789', repo: 'o/r', score: 1 } as Report;
    assert.equal(await store.read('HCL-0123456789'), null);
    assert.equal(await store.read('../etc/passwd'), null);
    await store.write(report);
    assert.deepEqual((await store.read('HCL-0123456789'))?.report, report);
    assert.deepEqual(await store.fresh('HCL-0123456789'), report);
    assert.match(RULES_HASH, /^[0-9a-f]+$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
