/**
 * 格式化数字：null/undefined/NaN 显示 "-"；整数显示整数；小数保留 2 位
 */
export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (!Number.isFinite(val)) return '-';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(2);
}

/**
 * 线性插值分位数算法（全项目统一使用）
 * - 先过滤无效值
 * - 升序排序
 * - pos = (n - 1) * q
 * - base = Math.floor(pos)
 * - rest = pos - base
 * - 如果 base + 1 存在：value[base] + rest * (value[base + 1] - value[base])
 * - 否则返回 value[base]
 *
 * @param values 原始数值数组（包含无效值会被自动过滤）
 * @param q 分位数比例 0 ~ 1
 */
export function calculateQuantile(values: number[], q: number): number {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return 0;
  const pos = (cleanValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (cleanValues[base + 1] !== undefined) {
    return cleanValues[base] + rest * (cleanValues[base + 1] - cleanValues[base]);
  }
  return cleanValues[base];
}

/**
 * 安全地求一组数值的最小值与最大值。
 *
 * 使用循环实现，不依赖 Math.min/max(...array) 展开，避免在大数组上触发
 * RangeError（Maximum call stack size exceeded）或引擎参数数量限制。
 *
 * 只处理非空数组：空数组返回 null，调用方需先明确处理空数组，
 * 不隐式依赖 Math.min(...[]) = Infinity / Math.max(...[]) = -Infinity。
 */
export function minMax(values: number[]): { min: number; max: number } | null {
  if (!values || values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
