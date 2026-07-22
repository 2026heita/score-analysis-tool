/**
 * Chart 组件适配器
 *
 * 职责：将 MetricResult 转换为 chart 组件需要的旧 props 格式
 * 过渡期使用，未来 chart 组件可以直接接收 MetricResult
 *
 * v1.9.1: 增加 memo cache，避免重复 transform pipeline execution
 */
// 简单的 memo 缓存：WeakMap 键为 MetricResult 引用，值为计算结果
const _histogramCache = new WeakMap();
const _boxPlotCache = new WeakMap();
const _cdfCache = new WeakMap();
const _quartileCache = new WeakMap();
/**
 * 将 MetricResult 转换为 HistogramChart 的 props
 */
export function toHistogramProps(result) {
    const cached = _histogramCache.get(result);
    if (cached)
        return cached;
    const props = {
        values: result.values,
        fieldName: result.displayName,
        userValue: result.userValue,
    };
    _histogramCache.set(result, props);
    return props;
}
/**
 * 将 MetricResult 转换为 BoxPlotChart 的 props
 */
export function toBoxPlotProps(result) {
    const cached = _boxPlotCache.get(result);
    if (cached)
        return cached;
    const props = {
        values: result.values,
        fieldName: result.displayName,
        stats: result.stats
            ? {
                min: result.stats.min,
                q25: result.stats.q25,
                median: result.stats.median,
                q75: result.stats.q75,
                max: result.stats.max,
            }
            : undefined,
        userValue: result.userValue,
    };
    _boxPlotCache.set(result, props);
    return props;
}
/**
 * 将 MetricResult 转换为 CdfChart 的 props
 */
export function toCdfProps(result) {
    const cached = _cdfCache.get(result);
    if (cached)
        return cached;
    const props = {
        values: result.values,
        fieldName: result.displayName,
        userValue: result.userValue,
    };
    _cdfCache.set(result, props);
    return props;
}
/**
 * 将 MetricResult 转换为 QuartilePieChart 的 props
 */
export function toQuartilePieProps(result) {
    const cached = _quartileCache.get(result);
    if (cached)
        return cached;
    const props = {
        values: result.values,
        fieldName: result.displayName,
        userValue: result.userValue,
    };
    _quartileCache.set(result, props);
    return props;
}
