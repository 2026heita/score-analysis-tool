/**
 * OutlierPanel - 异常值展示与操作面板
 * 
 * 职责：只做展示 + 操作，不做计算
 * 所有分析逻辑统一来自 engine/univariateAnalyzer
 * 
 * 异常值策略（v1.4 统一规则）：
 * 1. 明显错误值（如 -999）→ 默认排除
 * 2. 真实极端值（高GMV / 高分）→ 默认保留 + 标记
 * 3. 不确定异常 → 默认保留
 */

import { useState, useMemo } from 'react';
import {
  detectOutliersFromValues,
  classifyOutlierStrategy,
  computeMeanChange,
  ERROR_VALUE_THRESHOLD,
  type OutlierStrategy,
  type OutlierClass,
} from '../engine/univariateAnalyzer';

/** 异常值条目 */
export interface OutlierEntry {
  rowIndex: number;
  value: number;
  type: OutlierClass;
  severity: number;
  excluded: boolean;
  strategy: OutlierStrategy;
}

interface OutlierPanelProps {
  selectedField: string;
  values: number[];
  onExcludeChange?: (excludedIndices: Set<number>) => void;
}

export default function OutlierPanel({
  selectedField,
  values,
  onExcludeChange,
}: OutlierPanelProps) {
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const entries = useMemo((): OutlierEntry[] => {
    if (values.length === 0) return [];
    const rawOutliers = detectOutliersFromValues(values);
    return rawOutliers.map(o => {
      const { type, strategy } = classifyOutlierStrategy(o.value, o.zScore);
      return {
        rowIndex: o.rowIndex,
        value: o.value,
        type,
        severity: o.zScore,
        excluded: strategy === 'auto-exclude' || excludedIndices.has(o.rowIndex),
        strategy,
      };
    });
  }, [values, excludedIndices]);

  const handleToggleExclude = (index: number) => {
    const next = new Set(excludedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExcludedIndices(next);
    onExcludeChange?.(next);
  };

  const handleExcludeAll = () => {
    const all = new Set(entries.map(e => e.rowIndex));
    setExcludedIndices(all);
    onExcludeChange?.(all);
  };

  const handleResetAll = () => {
    setExcludedIndices(new Set());
    onExcludeChange?.(new Set());
  };

  if (entries.length === 0) return null;

  const autoExcluded = entries.filter(e => e.strategy === 'auto-exclude');
  const meanChange = computeMeanChange(values, excludedIndices);

  return (
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
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedField} — 异常值检测</span>
          <span style={{
            fontSize: 12,
            background: '#f59e0b',
            color: '#fff',
            borderRadius: 10,
            padding: '2px 8px',
          }}>
            {entries.length} 个
          </span>
          {autoExcluded.length > 0 && (
            <span style={{ fontSize: 12, color: '#dc2626' }}>
              {autoExcluded.length} 个已自动排除
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {collapsed ? '展开 ▼' : '收起 ▲'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }}>
          {/* 策略说明 */}
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }}>
            <div>自动排除：数值 ≤ {ERROR_VALUE_THRESHOLD}（疑似错误值）</div>
            <div>标记异常：z-score &gt; 3（真实极端值，默认保留）</div>
            <div>普通离群：IQR 范围外，默认保留</div>
          </div>

          {/* 操作按钮 */}
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

          {/* 异常值列表 */}
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>行</th>
                <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>值</th>
                <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>类型</th>
                <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>z-score</th>
                <th style={{ padding: '4px 6px', color: '#6b7280', fontWeight: 500 }}>策略</th>
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

                return (
                  <tr key={entry.rowIndex} style={{ ...rowStyle, borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '4px 6px', color: '#6b7280' }}>#{entry.rowIndex + 1}</td>
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
                        {entry.type === 'extremeHigh' ? '极端高' :
                         entry.type === 'extremeLow' ? '极端低' : '离群'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 6px', fontFamily: 'monospace', color: '#6b7280' }}>
                      {entry.severity.toFixed(1)}
                    </td>
                    <td style={{ padding: '4px 6px', fontSize: 12 }}>
                      {entry.strategy === 'auto-exclude' ? (
                        <span style={{ color: '#dc2626' }}>自动排除</span>
                      ) : entry.strategy === 'mark' ? (
                        <span style={{ color: '#f59e0b' }}>标记</span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>保留</span>
                      )}
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

          {/* 影响提示 */}
          {entries.length > 0 && excludedIndices.size > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 4 }}>
              排除 {excludedIndices.size} 个异常值后均值变化：{meanChange}
            </div>
          )}
        </div>
      )}
    </div>
  );
}