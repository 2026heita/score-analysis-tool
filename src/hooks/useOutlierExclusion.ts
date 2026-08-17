/**
 * useOutlierExclusion - 异常值排除状态管理（v2.2.x）
 *
 * 分层职责：
 * - 原始数据（analysisDataset.rows）永不被修改
 * - 排除只是"过滤当前分析行"的一层状态（按字段保存排除的行下标）
 * - 下游 computeMetric / 统计 / 图表 / 百分位 全部基于"排除后的行"重算
 *
 * 数据层级（清晰、可还原）：
 *   原始数据 -> 普通筛选后的 analysisRows -> 异常值排除后的分析行
 *
 * 设计要点：
 * 1. excludedByField：字段名 → 被排除行下标集合（下标指向 analysisRows）
 * 2. 切换字段不会把 A 字段的下标错误地用到 B 字段（按字段隔离）
 * 3. analysisRowsAfterExclusion = 过滤掉有效排除行的新数组（不改原数组）
 * 4. 检测基于"完整当前分析行"（含已排除候选），便于面板展示所有候选并可恢复
 */

import { useMemo, useState, useCallback } from 'react';
import { detectOutliersFromValues, classifyOutlierStrategy } from '../engine/univariateAnalyzer';
import {
  extractFieldNumericValues,
  filterRowsExcluding,
} from '../engine/outlierExclusion';

const EMPTY_SET = new Set<number>();

export interface OutlierExclusionState {
  /** 当前字段已排除的行下标集合（指向 analysisRows） */
  excludedRowIndices: ReadonlySet<number>;
  /** 更新当前字段的排除行下标 */
  setExcludedRowIndices: (next: Set<number>) => void;
  /** 检测用数值：从"完整当前分析行"提取（供面板展示） */
  detectionValues: number[];
  /** 与 detectionValues 一一对应的真实行下标 */
  detectionRowIndices: number[];
  /** 排除后用于分析的完整数据行（不修改原始数组引用） */
  analysisRowsAfterExclusion: Record<string, string>[];
  /** 完整当前分析行（普通筛选后、未做异常值排除） */
  originalRows: Record<string, string>[];
  /** 有效排除行下标（用户手动排除 ∪ 自动排除，用于最终分析过滤） */
  analysisExcludedRowIndices: ReadonlySet<number>;
}

export function useOutlierExclusion(
  analysisRows: Record<string, string>[] | null | undefined,
  selectedField: string
): OutlierExclusionState {
  const [excludedByField, setExcludedByField] = useState<Record<string, ReadonlySet<number>>>({});

  const originalRows = useMemo(() => analysisRows ?? [], [analysisRows]);

  // 当前字段已排除的行下标（切换字段即隔离）
  const excludedRowIndices = useMemo(
    () => excludedByField[selectedField] ?? EMPTY_SET,
    [excludedByField, selectedField]
  );

  const setExcludedRowIndices = useCallback((next: Set<number>) => {
    setExcludedByField(prev => ({ ...prev, [selectedField]: new Set(next) }));
  }, [selectedField]);

  // 检测用数值：基于完整当前分析行（含未排除候选），并带上真实行下标
  const detection = useMemo(
    () => extractFieldNumericValues(originalRows, selectedField),
    [originalRows, selectedField]
  );

  // 自动排除（明显错误值 ≤ ERROR_VALUE_THRESHOLD）的真实行下标
  const autoExcludedRowIndices = useMemo((): ReadonlySet<number> => {
    const { values, rowIndices } = detection;
    if (values.length < 4) return EMPTY_SET;
    const autoSet = new Set<number>();
    for (const o of detectOutliersFromValues(values)) {
      const { strategy } = classifyOutlierStrategy(o.value, o.zScore);
      if (strategy === 'auto-exclude') {
        const real = rowIndices[o.rowIndex];
        if (real !== undefined) autoSet.add(real);
      }
    }
    return autoSet;
  }, [detection]);

  // 有效排除 = 用户手动排除 ∪ 自动排除
  const analysisExcludedRowIndices = useMemo((): ReadonlySet<number> => {
    if (excludedRowIndices.size === 0 && autoExcludedRowIndices.size === 0) {
      return EMPTY_SET;
    }
    const merged = new Set<number>();
    for (const idx of excludedRowIndices) merged.add(idx);
    for (const idx of autoExcludedRowIndices) merged.add(idx);
    return merged;
  }, [excludedRowIndices, autoExcludedRowIndices]);

  // 排除后的分析行 = 完整当前分析行 过滤掉有效排除的行
  const analysisRowsAfterExclusion = useMemo(
    () => filterRowsExcluding(originalRows, analysisExcludedRowIndices),
    [originalRows, analysisExcludedRowIndices]
  );

  return {
    excludedRowIndices,
    setExcludedRowIndices,
    detectionValues: detection.values,
    detectionRowIndices: detection.rowIndices,
    analysisRowsAfterExclusion,
    originalRows,
    analysisExcludedRowIndices,
  };
}