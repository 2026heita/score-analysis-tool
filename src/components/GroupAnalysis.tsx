/**
 * GroupAnalysis - 分组分析表格组件
 * 
 * 职责：展示按维度分组后的统计结果，支持排序和 Top N
 * 
 * 设计原则：
 * 1. 简单表格，不做复杂图表
 * 2. 复用 formatNumber 保持数字格式一致
 * 3. 不改变现有组件
 * 4. 支持点击表头排序
 * 5. 默认展示 Top 20
 */

import { useState, useMemo } from 'react';
import { formatNumber } from '../utils/stats';
import { sortGroupStats, topN, DEFAULT_TOP_N } from '../engine/groupByDimension';
import type { GroupStats, SortField, SortOrder } from '../engine/groupByDimension';

interface GroupAnalysisProps {
  /** 分组统计结果（已排序） */
  groupStats: GroupStats[];
  /** 指标字段名（用于表格标题） */
  metricField: string;
  /** 维度字段名（用于表格标题） */
  dimensionField: string;
}

/** 表头列定义 */
interface ColumnDef {
  key: SortField;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'count', label: '数量' },
  { key: 'mean', label: '均值' },
  { key: 'median', label: '中位数' },
  { key: 'min', label: '最小值' },
  { key: 'max', label: '最大值' },
  { key: 'q25', label: 'Q25' },
  { key: 'q75', label: 'Q75' },
];

export default function GroupAnalysis({ groupStats, metricField, dimensionField }: GroupAnalysisProps) {
  const [sortBy, setSortBy] = useState<SortField>('mean');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const sorted = useMemo(() => {
    return sortGroupStats(groupStats, sortBy, sortOrder);
  }, [groupStats, sortBy, sortOrder]);

  const totalGroups = sorted.length;
  const displayed = useMemo(() => topN(sorted, DEFAULT_TOP_N), [sorted]);
  const isTruncated = totalGroups > DEFAULT_TOP_N;

  if (groupStats.length === 0) {
    return null;
  }

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return <span style={styles.sortIconInactive}>⇅</span>;
    return sortOrder === 'asc'
      ? <span style={styles.sortIcon}>▲</span>
      : <span style={styles.sortIcon}>▼</span>;
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>
        分组分析：按【{dimensionField}】查看【{metricField}】
      </h3>

      {isTruncated && (
        <p style={styles.truncateHint}>
          共 {totalGroups} 组，仅显示前 {DEFAULT_TOP_N} 组（按 {sortBy === 'mean' ? '均值' : COLUMNS.find(c => c.key === sortBy)?.label} 排序）。
        </p>
      )}

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>{dimensionField}</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={{ ...styles.th, ...styles.thNumber, ...styles.thSortable }}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label} {renderSortIcon(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((gs, i) => (
              <tr key={gs.dimensionValue} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td style={styles.td}>{gs.dimensionValue}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{gs.count}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.mean)}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.median)}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.min)}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.max)}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.q25)}</td>
                <td style={{ ...styles.td, ...styles.tdNumber }}>{formatNumber(gs.q75)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  truncateHint: {
    margin: '0 0 10px',
    fontSize: '12px',
    color: '#92400e',
    background: '#fffbeb',
    padding: '6px 10px',
    borderRadius: '6px',
    borderLeft: '3px solid #f59e0b',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  th: {
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#475569',
    fontSize: '12px',
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
  },
  thNumber: {
    textAlign: 'right',
  },
  thSortable: {
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.15s',
  },
  sortIcon: {
    marginLeft: '2px',
    fontSize: '10px',
    color: '#6366f1',
  },
  sortIconInactive: {
    marginLeft: '2px',
    fontSize: '10px',
    color: '#cbd5e1',
  },
  td: {
    padding: '6px 10px',
    borderBottom: '1px solid #f1f5f9',
    color: '#1e293b',
  },
  tdNumber: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  trEven: {
    background: '#fff',
  },
  trOdd: {
    background: '#f8fafc',
  },
};