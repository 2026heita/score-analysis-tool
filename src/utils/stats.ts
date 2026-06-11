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

  const quantile = (q: number): number => {
    const pos = (validCount - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (cleanValues[base + 1] !== undefined) {
      return cleanValues[base] + rest * (cleanValues[base + 1] - cleanValues[base]);
    }

    return cleanValues[base];
  };

  return {
    count: validCount,
    validCount,
    invalidCount,
    max: cleanValues[validCount - 1],
    min: cleanValues[0],
    mean,
    median: quantile(0.5),
    q25: quantile(0.25),
    q75: quantile(0.75),
    q90: quantile(0.9),
    q95: quantile(0.95),
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
