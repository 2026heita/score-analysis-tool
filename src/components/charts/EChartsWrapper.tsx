/**
 * v1.9.1: EChartsWrapper — 替代 echarts-for-react 的轻量包装组件。
 *
 * 优化：
 * - 使用 getEChartsCore() 同步获取已缓存的 echarts core（避免重复 import）
 * - requestIdleCallback 预加载 — 组件挂载时后台预加载模块
 * - chart instance 缓存 & 复用
 */

import { useEffect, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { ensureECharts, getEChartsCore, preloadECharts, isEChartsReady } from '../../utils/echartsSetup';

interface EChartsWrapperProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  /** 需要的图表类型列表: 'bar' | 'line' | 'pie' | 'boxplot' | 'scatter' | 'radar' */
  chartTypes: string[];
}

export default function EChartsWrapper({ option, style, chartTypes }: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeRafRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [ready, setReady] = useState(() => isEChartsReady(chartTypes));

  // v1.9.1: requestIdleCallback 预加载 — 组件挂载时后台预加载
  useEffect(() => {
    if (!ready) {
      preloadECharts(chartTypes);
    }
  }, [chartTypes.join(','), ready]);

  // 动态加载 echarts 模块（如果预加载未完成）
  useEffect(() => {
    if (ready) return;

    let cancelled = false;
    ensureECharts(chartTypes).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [chartTypes.join(','), ready]);

  // 创建 / 更新图表
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    const dom = containerRef.current;
    const core = getEChartsCore();

    if (!core) return;

    if (!chartRef.current) {
      // v1.9.1: 同步使用缓存的 core，避免 import('echarts/core')
      const instance = core.init(dom);
      instance.setOption(option, true);
      chartRef.current = instance;
    } else {
      chartRef.current.setOption(option, true);
    }

    const handleResize = () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0;
        chartRef.current?.resize();
      });
    };
    window.addEventListener('resize', handleResize);

    // v2.3.0: ResizeObserver 监听实际图表容器尺寸变化（非 window 事件），
    // 覆盖图表容器因布局/折叠/宽度变化而调整尺寸的场景。rAF 合并连续触发。
    resizeObserverRef.current = null;
    if (typeof ResizeObserver !== 'undefined' && dom) {
      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(dom);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
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

  // 清理
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
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ ...style }} />;
}