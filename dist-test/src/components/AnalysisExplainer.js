import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { safeFormatNumber, safeFormatPercent } from '../utils/safeFormat';
export default function AnalysisExplainer({ explanation }) {
    const [showDetails, setShowDetails] = useState(false);
    const { fieldExplanations, multiFieldSummary } = explanation;
    if (fieldExplanations.length === 0) {
        return null;
    }
    return (_jsxs("div", { style: styles.container, children: [_jsx("h3", { style: styles.title, children: "\u5206\u6790\u89E3\u91CA" }), _jsx("div", { style: styles.summary, children: multiFieldSummary.insufficientData ? (_jsxs("p", { style: styles.warning, children: ["\u5B57\u6BB5\u8F83\u5C11\uFF08", multiFieldSummary.fieldCount, " \u4E2A\uFF09\uFF0C\u7EFC\u5408\u5224\u65AD\u4EC5\u4F9B\u53C2\u8003"] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { style: styles.summaryText, children: ["\u7EFC\u5408 ", multiFieldSummary.fieldCount, " \u4E2A\u5B57\u6BB5\uFF0C\u5E73\u5747\u767E\u5206\u4F4D", ' ', _jsx("strong", { children: safeFormatPercent(multiFieldSummary.averagePercentile) })] }), multiFieldSummary.top3Fields.length > 0 && (_jsxs("p", { style: styles.summaryText, children: ["\u76F8\u5BF9\u6700\u5F3A\uFF1A", multiFieldSummary.top3Fields.map(f => f.field).join('、')] })), multiFieldSummary.bottom3Fields.length > 0 && (_jsxs("p", { style: styles.summaryText, children: ["\u76F8\u5BF9\u6700\u5F31\uFF1A", multiFieldSummary.bottom3Fields.map(f => f.field).join('、')] }))] })) }), _jsx("button", { onClick: () => setShowDetails(!showDetails), style: styles.toggleButton, children: showDetails ? '收起详细解释' : '查看详细解释' }), showDetails && (_jsx("div", { style: styles.details, children: fieldExplanations.map((exp, index) => (_jsx(FieldExplanationCard, { explanation: exp }, index))) }))] }));
}
function FieldExplanationCard({ explanation }) {
    const { field, userValue, mean, lowerCount, percentile, tierLabel, diffFromMean, diffFromP75, diffFromP90, diffFromP95, validCount, } = explanation;
    return (_jsxs("div", { style: styles.card, children: [_jsxs("div", { style: styles.cardHeader, children: [_jsx("span", { style: styles.fieldName, children: field }), _jsx("span", { style: styles.tierBadge, children: tierLabel })] }), _jsxs("div", { style: styles.stats, children: [_jsxs("div", { style: styles.statRow, children: [_jsx("span", { style: styles.statLabel, children: "\u4F60\u7684\u6570\u503C\uFF1A" }), _jsx("strong", { children: userValue })] }), _jsxs("div", { style: styles.statRow, children: [_jsx("span", { style: styles.statLabel, children: "\u5E73\u5747\u5206\uFF1A" }), _jsx("span", { children: safeFormatNumber(mean, 2) }), _jsxs("span", { style: getDiffStyle(diffFromMean), children: ["(", diffFromMean >= 0 ? '+' : '', safeFormatNumber(diffFromMean, 2), ")"] })] }), _jsxs("div", { style: styles.statRow, children: [_jsx("span", { style: styles.statLabel, children: "\u8D85\u8FC7\u4EBA\u6570\uFF1A" }), _jsxs("span", { children: [lowerCount, " / ", validCount] })] }), _jsxs("div", { style: styles.statRow, children: [_jsx("span", { style: styles.statLabel, children: "\u767E\u5206\u4F4D\uFF1A" }), _jsx("span", { children: safeFormatPercent(percentile) })] })] }), _jsxs("div", { style: styles.percentiles, children: [_jsxs("div", { style: styles.percentileRow, children: [_jsx("span", { style: styles.percentileLabel, children: "\u4E0E P75 \u5DEE\u8DDD\uFF1A" }), _jsxs("span", { style: getDiffStyle(diffFromP75), children: [diffFromP75 >= 0 ? '+' : '', safeFormatNumber(diffFromP75, 2)] })] }), _jsxs("div", { style: styles.percentileRow, children: [_jsx("span", { style: styles.percentileLabel, children: "\u4E0E P90 \u5DEE\u8DDD\uFF1A" }), _jsxs("span", { style: getDiffStyle(diffFromP90), children: [diffFromP90 >= 0 ? '+' : '', safeFormatNumber(diffFromP90, 2)] })] }), _jsxs("div", { style: styles.percentileRow, children: [_jsx("span", { style: styles.percentileLabel, children: "\u4E0E P95 \u5DEE\u8DDD\uFF1A" }), _jsxs("span", { style: getDiffStyle(diffFromP95), children: [diffFromP95 >= 0 ? '+' : '', safeFormatNumber(diffFromP95, 2)] })] })] })] }));
}
function getDiffStyle(diff) {
    return {
        marginLeft: '8px',
        color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#64748b',
        fontWeight: 500,
    };
}
const styles = {
    container: {
        marginTop: '24px',
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
    },
    title: {
        margin: '0 0 12px 0',
        fontSize: '16px',
        fontWeight: 600,
        color: '#1e293b',
    },
    summary: {
        padding: '12px',
        background: '#ffffff',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
    },
    warning: {
        margin: 0,
        color: '#f59e0b',
        fontSize: '14px',
    },
    summaryText: {
        margin: '4px 0',
        fontSize: '14px',
        color: '#475569',
        lineHeight: 1.6,
    },
    toggleButton: {
        marginTop: '12px',
        padding: '6px 12px',
        fontSize: '13px',
        color: '#3b82f6',
        background: 'transparent',
        border: '1px solid #3b82f6',
        borderRadius: '4px',
        cursor: 'pointer',
    },
    details: {
        marginTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    card: {
        padding: '12px',
        background: '#ffffff',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },
    fieldName: {
        fontSize: '15px',
        fontWeight: 600,
        color: '#1e293b',
    },
    tierBadge: {
        padding: '4px 8px',
        fontSize: '12px',
        fontWeight: 500,
        color: '#ffffff',
        background: '#3b82f6',
        borderRadius: '4px',
    },
    stats: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        marginBottom: '12px',
    },
    statRow: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '13px',
        color: '#475569',
    },
    statLabel: {
        color: '#64748b',
        marginRight: '4px',
    },
    percentiles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        paddingTop: '8px',
        borderTop: '1px solid #e2e8f0',
    },
    percentileRow: {
        display: 'flex',
        alignItems: 'center',
        fontSize: '12px',
    },
    percentileLabel: {
        color: '#64748b',
        marginRight: '4px',
    },
};
