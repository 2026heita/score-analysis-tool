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
export function useUnifiedCache() {
    const storeRef = useRef(new Map());
    const memo = useCallback((key, deps, compute) => {
        const cacheKey = `${key}:${deps.length}`;
        const cached = storeRef.current.get(cacheKey);
        if (cached !== undefined)
            return cached;
        const result = compute();
        storeRef.current.set(cacheKey, result);
        return result;
    }, []);
    const invalidate = useCallback(() => {
        storeRef.current.clear();
    }, []);
    return { memo, invalidate };
}
