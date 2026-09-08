/**
 * 极简 tar(.gz) 解析。
 * gzip 解压使用浏览器与 Node 都内置的 DecompressionStream，
 * 因此本项目连 fflate 都不需要（详见 README 的"依赖"一节）。
 */

export interface TarEntry {
  name: string;
  size: number;
  /** '0' 普通文件、'5' 目录、'L' GNU long name 等 */
  type: string;
  data: Uint8Array;
}

export async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前运行环境不支持 DecompressionStream，无法解压 tar.gz');
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([input as unknown as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

const dec = new TextDecoder();

function readString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && buf[end] !== 0) end++;
  return dec.decode(buf.subarray(offset, end));
}

function readOctal(buf: Uint8Array, offset: number, length: number): number {
  const s = readString(buf, offset, length).trim().replace(/[^0-7]/g, '');
  if (!s) return 0;
  return parseInt(s, 8) || 0;
}

/** 解析未压缩的 tar 字节流。 */
export function untar(buf: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longName: string | null = null;

  while (offset + 512 <= buf.length) {
    // 连续两个空块表示结束
    let empty = true;
    for (let i = offset; i < offset + 512; i++) {
      if (buf[i] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;

    const nameField = readString(buf, offset, 100);
    const size = readOctal(buf, offset + 124, 12);
    const typeflag = readString(buf, offset + 156, 1) || '0';
    const prefix = readString(buf, offset + 345, 155);

    let name = prefix ? `${prefix}/${nameField}` : nameField;
    if (longName !== null) {
      name = longName;
      longName = null;
    }

    const dataStart = offset + 512;
    const dataEnd = Math.min(dataStart + size, buf.length);
    const data = buf.subarray(dataStart, dataEnd);

    if (typeflag === 'L') {
      // GNU long name：内容就是下一个条目的文件名
      longName = dec.decode(data).replace(/\0+$/, '');
    } else if (typeflag === 'K' || typeflag === 'x' || typeflag === 'g') {
      // long link name / pax 头，忽略
    } else {
      entries.push({ name, size, type: typeflag, data });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export async function untarGz(gz: Uint8Array): Promise<TarEntry[]> {
  return untar(await gunzip(gz));
}

/** 去掉 codeload tarball 的顶层目录（`owner-repo-sha/`）。 */
export function stripRootDir(name: string): string {
  const idx = name.indexOf('/');
  return idx === -1 ? '' : name.slice(idx + 1);
}
