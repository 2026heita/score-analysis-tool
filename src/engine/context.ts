/**
 * 统一分析上下文类型定义
 * 
 * 职责：提供贯穿全链路的统一数据抽象
 * 
 * 核心原则：
 * 1. 所有分析函数基于同一个上下文
 * 2. 统一字段元数据、原始数据、指标定义、维度定义
 * 3. 避免各模块各算各的
 */

import type { FieldMeta } from '../utils/tableParser/types';
import type { MetricDefinition, DimensionDefinition } from './metricLayer';

/**
 * 分析上下文
 * 
 * 包含完整的分析所需信息：
 * - fields: 字段元数据（来自解析层）
 * - rawRows: 原始数据行
 * - metrics: 指标定义（来自语义层）
 * - dimensions: 维度定义（来自语义层）
 */
export interface AnalysisContext {
  /** 字段元数据数组 */
  fields: FieldMeta[];
  
  /** 原始数据行 */
  rawRows: Record<string, string>[];
  
  /** 指标定义数组 */
  metrics: MetricDefinition[];
  
  /** 维度定义数组 */
  dimensions: DimensionDefinition[];
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
 * 构建分析上下文
 * 
 * 从解析结果和语义定义构建统一的分析上下文
 */
export function buildAnalysisContext(
  fields: FieldMeta[],
  rawRows: Record<string, string>[],
  metrics: MetricDefinition[],
  dimensions: DimensionDefinition[]
): AnalysisContext {
  return {
    fields,
    rawRows,
    metrics,
    dimensions,
  };
}

/**
 * 从上下文中获取指定指标的 MetricDefinition
 */
export function getMetricDefinition(
  context: AnalysisContext,
  metricName: string
): MetricDefinition | undefined {
  return context.metrics.find(m => m.name === metricName);
}

/**
 * 判断指标是否为"越小越好"
 */
export function isLowerIsBetter(metric: MetricDefinition): boolean {
  return metric.direction === 'lower-is-better';
}
