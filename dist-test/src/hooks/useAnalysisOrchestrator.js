/**
 * useAnalysisOrchestrator - 统一调度层（v1.7 稳定性收敛）
 *
 * 职责：dependency resolution + slice dispatch
 * 不参与：cache 管理、trace 管理、业务计算
 *
 * 缓存策略：unifiedCache（单一 invalidation，避免多层失效链）
 *
 * Slice 依赖声明（显式）：
 *
 *   metricSlice = {
 *     deps: [derivedData, selectedField, inputValue, metricDefs],
 *     triggers: 用户切换字段 / 输入值变更
 *   }
 *
 *   groupSlice = {
 *     deps: [derivedData, selectedField, selectedDimension],
 *     triggers: 用户切换维度
 *   }
 *
 *   correlationSlice = {
 *     deps: [derivedData, parseSummary, metricDefs],
 *     triggers: 数据变更 / 字段类型变更
 *   }
 *
 * 规则：
 *   - 不允许新增分析算法
 *   - 不允许新增统计逻辑
 *   - 仅允许调用 engine + hook
 */
import { useMemo } from 'react';
import { useDerivedData } from './useAnalysisContext';
import { useViewContext } from './useViewContext';
import { buildSemanticDefinitions } from '../engine/metricLayer';
import { computeMetric } from '../engine/analysisEngine';
import { analyzeCorrelationsFromContext } from '../engine/correlationAnalyzer';
import { groupByDimension } from '../engine/groupByDimension';
// ============================================================
// Slice 依赖声明（显式，禁止隐式共享 state 推导）
//
//   metricSlice:
//     deps = [derivedData, selectedField, inputValue, metricDefs]
//     triggers: 用户切换字段 / 输入值变更
//
//   groupSlice:
//     deps = [derivedData, selectedField, selectedDimension]
//     triggers: 用户切换维度
//
//   correlationSlice:
//     deps = [derivedData, parseSummary, metricDefs]
//     triggers: 数据变更 / 字段类型变更
// ============================================================
// ============================================================
// Orchestrator
// ============================================================
export function useAnalysisOrchestrator(analysisDataset, parseSummary, selectedField, inputValue, selectedDimension) {
    // ===== Dependency resolution =====
    const derivedData = useDerivedData(analysisDataset, parseSummary);
    const { metricDefs, dimensionDefs } = useMemo(() => {
        if (!parseSummary?.fieldTypes) {
            return { metricDefs: [], dimensionDefs: [] };
        }
        const semantic = buildSemanticDefinitions(parseSummary.fieldTypes);
        return { metricDefs: semantic.metrics, dimensionDefs: semantic.dimensions };
    }, [parseSummary]);
    // ===== Slice dispatch =====
    // --- metricSlice ---
    // deps: [derivedData, selectedField, inputValue, metricDefs]
    const metricResult = useMemo(() => {
        if (!derivedData || !selectedField)
            return null;
        const metricDef = metricDefs.find(m => m.name === selectedField);
        if (!metricDef)
            return null;
        const userValue = inputValue ? parseFloat(inputValue) : undefined;
        return computeMetric(derivedData, metricDef, userValue);
    }, [derivedData, metricDefs, selectedField, inputValue]);
    // --- groupSlice ---
    // deps: [derivedData, selectedField, selectedDimension]
    const groupStats = useMemo(() => {
        if (!derivedData || !selectedField || !selectedDimension)
            return null;
        return groupByDimension(derivedData.filteredRows, selectedField, selectedDimension);
    }, [derivedData, selectedField, selectedDimension]);
    // --- correlationSlice ---
    // deps: [derivedData, parseSummary, metricDefs]
    const correlationResult = useMemo(() => {
        if (!derivedData || !parseSummary?.fieldTypes)
            return null;
        return analyzeCorrelationsFromContext(derivedData, parseSummary.fieldTypes, metricDefs);
    }, [derivedData, parseSummary, metricDefs]);
    // ===== View 组装 =====
    const { viewContext } = useViewContext(derivedData, metricResult, correlationResult, groupStats);
    return {
        core: { metricResult, groupStats, correlationResult },
        derived: {
            fieldScores: derivedData?.fieldScores ?? {},
            outliers: derivedData?.outliers ?? {},
            derivedData,
        },
        view: { viewContext },
        metricDefs,
        dimensionDefs,
    };
}
