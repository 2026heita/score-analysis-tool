/**
 * 零售 BI 单日经营概览组件
 *
 * 展示五个核心指标：
 * - 总销售额 (totalSales)
 * - 总订单数 (totalOrders)
 * - 总客户数 (totalCustomers)
 * - 总销售数量 (totalQuantity)
 * - 平均订单价值 (avgOrderValue)
 */

import type { SalesOverviewVO } from '../types/retailBi';

interface RetailBiOverviewProps {
  data: SalesOverviewVO | null;
}

/**
 * 格式化金额（千分位 + 两位小数）
 */
function formatAmount(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 格式化数量（千分位）
 */
function formatQuantity(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('zh-CN');
}

export default function RetailBiOverview({ data }: RetailBiOverviewProps) {
  // 空数据状态
  if (!data) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>零售 BI 单日经营概览</span>
        </div>
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>暂无数据</p>
          <p style={styles.emptyHint}>请通过上方"外部数据源"加载零售 BI 数据</p>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: '总销售额',
      value: formatAmount(data.totalSales),
      unit: '元',
      color: '#6366f1',
    },
    {
      label: '总订单数',
      value: formatQuantity(data.totalOrders),
      unit: '单',
      color: '#8b5cf6',
    },
    {
      label: '总客户数',
      value: formatQuantity(data.totalCustomers),
      unit: '人',
      color: '#ec4899',
    },
    {
      label: '总销售数量',
      value: formatQuantity(data.totalQuantity),
      unit: '件',
      color: '#14b8a6',
    },
    {
      label: '平均订单价值',
      value: formatAmount(data.avgOrderValue),
      unit: '元',
      color: '#f59e0b',
    },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>零售 BI 单日经营概览</span>
        <span style={styles.headerBadge}>{data.dt}</span>
      </div>
      <div style={styles.body}>
        <div style={styles.dateNote}>
          <span style={styles.noteIcon}>ℹ️</span>
          <span style={styles.noteText}>以上 KPI 为 <strong>{data.dt}</strong> 单日数据</span>
        </div>
        <div style={styles.metricsGrid}>
          {metrics.map((metric, index) => (
            <div key={index} style={styles.metricCard}>
              <div style={styles.metricLabel}>{metric.label}</div>
              <div style={styles.metricValue}>
                <span style={{ ...styles.metricNumber, color: metric.color }}>
                  {metric.value}
                </span>
                <span style={styles.metricUnit}>{metric.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: '#fff',
    boxSizing: 'border-box',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerBadge: {
    fontSize: '12px',
    opacity: 0.9,
    background: 'rgba(255,255,255,0.2)',
    padding: '2px 8px',
    borderRadius: '10px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    marginLeft: '8px',
  },
  body: {
    padding: '16px',
  },
  dateNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    marginBottom: '16px',
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#0369a1',
  },
  noteIcon: {
    fontSize: '14px',
  },
  noteText: {
    lineHeight: 1.5,
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#64748b',
    margin: '0 0 8px 0',
  },
  emptyHint: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '12px',
  },
  metricCard: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    border: '1px solid rgba(226, 232, 240, 0.6)',
    borderRadius: '10px',
    padding: '16px 8px',
    textAlign: 'center',
    transition: 'all 0.2s',
    minWidth: 0,
  },
  metricLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '8px',
    fontWeight: 500,
    lineHeight: 1.4,
    textAlign: 'center',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  metricValue: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '4px',
  },
  metricNumber: {
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  metricUnit: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
};
