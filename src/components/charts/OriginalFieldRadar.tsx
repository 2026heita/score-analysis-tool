import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { EChartsOption } from 'echarts';
import { extractFieldValues, computeStats, computePercentile } from '../../engine/analysisEngine';
import { parseNumericValue, parseNumericValueLegacy } from '../../utils/tableParser/numericParser';
import { safeFormatPercent, extractNumericFromEChartsParam, isValidPercentile } from '../../utils/safeFormat';
import { useElementWidth } from '../../hooks/useElementWidth';
import {
  wrapCategoryLabel,
  estimateCategoryAxisHeight,
} from '../../utils/chartLabel';
import EChartsWrapper from './EChartsWrapper';
import type { OriginalFieldRadarState } from '../../types';
import {
  getRadarSelectedFieldsCache,
  getRadarFieldValuesCache,
  getRadarViewModeCache,
  setRadarCache,
  clearOriginalFieldRadarCache,
} from './originalFieldRadarCache';
import HelpPopover from '../help/HelpPopover';
import { getHelp } from '../../data/helpContent';
// @deprecated 教育/高考功能已收敛至 legacy 区
import { FIXED_SUBJECT_ORDER } from '../../config/education';

interface FieldSelection {
  field: string;
  userValue: number;
}

interface OriginalFieldRadarProps {
  headers: string[];
  rows: Record<string, string>[];
  isNumericField: (header: string) => boolean;
  getFieldAnalysisRole?: (header: string) => string;
  getFieldMetricDirection?: (header: string) => string;
  excludedKeywords?: string[];
  initialSelections?: FieldSelection[];
  initialViewMode?: 'bar' | 'radar';
  onStateChange?: (state: OriginalFieldRadarState) => void;
}

type ViewMode = 'bar' | 'radar';
type QuickMode = 'recommended' | 'others' | null;

const EXCLUDED_DEFAULT = ['名次', '排名', '序号', '编号'];

// 字段分组配置：每个字段只属于一个分组（基于通用分析角色）
const FIELD_GROUP_CONFIG = [
  { key: 'metrics', label: '推荐指标', roles: ['metric'], defaultExpanded: true },
  { key: 'dimensions', label: '维度字段', roles: ['dimension'], defaultExpanded: false },
  { key: 'identifiers', label: '标识字段', roles: ['identifier'], defaultExpanded: false },
  { key: 'times', label: '时间字段', roles: ['time'], defaultExpanded: false },
  { key: 'descriptions', label: '描述字段', roles: ['description'], defaultExpanded: false },
  { key: 'others', label: '其他字段', roles: ['ignored', 'unspecified', 'unknown'], defaultExpanded: false },
];

// 字段类型标签映射（通用 role → 展示文案与配色）
const ROLE_BADGE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  metric: { label: '指标', color: '#059669', bg: '#d1fae5' },
  dimension: { label: '维度', color: '#0891b2', bg: '#cffafe' },
  identifier: { label: '标识', color: '#64748b', bg: '#f1f5f9' },
  time: { label: '时间', color: '#7c3aed', bg: '#ede9fe' },
  description: { label: '描述', color: '#2563eb', bg: '#dbeafe' },
  ignored: { label: '忽略', color: '#94a3b8', bg: '#f8fafc' },
  unspecified: { label: '未指定', color: '#d97706', bg: '#fef3c7' },
  unknown: { label: '其他', color: '#64748b', bg: '#f1f5f9' },
};

// 是否推荐分析（仅 metric 角色）
const RECOMMENDED_ROLES = new Set(['metric']);

// 根据条形图容器宽度决定 Y 轴单行标签的“显示列数”预算。
// 容器宽越高预算越大（标签可用 px 越多）；不同设备给不同预算，
// 使长字段在 PC 大多一行、手机合理折 2~3 行，且不以缩小字号规避截断。
function resolveFieldLabelBudget(containerWidth: number): number {
  if (!containerWidth || containerWidth <= 0) return 8;   // 未测量时先按手机预算，避免初始溢出
  if (containerWidth >= 900) return 20;                    // 桌面：标签区约 230px
  if (containerWidth >= 700) return 16;                    // 桌面窄/平板横屏：约 180px
  if (containerWidth >= 480) return 12;                    // 平板竖屏/手机横屏：约 140px
  return 8;                                                // 手机：约 92px，让柱图区更宽
}

// 把“列数预算”换算成 axisLabel 的像素宽度，配合 overflow:'break' 兜底，
// 确保 formatter 换行后任何单行都不会再次溢出被截断。
function labelPxWidthForBudget(budget: number): number {
  return Math.max(80, Math.round(budget * 11.5));
}

// 轻量日期规范化，仅用于比较（不改变原始数据）：
// 兼容 ISO 带时间部分，如 2009-12-18T00:00:00.000Z -> 2009-12-18
function normalizeTimeValue(value: string): string {
  return value.trim().split('T')[0];
}

export default function OriginalFieldRadar({
  headers, rows, isNumericField, getFieldAnalysisRole, getFieldMetricDirection, excludedKeywords,
  initialSelections, initialViewMode, onStateChange,
}: OriginalFieldRadarProps) {
  // 缓存清理：当 headers 变化时（说明切换了文件或重新解析），清空缓存
  const headersKey = headers.join(',');
  useEffect(() => {
    clearOriginalFieldRadarCache();
  }, [headersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 分离状态：字段选择（稳定）和用户输入值（频繁变化）
  // 优先使用缓存，其次使用 initialSelections，避免组件重新挂载时状态丢失
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const cached = getRadarSelectedFieldsCache();
    if (cached && cached.length > 0) {
      return cached;
    }
    const initial = initialSelections?.map(s => s.field) ?? [];
    return initial;
  });

  const [fieldValues, setFieldValues] = useState<Record<string, number>>(() => {
    const cached = getRadarFieldValuesCache();
    if (cached && Object.keys(cached).length > 0) {
      return cached;
    }
    const values: Record<string, number> = {};
    initialSelections?.forEach(s => {
      if (s.userValue !== undefined && !isNaN(s.userValue)) {
        values[s.field] = s.userValue;
      }
    });
    return values;
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const cached = getRadarViewModeCache();
    if (cached) {
      return cached;
    }
    const initial = initialViewMode ?? 'bar';
    return initial;
  });

  // 关键修复：在渲染时立即同步缓存，而不是在 useLayoutEffect 中
  // 这样即使组件被 ReactECharts 重新挂载，缓存也已更新
  setRadarCache(selectedFields, fieldValues, viewMode);

  // 动画 token：每次切换 viewMode 时递增，驱动 shouldAnimate
  const [animationToken, setAnimationToken] = useState(0);
  // 已消费的 token，消费后 shouldAnimate 变为 false
  const consumedTokenRef = useRef<number | null>(null);

  // 条形图容器宽度：据此决定每行标签最大列数。基于容器（ResizeObserver），非 window.innerWidth
  const { ref: barContainerRef, width: barContainerWidth } = useElementWidth<HTMLDivElement>();
  const fieldLabelBudget = resolveFieldLabelBudget(barContainerWidth);
  // 手机窄容器：tooltip 压缩内容 + confine（不溢出图表外），避免覆盖过多图表本体。
  const compactTooltip = barContainerWidth > 0 && barContainerWidth < 480;

  // 首次渲染时标记为已消费，避免首次加载时播放动画
  useEffect(() => {
    consumedTokenRef.current = animationToken;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听窗口 resize 和 orientationchange，触发图表重绘
  useEffect(() => {
    const handleResize = () => {
      // 触发自定义事件，让 echarts-for-react 重新计算尺寸
      window.dispatchEvent(new Event('chart-resize'));
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // 使用 useLayoutEffect 同步更新缓存，确保在组件重新挂载前缓存已更新
  useLayoutEffect(() => {
    setRadarCache(selectedFields, fieldValues, viewMode);
  }, [selectedFields]);

  // 使用 ref 存储最新的 fieldValues 和 onStateChange，避免在 effect 依赖数组中添加它们
  const fieldValuesRef = useRef(fieldValues);
  useEffect(() => {
    fieldValuesRef.current = fieldValues;
  }, [fieldValues]);

  const onStateChangeRef = useRef(onStateChange);
  useLayoutEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [tempSelections, setTempSelections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeQuickMode, setActiveQuickMode] = useState<QuickMode>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [rowSearchQuery, setRowSearchQuery] = useState('');
  const [matchedRows, setMatchedRows] = useState<Record<string, string>[]>([]);
  const [showRowPicker, setShowRowPicker] = useState(false);

  // 组合 selections 用于渲染
  const selections = useMemo(() => {
    return selectedFields.map(field => ({
      field,
      userValue: fieldValues[field],
    }));
  }, [selectedFields, fieldValues]);

  const excluded = excludedKeywords ?? EXCLUDED_DEFAULT;

  // 字段列表、视图模式或数值变化时通知父组件
  // 使用 useLayoutEffect 确保在组件卸载前父组件的状态已经被更新
  useLayoutEffect(() => {
    if (selectedFields.length > 0) {
      const state = {
        selections: selectedFields
          .map(field => ({
            field,
            userValue: fieldValues[field],
          }))
          .filter(sel => sel.userValue !== undefined && !isNaN(sel.userValue)),
        viewMode,
      };
      onStateChangeRef.current?.(state);
    }
  }, [selectedFields, viewMode, fieldValues]);

  const numericFields = useMemo(() => {
    return headers.filter(h => isNumericField(h) && !excluded.some(kw => h.includes(kw)));
  }, [headers, isNumericField, excluded]);

  // 获取字段角色的辅助函数（仅使用传入的分类，不做本地推断）
  const getFieldRole = useCallback((header: string): string => {
    if (getFieldAnalysisRole) {
      return getFieldAnalysisRole(header);
    }
    return 'unknown';
  }, [getFieldAnalysisRole]);

  // 获取字段指标方向（higher_is_better / lower_is_better / neutral），用于百分位方向判断
  const getMetricDirection = useCallback((header: string): string => {
    if (getFieldMetricDirection) {
      return getFieldMetricDirection(header);
    }
    return 'unspecified';
  }, [getFieldMetricDirection]);

  // 按 analysisRole 分组字段，每个字段只属于一个分组
  const groupedFields = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const g of FIELD_GROUP_CONFIG) {
      groups[g.key] = [];
    }
    for (const field of numericFields) {
      const role = getFieldRole(field);
      for (const g of FIELD_GROUP_CONFIG) {
        if (g.roles.includes(role)) {
          groups[g.key].push(field);
          break;
        }
      }
    }
    return groups;
  }, [numericFields, getFieldRole]);

  // 默认推荐字段（最多 12 个高优先级字段：metric 角色）
  const defaultRecommendedFields = useMemo(() => {
    const result: string[] = [];
    const priorityOrder = ['metric'];
    for (const role of priorityOrder) {
      for (const field of numericFields) {
        if (result.length >= 12) break;
        const fieldRole = getFieldRole(field);
        if (fieldRole === role && !result.includes(field)) {
          result.push(field);
        }
      }
    }
    return result;
  }, [numericFields, getFieldRole]);

  // Toast 提示
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2000);
  }, []);

  // 打开批量选择弹窗
  const openBatchModal = useCallback(() => {
    const current = new Set(selections.map(s => s.field));
    setTempSelections(current);
    setSearchQuery('');
    setActiveQuickMode(null);
    const expanded = new Set<string>();
    for (const g of FIELD_GROUP_CONFIG) {
      if (g.defaultExpanded) expanded.add(g.key);
    }
    setExpandedGroups(expanded);
    setShowBatchModal(true);
  }, [selections]);

  const closeBatchModal = useCallback(() => {
    setShowBatchModal(false);
    setSearchQuery('');
    setActiveQuickMode(null);
  }, []);

  // 确认批量选择
  const confirmBatchSelection = useCallback(() => {
    const ordered: FieldSelection[] = [];
    for (const sel of selections) {
      if (tempSelections.has(sel.field)) {
        ordered.push(sel);
      }
    }
    for (const field of tempSelections) {
      if (!ordered.some(o => o.field === field)) {
        // 新增字段不设置默认值，保持未填写状态
        ordered.push({ field, userValue: NaN });
      }
    }
    setSelectedFields(ordered.map(o => o.field));
    setFieldValues(prev => {
      const next = { ...prev };
      for (const o of ordered) {
        // 只保留已存在的值，不设置默认值
        if (next[o.field] === undefined && !isNaN(o.userValue)) {
          next[o.field] = o.userValue;
        }
      }
      return next;
    });
    setShowBatchModal(false);
    setSearchQuery('');
    setActiveQuickMode(null);
  }, [tempSelections, selections]);

  // 切换单个字段
  const toggleTempField = useCallback((field: string) => {
    setActiveQuickMode(null);
    setTempSelections(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);

  // 从已选预览中移除字段
  const removeFromTemp = useCallback((field: string) => {
    setActiveQuickMode(null);
    setTempSelections(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // 快捷操作：只改变面板内勾选状态，不直接应用
  const quickSelectRecommended = useCallback(() => {
    const fields = defaultRecommendedFields;
    if (fields.length === 0) {
      showToast('当前表格没有匹配的分析字段');
      return;
    }
    setTempSelections(new Set(fields));
    setActiveQuickMode('recommended');
    showToast(`已选择 ${fields.length} 个推荐指标`);
  }, [defaultRecommendedFields, showToast]);

  const quickSelectOthers = useCallback(() => {
    const fields = (groupedFields['others'] || []);
    if (fields.length === 0) {
      showToast('当前表格没有匹配的其他字段');
      return;
    }
    setTempSelections(new Set(fields));
    setActiveQuickMode('others');
    showToast(`已选择 ${fields.length} 个其他字段`);
  }, [groupedFields, showToast]);

  const quickClearAll = useCallback(() => {
    setTempSelections(new Set());
    setActiveQuickMode(null);
    showToast('已清空所有选择');
  }, [showToast]);

  // 快捷模式标签
  const quickModeLabel: Record<string, string> = {
    recommended: '推荐指标',
    others: '其他字段',
  };

  // 打开粘贴弹窗
  const openPasteModal = useCallback(() => {
    setPasteText('');
    setPasteErrors([]);
    setShowPasteModal(true);
  }, []);

  // 关闭粘贴弹窗
  const closePasteModal = useCallback(() => {
    setShowPasteModal(false);
    setPasteText('');
    setPasteErrors([]);
  }, []);

  // 解析粘贴文本并填充字段
  const handlePaste = useCallback(() => {
    if (!pasteText.trim()) {
      setPasteErrors(['请输入数据']);
      return;
    }

    // 分割粘贴文本（支持制表符、逗号、空格分隔）
    const values = pasteText.split(/[\t,，\s]+/).filter(v => v.trim() !== '');
    const errors: string[] = [];
    const matchedFields: { field: string; value: number }[] = [];

    // 尝试匹配字段和数值
    for (let i = 0; i < values.length; i++) {
      const value = values[i].trim();
      const parsed = parseNumericValueLegacy(value);

      // 如果当前索引对应一个已选字段
      if (i < selections.length) {
        const field = selections[i].field;
        if (parsed === null) {
          errors.push(`${field}: "${value}" 不是有效数字`);
        } else {
          matchedFields.push({ field, value: parsed });
        }
      } else {
        // 超出已选字段数量
        errors.push(`多余值: "${value}" (第 ${i + 1} 列)`);
      }
    }

    // 检查是否有遗漏的字段
    if (matchedFields.length < selections.length) {
      const missingFields = selections
        .filter(s => !matchedFields.some(m => m.field === s.field))
        .map(s => s.field);
      errors.push(`缺少字段: ${missingFields.join(', ')}`);
    }

    if (errors.length > 0) {
      setPasteErrors(errors);
      return;
    }

    // 更新字段值（只更新 fieldValues，不改变 selectedFields）
    setFieldValues(prev => {
      const next = { ...prev };
      for (const matched of matchedFields) {
        next[matched.field] = matched.value;
      }
      return next;
    });

    setShowPasteModal(false);
    setPasteText('');
    setPasteErrors([]);
    showToast(`成功填充 ${matchedFields.length} 个字段`);
  }, [pasteText, selections, showToast]);

  // 查找反馈消息
  const [lookupMessage, setLookupMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [emptyFields, setEmptyFields] = useState<string[]>([]);

  // 查找并填充某行数据（点击按钮或回车触发）。按"唯一定位字段"精确或模糊匹配。
  const performRowLookup = useCallback(() => {
    const query = rowSearchQuery.trim();
    if (!query) {
      setLookupMessage({ type: 'warning', text: '请输入唯一定位字段值' });
      return;
    }

    // 查找唯一定位字段（覆盖通用业务词；保留既有兼容词，不新增识别规则）
    const nameField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('姓名') || lower.includes('名称') || lower.includes('学生姓名') || lower === 'name';
    });
    const idField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('编号') || lower.includes('代号') || lower.includes('编码') || lower.includes('工号')
        || lower.includes('订单号') || lower.includes('账号') || lower.includes('id')
        || lower.includes('学号') || lower.includes('考生号') || lower.includes('考号') || lower.includes('准考证号');
    });
    // 时间定位字段：只按已有 role 识别，不自行增加日期字段名判断
    const timeField = headers.find(h => (getFieldAnalysisRole ? getFieldAnalysisRole(h) === 'time' : false));

    if (!nameField && !idField) {
      if (!timeField) {
        setLookupMessage({ type: 'error', text: '当前数据未包含可用于记录定位的字段' });
        return;
      }
      setLookupMessage({ type: 'warning', text: '未找到唯一定位字段，尝试使用时间字段定位记录' });
    }

    const queryLower = query.toLowerCase();

    // 优先级1：标识精确匹配
    if (idField) {
      const exactIdMatch = rows.filter(row => {
        const id = (row[idField] || '').trim();
        return id.toLowerCase() === queryLower;
      });
      if (exactIdMatch.length === 1) {
        fillRowData(exactIdMatch[0]);
        return;
      } else if (exactIdMatch.length > 1) {
        setMatchedRows(exactIdMatch);
        setShowRowPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${exactIdMatch.length} 条相同标识的记录，请选择` });
        return;
      }
    }

    // 优先级2：名称精确匹配
    if (nameField) {
      const exactNameMatch = rows.filter(row => {
        const name = (row[nameField] || '').trim();
        return name.toLowerCase() === queryLower;
      });
      if (exactNameMatch.length === 1) {
        fillRowData(exactNameMatch[0]);
        return;
      } else if (exactNameMatch.length > 1) {
        setMatchedRows(exactNameMatch);
        setShowRowPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${exactNameMatch.length} 条相同名称的记录，请选择` });
        return;
      }
    }

    // 优先级3：名称模糊匹配
    if (nameField) {
      const fuzzyNameMatch = rows.filter(row => {
        const name = (row[nameField] || '').trim().toLowerCase();
        return name.includes(queryLower);
      });
      if (fuzzyNameMatch.length === 1) {
        fillRowData(fuzzyNameMatch[0]);
        return;
      } else if (fuzzyNameMatch.length > 1) {
        setMatchedRows(fuzzyNameMatch);
        setShowRowPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${fuzzyNameMatch.length} 条匹配记录，请选择` });
        return;
      }
    }

    // 优先级4：时间字段定位（仅当唯一定位/名称字段均未匹配时执行）
    // 规范化后比较，多行同日复用选择器，不自动选第一条
    if (timeField) {
      const normQuery = normalizeTimeValue(query);
      const timeMatches = rows.filter(row => {
        const val = (row[timeField] || '').trim();
        return val !== '' && normalizeTimeValue(val) === normQuery;
      });
      if (timeMatches.length === 1) {
        fillRowData(timeMatches[0]);
        return;
      } else if (timeMatches.length > 1) {
        setMatchedRows(timeMatches);
        setShowRowPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${timeMatches.length} 条记录，请选择` });
        return;
      }
    }

    // 未找到
    setLookupMessage({ type: 'error', text: '未找到匹配记录，请检查唯一定位字段值。' });
    setMatchedRows([]);
    setShowRowPicker(false);
  }, [rowSearchQuery, headers, rows, getFieldAnalysisRole]);

  // 填充行数据（只更新 fieldValues，不修改 selectedFields）
  const fillRowData = useCallback((row: Record<string, string>) => {
    const updates: Record<string, number> = {};
    const emptyFieldsList: string[] = [];

    for (const field of selectedFields) {
      const rawValue = row[field];
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        const parsed = parseNumericValue(rawValue);
        if (parsed.status === 'valid') {
          updates[field] = parsed.value;
        }
      } else {
        emptyFieldsList.push(field);
      }
    }

    const filledCount = Object.keys(updates).length;

    // 只更新 fieldValues
    if (filledCount > 0) {
      setFieldValues(prev => ({ ...prev, ...updates }));
    }

    // 记录空字段
    setEmptyFields(emptyFieldsList);

    // 显示反馈消息
    const nameField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('姓名') || lower.includes('名称') || lower === 'name';
    });
    const idField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('编号') || lower.includes('编码') || lower.includes('id') || lower.includes('学号') || lower.includes('考号');
    });
    const rowName = nameField ? row[nameField] : '';
    const rowId = idField ? row[idField] : '';
    const displayName = rowName || rowId || '记录';

    if (filledCount > 0) {
      setLookupMessage({ 
        type: 'success', 
        text: `已找到：${displayName}${rowId ? ` / ${rowId}` : ''}，已填充 ${filledCount} 个字段。` 
      });
    } else {
      setLookupMessage({ type: 'warning', text: `已找到：${displayName}，但该记录所有字段均无数据。` });
    }

    // 清空选择器
    setMatchedRows([]);
    setShowRowPicker(false);
  }, [selectedFields, headers]);

  // 选择行（从候选列表中选择）
  const selectRow = useCallback((row: Record<string, string>) => {
    fillRowData(row);
  }, [fillRowData]);

  // 字段管理
  const addField = useCallback(() => {
    const available = numericFields.filter(f => !selectedFields.includes(f));
    if (available.length > 0) {
      const newField = available[0];
      setSelectedFields(prev => {
        return [...prev, newField];
      });
      // 不设置默认值，让字段保持未填写状态
    }
  }, [numericFields, selectedFields]);

  const removeField = useCallback((index: number) => {
    setSelectedFields(prev => {
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateField = useCallback((index: number, key: keyof FieldSelection, value: number) => {
    const fieldName = selectedFields[index];
    if (key === 'userValue' && fieldName) {
      setFieldValues(prev => {
        return { ...prev, [fieldName]: value };
      });
    }
  }, [selectedFields]);

  const clearAllFields = useCallback(() => {
    setSelectedFields([]);
    setFieldValues({});
  }, []);

  const restoreRecommended = useCallback(() => {
    setSelectedFields(defaultRecommendedFields);
    const newValues: Record<string, number> = {};
    for (const f of defaultRecommendedFields) {
      // 只保留已存在的值，不设置默认值
      if (fieldValues[f] !== undefined && !isNaN(fieldValues[f])) {
        newValues[f] = fieldValues[f];
      }
    }
    setFieldValues(newValues);
  }, [defaultRecommendedFields, fieldValues]);

  // @deprecated 教育/高考功能已收敛至 legacy 区，排序逻辑见 config/education.ts
  // FIXED_SUBJECT_ORDER 从 config/education.ts 导入，为 legacy behavior

  // 计算各字段的百分位（使用 parseSummary 传入的 analysisRole 判断 rank 方向）
  const rawStats = useMemo(() => {
    return selections.map(s => {
      const result = extractFieldValues(rows, s.field);
      const stats = computeStats(result.values, result.truncatedRows);

      if (!stats) {
        return { field: s.field, userValue: s.userValue, percentile: 0, max: 0, min: 0, mean: 0, median: 0, count: 0 };
      }

      // 百分位方向由字段的 metricDirection 决定（lower_is_better 时取低位百分位更优），
      // 不再通过旧 role 名（rank）推断。
      const isLowerBetter = getMetricDirection(s.field) === 'lower_is_better';
      const percentile = computePercentile(result.values, s.userValue, isLowerBetter);

      return { field: s.field, userValue: s.userValue, percentile, max: stats.max, min: stats.min, mean: stats.mean, median: stats.median, count: stats.count };
    });
  }, [selections, rows, getMetricDirection]);

  const sortedStats = useMemo(() => {
    return [...rawStats].sort((a, b) => b.percentile - a.percentile);
  }, [rawStats]);

  const radarStats = useMemo(() => {
    return [...rawStats].sort((a, b) => {
      const aIdx = FIXED_SUBJECT_ORDER.findIndex(kw => a.field.includes(kw));
      const bIdx = FIXED_SUBJECT_ORDER.findIndex(kw => b.field.includes(kw));
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return selections.findIndex(s => s.field === a.field) - selections.findIndex(s => s.field === b.field);
    });
  }, [rawStats, selections]);

  const validStats = useMemo(() => sortedStats.filter(s => 
    s.userValue !== undefined && 
    Number.isFinite(s.userValue) && 
    isValidPercentile(s.percentile)
  ), [sortedStats]);
  const validRadarStats = useMemo(() => radarStats.filter(s => 
    s.userValue !== undefined && 
    Number.isFinite(s.userValue) && 
    isValidPercentile(s.percentile)
  ), [radarStats]);

  // 条形图高度：按当前容器宽度下每个字段实际换行行数累加。
  // 浏览器宽度变化后 fieldLabelBudget 一起变，高度随之自适应，
  // PC 标签大多一行不会留大空白，手机多行时图表自动增高。
  const barChartHeight = useMemo(
    () => estimateCategoryAxisHeight(
      validStats.map(s => s.field),
      fieldLabelBudget,
      { perLine: 24, lineGap: 8, base: 360, headerReserve: 120 }
    ),
    [validStats, fieldLabelBudget]
  );

  // 条形图
  const barOption: EChartsOption | null = useMemo(() => {
    if (validStats.length === 0) return null;
    const reversed = [...validStats].reverse();
    const fields = reversed.map(s => s.field);
    const percentiles = reversed.map(s => s.percentile);

    // 只有当 token 未被消费时才播放动画
    const shouldAnimate = consumedTokenRef.current !== animationToken;

    return {
      animation: shouldAnimate,
      animationDuration: shouldAnimate ? 700 : 0,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 0, // 数据更新时不播放动画
      title: {
        text: '原表字段相对位置分析',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        padding: compactTooltip ? [6, 10] : undefined,
        textStyle: { fontSize: compactTooltip ? 11 : 13 },
        formatter: (params: any) => {
          const idx = reversed.length - 1 - params[0].dataIndex;
          const s = validStats[idx];
          return `字段：${s.field}<br/>你的输入值：${s.userValue}<br/>百分位：${safeFormatPercent(s.percentile)}`;
        },
      },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value', min: 0, max: 100, name: '百分位 (%)',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category', data: fields,
        axisLabel: {
          fontSize: 11,
          overflow: 'break',
          width: labelPxWidthForBudget(fieldLabelBudget),
          formatter: (value: string) => wrapCategoryLabel(value, fieldLabelBudget),
        },
      },
      series: [{
        type: 'bar',
        data: percentiles.map(v => ({
          value: v,
          itemStyle: {
            color: v >= 70 ? '#10b981' : v >= 40 ? '#3b82f6' : '#f59e0b',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true, position: 'right',
          formatter: (p: any) => {
            const value = extractNumericFromEChartsParam(p.value);
            return safeFormatPercent(value);
          }, fontSize: 11,
        },
        barMaxWidth: 28,
      }],
    } as EChartsOption;
  }, [validStats, viewMode, animationToken, fieldLabelBudget, compactTooltip]);

  // 雷达图
  const radarOption: EChartsOption | null = useMemo(() => {
    if (validRadarStats.length < 2) return null;
    const indicator = validRadarStats.map(s => ({ name: s.field, max: 100 }));
    const data = validRadarStats.map(s => s.percentile);
    // 完整字段清单仅在 PC/宽容器展示；手机 tooltip 只显示悬停字段，避免覆盖图表本体
    const allFieldInfo = compactTooltip
      ? ''
      : validRadarStats
        .map(s => `${s.field}: ${s.userValue} → ${safeFormatPercent(s.percentile)}`)
        .join('<br/>');

    // 只有当 token 未被消费时才播放动画
    const shouldAnimate = consumedTokenRef.current !== animationToken;

    return {
      animation: shouldAnimate,
      animationDuration: shouldAnimate ? 700 : 0,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 0, // 数据更新时不播放动画
      title: {
        text: '原表字段相对位置分析', left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        padding: compactTooltip ? [6, 10] : undefined,
        textStyle: { fontSize: compactTooltip ? 11 : 13 },
        formatter: (params: any) => {
          const idx = params.dataIndex;
          const hovered = validRadarStats[idx];
          const base = `当前悬停字段：${hovered.field}<br/>你的输入值：${hovered.userValue}<br/>百分位：${safeFormatPercent(hovered.percentile)}`;
          if (compactTooltip) return base;
          return `${base}<br/><br/>该图同时包含其他字段，见下方字段列表。<br/>──────────────<br/>${allFieldInfo}`;
        },
      },
      radar: { indicator, radius: '65%', axisName: { fontSize: 11 } },
      series: [{
        type: 'radar',
        data: [{
          value: data, name: '你的百分位',
          areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
        }],
      }],
    } as EChartsOption;
  }, [validRadarStats, viewMode, animationToken, compactTooltip]);

  // 图表渲染后消费 token，阻止后续重复动画
  useEffect(() => {
    const shouldAnimate = consumedTokenRef.current !== animationToken;
    if (shouldAnimate && ((viewMode === 'bar' && barOption) || (viewMode === 'radar' && radarOption))) {
      consumedTokenRef.current = animationToken;
    }
  }, [viewMode, animationToken, barOption, radarOption]);

  const conclusion = useMemo(() => {
    if (validStats.length < 2) return null;
    const advantages = validStats.slice(0, 2);
    const weaknesses = validStats.slice(-2).reverse();
    return { advantages, weaknesses };
  }, [validStats]);

  // 已选字段预览列表（保持分组顺序）
  const selectedFieldsPreview = useMemo(() => {
    const result: string[] = [];
    for (const g of FIELD_GROUP_CONFIG) {
      for (const f of groupedFields[g.key] || []) {
        if (tempSelections.has(f)) result.push(f);
      }
    }
    return result;
  }, [tempSelections, groupedFields]);

  return (
    <div>
      {/* 查找某一行并自动填充：按系统识别的唯一定位字段列匹配 */}
      {rows.length > 0 && (
        <div style={styles.rowSearchContainer}>
          <div style={styles.rowSearchRow}>
            <div style={styles.rowSearchWrap}>
              <svg style={styles.rowSearchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="输入唯一定位字段值查找记录并自动填充"
                value={rowSearchQuery}
                onChange={e => setRowSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    performRowLookup();
                  }
                }}
                style={styles.rowSearchInput}
              />
            </div>
            <button 
              style={styles.rowSearchButton}
              onClick={performRowLookup}
            >
              查找并填充
            </button>
          </div>
          <div style={styles.rowSearchHint}>
            支持基于系统识别的标识字段定位记录
            <HelpPopover content={getHelp('record')} />
          </div>

          {/* 查找反馈消息 */}
          {lookupMessage && (
            <div style={{
              ...styles.lookupMessage,
              ...(lookupMessage.type === 'success' ? styles.lookupMessageSuccess : {}),
              ...(lookupMessage.type === 'error' ? styles.lookupMessageError : {}),
              ...(lookupMessage.type === 'warning' ? styles.lookupMessageWarning : {}),
            }}>
              {lookupMessage.text}
            </div>
          )}

          {/* 空字段弱提示 */}
          {emptyFields.length > 0 && (
            <div style={styles.emptyFieldsHint}>
              以下字段在该记录中无数据：{emptyFields.join('、')}
            </div>
          )}

          {/* 记录选择器 */}
          {showRowPicker && matchedRows.length > 1 && (
            <div style={styles.rowPicker}>
              <div style={styles.rowPickerHeader}>
                <span>找到 {matchedRows.length} 条匹配记录，请选择：</span>
                <button
                  style={styles.rowPickerClose}
                  onClick={() => {
                    setShowRowPicker(false);
                    setMatchedRows([]);
                    setRowSearchQuery('');
                    setLookupMessage(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div style={styles.rowPickerList}>
                {matchedRows.map((row, idx) => {
                  const nameField = headers.find(h => {
                    const lower = h.toLowerCase();
                    return lower.includes('姓名') || lower.includes('名称') || lower === 'name';
                  });
                  const idField = headers.find(h => {
                    const lower = h.toLowerCase();
                    return lower.includes('编号') || lower.includes('编码') || lower.includes('id') || lower.includes('学号');
                  });
                  // 额外分组列（如"班级/部门/地区"），用于区分多条同名记录
                  const groupField = headers.find(h => {
                    const lower = h.toLowerCase();
                    return lower.includes('班级') || lower.includes('部门') || lower.includes('地区') || lower.includes('组别') || lower === 'group';
                  });
                  const name = nameField ? row[nameField] : '';
                  const rowId = idField ? row[idField] : '';
                  const groupLabel = groupField ? row[groupField] : '';

                  return (
                    <div
                      key={idx}
                      style={styles.rowPickerItem}
                      onClick={() => selectRow(row)}
                    >
                      <span style={styles.rowPickerName}>{name}</span>
                      {rowId && <span style={styles.rowPickerId}>{rowId}</span>}
                      {groupLabel && <span style={styles.rowPickerClass}>{groupLabel}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 字段选择列表 */}
      <div style={styles.fieldList}>
        {selections.map((sel, index) => (
          <div key={index} style={styles.fieldItem} className="ofa-field-item">
            <div style={styles.fieldName} className="ofa-field-name">{sel.field}</div>
            <div style={styles.fieldInputWrap}>
              <label style={styles.fieldInputLabel}>
                <span style={styles.fieldLabel}>你的数值</span>
                <input
                  type="number"
                  style={styles.fieldInput}
                  value={sel.userValue !== undefined ? sel.userValue : ''}
                  onChange={e => {
                    const val = e.target.value.trim();
                    if (val === '') {
                      // 清空输入时，删除该字段的值
                      const fieldName = selectedFields[index];
                      setFieldValues(prev => {
                        const next = { ...prev };
                        delete next[fieldName];
                        return next;
                      });
                    } else {
                      const parsed = parseNumericValueLegacy(val);
                      if (parsed !== null) {
                        updateField(index, 'userValue', parsed);
                      }
                    }
                  }}
                  placeholder="输入你的数值"
                />
              </label>
            </div>
            <button style={styles.removeButton} onClick={() => removeField(index)}>×</button>
          </div>
        ))}

        {/* 统一操作按钮行 */}
        <div style={styles.actionRow}>
          <button style={styles.btnPrimary} onClick={openBatchModal}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            批量选择字段
          </button>
          {selections.length > 0 && (
            <button style={styles.btnSecondary} onClick={openPasteModal}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              粘贴整行数据
            </button>
          )}
          <button style={styles.btnSecondary} onClick={addField}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加字段
          </button>
          {selections.length > 0 && (
            <>
              <button style={styles.btnSecondary} onClick={restoreRecommended}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                恢复推荐
              </button>
              <button style={styles.btnDanger} onClick={clearAllFields}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                清空
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
        如果当前表格不是完整全量数据，字段百分位结果可能存在偏差。
        <br />
        百分位口径：根据字段方向计算，高于或等于该值的记录占比（或低于或等于该值的记录占比）/ 该字段有效记录数 × 100%。
      </div>

      {/* 视图切换 */}
      {validStats.length > 0 && (
        <div style={styles.toggleRow}>
          <button
            onClick={() => {
              if (viewMode !== 'bar') {
                setViewMode('bar');
                setAnimationToken(t => t + 1);
              }
            }}
            style={{ ...styles.toggleButton, ...(viewMode === 'bar' ? styles.toggleActive : {}) }}
          >
            条形图
          </button>
          <button
            onClick={() => {
              if (viewMode !== 'radar') {
                setViewMode('radar');
                setAnimationToken(t => t + 1);
              }
            }}
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
        <div ref={barContainerRef} style={{ minHeight: '320px', width: '100%' }}>
          <EChartsWrapper option={barOption} chartTypes={['bar', 'radar']} style={{ height: barChartHeight, width: '100%' }} />
        </div>
      )}
      {viewMode === 'radar' && radarOption && (
        <div ref={barContainerRef} style={{ minHeight: '320px', width: '100%' }}>
          <EChartsWrapper option={radarOption} chartTypes={['bar', 'radar']} style={{ height: '400px', width: '100%' }} />
        </div>
      )}
      
      {/* 图表无法渲染提示 */}
      {selections.length > 0 && validStats.length === 0 && (
        <div style={styles.errorBox}>
          <p style={{ margin: 0, color: '#dc2626' }}>
            当前字段数据中有效数值不足，无法计算百分位。
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#64748b' }}>
            请检查字段值是否已填写，或尝试重新选择字段。
          </p>
        </div>
      )}

      {/* 当前参与分析字段列表 */}
      {validRadarStats.length > 0 && (
        <div style={styles.fieldTagContainer}>
          <span style={styles.fieldTagLabel}>当前参与分析字段：</span>
          {validRadarStats.map(s => (
            <span key={s.field} style={styles.fieldTag}>
              {s.field}（{safeFormatPercent(s.percentile)}）
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
              {conclusion.advantages.map(a => `${a.field}（${safeFormatPercent(a.percentile)}）`).join('、')}
            </span>
          </div>
          <div style={styles.conclusionItem}>
            <span style={styles.conclusionLabel}>相对弱势字段：</span>
            <span style={{ ...styles.conclusionValue, color: '#ef4444' }}>
              {conclusion.weaknesses.map(w => `${w.field}（${safeFormatPercent(w.percentile)}）`).join('、')}
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
        <div style={bs.overlay} onClick={closeBatchModal}>
          <div style={bs.modal} onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div style={bs.header}>
              <div style={bs.headerContent}>
                <h3 style={bs.title}>批量选择分析字段</h3>
                <p style={bs.subtitle}>选择 5-10 个核心字段更适合雷达图展示</p>
              </div>
              <button style={bs.closeBtn} onClick={closeBatchModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 搜索 + 已选数量 + 当前模式 */}
            <div style={bs.searchSection}>
              <div style={bs.searchRow}>
                <div style={bs.searchWrap}>
                  <svg style={bs.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="搜索字段名..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={bs.searchInput}
                  />
                  {searchQuery && (
                    <button style={bs.clearSearch} onClick={() => setSearchQuery('')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <div style={bs.selectedCount}>
                  <span style={bs.countNumber}>{tempSelections.size}</span>
                  <span style={bs.countLabel}> 个字段已选择</span>
                  {tempSelections.size > 10 && (
                    <span style={bs.countWarning}>（建议 5-10 个）</span>
                  )}
                </div>
              </div>

              {/* 当前选择模式提示 */}
              {activeQuickMode && (
                <div style={bs.modeIndicator}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span>当前选择：<strong>{quickModeLabel[activeQuickMode]}</strong></span>
                </div>
              )}
            </div>

            {/* 快捷操作 */}
            <div style={bs.quickSection}>
              <span style={bs.quickLabel}>快捷选择：</span>
              <div style={bs.quickBtnGroup}>
                <button
                  style={{ ...bs.quickBtn, ...(activeQuickMode === 'recommended' ? bs.quickBtnActive : {}) }}
                  onClick={quickSelectRecommended}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  推荐指标
                </button>
                <button
                  style={{ ...bs.quickBtn, ...(activeQuickMode === 'others' ? bs.quickBtnActive : {}) }}
                  onClick={quickSelectOthers}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 9h6v6H9z" />
                  </svg>
                  其他字段
                </button>
                <button style={bs.quickBtnDanger} onClick={quickClearAll}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  清空
                </button>
              </div>
            </div>

            {/* 已选字段预览 */}
            {selectedFieldsPreview.length > 0 && (
              <div style={bs.previewSection}>
                <span style={bs.previewLabel}>已选字段：</span>
                <div style={bs.previewPills}>
                  {selectedFieldsPreview.map(field => (
                    <span key={field} style={bs.pill}>
                      {field}
                      <button style={bs.pillRemove} onClick={() => removeFromTemp(field)}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 字段分组列表 */}
            <div style={bs.body}>
              {FIELD_GROUP_CONFIG.map(group => {
                const fields = groupedFields[group.key] || [];
                const filteredFields = searchQuery
                  ? fields.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()))
                  : fields;

                if (filteredFields.length === 0) return null;

                const isExpanded = expandedGroups.has(group.key);
                const selectedInGroup = filteredFields.filter(f => tempSelections.has(f)).length;

                return (
                  <div key={group.key} style={bs.group}>
                    <div style={bs.groupHeader} onClick={() => toggleGroup(group.key)}>
                      <div style={bs.groupHeaderLeft}>
                        <svg
                          style={{
                            ...bs.groupArrow,
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          }}
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span style={bs.groupTitle}>{group.label}</span>
                        <span style={bs.groupCount}>{filteredFields.length}</span>
                        {selectedInGroup > 0 && (
                          <span style={bs.groupSelectedBadge}>{selectedInGroup} 已选</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={bs.groupContent}>
                        {filteredFields.map(field => {
                          const role = getFieldRole(field);
                          const badge = ROLE_BADGE_MAP[role] || ROLE_BADGE_MAP.unknown;
                          const isSelected = tempSelections.has(field);
                          const isRecommended = RECOMMENDED_ROLES.has(role);

                          return (
                            <div
                              key={field}
                              style={{
                                ...bs.fieldCard,
                                ...(isSelected ? bs.fieldCardSelected : {}),
                              }}
                              onClick={() => toggleTempField(field)}
                            >
                              <div style={{
                                ...bs.fieldCheckbox,
                                ...(isSelected ? {} : bs.fieldCheckboxOff),
                              }}>
                                {isSelected && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </div>
                              <div style={bs.fieldInfo}>
                                <span style={bs.fieldCardName}>{field}</span>
                                <div style={bs.fieldBadges}>
                                  <span style={{
                                    ...bs.badge,
                                    color: badge.color,
                                    background: badge.bg,
                                  }}>
                                    {badge.label}
                                  </span>
                                  {isRecommended && (
                                    <span style={bs.recommendedBadge}>推荐</span>
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
            <div style={bs.footer}>
              <button style={bs.cancelBtn} onClick={closeBatchModal}>取消</button>
              <button style={bs.confirmBtn} onClick={confirmBatchSelection}>
                应用选择（已选 {tempSelections.size} 个）
              </button>
            </div>
          </div>

          {/* Toast 提示 */}
          {toastMessage && (
            <div style={bs.toast}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {toastMessage}
            </div>
          )}
        </div>
      )}

      {/* 粘贴整行成绩弹窗 */}
      {showPasteModal && (
        <div style={pm.overlay} onClick={closePasteModal}>
          <div style={pm.modal} onClick={e => e.stopPropagation()}>
            <div style={pm.header}>
              <h3 style={pm.title}>粘贴整行数据</h3>
              <button style={pm.closeBtn} onClick={closePasteModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={pm.body}>
              <div style={pm.hint}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <span>从 Excel 或 CSV 复制一行数据，粘贴到下方输入框。系统将按字段顺序自动填充。</span>
              </div>

              <div style={pm.fieldOrder}>
                <span style={pm.fieldOrderLabel}>当前字段顺序：</span>
                <div style={pm.fieldOrderList}>
                  {selections.map((s, i) => (
                    <span key={s.field} style={pm.fieldOrderItem}>
                      {i + 1}. {s.field}
                    </span>
                  ))}
                </div>
              </div>

              <textarea
                style={pm.textarea}
                placeholder="粘贴数据，例如：&#10;张三	1班	85	90	88	92	87	537	5	10"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={6}
              />

              {pasteErrors.length > 0 && (
                <div style={pm.errorBox}>
                  <div style={pm.errorTitle}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <span>填充失败，请检查以下问题：</span>
                  </div>
                  <ul style={pm.errorList}>
                    {pasteErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={pm.footer}>
              <button style={pm.cancelBtn} onClick={closePasteModal}>取消</button>
              <button style={pm.confirmBtn} onClick={handlePaste}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                填充字段
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件样式
// ============================================================
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
    flexWrap: 'wrap' as const,
    gap: '12px',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
  },
  fieldName: {
    // flex/min-width 由 .ofa-field-name 控制：桌面限宽 140px 可压缩，
    // 移动端(<=520px)自动占满整行换行，避免长字段被挤成"一两个字符一行"的竖排。
    fontSize: '14px',
    fontWeight: 500,
    color: '#334155',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
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
  // 统一操作按钮行
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '4px',
  },
  btnPrimary: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnSecondary: {
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#fff',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnDanger: {
    padding: '8px 16px',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
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
  warningBox: {
    background: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#92400e',
    marginBottom: '8px',
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
  // 行查找搜索框样式
  rowSearchContainer: {
    marginBottom: '16px',
    padding: '12px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  rowSearchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  rowSearchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  rowSearchIcon: {
    position: 'absolute',
    left: '10px',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  rowSearchInput: {
    width: '100%',
    padding: '8px 12px 8px 36px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  rowSearchButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rowSearchHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#64748b',
    lineHeight: '1.5',
  },
  lookupMessage: {
    marginTop: '10px',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
  },
  lookupMessageSuccess: {
    background: '#d1fae5',
    color: '#065f46',
    border: '1px solid #a7f3d0',
  },
  lookupMessageError: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca',
  },
  lookupMessageWarning: {
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
  },
  emptyFieldsHint: {
    marginTop: '8px',
    padding: '6px 10px',
    background: '#f1f5f9',
    color: '#64748b',
    borderRadius: '6px',
    fontSize: '12px',
  },
  // 记录选择器样式
  rowPicker: {
    marginTop: '12px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  rowPickerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#f1f5f9',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '13px',
    color: '#475569',
    fontWeight: 500,
  },
  rowPickerClose: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    color: '#64748b',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  rowPickerList: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  rowPickerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  rowPickerName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#0f172a',
  },
  rowPickerId: {
    fontSize: '12px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  rowPickerClass: {
    fontSize: '12px',
    color: '#64748b',
  },
};

// ============================================================
// 批量选择弹窗样式
// ============================================================
const bs: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
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
  headerContent: { flex: 1 },
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
    flexShrink: 0,
  },
  searchSection: {
    padding: '12px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: '200px',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '8px 32px 8px 32px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    background: '#f8fafc',
  },
  clearSearch: {
    position: 'absolute',
    right: '6px',
    width: '22px',
    height: '22px',
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
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  countNumber: {
    fontWeight: 600,
    color: '#3b82f6',
    fontSize: '15px',
  },
  countLabel: { color: '#64748b' },
  countWarning: {
    color: '#f59e0b',
    fontSize: '12px',
    marginLeft: '6px',
  },
  // 当前选择模式提示
  modeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#1e40af',
  },
  // 快捷操作
  quickSection: {
    padding: '10px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  quickLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
    flexShrink: 0,
  },
  quickBtnGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  quickBtn: {
    padding: '5px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    color: '#475569',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    transition: 'all 0.15s',
  },
  quickBtnActive: {
    background: '#3b82f6',
    color: '#fff',
    border: '1px solid #3b82f6',
  },
  quickBtnDanger: {
    padding: '5px 10px',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    background: '#fef2f2',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  // 已选字段预览
  previewSection: {
    padding: '10px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    background: '#f8fafc',
  },
  previewLabel: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 500,
  },
  previewPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    background: '#dbeafe',
    color: '#1e40af',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
  },
  pillRemove: {
    width: '14px',
    height: '14px',
    border: 'none',
    background: 'transparent',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#3b82f6',
    padding: 0,
  },
  // 字段列表
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 24px',
  },
  group: { marginBottom: '8px' },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: '#f8fafc',
    borderRadius: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  groupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  groupArrow: {
    color: '#64748b',
    transition: 'transform 0.2s',
  },
  groupTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#334155',
  },
  groupCount: {
    fontSize: '11px',
    color: '#94a3b8',
    background: '#e2e8f0',
    padding: '1px 6px',
    borderRadius: '10px',
  },
  groupSelectedBadge: {
    fontSize: '11px',
    color: '#3b82f6',
    background: '#dbeafe',
    padding: '1px 6px',
    borderRadius: '10px',
    fontWeight: 500,
  },
  groupContent: {
    padding: '6px 0 0 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    background: '#fff',
  },
  fieldCardSelected: {
    border: '1px solid #93c5fd',
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
  fieldCheckboxOff: {
    background: '#fff',
    border: '2px solid #cbd5e1',
  },
  fieldInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
  },
  fieldCardName: {
    fontSize: '13px',
    color: '#1e293b',
    fontWeight: 500,
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  fieldBadges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  badge: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    fontWeight: 500,
  },
  recommendedBadge: {
    fontSize: '10px',
    padding: '1px 5px',
    borderRadius: '3px',
    fontWeight: 500,
    color: '#059669',
    background: '#d1fae5',
  },
  // 底部
  footer: {
    padding: '14px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    flexShrink: 0,
  },
  cancelBtn: {
    padding: '9px 18px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#fff',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  // Toast
  toast: {
    position: 'fixed',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 20px',
    background: '#fff',
    border: '1px solid #d1fae5',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    fontSize: '13px',
    color: '#065f46',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1001,
  },
};

// ============================================================
// 粘贴弹窗样式
// ============================================================
const pm: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
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
    maxWidth: '600px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
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
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  hint: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#1e40af',
    lineHeight: 1.5,
  },
  fieldOrder: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fieldOrderLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
  },
  fieldOrderList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  fieldOrderItem: {
    padding: '4px 10px',
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#475569',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'monospace',
    resize: 'vertical',
    outline: 'none',
    minHeight: '120px',
  },
  errorBox: {
    padding: '12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
  },
  errorTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#dc2626',
    marginBottom: '8px',
  },
  errorList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '12px',
    color: '#991b1b',
    lineHeight: 1.6,
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  cancelBtn: {
    padding: '9px 18px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    background: '#fff',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
};
