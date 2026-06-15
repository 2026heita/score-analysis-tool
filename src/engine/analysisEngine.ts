/**
 * 统一分析引擎
 * 职责：提供一致的数据分析计算，避免重复计算和口径不一致
 * 
 * 核心原则：
 * 1. 一个数据 → 一次计算 → 多处复用
 * 2. 统一 5000 行截断
 * 3. 统一数值过滤（Number.isFinite）
 * 4. 统一 rank 字段方向处理
 * 5. 统一 percentile 计算
 */

import type { StatsResult, PositionResult } from '../types';
import { calculateQuantile } from '../utils/stats';

// 大表格保护：统一截断阈值
export const MAX_ROWS = 5000;

// 分析配置
interface AnalysisConfig {
  maxRows?: number; // 最大行数（默认 5000）
}

const DEFAULT_CONFIG: AnalysisConfig = {
  maxRows: MAX_ROWS,
};

/**
 * 从原始行数据中提取数值数组（统一入口）
 * 
 * 统一规则：
 * 1. 超过 maxRows 行时，只提取前 maxRows 行
 * 2. 使用 parseFloat 解析
 * 3. 只保留 Number.isFinite 的值
 * 4. 0 值有效
 * 5. NaN / undefined / '' 不参与计算
 * 
 * @param rows 原始行数据
 * @param fieldName 字段名
 * @param config 配置
 * @returns 有效数值数组、无效计数、总行数
 */
export function extractFieldValues(
  rows: Record<string, string>[],
  fieldName: string,
  config: AnalysisConfig = {}
): {
  values: number[];
  invalidCount: number;
  totalRows: number;
  truncatedRows: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const totalRows = rows.length;
  const truncatedRows = Math.min(totalRows, cfg.maxRows!);
  const limitedRows = rows.slice(0, truncatedRows);

  let invalidCount = 0;
  const values: number[] = [];

  for (const row of limitedRows) {
    const raw = row[fieldName];
    if (raw === undefined || raw === null || raw.trim() === '') {
      invalidCount++;
      continue;
    }
    const num = parseFloat(raw);
    if (Number.isFinite(num)) {
      values.push(num);
    } else {
      invalidCount++;
    }
  }

  return { values, invalidCount, totalRows, truncatedRows };
}

/**
 * 计算统计指标（统一入口）
 * 
 * 统一规则：
 * 1. 先过滤无效值（Number.isFinite）
 * 2. 排序后计算
 * 3. 使用 calculateQuantile 计算分位数
 * 
 * @param values 原始数值数组（包含无效值会被自动过滤）
 * @param totalRows 总行数（用于计算 invalidCount）
 * @returns 统计结果
 */
export function computeStats(
  values: (number | null)[],
  totalRows: number
): StatsResult | null {
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

/**
 * 计算位置排名（统一入口）
 * 
 * 统一规则：
 * 1. 先过滤无效值（Number.isFinite）
 * 2. 计算高于、等于、低于的人数
 * 3. 计算百分位（低于该值人数 / 有效人数 * 100）
 * 
 * @param values 原始数值数组
 * @param inputValue 输入值
 * @returns 位置结果
 */
export function computePosition(
  values: number[],
  inputValue: number
): PositionResult {
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

/**
 * 计算字段百分位（统一入口）
 * 
 * 统一规则：
 * 1. 先过滤无效值（Number.isFinite）
 * 2. 普通字段：低于该值人数 / 有效人数 * 100
 * 3. rank 字段：高于该值人数 / 有效人数 * 100（反转）
 * 
 * @param values 原始数值数组
 * @param inputValue 输入值
 * @param isRankField 是否为排名字段（排名数值越小越好）
 * @returns 百分位（0-100）
 */
export function computePercentile(
  values: number[],
  inputValue: number,
  isRankField: boolean = false
): number {
  if (!values || values.length === 0) return 0;
  const cleanValues = values.filter(v => Number.isFinite(v));
  if (cleanValues.length === 0) return 0;

  // 普通字段：低于该值人数 / 有效人数 * 100
  // rank 字段：高于该值人数 / 有效人数 * 100（反转）
  const lowerCount = isRankField
    ? cleanValues.filter(v => v > inputValue).length
    : cleanValues.filter(v => v < inputValue).length;
  
  return (lowerCount / cleanValues.length) * 100;
}

/**
 * 判断字段是否为排名字段（统一入口）
 * 
 * 统一规则：
 * 1. 检查字段名是否包含排名相关关键词
 * 2. 检查 analysisRole 是否为 'rank'
 * 
 * @param fieldName 字段名
 * @param analysisRole 字段分析角色（可选）
 * @returns 是否为排名字段
 */
export function isRankField(
  fieldName: string,
  analysisRole?: string
): boolean {
  // 优先使用 analysisRole
  if (analysisRole === 'rank') {
    return true;
  }

  // 检查字段名关键词
  const RANK_KEYWORDS = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
  const fieldNameLower = fieldName.toLowerCase();
  return RANK_KEYWORDS.some(kw => fieldNameLower.includes(kw.toLowerCase()));
}

/**
 * 判断字段是否为数值字段（统一入口）
 * 
 * 统一规则：
 * 1. 提取字段值
 * 2. 计算数值比例
 * 3. 数值比例 >= 50% 视为数值字段
 * 
 * @param rows 原始行数据
 * @param fieldName 字段名
 * @param config 配置
 * @returns 是否为数值字段
 */
export function isNumericField(
  rows: Record<string, string>[],
  fieldName: string,
  config: AnalysisConfig = {}
): boolean {
  const { values, truncatedRows } = extractFieldValues(rows, fieldName, config);
  return values.length >= truncatedRows * 0.5;
}

/**
 * 分析单个字段（统一入口）
 * 
 * 统一规则：
 * 1. 提取字段值（含 5000 行截断）
 * 2. 计算统计指标
 * 3. 计算位置（如果有 inputValue）
 * 4. 处理 rank 字段方向
 * 
 * @param rows 原始行数据
 * @param fieldName 字段名
 * @param inputValue 输入值（可选）
 * @param config 配置
 * @returns 分析结果
 */
export function analyzeField(
  rows: Record<string, string>[],
  fieldName: string,
  inputValue?: number,
  config: AnalysisConfig = {}
): {
  values: number[];
  invalidCount: number;
  totalRows: number;
  truncatedRows: number;
  stats: StatsResult | null;
  position: PositionResult | null;
} {
  // 1. 提取字段值
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(rows, fieldName, config);

  // 2. 计算统计指标
  const stats = computeStats(values, truncatedRows);

  // 3. 计算位置（如果有 inputValue）
  let position: PositionResult | null = null;
  if (inputValue !== undefined && Number.isFinite(inputValue) && values.length > 0) {
    position = computePosition(values, inputValue);
  }

  return {
    values,
    invalidCount,
    totalRows,
    truncatedRows,
    stats,
    position,
  };
}

/**
 * 分析多个字段（统一入口）
 * 
 * 统一规则：
 * 1. 批量提取字段值
 * 2. 批量计算统计指标
 * 3. 避免重复计算
 * 
 * @param rows 原始行数据
 * @param fieldNames 字段名数组
 * @param config 配置
 * @returns 字段分析结果映射
 */
export function analyzeMultipleFields(
  rows: Record<string, string>[],
  fieldNames: string[],
  config: AnalysisConfig = {}
): Map<string, {
  values: number[];
  invalidCount: number;
  totalRows: number;
  truncatedRows: number;
  stats: StatsResult | null;
}> {
  const results = new Map();

  for (const fieldName of fieldNames) {
    const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(rows, fieldName, config);
    const stats = computeStats(values, truncatedRows);

    results.set(fieldName, {
      values,
      invalidCount,
      totalRows,
      truncatedRows,
      stats,
    });
  }

  return results;
}
