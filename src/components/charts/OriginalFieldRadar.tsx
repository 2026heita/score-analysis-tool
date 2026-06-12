import { useState, useMemo, useCallback, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { calculateFieldPercentile } from '../../utils/chartData';
import { calculateQuantile } from '../../utils/stats';
import type { OriginalFieldRadarState } from '../../types';

interface FieldSelection {
  field: string;
  userValue: number;
}

interface OriginalFieldRadarProps {
  headers: string[];
  rows: Record<string, string>[];
  isNumericField: (header: string) => boolean;
  excludedKeywords?: string[];
  initialSelections?: FieldSelection[];
  initialViewMode?: 'bar' | 'radar';
  onStateChange?: (state: OriginalFieldRadarState) => void;
}

type ViewMode = 'bar' | 'radar';

const EXCLUDED_DEFAULT = ['名次', '排名', '序号', '编号'];

export default function OriginalFieldRadar({
  headers, rows, isNumericField, excludedKeywords,
  initialSelections, initialViewMode, onStateChange,
}: OriginalFieldRadarProps) {
  const [selections, setSelections] = useState<FieldSelection[]>(initialSelections ?? []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? 'bar');

  const excluded = excludedKeywords ?? EXCLUDED_DEFAULT;

  // 当 initialSelections 变化时（如恢复默认后）同步状态
  useEffect(() => {
    if (initialSelections !== undefined) setSelections(initialSelections);
  }, [initialSelections]);

  useEffect(() => {
    if (initialViewMode !== undefined) setViewMode(initialViewMode);
  }, [initialViewMode]);

  // 状态变化时通知父组件
  useEffect(() => {
    if (onStateChange) {
      onStateChange({ selections, viewMode });
    }
  }, [selections, viewMode, onStateChange]);

  const numericFields = useMemo(() => {
    return headers.filter(h => isNumericField(h) && !excluded.some(kw => h.includes(kw)));
  }, [headers, isNumericField, excluded]);

  const addField = useCallback(() => {
    const available = numericFields.filter(f => !selections.some(s => s.field === f));
    if (available.length > 0) {
      setSelections([...selections, { field: available[0], userValue: 0 }]);
    }
  }, [numericFields, selections]);

  const removeField = useCallback((index: number) => {
    setSelections(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback((index: number, key: keyof FieldSelection, value: number) => {
    setSelections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  }, []);

  // 固定字段顺序：成绩字段优先级顺序
  const FIXED_SUBJECT_ORDER = [
    '总分', '总分（不含加分）',
    '语文', '数学', '英语', '外语',
    '物理', '化学', '生物', '政治', '历史', '地理',
  ];

  // 计算各字段的百分位（不排序）
  const rawStats = useMemo(() => {
    return selections.map(s => {
      const values = rows
        .map(r => parseFloat(r[s.field]))
        .filter(v => Number.isFinite(v));

      if (values.length === 0) {
        return { field: s.field, userValue: s.userValue, percentile: 0, max: 0, min: 0, mean: 0, median: 0, count: 0 };
      }

      const max = Math.max(...values);
      const min = Math.min(...values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const median = calculateQuantile(values, 0.5);
      const percentile = calculateFieldPercentile(values, s.userValue);

      return { field: s.field, userValue: s.userValue, percentile, max, min, mean, median, count: values.length };
    });
  }, [selections, rows]);

  // 条形图和结论摘要：按百分位从高到低排序
  const sortedStats = useMemo(() => {
    return [...rawStats].sort((a, b) => b.percentile - a.percentile);
  }, [rawStats]);

  // 雷达图：使用稳定顺序（固定科目顺序 + 用户添加顺序）
  const radarStats = useMemo(() => {
    return [...rawStats].sort((a, b) => {
      const aIdx = FIXED_SUBJECT_ORDER.findIndex(kw => a.field.includes(kw));
      const bIdx = FIXED_SUBJECT_ORDER.findIndex(kw => b.field.includes(kw));
      // 都在固定顺序中
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      // 只有 a 在固定顺序中
      if (aIdx >= 0) return -1;
      // 只有 b 在固定顺序中
      if (bIdx >= 0) return 1;
      // 都不在固定顺序中，按用户添加顺序（selections 中的原始顺序）
      return selections.findIndex(s => s.field === a.field) - selections.findIndex(s => s.field === b.field);
    });
  }, [rawStats, selections]);

  const validStats = sortedStats.filter(s => s.userValue > 0);
  const validRadarStats = radarStats.filter(s => s.userValue > 0);

  // 条形图
  const barOption: EChartsOption | null = useMemo(() => {
    if (validStats.length === 0) return null;

    const reversed = [...validStats].reverse();
    const fields = reversed.map(s => s.field);
    const percentiles = reversed.map(s => s.percentile);

    return {
      title: {
        text: '原表字段相对位置分析',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const idx = reversed.length - 1 - params[0].dataIndex;
          const s = validStats[idx];
          return `字段：${s.field}<br/>你的输入值：${s.userValue}<br/>百分位：${s.percentile.toFixed(1)}%`;
        },
      },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '百分位 (%)',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        data: fields,
        axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: percentiles.map(v => ({
            value: v,
            itemStyle: {
              color: v >= 70 ? '#10b981' : v >= 40 ? '#3b82f6' : '#f59e0b',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          label: {
            show: true,
            position: 'right',
            formatter: (p: any) => `${p.value.toFixed(1)}%`,
            fontSize: 11,
          },
          barMaxWidth: 28,
        },
      ],
    } as EChartsOption;
  }, [validStats]);

  // 雷达图（可选视图）
  const radarOption: EChartsOption | null = useMemo(() => {
    if (validRadarStats.length < 2) return null;

    const indicator = validRadarStats.map(s => ({ name: s.field, max: 100 }));
    const data = validRadarStats.map(s => s.percentile);

    // 构造包含所有字段的完整 tooltip
    const allFieldInfo = validRadarStats
      .map(s => `${s.field}: ${s.userValue} → ${s.percentile.toFixed(1)}%`)
      .join('<br/>');

    return {
      title: {
        text: '原表字段相对位置分析',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const idx = params.dataIndex;
          const hovered = validRadarStats[idx];
          return `当前悬停字段：${hovered.field}<br/>你的输入值：${hovered.userValue}<br/>百分位：${hovered.percentile.toFixed(1)}%<br/><br/>该图同时包含其他字段，见下方字段列表。<br/>──────────────<br/>${allFieldInfo}`;
        },
      },
      radar: {
        indicator,
        radius: '65%',
        axisName: { fontSize: 11 },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: data,
              name: '你的百分位',
              areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
              lineStyle: { color: '#3b82f6', width: 2 },
              itemStyle: { color: '#3b82f6' },
            },
          ],
        },
      ],
    } as EChartsOption;
  }, [validRadarStats]);

  // 结论
  const conclusion = useMemo(() => {
    if (validStats.length < 2) return null;

    const advantages = validStats.slice(0, 2);
    const weaknesses = validStats.slice(-2).reverse();

    return { advantages, weaknesses };
  }, [validStats]);

  return (
    <div>
      {/* 字段选择列表 */}
      <div style={styles.fieldList}>
        {selections.map((sel, index) => (
          <div key={index} style={styles.fieldItem}>
            <div style={styles.fieldName}>{sel.field}</div>
            <div style={styles.fieldInputWrap}>
              <label style={styles.fieldInputLabel}>
                <span style={styles.fieldLabel}>你的数值</span>
                <input
                  type="number"
                  style={styles.fieldInput}
                  value={sel.userValue || ''}
                  onChange={e => updateField(index, 'userValue', parseFloat(e.target.value) || 0)}
                  placeholder="输入你的数值"
                />
              </label>
            </div>
            <button style={styles.removeButton} onClick={() => removeField(index)}>×</button>
          </div>
        ))}
        <button style={styles.addButton} onClick={addField}>
          + 添加字段
        </button>
      </div>

      {/* 说明提示 */}
      <div style={styles.noteBox}>
        该图表示你在原表各字段中的相对位置，不代表真实单科强弱。
      </div>
      <div style={styles.noteBox2}>
        雷达图每个轴代表一个字段，鼠标悬停时仅显示当前字段详情。
        <br />
        如果当前表格不是完整全量数据，字段百分位可能失真。
        <br />
        百分位口径：低于该值人数 / 有效数值数量 × 100%。
      </div>

      {/* 视图切换按钮 */}
      {validStats.length > 0 && (
        <div style={styles.toggleRow}>
          <button
            onClick={() => setViewMode('bar')}
            style={{ ...styles.toggleButton, ...(viewMode === 'bar' ? styles.toggleActive : {}) }}
          >
            条形图
          </button>
          <button
            onClick={() => setViewMode('radar')}
            disabled={validStats.length < 2}
            style={{
              ...styles.toggleButton,
              ...(viewMode === 'radar' ? styles.toggleActive : {}),
              ...(validStats.length < 2 ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
            }}
          >
            雷达图
          </button>
        </div>
      )}

      {/* 图表 */}
      {viewMode === 'bar' && barOption && (
        <ReactECharts option={barOption} style={{ height: Math.max(300, validStats.length * 40 + 80), width: '100%' }} />
      )}
      {viewMode === 'radar' && radarOption && (
        <ReactECharts option={radarOption} style={{ height: '400px', width: '100%' }} />
      )}

      {/* 当前参与分析字段列表 */}
      {validRadarStats.length > 0 && (
        <div style={styles.fieldTagContainer}>
          <span style={styles.fieldTagLabel}>当前参与分析字段：</span>
          {validRadarStats.map(s => (
            <span key={s.field} style={styles.fieldTag}>
              {s.field}（{s.percentile.toFixed(1)}%）
            </span>
          ))}
        </div>
      )}

      {/* 结论 */}
      {conclusion && (
        <div style={styles.conclusionBox}>
          <div style={styles.conclusionItem}>
            <span style={styles.conclusionLabel}>相对优势字段：</span>
            <span style={{ ...styles.conclusionValue, color: '#10b981' }}>
              {conclusion.advantages.map(a => `${a.field}（${a.percentile.toFixed(1)}%）`).join('、')}
            </span>
          </div>
          <div style={styles.conclusionItem}>
            <span style={styles.conclusionLabel}>相对弱势字段：</span>
            <span style={{ ...styles.conclusionValue, color: '#ef4444' }}>
              {conclusion.weaknesses.map(w => `${w.field}（${w.percentile.toFixed(1)}%）`).join('、')}
            </span>
          </div>
        </div>
      )}

      {selections.length === 0 && (
        <div style={styles.emptyHint}>
          点击上方按钮从已解析字段中选择，生成原表字段相对位置分析。
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fieldList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  fieldItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
  },
  fieldName: {
    flex: '0 0 140px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
  },
  fieldInputWrap: {
    flex: 1,
    display: 'flex',
  },
  fieldInputLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
  },
  fieldLabel: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  fieldInput: {
    padding: '6px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
  },
  removeButton: {
    width: '28px',
    height: '28px',
    border: 'none',
    background: '#fee2e2',
    color: '#ef4444',
    borderRadius: '50%',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    padding: '8px 16px',
    background: '#eff6ff',
    color: '#3b82f6',
    border: '1px dashed #93c5fd',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  noteBox: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#92400e',
    marginBottom: '8px',
  },
  noteBox2: {
    background: '#f0f7ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#1e40af',
    marginBottom: '12px',
  },
  toggleRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  toggleButton: {
    padding: '6px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    color: '#64748b',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  toggleActive: {
    background: '#3b82f6',
    color: '#fff',
    border: '1px solid #3b82f6',
  },
  conclusionBox: {
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: '8px',
    padding: '12px 16px',
    marginTop: '12px',
  },
  conclusionItem: {
    fontSize: '13px',
    marginBottom: '4px',
  },
  conclusionLabel: {
    color: '#64748b',
  },
  conclusionValue: {
    fontWeight: 600,
  },
  emptyHint: {
    textAlign: 'center',
    padding: '20px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  fieldTagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    padding: '10px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
    marginTop: '12px',
  },
  fieldTagLabel: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: 500,
  },
  fieldTag: {
    display: 'inline-block',
    padding: '3px 10px',
    background: '#eff6ff',
    color: '#1e40af',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500,
  },
};
