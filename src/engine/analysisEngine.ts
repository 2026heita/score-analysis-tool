/**
 * 统一分析引擎
 * 职责：提供一致的数据分析计算，避免重复计算和口径不一致
 * 
 * 核心原则：
 * 1. 一个数据 → 一次计算 → 多处复用
 * 2. 统一 5000 行截断
 * 3. 统一数值过滤（Number.isFinite）
 * 4. 统一 rank 字段方向处理（从 MetricDefinition 读取）
 * 5. 统一 percentile 计算
 */

import type { StatsResult, PositionResult } from '../types';
import { calculateQuantile } from '../utils/stats';
import type { DerivedDataContext, MetricResult } from './context';
import type { MetricDefinition } from './metricLayer';

// 大表格保护：统一截断阈值
export const MAX_ROWS = 5000;

// 分析配置
interface AnalysisConfig {
  maxRows?: number; // 最大行数（默认 5000）
}

/**
 * 从原始行数据中提取数值数组
 * 
 * @deprecated 仅供 computeMetric() 内部使用，外部应通过 computeMetric() 统一入口。
 */
export function extractFieldValues(
  rows: Record<string, string>[],
  fieldName: string,
  _config: AnalysisConfig = {}
): {
  values: number[];
  invalidCount: number;
  totalRows: number;
  truncatedRows: number;
} {
  const totalRows = rows.length;
  const truncatedRows = totalRows; // Stage 0A-2: 不再截断，数据已在入口统一抽样

  let invalidCount = 0;
  const values: number[] = [];

  for (const row of rows) {
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
 * 计算统计指标
 * 
 * @deprecated 仅供 computeMetric() 内部使用，外部应通过 computeMetric() 统一入口。
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
 * 计算位置排名
 * 
 * @deprecated 仅供 computeMetric() 内部使用，外部应通过 computeMetric() 统一入口。
 */
export function computePosition(
  values: number[],
  inputValue: number,
  direction: 'higher-is-better' | 'lower-is-better' = 'higher-is-better'
): PositionResult {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;

  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;

  let bestRank: number;
  let worstRank: number;
  let estimatedRank: number;
  let percentile: number;

  if (direction === 'lower-is-better') {
    // rank 字段：数值越小越好
    // 排名 = 低于该值人数 + 1
    bestRank = lowerCount + 1;
    worstRank = lowerCount + equalCount;
    estimatedRank = lowerCount + 1;
    // 百分位：高于该值人数 / 有效人数 * 100（反转）
    percentile = total === 0 ? 0 : (higherCount / total) * 100;
  } else {
    // 普通字段：数值越大越好
    // 排名 = 高于该值人数 + 1
    bestRank = higherCount + 1;
    worstRank = higherCount + equalCount;
    estimatedRank = higherCount + 1;
    // 百分位：低于该值人数 / 有效人数 * 100
    percentile = total === 0 ? 0 : (lowerCount / total) * 100;
  }

  return {
    total,
    higherCount,
    equalCount,
    lowerCount,
    bestRank,
    worstRank,
    estimatedRank,
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
 * @deprecated 使用 MetricDefinition.direction 替代。新代码应从 DerivedDataContext 读取 direction 属性。
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
 * @deprecated 主链路应使用 computeMetric()。此函数绕过 metricRegistry，不读取
 * MetricDefinition.direction，对 rank 字段使用默认方向（higher-is-better），
 * 导致 rank 字段的排名和百分位结果与 computeMetric() 不一致。
 * 
 * 无法委托 computeMetric() 的原因：computeMetric 需要 DerivedDataContext（含 metrics 数组），
 * 而本函数仅接受原始 rows。类型体系不兼容，强行委托需引入语义层构建，风险过高。
 * 本函数已冻结，仅保留供旧测试脚本（testAnalysisEngine.mjs）使用。
 * 请使用 computeMetric(context, fieldName, inputValue) 替代。
 * 
 * 统一规则：
 * 1. 提取字段值（含 5000 行截断）
 * 2. 计算统计指标
 * 3. 计算位置（如果有 inputValue）—— 注意：默认 direction='higher-is-better'
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
 * @deprecated 主链路应使用 computeMetrics()。此函数绕过 metricRegistry，不读取
 * MetricDefinition.direction。与 analyzeField 相同，已冻结，仅保留供旧测试脚本使用。
 * 请使用 computeMetrics(context, fieldNames, userValues) 替代。
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

// ============================================================
// 统一指标计算入口（v1.4 Phase 4：直接计算，不再依赖 metricRegistry）
// ============================================================

/**
 * 计算单个指标的完整结果（统一入口）
 * 
 * v1.4 Phase 4：engine 只产出 DerivedData，View 层负责调用 computeMetric。
 * MetricDefinition 由 View 层从 parseSummary 构建，不再通过 context 传递。
 * 
 * @param context 派生数据上下文（filteredRows + fieldScores + outliers）
 * @param metricDef 指标定义（由 View 层从 parseSummary 构建）
 * @param userValue 用户输入值（可选，用于计算排名位置）
 * @returns 指标计算结果
 */
export function computeMetric(
  context: DerivedDataContext,
  metricDef: MetricDefinition,
  userValue?: number,
): MetricResult | null {
  // 1. 提取字段值（使用统一的截断和过滤逻辑）
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(
    context.filteredRows,
    metricDef.sourceField
  );

  // 2. 计算统计指标
  const stats = computeStats(values, truncatedRows);

  // 3. 计算位置（如果有用户输入值）
  let position: PositionResult | undefined;
  if (userValue !== undefined && Number.isFinite(userValue) && values.length > 0) {
    position = computePosition(values, userValue, metricDef.direction);
  }

  // 4. 构建 MetricResult
  return {
    metricName: metricDef.name,
    displayName: metricDef.displayName,
    direction: metricDef.direction,
    values,
    invalidCount,
    totalRows,
    truncatedRows,
    stats,
    position,
    userValue,
  };
}

/**
 * 批量计算多个指标（统一入口）
 * 
 * @param context 派生数据上下文
 * @param metricDefs 指标定义数组
 * @param userValues 用户输入值映射（metricName -> userValue）
 * @returns 指标结果映射
 */
export function computeMetrics(
  context: DerivedDataContext,
  metricDefs: MetricDefinition[],
  userValues?: Record<string, number>,
): Map<string, MetricResult> {
  const results = new Map<string, MetricResult>();

  for (const def of metricDefs) {
    const result = computeMetric(context, def, userValues?.[def.name]);
    if (result) {
      results.set(def.name, result);
    }
  }

  return results;
}
