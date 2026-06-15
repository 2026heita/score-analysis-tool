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
