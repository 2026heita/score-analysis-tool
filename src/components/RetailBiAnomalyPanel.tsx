/**
 * 零售 BI 经营异常展示组件。
 *
 * 展示后端 Hive ADS 已识别的 MEDIUM / HIGH 异常，
 * 前端只负责呈现，不重复计算异常规则。
 *
 * 解释边界：
 * - 订单数与平均客单价是 sales = orders × AOV 的直接分解项；
 * - 客户数与销售数量只作为辅助经营信号；
 * - “主要驱动项”是指标分解结果，不表示因果关系。
 */

import type { SalesAnomalyVO } from '../types/retailBi';

interface RetailBiAnomalyPanelProps {
  data: SalesAnomalyVO[];
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatAmount(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDriver(driver: SalesAnomalyVO['primaryDriver']): string {
  if (driver === 'ORDERS') return '订单数';
  if (driver === 'AVG_ORDER_VALUE') return '平均客单价';
  return driver || '—';
}

function getLevelStyle(level: string): React.CSSProperties {
  if (level === 'HIGH') {
    return {
      color: '#991b1b',
      background: '#fee2e2',
      border: '1px solid #fecaca',
    };
  }

  return {
    color: '#92400e',
    background: '#fef3c7',
    border: '1px solid #fde68a',
  };
}

function getChangeColor(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '#94a3b8';
  }
  if (value < 0) return '#dc2626';
  if (value > 0) return '#16a34a';
  return '#64748b';
}

export default function RetailBiAnomalyPanel({ data }: RetailBiAnomalyPanelProps) {
  const highCount = data.filter((row) => row.anomalyLevel === 'HIGH').length;
  const mediumCount = data.filter((row) => row.anomalyLevel === 'MEDIUM').length;
  const totalLoss = data.reduce(
    (sum, row) => sum + (row.salesLossAmount ?? 0),
    0,
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>经营异常分析</div>
          <div style={styles.headerSubtitle}>
            Hive ADS 异常结果 · 前端仅展示，不重复计算规则
          </div>
        </div>
        <span style={styles.headerBadge}>{data.length} 条异常</span>
      </div>

      <div style={styles.body}>
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>HIGH</div>
            <div style={styles.summaryValue}>{highCount}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>MEDIUM</div>
            <div style={styles.summaryValue}>{mediumCount}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>异常销售损失合计</div>
            <div style={styles.summaryValue}>¥ {formatAmount(totalLoss)}</div>
          </div>
        </div>

        {data.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>所选日期范围内没有 MEDIUM / HIGH 经营异常</p>
            <p style={styles.emptyHint}>NORMAL 日期不会出现在异常列表中。</p>
          </div>
        ) : (
          <div style={styles.list}>
            {data.map((row) => (
              <details key={row.dt} style={styles.item}>
                <summary style={styles.itemSummary}>
                  <span style={{ ...styles.levelBadge, ...getLevelStyle(row.anomalyLevel) }}>
                    {row.anomalyLevel}
                  </span>
                  <span style={styles.date}>{row.dt}</span>
                  <span style={styles.summaryMetric}>
                    销售额变化
                    <strong style={{ color: getChangeColor(row.salesChangePct) }}>
                      {formatPercent(row.salesChangePct)}
                    </strong>
                  </span>
                  <span style={styles.summaryMetric}>
                    销售损失
                    <strong>¥ {formatAmount(row.salesLossAmount)}</strong>
                  </span>
                  <span style={styles.driverBadge}>
                    主要驱动：{formatDriver(row.primaryDriver)}
                  </span>
                </summary>

                <div style={styles.detailBody}>
                  <p style={styles.explanation}>
                    相较上一可用业务日 <strong>{row.prevDt ?? '—'}</strong>，销售额从
                    {' '}<strong>¥ {formatAmount(row.prevSales)}</strong> 变为
                    {' '}<strong>¥ {formatAmount(row.totalSales)}</strong>，变化
                    {' '}<strong style={{ color: getChangeColor(row.salesChangePct) }}>
                      {formatPercent(row.salesChangePct)}
                    </strong>。主要直接驱动项为
                    {' '}<strong>{formatDriver(row.primaryDriver)}</strong>；客户数与销售数量仅作辅助经营信号，不表示因果关系。
                  </p>

                  <div style={styles.metricGrid}>
                    <div style={styles.metricCard}>
                      <span style={styles.metricLabel}>订单数变化</span>
                      <strong style={{ color: getChangeColor(row.ordersChangePct) }}>
                        {formatPercent(row.ordersChangePct)}
                      </strong>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricLabel}>客单价变化</span>
                      <strong style={{ color: getChangeColor(row.aovChangePct) }}>
                        {formatPercent(row.aovChangePct)}
                      </strong>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricLabel}>客户数变化</span>
                      <strong style={{ color: getChangeColor(row.customersChangePct) }}>
                        {formatPercent(row.customersChangePct)}
                      </strong>
                    </div>
                    <div style={styles.metricCard}>
                      <span style={styles.metricLabel}>销售数量变化</span>
                      <strong style={{ color: getChangeColor(row.quantityChangePct) }}>
                        {formatPercent(row.quantityChangePct)}
                      </strong>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}

        <p style={styles.footnote}>
          注：异常等级与 primaryDriver 均来自后端 Serving 数据；指标分解用于解释异常结构，不等同于因果推断。
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: '12px 0',
    border: '1px solid rgba(226, 232, 240, 0.8)',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    color: '#fff',
    background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 700,
  },
  headerSubtitle: {
    marginTop: '3px',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.72)',
  },
  headerBadge: {
    flexShrink: 0,
    padding: '3px 9px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.15)',
    fontSize: '12px',
  },
  body: {
    padding: '16px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  summaryCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '10px 12px',
    background: '#f8fafc',
  },
  summaryLabel: {
    marginBottom: '4px',
    fontSize: '11px',
    color: '#64748b',
  },
  summaryValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1e293b',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  item: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#fff',
    overflow: 'hidden',
  },
  itemSummary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '11px 12px',
    cursor: 'pointer',
    color: '#334155',
  },
  levelBadge: {
    padding: '2px 7px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
  },
  date: {
    minWidth: '86px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#0f172a',
  },
  summaryMetric: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    color: '#64748b',
  },
  driverBadge: {
    marginLeft: 'auto',
    padding: '3px 8px',
    borderRadius: '6px',
    background: '#eef2ff',
    color: '#4338ca',
    fontSize: '12px',
    fontWeight: 600,
  },
  detailBody: {
    padding: '12px',
    borderTop: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  explanation: {
    margin: '0 0 12px',
    color: '#475569',
    fontSize: '13px',
    lineHeight: 1.7,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '8px',
  },
  metricCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '9px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '7px',
    background: '#fff',
    fontSize: '13px',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#64748b',
  },
  emptyState: {
    padding: '26px 16px',
    textAlign: 'center',
    border: '1px dashed #cbd5e1',
    borderRadius: '8px',
    background: '#f8fafc',
  },
  emptyText: {
    margin: '0 0 6px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#475569',
  },
  emptyHint: {
    margin: 0,
    fontSize: '12px',
    color: '#94a3b8',
  },
  footnote: {
    margin: '12px 0 0',
    fontSize: '11px',
    lineHeight: 1.6,
    color: '#94a3b8',
  },
};
