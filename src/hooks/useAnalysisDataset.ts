/**
 * useAnalysisDataset - 统一分析数据集管理
 * 
 * 职责：
 * 1. 基于 filteredParsedData 生成 AnalysisDataset
 * 2. 实现超过5000行时的确认/取消机制
 * 3. 维护 datasetKey 确保数据一致性
 * 4. 提供统一的分析数据入口
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { systematic_even_v1, sampleRows } from '../engine/sampling';
import type { ParsedTable } from '../types';

/** 分析数据集状态 */
export type AnalysisDatasetStatus = 
  | 'no_data'              // 无数据
  | 'parse_truncated'      // 解析被截断（>20000行）
  | 'awaiting_confirmation' // 等待确认（>5000行）
  | 'cancelled'            // 用户取消
  | 'ready_full'           // 就绪（全量分析）
  | 'ready_sampled';       // 就绪（抽样分析）

/** 抽样信息 */
export interface SamplingInfo {
  algorithm: 'systematic_even_v1';
  originalRowCount: number;
  sampledRowCount: number;
  indices: number[];
}

/** 分析数据集 */
export interface AnalysisDataset {
  rows: Record<string, string>[];
  headers: string[];
  status: AnalysisDatasetStatus;
  datasetKey: string;
  samplingInfo: SamplingInfo | null;
}

/** 分析数据集状态 */
export interface AnalysisDatasetState {
  dataset: AnalysisDataset | null;
  confirmedDatasetKey: string | null;
  cancelledDatasetKey: string | null;
  confirmDataset: (key: string) => void;
  cancelDataset: (key: string) => void;
}

const ANALYSIS_SAMPLE_SIZE = 5000;

/**
 * 生成稳定的 datasetKey
 */
function generateDatasetKey(
  dataRevision: number,
  filterRevision: number
): string {
  return `${dataRevision}-${filterRevision}`;
}

/**
 * 创建分析数据集
 */
export function useAnalysisDataset(
  filteredParsedData: ParsedTable | null,
  dataRevision: number,
  filterRevision: number
): AnalysisDatasetState {
  const [confirmedDatasetKey, setConfirmedDatasetKey] = useState<string | null>(null);
  const [cancelledDatasetKey, setCancelledDatasetKey] = useState<string | null>(null);

  const datasetKey = useMemo(
    () => generateDatasetKey(dataRevision, filterRevision),
    [dataRevision, filterRevision]
  );

  // 数据变化时清除旧的确认/取消状态
  useEffect(() => {
    if (confirmedDatasetKey && confirmedDatasetKey !== datasetKey) {
      setConfirmedDatasetKey(null);
    }
    if (cancelledDatasetKey && cancelledDatasetKey !== datasetKey) {
      setCancelledDatasetKey(null);
    }
  }, [datasetKey, confirmedDatasetKey, cancelledDatasetKey]);

  const dataset = useMemo((): AnalysisDataset | null => {
    if (!filteredParsedData) {
      return null;
    }

    const rowCount = filteredParsedData.rows.length;
    const headers = filteredParsedData.headers;

    // 无数据
    if (rowCount === 0) {
      return {
        rows: [],
        headers,
        status: 'no_data',
        datasetKey,
        samplingInfo: null,
      };
    }

    // Stage 0A-1: 解析截断（>20000行）- 阻断分析，不进入抽样
    if (rowCount > 20000) {
      return {
        rows: [],
        headers,
        status: 'parse_truncated',
        datasetKey,
        samplingInfo: null,
      };
    }

    // 全量分析（<=5000行）
    if (rowCount <= ANALYSIS_SAMPLE_SIZE) {
      return {
        rows: filteredParsedData.rows,
        headers,
        status: 'ready_full',
        datasetKey,
        samplingInfo: null,
      };
    }

    // 需要抽样（>5000行）
    // 检查是否已确认
    if (confirmedDatasetKey !== datasetKey) {
      // 未确认，检查是否已取消
      if (cancelledDatasetKey === datasetKey) {
        return {
          rows: [],
          headers,
          status: 'cancelled',
          datasetKey,
          samplingInfo: null,
        };
      }
      // 等待确认
      return {
        rows: [],
        headers,
        status: 'awaiting_confirmation',
        datasetKey,
        samplingInfo: null,
      };
    }

    // 已确认，执行抽样
    const indices = systematic_even_v1(rowCount, ANALYSIS_SAMPLE_SIZE);
    const sampledRows = sampleRows(filteredParsedData.rows, indices);

    return {
      rows: sampledRows,
      headers,
      status: 'ready_sampled',
      datasetKey,
      samplingInfo: {
        algorithm: 'systematic_even_v1',
        originalRowCount: rowCount,
        sampledRowCount: ANALYSIS_SAMPLE_SIZE,
        indices,
      },
    };
  }, [filteredParsedData, datasetKey, confirmedDatasetKey, cancelledDatasetKey]);

  const confirmDataset = useCallback((key: string) => {
    setConfirmedDatasetKey(key);
    setCancelledDatasetKey(null);
  }, []);

  const cancelDataset = useCallback((key: string) => {
    setCancelledDatasetKey(key);
    setConfirmedDatasetKey(null);
  }, []);

  return {
    dataset,
    confirmedDatasetKey,
    cancelledDatasetKey,
    confirmDataset,
    cancelDataset,
  };
}
