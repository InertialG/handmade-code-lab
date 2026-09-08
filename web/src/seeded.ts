/**
 * 确定性伪随机。全项目禁止 Math.random()，
 * 需要"随机感"的地方一律用 commit sha 派生的种子哈希。
 */

/** FNV-1a 32 位哈希，返回无符号整数。 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    // 处理多字节字符的高位，保证中文文案也参与混合
    const hi = input.charCodeAt(i) >>> 8;
    if (hi) {
      h ^= hi;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h >>> 0;
}

/** 返回 [0, 1) 的确定性伪随机数。 */
export function seeded(sha: string, salt: string): number {
  const h = hash32(`${sha}::${salt}`);
  return h / 0x100000000;
}

/** 返回 [min, max] 的确定性整数。 */
export function seededInt(sha: string, salt: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(seeded(sha, salt) * (max - min + 1));
}

/** 从数组里确定性地挑一个元素。 */
export function seededPick<T>(sha: string, salt: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error('seededPick: 空数组');
  return items[seededInt(sha, salt, 0, items.length - 1)]!;
}
