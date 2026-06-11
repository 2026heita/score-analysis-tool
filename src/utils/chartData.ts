/**
 * 图表数据整理工具函数
 */

export interface BinData {
  start: number;
  end: number;
  count: number;
  label: string;
}

export interface CdfPoint {
  value: number;
  percentile: number;
}

export function generateBins(values: number[], binCount: number): BinData[] {
  if (!values || values.length === 0) return [];

  const cleanValues = values.filter(v => Number.isFinite(v));
  if (cleanValues.length === 0) return [];

  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);

  if (min === max) {
    return [{ start: min, end: max, count: cleanValues.length, label: `${min}` }];
  }

  const binWidth = (max - min) / binCount;
  const bins: BinData[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * binWidth;
    const end = start + binWidth;
    return { start, end, count: 0, label: `${formatValue(start)}~${formatValue(end)}` };
  });

  cleanValues.forEach(v => {
    let index = Math.floor((v - min) / binWidth);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    bins[index].count++;
  });

  return bins;
}

export function generateCdf(values: number[]): CdfPoint[] {
  if (!values || values.length === 0) return [];

  const sorted = [...values.filter(v => Number.isFinite(v))].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const total = sorted.length;

  return sorted.map((v, i) => ({
    value: v,
    percentile: ((i + 1) / total) * 100,
  }));
}

/**
 * 计算字段内百分位：低于该值人数 / 有效人数 * 100
 */
export function calculateFieldPercentile(values: number[], inputValue: number): number {
  if (!values || values.length === 0) return 0;
  const cleanValues = values.filter(v => Number.isFinite(v));
  if (cleanValues.length === 0) return 0;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;
  return (lowerCount / cleanValues.length) * 100;
}

/**
 * 标准化分数：实际分 / 满分 * 100
 */
export function normalizeScore(score: number, maxScore: number): number {
  if (maxScore <= 0 || !Number.isFinite(score) || !Number.isFinite(maxScore)) return 0;
  return (score / maxScore) * 100;
}

/**
 * 根据字段名推断满分值，用于坐标轴范围优化
 */
export function inferFieldMax(fieldName: string, values: number[]): number {
  const cleanValues = (values || []).filter(v => Number.isFinite(v));

  if (fieldName.includes('总分') || fieldName.includes('总分合计')) return 750;
  if (fieldName.includes('语文数学两科之和') || fieldName.includes('语数之和') || fieldName.includes('两科之和')) return 300;
  if (fieldName.includes('语文或数学单科最高') || fieldName.includes('单科最高')) return 150;
  if (fieldName.includes('外语') || fieldName.includes('英语')) return 150;
  if (fieldName.includes('首选') || fieldName.includes('再选')) return 100;

  if (cleanValues.length === 0) return 100;
  return Math.ceil(Math.max(...cleanValues) / 10) * 10;
}

export function formatNumber(val: number): string {
  if (!Number.isFinite(val)) return '-';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(2);
}

function formatValue(val: number): string {
  if (!Number.isFinite(val)) return '-';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1);
}
