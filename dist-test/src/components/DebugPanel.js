import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 调试面板：在开发模式下展示当前 metric 的详细信息
 * 用于人工核对 direction 是否真正生效
 */
export function DebugPanel({ context, metricResult, selectedField, metricDef }) {
    // 仅在开发模式下显示
    if (import.meta.env.PROD)
        return null;
    if (!context || !metricResult || !selectedField) {
        return (_jsxs("div", { style: styles.debugPanel, children: [_jsx("div", { style: styles.debugTitle, children: "\uD83D\uDD27 \u8C03\u8BD5\u9762\u677F" }), _jsx("div", { style: styles.debugValue, children: "\u672A\u9009\u62E9\u5B57\u6BB5\u6216\u65E0\u6570\u636E" })] }));
    }
    return (_jsxs("div", { style: styles.debugPanel, children: [_jsx("div", { style: styles.debugTitle, children: "\uD83D\uDD27 \u8C03\u8BD5\u9762\u677F\uFF08\u4EC5\u5F00\u53D1\u6A21\u5F0F\uFF09" }), _jsxs("div", { style: styles.debugSection, children: [_jsx("div", { style: styles.debugLabel, children: "Metric \u5B9A\u4E49" }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "metricId:" }), _jsx("span", { style: styles.debugValue, children: metricResult.metricName })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "fieldKey:" }), _jsx("span", { style: styles.debugValue, children: metricDef?.sourceField || 'N/A' })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "direction:" }), _jsx("span", { style: {
                                    ...styles.debugValue,
                                    ...styles.directionBadge,
                                    backgroundColor: metricResult.direction === 'higher-is-better' ? '#10b981' : '#f59e0b'
                                }, children: metricResult.direction })] })] }), _jsxs("div", { style: styles.debugSection, children: [_jsx("div", { style: styles.debugLabel, children: "\u8BA1\u7B97\u7ED3\u679C" }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "validCount:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.validCount || 0 })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "invalidCount:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.invalidCount || 0 })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "truncatedRows:" }), _jsx("span", { style: styles.debugValue, children: metricResult.truncatedRows })] })] }), metricResult.position && (_jsxs("div", { style: styles.debugSection, children: [_jsx("div", { style: styles.debugLabel, children: "\u6392\u540D\u5B9A\u4F4D" }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "rank:" }), _jsx("span", { style: styles.debugValue, children: metricResult.position.bestRank })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "percentile:" }), _jsxs("span", { style: styles.debugValue, children: [metricResult.position.percentile.toFixed(2), "%"] })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "higherCount:" }), _jsx("span", { style: styles.debugValue, children: metricResult.position.higherCount })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "equalCount:" }), _jsx("span", { style: styles.debugValue, children: metricResult.position.equalCount })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "lowerCount:" }), _jsx("span", { style: styles.debugValue, children: metricResult.position.lowerCount })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "existsInData:" }), _jsx("span", { style: styles.debugValue, children: metricResult.position.existsInData ? 'true' : 'false' })] })] })), _jsxs("div", { style: styles.debugSection, children: [_jsx("div", { style: styles.debugLabel, children: "\u7EDF\u8BA1\u6307\u6807" }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "mean:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.mean.toFixed(2) || 'N/A' })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "median:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.median.toFixed(2) || 'N/A' })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "q25:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.q25.toFixed(2) || 'N/A' })] }), _jsxs("div", { style: styles.debugRow, children: [_jsx("span", { style: styles.debugKey, children: "q75:" }), _jsx("span", { style: styles.debugValue, children: metricResult.stats?.q75.toFixed(2) || 'N/A' })] })] }), _jsx("div", { style: styles.debugFooter, children: "\u4FEE\u6539 MetricDefinition.direction \u540E\uFF0C\u6392\u540D\u548C\u767E\u5206\u4F4D\u5E94\u540C\u6B65\u53D8\u5316" })] }));
}
const styles = {
    debugPanel: {
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '13px',
    },
    debugTitle: {
        fontWeight: 'bold',
        marginBottom: '12px',
        color: '#60a5fa',
    },
    debugSection: {
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '1px solid #334155',
    },
    debugLabel: {
        fontWeight: 'bold',
        marginBottom: '8px',
        color: '#94a3b8',
        fontSize: '12px',
    },
    debugRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '4px',
    },
    debugKey: {
        color: '#94a3b8',
    },
    debugValue: {
        color: '#e2e8f0',
        fontWeight: '500',
    },
    directionBadge: {
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
    },
    debugFooter: {
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #334155',
        fontSize: '11px',
        color: '#94a3b8',
        fontStyle: 'italic',
    },
};
