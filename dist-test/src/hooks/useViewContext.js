/**
 * useViewContext - 视图上下文 Hook（v1.6 依赖切片）
 *
 * 职责：接收预计算的 metricResult / correlationResult / groupStats，组装 ViewContext
 *
 * 架构规则（v1.6）：
 * - metricDefs 由 orchestrator 预计算，本 hook 不再自行构建
 * - metricResult / correlationResult 由 orchestrator 独立 slice 计算
 * - 本 hook 仅负责 format + adapt，禁止任何 group / metric / correlation 计算
 *
 * 禁止：
 * - ViewContext 新增任何分析逻辑
 * - View → Derived 修改数据
 * - UI → 直接计算 metric
 */
import { useMemo } from 'react';
export function useViewContext(derivedData, metricResult, correlationResult, groupStats) {
    // 组装 ViewContext（仅 format + adapt，不计算）
    const viewContext = useMemo(() => {
        if (!derivedData)
            return null;
        return {
            groupStats,
            metricResult,
            correlationResult: correlationResult
                ? correlationResult.topPositive.map(p => ({
                    fieldA: p.fieldA,
                    fieldB: p.fieldB,
                    coefficient: p.pearson,
                    strength: p.strength,
                    direction: p.direction,
                }))
                : null,
        };
    }, [derivedData, metricResult, correlationResult, groupStats]);
    return { viewContext, correlationResult };
}
