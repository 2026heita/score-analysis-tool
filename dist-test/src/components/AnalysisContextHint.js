import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
export default function AnalysisContextHint({ originalCount, filteredCount, activeConditions, selectedDimension, isFilteredEmpty, }) {
    const hasFilters = activeConditions > 0;
    const hasDimension = selectedDimension !== '';
    if (!hasFilters && !hasDimension) {
        return null; // 无筛选、无分组时不显示
    }
    if (isFilteredEmpty) {
        return (_jsx("div", { style: styles.container, children: _jsxs("div", { style: styles.emptyHint, children: ["\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u65E0\u53EF\u5206\u6790\u6570\u636E\uFF08", originalCount, " \u884C \u2192 0 \u884C\uFF09\uFF0C\u8BF7\u8C03\u6574\u7B5B\u9009\u6761\u4EF6\u3002"] }) }));
    }
    return (_jsxs("div", { style: styles.container, children: [_jsxs("div", { style: styles.row, children: [_jsx("span", { style: styles.label, children: "\u6570\u636E\u8303\u56F4" }), _jsx("span", { style: styles.value, children: hasFilters
                            ? `${filteredCount} / ${originalCount} 行`
                            : `${originalCount} 行` })] }), hasFilters && (_jsxs("div", { style: styles.row, children: [_jsx("span", { style: styles.label, children: "\u7B5B\u9009\u6761\u4EF6" }), _jsxs("span", { style: styles.value, children: [activeConditions, " \u4E2A\u6761\u4EF6"] })] })), hasDimension && (_jsxs("div", { style: styles.row, children: [_jsx("span", { style: styles.label, children: "\u5206\u7EC4\u7EF4\u5EA6" }), _jsx("span", { style: styles.value, children: selectedDimension })] }))] }));
}
const styles = {
    container: {
        display: 'flex',
        gap: '16px',
        padding: '8px 14px',
        background: '#f0f9ff',
        borderRadius: '8px',
        border: '1px solid #bae6fd',
        marginBottom: '16px',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
    },
    label: {
        color: '#64748b',
        fontWeight: 500,
    },
    value: {
        color: '#0c4a6e',
        fontWeight: 600,
    },
    emptyHint: {
        color: '#991b1b',
        fontSize: '13px',
        fontWeight: 500,
        width: '100%',
    },
};
