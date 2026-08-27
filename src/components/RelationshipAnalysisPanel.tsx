/**
 * 变量关系分析面板
 * 展示数值字段之间的相关性分析结果
 * 默认折叠，轻量版本
 */

import { useState } from 'react';
import type { CorrelationResult, CorrelationPair } from '../engine/correlationAnalyzer';

interface RelationshipAnalysisPanelProps {
  correlationResult: CorrelationResult | null;
}

export default function RelationshipAnalysisPanel({ correlationResult }: RelationshipAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!correlationResult) return null;

  const {
    numericalFields,
    totalPairs,
    topPositive,
    topNegative,
    weakCorrelations,
    warnings,
    matrix,
  } = correlationResult;

  // 数值字段不足
  if (numericalFields.length < 2) {
    return (
      <div style={styles.container}>
        <button
          style={styles.header}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span style={styles.headerTitle}>
            <span style={{ ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              &#9654;
            </span>
            变量关系分析
          </span>
          <span style={styles.headerBadge}>
            {numericalFields.length} 个数值字段
          </span>
        </button>
        {expanded && (
          <div style={styles.body}>
            <p style={styles.insufficientHint}>
              当前数据中可用于关系分析的数值字段不足。
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button
        style={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span style={styles.headerTitle}>
          <span style={{ ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            &#9654;
          </span>
          变量关系分析
        </span>
        <span style={styles.headerBadge}>
          {numericalFields.length} 个字段 · {totalPairs} 对关系
        </span>
      </button>

      {expanded && (
        <div style={styles.body}>
          <p style={styles.disclaimer}>
            以下为数值字段之间的统计相关性分析，两个字段存在统计相关，不代表因果关系。
          </p>

          {warnings.length > 0 && (
            <div style={styles.warningBox}>
              {warnings.map((w, i) => (
                <div key={i} style={styles.warningText}>{w}</div>
              ))}
            </div>
          )}

          {/* 摘要卡片 */}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{numericalFields.length}</div>
              <div style={styles.summaryLabel}>数值字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{totalPairs}</div>
              <div style={styles.summaryLabel}>可分析关系对</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{topPositive.length}</div>
              <div style={styles.summaryLabel}>强正相关</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{topNegative.length}</div>
              <div style={styles.summaryLabel}>强负相关</div>
            </div>
          </div>

          {/* 最高正相关 */}
          {topPositive.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>📈</span>
                最高正相关字段对
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table} className="data-table">
                  <thead>
                    <tr>
                      <th style={styles.th} className="data-name-col">字段 A</th>
                      <th style={styles.th}>字段 B</th>
                      <th style={styles.thNum}>相关系数</th>
                      <th style={styles.thNum}>有效样本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPositive.map((pair, i) => (
                      <CorrelationRow key={i} pair={pair} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 最高负相关 */}
          {topNegative.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>📉</span>
                最高负相关字段对
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table} className="data-table">
                  <thead>
                    <tr>
                      <th style={styles.th} className="data-name-col">字段 A</th>
                      <th style={styles.th}>字段 B</th>
                      <th style={styles.thNum}>相关系数</th>
                      <th style={styles.thNum}>有效样本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topNegative.map((pair, i) => (
                      <CorrelationRow key={i} pair={pair} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 低相关字段对 */}
          {weakCorrelations.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>🔗</span>
                低相关字段对（几乎无关）
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table} className="data-table">
                  <thead>
                    <tr>
                      <th style={styles.th} className="data-name-col">字段 A</th>
                      <th style={styles.th}>字段 B</th>
                      <th style={styles.thNum}>相关系数</th>
                      <th style={styles.thNum}>有效样本</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weakCorrelations.map((pair, i) => (
                      <CorrelationRow key={i} pair={pair} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 相关性矩阵 */}
          {numericalFields.length >= 2 && numericalFields.length <= 10 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                <span style={styles.sectionIcon}>📊</span>
                相关性矩阵
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table} className="data-table">
                  <thead>
                    <tr>
                      <th style={styles.th}>字段</th>
                      {numericalFields.map(field => (
                        <th key={field} style={{ ...styles.thNum, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2, fontSize: 12, maxWidth: 110, minWidth: 70 }} title={field}>
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {numericalFields.map(fieldA => (
                      <tr key={fieldA}>
                        <td style={styles.tdField} className="data-name-cell" title={fieldA}>
                          {fieldA}
                        </td>
                        {numericalFields.map(fieldB => {
                          const r = matrix[fieldA]?.[fieldB] ?? 0;
                          return (
                            <td key={fieldB} style={getMatrixCellStyle(r)}>
                              {fieldA === fieldB ? '1.00' : r.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={styles.matrixHint}>
                矩阵数值为 Pearson 相关系数，范围 -1 到 1。正值表示正相关，负值表示负相关，0 表示无线性相关。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CorrelationRow({ pair }: { pair: CorrelationPair }) {
  const strengthColor = getStrengthColor(pair.pearson);
  return (
    <tr>
      <td style={styles.tdField} className="data-name-cell" title={pair.fieldA}>
        {pair.fieldA}
      </td>
      <td style={styles.tdField} className="data-name-cell" title={pair.fieldB}>
        {pair.fieldB}
      </td>
      <td style={{ ...styles.tdNum, color: strengthColor, fontWeight: 600 }}>
        {pair.pearson.toFixed(3)}
      </td>
      <td style={styles.tdNum}>
        {pair.validCount}
      </td>
    </tr>
  );
}

function getStrengthColor(r: number): string {
  const absR = Math.abs(r);
  if (absR >= 0.7) return r > 0 ? '#059669' : '#dc2626';
  if (absR >= 0.3) return r > 0 ? '#0891b2' : '#ea580c';
  return '#64748b';
}

function getMatrixCellStyle(r: number): React.CSSProperties {
  const absR = Math.abs(r);
  let background = '#fff';
  let color = '#1e293b';

  if (absR >= 0.7) {
    background = r > 0 ? '#dcfce7' : '#fee2e2';
    color = r > 0 ? '#059669' : '#dc2626';
  } else if (absR >= 0.3) {
    background = r > 0 ? '#cffafe' : '#fed7aa';
    color = r > 0 ? '#0891b2' : '#ea580c';
  } else {
    background = '#f8fafc';
  }

  return {
    ...styles.tdNum,
    background,
    color,
    fontWeight: absR >= 0.7 ? 600 : 400,
    fontVariantNumeric: 'tabular-nums',
  };
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
    border: 'none',
    background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: 600,
    textAlign: 'left' as const,
    transition: 'all 0.2s',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  arrow: {
    display: 'inline-block',
    fontSize: '10px',
    transition: 'transform 0.2s ease',
  },
  headerBadge: {
    fontSize: '12px',
    opacity: 0.9,
    background: 'rgba(255,255,255,0.2)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  body: {
    padding: '16px',
  },
  disclaimer: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: '0 0 12px 0',
    lineHeight: 1.5,
  },
  insufficientHint: {
    fontSize: '13px',
    color: '#64748b',
    margin: '8px 0',
    padding: '12px',
    background: '#f8fafc',
    borderRadius: '8px',
    textAlign: 'center' as const,
  },
  warningBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '12px',
  },
  warningText: {
    fontSize: '13px',
    color: '#d97706',
    lineHeight: 1.5,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '10px',
    marginBottom: '16px',
  },
  summaryCard: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    border: '1px solid rgba(226, 232, 240, 0.6)',
    borderRadius: '10px',
    padding: '12px 8px',
    textAlign: 'center' as const,
    transition: 'all 0.2s',
  },
  summaryValue: {
    fontSize: '22px',
    fontWeight: 700,
    background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: '11px',
    color: '#64748b',
    marginTop: '4px',
    fontWeight: 500,
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  sectionIcon: {
    fontSize: '16px',
  },
  tableWrapper: {
    overflowX: 'auto' as const,
    WebkitOverflowScrolling: 'touch',
    borderRadius: '10px',
    border: '1px solid rgba(226, 232, 240, 0.6)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
    minWidth: '400px',
  },
  th: {
    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    padding: '10px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
  },
  thNum: {
    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    padding: '10px 12px',
    textAlign: 'right' as const,
    fontWeight: 600,
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
  },
  tdField: {
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    fontWeight: 500,
  },
  tdNum: {
    padding: '8px 12px',
    borderBottom: '1px solid #f1f5f9',
    textAlign: 'right' as const,
    color: '#475569',
    whiteSpace: 'nowrap' as const,
  },
  matrixHint: {
    fontSize: '11px',
    color: '#94a3b8',
    margin: '8px 0 0 0',
    lineHeight: 1.5,
  },
};
