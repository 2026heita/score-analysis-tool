import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * GroupAnalysis - 分组分析表格组件
 *
 * 职责：展示按维度分组后的统计结果，支持排序和 Top N
 *
 * 设计原则：
 * 1. 简单表格，不做复杂图表
 * 2. 复用 formatNumber 保持数字格式一致
 * 3. 不改变现有组件
 * 4. 支持点击表头排序
 * 5. 默认展示 Top 20
 */
import { useState, useMemo } from 'react';
import { formatNumber } from '../utils/stats';
import { sortGroupStats, topN, DEFAULT_TOP_N } from '../engine/groupByDimension';
const COLUMNS = [
    { key: 'count', label: '数量' },
    { key: 'mean', label: '均值' },
    { key: 'median', label: '中位数' },
    { key: 'min', label: '最小值' },
    { key: 'max', label: '最大值' },
    { key: 'q25', label: 'Q25' },
    { key: 'q75', label: 'Q75' },
];
export default function GroupAnalysis({ groupStats, metricField, dimensionField }) {
    const [sortBy, setSortBy] = useState('mean');
    const [sortOrder, setSortOrder] = useState('desc');
    const sorted = useMemo(() => {
        return sortGroupStats(groupStats, sortBy, sortOrder);
    }, [groupStats, sortBy, sortOrder]);
    const totalGroups = sorted.length;
    const displayed = useMemo(() => topN(sorted, DEFAULT_TOP_N), [sorted]);
    const isTruncated = totalGroups > DEFAULT_TOP_N;
    if (groupStats.length === 0) {
        return null;
    }
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        }
        else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };
    const renderSortIcon = (field) => {
        if (sortBy !== field)
            return _jsx("span", { style: styles.sortIconInactive, children: "\u21C5" });
        return sortOrder === 'asc'
            ? _jsx("span", { style: styles.sortIcon, children: "\u25B2" })
            : _jsx("span", { style: styles.sortIcon, children: "\u25BC" });
    };
    return (_jsxs("div", { style: styles.container, children: [_jsxs("h3", { style: styles.title, children: ["\u5206\u7EC4\u5206\u6790\uFF1A\u6309\u3010", dimensionField, "\u3011\u67E5\u770B\u3010", metricField, "\u3011"] }), isTruncated && (_jsxs("p", { style: styles.truncateHint, children: ["\u5171 ", totalGroups, " \u7EC4\uFF0C\u4EC5\u663E\u793A\u524D ", DEFAULT_TOP_N, " \u7EC4\uFF08\u6309 ", sortBy === 'mean' ? '均值' : COLUMNS.find(c => c.key === sortBy)?.label, " \u6392\u5E8F\uFF09\u3002"] })), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: dimensionField }), COLUMNS.map(col => (_jsxs("th", { style: { ...styles.th, ...styles.thNumber, ...styles.thSortable }, onClick: () => handleSort(col.key), children: [col.label, " ", renderSortIcon(col.key)] }, col.key)))] }) }), _jsx("tbody", { children: displayed.map((gs, i) => (_jsxs("tr", { style: i % 2 === 0 ? styles.trEven : styles.trOdd, children: [_jsx("td", { style: styles.td, children: gs.dimensionValue }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: gs.count }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.mean) }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.median) }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.min) }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.max) }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.q25) }), _jsx("td", { style: { ...styles.td, ...styles.tdNumber }, children: formatNumber(gs.q75) })] }, gs.dimensionValue))) })] }) })] }));
}
const styles = {
    container: {
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
    },
    title: {
        margin: '0 0 8px',
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
    },
    truncateHint: {
        margin: '0 0 10px',
        fontSize: '12px',
        color: '#92400e',
        background: '#fffbeb',
        padding: '6px 10px',
        borderRadius: '6px',
        borderLeft: '3px solid #f59e0b',
    },
    tableWrapper: {
        overflowX: 'auto',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
        fontFamily: 'monospace',
    },
    th: {
        padding: '8px 10px',
        textAlign: 'left',
        fontWeight: 600,
        color: '#475569',
        fontSize: '12px',
        background: '#f8fafc',
        borderBottom: '2px solid #e2e8f0',
        whiteSpace: 'nowrap',
    },
    thNumber: {
        textAlign: 'right',
    },
    thSortable: {
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.15s',
    },
    sortIcon: {
        marginLeft: '2px',
        fontSize: '10px',
        color: '#6366f1',
    },
    sortIconInactive: {
        marginLeft: '2px',
        fontSize: '10px',
        color: '#cbd5e1',
    },
    td: {
        padding: '6px 10px',
        borderBottom: '1px solid #f1f5f9',
        color: '#1e293b',
    },
    tdNumber: {
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
    },
    trEven: {
        background: '#fff',
    },
    trOdd: {
        background: '#f8fafc',
    },
};
