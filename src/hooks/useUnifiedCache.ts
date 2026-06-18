/**
 * useUnifiedCache - 统一缓存层（v1.7）
 * 
 * 职责：单一缓存 store，统一 invalidation 策略
 * 
 * 规则：
 *   - 单一 cacheKey → 单一 invalidation
 *   - 避免多层 cache 失效链
 *   - 所有 slice 共享同一缓存策略
 * 
 * 使用方式：
 *   const cache = useUnifiedCache();
 *   const result = cache.memo('sliceName', deps, () => compute());
 */

import { useRef, useCallback } from 'react';

export interface UnifiedCache {
  /** 统一的 memo 计算入口 */
  memo: <T>(key: string, deps: unknown[], compute: () => T) => T;
  /** 清空全部缓存 */
  invalidate: () => void;
}

export function useUnifiedCache(): UnifiedCache {
  const storeRef = useRef<Map<string, unknown>>(new Map());

  const memo = useCallback(<T,>(key: string, deps: unknown[], compute: () => T): T => {
    const cacheKey = `${key}:${deps.length}`;
    const cached = storeRef.current.get(cacheKey);
    if (cached !== undefined) return cached as T;

    const result = compute();
    storeRef.current.set(cacheKey, result);
    return result;
  }, []);

  const invalidate = useCallback(() => {
    storeRef.current.clear();
  }, []);

  return { memo, invalidate };
}