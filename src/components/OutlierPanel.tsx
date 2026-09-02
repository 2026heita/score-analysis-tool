/**
 * OutlierPanel - 异常值展示与操作面板
 * 
 * 职责：只做展示 + 操作，不做计算
 * 所有分析逻辑统一来自 engine/univariateAnalyzer
 * 
 * 异常值语义（v2 通用化）：
 * - 异常值是"统计异常候选"，不是"错误数据"；
 * - 异常检测跟随"当前分析数据集"（筛选/均值后），但每行的 rowIndex 映射回真实分析行；
 * - 面板尊重检测状态：
 *     insufficient_data       有效样本过少，不判异常
 *     insufficient_variation  变化过小，不判异常
 *     unsupported             该字段不适合连续型异常检测（离散/标识）
 *     detected                显示各异常候选及判定依据
 * - 展示 Q1/Median/Q3/IQR/下界/上界，让用户自己判断是否业务异常。
 */

import { useState, useMemo } from 'react';
import {
  detectOutliersFromValues,
  classifyOutlierStrategy,
  ERROR_VALUE_THRESHOLD,
  type OutlierStrategy,
  type OutlierClass,
} from '../engine/univariateAnalyzer';
import { detectFieldOutliers } from '../engine/outlierDetection';
import type { OutlierStatus } from '../engine/outlierDetection';
import OutlierDetailsDialog from './OutlierDetailsDialog';
import type { ResolvedFieldSchema } from '../field-schema';

/** 异常值条目 */
export interface OutlierEntry {
  /** 真实行下标（指向分析数据集 analysisRows） */
  rowIndex: number;
  value: number;
  type: OutlierClass;
  severity: number;
  excluded: boolean;
  strategy: OutlierStrategy;
  direction: 'low' | 'high';
  reason: string;
}

interface OutlierPanelProps {
  selectedField: string;
  /** 检测用完整数值（含未排除候选），由上游提供 */
  values: number[];
  /** 与 values 一一对应的真实行下标 */
  rowIndices: number[];
  /** 当前已排除的真实行下标（受控） */
  excludedRowIndices: ReadonlySet<number>;
  onExcludeChange?: (excludedRowIndices: Set<number>) => void;
  /** 当前分析数据集总行数（用于提示"基于当前筛选后的 N 条记录"） */
  filteredRowCount?: number;
  /** 行上下文（与分析行一一对应），用于展示业务记录 */
  contextRows?: Record<string, string>[];
  /** 字段模式定义（用于详情弹窗动态选择上下文字段） */
  schemas?: ResolvedFieldSchema[];
}

/** 展示用四舍五入 */
function fmt(n: number | undefined, digits = 3): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  const scaled = n * 10 ** digits;
  if (!Number.isFinite(scaled)) return String(n);
  const r = Math.round(scaled) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : String(r);
}

const STATUS_TEXT: Record<OutlierStatus, string> = {
  detected: '',
  none: '未产生异常候选',
  insufficient_data: '有效样本过少，未执行异常值判断。',
  insufficient_variation: '数据变化过小，无法可靠判断异常值。',
  unsupported: '该字段不是连续指标（标识/离散/低基数等），不做连续型异常检测。',
};

export default function OutlierPanel({
  selectedField,
  values,
  rowIndices,
  excludedRowIndices,
  onExcludeChange,
  filteredRowCount,
  contextRows,
  schemas,
}: OutlierPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // 结构化检测结果（带误判防护）
  const result = useMemo(
    () => detectFieldOutliers(values, { field: selectedField, minSampleSize: 8 }),
    [values, selectedField]
  );

  // 详情弹窗行上下文与展示行号：将 values 下标映射到真实分析行
  const dialogContextRows = useMemo(() => {
    if (!contextRows) return null;
    return rowIndices.map(realRow => contextRows[realRow] ?? null);
  }, [contextRows, rowIndices]);
  const dialogRowNumbers = useMemo(
    () => rowIndices.map(realRow => realRow + 1),
    [rowIndices]
  );

  // 从 results.records（value 下标）映射到真实行下标
  const realRowOf = (valueIdx: number): number | undefined =>
    rowIndices[valueIdx] !== undefined ? rowIndices[valueIdx] : undefined;

  const entries = useMemo((): OutlierEntry[] => {
    const rawOutliers = detectOutliersFromValues(values);
    const byValueIdx = new Map<number, { direction: 'low' | 'high'; reason: string }>();
    for (const r of result.records) {
      byValueIdx.set(r.rowIndex, { direction: r.direction, reason: r.reason });
    }
    return rawOutliers.map(o => {
      const { type, strategy } = classifyOutlierStrategy(o.value, o.zScore);
      const realRow = realRowOf(o.rowIndex);
      const detail = byValueIdx.get(o.rowIndex);
      return {
        rowIndex: realRow ?? o.rowIndex,
        value: o.value,
        type,
        severity: o.zScore,
        excluded: strategy === 'auto-exclude' || (realRow !== undefined && excludedRowIndices.has(realRow)),
        strategy,
        direction: detail?.direction ?? (o.value >= 0 ? 'high' : 'low'),
        reason: detail?.reason ?? classifyOutlierStrategy(o.value, o.zScore).type,
      };
    });
  }, [values, result, rowIndices, excludedRowIndices]);

  // 选取上下文展示列（不含当前指标字段），作为行上下文
  const contextColumns = useMemo((): string[] => {
    if (!contextRows || contextRows.length === 0) return [];
    const sample = contextRows[0];
    if (!sample) return [];
    const keys = Object.keys(sample).filter(k => k !== selectedField);
    if (keys.length === 0) return [];
    // 偏好"非纯数值"列（维度/标识/时间文本）；若都是数值，取前 2 列
    const numericCount = (col: string) => {
      let n = 0;
      const total = Math.min(contextRows.length, 20);
      for (let i = 0; i < total; i++) {
        const v = contextRows[i]?.[col];
        if (v !== undefined && v !== '' && Number.isFinite(Number(v))) n++;
      }
      return n / (total || 1);
    };
    const best = keys
      .filter(k => numericCount(k) < 0.9)
      .concat(keys.filter(k => numericCount(k) >= 0.9))
      .slice(0, 2);
    return best;
  }, [contextRows, selectedField]);

  const handleToggleExclude = (realRow: number) => {
    const next = new Set(excludedRowIndices);
    if (next.has(realRow)) {
      next.delete(realRow);
    } else {
      next.add(realRow);
    }
    onExcludeChange?.(next);
  };

  const handleExcludeAll = () => {
    const all = new Set(entries.map(e => e.rowIndex));
    onExcludeChange?.(all);
  };

  const handleResetAll = () => {
    onExcludeChange?.(new Set());
  };

  const hasRecords = entries.length > 0;
  const hasStats = result.stats !== undefined;
  const hasBounds = result.bounds !== undefined;
  const hasBadgeCount = result.status === 'detected' && hasRecords;
  const baseLine = filteredRowCount !== undefined
    ? `基于当前筛选后的 ${filteredRowCount} 条记录`
    : `基于当前 ${values.length} 条数值记录`;

  // 清理干净（none）且无记录时，不展示面板
  if (result.status === 'none' && !hasRecords) return null;

  const autoExcluded = entries.filter(e => e.strategy === 'auto-exclude');
  const excludedValueIndices = new Set<number>();
  rowIndices.forEach((realRow, valueIdx) => {
    if (excludedRowIndices.has(realRow)) excludedValueIndices.add(valueIdx);
  });
  const excludedCount = excludedValueIndices.size;
  const remaining = values.filter((_, i) => !excludedValueIndices.has(i));
  const hasExclusion = excludedCount > 0 && remaining.length > 0 && remaining.length !== values.length;
  const oldMean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const newMean = remaining.length ? remaining.reduce((a, b) => a + b, 0) / remaining.length : oldMean;
  const meanChange = hasExclusion
    ? `${(newMean - oldMean) >= 0 ? '+' : ''}${(newMean - oldMean).toFixed(2)}`
    : '无变化';

  const showDetailBlock = hasStats;

  return (
      <>
      <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#fef3c7',
          borderBottom: '1px solid #fcd34d',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedField} — 异常值候选</span>
          {hasBadgeCount ? (
            <span style={{
              fontSize: 12,
              background: '#f59e0b',
              color: '#fff',
              borderRadius: 10,
              padding: '2px 8px',
            }}>
              {entries.length} 个
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#92400e' }}>
              {STATUS_TEXT[result.status]}
            </span>
          )}
          {autoExcluded.length > 0 && (
            <span style={{ fontSize: 12, color: '#dc2626' }}>
              {autoExcluded.length} 个已自动排除
            </span>
          )}
          {hasBadgeCount && (
            <button
              style={{
                fontSize: 12,
                padding: '3px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                background: '#fff',
                cursor: 'pointer',
                color: '#f59e0b',
                fontWeight: 500,
                whiteSpace: 'nowrap' as const,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(true);
              }}
            >
              查看详情
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {collapsed ? '展开 ▼' : '收起 ▲'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '10px 14px', maxHeight: 420, overflowY: 'auto' }}>
          {/* 方法说明 */}
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 1.6 }}>
            <div>当前使用 IQR（四分位距）方法识别统计异常候选。异常值是候选提示，不是错误数据判定。</div>
            <div style={{ color: '#9ca3af' }}>{baseLine}</div>
            {result.status === 'insufficient_data' && (
              <div style={{ color: '#92400e' }}>{STATUS_TEXT.insufficient_data}</div>
            )}
            {result.status === 'insufficient_variation' && (
              <div style={{ color: '#92400e' }}>{STATUS_TEXT.insufficient_variation}</div>
            )}
            {result.status === 'unsupported' && (
              <div style={{ color: '#92400e' }}>{STATUS_TEXT.unsupported}</div>
            )}
          </div>

          {/* 统计量与边界 */}
          {showDetailBlock && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
              gap: 6,
              marginBottom: 10,
              fontSize: 12,
            }}>
              <div style={statCell}>Q1 <b>{fmt(result.stats?.q1)}</b></div>
              <div style={statCell}>Median <b>{fmt(result.stats?.median)}</b></div>
              <div style={statCell}>Q3 <b>{fmt(result.stats?.q3)}</b></div>
              <div style={statCell}>IQR <b>{fmt(result.stats?.iqr)}</b></div>
              {hasBounds && result.status !== 'insufficient_variation' && (
                <>
                  <div style={statCell}>下界 <b>{fmt(result.bounds?.lower)}</b></div>
                  <div style={statCell}>上界 <b>{fmt(result.bounds?.upper)}</b></div>
                </>
              )}
            </div>
          )}

          {/* 策略说明 */}
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }}>
            <div>自动排除：数值 ≤ {ERROR_VALUE_THRESHOLD}（疑似错误值）</div>
            <div>标记异常：z-score &gt; 3（真实极端值，默认保留）</div>
            <div>普通离群：IQR 范围外，默认保留</div>
          </div>

          {/* 操作按钮 */}
          {hasRecords && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                }}
                onClick={handleExcludeAll}
              >
                全部排除
              </button>
              <button
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                }}
                onClick={handleResetAll}
              >
                全部恢复
              </button>
            </div>
          )}

          {/* 异常值列表 */}
          {hasRecords && (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>行号</th>
                  {contextColumns.map(col => (
                    <th key={col} style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>
                      {col}
                    </th>
                  ))}
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>值</th>
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>类型</th>
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>判断依据</th>
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>z-score</th>
                  <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isAutoExcluded = entry.strategy === 'auto-exclude';
                  const isManuallyExcluded = entry.excluded && !isAutoExcluded;
                  const rowStyle = isAutoExcluded
                    ? { background: '#fef2f2', textDecoration: 'line-through' as const }
                    : isManuallyExcluded
                      ? { background: '#fff7ed', textDecoration: 'line-through' as const }
                      : {};
                  const ctxRow = contextRows?.[entry.rowIndex];
                  return (
                    <tr key={`${entry.rowIndex}-${entry.value}`} style={{ ...rowStyle, borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '4px 6px', color: '#6b7280' }}>#{entry.rowIndex + 1}</td>
                      {contextColumns.map(col => (
                        <td key={col} style={{ padding: '4px 6px', color: '#374151', fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ctxRow?.[col] ?? '—'}
                        </td>
                      ))}
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontWeight: 500 }}>
                        {entry.value}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <span style={{
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background:
                            entry.type === 'extremeHigh' ? '#fee2e2' :
                            entry.type === 'extremeLow' ? '#dbeafe' : '#fef3c7',
                          color:
                            entry.type === 'extremeHigh' ? '#dc2626' :
                            entry.type === 'extremeLow' ? '#2563eb' : '#92400e',
                        }}>
                          {entry.direction === 'high' ? '高异常' : '低异常'}
                        </span>
                      </td>
                      <td style={{ padding: '4px 6px', fontSize: 12, color: '#6b7280' }}>
                        {entry.reason}
                      </td>
                      <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#6b7280' }}>
                        {Number.isFinite(entry.severity) ? entry.severity.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {entry.strategy !== 'auto-exclude' && (
                          <button
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              background: isManuallyExcluded ? '#fef3c7' : '#fff',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleToggleExclude(entry.rowIndex)}
                          >
                            {isManuallyExcluded ? '恢复' : '排除'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* 影响提示 */}
          {hasRecords && hasExclusion && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 4 }}>
              排除 {excludedCount} 个异常值后均值变化：{meanChange}
            </div>
          )}
        </div>
      )}
      </div>

      {/* 异常值详情弹窗（仅 detected 时展示入口） */}
      {hasBadgeCount && (
        <OutlierDetailsDialog
          open={showDetails}
          onOpenChange={setShowDetails}
          result={result}
          field={selectedField}
          contextRows={dialogContextRows ?? []}
          filteredRowCount={filteredRowCount ?? values.length}
          schemas={schemas}
          displayRowNumbers={dialogRowNumbers}
        />
      )}
      </>
  );
}

const statCell: React.CSSProperties = {
  background: '#f9fafb',
  borderRadius: 6,
  padding: '4px 8px',
  color: '#374151',
};