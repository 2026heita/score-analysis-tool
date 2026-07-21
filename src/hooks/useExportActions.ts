/**
 * useExportActions - 导出操作 Hook
 * 
 * 职责：封装三个 CSV 导出回调函数
 * 
 * 封装内容：
 * - handleExportFilteredData（导出筛选后数据 CSV）
 * - handleExportGroupAnalysis（导出分组分析 CSV）
 * - handleExportMetricSummary（导出指标摘要 CSV）
 */

import { useCallback } from 'react';
import {
  exportGroupStatsToCsv,
  exportFilteredRowsToCsv,
  exportSummaryToCsv,
  triggerDownload,
  formatTimestamp,
} from '../engine/exportAnalysis';
import type { GroupStats } from '../engine/groupByDimension';
import type { MetricResult } from '../engine/context';
import type { StatsResult, PositionResult, ParsedTable } from '../types';
import type { SamplingInfo } from './useAnalysisDataset';

export interface UseExportActionsReturn {
  handleExportFilteredData: () => void;
  handleExportGroupAnalysis: () => void;
  handleExportMetricSummary: () => void;
}

export function useExportActions(
  filteredParsedData: ParsedTable | null,
  filterResult: { filterSummary: { activeConditions: number } } | null,
  groupStats: GroupStats[] | null,
  metricResult: MetricResult | null,
  stats: StatsResult | null,
  position: PositionResult | null,
  selectedField: string,
  samplingInfo: SamplingInfo | null = null
): UseExportActionsReturn {
  // 导出筛选后数据（原始数据导出，不是分析结果）
  const handleExportFilteredData = useCallback(() => {
    if (!filteredParsedData || !filterResult || filterResult.filterSummary.activeConditions === 0) return;
    const ts = formatTimestamp();
    triggerDownload(
      exportFilteredRowsToCsv(filteredParsedData.rows, filteredParsedData.headers),
      `filtered-data-${ts}.csv`
    );
  }, [filteredParsedData, filterResult]);

  // 导出分组分析（分析结果导出）
  const handleExportGroupAnalysis = useCallback(() => {
    if (!groupStats || groupStats.length === 0) return;
    const ts = formatTimestamp();
    triggerDownload(
      exportGroupStatsToCsv(groupStats),
      `group-analysis-${ts}.csv`
    );
  }, [groupStats]);

  // 导出指标摘要（分析结果导出，Stage 0A-2: 记录抽样信息）
  const handleExportMetricSummary = useCallback(() => {
    if (!stats && !position) return;
    const ts = formatTimestamp();
    triggerDownload(
      exportSummaryToCsv(metricResult, stats, position, selectedField, samplingInfo),
      `metric-summary-${ts}.csv`
    );
  }, [metricResult, stats, position, selectedField, samplingInfo]);

  return {
    handleExportFilteredData,
    handleExportGroupAnalysis,
    handleExportMetricSummary,
  };
}