/**
 * useMetricResult - 指标结果提取 Hook（v1.4 Phase 4）
 * 
 * 职责：从 ViewContext 的 metricResult 中提取 stats / position / fieldValues
 * 不再自行计算 metric，由 useViewContext 统一提供。
 * 
 * 分层规则：
 * - View 层 hook，只做数据提取，不进行任何计算
 */

import { useMemo } from 'react';
import type { MetricResult } from '../engine/context';
import type { StatsResult, PositionResult } from '../types';

export interface UseMetricResultReturn {
  metricResult: MetricResult | null;
  stats: StatsResult | null;
  position: PositionResult | null;
  fieldValues: number[];
}

export function useMetricResult(
  metricResult: MetricResult | null,
): UseMetricResultReturn {
  const stats: StatsResult | null = useMemo(() => {
    return metricResult?.stats || null;
  }, [metricResult]);

  const position: PositionResult | null = useMemo(() => {
    return metricResult?.position || null;
  }, [metricResult]);

  const fieldValues = useMemo(() => {
    return metricResult?.values || [];
  }, [metricResult]);

  return { metricResult, stats, position, fieldValues };
}