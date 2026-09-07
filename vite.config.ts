import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  base: isGitHubPages ? '/score-analysis-tool/' : '/',
  plugins: [react()],
  build: {
    // echarts 为独立懒加载 chunk（单库边界），体积略超默认 500kB 属预期，调高阈值避免误报
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // vendor: node_modules 依赖（React, 其他工具库）
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            // echarts: 独立 chunk，随 AnalysisSection/图表懒加载图并行加载，
            // 避免静态导入的 echarts 被 Rollup 提升进主入口（防主 chunk 膨胀）。
            // zrender 也被 echarts 使用，一并归入。
            if (id.includes('echarts') || id.includes('zrender')) {
              return 'echarts';
            }
            // xlsx: 由 Worker 自然拆分，不强制归入 vendor
            if (id.includes('xlsx')) {
              return;
            }
            return 'vendor';
          }

          // engine + analysis：orchestrator/hooks 与引擎高度耦合（hooks 大量 import engine，
          // engine/exportAnalysis 也 import hooks/useAnalysisDataset），合并为一个 chunk，避免
          // engine -> analysis -> engine 的 circular chunk 告警。
          if (
            id.includes('/engine/') ||
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