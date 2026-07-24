/**
 * useDerivedData - 派生数据 Hook（v1.4 Phase 4）
 * 
 * 职责：仅产出 DerivedDataContext（filteredRows + fieldScores + outliers）
 * 这是 engine 层的唯一输出，不包含任何 View 层计算。
 * 
 * 分层规则：
 * - 输入：analysisDataset（统一分析数据集）
 * - 输出：DerivedDataContext（引擎计算结果）
 * - 不计算：metricResult、correlationResult、groupStats（属于 View 层）
 * 
 * Stage 1A-1 字段模型接线：
 * - 优先使用 analysisDataset.fields 计算字段可分析性评分
 * - Fallback 到 parseSummary.fieldTypes（旧链路兼容）
 */

import { useMemo } from 'react';
import { buildDerivedDataContext } from '../engine/context';
import { calculateFieldAnalyticScore } from '../utils/tableParser/fieldClassifier';
import { shouldAnalyzeField } from '../field-schema';
import type { ParseSummary } from '../utils/tableParser/types';
import type { DerivedDataContext } from '../engine/context';
import type { AnalyticScore } from '../utils/tableParser/fieldClassifier';
import type { AnalysisDataset } from './useAnalysisDataset';

export type { DerivedDataContext };

export function useDerivedData(
  analysisDataset: AnalysisDataset | null,
  parseSummary: ParseSummary | null
): DerivedDataContext | null {
  return useMemo((): DerivedDataContext | null => {
    if (!analysisDataset) return null;
    
    // 只有 ready_full 或 ready_sampled 状态才计算
    if (analysisDataset.status !== 'ready_full' && analysisDataset.status !== 'ready_sampled') {
      return null;
    }

    // 计算所有字段的可分析性评分（engine 层职责）
    const fieldScores: Record<string, AnalyticScore> = {};
    
    // 优先使用 analysisDataset.fields（Stage 1A-1 字段模型接线）
    if (analysisDataset.fields && analysisDataset.fields.length > 0) {
      for (const schema of analysisDataset.fields) {
        // 根据 ResolvedFieldSchema 判断可分析性
        const isAnalyzable = shouldAnalyzeField(schema);
        fieldScores[schema.fieldId] = {
          score: isAnalyzable ? 1.0 : 0.0,
          isAnalyzable,
          breakdown: {
            numericRatio: isAnalyzable ? 1.0 : 0.0,
            variance: isAnalyzable ? 1.0 : 0.0,
            uniquenessPenalty: 0,
            monotonicPenalty: 0,
            nameSignal: isAnalyzable ? 1.0 : 0.0,
          },
          reason: isAnalyzable ? undefined : `字段被标记为忽略或未指定`,
        };
      }
    } else if (parseSummary?.fieldTypes) {
      // Fallback: 使用 parseSummary.fieldTypes（旧链路兼容）
      for (const meta of parseSummary.fieldTypes) {
        fieldScores[meta.header] = calculateFieldAnalyticScore(meta);
      }
    } else {
      return null;
    }

    // v1.4 Phase 4：DerivedDataContext 只包含引擎计算结果
    return buildDerivedDataContext(
      analysisDataset.rows,
      fieldScores,
      // outliers 暂不在主链路中计算，后续可扩展
    );
  }, [analysisDataset, parseSummary]);
}