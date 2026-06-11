import type { StatsResult, PositionResult } from '../types';

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
 * 从原始行数据中提取数值数组
 * 返回 values（有效数值）、invalidCount（无效/空值数）、totalRows（总行数）
 */
export function getNumericValues(
  rows: Record<string, string>[],
  fieldName: string,
): { values: number[]; invalidCount: number; totalRows: number } {
  const totalRows = rows.length;
  let invalidCount = 0;
  const values: number[] = [];

  rows.forEach(row => {
    const raw = row[fieldName];
    const num = parseFloat(raw);
    if (Number.isFinite(num)) {
      values.push(num);
    } else {
      invalidCount++;
    }
  });

  return { values, invalidCount, totalRows };
}

export function calculateStats(values: (number | null)[], totalRows: number): StatsResult | null {
  const cleanValues = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);

  const validCount = cleanValues.length;
  const invalidCount = totalRows - validCount;

  if (validCount === 0) {
    return null;
  }

  const sum = cleanValues.reduce((acc, v) => acc + v, 0);
  const mean = sum / validCount;

  return {
    count: validCount,
    validCount,
    invalidCount,
    max: cleanValues[validCount - 1],
    min: cleanValues[0],
    mean,
    median: calculateQuantile(cleanValues, 0.5),
    q25: calculateQuantile(cleanValues, 0.25),
    q75: calculateQuantile(cleanValues, 0.75),
    q90: calculateQuantile(cleanValues, 0.9),
    q95: calculateQuantile(cleanValues, 0.95),
  };
}

export function calculatePosition(values: number[], inputValue: number): PositionResult {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;

  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;

  const bestRank = higherCount + 1;
  const worstRank = higherCount + equalCount;

  // 百分位口径：低于该值人数 / 有效人数 * 100
  const percentile = total === 0 ? 0 : (lowerCount / total) * 100;

  return {
    total,
    higherCount,
    equalCount,
    lowerCount,
    bestRank,
    worstRank,
    estimatedRank: higherCount + 1,
    percentile,
    existsInData: equalCount > 0,
  };
}
