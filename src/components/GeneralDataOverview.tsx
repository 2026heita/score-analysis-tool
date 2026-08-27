/**
 * 通用数据概览面板
 * 使用 general engine 对任意表格提供基础数据概况
 * 默认折叠，不影响现有表格数据分析功能
 */

import { useState, useMemo } from 'react';
import { detectDatasetSchema } from '../engine/schemaDetector';
import { standardizeDataset } from '../engine/featureStandardizer';
import { analyzeNumericalFeature, detectOutliers } from '../engine/univariateAnalyzer';
import type { FeatureSchema, FeatureType, FeatureStats } from '../engine/types';

interface GeneralDataOverviewProps {
  headers: string[];
  rows: Record<string, string>[];
}

interface OverviewSummary {
  rowCount: number;
  columnCount: number;
  typeCounts: Record<FeatureType, number>;
  highMissingFields: string[];
  highOutlierFields: Array<{ field: string; count: number }>;
  numericalStats: Array<{
    fieldName: string;
    stats: FeatureStats;
    outlierCount: number;
  }>;
  warnings: string[];
}

function computeOverview(headers: string[], rows: Record<string, string>[]): OverviewSummary {
  const totalRows = rows.length;
  // Stage 0A-2: 不再截断，数据已在入口统一抽样

  // 1. Schema 检测
  const features: FeatureSchema[] = detectDatasetSchema(headers, rows);

  // 2. 统计各类型数量
  const typeCounts: Record<FeatureType, number> = {
    numerical: 0,
    categorical: 0,
    temporal: 0,
    text: 0,
    identifier: 0,
    invalid: 0,
  };
  for (const f of features) {
    typeCounts[f.featureType]++;
  }

  // 3. 标准化数据
  const vectors = standardizeDataset(rows, features);

  // 4. 数值字段统计 + 异常值
  const numericalStats: OverviewSummary['numericalStats'] = [];
  const highOutlierFields: OverviewSummary['highOutlierFields'] = [];

  for (const f of features) {
    if (f.featureType !== 'numerical') continue;
    const stats = analyzeNumericalFeature(vectors, f.fieldName);
    const outliers = detectOutliers(vectors, f.fieldName);
    numericalStats.push({
      fieldName: f.fieldName,
      stats,
      outlierCount: outliers.length,
    });
    if (outliers.length > 0) {
      highOutlierFields.push({ field: f.fieldName, count: outliers.length });
    }
  }

  // 5. 缺失值较多字段
  const highMissingFields: string[] = [];
  for (const f of features) {
    if (f.featureType === 'invalid') continue;
    const ns = numericalStats.find(n => n.fieldName === f.fieldName);
    let missingCount = 0;
    if (ns) {
      missingCount = ns.stats.missingCount;
    } else {
      // 对非数值字段，手动计算缺失
      let empty = 0;
      for (const row of rows) {
        const v = row[f.fieldName];
        if (v === null || v === undefined || String(v).trim() === '') empty++;
      }
      missingCount = empty;
    }
    if (missingCount > totalRows * 0.3) {
      highMissingFields.push(f.fieldName);
    }
  }

  // 6. 警告（Stage 0A-2: 移除旧的 5000 行截断警告，数据已在入口统一抽样）
  const warnings: string[] = [];

  return {
    rowCount: totalRows,
    columnCount: headers.length,
    typeCounts,
    highMissingFields,
    highOutlierFields,
    numericalStats,
    warnings,
  };
}

function formatNum(n: number | undefined): string {
  if (n === undefined || n === null) return '-';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export default function GeneralDataOverview({ headers, rows }: GeneralDataOverviewProps) {
  const [expanded, setExpanded] = useState(false);

  const overview = useMemo(() => {
    if (!headers.length || !rows.length) return null;
    return computeOverview(headers, rows);
  }, [headers, rows]);

  if (!overview) return null;

  const { typeCounts } = overview;

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
          通用数据概览
        </span>
        <span style={styles.headerBadge}>
          {overview.rowCount} 行 × {overview.columnCount} 列
        </span>
      </button>

      {expanded && (
        <div style={styles.body}>
          <p style={styles.disclaimer}>
            以下为通用数据概览，仅展示客观统计信息，不代表任何官方结论。
          </p>

          {overview.warnings.length > 0 && (
            <div style={styles.warningBox}>
              {overview.warnings.map((w, i) => (
                <div key={i} style={styles.warningText}>{w}</div>
              ))}
            </div>
          )}

          {/* 数据概况卡片 */}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{overview.rowCount}</div>
              <div style={styles.summaryLabel}>数据行数</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{overview.columnCount}</div>
              <div style={styles.summaryLabel}>字段总数</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.numerical}</div>
              <div style={styles.summaryLabel}>数值字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.categorical}</div>
              <div style={styles.summaryLabel}>类别字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.temporal}</div>
              <div style={styles.summaryLabel}>时间字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.text}</div>
              <div style={styles.summaryLabel}>文本字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.identifier}</div>
              <div style={styles.summaryLabel}>ID 字段</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{typeCounts.invalid}</div>
              <div style={styles.summaryLabel}>无效字段</div>
            </div>
          </div>

          {/* 缺失值 / 异常值提示 */}
          {(overview.highMissingFields.length > 0 || overview.highOutlierFields.length > 0) && (
            <div style={styles.alertSection}>
              {overview.highMissingFields.length > 0 && (
                <div style={styles.alertItem}>
                  <span style={styles.alertLabel}>缺失值较多：</span>
                  {overview.highMissingFields.join('、')}
                </div>
              )}
              {overview.highOutlierFields.length > 0 && (
                <div style={styles.alertItem}>
                  <span style={styles.alertLabel}>异常值较多：</span>
                  {overview.highOutlierFields.map(f => `${f.field}(${f.count}个)`).join('、')}
                </div>
              )}
            </div>
          )}

          {/* 数值字段统计表 */}
          {overview.numericalStats.length > 0 && (
            <div style={styles.tableSection}>
              <div style={styles.tableTitle}>数值字段基础统计</div>
              <div style={styles.tableWrapper}>
                <table style={styles.table} className="data-table">
                  <thead>
                    <tr>
                      <th style={styles.th} className="data-name-col">字段名</th>
                      <th style={styles.thNum}>有效值</th>
                      <th style={styles.thNum}>缺失值</th>
                      <th style={styles.thNum}>平均值</th>
                      <th style={styles.thNum}>中位数</th>
                      <th style={styles.thNum}>最小值</th>
                      <th style={styles.thNum}>最大值</th>
                      <th style={styles.thNum}>标准差</th>
                      <th style={styles.thNum}>异常值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.numericalStats.map(ns => (
                      <tr key={ns.fieldName}>
                        <td style={styles.tdName} className="data-name-cell" title={ns.fieldName}>{ns.fieldName}</td>
                        <td style={styles.tdNum}>{ns.stats.validCount}</td>
                        <td style={styles.tdNum}>{ns.stats.missingCount}</td>
                        <td style={styles.tdNum}>{formatNum(ns.stats.mean)}</td>
                        <td style={styles.tdNum}>{formatNum(ns.stats.median)}</td>
                        <td style={styles.tdNum}>{formatNum(ns.stats.min)}</td>
                        <td style={styles.tdNum}>{formatNum(ns.stats.max)}</td>
                        <td style={styles.tdNum}>{formatNum(ns.stats.std)}</td>
                        <td style={{ ...styles.tdNum, color: ns.outlierCount > 0 ? '#e67700' : undefined }}>
                          {ns.outlierCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
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
    border: 'none',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
  alertSection: {
    marginBottom: '16px',
  },
  alertItem: {
    fontSize: '13px',
    color: '#475569',
    padding: '8px 12px',
    lineHeight: 1.5,
    background: '#fffbeb',
    borderRadius: '8px',
    marginBottom: '8px',
    borderLeft: '3px solid #f59e0b',
  },
  alertLabel: {
    fontWeight: 600,
    color: '#d97706',
  },
  tableSection: {
    marginTop: '8px',
  },
  tableTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
    marginBottom: '10px',
    paddingLeft: '12px',
    position: 'relative',
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
    minWidth: '600px',
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
  tdName: {
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
    fontVariantNumeric: 'tabular-nums',
  },
};
