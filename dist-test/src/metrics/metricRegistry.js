/**
 * Metric Registry - 指标注册表
 *
 * 职责：将 metricId 映射到具体的 compute 函数
 *
 * 核心原则：
 * 1. analysisEngine.computeMetric 是 dispatcher，不直接包含计算逻辑
 * 2. 每个 metric 的 compute 函数从 DerivedDataContext 中读取数据
 * 3. 保持与现有行为完全一致（零行为变化）
 *
 * 依赖方向：metricRegistry → analysisEngine（单向，无循环依赖）
 */
// ============================================================
// Registry
// ============================================================
/**
 * 指标注册表
 *
 * key: metricId（对应 metricLayer.MetricDefinition.name，即字段名）
 * value: MetricDef
 *
 * 注意：由于当前系统的 metrics 是从数据动态生成的，
 * registry 使用通配符模式：任何 metricId 都通过通用 compute 函数处理。
 *
 * 未来可以扩展为预定义的特定指标（如 avg_score, pass_rate 等）。
 */
export const metricRegistry = {};
/**
 * 获取或创建 MetricDef
 *
 * 如果 metricId 不在 registry 中，动态创建一个 entry。
 * compute 函数由外部（analysisEngine）注入，避免循环依赖。
 *
 * 这确保了向后兼容：任何现有的 metricName 都可以正常工作。
 */
export function getOrCreateMetricDef(metricId, computeFactory) {
    if (!metricRegistry[metricId]) {
        metricRegistry[metricId] = {
            id: metricId,
            label: metricId,
            compute: computeFactory(metricId),
        };
    }
    return metricRegistry[metricId];
}
/**
 * 注册自定义 metric
 *
 * 用于未来扩展预定义的特定指标（如 avg_score, pass_rate 等）。
 */
export function registerMetric(def) {
    metricRegistry[def.id] = def;
}
/**
 * 获取所有已注册的 metric IDs
 */
export function getRegisteredMetricIds() {
    return Object.keys(metricRegistry);
}
