/**
 * 统一分析上下文类型定义（v1.4 分层架构）
 * 
 * 三层结构：
 * - RawDataContext：原始数据，仅由 activeTableId 驱动
 * - DerivedDataContext：计算结果（筛选、评分、异常值），由 RawData 派生
 * - ViewContext：UI 展示数据（分组、指标、图表），由 DerivedData 派生
 * 
 * 核心原则：
 * 1. engine 只负责 DerivedData，UI 只负责 ViewData
 * 2. RawData 不允许在 UI 层直接计算
 * 3. activeTableId 只能影响 RawData，不能直接触发 ViewContext 重算
 */

import type { FieldMeta } from '../utils/tableParser/types';
import type { MetricDefinition, DimensionDefinition } from './metricLayer';
import type { AnalyticScore } from '../utils/tableParser/fieldClassifier';

// ============================================================
// Layer 1: RawDataContext — 原始数据层
// ============================================================

/** 原始数据上下文，唯一的数据源标识 */
export interface RawDataContext {
  /** 字段元数据数组 */
  fields: FieldMeta[];

  /** 原始数据行 */
  rawRows: Record<string, string>[];

  /** 当前表标识，用于数据源隔离 */
  activeTableId: number;
}

// ============================================================
// Layer 2: DerivedDataContext — 派生数据层
// ============================================================

/** 派生数据上下文，由引擎（engine）计算得出 */
export interface DerivedDataContext {
  /** 筛选后的数据行 */
  filteredRows: Record<string, string>[];

  /** 字段可分析性评分，key 为字段名 */
  fieldScores: Record<string, AnalyticScore>;

  /** 各字段异常值列表，key 为字段名 */
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>>;
}

// ============================================================
// Layer 3: ViewContext — 视图数据层
// ============================================================

/** 视图上下文，由 DerivedData 计算得出，供 UI 组件消费 */
export interface ViewContext {
  /** 分组统计结果 */
  groupStats: Array<{
    dimensionValue: string;
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    q25: number;
    q75: number;
  }> | null;

  /** 指标计算结果 */
  metricResult: MetricResult | null;

  /** 相关性分析结果 */
  correlationResult: Array<{
    fieldA: string;
    fieldB: string;
    coefficient: number;
    strength: string;
    direction: string;
  }> | null;
}

// ============================================================
// Backward-compatible AnalysisContext（保留为 DerivedDataContext 别名）
// ============================================================

/**
 * @deprecated 使用 DerivedDataContext 替代
 * 分析上下文（向后兼容）
 */
export interface AnalysisContext extends DerivedDataContext {
  /** @deprecated 已迁移到 RawDataContext */
  fields: FieldMeta[];
  /** @deprecated 已迁移到 RawDataContext */
  rawRows: Record<string, string>[];
  /** @deprecated 已迁移到 RawDataContext */
  activeTableId: number;
  /** @deprecated 已迁移到 View 层 */
  metrics: MetricDefinition[];
}

/**
 * 指标计算结果
 * 
 * 统一 UI 组件接收的数据结构，替代直接传递 number[]
 */
export interface MetricResult {
  /** 指标名称（对应 MetricDefinition.name） */
  metricName: string;
  
  /** 显示名称 */
  displayName: string;
  
  /** 指标方向 */
  direction: 'higher-is-better' | 'lower-is-better';
  
  /** 有效数值数组 */
  values: number[];
  
  /** 无效值数量 */
  invalidCount: number;
  
  /** 总行数 */
  totalRows: number;
  
  /** 截断后的行数 */
  truncatedRows: number;
  
  /** 统计结果 */
  stats: {
    count: number;
    validCount: number;
    invalidCount: number;
    max: number;
    min: number;
    mean: number;
    median: number;
    q25: number;
    q75: number;
    q90: number;
    q95: number;
  } | null;
  
  /** 排名位置结果（如果有用户输入值） */
  position?: {
    total: number;
    higherCount: number;
    equalCount: number;
    lowerCount: number;
    bestRank: number;
    worstRank: number;
    estimatedRank: number;
    percentile: number;
    existsInData: boolean;
  };
  
  /** 用户输入值（可选） */
  userValue?: number;
}

/**
 * 构建派生数据上下文
 * 
 * v1.4 Phase 4：DerivedDataContext 只包含引擎计算结果
 * - filteredRows：筛选后的数据行
 * - fieldScores：字段可分析性评分
 * - outliers：异常值检测结果
 */
export function buildDerivedDataContext(
  filteredRows: Record<string, string>[],
  fieldScores: Record<string, AnalyticScore> = {},
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>> = {}
): DerivedDataContext {
  return { filteredRows, fieldScores, outliers };
}

/**
 * @deprecated 使用 buildDerivedDataContext 替代
 * 构建分析上下文（向后兼容）
 */
export function buildAnalysisContext(
  fields: FieldMeta[],
  rawRows: Record<string, string>[],
  metrics: MetricDefinition[],
  _dimensions: DimensionDefinition[],
  activeTableId: number = 0,
  fieldScores: Record<string, AnalyticScore> = {},
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>> = {}
): AnalysisContext {
  return {
    fields,
    rawRows,
    filteredRows: rawRows,
    metrics,
    activeTableId,
    fieldScores,
    outliers,
  };
}

/**
 * 判断指标是否为"越小越好"
 */
export function isLowerIsBetter(metric: MetricDefinition): boolean {
  return metric.direction === 'lower-is-better';
}
