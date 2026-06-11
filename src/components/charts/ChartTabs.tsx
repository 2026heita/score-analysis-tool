import type { ChartTab } from '../../types';

interface ChartTabsProps {
  activeTab: ChartTab;
  onChange: (tab: ChartTab) => void;
}

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'histogram', label: '分布图' },
  { key: 'boxplot', label: '箱线图' },
  { key: 'cdf', label: '累积分布图' },
  { key: 'quartile', label: '四分位占比图' },
];

export default function ChartTabs({ activeTab, onChange }: ChartTabsProps) {
  return (
    <div style={styles.container}>
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            ...styles.tab,
            ...(activeTab === tab.key ? styles.tabActive : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
