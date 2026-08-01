/**
 * Chart 组件适配器
 *
 * 职责：将 MetricResult 转换为 chart 组件需要的旧 props 格式
 * 过渡期使用，未来 chart 组件可以直接接收 MetricResult
 *
 * v1.9.1: 增加 memo cache，避免重复 transform pipeline execution
 */

import type { MetricResult } from './context';
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

// 简单的 memo 缓存：WeakMap 键为 MetricResult 引用，值为计算结果
const _histogramCache = new WeakMap<MetricResult, ReturnType<typeof toHistogramProps>>();
const _boxPlotCache = new WeakMap<MetricResult, ReturnType<typeof toBoxPlotProps>>();
const _cdfCache = new WeakMap<MetricResult, ReturnType<typeof toCdfProps>>();
const _quartileCache = new WeakMap<MetricResult, ReturnType<typeof toQuartilePieProps>>();

/**
 * 将 MetricResult 转换为 HistogramChart 的 props
 */
export function toHistogramProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  const cached = _histogramCache.get(result);
  if (cached) return cached;

  const props = {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
  _histogramCache.set(result, props);
  return props;
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
  const cached = _boxPlotCache.get(result);
  if (cached) return cached;

  const props = {
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
  _boxPlotCache.set(result, props);
  return props;
}

/**
 * 将 MetricResult 转换为 CdfChart 的 props
 */
export function toCdfProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  const cached = _cdfCache.get(result);
  if (cached) return cached;

  const props = {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
  _cdfCache.set(result, props);
  return props;
}

/**
 * 将 MetricResult 转换为 QuartilePieChart 的 props
 */
export function toQuartilePieProps(result: MetricResult): {
  values: number[];
  fieldName: string;
  userValue?: number;
} {
  const cached = _quartileCache.get(result);
  if (cached) return cached;

  const props = {
    values: result.values,
    fieldName: result.displayName,
    userValue: result.userValue,
  };
  _quartileCache.set(result, props);
  return props;
}

// ============================================================
// 时间序列适配器
// ============================================================

/** 时间序列图表数据 */
export interface TimeSeriesChartData {
  dates: string[];
  values: Array<number | null>;
  duplicateCount: number;
  invalidDateCount: number;
  invalidValueCount: number;
}



// 日期解析正则
const DATE_REGEX = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

/**
 * 解析日期字符串为时间戳
 *
 * 支持格式：
 * - YYYY-MM-DD, YYYY-M-D
 * - YYYY/MM/DD, YYYY/M/D
 * - ISO 8601: 2026-04-08T10:30:00, 2026-04-08T10:30:00Z, 2026-04-08T10:30:00+08:00
 *
 * @returns 时间戳（毫秒），无效返回 null
 */
function parseDateToTimestamp(dateStr: string): number | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 尝试纯日期格式：YYYY-MM-DD 或 YYYY/MM/DD
  const dateMatch = trimmed.match(DATE_REGEX);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);

    // 基本范围校验
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // 使用 Date.UTC 避免时区问题，然后验证日期是否真实存在
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);

    // 验证日期是否回滚（例如 2月30日 会变成 3月2日）
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return timestamp;
  }

  // 尝试 ISO 8601 日期时间格式
  if (ISO_DATETIME_REGEX.test(trimmed)) {
    const timestamp = Date.parse(trimmed);
    return isNaN(timestamp) ? null : timestamp;
  }

  return null;
}

/**
 * 将表格行转换为时间序列数据
 *
 * 该函数沿用平台现有数值解析口径，包括千分位和百分号解析；
 * 后续如引入可配置指标格式，再统一升级数值语义层。
 *
 * @param rows 数据行
 * @param timeField 时间字段名
 * @param valueField 数值字段名
 * @returns 时间序列数据（已排序）
 */
export function toTimeSeriesProps(
  rows: Record<string, string>[],
  timeField: string,
  valueField: string
): TimeSeriesChartData {
  // 中间数据结构
  interface TimeSeriesPoint {
    originalIndex: number;
    timestamp: number;
    dateLabel: string;
    value: number | null;
  }

  const points: TimeSeriesPoint[] = [];
  let invalidDateCount = 0;
  let invalidValueCount = 0;

  // 遍历所有行
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = row[timeField];
    const valueStr = row[valueField];

    // 解析日期
    const timestamp = parseDateToTimestamp(dateStr);
    if (timestamp === null) {
      invalidDateCount++;
      continue; // 跳过无效日期
    }

    // 解析数值（复用现有解析器）
    const parsedValue = parseNumericValueLegacy(valueStr);
    if (parsedValue === null) {
      invalidValueCount++;
    }

    points.push({
      originalIndex: i,
      timestamp,
      dateLabel: dateStr.trim(),
      value: parsedValue,
    });
  }

  // 稳定排序：先按时间戳，再按原始索引
  points.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.originalIndex - b.originalIndex;
  });

  // 计算重复时间点数量
  const timestampCounts = new Map<number, number>();
  for (const point of points) {
    timestampCounts.set(point.timestamp, (timestampCounts.get(point.timestamp) || 0) + 1);
  }

  let duplicateCount = 0;
  for (const count of timestampCounts.values()) {
    if (count > 1) {
      duplicateCount += count - 1;
    }
  }

  // 提取最终数据
  const dates: string[] = [];
  const values: Array<number | null> = [];

  for (const point of points) {
    dates.push(point.dateLabel);
    values.push(point.value);
  }

  return {
    dates,
    values,
    duplicateCount,
    invalidDateCount,
    invalidValueCount,
  };
}