import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * OutlierPanel - 异常值展示与操作面板
 *
 * 职责：只做展示 + 操作，不做计算
 * 所有分析逻辑统一来自 engine/univariateAnalyzer
 *
 * 异常值策略（v1.4 统一规则）：
 * 1. 明显错误值（如 -999）→ 默认排除
 * 2. 真实极端值（高GMV / 高分）→ 默认保留 + 标记
 * 3. 不确定异常 → 默认保留
 */
import { useState, useMemo } from 'react';
import { detectOutliersFromValues, classifyOutlierStrategy, computeMeanChange, ERROR_VALUE_THRESHOLD, } from '../engine/univariateAnalyzer';
export default function OutlierPanel({ selectedField, values, onExcludeChange, }) {
    const [excludedIndices, setExcludedIndices] = useState(new Set());
    const [collapsed, setCollapsed] = useState(false);
    const entries = useMemo(() => {
        if (values.length === 0)
            return [];
        const rawOutliers = detectOutliersFromValues(values);
        return rawOutliers.map(o => {
            const { type, strategy } = classifyOutlierStrategy(o.value, o.zScore);
            return {
                rowIndex: o.rowIndex,
                value: o.value,
                type,
                severity: o.zScore,
                excluded: strategy === 'auto-exclude' || excludedIndices.has(o.rowIndex),
                strategy,
            };
        });
    }, [values, excludedIndices]);
    const handleToggleExclude = (index) => {
        const next = new Set(excludedIndices);
        if (next.has(index)) {
            next.delete(index);
        }
        else {
            next.add(index);
        }
        setExcludedIndices(next);
        onExcludeChange?.(next);
    };
    const handleExcludeAll = () => {
        const all = new Set(entries.map(e => e.rowIndex));
        setExcludedIndices(all);
        onExcludeChange?.(all);
    };
    const handleResetAll = () => {
        setExcludedIndices(new Set());
        onExcludeChange?.(new Set());
    };
    if (entries.length === 0)
        return null;
    const autoExcluded = entries.filter(e => e.strategy === 'auto-exclude');
    const meanChange = computeMeanChange(values, excludedIndices);
    return (_jsxs("div", { style: { marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: '#fef3c7',
                    borderBottom: '1px solid #fcd34d',
                    cursor: 'pointer',
                }, onClick: () => setCollapsed(!collapsed), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsxs("span", { style: { fontSize: 14, fontWeight: 600 }, children: [selectedField, " \u2014 \u5F02\u5E38\u503C\u68C0\u6D4B"] }), _jsxs("span", { style: {
                                    fontSize: 12,
                                    background: '#f59e0b',
                                    color: '#fff',
                                    borderRadius: 10,
                                    padding: '2px 8px',
                                }, children: [entries.length, " \u4E2A"] }), autoExcluded.length > 0 && (_jsxs("span", { style: { fontSize: 12, color: '#dc2626' }, children: [autoExcluded.length, " \u4E2A\u5DF2\u81EA\u52A8\u6392\u9664"] }))] }), _jsx("span", { style: { fontSize: 12, color: '#6b7280' }, children: collapsed ? '展开 ▼' : '收起 ▲' })] }), !collapsed && (_jsxs("div", { style: { padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }, children: [_jsxs("div", { style: { fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }, children: [_jsxs("div", { children: ["\u81EA\u52A8\u6392\u9664\uFF1A\u6570\u503C \u2264 ", ERROR_VALUE_THRESHOLD, "\uFF08\u7591\u4F3C\u9519\u8BEF\u503C\uFF09"] }), _jsx("div", { children: "\u6807\u8BB0\u5F02\u5E38\uFF1Az-score > 3\uFF08\u771F\u5B9E\u6781\u7AEF\u503C\uFF0C\u9ED8\u8BA4\u4FDD\u7559\uFF09" }), _jsx("div", { children: "\u666E\u901A\u79BB\u7FA4\uFF1AIQR \u8303\u56F4\u5916\uFF0C\u9ED8\u8BA4\u4FDD\u7559" })] }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 10 }, children: [_jsx("button", { style: {
                                    fontSize: 12,
                                    padding: '4px 10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: 4,
                                    background: '#fff',
                                    cursor: 'pointer',
                                }, onClick: handleExcludeAll, children: "\u5168\u90E8\u6392\u9664" }), _jsx("button", { style: {
                                    fontSize: 12,
                                    padding: '4px 10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: 4,
                                    background: '#fff',
                                    cursor: 'pointer',
                                }, onClick: handleResetAll, children: "\u5168\u90E8\u6062\u590D" })] }), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: '1px solid #e5e7eb', textAlign: 'left' }, children: [_jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "\u884C" }), _jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "\u503C" }), _jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "\u7C7B\u578B" }), _jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "z-score" }), _jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "\u7B56\u7565" }), _jsx("th", { style: { padding: '4px 6px', color: '#6b7280', fontWeight: 500 }, children: "\u64CD\u4F5C" })] }) }), _jsx("tbody", { children: entries.map((entry) => {
                                    const isAutoExcluded = entry.strategy === 'auto-exclude';
                                    const isManuallyExcluded = entry.excluded && !isAutoExcluded;
                                    const rowStyle = isAutoExcluded
                                        ? { background: '#fef2f2', textDecoration: 'line-through' }
                                        : isManuallyExcluded
                                            ? { background: '#fff7ed', textDecoration: 'line-through' }
                                            : {};
                                    return (_jsxs("tr", { style: { ...rowStyle, borderBottom: '1px solid #f3f4f6' }, children: [_jsxs("td", { style: { padding: '4px 6px', color: '#6b7280' }, children: ["#", entry.rowIndex + 1] }), _jsx("td", { style: { padding: '4px 6px', fontFamily: 'monospace', fontWeight: 500 }, children: entry.value }), _jsx("td", { style: { padding: '4px 6px' }, children: _jsx("span", { style: {
                                                        fontSize: 11,
                                                        padding: '1px 6px',
                                                        borderRadius: 4,
                                                        background: entry.type === 'extremeHigh' ? '#fee2e2' :
                                                            entry.type === 'extremeLow' ? '#dbeafe' : '#fef3c7',
                                                        color: entry.type === 'extremeHigh' ? '#dc2626' :
                                                            entry.type === 'extremeLow' ? '#2563eb' : '#92400e',
                                                    }, children: entry.type === 'extremeHigh' ? '极端高' :
                                                        entry.type === 'extremeLow' ? '极端低' : '离群' }) }), _jsx("td", { style: { padding: '4px 6px', fontFamily: 'monospace', color: '#6b7280' }, children: entry.severity.toFixed(1) }), _jsx("td", { style: { padding: '4px 6px', fontSize: 12 }, children: entry.strategy === 'auto-exclude' ? (_jsx("span", { style: { color: '#dc2626' }, children: "\u81EA\u52A8\u6392\u9664" })) : entry.strategy === 'mark' ? (_jsx("span", { style: { color: '#f59e0b' }, children: "\u6807\u8BB0" })) : (_jsx("span", { style: { color: '#6b7280' }, children: "\u4FDD\u7559" })) }), _jsx("td", { style: { padding: '4px 6px' }, children: entry.strategy !== 'auto-exclude' && (_jsx("button", { style: {
                                                        fontSize: 11,
                                                        padding: '2px 8px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: 4,
                                                        background: isManuallyExcluded ? '#fef3c7' : '#fff',
                                                        cursor: 'pointer',
                                                    }, onClick: () => handleToggleExclude(entry.rowIndex), children: isManuallyExcluded ? '恢复' : '排除' })) })] }, entry.rowIndex));
                                }) })] }), entries.length > 0 && excludedIndices.size > 0 && (_jsxs("div", { style: { fontSize: 12, color: '#6b7280', marginTop: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 4 }, children: ["\u6392\u9664 ", excludedIndices.size, " \u4E2A\u5F02\u5E38\u503C\u540E\u5747\u503C\u53D8\u5316\uFF1A", meanChange] }))] }))] }));
}
