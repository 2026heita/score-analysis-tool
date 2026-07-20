import { useState } from 'react';
import type { AnalysisExplanation, FieldExplanation } from '../types';
import { safeFormatNumber, safeFormatPercent } from '../utils/safeFormat';

interface AnalysisExplainerProps {
  explanation: AnalysisExplanation;
}

export default function AnalysisExplainer({ explanation }: AnalysisExplainerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { fieldExplanations, multiFieldSummary } = explanation;

  if (fieldExplanations.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>分析解释</h3>

      {/* 简要摘要 */}
      <div style={styles.summary}>
        {multiFieldSummary.insufficientData ? (
          <p style={styles.warning}>
            字段较少（{multiFieldSummary.fieldCount} 个），综合判断仅供参考
          </p>
        ) : (
          <>
            <p style={styles.summaryText}>
              综合 {multiFieldSummary.fieldCount} 个字段，平均百分位{' '}
              <strong>{safeFormatPercent(multiFieldSummary.averagePercentile)}</strong>
            </p>
            {multiFieldSummary.top3Fields.length > 0 && (
              <p style={styles.summaryText}>
                相对最强：{multiFieldSummary.top3Fields.map(f => f.field).join('、')}
              </p>
            )}
            {multiFieldSummary.bottom3Fields.length > 0 && (
              <p style={styles.summaryText}>
                相对最弱：{multiFieldSummary.bottom3Fields.map(f => f.field).join('、')}
              </p>
            )}
          </>
        )}
      </div>

      {/* 展开/收起按钮 */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={styles.toggleButton}
      >
        {showDetails ? '收起详细解释' : '查看详细解释'}
      </button>

      {/* 详细解释 */}
      {showDetails && (
        <div style={styles.details}>
          {fieldExplanations.map((exp, index) => (
            <FieldExplanationCard key={index} explanation={exp} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldExplanationCard({ explanation }: { explanation: FieldExplanation }) {
  const {
    field,
    userValue,
    mean,
    lowerCount,
    percentile,
    tierLabel,
    diffFromMean,
    diffFromP75,
    diffFromP90,
    diffFromP95,
    validCount,
  } = explanation;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.fieldName}>{field}</span>
        <span style={styles.tierBadge}>{tierLabel}</span>
      </div>

      <div style={styles.stats}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>你的数值：</span>
          <strong>{userValue}</strong>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>平均分：</span>
          <span>{safeFormatNumber(mean, 2)}</span>
          <span style={getDiffStyle(diffFromMean)}>
            ({diffFromMean >= 0 ? '+' : ''}{safeFormatNumber(diffFromMean, 2)})
          </span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>超过人数：</span>
          <span>{lowerCount} / {validCount}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>百分位：</span>
          <span>{safeFormatPercent(percentile)}</span>
        </div>
      </div>

      <div style={styles.percentiles}>
        <div style={styles.percentileRow}>
          <span style={styles.percentileLabel}>与 P75 差距：</span>
          <span style={getDiffStyle(diffFromP75)}>
            {diffFromP75 >= 0 ? '+' : ''}{safeFormatNumber(diffFromP75, 2)}
          </span>
        </div>
        <div style={styles.percentileRow}>
          <span style={styles.percentileLabel}>与 P90 差距：</span>
          <span style={getDiffStyle(diffFromP90)}>
            {diffFromP90 >= 0 ? '+' : ''}{safeFormatNumber(diffFromP90, 2)}
          </span>
        </div>
        <div style={styles.percentileRow}>
          <span style={styles.percentileLabel}>与 P95 差距：</span>
          <span style={getDiffStyle(diffFromP95)}>
            {diffFromP95 >= 0 ? '+' : ''}{safeFormatNumber(diffFromP95, 2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function getDiffStyle(diff: number): React.CSSProperties {
  return {
    marginLeft: '8px',
    color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#64748b',
    fontWeight: 500,
  };
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: '24px',
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  summary: {
    padding: '12px',
    background: '#ffffff',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  warning: {
    margin: 0,
    color: '#f59e0b',
    fontSize: '14px',
  },
  summaryText: {
    margin: '4px 0',
    fontSize: '14px',
    color: '#475569',
    lineHeight: 1.6,
  },
  toggleButton: {
    marginTop: '12px',
    padding: '6px 12px',
    fontSize: '13px',
    color: '#3b82f6',
    background: 'transparent',
    border: '1px solid #3b82f6',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  details: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    padding: '12px',
    background: '#ffffff',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  fieldName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
  },
  tierBadge: {
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#ffffff',
    background: '#3b82f6',
    borderRadius: '4px',
  },
  stats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: '#475569',
  },
  statLabel: {
    color: '#64748b',
    marginRight: '4px',
  },
  percentiles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '8px',
    borderTop: '1px solid #e2e8f0',
  },
  percentileRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
  },
  percentileLabel: {
    color: '#64748b',
    marginRight: '4px',
  },
};
