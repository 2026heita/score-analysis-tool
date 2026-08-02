import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  base: isGitHubPages ? '/score-analysis-tool/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // vendor: node_modules 依赖（React, 其他工具库）
          // v1.9: echarts / xlsx 不强制打入 vendor，由 dynamic import 自然拆分
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            // echarts + xlsx: 由 dynamic import / Worker 自然拆分，不强制归入 vendor
            if (id.includes('echarts') || id.includes('xlsx')) {
              return;
            }
            return 'vendor';
          }

          // engine: 分析引擎核心模块
          if (id.includes('/engine/')) {
            return 'engine';
          }

          // charts: 图表组件（echarts 渲染）
          if (id.includes('/components/charts/')) {
            return 'charts';
          }

          // analysis: orchestrator + hooks（调度层）
          if (
            id.includes('/hooks/useAnalysisOrchestrator') ||
            id.includes('/hooks/useAnalysisContext') ||
            id.includes('/hooks/useViewContext') ||
            id.includes('/hooks/useMetricResult') ||
            id.includes('/hooks/useFilterState') ||
            id.includes('/hooks/useGroupAnalysis') ||
            id.includes('/hooks/useExportActions') ||
            id.includes('/hooks/useUnifiedCache') ||
            id.includes('/hooks/usePipelineTrace') ||
            id.includes('/hooks/usePersistedState') ||
            id.includes('/hooks/useParsedTable')
          ) {
            return 'analysis';
          }
        },
      },
    },
  },
})