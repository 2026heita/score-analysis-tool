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
 * 禁止：
 * - 本 hook 不再直接计算 groupStats（由 ViewContext 统一管理）
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getAvailableDimensions } from '../engine/groupByDimension';
export function useGroupAnalysis(filteredParsedData, parseSummary) {
    const [selectedDimension, setSelectedDimension] = useState('');
    const prevDataRef = useRef(null);
    // v1.4 Phase 3：数据源变更时重置分组维度（依赖 filteredParsedData 身份，而非 activeTableId）
    useEffect(() => {
        if (filteredParsedData !== prevDataRef.current) {
            prevDataRef.current = filteredParsedData;
            setSelectedDimension('');
        }
    }, [filteredParsedData]);
    const availableDimensions = useMemo(() => {
        if (!parseSummary?.fieldTypes)
            return [];
        return getAvailableDimensions(parseSummary.fieldTypes).filter(d => d.riskLevel !== 'excluded');
    }, [parseSummary]);
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
