/**
 * 统一分析上下文类型定义（v1.4 分层架构）
 *
 * 三层结构：
 * - RawDataContext：原始数据，仅由 activeTableId 驱动
 * - DerivedDataContext：计算结果（筛选、评分、异常值），由 RawData 派生
 * - ViewContext：UI 展示数据（分组、指标、图表），由 DerivedData 派生
 *
 * 核心原则：
 * 1. engine 只负责 DerivedData，UI 只负责 ViewData
 * 2. RawData 不允许在 UI 层直接计算
 * 3. activeTableId 只能影响 RawData，不能直接触发 ViewContext 重算
 */
/**
 * 构建派生数据上下文
 *
 * v1.4 Phase 4：DerivedDataContext 只包含引擎计算结果
 * - filteredRows：筛选后的数据行
 * - fieldScores：字段可分析性评分
 * - outliers：异常值检测结果
 */
export function buildDerivedDataContext(filteredRows, fieldScores = {}, outliers = {}) {
    return { filteredRows, fieldScores, outliers };
}
/**
 * @deprecated 使用 buildDerivedDataContext 替代
 * 构建分析上下文（向后兼容）
 */
export function buildAnalysisContext(fields, rawRows, metrics, _dimensions, activeTableId = 0, fieldScores = {}, outliers = {}) {
    return {
        fields,
        rawRows,
        filteredRows: rawRows,
        metrics,
        activeTableId,
        fieldScores,
        outliers,
    };
}
/**
 * 判断指标是否为"越小越好"
 */
export function isLowerIsBetter(metric) {
    return metric.direction === 'lower-is-better';
}
