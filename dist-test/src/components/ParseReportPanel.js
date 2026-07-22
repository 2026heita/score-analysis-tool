import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
export default function ParseReportPanel({ report }) {
    const { summary, fields, warnings } = report;
    const [showFieldDetails, setShowFieldDetails] = useState(false);
    const [showReasons, setShowReasons] = useState(false);
    const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);
    // 筛选低置信度字段
    const displayFields = onlyLowConfidence
        ? fields.filter(f => f.confidence < 0.7)
        : fields;
    return (_jsxs("div", { style: styles.container, children: [_jsxs("section", { style: styles.section, children: [_jsx("h3", { style: styles.sectionTitle, children: "\u89E3\u6790\u6982\u89C8" }), _jsxs("div", { style: styles.summaryGrid, children: [_jsx(SummaryCard, { label: "\u6570\u636E\u884C\u6570", value: summary.dataRowCount }), _jsx(SummaryCard, { label: "\u5B57\u6BB5\u603B\u6570", value: summary.fieldCount }), _jsx(SummaryCard, { label: "\u63A8\u8350\u5B57\u6BB5", value: summary.recommendedFieldCount, highlight: true }), _jsx(SummaryCard, { label: "\u8EAB\u4EFD\u5B57\u6BB5", value: summary.identityCount }), _jsx(SummaryCard, { label: "\u52A0\u6263\u5206", value: summary.adjustmentCount }), _jsx(SummaryCard, { label: "\u65E0\u6548\u5B57\u6BB5", value: summary.invalidCount, warn: summary.invalidCount > 0 }), _jsx(SummaryCard, { label: "\u4F4E\u7F6E\u4FE1\u5EA6", value: summary.lowConfidenceCount, warn: summary.lowConfidenceCount > 0 })] }), (summary.lowConfidenceCount > 0 || summary.invalidCount > 0 || summary.unknownCount > 0) && (_jsxs("div", { style: styles.overviewHint, children: [summary.lowConfidenceCount > 0 && (_jsxs("span", { style: styles.hintItem, children: ["\u26A0 ", summary.lowConfidenceCount, " \u4E2A\u4F4E\u7F6E\u4FE1\u5EA6\u5B57\u6BB5"] })), summary.invalidCount > 0 && (_jsxs("span", { style: styles.hintItem, children: ["\u26A0 ", summary.invalidCount, " \u4E2A\u65E0\u6548\u5B57\u6BB5\u5DF2\u6392\u9664"] })), summary.unknownCount > 0 && (_jsxs("span", { style: styles.hintItem, children: ["\u26A0 ", summary.unknownCount, " \u4E2A\u672A\u77E5\u5B57\u6BB5\u9700\u786E\u8BA4"] }))] }))] }), warnings.length > 0 && (_jsxs("section", { style: styles.section, children: [_jsx("h3", { style: styles.sectionTitle, children: "\u63D0\u793A\u4FE1\u606F" }), _jsx("ul", { style: styles.warningList, children: warnings.map((warning, index) => (_jsx("li", { style: styles.warningItem, children: warning }, index))) })] })), _jsxs("section", { style: styles.section, children: [_jsxs("div", { style: styles.collapsibleHeader, children: [_jsxs("h3", { style: styles.sectionTitle, children: ["\u5B57\u6BB5\u8BC6\u522B\u8BE6\u60C5 (", fields.length, " \u4E2A\u5B57\u6BB5)"] }), _jsx("button", { style: styles.toggleButton, onClick: () => setShowFieldDetails(!showFieldDetails), children: showFieldDetails ? '收起' : '展开' })] }), showFieldDetails && (_jsxs(_Fragment, { children: [_jsx("div", { style: styles.filterRow, children: _jsxs("label", { style: styles.filterLabel, children: [_jsx("input", { type: "checkbox", checked: onlyLowConfidence, onChange: e => setOnlyLowConfidence(e.target.checked), style: styles.checkbox }), "\u4EC5\u67E5\u770B\u4F4E\u7F6E\u4FE1\u5EA6\u5B57\u6BB5 (\u7F6E\u4FE1\u5EA6 < 70%)"] }) }), _jsxs("div", { style: styles.fieldTable, children: [_jsxs("div", { style: styles.fieldHeader, children: [_jsx("div", { style: styles.fieldHeaderCell, children: "\u5B57\u6BB5\u540D" }), _jsx("div", { style: styles.fieldHeaderCell, children: "\u7C7B\u578B" }), _jsx("div", { style: styles.fieldHeaderCell, children: "\u7F6E\u4FE1\u5EA6" }), _jsx("div", { style: styles.fieldHeaderCell, children: "\u63A8\u8350" }), _jsx("div", { style: styles.fieldHeaderCell, children: "\u9690\u85CF\u539F\u56E0" })] }), displayFields.length === 0 ? (_jsx("div", { style: styles.emptyHint, children: onlyLowConfidence ? '没有低置信度字段' : '没有字段数据' })) : (displayFields.map((field, index) => (_jsxs("div", { style: {
                                            ...styles.fieldRow,
                                            ...(index % 2 === 0 ? {} : styles.fieldRowAlt),
                                        }, children: [_jsx("div", { style: styles.fieldCell, children: _jsx("span", { style: styles.fieldName, children: field.name }) }), _jsx("div", { style: styles.fieldCell, children: _jsx("span", { style: styles.typeBadge, children: field.analysisRole }) }), _jsx("div", { style: styles.fieldCell, children: _jsxs("span", { style: {
                                                        ...styles.confidenceBadge,
                                                        ...(field.confidence >= 0.8
                                                            ? styles.confidenceHigh
                                                            : field.confidence >= 0.6
                                                                ? styles.confidenceMedium
                                                                : styles.confidenceLow),
                                                    }, children: [(field.confidence * 100).toFixed(0), "%"] }) }), _jsx("div", { style: styles.fieldCell, children: field.recommended ? (_jsx("span", { style: styles.recommendedYes, children: "\u2713" })) : (_jsx("span", { style: styles.recommendedNo, children: "-" })) }), _jsx("div", { style: styles.fieldCell, children: _jsx("span", { style: styles.hiddenReason, children: field.hiddenByDefault ? field.hiddenReason : '-' }) })] }, index))))] })] }))] }), _jsxs("section", { style: styles.section, children: [_jsxs("div", { style: styles.collapsibleHeader, children: [_jsx("h3", { style: styles.sectionTitle, children: "\u5206\u7C7B\u539F\u56E0\u8BF4\u660E" }), _jsx("button", { style: styles.toggleButton, onClick: () => setShowReasons(!showReasons), children: showReasons ? '收起' : '展开' })] }), showReasons && (_jsx("div", { style: styles.reasonList, children: fields.map((field, index) => (_jsxs("div", { style: styles.reasonItem, children: [_jsxs("div", { style: styles.reasonHeader, children: [_jsx("span", { style: styles.reasonFieldName, children: field.name }), _jsxs("span", { style: styles.reasonConfidence, children: ["\u7F6E\u4FE1\u5EA6: ", (field.confidence * 100).toFixed(0), "%"] })] }), _jsx("div", { style: styles.reasonText, children: field.reason })] }, index))) }))] })] }));
}
function SummaryCard({ label, value, highlight = false, warn = false, }) {
    return (_jsxs("div", { style: {
            ...styles.summaryCard,
            ...(highlight ? styles.summaryCardHighlight : {}),
            ...(warn ? styles.summaryCardWarn : {}),
        }, children: [_jsx("div", { style: styles.summaryCardValue, children: value }), _jsx("div", { style: styles.summaryCardLabel, children: label })] }));
}
const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
    },
    section: {
        background: '#fff',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    sectionTitle: {
        margin: '0 0 12px 0',
        fontSize: '14px',
        fontWeight: 600,
        color: '#1e293b',
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: '12px',
    },
    summaryCard: {
        background: '#f8fafc',
        borderRadius: '6px',
        padding: '12px',
        textAlign: 'center',
        border: '1px solid #e2e8f0',
    },
    summaryCardHighlight: {
        background: '#dbeafe',
        borderColor: '#3b82f6',
    },
    summaryCardWarn: {
        background: '#fef3c7',
        borderColor: '#f59e0b',
    },
    summaryCardValue: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#1e293b',
        marginBottom: '4px',
    },
    summaryCardLabel: {
        fontSize: '12px',
        color: '#64748b',
    },
    warningList: {
        margin: 0,
        paddingLeft: '20px',
        listStyle: 'none',
    },
    warningItem: {
        fontSize: '13px',
        color: '#92400e',
        marginBottom: '8px',
        paddingLeft: '16px',
        position: 'relative',
    },
    fieldTable: {
        fontSize: '13px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        overflow: 'hidden',
    },
    fieldHeader: {
        display: 'flex',
        background: '#f1f5f9',
        borderBottom: '1px solid #e2e8f0',
        fontWeight: 600,
    },
    fieldHeaderCell: {
        padding: '8px 12px',
        flex: '1',
    },
    fieldRow: {
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
    },
    fieldRowAlt: {
        background: '#f8fafc',
    },
    fieldCell: {
        padding: '8px 12px',
        flex: '1',
        display: 'flex',
        alignItems: 'center',
    },
    fieldName: {
        fontWeight: 500,
        color: '#1e293b',
    },
    typeBadge: {
        fontSize: '11px',
        padding: '2px 6px',
        background: '#e0e7ff',
        color: '#3730a3',
        borderRadius: '4px',
        fontWeight: 500,
    },
    confidenceBadge: {
        fontSize: '11px',
        padding: '2px 6px',
        borderRadius: '4px',
        fontWeight: 600,
    },
    confidenceHigh: {
        background: '#d1fae5',
        color: '#065f46',
    },
    confidenceMedium: {
        background: '#fef3c7',
        color: '#92400e',
    },
    confidenceLow: {
        background: '#fee2e2',
        color: '#991b1b',
    },
    recommendedYes: {
        color: '#10b981',
        fontWeight: 700,
        fontSize: '16px',
    },
    recommendedNo: {
        color: '#94a3b8',
        fontSize: '16px',
    },
    hiddenReason: {
        fontSize: '12px',
        color: '#64748b',
    },
    reasonList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    reasonItem: {
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
    },
    reasonHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
    },
    reasonFieldName: {
        fontWeight: 600,
        color: '#1e293b',
        fontSize: '13px',
    },
    reasonConfidence: {
        fontSize: '12px',
        color: '#64748b',
    },
    reasonText: {
        fontSize: '12px',
        color: '#475569',
        lineHeight: '1.5',
    },
    collapsibleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },
    toggleButton: {
        padding: '4px 12px',
        fontSize: '12px',
        background: '#f1f5f9',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#475569',
    },
    filterRow: {
        marginBottom: '12px',
        padding: '8px 12px',
        background: '#f8fafc',
        borderRadius: '4px',
    },
    filterLabel: {
        fontSize: '12px',
        color: '#475569',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    checkbox: {
        cursor: 'pointer',
    },
    overviewHint: {
        marginTop: '12px',
        padding: '8px 12px',
        background: '#fef3c7',
        borderRadius: '4px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
    },
    hintItem: {
        fontSize: '12px',
        color: '#92400e',
    },
    emptyHint: {
        padding: '24px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '13px',
    },
};
