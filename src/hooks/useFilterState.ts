/**
 * useFilterState - 筛选状态 Hook
 * 
 * 职责：管理筛选条件、筛选结果、筛选后数据
 * 
 * 封装内容：
 * - filterConditions / filterCollapsed（筛选 UI 状态）
 * - numericFieldSet（数值字段集合）
 * - filterResult（筛选结果）
 * - filteredParsedData（筛选后的表格数据）
 * - resetFilter（重置筛选状态）
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { filterRows, buildNumericFieldSet } from '../engine/filterRows';
import type { FilterCondition } from '../engine/filterRows';
import type { ParsedTable } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';

const DEFAULT_CONDITIONS: FilterCondition[] = [{ field: '', operator: 'equals', value: '' }];

export interface UseFilterStateReturn {
  filterConditions: FilterCondition[];
  setFilterConditions: (conditions: FilterCondition[]) => void;
  filterCollapsed: boolean;
  setFilterCollapsed: (collapsed: boolean) => void;
  numericFieldSet: Set<string>;
  filterResult: {
    filteredRows: Record<string, string>[];
    filterSummary: {
      originalCount: number;
      filteredCount: number;
      filterRatio: number;
      activeConditions: number;
    };
  } | null;
  filteredParsedData: ParsedTable | null;
  resetFilter: () => void;
}

export function useFilterState(
  parsedData: ParsedTable | null,
  parseSummary: ParseSummary | null,
  activeTableId: number = 0
): UseFilterStateReturn {
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>(DEFAULT_CONDITIONS);
  const [filterCollapsed, setFilterCollapsed] = useState(true);

  // v1.4：数据源切换时重置筛选条件
  useEffect(() => {
    setFilterConditions(DEFAULT_CONDITIONS);
    setFilterCollapsed(true);
  }, [activeTableId]);

  const numericFieldSet = useMemo(() => {
    if (!parseSummary?.fieldTypes) return new Set<string>();
    return buildNumericFieldSet(parseSummary.fieldTypes);
  }, [parseSummary]);

  const filterResult = useMemo(() => {
    if (!parsedData) return null;
    return filterRows(parsedData.rows, filterConditions, numericFieldSet);
  }, [parsedData, filterConditions, numericFieldSet]);

  const filteredParsedData = useMemo(() => {
    if (!parsedData || !filterResult) return parsedData;
    if (filterResult.filterSummary.activeConditions === 0) return parsedData;
    return { ...parsedData, rows: filterResult.filteredRows };
  }, [parsedData, filterResult]);

  const resetFilter = useCallback(() => {
    setFilterConditions(DEFAULT_CONDITIONS);
    setFilterCollapsed(true);
  }, []);

  return {
    filterConditions,
    setFilterConditions,
    filterCollapsed,
    setFilterCollapsed,
    numericFieldSet,
    filterResult,
    filteredParsedData,
    resetFilter,
  };
}