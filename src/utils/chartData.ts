/**
 * 图表数据整理工具函数
 */
import { calculateQuantile, minMax, formatNumber as _formatNumber } from './stats';

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

  const mm = minMax(cleanValues);
  if (!mm) return [];

  const min = mm.min;
  const max = mm.max;

  if (min === max) {
    return [{ start: min, end: max, count: cleanValues.length, label: `${min}` }];
  }

  const binWidth = (max - min) / binCount;
  
  // 根据 binWidth 计算显示精度：确保相邻 bin 的边界在显示后能被区分
  const precision = calculatePrecisionForBinWidth(binWidth);
  
  const bins: BinData[] = Array.from({ length: binCount }, (_, i) => {
    const start = min + i * binWidth;
    const end = start + binWidth;
    return { start, end, count: 0, label: `${formatValueFixed(start, precision)}~${formatValueFixed(end, precision)}` };
  });

  cleanValues.forEach(v => {
    let index = Math.floor((v - min) / binWidth);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    bins[index].count++;
  });

  return bins;
}

/**
 * 根据 binWidth 计算显示精度
 * 确保相邻 bin 的边界在显示后能被区分
 */
function calculatePrecisionForBinWidth(binWidth: number): number {
  if (!Number.isFinite(binWidth) || binWidth <= 0) return 2;
  
  // 找到 binWidth 的有效小数位
  // 例如：binWidth = 0.001 -> precision = 3
  // binWidth = 0.01 -> precision = 2
  // binWidth = 1 -> precision = 0
  // binWidth = 10 -> precision = 0
  
  // 取 binWidth 的 1/10 作为参考，确保能区分相邻 bin
  const ref = binWidth / 10;
  if (ref >= 1) return 0;
  if (ref <= 0) return 8;
  
  // 计算需要的小数位：-log10(ref) 向上取整
  const precision = Math.ceil(-Math.log10(ref));
  
  // 限制在 0-8 之间
  return Math.max(0, Math.min(8, precision));
}

/**
 * 使用固定精度格式化数值
 */
function formatValueFixed(val: number, precision: number): string {
  if (!Number.isFinite(val)) return '-';
  if (precision === 0) return Math.round(val).toString();
  return val.toFixed(precision);
}

/**
 * CDF 累积分布：按小于等于口径生成阶梯数据
 * percentile = count(v <= value) / total * 100
 * 
 * 合并相同 value，只保留该值最终累计比例，避免重复坐标
 */
export function generateCdf(values: number[]): CdfPoint[] {
  if (!values || values.length === 0) return [];

  const sorted = [...values.filter(v => Number.isFinite(v))].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const total = sorted.length;
  const result: CdfPoint[] = [];

  // 遍历排序后的数据，合并相同 value
  let i = 0;
  while (i < sorted.length) {
    const currentValue = sorted[i];
    // 找到最后一个等于当前值的位置
    let lastIdx = i;
    while (lastIdx < sorted.length - 1 && sorted[lastIdx + 1] === currentValue) {
      lastIdx++;
    }
    // percentile = 小于等于该值的人数 / total * 100
    const percentile = ((lastIdx + 1) / total) * 100;
    result.push({ value: currentValue, percentile });
    // 跳到下一个不同的值
    i = lastIdx + 1;
  }

  return result;
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
  const mm = minMax(cleanValues);
  return Math.ceil((mm ? mm.max : 0) / 10) * 10;
}

/** 计算四分位区间占比数据 */
export interface QuartileSegment {
  name: string;
  value: number; // count
  percentage: number;
  rangeText: string;
}

export interface QuartilePieData {
  segments: QuartileSegment[];
  q1: number;
  median: number;
  q3: number;
  isAllSame: boolean;
}

export function buildQuartilePieData(values: number[]): QuartilePieData | null {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return null;

  // 使用统一的 calculateQuantile
  const q1 = calculateQuantile(cleanValues, 0.25);
  const median = calculateQuantile(cleanValues, 0.5);
  const q3 = calculateQuantile(cleanValues, 0.75);
  const isAllSame = cleanValues[0] === cleanValues[cleanValues.length - 1];

  if (isAllSame) {
    return {
      segments: [
        { name: '全部数据相同', value: cleanValues.length, percentage: 100, rangeText: `${formatValue(cleanValues[0])}` },
      ],
      q1, median, q3, isAllSame: true,
    };
  }

  const total = cleanValues.length;
  let belowQ1 = 0, q1ToMed = 0, medToQ3 = 0, aboveQ3 = 0;

  cleanValues.forEach(v => {
    if (v < q1) belowQ1++;
    else if (v < median) q1ToMed++;
    else if (v < q3) medToQ3++;
    else aboveQ3++;
  });

  return {
    segments: [
      { name: '低于 Q1', value: belowQ1, percentage: (belowQ1 / total) * 100, rangeText: `< ${formatValue(q1)}` },
      { name: 'Q1 至中位数', value: q1ToMed, percentage: (q1ToMed / total) * 100, rangeText: `>= ${formatValue(q1)} 且 < ${formatValue(median)}` },
      { name: '中位数至 Q3', value: medToQ3, percentage: (medToQ3 / total) * 100, rangeText: `>= ${formatValue(median)} 且 < ${formatValue(q3)}` },
      { name: 'Q3 及以上', value: aboveQ3, percentage: (aboveQ3 / total) * 100, rangeText: `>= ${formatValue(q3)}` },
    ],
    q1, median, q3, isAllSame: false,
  };
}

function formatValue(val: number): string {
  if (!Number.isFinite(val)) return '-';
  if (Number.isInteger(val)) return val.toString();
  // 根据数值大小动态决定小数位数
  const absVal = Math.abs(val);
  if (absVal >= 100) return val.toFixed(0);
  if (absVal >= 10) return val.toFixed(1);
  if (absVal >= 1) return val.toFixed(2);
  if (absVal >= 0.1) return val.toFixed(3);
  if (absVal >= 0.01) return val.toFixed(4);
  if (absVal >= 0.001) return val.toFixed(5);
  // 极小值：最多保留 8 位小数
  return val.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

// 导出 stats 中的 formatNumber，方便 chartData 模块统一使用
export const formatNumber = _formatNumber;
