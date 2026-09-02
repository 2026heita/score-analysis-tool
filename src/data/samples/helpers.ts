/**
 * 示例数据确定性生成辅助
 *
 * 所有示例必须 deterministic（每次生成结果完全一致），以便测试断言固定值。
 * 因此这里不使用 Math.random，也不引入任何随机库。
 */

/**
 * 基于正弦哈希的确定性伪随机函数，返回 [0, 1) 区间。
 * 由 (index, salt) 唯一决定输出，任何时刻重跑结果一致。
 */
export function seededNoise(index: number, salt = 0): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** 保留 2 位小数 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 保留 1 位小数 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}