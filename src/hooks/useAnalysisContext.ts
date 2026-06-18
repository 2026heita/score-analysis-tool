/**
 * useDerivedData - 派生数据 Hook（v1.4 Phase 4）
 * 
 * 职责：仅产出 DerivedDataContext（filteredRows + fieldScores + outliers）
 * 这是 engine 层的唯一输出，不包含任何 View 层计算。
 * 
 * 分层规则：
 * - 输入：filteredParsedData（筛选后数据）
 * - 输出：DerivedDataContext（引擎计算结果）
 * - 不计算：metricResult、correlationResult、groupStats（属于 View 层）
 */

import { useMemo } from 'react';
import { buildDerivedDataContext } from '../engine/context';
import { calculateFieldAnalyticScore } from '../utils/tableParser/fieldClassifier';
import type { ParsedTable } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';
import type { DerivedDataContext } from '../engine/context';
import type { AnalyticScore } from '../utils/tableParser/fieldClassifier';

export type { DerivedDataContext };

export function useDerivedData(
  filteredParsedData: ParsedTable | null,
  parseSummary: ParseSummary | null
): DerivedDataContext | null {
  return useMemo((): DerivedDataContext | null => {
    if (!filteredParsedData || !parseSummary?.fieldTypes) return null;

    // 计算所有字段的可分析性评分（engine 层职责）
    const fieldScores: Record<string, AnalyticScore> = {};
    for (const meta of parseSummary.fieldTypes) {
      fieldScores[meta.header] = calculateFieldAnalyticScore(meta);
    }

    // v1.4 Phase 4：DerivedDataContext 只包含引擎计算结果
    return buildDerivedDataContext(
      filteredParsedData.rows,
      fieldScores,
      // outliers 暂不在主链路中计算，后续可扩展
    );
  }, [filteredParsedData, parseSummary]);
}