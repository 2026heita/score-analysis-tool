import { jsx as _jsx } from "react/jsx-runtime";
const TABS = [
    { key: 'histogram', label: '分布图' },
    { key: 'boxplot', label: '箱线图' },
    { key: 'cdf', label: '累积分布图' },
    { key: 'quartile', label: '四分位占比图' },
];
export default function ChartTabs({ activeTab, onChange }) {
    return (_jsx("div", { style: styles.container, children: TABS.map(tab => (_jsx("button", { onClick: () => onChange(tab.key), style: {
                ...styles.tab,
                ...(activeTab === tab.key ? styles.tabActive : {}),
            }, children: tab.label }, tab.key))) }));
}
const styles = {
    container: {
        display: 'flex',
        gap: '8px',
        marginBottom: '12px',
        flexWrap: 'wrap',
    },
    tab: {
        padding: '6px 16px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        background: '#fff',
        color: '#64748b',
        fontSize: '13px',
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    tabActive: {
        background: '#3b82f6',
        color: '#fff',
        border: '1px solid #3b82f6',
    },
};
