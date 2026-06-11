import { useState, useMemo, useCallback, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { normalizeScore } from '../../utils/chartData';
import type { TraditionalSubjectEntry } from '../../types';

interface TraditionalSubjectRadarProps {
  initialEntries?: TraditionalSubjectEntry[];
  onStateChange?: (entries: TraditionalSubjectEntry[]) => void;
}

interface TraditionalSubject {
  key: string;
  label: string;
  defaultMax: number;
  options?: { label: string; value: string }[];
  defaultOption?: string;
}

const SUBJECTS: TraditionalSubject[] = [
  { key: 'chinese', label: '语文', defaultMax: 150 },
  { key: 'math', label: '数学', defaultMax: 150 },
  { key: 'foreign', label: '外语', defaultMax: 150 },
  { key: 'preferred', label: '首选科目', defaultMax: 100, options: [
    { label: '物理', value: '物理' },
    { label: '历史', value: '历史' },
  ], defaultOption: '物理' },
  { key: 'reselect1', label: '再选科目 1', defaultMax: 100, options: [
    { label: '化学', value: '化学' },
    { label: '生物', value: '生物' },
    { label: '政治', value: '政治' },
    { label: '地理', value: '地理' },
  ], defaultOption: '化学' },
  { key: 'reselect2', label: '再选科目 2', defaultMax: 100, options: [
    { label: '化学', value: '化学' },
    { label: '生物', value: '生物' },
    { label: '政治', value: '政治' },
    { label: '地理', value: '地理' },
  ], defaultOption: '生物' },
];

export default function TraditionalSubjectRadar({ initialEntries, onStateChange }: TraditionalSubjectRadarProps) {
  const [entries, setEntries] = useState<SubjectEntry[]>(() =>
    (initialEntries ?? SUBJECTS.map(s => ({ name: s.defaultOption || s.label, score: 0, maxScore: s.defaultMax })))
  );
  // 分析模式：得分率模式（当前默认），预留科目百分位模式（percentile）和标准分模式（zScore）
  const modeLabel = '得分率模式';

  // 当 initialEntries 变化时同步
  useEffect(() => {
    if (initialEntries !== undefined) {
      setEntries(initialEntries);
    }
  }, [initialEntries]);

  // 状态变化时通知父组件
  useEffect(() => {
    if (onStateChange) {
      onStateChange(entries);
    }
  }, [entries, onStateChange]);

  const updateEntry = useCallback((index: number, key: keyof SubjectEntry, value: number | string) => {
    setEntries(prev => {
      const updated = [...prev];
      if (key === 'name') {
        updated[index] = { ...updated[index], name: value as string };
      } else {
        updated[index] = { ...updated[index], [key]: value };
      }
      return updated;
    });
  }, []);

  const updateSubjectOption = useCallback((index: number, optionValue: string) => {
    setEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: optionValue };
      return updated;
    });
  }, []);

  const validEntries = useMemo(() => {
    return entries.filter(e => e.score > 0 && e.maxScore > 0);
  }, [entries]);

  const chartOption: EChartsOption | null = useMemo(() => {
    if (validEntries.length < 2) return null;

    const indicator = validEntries.map(e => ({ name: e.name, max: 100 }));
    const normalizedData = validEntries.map(e => normalizeScore(e.score, e.maxScore));

    return {
      title: {
        text: '传统科目得分率雷达图',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const idx = params.dataIndex;
          const e = validEntries[idx];
          const norm = normalizeScore(e.score, e.maxScore);
          return `科目：${e.name}<br/>实际分：${Number.isInteger(e.score) ? e.score : e.score.toFixed(1)}<br/>满分：${e.maxScore}<br/>标准化百分比：${norm.toFixed(1)}%`;
        },
      },
      radar: {
        indicator,
        radius: '65%',
        axisName: { fontSize: 12 },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: normalizedData,
              name: '标准化表现',
              areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
              lineStyle: { color: '#3b82f6', width: 2 },
              itemStyle: { color: '#3b82f6' },
            },
          ],
        },
      ],
    } as EChartsOption;
  }, [validEntries]);

  // 结论
  const conclusion = useMemo(() => {
    if (validEntries.length < 2) return null;

    const withNorm = validEntries.map(e => ({
      name: e.name,
      score: e.score,
      maxScore: e.maxScore,
      normalized: normalizeScore(e.score, e.maxScore),
    }));

    const sorted = [...withNorm].sort((a, b) => b.normalized - a.normalized);
    const advantages = sorted.slice(0, 2);
    const weaknesses = sorted.slice(-2).reverse();
    const avgNorm = withNorm.reduce((a, b) => a + b.normalized, 0) / withNorm.length;

    return { advantages, weaknesses, avgNorm };
  }, [validEntries]);

  return (
    <div>
      {/* 科目输入 */}
      <div style={styles.subjectList}>
        {entries.map((entry, index) => {
          const subj = SUBJECTS[index];
          return (
            <div key={index} style={styles.subjectItem}>
              {/* 科目名称 / 选择器 */}
              <div style={styles.subjectNameWrap}>
                {subj.options ? (
                  <div style={styles.subjectSelectWrap}>
                    <span style={styles.subjectLabel}>{subj.label}</span>
                    <select
                      style={styles.subjectSelect}
                      value={entry.name}
                      onChange={e => updateSubjectOption(index, e.target.value)}
                    >
                      {subj.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span style={styles.subjectLabelStatic}>{entry.name}</span>
                )}
              </div>

              {/* 分数输入 */}
              <div style={styles.scoreInputs}>
                <label style={styles.scoreInputWrap}>
                  <span style={styles.scoreInputLabel}>实际分</span>
                  <input
                    type="number"
                    style={styles.scoreInput}
                    value={entry.score || ''}
                    onChange={e => updateEntry(index, 'score', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                  />
                </label>
                <label style={styles.scoreInputWrap}>
                  <span style={styles.scoreInputLabel}>满分</span>
                  <input
                    type="number"
                    style={styles.scoreInput}
                    value={entry.maxScore}
                    onChange={e => updateEntry(index, 'maxScore', parseFloat(e.target.value) || 100)}
                    placeholder="100"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* 雷达图 */}
      {chartOption && (
        <>
          <ReactECharts option={chartOption} style={{ height: '400px', width: '100%' }} />

          {conclusion && (
            <div style={styles.conclusionBox}>
              <div style={styles.conclusionItem}>
                <span style={styles.conclusionLabel}>得分率较高科目：</span>
                <span style={{ ...styles.conclusionValue, color: '#10b981' }}>
                  {conclusion.advantages.map(a => `${a.name}（${a.normalized.toFixed(1)}%）`).join('、')}
                </span>
              </div>
              <div style={styles.conclusionItem}>
                <span style={styles.conclusionLabel}>得分率较低科目：</span>
                <span style={{ ...styles.conclusionValue, color: '#ef4444' }}>
                  {conclusion.weaknesses.map(w => `${w.name}（${w.normalized.toFixed(1)}%）`).join('、')}
                </span>
              </div>
              <div style={styles.conclusionItem}>
                <span style={styles.conclusionLabel}>整体平均得分率：</span>
                <span style={{ ...styles.conclusionValue, color: '#3b82f6' }}>
                  {conclusion.avgNorm.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* 分析模式与说明 */}
          <div style={styles.modeNote}>
            当前模式：{modeLabel}。按 实际分 ÷ 满分 × 100% 计算，只反映各科得分率，不代表不同科目难度完全一致，也不等同于全体排名。
          </div>
          <div style={styles.futureNote}>
            如需按科目百分位或标准分分析，需要提供各科全体成绩分布数据。
          </div>
        </>
      )}

      {validEntries.length < 2 && (
        <div style={styles.emptyHint}>
          请至少输入两科成绩，即可生成传统科目得分率雷达图。
        </div>
      )}
    </div>
  );
}

interface SubjectEntry {
  name: string;
  score: number;
  maxScore: number;
}

const styles: Record<string, React.CSSProperties> = {
  subjectList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  subjectItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
  },
  subjectNameWrap: {
    flex: '0 0 100px',
  },
  subjectSelectWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  subjectLabel: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  subjectSelect: {
    padding: '4px 6px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    background: '#fff',
  },
  subjectLabelStatic: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
  },
  scoreInputs: {
    flex: 1,
    display: 'flex',
    gap: '12px',
  },
  scoreInputWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  scoreInputLabel: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  scoreInput: {
    padding: '6px 8px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
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
  modeNote: {
    background: '#f0f7ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#1e40af',
    marginTop: '10px',
  },
  futureNote: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '6px',
    textAlign: 'center' as const,
  },
};
