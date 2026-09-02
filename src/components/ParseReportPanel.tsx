import { useState } from 'react';
import type { ParseReport, ParseReportField } from '../utils/tableParser/types';

interface ParseReportPanelProps {
  report: ParseReport;
}

export default function ParseReportPanel({ report }: ParseReportPanelProps) {
  const { summary, fields, warnings } = report;
  const [showFieldDetails, setShowFieldDetails] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [onlyLowConfidence, setOnlyLowConfidence] = useState(false);

  // 旧版分析角色 → 通用展示标签（仅做展示，不做角色决策）
  const ROLE_LABEL: Record<string, string> = {
    identity: '标识',
    primaryTotal: '指标',
    rank: '指标',
    sectionTotal: '指标',
    courseScore: '指标',
    adjustment: '调整',
    textMeta: '描述',
    unknown: '未知',
    invalid: '无效',
  };

  // 筛选低置信度字段
  const displayFields = onlyLowConfidence
    ? fields.filter(f => f.confidence < 0.7)
    : fields;

  return (
    <div style={styles.container}>
      {/* 摘要统计 - 默认展示 */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>解析概览</h3>
        <div style={styles.summaryGrid}>
          <SummaryCard label="数据行数" value={summary.dataRowCount} />
          <SummaryCard label="字段总数" value={summary.fieldCount} />
          <SummaryCard label="推荐字段" value={summary.recommendedFieldCount} highlight />
          <SummaryCard label="标识字段" value={summary.identityCount} />
          <SummaryCard label="调整项" value={summary.adjustmentCount} />
          <SummaryCard label="无效字段" value={summary.invalidCount} warn={summary.invalidCount > 0} />
          <SummaryCard label="低置信度" value={summary.lowConfidenceCount} warn={summary.lowConfidenceCount > 0} />
        </div>
        {(summary.lowConfidenceCount > 0 || summary.invalidCount > 0 || summary.unknownCount > 0) && (
          <div style={styles.overviewHint}>
            {summary.lowConfidenceCount > 0 && (
              <span style={styles.hintItem}>⚠ {summary.lowConfidenceCount} 个低置信度字段</span>
            )}
            {summary.invalidCount > 0 && (
              <span style={styles.hintItem}>⚠ {summary.invalidCount} 个无效字段已排除</span>
            )}
            {summary.unknownCount > 0 && (
              <span style={styles.hintItem}>⚠ {summary.unknownCount} 个未知字段需确认</span>
            )}
          </div>
        )}
      </section>

      {/* 警告信息 */}
      {warnings.length > 0 && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>提示信息</h3>
          <ul style={styles.warningList}>
            {warnings.map((warning: string, index: number) => (
              <li key={index} style={styles.warningItem}>
                {warning}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 字段识别详情 - 默认收起 */}
      <section style={styles.section}>
        <div style={styles.collapsibleHeader}>
          <h3 style={styles.sectionTitle}>字段识别详情 ({fields.length} 个字段)</h3>
          <button
            style={styles.toggleButton}
            onClick={() => setShowFieldDetails(!showFieldDetails)}
          >
            {showFieldDetails ? '收起' : '展开'}
          </button>
        </div>
        {showFieldDetails && (
          <>
            <div style={styles.filterRow}>
              <label style={styles.filterLabel}>
                <input
                  type="checkbox"
                  checked={onlyLowConfidence}
                  onChange={e => setOnlyLowConfidence(e.target.checked)}
                  style={styles.checkbox}
                />
                仅查看低置信度字段 (置信度 &lt; 70%)
              </label>
            </div>
            <div style={styles.fieldTable}>
              <div style={styles.fieldHeader}>
                <div style={styles.fieldHeaderCell} className="prp-c-name">字段名</div>
                <div style={styles.fieldHeaderCell} className="prp-c-type">类型</div>
                <div style={styles.fieldHeaderCell} className="prp-c-conf">置信度</div>
                <div style={styles.fieldHeaderCell} className="prp-c-rec">推荐</div>
                <div style={styles.fieldHeaderCell} className="prp-c-hidden">隐藏原因</div>
              </div>
              {displayFields.length === 0 ? (
                <div style={styles.emptyHint}>
                  {onlyLowConfidence ? '没有低置信度字段' : '没有字段数据'}
                </div>
              ) : (
                displayFields.map((field: ParseReportField, index: number) => (
                  <div
                    key={index}
                    style={{
                      ...styles.fieldRow,
                      ...(index % 2 === 0 ? {} : styles.fieldRowAlt),
                    }}
                  >
                    <div style={styles.fieldCell} className="prp-c-name">
                      <span style={styles.fieldName}>{field.name}</span>
                    </div>
                    <div style={styles.fieldCell} className="prp-c-type">
                      <span style={styles.typeBadge}>{ROLE_LABEL[field.analysisRole] ?? field.analysisRole}</span>
                    </div>
                    <div style={styles.fieldCell} className="prp-c-conf">
                      <span
                        style={{
                          ...styles.confidenceBadge,
                          ...(field.confidence >= 0.8
                            ? styles.confidenceHigh
                            : field.confidence >= 0.6
                            ? styles.confidenceMedium
                            : styles.confidenceLow),
                        }}
                      >
                        {(field.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={styles.fieldCell} className="prp-c-rec">
                      {field.recommended ? (
                        <span style={styles.recommendedYes}>✓</span>
                      ) : (
                        <span style={styles.recommendedNo}>-</span>
                      )}
                    </div>
                    <div style={styles.fieldCell} className="prp-c-hidden">
                      <span style={styles.hiddenReason}>
                        {field.hiddenByDefault ? field.hiddenReason : '-'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {/* 分类原因详情 - 默认收起 */}
      <section style={styles.section}>
        <div style={styles.collapsibleHeader}>
          <h3 style={styles.sectionTitle}>分类原因说明</h3>
          <button
            style={styles.toggleButton}
            onClick={() => setShowReasons(!showReasons)}
          >
            {showReasons ? '收起' : '展开'}
          </button>
        </div>
        {showReasons && (
          <div style={styles.reasonList}>
            {fields.map((field: ParseReportField, index: number) => (
              <div key={index} style={styles.reasonItem}>
                <div style={styles.reasonHeader}>
                  <span style={styles.reasonFieldName}>{field.name}</span>
                  <span style={styles.reasonConfidence}>
                    置信度: {(field.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={styles.reasonText}>{field.reason}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      style={{
        ...styles.summaryCard,
        ...(highlight ? styles.summaryCardHighlight : {}),
        ...(warn ? styles.summaryCardWarn : {}),
      }}
    >
      <div style={styles.summaryCardValue}>{value}</div>
      <div style={styles.summaryCardLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  section: {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '12px',
  },
  summaryCard: {
    background: '#f8fafc',
    borderRadius: '6px',
    padding: '12px',
    textAlign: 'center',
    border: '1px solid #e2e8f0',
  },
  summaryCardHighlight: {
    background: '#dbeafe',
    borderColor: '#3b82f6',
  },
  summaryCardWarn: {
    background: '#fef3c7',
    borderColor: '#f59e0b',
  },
  summaryCardValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: '4px',
  },
  summaryCardLabel: {
    fontSize: '12px',
    color: '#64748b',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    listStyle: 'none',
  },
  warningItem: {
    fontSize: '13px',
    color: '#92400e',
    marginBottom: '8px',
    paddingLeft: '16px',
    position: 'relative',
  },
  fieldTable: {
    fontSize: '13px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    // 表体内部横向滚动：手机端宁可左右滑也不把列压成竖排
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    WebkitOverflowScrolling: 'touch' as const,
  },
  fieldHeader: {
    display: 'flex',
    background: '#f1f5f9',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: 600,
    // 手机端行宽不低于内容所需，触发容器横向滚动
    minWidth: '800px',
    width: '100%' as const,
  },
  fieldHeaderCell: {
    padding: '8px 12px',
    flex: '1',
  },
  fieldRow: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    minWidth: '800px',
    width: '100%' as const,
  },
  fieldRowAlt: {
    background: '#f8fafc',
  },
  fieldCell: {
    padding: '8px 12px',
    flex: '1',
    display: 'flex',
    alignItems: 'flex-start',
    lineHeight: 1.5,
  },
  fieldName: {
    fontWeight: 500,
    color: '#1e293b',
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    wordBreak: 'break-word' as const,
  },
  typeBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    background: '#e0e7ff',
    color: '#3730a3',
    borderRadius: '4px',
    fontWeight: 500,
  },
  confidenceBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 600,
  },
  confidenceHigh: {
    background: '#d1fae5',
    color: '#065f46',
  },
  confidenceMedium: {
    background: '#fef3c7',
    color: '#92400e',
  },
  confidenceLow: {
    background: '#fee2e2',
    color: '#991b1b',
  },
  recommendedYes: {
    color: '#10b981',
    fontWeight: 700,
    fontSize: '16px',
  },
  recommendedNo: {
    color: '#94a3b8',
    fontSize: '16px',
  },
  hiddenReason: {
    fontSize: '12px',
    color: '#64748b',
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    wordBreak: 'break-word' as const,
    lineHeight: '1.5',
  },
  reasonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  reasonItem: {
    padding: '12px',
    background: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  reasonHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  reasonFieldName: {
    fontWeight: 600,
    color: '#1e293b',
    fontSize: '13px',
  },
  reasonConfidence: {
    fontSize: '12px',
    color: '#64748b',
  },
  reasonText: {
    fontSize: '12px',
    color: '#475569',
    lineHeight: '1.5',
  },
  collapsibleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  toggleButton: {
    padding: '4px 12px',
    fontSize: '12px',
    background: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#475569',
  },
  filterRow: {
    marginBottom: '12px',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: '4px',
  },
  filterLabel: {
    fontSize: '12px',
    color: '#475569',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  checkbox: {
    cursor: 'pointer',
  },
  overviewHint: {
    marginTop: '12px',
    padding: '8px 12px',
    background: '#fef3c7',
    borderRadius: '4px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  hintItem: {
    fontSize: '12px',
    color: '#92400e',
  },
  emptyHint: {
    padding: '24px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '13px',
  },
};
