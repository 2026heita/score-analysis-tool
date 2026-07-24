/**
 * useGroupAnalysis - 分组分析 Hook（v1.4 Phase 4 分层）
 * 
 * 职责：仅管理分组维度选择状态和可用维度列表
 * 
 * 分层规则：
 * - groupStats 计算已迁移到 useViewContext（View 层）
 * - 本 hook 仅负责 UI 状态管理（selectedDimension 的选择与重置）
 * - 数据源变更时自动重置维度选择
 * 
 * Stage 1A-1 字段模型接线：
 * - 优先使用 analysisDataset.fields 获取可用维度
 * - Fallback 到 parseSummary.fieldTypes（旧链路兼容）
 * 
 * 禁止：
 * - 本 hook 不再直接计算 groupStats（由 ViewContext 统一管理）
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getAvailableDimensions } from '../engine/groupByDimension';
import type { ParsedTable } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';
import type { AnalysisDataset } from './useAnalysisDataset';

export interface UseGroupAnalysisReturn {
  selectedDimension: string;
  setSelectedDimension: (dim: string) => void;
  availableDimensions: { header: string; riskLevel: string; riskHint?: string }[];
  resetGroupAnalysis: () => void;
}

export function useGroupAnalysis(
  filteredParsedData: ParsedTable | null,
  parseSummary: ParseSummary | null,
  analysisDataset: AnalysisDataset | null = null
): UseGroupAnalysisReturn {
  const [selectedDimension, setSelectedDimension] = useState('');
  const prevDataRef = useRef<ParsedTable | null>(null);

  // v1.4 Phase 3：数据源变更时重置分组维度（依赖 filteredParsedData 身份，而非 activeTableId）
  useEffect(() => {
    if (filteredParsedData !== prevDataRef.current) {
      prevDataRef.current = filteredParsedData;
      setSelectedDimension('');
    }
  }, [filteredParsedData]);

  const availableDimensions = useMemo(() => {
    // Stage 1A-1: 优先使用 analysisDataset.fields
    if (analysisDataset?.fields && analysisDataset.fields.length > 0) {
      // 从 ResolvedFieldSchema 中提取维度字段
      return analysisDataset.fields
        .filter(schema => schema.analysisRole === 'dimension' || schema.analysisRole === 'time')
        .map(schema => ({
          header: schema.fieldId,
          riskLevel: 'safe',
          riskHint: undefined,
        }));
    }
    
    // Fallback: 使用 parseSummary.fieldTypes（旧链路兼容）
    if (!parseSummary?.fieldTypes) return [];
    return getAvailableDimensions(parseSummary.fieldTypes).filter(d => d.riskLevel !== 'excluded');
  }, [analysisDataset, parseSummary]);

  const resetGroupAnalysis = useCallback(() => {
    setSelectedDimension('');
  }, []);

  return {
    selectedDimension,
    setSelectedDimension,
    availableDimensions,
    resetGroupAnalysis,
  };
}