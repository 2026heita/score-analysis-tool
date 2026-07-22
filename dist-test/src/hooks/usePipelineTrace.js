/**
 * usePipelineTrace - pipeline 调试追踪系统（v1.7 降级）
 *
 * 职责：记录每个 slice 的输入输出、计算耗时、依赖来源
 * 仅用于 debug，默认关闭，不参与 production execution path
 *
 * 使用方式：
 *   const trace = usePipelineTrace({ enabled: true }); // debug 模式
 *
 * 规则：
 *   - 默认关闭 trace
 *   - 仅 debug 模式开启
 *   - 不参与 production execution path
 */
import { useRef, useCallback } from 'react';
// ============================================================
// 工具函数
// ============================================================
/** 简单依赖 hash（基于 JSON.stringify） */
function hashDeps(deps) {
    try {
        const str = JSON.stringify(deps, (_key, value) => {
            // 截断大数组，只取前 3 个元素 + 长度
            if (Array.isArray(value) && value.length > 3) {
                return `[array:${value.length}]:${JSON.stringify(value.slice(0, 3))}`;
            }
            return value;
        });
        // 简单 hash：取字符串长度 + 首尾字符
        return `${str.length}:${str.slice(0, 20)}...${str.slice(-20)}`;
    }
    catch {
        return 'hash-error';
    }
}
/** 输出 hash */
function hashOutput(output) {
    if (output === null || output === undefined)
        return 'null';
    if (Array.isArray(output))
        return `array:${output.length}`;
    if (typeof output === 'object') {
        const keys = Object.keys(output);
        return `obj:{${keys.slice(0, 5).join(',')}${keys.length > 5 ? '...' : ''}}`;
    }
    return typeof output;
}
// ============================================================
// Hook
// ============================================================
export function usePipelineTrace({ enabled = false } = {}) {
    const entriesRef = useRef([]);
    const cacheRef = useRef(new Map());
    const wrap = useCallback((sliceName, deps, compute) => {
        // v1.7: 默认关闭，production 路径直接返回计算结果
        if (!enabled) {
            return {
                result: compute(),
                entry: { sliceName, inputHash: '', outputHash: '', computeTimeMs: 0, dependencies: [], timestamp: 0, cacheHit: false },
            };
        }
        const inputHash = hashDeps(deps);
        const depNames = Object.keys(deps);
        const cacheKey = `${sliceName}:${inputHash}`;
        // 检查缓存
        const cached = cacheRef.current.get(cacheKey);
        if (cached !== undefined) {
            const entry = {
                sliceName,
                inputHash,
                outputHash: hashOutput(cached),
                computeTimeMs: 0,
                dependencies: depNames,
                timestamp: Date.now(),
                cacheHit: true,
            };
            entriesRef.current.push(entry);
            return { result: cached, entry };
        }
        // 执行计算
        const start = performance.now();
        const result = compute();
        const computeTimeMs = Math.round((performance.now() - start) * 100) / 100;
        // 缓存结果
        cacheRef.current.set(cacheKey, result);
        const entry = {
            sliceName,
            inputHash,
            outputHash: hashOutput(result),
            computeTimeMs,
            dependencies: depNames,
            timestamp: Date.now(),
            cacheHit: false,
        };
        entriesRef.current.push(entry);
        return { result, entry };
    }, []);
    const getLatest = useCallback((sliceName) => {
        const entries = entriesRef.current;
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].sliceName === sliceName)
                return entries[i];
        }
        return undefined;
    }, []);
    const clear = useCallback(() => {
        entriesRef.current = [];
        cacheRef.current.clear();
    }, []);
    return {
        get entries() { return entriesRef.current; },
        wrap,
        getLatest,
        clear,
    };
}
/**
 * 获取 pipeline 执行摘要（用于调试面板）
 */
export function getTraceSummary(trace) {
    const entries = trace.entries;
    if (entries.length === 0)
        return 'No trace entries';
    const slices = new Map();
    for (const e of entries) {
        if (!slices.has(e.sliceName))
            slices.set(e.sliceName, []);
        slices.get(e.sliceName).push(e);
    }
    const lines = ['=== Pipeline Trace Summary ==='];
    for (const [name, sliceEntries] of slices) {
        const last = sliceEntries[sliceEntries.length - 1];
        const totalTime = sliceEntries.reduce((sum, e) => sum + e.computeTimeMs, 0);
        const cacheHits = sliceEntries.filter(e => e.cacheHit).length;
        lines.push(`  [${name}] runs=${sliceEntries.length} cache=${cacheHits} ` +
            `total=${totalTime.toFixed(2)}ms last=${last.computeTimeMs.toFixed(2)}ms ` +
            `deps=[${last.dependencies.join(',')}]`);
    }
    return lines.join('\n');
}
