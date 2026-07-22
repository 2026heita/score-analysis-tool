import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 通用数据概览面板
 * 使用 general engine 对任意表格提供基础数据概况
 * 默认折叠，不影响现有表格数据分析功能
 */
import { useState, useMemo } from 'react';
import { detectDatasetSchema } from '../engine/schemaDetector';
import { standardizeDataset } from '../engine/featureStandardizer';
import { analyzeNumericalFeature, detectOutliers } from '../engine/univariateAnalyzer';
function computeOverview(headers, rows) {
    const totalRows = rows.length;
    // Stage 0A-2: 不再截断，数据已在入口统一抽样
    // 1. Schema 检测
    const features = detectDatasetSchema(headers, rows);
    // 2. 统计各类型数量
    const typeCounts = {
        numerical: 0,
        categorical: 0,
        temporal: 0,
        text: 0,
        identifier: 0,
        invalid: 0,
    };
    for (const f of features) {
        typeCounts[f.featureType]++;
    }
    // 3. 标准化数据
    const vectors = standardizeDataset(rows, features);
    // 4. 数值字段统计 + 异常值
    const numericalStats = [];
    const highOutlierFields = [];
    for (const f of features) {
        if (f.featureType !== 'numerical')
            continue;
        const stats = analyzeNumericalFeature(vectors, f.fieldName);
        const outliers = detectOutliers(vectors, f.fieldName);
        numericalStats.push({
            fieldName: f.fieldName,
            stats,
            outlierCount: outliers.length,
        });
        if (outliers.length > 0) {
            highOutlierFields.push({ field: f.fieldName, count: outliers.length });
        }
    }
    // 5. 缺失值较多字段
    const highMissingFields = [];
    for (const f of features) {
        if (f.featureType === 'invalid')
            continue;
        const ns = numericalStats.find(n => n.fieldName === f.fieldName);
        let missingCount = 0;
        if (ns) {
            missingCount = ns.stats.missingCount;
        }
        else {
            // 对非数值字段，手动计算缺失
            let empty = 0;
            for (const row of rows) {
                const v = row[f.fieldName];
                if (v === null || v === undefined || String(v).trim() === '')
                    empty++;
            }
            missingCount = empty;
        }
        if (missingCount > totalRows * 0.3) {
            highMissingFields.push(f.fieldName);
        }
    }
    // 6. 警告（Stage 0A-2: 移除旧的 5000 行截断警告，数据已在入口统一抽样）
    const warnings = [];
    return {
        rowCount: totalRows,
        columnCount: headers.length,
        typeCounts,
        highMissingFields,
        highOutlierFields,
        numericalStats,
        warnings,
    };
}
function formatNum(n) {
    if (n === undefined || n === null)
        return '-';
    if (Number.isInteger(n))
        return String(n);
    return n.toFixed(2);
}
export default function GeneralDataOverview({ headers, rows }) {
    const [expanded, setExpanded] = useState(false);
    const overview = useMemo(() => {
        if (!headers.length || !rows.length)
            return null;
        return computeOverview(headers, rows);
    }, [headers, rows]);
    if (!overview)
        return null;
    const { typeCounts } = overview;
    return (_jsxs("div", { style: styles.container, children: [_jsxs("button", { style: styles.header, onClick: () => setExpanded(!expanded), "aria-expanded": expanded, children: [_jsxs("span", { style: styles.headerTitle, children: [_jsx("span", { style: { ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }, children: "\u25B6" }), "\u901A\u7528\u6570\u636E\u6982\u89C8"] }), _jsxs("span", { style: styles.headerBadge, children: [overview.rowCount, " \u884C \u00D7 ", overview.columnCount, " \u5217"] })] }), expanded && (_jsxs("div", { style: styles.body, children: [_jsx("p", { style: styles.disclaimer, children: "\u4EE5\u4E0B\u4E3A\u901A\u7528\u6570\u636E\u6982\u89C8\uFF0C\u4EC5\u5C55\u793A\u5BA2\u89C2\u7EDF\u8BA1\u4FE1\u606F\uFF0C\u4E0D\u4EE3\u8868\u4EFB\u4F55\u5B98\u65B9\u7ED3\u8BBA\u3002" }), overview.warnings.length > 0 && (_jsx("div", { style: styles.warningBox, children: overview.warnings.map((w, i) => (_jsx("div", { style: styles.warningText, children: w }, i))) })), _jsxs("div", { style: styles.summaryGrid, children: [_jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: overview.rowCount }), _jsx("div", { style: styles.summaryLabel, children: "\u6570\u636E\u884C\u6570" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: overview.columnCount }), _jsx("div", { style: styles.summaryLabel, children: "\u5B57\u6BB5\u603B\u6570" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.numerical }), _jsx("div", { style: styles.summaryLabel, children: "\u6570\u503C\u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.categorical }), _jsx("div", { style: styles.summaryLabel, children: "\u7C7B\u522B\u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.temporal }), _jsx("div", { style: styles.summaryLabel, children: "\u65F6\u95F4\u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.text }), _jsx("div", { style: styles.summaryLabel, children: "\u6587\u672C\u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.identifier }), _jsx("div", { style: styles.summaryLabel, children: "ID \u5B57\u6BB5" })] }), _jsxs("div", { style: styles.summaryCard, children: [_jsx("div", { style: styles.summaryValue, children: typeCounts.invalid }), _jsx("div", { style: styles.summaryLabel, children: "\u65E0\u6548\u5B57\u6BB5" })] })] }), (overview.highMissingFields.length > 0 || overview.highOutlierFields.length > 0) && (_jsxs("div", { style: styles.alertSection, children: [overview.highMissingFields.length > 0 && (_jsxs("div", { style: styles.alertItem, children: [_jsx("span", { style: styles.alertLabel, children: "\u7F3A\u5931\u503C\u8F83\u591A\uFF1A" }), overview.highMissingFields.join('、')] })), overview.highOutlierFields.length > 0 && (_jsxs("div", { style: styles.alertItem, children: [_jsx("span", { style: styles.alertLabel, children: "\u5F02\u5E38\u503C\u8F83\u591A\uFF1A" }), overview.highOutlierFields.map(f => `${f.field}(${f.count}个)`).join('、')] }))] })), overview.numericalStats.length > 0 && (_jsxs("div", { style: styles.tableSection, children: [_jsx("div", { style: styles.tableTitle, children: "\u6570\u503C\u5B57\u6BB5\u57FA\u7840\u7EDF\u8BA1" }), _jsx("div", { style: styles.tableWrapper, children: _jsxs("table", { style: styles.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: styles.th, children: "\u5B57\u6BB5\u540D" }), _jsx("th", { style: styles.thNum, children: "\u6709\u6548\u503C" }), _jsx("th", { style: styles.thNum, children: "\u7F3A\u5931\u503C" }), _jsx("th", { style: styles.thNum, children: "\u5E73\u5747\u503C" }), _jsx("th", { style: styles.thNum, children: "\u4E2D\u4F4D\u6570" }), _jsx("th", { style: styles.thNum, children: "\u6700\u5C0F\u503C" }), _jsx("th", { style: styles.thNum, children: "\u6700\u5927\u503C" }), _jsx("th", { style: styles.thNum, children: "\u6807\u51C6\u5DEE" }), _jsx("th", { style: styles.thNum, children: "\u5F02\u5E38\u503C" })] }) }), _jsx("tbody", { children: overview.numericalStats.map(ns => (_jsxs("tr", { children: [_jsx("td", { style: styles.tdName, title: ns.fieldName, children: ns.fieldName }), _jsx("td", { style: styles.tdNum, children: ns.stats.validCount }), _jsx("td", { style: styles.tdNum, children: ns.stats.missingCount }), _jsx("td", { style: styles.tdNum, children: formatNum(ns.stats.mean) }), _jsx("td", { style: styles.tdNum, children: formatNum(ns.stats.median) }), _jsx("td", { style: styles.tdNum, children: formatNum(ns.stats.min) }), _jsx("td", { style: styles.tdNum, children: formatNum(ns.stats.max) }), _jsx("td", { style: styles.tdNum, children: formatNum(ns.stats.std) }), _jsx("td", { style: { ...styles.tdNum, color: ns.outlierCount > 0 ? '#e67700' : undefined }, children: ns.outlierCount })] }, ns.fieldName))) })] }) })] }))] }))] }));
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
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
    alertSection: {
        marginBottom: '16px',
    },
    alertItem: {
        fontSize: '13px',
        color: '#475569',
        padding: '8px 12px',
        lineHeight: 1.5,
        background: '#fffbeb',
        borderRadius: '8px',
        marginBottom: '8px',
        borderLeft: '3px solid #f59e0b',
    },
    alertLabel: {
        fontWeight: 600,
        color: '#d97706',
    },
    tableSection: {
        marginTop: '8px',
    },
    tableTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
        marginBottom: '10px',
        paddingLeft: '12px',
        position: 'relative',
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
        minWidth: '600px',
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
    tdName: {
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
        fontVariantNumeric: 'tabular-nums',
    },
};
