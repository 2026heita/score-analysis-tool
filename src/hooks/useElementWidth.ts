import { useCallback, useEffect, useState } from 'react';

/**
 * useElementWidth — 监听元素实际渲染宽度的 hook。
 *
 * 基于 ResizeObserver（容器尺寸，而非 window.innerWidth）：
 * 1. 元素尺寸变化时更新宽度，供图表标签换行与高度计算使用；
 * 2. 用 rAF 合并连续 resize，避免高频 setState 导致死循环；
 * 3. 用 callback ref 在元素挂载/卸载时重新绑定，组件里图表视图切换也可靠；
 * 4. 卸载时正确 disconnect / 取消 rAF。
 *
 * 返回 { ref, width }，ref 为 callback ref，可直接赋给 DOM 元素的 ref。
 */
export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((el: T | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) {
      return;
    }
    let raf = 0;

    const update = () => {
      const w = node.getBoundingClientRect().width;
      setWidth(prev => (Math.abs(prev - w) < 0.5 ? prev : w));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(node);
    }

    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(raf);
      if (observer) {
        observer.disconnect();
      }
      window.removeEventListener('resize', schedule);
    };
  }, [node]);

  return { ref, width };
}