import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { updateLogs } from '../data/updateLogs';
const TYPE_LABELS = {
    feature: { text: '新功能', color: '#166534', bg: '#dcfce7' },
    fix: { text: '修复', color: '#9a3412', bg: '#fff7ed' },
    improvement: { text: '优化', color: '#1e40af', bg: '#eff6ff' },
    notice: { text: '公告', color: '#854d0e', bg: '#fefce8' },
};
function getTypeBadge(type) {
    const t = type && TYPE_LABELS[type] ? TYPE_LABELS[type] : TYPE_LABELS.improvement;
    return (_jsx("span", { style: {
            display: 'inline-block',
            padding: '1px 8px',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: '4px',
            color: t.color,
            background: t.bg,
            whiteSpace: 'nowrap',
        }, children: t.text }));
}
function LogEntry({ log }) {
    return (_jsxs("div", { style: styles.entry, children: [_jsxs("div", { style: styles.entryHeader, children: [_jsxs("div", { style: styles.entryMeta, children: [_jsx("span", { style: styles.entryDate, children: log.date }), getTypeBadge(log.type)] }), _jsx("div", { style: styles.entryTitle, children: log.title })] }), _jsx("ul", { style: styles.entryList, children: log.items.map((item, i) => (_jsx("li", { style: styles.entryItem, children: item }, i))) })] }));
}
export default function UpdateNotice() {
    const [expanded, setExpanded] = useState(false);
    if (updateLogs.length === 0)
        return null;
    // 按 version 分组（版本列表模型）
    const grouped = updateLogs.reduce((acc, log) => {
        if (!acc[log.version])
            acc[log.version] = [];
        acc[log.version].push(log);
        return acc;
    }, {});
    // 获取最新版本信息（用于折叠状态显示）
    const latestVersion = Object.keys(grouped)[0];
    const latestLogs = grouped[latestVersion] || [];
    const latestDate = latestLogs[0]?.date || '';
    return (_jsxs("div", { style: styles.container, children: [_jsxs("div", { style: styles.header, onClick: () => setExpanded(v => !v), children: [_jsxs("div", { style: styles.headerLeft, children: [_jsx("span", { style: styles.dot }), _jsx("span", { style: styles.headerTitle, children: "\u66F4\u65B0\u8BB0\u5F55" }), _jsx("span", { style: styles.headerDate, children: latestDate }), _jsx("span", { style: styles.headerVersion, children: latestVersion })] }), _jsx("span", { style: styles.toggle, children: expanded ? '收起' : '展开' })] }), !expanded && latestLogs.length > 0 && (_jsxs("div", { style: styles.summary, children: [getTypeBadge(latestLogs[0].type), _jsxs("span", { style: styles.summaryText, children: [latestLogs[0].title, " - ", latestLogs[0].items[0] || ''] })] })), expanded && (_jsx("div", { style: styles.body, children: _jsx("div", { style: styles.scrollContainer, children: Object.entries(grouped).map(([version, logs]) => (_jsxs("div", { style: styles.versionGroup, children: [_jsx("div", { style: styles.versionHeader, children: version }), logs.map((log, idx) => (_jsx("div", { className: idx === 0 && version === latestVersion ? 'log-entry-latest' : '', children: _jsx(LogEntry, { log: log }) }, `${version}-${idx}`)))] }, version))) }) }))] }));
}
const styles = {
    container: {
        background: '#fff',
        borderRadius: '12px',
        marginBottom: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        border: '1px solid rgba(226, 232, 240, 0.6)',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        cursor: 'pointer',
        userSelect: 'none',
        borderBottom: '1px solid #f1f5f9',
        transition: 'background 0.15s',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        minWidth: 0,
        flex: 1,
    },
    dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#3b82f6',
        flexShrink: 0,
    },
    headerTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
    },
    headerDate: {
        fontSize: '12px',
        color: '#94a3b8',
    },
    headerVersion: {
        fontSize: '11px',
        color: '#64748b',
        background: '#f1f5f9',
        padding: '1px 6px',
        borderRadius: '4px',
    },
    toggle: {
        fontSize: '12px',
        color: '#3b82f6',
        fontWeight: 500,
        flexShrink: 0,
    },
    summary: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px 12px',
        fontSize: '13px',
        color: '#475569',
        lineHeight: 1.5,
        overflow: 'hidden',
    },
    summaryText: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
    },
    body: {
        padding: '4px 16px 16px',
    },
    scrollContainer: {
        maxHeight: '360px',
        overflowY: 'auto',
        paddingRight: '4px',
    },
    entry: {
        paddingTop: '12px',
        paddingBottom: '12px',
        borderBottom: '1px solid #f1f5f9',
    },
    entryHeader: {
        marginBottom: '8px',
    },
    entryMeta: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '4px',
        flexWrap: 'wrap',
    },
    entryDate: {
        fontSize: '12px',
        color: '#94a3b8',
    },
    entryVersion: {
        fontSize: '11px',
        color: '#64748b',
        background: '#f1f5f9',
        padding: '1px 6px',
        borderRadius: '4px',
    },
    entryTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
    },
    entryList: {
        margin: 0,
        paddingLeft: '18px',
        listStyle: 'disc',
    },
    entryItem: {
        fontSize: '13px',
        color: '#475569',
        lineHeight: 1.7,
        marginBottom: '2px',
    },
    versionGroup: {
        marginBottom: '16px',
    },
    versionHeader: {
        fontSize: '13px',
        fontWeight: 600,
        color: '#3b82f6',
        marginBottom: '8px',
        paddingBottom: '4px',
        borderBottom: '1px solid #e2e8f0',
    },
};
