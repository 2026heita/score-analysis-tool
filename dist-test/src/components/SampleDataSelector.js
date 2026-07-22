import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { sampleDatasets } from '../data/sampleDatasets';
export default function SampleDataSelector({ onSelect, isOpen, onClose }) {
    const [selectedCategory, setSelectedCategory] = useState('全部');
    const categories = ['全部', ...new Set(sampleDatasets.map(ds => ds.category))];
    const filteredDatasets = selectedCategory === '全部'
        ? sampleDatasets
        : sampleDatasets.filter(ds => ds.category === selectedCategory);
    const handleSelect = (dataset) => {
        onSelect(dataset);
        onClose();
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { style: styles.overlay, onClick: onClose, children: _jsxs("div", { style: styles.container, onClick: e => e.stopPropagation(), children: [_jsxs("div", { style: styles.header, children: [_jsxs("div", { style: styles.headerContent, children: [_jsx("div", { style: styles.headerIcon, children: "\uD83D\uDCCA" }), _jsxs("div", { children: [_jsx("div", { style: styles.title, children: "\u9009\u62E9\u793A\u4F8B\u6570\u636E" }), _jsx("div", { style: styles.subtitle, children: "\u5FEB\u901F\u4F53\u9A8C\u6570\u636E\u5206\u6790\u5E73\u53F0" })] })] }), _jsx("button", { style: styles.closeBtn, onClick: onClose, children: "\u00D7" })] }), _jsx("div", { style: styles.categoryFilter, children: categories.map(cat => (_jsx("button", { style: {
                            ...styles.categoryButton,
                            ...(selectedCategory === cat ? styles.categoryButtonActive : {})
                        }, onClick: () => setSelectedCategory(cat), children: cat }, cat))) }), _jsx("div", { style: styles.datasetGrid, children: filteredDatasets.map(dataset => (_jsxs("div", { style: styles.datasetCard, onClick: () => handleSelect(dataset), children: [_jsxs("div", { style: styles.cardHeader, children: [_jsx("div", { style: styles.datasetName, children: dataset.name }), _jsx("div", { style: styles.datasetCategory, children: dataset.category })] }), _jsx("div", { style: styles.datasetDesc, children: dataset.description }), _jsxs("div", { style: styles.datasetMeta, children: [_jsxs("span", { style: styles.metaItem, children: [_jsx("span", { style: styles.metaIcon, children: "\uD83D\uDCCB" }), dataset.headers.length, " \u4E2A\u5B57\u6BB5"] }), _jsxs("span", { style: styles.metaItem, children: [_jsx("span", { style: styles.metaIcon, children: "\uD83D\uDCDD" }), dataset.rows.length, " \u884C\u6570\u636E"] })] }), _jsx("div", { style: styles.cardAction, children: "\u9009\u62E9\u6B64\u793A\u4F8B \u2192" })] }, dataset.id))) })] }) }));
}
const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease-out',
        padding: '20px',
    },
    container: {
        background: '#fff',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.1)',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeInUp 0.25s ease-out',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        borderBottom: '1px solid #e2e8f0',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    },
    headerContent: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    headerIcon: {
        fontSize: '32px',
        lineHeight: 1,
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#1e293b',
        marginBottom: '2px',
    },
    subtitle: {
        fontSize: '13px',
        color: '#64748b',
        fontWeight: 400,
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: '28px',
        color: '#94a3b8',
        cursor: 'pointer',
        padding: '0',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
        transition: 'all 0.15s',
        lineHeight: 1,
    },
    categoryFilter: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '16px 24px',
        borderBottom: '1px solid #f1f5f9',
        background: '#fff',
    },
    categoryButton: {
        padding: '8px 16px',
        fontSize: '13px',
        color: '#64748b',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontWeight: 500,
    },
    categoryButtonActive: {
        color: '#fff',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        borderColor: 'transparent',
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
    },
    datasetGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px',
        padding: '20px 24px',
        overflowY: 'auto',
        flex: 1,
    },
    datasetCard: {
        padding: '16px',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: '2px solid #e2e8f0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '10px',
        gap: '8px',
    },
    datasetName: {
        fontSize: '15px',
        fontWeight: 600,
        color: '#1e293b',
        lineHeight: 1.3,
    },
    datasetCategory: {
        fontSize: '11px',
        color: '#6366f1',
        background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)',
        padding: '4px 10px',
        borderRadius: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },
    datasetDesc: {
        fontSize: '13px',
        color: '#64748b',
        lineHeight: 1.6,
        marginBottom: '12px',
        flex: 1,
    },
    datasetMeta: {
        display: 'flex',
        gap: '12px',
        marginBottom: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #f1f5f9',
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
        color: '#64748b',
        fontWeight: 500,
    },
    metaIcon: {
        fontSize: '14px',
    },
    cardAction: {
        fontSize: '13px',
        color: '#6366f1',
        fontWeight: 500,
        textAlign: 'center',
        padding: '8px',
        background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
        borderRadius: '8px',
        transition: 'all 0.2s',
    },
};
