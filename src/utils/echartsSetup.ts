/**
 * ECharts 模块加载（v2.4：显式模块导入，替换原「整包动态 import + 全部 use」）。
 *
 * 背景：
 * - 旧实现 `import('echarts/charts')` + `(charts as any)[name]` 会把整个
 *   echarts/charts、echarts/components 命名空间打进运行 chunk（各约 260KB），
 *   既无 tree-shaking，又是 core→charts→components→renderers 四段串行 waterfall。
 * - 现在默认高频图表（bar / line，覆盖 Histogram / GroupBar / CDF / TimeSeries）
 *   于模块加载时静态注册，跟随 AnalysisSection / 图表 chunk，首次渲染无需动态加载。
 * - 低频图表（boxplot / pie / radar）仍按需加载，但为显式命名导入，
 *   由 Rollup 真正 tree-shake。
 */

// 显式模块导入（可被 tree-shaking 精减）
import * as echartsCore from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 模块名映射：chart type key → echarts/charts 导出名
const CHART_MODULE_NAMES: Record<string, string> = {
  bar: 'BarChart',
  line: 'LineChart',
  pie: 'PieChart',
  boxplot: 'BoxplotChart',
  scatter: 'ScatterChart',
  radar: 'RadarChart',
};

/** 静态注册的图表安装模块（默认高频：bar / line） */
const STATIC_CHARTS = [BarChart, LineChart];
/** 静态注册的组件安装模块（Title/Tooltip/Grid + bar/line 使用的扩展） */
const STATIC_COMPONENTS = [
  GridComponent,
  TooltipComponent,
  TitleComponent,
  LegendComponent,
  GraphicComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
];

/** 静态注册后即已可用的图表 + 组件名集合（用于 isEChartsReady 判定） */
const STATIC_READY_NAMES = new Set<string>([
  'BarChart',
  'LineChart',
  'GridComponent',
  'TooltipComponent',
  'TitleComponent',
  'LegendComponent',
  'GraphicComponent',
  'MarkLineComponent',
  'MarkPointComponent',
  'CanvasRenderer',
]);

// 全局图表实例（echarts/core 命名空间，含 init()/use()）
let _core: typeof echartsCore | null = null;

// 已注册（静态 + 动态）的模块名集合，用于 isEChartsReady 判定
const _loadedNames = new Set<string>(STATIC_READY_NAMES);

/** 静态注册默认高频模块（仅在 AnalysisSection / 图表 chunk 加载时执行一次） */
function registerStatic(): void {
  if (_core) return;
  echartsCore.use([...STATIC_CHARTS, ...STATIC_COMPONENTS]);
  _core = echartsCore;
}

/** 同步获取已注册的 echarts core */
export function getEChartsCore(): typeof echartsCore | null {
  registerStatic();
  return _core;
}

/** 检查指定图表类型所需模块是否已全部注册 */
export function isEChartsReady(chartTypes: string[]): boolean {
  registerStatic();
  if (!_core) return false;
  for (const t of chartTypes) {
    const name = CHART_MODULE_NAMES[t];
    if (name && !_loadedNames.has(name)) return false;
  }
  for (const c of getRequiredComponents(chartTypes)) {
    if (!_loadedNames.has(c)) return false;
  }
  return true;
}

/**
 * 确保 echarts core + 指定低频图表（boxplot / pie / radar）已加载。
 * 静态模块（bar / line）已随 chunk 注册，这里只处理动态模块，避免串行 waterfall。
 */
export async function ensureECharts(chartTypes: string[]): Promise<typeof echartsCore | null> {
  registerStatic();
  if (!_core) return _core;

  const { chartModules, compModules } = collectMissing(chartTypes);
  if (chartModules.length === 0 && compModules.length === 0) return _core;

  const modules: any[] = [];
  const namesToLoad: string[] = [];

  // 低频图表：显式命名导入（Rollup 会 tree-shake）
  if (chartModules.includes('BoxplotChart')) {
    const { BoxplotChart: M } = await import('echarts/charts');
    modules.push(M); namesToLoad.push('BoxplotChart');
  }
  if (chartModules.includes('ScatterChart')) {
    const { ScatterChart: M } = await import('echarts/charts');
    modules.push(M); namesToLoad.push('ScatterChart');
  }
  if (chartModules.includes('PieChart')) {
    const { PieChart: M } = await import('echarts/charts');
    modules.push(M); namesToLoad.push('PieChart');
  }
  if (chartModules.includes('RadarChart')) {
    const { RadarChart: M } = await import('echarts/charts');
    modules.push(M); namesToLoad.push('RadarChart');
  }

  // 低频组件：显式命名导入
  if (compModules.includes('LegendComponent')) {
    const { LegendComponent: M } = await import('echarts/components');
    modules.push(M); namesToLoad.push('LegendComponent');
  }
  if (compModules.includes('RadarComponent')) {
    const { RadarComponent: M } = await import('echarts/components');
    modules.push(M); namesToLoad.push('RadarComponent');
  }

  if (modules.length > 0) {
    echartsCore.use(modules);
    namesToLoad.forEach((n) => _loadedNames.add(n));
  }

  return _core;
}

/** 计算缺失的图表/组件模块名 */
function collectMissing(chartTypes: string[]): {
  chartModules: string[];
  compModules: string[];
} {
  registerStatic();
  const chartModules: string[] = [];
  const compModules: string[] = [];
  for (const t of chartTypes) {
    const name = CHART_MODULE_NAMES[t];
    if (name && !_loadedNames.has(name) && !chartModules.includes(name)) {
      chartModules.push(name);
    }
  }
  for (const c of getRequiredComponents(chartTypes)) {
    if (!_loadedNames.has(c) && !compModules.includes(c)) {
      compModules.push(c);
    }
  }
  return { chartModules, compModules };
}

/**
 * 根据 chartTypes 推断需要的组件（足够 bar/line/boxplot/pie/radar）。
 * 名称需与 echarts/components、echarts/renderers 的实际导出名一致。
 */
function getRequiredComponents(chartTypes: string[]): string[] {
  const comps = new Set<string>();

  comps.add('TitleComponent');
  comps.add('TooltipComponent');
  comps.add('CanvasRenderer');
  // bar/line 静态注册时已登记，此处按需补充低频组件名
  const needsGrid = chartTypes.some(t => ['bar', 'line', 'boxplot', 'scatter'].includes(t));
  if (needsGrid) comps.add('GridComponent');
  if (chartTypes.some(t => ['pie', 'radar', 'bar', 'line'].includes(t))) comps.add('LegendComponent');
  if (chartTypes.includes('line')) comps.add('MarkPointComponent');
  if (chartTypes.includes('bar')) comps.add('MarkLineComponent');
  if (chartTypes.includes('radar')) comps.add('RadarComponent');

  return Array.from(comps);
}

/**
 * 低频模块（boxplot / pie / radar）在浏览器空闲期预加载。
 * 属于纯优化项：默认 bar/line 图表首次渲染不依赖它。
 */
export function preloadECharts(chartTypes: string[]): void {
  if (isEChartsReady(chartTypes)) return;

  const doPreload = () => {
    ensureECharts(chartTypes).catch(() => {
      // 预加载失败静默忽略，正式渲染时再重试
    });
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(doPreload, { timeout: 2000 });
  } else {
    setTimeout(doPreload, 100);
  }
}