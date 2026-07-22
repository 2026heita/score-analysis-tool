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
const DEFAULT_CONDITIONS = [{ field: '', operator: 'equals', value: '' }];
export function useFilterState(parsedData, parseSummary, activeTableId = 0) {
    const [filterConditions, setFilterConditions] = useState(DEFAULT_CONDITIONS);
    const [filterCollapsed, setFilterCollapsed] = useState(true);
    // v1.4：数据源切换时重置筛选条件
    useEffect(() => {
        setFilterConditions(DEFAULT_CONDITIONS);
        setFilterCollapsed(true);
    }, [activeTableId]);
    const numericFieldSet = useMemo(() => {
        if (!parseSummary?.fieldTypes)
            return new Set();
        return buildNumericFieldSet(parseSummary.fieldTypes);
    }, [parseSummary]);
    const filterResult = useMemo(() => {
        if (!parsedData)
            return null;
        return filterRows(parsedData.rows, filterConditions, numericFieldSet);
    }, [parsedData, filterConditions, numericFieldSet]);
    const filteredParsedData = useMemo(() => {
        if (!parsedData || !filterResult)
            return parsedData;
        if (filterResult.filterSummary.activeConditions === 0)
            return parsedData;
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
