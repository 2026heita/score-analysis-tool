/**
 * Chart 组件适配器
 * 
 * 职责：将 MetricResult 转换为 chart 组件需要的旧 props 格式
 * 过渡期使用，未来 chart 组件可以直接接收 MetricResult
 */

import type { MetricResult } from './context';

/**
 * 将 MetricResult 转换为 HistogramChart 的 props
 */
export function toHistogramProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  return {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
}

/**
 * 将 MetricResult 转换为 BoxPlotChart 的 props
 */
export function toBoxPlotProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  stats?: {
    min: number;
    q25: number;
    median: number;
    q75: number;
    max: number;
  };
  userValue?: number;
} {
  return {
    values: result.values,
    fieldName: result.displayName,
    stats: result.stats
      ? {
          min: result.stats.min,
          q25: result.stats.q25,
          median: result.stats.median,
          q75: result.stats.q75,
          max: result.stats.max,
        }
      : undefined,
    userValue: result.userValue,
  };
}

/**
 * 将 MetricResult 转换为 CdfChart 的 props
 */
export function toCdfProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  return {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
}

/**
 * 将 MetricResult 转换为 QuartilePieChart 的 props
 */
export function toQuartilePieProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  return {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
}
