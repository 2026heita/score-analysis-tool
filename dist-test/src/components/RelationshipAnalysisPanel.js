import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 变量关系分析面板
 * 展示数值字段之间的相关性分析结果
 * 默认折叠，轻量版本
 */
import { useState } from 'react';
export default function RelationshipAnalysisPanel({ correlationResult }) {
    const [expanded, setExpanded] = useState(false);
    if (!correlationResult)
        return null;
    const { numericalFields, totalPairs, topPositive, topNegative, weakCorrelations, warnings, matrix, } = correlationResult;
    // 数值字段不足
    if (numericalFields.length < 2) {
        return (_jsxs("div", { style: styles.container, children: [_jsxs("button", { style: styles.header, onClick: () => setExpanded(!expanded), "aria-expanded": expanded, children: [_jsxs("span", { style: styles.headerTitle, children: [_jsx("span", { style: { ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }, children: "\u25B6" }), "\u53D8\u91CF\u5173\u7CFB\u5206\u6790"] }), _jsxs("span", { style: styles.headerBadge, children: [numericalFields.length, " \u4E2A\u6570\u503C\u5B57\u6BB5"] })] }), expanded && (_jsx("div", { style: styles.body, children: _jsx("p", { style: styles.insufficientHint, children: "\u5F53\u524D\u6570\u636E\u4E2D\u53EF\u7528\u4E8E\u5173\u7CFB\u5206\u6790\u7684\u6570\u503C\u5B57\u6BB5\u4E0D\u8DB3\u3002" }) }))] }));
    }
    return (_jsxs("div", { style: styles.container, children: [_jsxs("button", { style: styles.header, onClick: () => setExpanded(!expanded), "aria-expanded": expanded, children: [_jsxs("span", { style: styles.headerTitle, children: [_jsx("span", { style: { ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }, children: "\u25B6" }), "\u53D8\u91CF\u5173\u7CFB\u5206\u6790"] }), _jsxs("span", { style: styles.headerBadge, children: [numericalFields.length, " \u4E2A\u5B57\u6BB5 \u00B7 ", totalPairs, " \u5BF9\u5173\u7CFB"] })] }), expanded && (_jsxs("div", { style: styles.body, children: [_jsx("p", { style: styles.disclaimer, children: "\u4EE5\u4E0B\u4E3A\u6570\u503C\u5B57\u6BB5\u4E4B\u95F4\u7684\u7EDF\u8BA1\u76F8\u5173\u6027\u5206\u6790\uFF0C\u4E24\u4E2A\u5B57\u6BB5\u5B58\u5728\u7EDF\u8BA1\u76F8\u5173\uFF0C\u4E0D\u4EE3\u8868\u56E0\u679C\u5173\u7CFB\u3002" }), warnings.length > 0 && (_jsx("div", { style: styles.warningBox, children: warnings.map((w, i) => (_jsx("div", { style: styles.warningText, children: w }, i))) })), _jsxs("div", { style: styles.summaryGrid, children: [_jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: numericalFields.length }), _jsx("div", { style: styles.summaryLabel, children: "\u6570\u503C\u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: totalPairs }), _jsx("div", { style: styles.summaryLabel, children: "\u53EF\u5206\u6790\u5173\u7CFB\u5BF9" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: topPositive.length }), _jsx("div", { style: styles.summaryLabel, children: "\u5F3A\u6B63\u76F8\u5173" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: topNegative.length }), _jsx("div", { style: styles.summaryLabel, children: "\u5F3A\u8D1F\u76F8\u5173" })] })] }), topPositive.length > 0 && (_jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionTitle, children: [_jsx("span", { style: styles.sectionIcon, children: "\uD83D\uDCC8" }), "\u6700\u9AD8\u6B63\u76F8\u5173\u5B57\u6BB5\u5BF9"] }), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u5B57\u6BB5 A" }), _jsx("th", { style: styles.th, children: "\u5B57\u6BB5 B" }), _jsx("th", { style: styles.thNum, children: "\u76F8\u5173\u7CFB\u6570" }), _jsx("th", { style: styles.thNum, children: "\u6709\u6548\u6837\u672C" })] }) }), _jsx("tbody", { children: topPositive.map((pair, i) => (_jsx(CorrelationRow, { pair: pair }, i))) })] }) })] })), topNegative.length > 0 && (_jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionTitle, children: [_jsx("span", { style: styles.sectionIcon, children: "\uD83D\uDCC9" }), "\u6700\u9AD8\u8D1F\u76F8\u5173\u5B57\u6BB5\u5BF9"] }), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u5B57\u6BB5 A" }), _jsx("th", { style: styles.th, children: "\u5B57\u6BB5 B" }), _jsx("th", { style: styles.thNum, children: "\u76F8\u5173\u7CFB\u6570" }), _jsx("th", { style: styles.thNum, children: "\u6709\u6548\u6837\u672C" })] }) }), _jsx("tbody", { children: topNegative.map((pair, i) => (_jsx(CorrelationRow, { pair: pair }, i))) })] }) })] })), weakCorrelations.length > 0 && (_jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionTitle, children: [_jsx("span", { style: styles.sectionIcon, children: "\uD83D\uDD17" }), "\u4F4E\u76F8\u5173\u5B57\u6BB5\u5BF9\uFF08\u51E0\u4E4E\u65E0\u5173\uFF09"] }), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u5B57\u6BB5 A" }), _jsx("th", { style: styles.th, children: "\u5B57\u6BB5 B" }), _jsx("th", { style: styles.thNum, children: "\u76F8\u5173\u7CFB\u6570" }), _jsx("th", { style: styles.thNum, children: "\u6709\u6548\u6837\u672C" })] }) }), _jsx("tbody", { children: weakCorrelations.map((pair, i) => (_jsx(CorrelationRow, { pair: pair }, i))) })] }) })] })), numericalFields.length >= 2 && numericalFields.length <= 10 && (_jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionTitle, children: [_jsx("span", { style: styles.sectionIcon, children: "\uD83D\uDCCA" }), "\u76F8\u5173\u6027\u77E9\u9635"] }), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u5B57\u6BB5" }), numericalFields.map(field => (_jsx("th", { style: styles.thNum, title: field, children: field.length > 8 ? field.slice(0, 8) + '…' : field }, field)))] }) }), _jsx("tbody", { children: numericalFields.map(fieldA => (_jsxs("tr", { children: [_jsx("td", { style: styles.tdField, title: fieldA, children: fieldA.length > 12 ? fieldA.slice(0, 12) + '…' : fieldA }), numericalFields.map(fieldB => {
                                                        const r = matrix[fieldA]?.[fieldB] ?? 0;
                                                        return (_jsx("td", { style: getMatrixCellStyle(r), children: fieldA === fieldB ? '1.00' : r.toFixed(2) }, fieldB));
                                                    })] }, fieldA))) })] }) }), _jsx("p", { style: styles.matrixHint, children: "\u77E9\u9635\u6570\u503C\u4E3A Pearson \u76F8\u5173\u7CFB\u6570\uFF0C\u8303\u56F4 -1 \u5230 1\u3002\u6B63\u503C\u8868\u793A\u6B63\u76F8\u5173\uFF0C\u8D1F\u503C\u8868\u793A\u8D1F\u76F8\u5173\uFF0C0 \u8868\u793A\u65E0\u7EBF\u6027\u76F8\u5173\u3002" })] }))] }))] }));
}
function CorrelationRow({ pair }) {
    const strengthColor = getStrengthColor(pair.pearson);
    return (_jsxs("tr", { children: [_jsx("td", { style: styles.tdField, title: pair.fieldA, children: pair.fieldA.length > 15 ? pair.fieldA.slice(0, 15) + '…' : pair.fieldA }), _jsx("td", { style: styles.tdField, title: pair.fieldB, children: pair.fieldB.length > 15 ? pair.fieldB.slice(0, 15) + '…' : pair.fieldB }), _jsx("td", { style: { ...styles.tdNum, color: strengthColor, fontWeight: 600 }, children: pair.pearson.toFixed(3) }), _jsx("td", { style: styles.tdNum, children: pair.validCount })] }));
}
function getStrengthColor(r) {
    const absR = Math.abs(r);
    if (absR >= 0.7)
        return r > 0 ? '#059669' : '#dc2626';
    if (absR >= 0.3)
        return r > 0 ? '#0891b2' : '#ea580c';
    return '#64748b';
}
function getMatrixCellStyle(r) {
    const absR = Math.abs(r);
    let background = '#fff';
    let color = '#1e293b';
    if (absR >= 0.7) {
        background = r > 0 ? '#dcfce7' : '#fee2e2';
        color = r > 0 ? '#059669' : '#dc2626';
    }
    else if (absR >= 0.3) {
        background = r > 0 ? '#cffafe' : '#fed7aa';
        color = r > 0 ? '#0891b2' : '#ea580c';
    }
    else {
        background = '#f8fafc';
    }
    return {
        ...styles.tdNum,
        background,
        color,
        fontWeight: absR >= 0.7 ? 600 : 400,
        fontVariantNumeric: 'tabular-nums',
    };
}
const styles = {
    container: {
        margin: '12px 0',
        border: '1px solid rgba(226, 232, 240, 0.6)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '14px 16px',
        border: 'none',
        background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '15px',
        fontWeight: 600,
        textAlign: 'left',
        transition: 'all 0.2s',
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    arrow: {
        display: 'inline-block',
        fontSize: '10px',
        transition: 'transform 0.2s ease',
    },
    headerBadge: {
        fontSize: '12px',
        opacity: 0.9,
        background: 'rgba(255,255,255,0.2)',
        padding: '2px 8px',
        borderRadius: '10px',
    },
    body: {
        padding: '16px',
    },
    disclaimer: {
        fontSize: '12px',
        color: '#94a3b8',
        margin: '0 0 12px 0',
        lineHeight: 1.5,
    },
    insufficientHint: {
        fontSize: '13px',
        color: '#64748b',
        margin: '8px 0',
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '8px',
        textAlign: 'center',
    },
    warningBox: {
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '12px',
    },
    warningText: {
        fontSize: '13px',
        color: '#d97706',
        lineHeight: 1.5,
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: '10px',
        marginBottom: '16px',
    },
    summaryCard: {
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: '1px solid rgba(226, 232, 240, 0.6)',
        borderRadius: '10px',
        padding: '12px 8px',
        textAlign: 'center',
        transition: 'all 0.2s',
    },
    summaryValue: {
        fontSize: '22px',
        fontWeight: 700,
        background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        lineHeight: 1.2,
    },
    summaryLabel: {
        fontSize: '11px',
        color: '#64748b',
        marginTop: '4px',
        fontWeight: 500,
    },
    section: {
        marginBottom: '20px',
    },
    sectionTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
        marginBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    sectionIcon: {
        fontSize: '16px',
    },
    tableWrapper: {
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        borderRadius: '10px',
        border: '1px solid rgba(226, 232, 240, 0.6)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
        minWidth: '400px',
    },
    th: {
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        padding: '10px 12px',
        textAlign: 'left',
        fontWeight: 600,
        color: '#475569',
        borderBottom: '2px solid #e2e8f0',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
    },
    thNum: {
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        padding: '10px 12px',
        textAlign: 'right',
        fontWeight: 600,
        color: '#475569',
        borderBottom: '2px solid #e2e8f0',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
    },
    tdField: {
        padding: '8px 12px',
        borderBottom: '1px solid #f1f5f9',
        color: '#334155',
        maxWidth: '150px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontWeight: 500,
    },
    tdNum: {
        padding: '8px 12px',
        borderBottom: '1px solid #f1f5f9',
        textAlign: 'right',
        color: '#475569',
        whiteSpace: 'nowrap',
    },
    matrixHint: {
        fontSize: '11px',
        color: '#94a3b8',
        margin: '8px 0 0 0',
        lineHeight: 1.5,
    },
};
