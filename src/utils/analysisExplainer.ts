import type { FieldExplanation, MultiFieldSummary, AnalysisExplanation, PerformanceTier } from '../types';
import { computeStats, computePercentile } from '../engine/analysisEngine';

/**
 * 根据百分位确定表现层级
 */
function getPerformanceTier(percentile: number): { tier: PerformanceTier; tierLabel: string } {
  if (percentile >= 90) {
    return { tier: 'top10', tierLabel: '前 10%' };
  } else if (percentile >= 75) {
    return { tier: 'top25', tierLabel: '前 25%' };
  } else if (percentile >= 25) {
    return { tier: 'middle', tierLabel: '中游' };
  } else if (percentile >= 10) {
    return { tier: 'bottom25', tierLabel: '后 25%' };
  } else {
    return { tier: 'bottom10', tierLabel: '后 10%' };
  }
}

/**
 * 为单个字段生成解释信息
 * @param isRankField 是否为排名字段（排名数值越小越好，需要反转百分位计算）
 * @param direction 指标方向（neutral/unspecified 不生成优劣评价）
 */
export function explainField(
  field: string,
  userValue: number,
  values: number[],
  isRankField: boolean = false,
  direction?: 'higher-is-better' | 'lower-is-better' | 'neutral' | 'unspecified',
): FieldExplanation | null {
  // 校验 userValue 有效性
  if (!Number.isFinite(userValue)) {
    return null;
  }

  // 过滤有效数值
  const cleanValues = values.filter(v => Number.isFinite(v));
  
  if (cleanValues.length === 0) {
    return null;
  }

  // 计算统计信息（使用统一分析引擎）
  const stats = computeStats(cleanValues, cleanValues.length);
  if (!stats) {
    return null;
  }

  // neutral/unspecified 指标不生成优劣评价（不计算百分位、不生成排名层级）
  if (direction === 'neutral' || direction === 'unspecified') {
    return {
      field,
      userValue,
      mean: stats.mean,
      lowerCount: 0,
      percentile: 0,
      tier: 'middle',
      tierLabel: '中性指标',
      diffFromMean: userValue - stats.mean,
      diffFromP75: userValue - stats.q75,
      diffFromP90: userValue - stats.q90,
      diffFromP95: userValue - stats.q95,
      validCount: cleanValues.length,
    };
  }

  // 计算位置信息（使用统一分析引擎的百分位计算）
  // 排名字段：数值越小越好，所以"超过"是指比用户值大的（排名更靠后的）
  // 普通字段：数值越大越好，所以"超过"是指比用户值小的
  const lowerCount = isRankField
    ? cleanValues.filter(v => v > userValue).length
    : cleanValues.filter(v => v < userValue).length;
  const percentile = computePercentile(cleanValues, userValue, isRankField);

  // 确定表现层级
  const { tier, tierLabel } = getPerformanceTier(percentile);

  // 计算与分位数的差距（使用统一分析引擎的分位数）
  const p75 = stats.q75;
  const p90 = stats.q90;
  const p95 = stats.q95;

  return {
    field,
    userValue,
    mean: stats.mean,
    lowerCount,
    percentile,
    tier,
    tierLabel,
    diffFromMean: userValue - stats.mean,
    diffFromP75: userValue - p75,
    diffFromP90: userValue - p90,
    diffFromP95: userValue - p95,
    validCount: cleanValues.length,
  };
}

/**
 * 为多个字段生成综合摘要
 */
export function summarizeFields(
  explanations: FieldExplanation[],
): MultiFieldSummary {
  if (explanations.length === 0) {
    return {
      top3Fields: [],
      bottom3Fields: [],
      averagePercentile: 0,
      fieldCount: 0,
      insufficientData: true,
    };
  }

  // 按百分位排序
  const sorted = [...explanations].sort((a, b) => b.percentile - a.percentile);

  // 取前3和后3
  const top3Fields = sorted.slice(0, 3).map(e => ({
    field: e.field,
    percentile: e.percentile,
  }));

  const bottom3Fields = sorted.slice(-3).reverse().map(e => ({
    field: e.field,
    percentile: e.percentile,
  }));

  // 计算平均百分位
  const averagePercentile = explanations.reduce((sum, e) => sum + e.percentile, 0) / explanations.length;

  // 判断数据是否充足（至少3个字段）
  const insufficientData = explanations.length < 3;

  return {
    top3Fields,
    bottom3Fields,
    averagePercentile,
    fieldCount: explanations.length,
    insufficientData,
  };
}

/**
 * 生成完整的分析解释
 * @param rankFields 排名字段集合（这些字段的百分位计算方向反转）
 * @param fieldDirections 字段方向映射（neutral/unspecified 不生成优劣评价）
 */
export function generateExplanation(
  fieldValues: Record<string, number>,
  fieldData: Record<string, number[]>,
  rankFields?: Set<string>,
  fieldDirections?: Record<string, 'higher-is-better' | 'lower-is-better' | 'neutral' | 'unspecified'>,
): AnalysisExplanation {
  const fieldExplanations: FieldExplanation[] = [];

  // 为每个字段生成解释
  for (const [field, userValue] of Object.entries(fieldValues)) {
    // 跳过无效的 userValue
    if (!Number.isFinite(userValue)) {
      continue;
    }

    const values = fieldData[field];
    if (!values || values.length === 0) {
      continue;
    }

    const isRank = rankFields?.has(field) ?? false;
    const direction = fieldDirections?.[field];
    const explanation = explainField(field, userValue, values, isRank, direction);
    if (explanation) {
      fieldExplanations.push(explanation);
    }
  }

  // 生成多字段综合摘要
  const multiFieldSummary = summarizeFields(fieldExplanations);

  return {
    fieldExplanations,
    multiFieldSummary,
  };
}
