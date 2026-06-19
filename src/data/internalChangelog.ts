/**
 * internalChangelog - 内部开发日志（v1.7 引入）
 * 
 * 职责：记录开发阶段完成情况，不对用户发布
 * 
 * 与 updateLogs（用户公告）的区别：
 *   - internalChangelog：面向开发者，可频繁更新，包含技术细节
 *   - updateLogs：面向用户，仅 release 时生成，禁止技术术语
 * 
 * 规则：
 *   - 每完成一个开发阶段，在此追加一条记录
 *   - 可包含 hook / context / orchestrator / cache / trace 等内部实现
 *   - 不经过 tsc/build/test 验证即可记录（但建议标注状态）
 * 
 * 禁止：
 *   - 将此文件内容展示给用户
 *   - 将此文件内容合并到 updateLogs
 */

export interface InternalChangelogEntry {
  /** 开发阶段标识（如 "v1.4 P4"） */
  phase: string;
  /** 记录日期 */
  date: string;
  /** 一行摘要 */
  summary: string;
  /** 技术细节（可包含架构/实现术语） */
  details: string[];
  /** 完成状态 */
  status: 'completed' | 'in-progress' | 'planned';
}

const _internalChangelog: InternalChangelogEntry[] = [
  {
    phase: 'v1.9.2',
    date: '2026-06-19',
    summary: 'Runtime polish：ECharts 预加载 + chart instance 缓存 + transform memoization',
    status: 'completed',
    details: [
      'echartsSetup 新增 preloadECharts() / getEChartsCore() / isEChartsReady()',
      'EChartsWrapper 使用 requestIdleCallback 预加载 + 缓存 core 实例避免重复 import',
      'chartAdapter 增加 WeakMap memo cache，toXxxProps 避免重复 transform',
      'AnalysisSection 增加 metricResult 触发 preload 和 chartProps useMemo 缓存',
    ],
  },
  {
    phase: 'v1.9.1',
    date: '2026-06-19',
    summary: 'Worker 化 + ECharts 按需拆分 + vendor 细分',
    status: 'completed',
    details: [
      '创建 EChartsWrapper 替代 echarts-for-react，按需 dynamic import echarts 模块',
      'echartsSetup 管理 echarts/core + charts/components/renderers 按需加载',
      '7 个图表组件全部替换为 EChartsWrapper，按 chartTypes 声明所需模块',
      'xlsx 解析移至 Web Worker（src/workers/xlsx.worker.ts），主线程不再导入 xlsx',
      'parseInWorker 封装 Worker 通信，parseWorkbook 通过 Worker 读取 Excel',
      'vite.config 移除 vendor-echarts 和 vendor-xlsx 强制 chunk，由 dynamic import 自然拆分',
    ],
  },
  {
    phase: 'v1.8',
    date: '2026-06-19',
    summary: 'Code splitting：React.lazy + manualChunks 降低首屏加载体积',
    status: 'completed',
    details: [
      '创建 AnalysisSection 组件，整合所有分析相关逻辑，通过 React.lazy 延迟加载',
      'App.tsx 使用 Suspense 包裹懒加载的 AnalysisSection',
      'vite.config manualChunks 拆分为 vendor-react/vendor/engine/charts/analysis',
      '首屏 bundle 从 1.8MB 降至 ~410KB（降幅 77%）',
    ],
  },
  {
    phase: 'v1.7 P1',
    date: '2026-06-18',
    summary: '稳定性收敛：统一缓存、trace 降级、orchestrator 简化',
    status: 'completed',
    details: [
      '创建 useUnifiedCache 统一缓存层，替代 rawCache/derivedCache/viewCache 三层缓存',
      'usePipelineTrace 默认 enabled=false，不参与 production execution path',
      'useAnalysisOrchestrator 精简为仅 dependency resolution + slice dispatch',
      '移除 trace 从 slice 依赖数组，消除隐性依赖',
      'slice 依赖显式声明（metricSlice/groupSlice/correlationSlice）',
    ],
  },
  {
    phase: 'v1.6',
    date: '2026-06-18',
    summary: '稳定性优化：依赖切片 + 缓存分层 + pipeline trace',
    status: 'completed',
    details: [
      '创建 usePipelineTrace 调试追踪系统，记录每个 slice 的输入输出和耗时',
      'useAnalysisOrchestrator 拆为三个独立 slice：metricSlice/groupSlice/correlationSlice',
      'useViewContext 精简为纯组装器，接受预计算 metricDefs',
      '三层缓存：rawCache（derivedData）/ derivedCache（metricDefs）/ viewCache（slice 结果）',
    ],
  },
  {
    phase: 'v1.5 P2',
    date: '2026-06-18',
    summary: 'Orchestrator 轻量化：输出结构重组',
    status: 'completed',
    details: [
      'orchestrator 输出重组为 core/derived/view 三层嵌套结构',
      '移除 useMetricResult 依赖，stats/position/fieldValues 由 View 层自行提取',
    ],
  },
  {
    phase: 'v1.5 P1',
    date: '2026-06-18',
    summary: 'Orchestration 层抽离：引入统一调度层',
    status: 'completed',
    details: [
      '创建 useAnalysisOrchestrator 统一调度层',
      'App.tsx 精简为纯 UI 层，不再直接调用 engine 或计算 groupStats',
      'orchestrator 内部调用 useDerivedData → groupByDimension → useViewContext → useMetricResult',
    ],
  },
  {
    phase: 'v1.4 P5',
    date: '2026-06-18',
    summary: '架构冻结：ViewContext 职责冻结 + groupByDimension 归属 engine',
    status: 'completed',
    details: [
      'ViewContext 移除 groupByDimension 计算，仅引用 engine 预计算结果',
      'groupByDimension 归属 engine 层（唯一归属）',
      'useViewContext 参数改为接收预计算的 groupStats',
    ],
  },
  {
    phase: 'v1.4 P4',
    date: '2026-06-18',
    summary: 'ViewContext 独立化与分析层收敛',
    status: 'completed',
    details: [
      'DerivedDataContext 精简为 filteredRows/fieldScores/outliers',
      '创建 useViewContext hook 独立计算 metric/group/correlation',
      'useAnalysisContext 重命名为 useDerivedData',
      'computeMetric 改为直接接收 MetricDefinition 参数',
      'analyzeCorrelationsFromContext 新增 fields 和 metrics 参数',
      'useMetricResult 改为直接消费 ViewContext 结果',
      'DebugPanel 新增 metricDef 属性',
    ],
  },
];

// ─── 冻结 ────────────────────────────────────────────────────────

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj as Readonly<T>;
}

for (const entry of _internalChangelog) {
  deepFreeze(entry);
}

export const internalChangelog: readonly InternalChangelogEntry[] = Object.freeze(_internalChangelog);

/**
 * 追加一条内部开发日志
 */
export function appendInternalChangelog(
  existing: readonly InternalChangelogEntry[],
  entry: InternalChangelogEntry,
): readonly InternalChangelogEntry[] {
  deepFreeze(entry);
  return Object.freeze([entry, ...existing]);
}