import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzip, stripRootDir, untar, untarGz } from '../src/tar.ts';
import { filesFromTarEntries } from '../src/snapshot.ts';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/sample-repo.tar.gz');

describe('tar', () => {
  it('stripRootDir 去掉顶层目录', () => {
    assert.equal(stripRootDir('owner-repo-abc123/src/main.ts'), 'src/main.ts');
    assert.equal(stripRootDir('owner-repo-abc123/'), '');
    assert.equal(stripRootDir('nodir'), '');
  });

  it('能解压并解析 fixture', async () => {
    const gz = new Uint8Array(readFileSync(FIXTURE));
    const raw = await gunzip(gz);
    assert.equal(raw.length % 512, 0);
    const entries = untar(raw);
    const names = entries.map((e) => stripRootDir(e.name)).sort();
    assert.deepEqual(names, [
      '.gitignore',
      'LICENSE',
      'README.md',
      'assets/blob.bin',
      'package.json',
      'src/index.js',
      'src/utils.js',
      'test/index.test.js',
    ]);
  });

  it('条目内容与大小一致', async () => {
    const entries = await untarGz(new Uint8Array(readFileSync(FIXTURE)));
    const pkg = entries.find((e) => e.name.endsWith('package.json'))!;
    assert.equal(pkg.data.length, pkg.size);
    assert.match(new TextDecoder().decode(pkg.data), /"name": "sample-repo"/);
  });

  it('过滤掉二进制与锁文件', async () => {
    const entries = await untarGz(new Uint8Array(readFileSync(FIXTURE)));
    const { files, skipped } = filesFromTarEntries(entries);
    assert.equal(files.has('assets/blob.bin'), false);
    assert.equal(skipped, 1);
    assert.equal(files.size, 7);
    assert.equal(files.get('src/index.js')!.ext, 'js');
  });
});
