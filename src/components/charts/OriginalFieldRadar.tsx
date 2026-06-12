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
  getFieldAnalysisRole?: (header: string) => string;
  excludedKeywords?: string[];
  initialSelections?: FieldSelection[];
  initialViewMode?: 'bar' | 'radar';
  onStateChange?: (state: OriginalFieldRadarState) => void;
}

type ViewMode = 'bar' | 'radar';

const EXCLUDED_DEFAULT = ['名次', '排名', '序号', '编号'];

// 字段分组配置：每个字段只属于一个分组
const FIELD_GROUP_CONFIG = [
  { key: 'totalRank', label: '总分 / 排名', roles: ['primaryTotal', 'rank'], defaultExpanded: true },
  { key: 'sectionTotal', label: '模块合计', roles: ['sectionTotal'], defaultExpanded: true },
  { key: 'courseScore', label: '课程成绩', roles: ['courseScore'], defaultExpanded: true },
  { key: 'adjustment', label: '加扣分 / 调整项', roles: ['adjustment'], defaultExpanded: false },
  { key: 'identity', label: '身份信息', roles: ['identity'], defaultExpanded: false },
  { key: 'other', label: '其他字段', roles: ['textMeta', 'unknown'], defaultExpanded: false },
  { key: 'invalid', label: '无效 / 未命名字段', roles: ['invalid'], defaultExpanded: false },
];

// 字段类型标签映射
const ROLE_BADGE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  primaryTotal: { label: '总分', color: '#059669', bg: '#d1fae5' },
  rank: { label: '排名', color: '#7c3aed', bg: '#ede9fe' },
  sectionTotal: { label: '合计', color: '#0891b2', bg: '#cffafe' },
  courseScore: { label: '课程', color: '#2563eb', bg: '#dbeafe' },
  adjustment: { label: '调整项', color: '#d97706', bg: '#fef3c7' },
  identity: { label: '身份', color: '#64748b', bg: '#f1f5f9' },
  textMeta: { label: '其他', color: '#64748b', bg: '#f1f5f9' },
  unknown: { label: '其他', color: '#64748b', bg: '#f1f5f9' },
  invalid: { label: '无效', color: '#dc2626', bg: '#fee2e2' },
};

// 是否推荐分析
const RECOMMENDED_ROLES = new Set(['primaryTotal', 'rank', 'sectionTotal', 'courseScore']);

export default function OriginalFieldRadar({
  headers, rows, isNumericField, getFieldAnalysisRole, excludedKeywords,
  initialSelections, initialViewMode, onStateChange,
}: OriginalFieldRadarProps) {
  const [selections, setSelections] = useState<FieldSelection[]>(initialSelections ?? []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? 'bar');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [tempSelections, setTempSelections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // 按 analysisRole 分组字段，每个字段只属于一个分组
  const groupedFields = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const g of FIELD_GROUP_CONFIG) {
      groups[g.key] = [];
    }
    
    for (const field of numericFields) {
      const role = getFieldAnalysisRole ? getFieldAnalysisRole(field) : 'unknown';
      // 找到第一个匹配角色所在的分组
      for (const g of FIELD_GROUP_CONFIG) {
        if (g.roles.includes(role)) {
          groups[g.key].push(field);
          break;
        }
      }
    }
    return groups;
  }, [numericFields, getFieldAnalysisRole]);

  // 计算默认推荐的字段（最多 8-12 个高优先级字段，排除身份和调整项）
  const defaultRecommendedFields = useMemo(() => {
    const result: string[] = [];
    const priorityOrder = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'];
    for (const role of priorityOrder) {
      for (const field of numericFields) {
        if (result.length >= 12) break;
        const fieldRole = getFieldAnalysisRole ? getFieldAnalysisRole(field) : 'unknown';
        if (fieldRole === role && !result.includes(field)) {
          result.push(field);
        }
      }
    }
    return result;
  }, [numericFields, getFieldAnalysisRole]);

  // 打开批量选择弹窗
  const openBatchModal = useCallback(() => {
    const current = new Set(selections.map(s => s.field));
    setTempSelections(current);
    setSearchQuery('');
    // 初始化展开状态
    const expanded = new Set<string>();
    for (const g of FIELD_GROUP_CONFIG) {
      if (g.defaultExpanded) expanded.add(g.key);
    }
    setExpandedGroups(expanded);
    setShowBatchModal(true);
  }, [selections]);

  // 关闭弹窗
  const closeBatchModal = useCallback(() => {
    setShowBatchModal(false);
    setSearchQuery('');
  }, []);

  // 确认批量选择
  const confirmBatchSelection = useCallback(() => {
    const ordered: FieldSelection[] = [];
    // 保持原有顺序
    for (const sel of selections) {
      if (tempSelections.has(sel.field)) {
        ordered.push(sel);
      }
    }
    // 新增的字段
    for (const field of tempSelections) {
      if (!ordered.some(o => o.field === field)) {
        ordered.push({ field, userValue: 0 });
      }
    }
    setSelections(ordered);
    setShowBatchModal(false);
    setSearchQuery('');
  }, [tempSelections, selections]);

  // 切换单个字段选中状态
  const toggleTempField = useCallback((field: string) => {
    setTempSelections(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  // 切换分组展开/折叠
  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // 快捷操作
  const quickSelectRecommended = useCallback(() => {
    setTempSelections(new Set(defaultRecommendedFields));
  }, [defaultRecommendedFields]);

  const quickSelectTotalAndRank = useCallback(() => {
    const fields = numericFields.filter(f => {
      const role = getFieldAnalysisRole ? getFieldAnalysisRole(f) : 'unknown';
      return role === 'primaryTotal' || role === 'rank';
    });
    setTempSelections(new Set(fields));
  }, [numericFields, getFieldAnalysisRole]);

  const quickSelectSectionTotal = useCallback(() => {
    setTempSelections(new Set(groupedFields['sectionTotal'] || []));
  }, [groupedFields]);

  const quickSelectCourseScore = useCallback(() => {
    setTempSelections(new Set(groupedFields['courseScore'] || []));
  }, [groupedFields]);

  const quickClearAll = useCallback(() => {
    setTempSelections(new Set());
  }, []);

  // 字段管理
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

  const clearAllFields = useCallback(() => {
    setSelections([]);
  }, []);

  const restoreRecommended = useCallback(() => {
    const newSelections: FieldSelection[] = defaultRecommendedFields.map(f => {
      const existing = selections.find(s => s.field === f);
      return { field: f, userValue: existing?.userValue ?? 0 };
    });
    setSelections(newSelections);
  }, [defaultRecommendedFields, selections]);

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
        <div style={styles.buttonRow}>
          <button style={styles.addButton} onClick={addField}>
            + 添加字段
          </button>
          <button style={styles.batchButton} onClick={openBatchModal}>
            批量选择字段
          </button>
          {selections.length > 0 && (
            <>
              <button style={styles.restoreButton} onClick={restoreRecommended}>
                恢复推荐字段
              </button>
              <button style={styles.clearButton} onClick={clearAllFields}>
                一键清空
              </button>
            </>
          )}
        </div>
      </div>

      {/* 字段过多提示 */}
      {selections.length > 10 && (
        <div style={styles.warningBox}>
          字段过多可能影响图表可读性，建议选择 5-10 个核心字段。当前已选 {selections.length} 个字段。
        </div>
      )}

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

      {/* 批量选择弹窗 */}
      {showBatchModal && (
        <div style={batchStyles.overlay} onClick={closeBatchModal}>
          <div style={batchStyles.modal} onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div style={batchStyles.header}>
              <div style={batchStyles.headerContent}>
                <h3 style={batchStyles.title}>批量选择分析字段</h3>
                <p style={batchStyles.subtitle}>选择 5-10 个核心字段更适合雷达图展示</p>
              </div>
              <button style={batchStyles.closeBtn} onClick={closeBatchModal}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 搜索和统计 */}
            <div style={batchStyles.searchSection}>
              <div style={batchStyles.searchWrap}>
                <svg style={batchStyles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="搜索字段名..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={batchStyles.searchInput}
                />
                {searchQuery && (
                  <button style={batchStyles.clearSearch} onClick={() => setSearchQuery('')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div style={batchStyles.selectedCount}>
                <span style={batchStyles.countNumber}>{tempSelections.size}</span>
                <span style={batchStyles.countLabel}> 个字段已选择</span>
                {tempSelections.size > 10 && (
                  <span style={batchStyles.countWarning}>（建议 5-10 个）</span>
                )}
              </div>
            </div>

            {/* 快捷操作 */}
            <div style={batchStyles.quickActions}>
              <button style={batchStyles.quickBtn} onClick={quickSelectRecommended}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                推荐字段
              </button>
              <button style={batchStyles.quickBtn} onClick={quickSelectTotalAndRank}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20V10M18 20V4M6 20v-4" />
                </svg>
                总分+排名
              </button>
              <button style={batchStyles.quickBtn} onClick={quickSelectSectionTotal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
                模块合计
              </button>
              <button style={batchStyles.quickBtn} onClick={quickSelectCourseScore}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                课程成绩
              </button>
              <button style={batchStyles.quickBtnDanger} onClick={quickClearAll}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                清空
              </button>
            </div>

            {/* 字段分组列表 */}
            <div style={batchStyles.body}>
              {FIELD_GROUP_CONFIG.map(group => {
                const fields = groupedFields[group.key] || [];
                // 搜索过滤
                const filteredFields = searchQuery
                  ? fields.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()))
                  : fields;
                
                if (filteredFields.length === 0) return null;
                
                const isExpanded = expandedGroups.has(group.key);
                const selectedInGroup = filteredFields.filter(f => tempSelections.has(f)).length;

                return (
                  <div key={group.key} style={batchStyles.group}>
                    <div
                      style={batchStyles.groupHeader}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div style={batchStyles.groupHeaderLeft}>
                        <svg
                          style={{
                            ...batchStyles.groupArrow,
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span style={batchStyles.groupTitle}>{group.label}</span>
                        <span style={batchStyles.groupCount}>{filteredFields.length}</span>
                        {selectedInGroup > 0 && (
                          <span style={batchStyles.groupSelectedBadge}>{selectedInGroup} 已选</span>
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div style={batchStyles.groupContent}>
                        {filteredFields.map(field => {
                          const role = getFieldAnalysisRole ? getFieldAnalysisRole(field) : 'unknown';
                          const badge = ROLE_BADGE_MAP[role] || ROLE_BADGE_MAP.unknown;
                          const isSelected = tempSelections.has(field);
                          const isRecommended = RECOMMENDED_ROLES.has(role);

                          return (
                            <div
                              key={field}
                              style={{
                                ...batchStyles.fieldCard,
                                ...(isSelected ? batchStyles.fieldCardSelected : {}),
                              }}
                              onClick={() => toggleTempField(field)}
                            >
                              <div style={batchStyles.fieldCheckbox}>
                                {isSelected ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : (
                                  <div style={batchStyles.checkboxEmpty} />
                                )}
                              </div>
                              <div style={batchStyles.fieldInfo}>
                                <span style={batchStyles.fieldName}>{field}</span>
                                <div style={batchStyles.fieldBadges}>
                                  <span style={{
                                    ...batchStyles.badge,
                                    color: badge.color,
                                    background: badge.bg,
                                  }}>
                                    {badge.label}
                                  </span>
                                  {isRecommended && (
                                    <span style={batchStyles.recommendedBadge}>推荐</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 底部操作 */}
            <div style={batchStyles.footer}>
              <button style={batchStyles.cancelBtn} onClick={closeBatchModal}>取消</button>
              <button style={batchStyles.confirmBtn} onClick={confirmBatchSelection}>
                应用选择
                <span style={batchStyles.confirmCount}>({tempSelections.size})</span>
              </button>
            </div>
          </div>
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

// 批量选择弹窗样式
const batchStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '720px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
    margin: '0 0 4px 0',
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    background: '#f1f5f9',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    transition: 'all 0.15s',
    flexShrink: 0,
  },
  searchSection: {
    padding: '16px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 36px 10px 36px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.15s',
    background: '#f8fafc',
  },
  clearSearch: {
    position: 'absolute',
    right: '8px',
    width: '24px',
    height: '24px',
    border: 'none',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
  },
  selectedCount: {
    fontSize: '13px',
    color: '#64748b',
  },
  countNumber: {
    fontWeight: 600,
    color: '#3b82f6',
    fontSize: '15px',
  },
  countLabel: {
    color: '#64748b',
  },
  countWarning: {
    color: '#f59e0b',
    fontSize: '12px',
    marginLeft: '8px',
  },
  quickActions: {
    padding: '12px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  quickBtn: {
    padding: '6px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    color: '#475569',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  quickBtnDanger: {
    padding: '6px 12px',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
  },
  group: {
    marginBottom: '12px',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  groupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  groupArrow: {
    color: '#64748b',
    transition: 'transform 0.2s',
  },
  groupTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
  },
  groupCount: {
    fontSize: '12px',
    color: '#94a3b8',
    background: '#e2e8f0',
    padding: '2px 6px',
    borderRadius: '10px',
  },
  groupSelectedBadge: {
    fontSize: '11px',
    color: '#3b82f6',
    background: '#dbeafe',
    padding: '2px 6px',
    borderRadius: '10px',
    fontWeight: 500,
  },
  groupContent: {
    padding: '8px 0 0 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    background: '#fff',
  },
  fieldCardSelected: {
    border: '1px solid #3b82f6',
    background: '#eff6ff',
  },
  fieldCheckbox: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    background: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxEmpty: {
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    border: '2px solid #cbd5e1',
    background: '#fff',
  },
  fieldInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  fieldName: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fieldBadges: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 500,
  },
  recommendedBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 500,
    color: '#059669',
    background: '#d1fae5',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelBtn: {
    padding: '10px 20px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#fff',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  confirmBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s',
  },
  confirmCount: {
    fontSize: '13px',
    opacity: 0.9,
  },
};
