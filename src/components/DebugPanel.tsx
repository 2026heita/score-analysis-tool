import type { DerivedDataContext, MetricResult } from '../engine/context';
import type { MetricDefinition } from '../engine/metricLayer';

interface DebugPanelProps {
  context: DerivedDataContext | null;
  metricResult: MetricResult | null;
  selectedField: string;
  /** v1.4 Phase 4：MetricDefinition 由 View 层传入，不再从 context 中查找 */
  metricDef?: MetricDefinition;
}

/**
 * 调试面板：在开发模式下展示当前 metric 的详细信息
 * 用于人工核对 direction 是否真正生效
 */
export function DebugPanel({ context, metricResult, selectedField, metricDef }: DebugPanelProps) {
  // 仅在开发模式下显示
  if (import.meta.env.PROD) return null;
  
  if (!context || !metricResult || !selectedField) {
    return (
      <div style={styles.debugPanel}>
        <div style={styles.debugTitle}>🔧 调试面板</div>
        <div style={styles.debugValue}>未选择字段或无数据</div>
      </div>
    );
  }

  return (
    <div style={styles.debugPanel}>
      <div style={styles.debugTitle}>🔧 调试面板（仅开发模式）</div>
      
      <div style={styles.debugSection}>
        <div style={styles.debugLabel}>Metric 定义</div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>metricId:</span>
          <span style={styles.debugValue}>{metricResult.metricName}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>fieldKey:</span>
          <span style={styles.debugValue}>{metricDef?.sourceField || 'N/A'}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>direction:</span>
          <span style={{
            ...styles.debugValue,
            ...styles.directionBadge,
            backgroundColor: metricResult.direction === 'higher-is-better' ? '#10b981' : '#f59e0b'
          }}>
            {metricResult.direction}
          </span>
        </div>
      </div>

      <div style={styles.debugSection}>
        <div style={styles.debugLabel}>计算结果</div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>validCount:</span>
          <span style={styles.debugValue}>{metricResult.stats?.validCount || 0}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>invalidCount:</span>
          <span style={styles.debugValue}>{metricResult.stats?.invalidCount || 0}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>truncatedRows:</span>
          <span style={styles.debugValue}>{metricResult.truncatedRows}</span>
        </div>
      </div>

      {metricResult.position && metricResult.direction !== 'neutral' && metricResult.direction !== 'unspecified' && (
        <div style={styles.debugSection}>
          <div style={styles.debugLabel}>相对位置</div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>rank:</span>
            <span style={styles.debugValue}>{metricResult.position.bestRank}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>percentile:</span>
            <span style={styles.debugValue}>{metricResult.position.percentile.toFixed(2)}%</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>higherCount:</span>
            <span style={styles.debugValue}>{metricResult.position.higherCount}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>equalCount:</span>
            <span style={styles.debugValue}>{metricResult.position.equalCount}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>lowerCount:</span>
            <span style={styles.debugValue}>{metricResult.position.lowerCount}</span>
          </div>
          <div style={styles.debugRow}>
            <span style={styles.debugKey}>existsInData:</span>
            <span style={styles.debugValue}>{metricResult.position.existsInData ? 'true' : 'false'}</span>
          </div>
        </div>
      )}

      <div style={styles.debugSection}>
        <div style={styles.debugLabel}>统计指标</div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>mean:</span>
          <span style={styles.debugValue}>{metricResult.stats?.mean.toFixed(2) || 'N/A'}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>median:</span>
          <span style={styles.debugValue}>{metricResult.stats?.median.toFixed(2) || 'N/A'}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>q25:</span>
          <span style={styles.debugValue}>{metricResult.stats?.q25.toFixed(2) || 'N/A'}</span>
        </div>
        <div style={styles.debugRow}>
          <span style={styles.debugKey}>q75:</span>
          <span style={styles.debugValue}>{metricResult.stats?.q75.toFixed(2) || 'N/A'}</span>
        </div>
      </div>

      <div style={styles.debugFooter}>
        修改 MetricDefinition.direction 后，相对位置和百分位应同步变化
      </div>
    </div>
  );
}

const styles = {
  debugPanel: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  debugTitle: {
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#60a5fa',
  },
  debugSection: {
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #334155',
  },
  debugLabel: {
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#94a3b8',
    fontSize: '12px',
  },
  debugRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  debugKey: {
    color: '#94a3b8',
  },
  debugValue: {
    color: '#e2e8f0',
    fontWeight: '500',
  },
  directionBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
  },
  debugFooter: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #334155',
    fontSize: '11px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
};
