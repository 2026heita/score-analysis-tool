/**
 * OutlierDetailsDialog - 异常值详情弹窗（v2 记录优先布局）
 *
 * 职责：在 Modal 中展示结构化异常检测结果。
 * 重新设计原则：
 * - 异常记录是主体，统计依据降级为可折叠区域
 * - 保留全部算法 / 数据结构 / 行号映射，不做二次检测
 * - 高/低异常数量仅由 records.direction 统计
 * - 上下文字段从 ResolvedFieldSchema 动态选取（identifier > time > dimension）
 * - 行号对应原始分析数据集
 *
 * 对外 props 契约与 v1 完全一致，GeneralDataOverview 与 OutlierPanel 均复用。
 */

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import type { OutlierDetectionResult, OutlierRecord, OutlierDetectionStats, OutlierDetectionBounds } from '../engine/outlierDetection';
import type { ResolvedFieldSchema } from '../field-schema';
import {
  fmtNum,
  fmtValue,
  looksLikePercent,
  directionLabel,
  friendlyReason,
  selectContextColumns,
  outlierTotalPages,
  paginateRecords,
  buildExplain,
} from '../utils/outlierUx';

// ============================================================
// 类型
// ============================================================

interface OutlierDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: OutlierDetectionResult;
  /** 异常字段名 */
  field: string;
  /** 完整分析数据集行（供上下文和查看完整记录） */
  contextRows: Record<string, string>[];
  /** 当前筛选后的记录数（用于顶部提示） */
  filteredRowCount: number;
  /** 字段模式定义（用于动态选择上下文字段） */
  schemas?: ResolvedFieldSchema[];
  /**
   * 展示用真实行号（1 基）。下标与 result.records[].rowIndex 对齐。
   * 缺省回退为 record.rowIndex + 1。
   */
  displayRowNumbers?: number[];
}

// ============================================================
// 简单范围条（可选展示，纯 CSS，无图表库）
// ============================================================

function RangeBar({
  stats,
  bounds,
  outlierDots,
  isPercent,
}: {
  stats: OutlierDetectionStats;
  bounds: OutlierDetectionBounds;
  outlierDots: number[];
  isPercent: boolean;
}) {
  const { min, max } = stats;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  const p = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const markers: Array<{ v: number; label: string }> = [
    { v: min, label: '最小' },
    { v: stats.q1, label: 'Q1' },
    { v: stats.median, label: '中位数' },
    { v: stats.q3, label: 'Q3' },
    { v: max, label: '最大' },
  ];
  const bandStart = p(bounds.lower);
  const bandEnd = p(bounds.upper);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 6, background: '#e5e7eb', borderRadius: 4 }}>
        {/* 正常范围音色带 */}
        <div
          style={{
            position: 'absolute',
            left: `${bandStart}%`,
            width: `${Math.max(0, bandEnd - bandStart)}%`,
            height: '100%',
            background: '#fbbf24',
            borderRadius: 4,
            opacity: 0.7,
          }}
        />
        {/* 阈值线 */}
        {[{ p: bandStart, c: '#d97706' }, { p: bandEnd, c: '#d97706' }].map((m, i) => (
          <div
            key={`b-${i}`}
            style={{
              position: 'absolute',
              left: `${m.p}%`,
              top: -2,
              width: 2,
              height: 10,
              background: m.c,
              transform: 'translateX(-1px)',
            }}
          />
        ))}
        {/* 异常点 */}
        {outlierDots.map((v, i) => (
          <div
            key={`o-${i}`}
            style={{
              position: 'absolute',
              left: `${p(v)}%`,
              top: -3,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#dc2626',
              border: '1px solid #fff',
              transform: 'translateX(-6px)',
            }}
            title={`异常 ${fmtNum(v)}${isPercent ? '%' : ''}`}
          />
        ))}
      </div>
      {/* 刻度标签 */}
      <div style={{ position: 'relative', height: 16, fontSize: 9, color: '#9ca3af' }}>
        {markers.map((m, i) => (
          <div
            key={`m-${i}`}
            style={{
              position: 'absolute',
              left: `${p(m.v)}%`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap' as const,
              textAlign: 'center',
            }}
          >
            {m.label}
          </div>
        ))}
      </div>
      {outlierDots.length > 0 && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
          红点：{outlierDots.length} 个统计异常候选
        </div>
      )}
    </div>
  );
}

// ============================================================
// 移动端检测
// ============================================================

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

// ============================================================
// 组件
// ============================================================

export default function OutlierDetailsDialog({
  open,
  onOpenChange,
  result,
  field,
  contextRows,
  filteredRowCount,
  schemas,
  displayRowNumbers,
}: OutlierDetailsDialogProps) {
  const [page, setPage] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const isMobile = useIsMobile();

  // 重置状态
  useEffect(() => {
    if (open) {
      setPage(0);
      setExpandedIdx(null);
      setStatsOpen(false);
    }
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  // 上下文列
  const contextColumns = useMemo(() => {
    const fallback = contextRows.length > 0 && contextRows[0] ? Object.keys(contextRows[0]) : [];
    return selectContextColumns(schemas, field, fallback);
  }, [schemas, field, contextRows]);

  const isPercent = looksLikePercent(field);

  const explain = useMemo(() => buildExplain(result, field), [result, field]);

  const displayRowOf = (record: OutlierRecord): number =>
    displayRowNumbers?.[record.rowIndex] ?? (record.rowIndex + 1);

  const totalPages = outlierTotalPages(result.records.length);
  const pageRecords = useMemo(
    () => paginateRecords(result.records, page),
    [result.records, page]
  );

  if (!open) return null;

  const hasRecords = result.records.length > 0;
  const hasStats = result.stats !== undefined;
  const hasBounds = result.bounds !== undefined;
  const outlierDots = result.records.map(r => r.value);

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div
        style={isMobile ? styles.mobileContainer : styles.container}
        onClick={e => e.stopPropagation()}
      >
        {/* ===== Header（sticky） ===== */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.title}>
              {field}
              <span style={styles.titleBadge}>异常值解析</span>
            </div>
            <div style={styles.subtitle}>
              基于当前筛选后的 {filteredRowCount} 条有效记录 · IQR 四分位距检测
            </div>
          </div>
          <button
            style={styles.closeBtn}
            onClick={handleClose}
            aria-label="关闭"
            title="关闭 (Esc)"
          >
            ×
          </button>
        </div>

        {/* ===== 第一屏：为什么异常（自然语言） ===== */}
        {hasRecords && hasStats && result.stats && (
          <div style={styles.explain}>
            <div style={styles.explainLine}>
              「{field}」当前使用 {explain.method} 方法进行统计异常识别。
            </div>
            {explain.rangeText && (
              <div style={styles.explainLine}>
                正常统计范围：<strong>{explain.rangeText}</strong>
              </div>
            )}
            <div style={styles.explainLine}>
              {explain.countsLine}
              {explain.highCount > 0 && (
                <span style={{ ...styles.directionBadge, ...styles.highBadge, marginLeft: 8 }}>
                  ↑ 偏高 {explain.highCount}
                </span>
              )}
              {explain.lowCount > 0 && (
                <span style={{ ...styles.directionBadge, ...styles.lowBadge, marginLeft: 8 }}>
                  ↓ 偏低 {explain.lowCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ===== 滚动主体 ===== */}
        <div style={styles.body}>
          {!hasRecords ? (
            <div style={styles.emptyState}>
              当前没有可展示的统计异常候选。
            </div>
          ) : (
            <>
              {/* 异常记录（主体，最先展示） */}
              {!isMobile ? (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>行号</th>
                        {contextColumns.map(col => (
                          <th key={col} style={styles.th} title={col}>{col}</th>
                        ))}
                        <th style={styles.thValue}>{field}</th>
                        <th style={styles.th}>判断</th>
                        <th style={styles.thReason}>原因</th>
                        <th style={styles.th}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRecords.map((record, idx) => {
                        const row = contextRows[record.rowIndex];
                        const isExpanded = expandedIdx === idx;
                        const displayRow = displayRowOf(record);
                        const reason = friendlyReason(record, hasBounds ? result.bounds : undefined, field);
                        return (
                          <Fragment key={`${record.rowIndex}-${idx}`}>
                            <tr style={isExpanded ? styles.trActive : styles.tr}>
                              <td style={styles.tdRowNum}>{displayRow}</td>
                              {contextColumns.map(col => (
                                <td key={col} style={styles.td} title={row?.[col] ?? '—'}>
                                  {row?.[col] ?? '—'}
                                </td>
                              ))}
                              <td style={styles.tdValue}>
                                {fmtValue(record.value, field)}
                              </td>
                              <td style={styles.td}>
                                <span
                                  style={{
                                    ...styles.directionBadge,
                                    background: record.direction === 'high' ? '#fffbeb' : '#f1f5f9',
                                    color: record.direction === 'high' ? '#d97706' : '#64748b',
                                  }}
                                >
                                  {directionLabel(record.direction)}
                                </span>
                              </td>
                              <td style={styles.tdReason}>{reason}</td>
                              <td style={styles.tdAction}>
                                <button
                                  type="button"
                                  style={styles.viewRowBtn}
                                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                                >
                                  {isExpanded ? '收起' : '查看原记录'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && row && (
                              <tr>
                                <td colSpan={5 + contextColumns.length} style={styles.expandedRow}>
                                  <div style={styles.expandedPanel}>
                                    <div style={styles.expandedHeading}>原始表格第 {displayRow} 行</div>
                                    <div style={styles.expandedGrid}>
                                      {Object.entries(row).map(([key, val]) => {
                                        const isCurrent = key === field;
                                        return (
                                          <div
                                            key={key}
                                            style={{
                                              ...styles.expandedField,
                                              ...(isCurrent ? styles.expandedFieldCurrent : {}),
                                            }}
                                          >
                                            <span style={styles.expandedLabel}>{key}</span>
                                            <span style={styles.expandedValue}>
                                              {isCurrent
                                                ? fmtValue(Number(val), field)
                                                : (val ?? '—')}
                                            </span>
                                            {isCurrent && (
                                              <span style={styles.expandedTag}>当前分析字段</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* 移动端：卡片 */
                <div style={styles.cardList}>
                  {pageRecords.map((record, idx) => {
                    const row = contextRows[record.rowIndex];
                    const isExpanded = expandedIdx === idx;
                    const displayRow = displayRowOf(record);
                    const reason = friendlyReason(record, hasBounds ? result.bounds : undefined, field);
                    return (
                      <div key={`${record.rowIndex}-${idx}`} style={styles.card}>
                        <div style={styles.cardHeader}>
                          <span style={styles.cardRowNum}>第 {displayRow} 行</span>
                          <span
                            style={{
                              ...styles.directionBadge,
                              background: record.direction === 'high' ? '#fffbeb' : '#f1f5f9',
                              color: record.direction === 'high' ? '#d97706' : '#64748b',
                            }}
                          >
                            {directionLabel(record.direction)}
                          </span>
                        </div>
                        {contextColumns.map(col => (
                          <div key={col} style={styles.cardField}>
                            <span style={styles.cardLabel}>{col}</span>
                            <span style={styles.cardVal}>{row?.[col] ?? '—'}</span>
                          </div>
                        ))}
                        <div style={styles.cardField}>
                          <span style={styles.cardLabel}>{field}</span>
                          <span style={styles.cardNum}>
                            {fmtValue(record.value, field)}
                          </span>
                        </div>
                        <div style={styles.cardField}>
                          <span style={styles.cardLabel}>原因</span>
                          <span style={styles.cardVal}>{reason}</span>
                        </div>
                        <button
                          type="button"
                          style={styles.viewRowBtn}
                          onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        >
                          {isExpanded ? '收起' : '查看原记录'}
                        </button>
                        {isExpanded && row && (
                          <div style={styles.expandedPanelMobile}>
                            <div style={styles.expandedHeading}>原始表格第 {displayRow} 行</div>
                            {Object.entries(row).map(([key, val]) => {
                              const isCurrent = key === field;
                              return (
                                <div
                                  key={key}
                                  style={{
                                    ...styles.expandedField,
                                    ...(isCurrent ? styles.expandedFieldCurrent : {}),
                                  }}
                                >
                                  <span style={styles.expandedLabel}>{key}</span>
                                  <span style={styles.expandedValue}>
                                    {isCurrent
                                      ? fmtValue(Number(val), field)
                                      : (val ?? '—')}
                                    {isCurrent && <span style={styles.expandedTag}>当前分析字段</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 分页控件：<=20 条不显示 */}
              {totalPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    style={{ ...styles.pageBtn, opacity: page === 0 ? 0.5 : 1 }}
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    上一页
                  </button>
                  <span style={styles.pageText}>{page + 1} / {totalPages}</span>
                  <button
                    style={{ ...styles.pageBtn, opacity: page >= totalPages - 1 ? 0.5 : 1 }}
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  >
                    下一页
                  </button>
                </div>
              )}

              {/* ===== 统计判断依据（可折叠） ===== */}
              {hasStats && (
                <div style={styles.statsSection}>
                  <button style={styles.statsToggle} onClick={() => setStatsOpen(o => !o)}>
                    <span>查看统计判断依据</span>
                    <span style={{ transform: statsOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                      ▾
                    </span>
                  </button>
                  {statsOpen && (
                    <div style={styles.statsBody}>
                      <div style={styles.statsGrid}>
                        <div style={styles.statCell}>
                          <span style={styles.statLabel}>检测方法</span>
                          <span style={styles.statValue}>IQR（四分位距）</span>
                        </div>
                        <div style={styles.statCell}>
                          <span style={styles.statLabel}>Q1</span>
                          <span style={styles.statValue}>{fmtNum(result.stats?.q1)}</span>
                        </div>
                        <div style={styles.statCell}>
                          <span style={styles.statLabel}>中位数</span>
                          <span style={styles.statValue}>{fmtNum(result.stats?.median)}</span>
                        </div>
                        <div style={styles.statCell}>
                          <span style={styles.statLabel}>Q3</span>
                          <span style={styles.statValue}>{fmtNum(result.stats?.q3)}</span>
                        </div>
                        <div style={styles.statCell}>
                          <span style={styles.statLabel}>IQR</span>
                          <span style={styles.statValue}>{fmtNum(result.stats?.iqr)}</span>
                        </div>
                        {hasBounds && result.bounds && (
                          <div style={styles.statCell}>
                            <span style={styles.statLabel}>正常范围</span>
                            <span style={styles.statValue}>
                              {fmtNum(result.bounds.lower)} ~ {fmtNum(result.bounds.upper)}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* 简单范围条 */}
                      {hasBounds && result.bounds && result.stats && (
                        <RangeBar
                          stats={result.stats}
                          bounds={result.bounds}
                          outlierDots={outlierDots}
                          isPercent={isPercent}
                        />
                      )}
                      <div style={styles.statsNote}>
                        低于统计下界或高于统计上界的记录会被标记为统计异常候选。
                        异常候选不代表数据错误，请结合业务背景判断，支持人工排除或恢复。
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 样式
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    background: '#fff',
    borderRadius: 14,
    width: '100%',
    maxWidth: 1020,
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  },
  mobileContainer: {
    background: '#fff',
    borderRadius: 14,
    width: '100%',
    maxWidth: '100%',
    maxHeight: '94vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
    margin: 8,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
    position: 'sticky' as const,
    top: 0,
    background: '#fff',
    zIndex: 2,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1f2937',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  titleBadge: {
    fontSize: 12,
    fontWeight: 600,
    background: '#fef3c7',
    color: '#d97706',
    borderRadius: 10,
    padding: '2px 10px',
    whiteSpace: 'nowrap' as const,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    lineHeight: 1.5,
  },
  closeBtn: {
    fontSize: 22,
    color: '#9ca3af',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 8px',
    lineHeight: 1,
    flexShrink: 0,
    marginLeft: 12,
    borderRadius: 6,
  },
  directionBadge: {
    fontSize: 12,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 999,
    display: 'inline-block',
  },
  highBadge: { background: '#fef3c7', color: '#d97706' },
  lowBadge: { background: '#f1f5f9', color: '#64748b' },
  explain: {
    padding: '12px 20px',
    background: '#fffbeb',
    borderBottom: '1px solid #fde68a',
  },
  explainLine: {
    fontSize: 13,
    lineHeight: 1.7,
    color: '#78350f',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '14px 20px 20px',
  },
  emptyState: {
    padding: '40px 0',
    textAlign: 'center' as const,
    color: '#9ca3af',
    fontSize: 14,
  },
  tableWrapper: {
    overflowX: 'auto' as const,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    minWidth: 560,
  },
  th: {
    padding: '9px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#475569',
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  thValue: {
    padding: '9px 12px',
    textAlign: 'right' as const,
    fontWeight: 600,
    color: '#1f2937',
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  thReason: {
    padding: '9px 12px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#475569',
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
  },
  tr: { borderBottom: '1px solid #f1f5f9' },
  trActive: { borderBottom: '1px solid #fde68a', background: '#fffbeb' },
  td: {
    padding: '8px 12px',
    color: '#374151',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdRowNum: {
    padding: '8px 12px',
    color: '#6b7280',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  tdValue: {
    padding: '8px 12px',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'monospace',
    color: '#0f172a',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
  },
  tdReason: {
    padding: '8px 12px',
    fontSize: 12,
    color: '#6b7280',
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdAction: { padding: '6px 12px', whiteSpace: 'nowrap' as const },
  viewRowBtn: {
    fontSize: 12,
    padding: '4px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  },
  expandedRow: { padding: 0, borderBottom: '1px solid #e5e7eb' },
  expandedPanel: { padding: '12px 16px', background: '#f9fafb' },
  expandedHeading: {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 10,
  },
  expandedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 8,
  },
  expandedField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid #f1f5f9',
    background: '#fff',
  },
  expandedFieldCurrent: {
    borderColor: '#fbbf24',
    background: '#fffbeb',
  },
  expandedLabel: { fontSize: 11, color: '#6b7280', fontWeight: 500 },
  expandedValue: { fontSize: 13, color: '#1f2937', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  expandedTag: {
    fontSize: 10,
    color: '#d97706',
    background: '#fef3c7',
    padding: '0 6px',
    borderRadius: 4,
    fontWeight: 600,
  },
  cardList: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 12,
    background: '#fff',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardRowNum: { fontSize: 13, fontWeight: 600, color: '#334155' },
  cardField: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 0',
    borderBottom: '1px solid #f3f4f6',
    gap: 12,
  },
  cardLabel: { fontSize: 12, color: '#6b7280', flexShrink: 0 },
  cardVal: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'right' as const,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardNum: {
    fontSize: 16,
    fontWeight: 800,
    color: '#0f172a',
    fontFamily: 'monospace',
    textAlign: 'right' as const,
    flex: 1,
  },
  expandedPanelMobile: { marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e5e7eb' },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: '6px 0',
  },
  pageBtn: {
    fontSize: 12,
    padding: '5px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  pageText: { fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  statsSection: {
    marginTop: 16,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 12,
  },
  statsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: '#475569',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    width: '100%',
    justifyContent: 'space-between',
  },
  statsBody: {
    marginTop: 10,
    background: '#f9fafb',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    padding: 14,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 8,
  },
  statCell: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '8px 10px',
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  statLabel: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: 700, color: '#1f2937', fontFamily: 'monospace' },
  statsNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 1.6,
  },
};