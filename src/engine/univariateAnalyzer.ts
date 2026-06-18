/**
 * 单变量分析器
 * 职责：对单个数值字段进行统计分析
 * 第一阶段功能：
 * - count / validCount / missingCount
 * - min / max / mean / median
 * - std (标准差)
 * - percentile (百分位)
 * - z-score (标准分数)
 * - IQR 异常值检测
 */

import type { FeatureStats, FeatureVector } from './types';
import { extractNumericalValues } from './featureStandardizer';

// 分析配置
interface UnivariateConfig {
  outlierThreshold?: number; // IQR 倍数阈值（默认 1.5）
  decimalPlaces?: number;    // 小数位数（默认 4）
}

const DEFAULT_UNIVARIATE_CONFIG: UnivariateConfig = {
  outlierThreshold: 1.5,
  decimalPlaces: 4,
};

/**
 * 计算数值字段的统计摘要
 */
export function analyzeNumericalFeature(
  vectors: FeatureVector[],
  fieldName: string,
  config: UnivariateConfig = {}
): FeatureStats {
  const cfg = { ...DEFAULT_UNIVARIATE_CONFIG, ...config };
  
  // 提取数值
  const values = extractNumericalValues(vectors, fieldName);
  
  // 基础计数
  const count = vectors.length;
  const validCount = values.length;
  const missingCount = count - validCount;
  
  // 如果没有有效值，返回基础统计
  if (validCount === 0) {
    return {
      count,
      validCount: 0,
      missingCount,
    };
  }
  
  // 排序
  const sorted = [...values].sort((a, b) => a - b);
  
  // 基础统计量
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / validCount;
  
  // 中位数
  const median = calculateMedian(sorted);
  
  // 标准差
  const std = calculateStd(values, mean);
  
  // 四分位数
  const q1 = calculatePercentile(sorted, 25);
  const q3 = calculatePercentile(sorted, 75);
  const iqr = q3 - q1;
  
  return {
    count,
    validCount,
    missingCount,
    min: roundTo(min, cfg.decimalPlaces!),
    max: roundTo(max, cfg.decimalPlaces!),
    mean: roundTo(mean, cfg.decimalPlaces!),
    median: roundTo(median, cfg.decimalPlaces!),
    std: roundTo(std, cfg.decimalPlaces!),
    q1: roundTo(q1, cfg.decimalPlaces!),
    q3: roundTo(q3, cfg.decimalPlaces!),
    iqr: roundTo(iqr, cfg.decimalPlaces!),
  };
}

/**
 * 计算中位数
 */
function calculateMedian(sorted: number[]): number {
  const len = sorted.length;
  if (len === 0) return 0;
  
  const mid = Math.floor(len / 2);
  if (len % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * 计算标准差
 */
function calculateStd(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 计算百分位数（线性插值法）
 */
export function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (percentile <= 0) return sorted[0];
  if (percentile >= 100) return sorted[sorted.length - 1];
  
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * 计算 z-score（标准分数）
 */
export function calculateZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * 检测 IQR 异常值
 */
export function detectOutliers(
  vectors: FeatureVector[],
  fieldName: string,
  config: UnivariateConfig = {}
): Array<{ rowIndex: number; value: number; zScore: number }> {
  const cfg = { ...DEFAULT_UNIVARIATE_CONFIG, ...config };
  
  // 先计算统计量
  const stats = analyzeNumericalFeature(vectors, fieldName, cfg);
  if (!stats.q1 || !stats.q3 || !stats.iqr || !stats.mean || !stats.std) {
    return [];
  }
  
  const lowerBound = stats.q1 - cfg.outlierThreshold! * stats.iqr;
  const upperBound = stats.q3 + cfg.outlierThreshold! * stats.iqr;
  
  const outliers: Array<{ rowIndex: number; value: number; zScore: number }> = [];
  
  for (const vector of vectors) {
    const sv = vector.values[fieldName];
    if (sv && sv.type === 'numerical' && sv.value !== null) {
      const value = sv.value;
      if (value < lowerBound || value > upperBound) {
        const zScore = calculateZScore(value, stats.mean, stats.std);
        outliers.push({
          rowIndex: vector.rowIndex,
          value,
          zScore: roundTo(zScore, cfg.decimalPlaces!),
        });
      }
    }
  }
  
  return outliers;
}

/**
 * 计算单个值的百分位排名
 */
export function calculatePercentileRank(
  value: number,
  sorted: number[]
): number {
  if (sorted.length === 0) return 0;
  
  let count = 0;
  for (const v of sorted) {
    if (v < value) count++;
    else if (v === value) count += 0.5;
  }
  
  return (count / sorted.length) * 100;
}

/**
 * 生成数值字段的完整分析报告
 */
export function generateNumericalReport(
  vectors: FeatureVector[],
  fieldName: string,
  config: UnivariateConfig = {}
): {
  stats: FeatureStats;
  outliers: Array<{ rowIndex: number; value: number; zScore: number }>;
  percentileRanks: Map<number, number>;
} {
  const cfg = { ...DEFAULT_UNIVARIATE_CONFIG, ...config };
  
  // 基础统计
  const stats = analyzeNumericalFeature(vectors, fieldName, cfg);
  
  // 异常值检测
  const outliers = detectOutliers(vectors, fieldName, cfg);
  
  // 百分位排名
  const values = extractNumericalValues(vectors, fieldName);
  const sorted = [...values].sort((a, b) => a - b);
  const percentileRanks = new Map<number, number>();
  
  for (const value of values) {
    const rank = calculatePercentileRank(value, sorted);
    percentileRanks.set(value, roundTo(rank, cfg.decimalPlaces!));
  }
  
  return {
    stats,
    outliers,
    percentileRanks,
  };
}

/**
 * 四舍五入到指定小数位
 */
function roundTo(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

/**
 * 判断字段是否适合数值分析
 */
export function isSuitableForNumericalAnalysis(
  vectors: FeatureVector[],
  fieldName: string,
  minValidCount: number = 5
): boolean {
  const values = extractNumericalValues(vectors, fieldName);
  return values.length >= minValidCount;
}

// ============================================================
// v1.4 Phase 2：异常值策略统一层
// ============================================================

/** 异常值策略类型 */
export type OutlierStrategy = 'auto-exclude' | 'mark' | 'keep';

/** 异常值分类类型 */
export type OutlierClass = 'extremeHigh' | 'extremeLow' | 'outlier';

/** 异常值分类结果 */
export interface OutlierClassification {
  type: OutlierClass;
  strategy: OutlierStrategy;
}

/** 错误值阈值：低于此值视为明显错误 */
export const ERROR_VALUE_THRESHOLD = -900;

/**
 * 从数值数组检测 IQR 异常值（唯一计算源）
 * 
 * 内部将 number[] 转为 FeatureVector[] 后调用 detectOutliers
 */
export function detectOutliersFromValues(
  values: number[]
): Array<{ rowIndex: number; value: number; zScore: number }> {
  if (values.length < 4) return [];
  
  const vectors: FeatureVector[] = values.map((v, i) => ({
    rowIndex: i,
    values: { _val: v },
  }));
  
  return detectOutliers(vectors, '_val');
}

/**
 * 判断异常值策略（v1.4 统一规则）
 * 
 * 规则：
 * 1. 明显错误值（如 -999）→ 默认排除
 * 2. 真实极端值（z-score > 3）→ 默认保留 + 标记
 * 3. 不确定异常 → 默认保留
 */
export function classifyOutlierStrategy(value: number, zScore: number): OutlierClassification {
  if (value <= ERROR_VALUE_THRESHOLD) {
    return { type: value < 0 ? 'extremeLow' : 'extremeHigh', strategy: 'auto-exclude' };
  }
  if (zScore > 3) {
    return { type: value > 0 ? 'extremeHigh' : 'extremeLow', strategy: 'mark' };
  }
  return { type: value > 0 ? 'extremeHigh' : 'extremeLow', strategy: 'keep' };
}

/**
 * 计算排除异常值后的均值变化
 */
export function computeMeanChange(values: number[], excludedIndices: Set<number>): string {
  if (excludedIndices.size === 0) return '无变化';
  const remaining = values.filter((_, i) => !excludedIndices.has(i));
  if (remaining.length === 0) return '全部排除';

  const oldMean = values.reduce((a, b) => a + b, 0) / values.length;
  const newMean = remaining.reduce((a, b) => a + b, 0) / remaining.length;
  const diff = newMean - oldMean;
  const sign = diff > 0 ? '+' : '';
  const pct = oldMean !== 0 ? ((diff / Math.abs(oldMean)) * 100) : 0;
  return `${sign}${diff.toFixed(2)}（${sign}${pct.toFixed(1)}%）`;
}
