/**
 * v1.9.1: ECharts 按需加载 + 预加载优化。
 *
 * - ensureECharts(): 按需 dynamic import chart/component 模块
 * - preloadECharts(): requestIdleCallback 预加载，不阻塞首屏
 * - getEChartsCore(): 同步获取已缓存的 echarts core（避免重复 import）
 */
// 模块名映射：chart type key → echarts/charts 导出名
const CHART_MODULE_NAMES = {
    bar: 'BarChart',
    line: 'LineChart',
    pie: 'PieChart',
    boxplot: 'BoxplotChart',
    scatter: 'ScatterChart',
    radar: 'RadarChart',
};
// 已加载的模块集合（全局缓存）
const _loaded = new Set();
// echarts 核心实例（全局缓存）
let _core = null;
// 加载中的 Promise（防止重复加载）
let _loadingPromise = null;
/** 同步获取已缓存的 echarts core（仅在 ensureECharts 完成后可用） */
export function getEChartsCore() {
    return _core;
}
/** 检查指定模块是否已加载 */
export function isEChartsReady(chartTypes) {
    if (!_core)
        return false;
    for (const t of chartTypes) {
        const name = CHART_MODULE_NAMES[t];
        if (name && !_loaded.has(name))
            return false;
    }
    for (const c of getRequiredComponents(chartTypes)) {
        if (!_loaded.has(c))
            return false;
    }
    return true;
}
/** 确保 echarts core + 指定的 chart / component 模块已加载 */
export async function ensureECharts(chartTypes) {
    // 如果正在加载中，等待完成
    if (_loadingPromise) {
        await _loadingPromise;
        // 加载完成后检查是否已覆盖所需模块
        if (isEChartsReady(chartTypes))
            return _core;
    }
    const toLoad = [];
    for (const t of chartTypes) {
        const name = CHART_MODULE_NAMES[t];
        if (name && !_loaded.has(name)) {
            toLoad.push(name);
        }
    }
    const componentNames = getRequiredComponents(chartTypes);
    for (const c of componentNames) {
        if (!_loaded.has(c)) {
            toLoad.push(c);
        }
    }
    if (!_core && toLoad.length === 0) {
        // core 未加载但模块已加载（不应该发生，但兜底）
        toLoad.push('*core*');
    }
    if (toLoad.length === 0 && _core)
        return _core;
    // 防止并发加载
    _loadingPromise = _doLoad(toLoad);
    try {
        _core = await _loadingPromise;
        return _core;
    }
    finally {
        _loadingPromise = null;
    }
}
async function _doLoad(toLoad) {
    // 加载 core（仅一次）
    if (!_core) {
        _core = await import('echarts/core');
        _loaded.add('*core*');
    }
    // 过滤出仍需加载的模块
    const chartModules = toLoad.filter(n => Object.values(CHART_MODULE_NAMES).includes(n) && !_loaded.has(n));
    const compModules = toLoad.filter(n => !Object.values(CHART_MODULE_NAMES).includes(n) && !_loaded.has(n) && n !== '*core*');
    const modules = [];
    if (chartModules.length > 0) {
        const charts = await import('echarts/charts');
        for (const name of chartModules) {
            const mod = charts[name];
            if (mod) {
                modules.push(mod);
                _loaded.add(name);
            }
        }
    }
    if (compModules.length > 0) {
        const components = await import('echarts/components');
        for (const name of compModules) {
            const mod = components[name];
            if (mod) {
                modules.push(mod);
                _loaded.add(name);
            }
        }
    }
    if (compModules.includes('CanvasRenderer')) {
        const renderers = await import('echarts/renderers');
        if (renderers.CanvasRenderer) {
            modules.push(renderers.CanvasRenderer);
            _loaded.add('CanvasRenderer');
        }
    }
    if (modules.length > 0) {
        _core.use(modules);
    }
    return _core;
}
/**
 * v1.9.1: 使用 requestIdleCallback 预加载 echarts 模块。
 * 在用户可能触发图表前（hover / dataset ready）调用，
 * 不阻塞首屏渲染。
 */
export function preloadECharts(chartTypes) {
    if (isEChartsReady(chartTypes))
        return;
    const doPreload = () => {
        ensureECharts(chartTypes).catch(() => {
            // 预加载失败静默忽略，正式渲染时再重试
        });
    };
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(doPreload, { timeout: 2000 });
    }
    else {
        // 降级：使用 setTimeout
        setTimeout(doPreload, 100);
    }
}
/** 根据 chartTypes 推断需要的 component */
function getRequiredComponents(chartTypes) {
    const comps = new Set();
    comps.add('TitleComponent');
    comps.add('TooltipComponent');
    comps.add('CanvasRenderer');
    const needsGrid = chartTypes.some(t => ['bar', 'line', 'boxplot', 'scatter'].includes(t));
    if (needsGrid) {
        comps.add('GridComponent');
    }
    const needsLegend = chartTypes.some(t => ['pie', 'radar', 'bar', 'line'].includes(t));
    if (needsLegend) {
        comps.add('LegendComponent');
    }
    if (chartTypes.includes('line')) {
        comps.add('MarkPointComponent');
    }
    if (chartTypes.includes('bar')) {
        comps.add('MarkLineComponent');
    }
    return Array.from(comps);
}
