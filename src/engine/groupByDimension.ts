/**
 * 分组分析 - 纯函数
 * 
 * 职责：基于维度字段对指标进行分组统计，不修改任何现有模块
 * 
 * 核心原则：
 * 1. 复用 calculateQuantile 保持统计口径一致
 * 2. 复用 MAX_ROWS 保持截断规则一致
 * 3. 不改变现有统计口径
 */

import { calculateQuantile } from '../utils/stats';
import type { FieldMeta } from '../utils/tableParser/types';

/** 分组统计结果 */
export interface GroupStats {
  dimensionValue: string;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
}

/** 维度候选字段 */
export interface DimensionCandidate {
  header: string;
  /** 风险等级：none=正常推荐, warning=分组过细（0.8<=uniqueRatio<0.95）, excluded=唯一标识（uniqueRatio>=0.95） */
  riskLevel: 'none' | 'warning' | 'excluded';
  /** 风险提示文本 */
  riskHint?: string;
}

/** 排序字段 */
export type SortField = 'count' | 'mean' | 'median' | 'min' | 'max' | 'q25' | 'q75';

/** 排序方向 */
export type SortOrder = 'asc' | 'desc';

/** 默认 Top N 显示数量 */
export const DEFAULT_TOP_N = 20;

/**
 * 获取可作为分组维度的字段（含风险提示）
 * 
 * 筛选规则：
 * 1. textMeta 字段 → 可作为维度
 * 2. category/status 类型字段（在 FieldType 中映射为 textMeta analysisRole）
 * 3. identity 字段中非唯一标识字段 → 可作为维度
 *    （如班级、学校、组别等，而非学号、考号等唯一标识）
 * 
 * 风险规则：
 * - uniqueRatio >= 0.95 → 排除（不推荐），如学号、考号
 * - 0.8 <= uniqueRatio < 0.95 → 给出风险提示，如姓名（重名率低时）
 * - uniqueRatio < 0.8 → 正常推荐
 * 
 * @param fieldMetas 字段元数据数组
 * @returns 维度候选字段数组（含 excluded 的，调用方可自行过滤）
 */
export function getAvailableDimensions(fieldMetas: FieldMeta[]): DimensionCandidate[] {
  const results: DimensionCandidate[] = [];

  for (const meta of fieldMetas) {
    const uniqueRatio = meta.contentFeature?.uniqueRatio ?? 0;

    // textMeta 字段：签名、备注、组合、类别、状态等
    if (meta.analysisRole === 'textMeta') {
      if (uniqueRatio >= 0.95) {
        results.push({
          header: meta.header,
          riskLevel: 'excluded',
          riskHint: '该字段唯一值过高，不适合作为分组维度',
        });
      } else if (uniqueRatio >= 0.8) {
        results.push({
          header: meta.header,
          riskLevel: 'warning',
          riskHint: '分组可能过细（唯一值比例较高），分析价值可能较低',
        });
      } else {
        results.push({
          header: meta.header,
          riskLevel: 'none',
        });
      }
      continue;
    }

    // identity 字段：筛选非唯一标识字段
    if (meta.analysisRole === 'identity') {
      if (uniqueRatio >= 0.95) {
        results.push({
          header: meta.header,
          riskLevel: 'excluded',
          riskHint: '该字段接近唯一标识，不适合作为分组维度',
        });
      } else if (uniqueRatio >= 0.8) {
        results.push({
          header: meta.header,
          riskLevel: 'warning',
          riskHint: '分组可能过细（唯一值比例较高），分析价值可能较低',
        });
      } else {
        results.push({
          header: meta.header,
          riskLevel: 'none',
        });
      }
    }
  }

  return results;
}

/**
 * 基于维度字段对指标进行分组统计
 * 
 * 流程：
 * 1. 按维度字段分组
 * 2. 提取每组中指标字段的数值
 * 3. 计算每组的统计指标
 * 
 * @param rows 原始数据行（已在入口统一抽样）
 * @param metricField 指标字段名
 * @param dimensionField 维度字段名
 * @returns 每组统计结果数组，按 mean 降序排列
 */
export function groupByDimension(
  rows: Record<string, string>[],
  metricField: string,
  dimensionField: string
): GroupStats[] {
  // Stage 0A-2: 不再截断，数据已在入口统一抽样

  // 按维度字段值分组
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const dimRaw = row[dimensionField];
    const dimKey = (dimRaw === undefined || dimRaw === null || dimRaw.trim() === '')
      ? '(空值)'
      : dimRaw.trim();

    const metricRaw = row[metricField];
    if (metricRaw === undefined || metricRaw === null || metricRaw.trim() === '') {
      continue;
    }
    const num = parseFloat(metricRaw);
    if (!Number.isFinite(num)) {
      continue;
    }

    if (!groups.has(dimKey)) {
      groups.set(dimKey, []);
    }
    groups.get(dimKey)!.push(num);
  }

  // 计算每组统计
  const results: GroupStats[] = [];
  for (const [dimValue, values] of groups) {
    if (values.length === 0) continue;

    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    results.push({
      dimensionValue: dimValue,
      count: len,
      mean: sum / len,
      median: calculateQuantile(sorted, 0.5),
      min: sorted[0],
      max: sorted[len - 1],
      q25: calculateQuantile(sorted, 0.25),
      q75: calculateQuantile(sorted, 0.75),
    });
  }

  // 默认按 mean 降序
  results.sort((a, b) => b.mean - a.mean);

  return results;
}

/**
 * 对分组统计结果排序
 * 
 * @param stats 分组统计结果
 * @param sortBy 排序字段
 * @param sortOrder 排序方向
 * @returns 排序后的新数组
 */
export function sortGroupStats(
  stats: GroupStats[],
  sortBy: SortField,
  sortOrder: SortOrder
): GroupStats[] {
  const sorted = [...stats].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const cmp = sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    // 数值相同时按维度名次排序
    if (cmp === 0) {
      return a.dimensionValue.localeCompare(b.dimensionValue, 'zh-CN');
    }
    return cmp;
  });
  return sorted;
}

/**
 * 截断分组统计结果到 Top N
 * 
 * @param stats 分组统计结果
 * @param topN 保留数量
 * @returns 截断后的数组
 */
export function topN(stats: GroupStats[], topN: number = DEFAULT_TOP_N): GroupStats[] {
  return stats.slice(0, topN);
}

/**
 * 判断字段是否为适合作为指标的数值字段
 * 
 * 排除 identity、textMeta、invalid 等非数值类型
 * 
 * @param meta 字段元数据
 * @returns 是否为适合作为指标的字段
 */
export function isMetricField(meta: FieldMeta): boolean {
  const nonMetricRoles = ['identity', 'textMeta', 'invalid'];
  return !nonMetricRoles.includes(meta.analysisRole);
}