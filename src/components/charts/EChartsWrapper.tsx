/**
 * v2.4: EChartsWrapper — 替代 echarts-for-react 的轻量包装组件。
 *
 * 动画生命周期（v2.4 修复）：
 * - 首次创建实例：core.init(dom) 后第一次 setOption 用 notMerge:true，正常播放入场动画。
 * - 之后的 option 更新：setOption 用 notMerge:false（增量合并），保留自然过渡/切换动画，
 *   不再用全量重建覆盖动画起始状态。
 * - 普通数据变化只 setOption，不会 dispose/init 重建实例。
 *
 * 首帧 ResizeObserver 处理（v2.4 修复）：
 * - init 时读取容器真实尺寸并以该尺寸初始化，避免 0 尺寸 chart。
 * - 记录 lastWidth/lastHeight，只有尺寸真正变化时才 resize；
 *   因此 ResizeObserver 首次 observation（尺寸未变化）不会重复 resize、不会打断入场动画。
 *
 * 调度/清理：
 * - resize 经 requestAnimationFrame 合并，同一帧不多次 resize。
 * - 组件卸载后取消 RAF、断开 ResizeObserver，dispose 实例，无泄漏；
 *   已 dispose 的实例不会继续 resize。
 */

import { useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { ensureECharts, getEChartsCore, isEChartsReady } from '../../utils/echartsSetup';

interface EChartsWrapperProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  /** 需要的图表类型列表: 'bar' | 'line' | 'pie' | 'boxplot' | 'scatter' | 'radar' */
  chartTypes: string[];
}

export default function EChartsWrapper({ option, style, chartTypes }: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const resizeRafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // 记录最近一次 resize 后的容器尺寸，避免无意义 resize
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(() => isEChartsReady(chartTypes));

  // 动态加载低频模块（boxplot/pie/radar）。bar/line 已随 chunk 静态注册，无需动态加载。
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    // 临时调试日志：首次依赖动态模块(chartTypes 含雷达等)时记录加载起点
    console.info('[echarts] load: ready=false, chartType=', chartTypes.join(','));
    ensureECharts(chartTypes)
      .then(() => {
        if (cancelled) return;
        // 修复：旧逻辑 `!isEChartsReady(chartTypes)` 在“加载成功”后恰恰为 false，
        // 导致 ready 永远置不回 true → 首次进入条形图（chartTypes 含 radar）常驻骨架空白。
        // 加载成功后应无条件按真实就绪态刷新 ready，让图表按期用最新 option 初始化。
        setReady(isEChartsReady(chartTypes));
      })
      .catch((err) => {
        console.error('[echarts] dynamic module load failed:', chartTypes.join(','), err);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, chartTypes.join(',')]);

  // 创建/更新图表 + 尺寸感知 + ResizeObserver
  useEffect(() => {
    if (!ready) return;
    const dom = containerRef.current;
    const core = getEChartsCore();
    if (!dom || !core) return;

    // 以容器真实尺寸初始化；尺寸未就绪（0）时返回 false，等待 ResizeObserver 再建
    const createChart = (): boolean => {
      const w = dom.clientWidth;
      const h = dom.clientHeight;
      if (w === 0 || h === 0) return false;
      const instance = core.init(dom, undefined, { width: w, height: h });
      // 临时调试日志
      const seriesArr = ((option?.series as any) ?? []);
      console.info('[echarts] init:', { chartType: chartTypes.join(','), width: w, height: h, hasSeries: seriesArr.length > 0, seriesCount: seriesArr.length });
      // 首次 setOption：notMerge=true，播放入场动画
      instance.setOption(option, { notMerge: true, lazyUpdate: false });
      chartRef.current = instance;
      lastSizeRef.current = { w, h };
      return true;
    };

    // rAF 合并的尺寸同步：要么补建被推迟的实例，要么仅在尺寸变化时 resize
    const syncSize = () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0;
        if (!dom.isConnected) return; // 已卸载
        const inst = chartRef.current;
        if (!inst) {
          createChart();
          return;
        }
        if (inst.isDisposed()) return;
        const w = dom.clientWidth;
        const h = dom.clientHeight;
        if (w === 0 || h === 0) return;
        const last = lastSizeRef.current;
        if (!last || last.w !== w || last.h !== h) {
          // 临时调试日志
          console.info('[echarts] resize:', { width: w, height: h });
          inst.resize({ width: w, height: h });
          lastSizeRef.current = { w, h };
        }
      });
    };

    const existing = chartRef.current;
    if (!existing) {
      // 首次：若尺寸有效立即建；否则留在 syncSize 里等 RO 首帧补建
      createChart();
    } else if (!existing.isDisposed()) {
      // 已有实例 → 增量更新（notMerge:false 合并），保留过渡/切换动画
      const w = dom.clientWidth;
      const h = dom.clientHeight;
      if (w !== 0 && h !== 0) {
        const last = lastSizeRef.current;
        if (last && (last.w !== w || last.h !== h)) {
          existing.resize({ width: w, height: h });
          lastSizeRef.current = { w, h };
        }
      }
      // 临时调试日志
      const sArr = ((option?.series as any) ?? []);
      console.info('[echarts] setOption(update):', { chartType: chartTypes.join(','), hasSeries: sArr.length > 0, seriesCount: sArr.length });
      existing.setOption(option, { notMerge: false, lazyUpdate: false });
    }

    window.addEventListener('resize', syncSize);
    resizeObserverRef.current = null;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncSize);
      ro.observe(dom);
      resizeObserverRef.current = ro;
    }

    return () => {
      window.removeEventListener('resize', syncSize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
    };
  }, [ready, option]);

  // 卸载清理：dispose 实例，取消 RAF/ResizeObserver
  useEffect(() => {
    return () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        // 临时调试日志
        console.info('[echarts] dispose');
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  const outerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    ...style,
  };

  if (!ready) {
    // 图表加载占位骨架：与最终图表容器同尺寸，避免布局偏移（CLS）
    return <div className="chart-skeleton" aria-hidden="true" style={outerStyle} />;
  }

  return <div ref={containerRef} style={outerStyle} />;
}