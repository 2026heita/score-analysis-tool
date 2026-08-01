import type { ChartTab } from '../../types';

interface ChartTabsProps {
  activeTab: ChartTab;
  onChange: (tab: ChartTab) => void;
  hasTimeField?: boolean;
}

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'histogram', label: '分布图' },
  { key: 'boxplot', label: '箱线图' },
  { key: 'cdf', label: '累积分布图' },
  { key: 'quartile', label: '四分位占比图' },
  { key: 'timeseries', label: '时间趋势' },
];

export default function ChartTabs({ activeTab, onChange, hasTimeField = false }: ChartTabsProps) {
  const visibleTabs = hasTimeField
    ? TABS
    : TABS.filter((tab) => tab.key !== 'timeseries');

  return (
    <div style={styles.container}>
      {visibleTabs.map(tab => (
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
    maxWidth: '100%',
    minWidth: 0,
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
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: '#3b82f6',
    color: '#fff',
    border: '1px solid #3b82f6',
  },
};
