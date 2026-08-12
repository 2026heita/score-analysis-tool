/**
 * 零售 BI 日环比展示组件
 *
 * 展示五个核心指标的日环比变化百分比：
 * - totalSalesPercent
 * - totalOrdersPercent
 * - totalCustomersPercent
 * - totalQuantityPercent
 * - avgOrderValuePercent
 *
 * 状态处理：
 * - comparisonAvailable=false：当前数据源不存在更早的可用业务日期
 * - 单项百分比为 null：显示"暂无数据"
 */

import type { SalesOverviewComparisonVO } from '../types/retailBi';

interface RetailBiComparisonProps {
  data: SalesOverviewComparisonVO | null;
}

/**
 * 格式化百分比（保留两位小数，带正负号）。
 * 后端返回 12.34 表示百分之十二点三四。
 */
function formatPercent(value: number | null): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 根据百分比值返回颜色。
 * 正值绿色，负值红色，零灰色。
 */
function getPercentColor(value: number | null): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '#94a3b8';
  }
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
}

/**
 * 根据百分比值返回趋势箭头。
 */
function getTrendIcon(value: number | null): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  if (value > 0) return '↑';
  if (value < 0) return '↓';
  return '→';
}

export default function RetailBiComparison({ data }: RetailBiComparisonProps) {
  // 空数据状态
  if (!data) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>零售 BI 日环比变化</span>
        </div>
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>暂无数据</p>
          <p style={styles.emptyHint}>请先加载零售 BI 概览数据</p>
        </div>
      </div>
    );
  }

  // 环比不可用状态
  if (!data.comparisonAvailable) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>零售 BI 日环比变化</span>
          <span style={styles.headerBadge}>{data.date}</span>
        </div>
        <div style={styles.body}>
          <div style={styles.dateNote}>
            <span style={styles.noteIcon}>ℹ️</span>
            <span style={styles.noteText}>
              当前日期 <strong>{data.date}</strong>
            </span>
          </div>
          <div style={styles.unavailableState}>
            <p style={styles.unavailableText}>暂无上一可用业务日，无法比较</p>
            <p style={styles.unavailableHint}>
              当前 source_system 下不存在更早的可用业务日期
            </p>
          </div>
        </div>
      </div>
    );
  }

  const changePercent = data.changePercent;

  const metrics = [
    {
      label: '总销售额',
      value: changePercent?.totalSalesPercent ?? null,
      color: getPercentColor(changePercent?.totalSalesPercent ?? null),
    },
    {
      label: '总订单数',
      value: changePercent?.totalOrdersPercent ?? null,
      color: getPercentColor(changePercent?.totalOrdersPercent ?? null),
    },
    {
      label: '总客户数',
      value: changePercent?.totalCustomersPercent ?? null,
      color: getPercentColor(changePercent?.totalCustomersPercent ?? null),
    },
    {
      label: '总销售数量',
      value: changePercent?.totalQuantityPercent ?? null,
      color: getPercentColor(changePercent?.totalQuantityPercent ?? null),
    },
    {
      label: '平均订单价值',
      value: changePercent?.avgOrderValuePercent ?? null,
      color: getPercentColor(changePercent?.avgOrderValuePercent ?? null),
    },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>零售 BI 日环比变化</span>
        <span style={styles.headerBadge}>{data.date}</span>
      </div>
      <div style={styles.body}>
        <div style={styles.dateNote}>
          <span style={styles.noteIcon}>ℹ️</span>
          <span style={styles.noteText}>
            当前日期 <strong>{data.date}</strong>，与上一可用业务日 {data.comparisonDate} 比较
          </span>
        </div>
        <div style={styles.metricsGrid}>
          {metrics.map((metric, index) => (
            <div key={index} style={styles.metricCard}>
              <div style={styles.metricLabel}>{metric.label}</div>
              <div style={styles.metricValue}>
                {metric.value === null ? (
                  <span style={styles.noDataText}>暂无数据</span>
                ) : (
                  <>
                    <span style={styles.trendIcon}>{getTrendIcon(metric.value)}</span>
                    <span style={{ ...styles.metricNumber, color: metric.color }}>
                      {formatPercent(metric.value)}
                    </span>
                  </>
                )}
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
  unavailableState: {
    padding: '32px 20px',
    textAlign: 'center',
  },
  unavailableText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#64748b',
    margin: '0 0 8px 0',
  },
  unavailableHint: {
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metricValue: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '4px',
  },
  trendIcon: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#64748b',
  },
  metricNumber: {
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  noDataText: {
    fontSize: '13px',
    color: '#94a3b8',
    fontWeight: 500,
  },
};
