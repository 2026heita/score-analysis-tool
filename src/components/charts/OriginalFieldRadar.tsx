import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { extractFieldValues, computeStats, computePercentile, isRankField as checkIsRankField } from '../../engine/analysisEngine';
import { parseNumericValue } from '../../utils/tableParser/numericParser';
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
type QuickMode = 'recommended' | 'totalRank' | 'sectionTotal' | 'courseScore' | null;

const EXCLUDED_DEFAULT = ['名次', '排名', '序号', '编号'];

// 模块级缓存：在组件重新挂载时保留字段选择和数值
// 这是为了解决组件因父组件重渲染或 ReactECharts 导致的意外卸载/重新挂载问题
let _cachedSelectedFields: string[] | null = null;
let _cachedFieldValues: Record<string, number> | null = null;
let _cachedViewMode: 'bar' | 'radar' | null = null;

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

// 本地字段分类函数（基于字段名关键词）
function classifyFieldLocally(header: string): string {
  const headerLower = header.toLowerCase().trim();

  // 1. 未命名字段 → invalid
  if (headerLower.startsWith('未命名字段') || headerLower === '' || /^[\s_\-\.]+$/.test(headerLower)) {
    return 'invalid';
  }

  // 2. 总分相关 → primaryTotal
  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩',
    '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      // 排除纯加分字段
      if (!headerLower.includes('不含加分') && !headerLower.includes('不含优惠')) {
        return 'primaryTotal';
      }
    }
  }

  // 3. 排名相关 → rank
  const RANK_KEYWORDS = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
  for (const kw of RANK_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'rank';
    }
  }

  // 4. 合计相关 → sectionTotal
  const SECTION_TOTAL_KEYWORDS = ['合计', '总计', '小计', '模块合计'];
  for (const kw of SECTION_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'sectionTotal';
    }
  }

  // 5. 加分/扣分 → adjustment
  const BONUS_KEYWORDS = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分'];
  const PENALTY_KEYWORDS = ['扣分'];
  for (const kw of BONUS_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'adjustment';
    }
  }
  for (const kw of PENALTY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'adjustment';
    }
  }

  // 6. 身份字段 → identity
  const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
    '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
  for (const kw of IDENTITY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'identity';
    }
  }

  // 7. 课程成绩 → courseScore（排除已匹配的字段）
  // 如果字段名包含中文字符且是数值字段，认为是课程成绩
  if (/[\u4e00-\u9fa5]/.test(headerLower)) {
    return 'courseScore';
  }

  // 8. 其他 → unknown
  return 'unknown';
}

export default function OriginalFieldRadar({
  headers, rows, isNumericField, getFieldAnalysisRole, excludedKeywords,
  initialSelections, initialViewMode, onStateChange,
}: OriginalFieldRadarProps) {
  // 缓存清理：当 headers 变化时（说明切换了文件或重新解析），清空缓存
  const headersKey = headers.join(',');
  useEffect(() => {
    _cachedSelectedFields = null;
    _cachedFieldValues = null;
    _cachedViewMode = null;
  }, [headersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 分离状态：字段选择（稳定）和用户输入值（频繁变化）
  // 优先使用缓存，其次使用 initialSelections，避免组件重新挂载时状态丢失
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const cached = _cachedSelectedFields;
    if (cached && cached.length > 0) {
      return cached;
    }
    const initial = initialSelections?.map(s => s.field) ?? [];
    return initial;
  });

  const [fieldValues, setFieldValues] = useState<Record<string, number>>(() => {
    const cached = _cachedFieldValues;
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
    const cached = _cachedViewMode;
    if (cached) {
      return cached;
    }
    const initial = initialViewMode ?? 'bar';
    return initial;
  });

  // 关键修复：在渲染时立即同步缓存，而不是在 useLayoutEffect 中
  // 这样即使组件被 ReactECharts 重新挂载，缓存也已更新
  _cachedSelectedFields = selectedFields;
  _cachedFieldValues = { ...fieldValues };
  _cachedViewMode = viewMode;

  // 动画 token：每次切换 viewMode 时递增，驱动 shouldAnimate
  const [animationToken, setAnimationToken] = useState(0);
  // 已消费的 token，消费后 shouldAnimate 变为 false
  const consumedTokenRef = useRef<number | null>(null);

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
    _cachedSelectedFields = selectedFields;
  }, [selectedFields]);

  useLayoutEffect(() => {
    _cachedFieldValues = { ...fieldValues };
  }, [fieldValues]);

  useLayoutEffect(() => {
    _cachedViewMode = viewMode;
  }, [viewMode]);

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
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [matchedStudents, setMatchedStudents] = useState<Record<string, string>[]>([]);
  const [showStudentPicker, setShowStudentPicker] = useState(false);

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

  // 获取字段角色的辅助函数（优先使用传入的函数，否则使用本地分类）
  const getFieldRole = useCallback((header: string): string => {
    if (getFieldAnalysisRole) {
      const role = getFieldAnalysisRole(header);
      // 如果返回的不是 'unknown'，使用传入的函数结果
      if (role !== 'unknown') return role;
    }
    // 否则使用本地分类
    return classifyFieldLocally(header);
  }, [getFieldAnalysisRole]);

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

  // 默认推荐字段（最多 12 个高优先级字段）
  const defaultRecommendedFields = useMemo(() => {
    const result: string[] = [];
    const priorityOrder = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'];
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
    showToast(`已选择 ${fields.length} 个推荐字段`);
  }, [defaultRecommendedFields, showToast]);

  const quickSelectTotalAndRank = useCallback(() => {
    const fields = numericFields.filter(f => {
      const role = getFieldRole(f);
      return role === 'primaryTotal' || role === 'rank';
    });
    if (fields.length === 0) {
      showToast('当前表格没有匹配的总分/排名字段');
      return;
    }
    setTempSelections(new Set(fields));
    setActiveQuickMode('totalRank');
    showToast(`已选择 ${fields.length} 个总分/排名字段`);
  }, [numericFields, getFieldRole, showToast]);

  const quickSelectSectionTotal = useCallback(() => {
    const fields = groupedFields['sectionTotal'] || [];
    if (fields.length === 0) {
      showToast('当前表格没有匹配的模块合计字段');
      return;
    }
    setTempSelections(new Set(fields));
    setActiveQuickMode('sectionTotal');
    showToast(`已选择 ${fields.length} 个模块合计字段`);
  }, [groupedFields, showToast]);

  const quickSelectCourseScore = useCallback(() => {
    const fields = groupedFields['courseScore'] || [];
    if (fields.length === 0) {
      showToast('当前表格没有匹配的课程成绩字段');
      return;
    }
    setTempSelections(new Set(fields));
    setActiveQuickMode('courseScore');
    showToast(`已选择 ${fields.length} 个课程成绩字段`);
  }, [groupedFields, showToast]);

  const quickClearAll = useCallback(() => {
    setTempSelections(new Set());
    setActiveQuickMode(null);
    showToast('已清空所有选择');
  }, [showToast]);

  // 快捷模式标签
  const quickModeLabel: Record<string, string> = {
    recommended: '推荐字段',
    totalRank: '总分 + 排名',
    sectionTotal: '模块合计',
    courseScore: '课程成绩',
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
      const numValue = parseFloat(value);

      // 如果当前索引对应一个已选字段
      if (i < selections.length) {
        const field = selections[i].field;
        if (isNaN(numValue)) {
          errors.push(`${field}: "${value}" 不是有效数字`);
        } else {
          matchedFields.push({ field, value: numValue });
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

  // 查找并填充学生数据（点击按钮或回车触发）
  const performStudentLookup = useCallback(() => {
    const query = studentSearchQuery.trim();
    if (!query) {
      setLookupMessage({ type: 'warning', text: '请输入姓名或学号' });
      return;
    }

    // 查找姓名和学号字段
    const nameField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('姓名') || lower.includes('学生姓名');
    });
    const studentIdField = headers.find(h => {
      const lower = h.toLowerCase();
      return lower.includes('学号') || lower.includes('考生号') || lower.includes('考号') || lower.includes('准考证号');
    });

    if (!nameField && !studentIdField) {
      setLookupMessage({ type: 'error', text: '未找到姓名或学号字段' });
      return;
    }

    const queryLower = query.toLowerCase();

    // 优先级1：学号精确匹配
    if (studentIdField) {
      const exactIdMatch = rows.filter(row => {
        const id = (row[studentIdField] || '').trim();
        return id.toLowerCase() === queryLower;
      });
      if (exactIdMatch.length === 1) {
        fillStudentData(exactIdMatch[0]);
        return;
      } else if (exactIdMatch.length > 1) {
        setMatchedStudents(exactIdMatch);
        setShowStudentPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${exactIdMatch.length} 个相同学号的学生，请选择` });
        return;
      }
    }

    // 优先级2：姓名精确匹配
    if (nameField) {
      const exactNameMatch = rows.filter(row => {
        const name = (row[nameField] || '').trim();
        return name.toLowerCase() === queryLower;
      });
      if (exactNameMatch.length === 1) {
        fillStudentData(exactNameMatch[0]);
        return;
      } else if (exactNameMatch.length > 1) {
        setMatchedStudents(exactNameMatch);
        setShowStudentPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${exactNameMatch.length} 个同名学生，请选择` });
        return;
      }
    }

    // 优先级3：姓名模糊匹配
    if (nameField) {
      const fuzzyNameMatch = rows.filter(row => {
        const name = (row[nameField] || '').trim().toLowerCase();
        return name.includes(queryLower);
      });
      if (fuzzyNameMatch.length === 1) {
        fillStudentData(fuzzyNameMatch[0]);
        return;
      } else if (fuzzyNameMatch.length > 1) {
        setMatchedStudents(fuzzyNameMatch);
        setShowStudentPicker(true);
        setLookupMessage({ type: 'warning', text: `找到 ${fuzzyNameMatch.length} 个匹配学生，请选择` });
        return;
      }
    }

    // 未找到
    setLookupMessage({ type: 'error', text: '未找到匹配学生，请检查姓名或学号。' });
    setMatchedStudents([]);
    setShowStudentPicker(false);
  }, [studentSearchQuery, headers, rows]);

  // 填充学生数据（只更新 fieldValues，不修改 selectedFields）
  const fillStudentData = useCallback((studentRow: Record<string, string>) => {
    const updates: Record<string, number> = {};
    const emptyFieldsList: string[] = [];

    for (const field of selectedFields) {
      const rawValue = studentRow[field];
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
    const nameField = headers.find(h => h.toLowerCase().includes('姓名'));
    const studentIdField = headers.find(h => h.toLowerCase().includes('学号') || h.toLowerCase().includes('考号'));
    const studentName = nameField ? studentRow[nameField] : '';
    const studentId = studentIdField ? studentRow[studentIdField] : '';
    const displayName = studentName || studentId || '学生';

    if (filledCount > 0) {
      setLookupMessage({ 
        type: 'success', 
        text: `已找到：${displayName}${studentId ? ` / ${studentId}` : ''}，已填充 ${filledCount} 个字段。` 
      });
    } else {
      setLookupMessage({ type: 'warning', text: `已找到：${displayName}，但该学生所有字段均无数据。` });
    }

    // 清空选择器
    setMatchedStudents([]);
    setShowStudentPicker(false);
  }, [selectedFields, headers]);

  // 选择学生（从候选列表中选择）
  const selectStudent = useCallback((student: Record<string, string>) => {
    fillStudentData(student);
  }, [fillStudentData]);

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

  // 固定字段顺序
  const FIXED_SUBJECT_ORDER = [
    '总分', '总分（不含加分）',
    '语文', '数学', '英语', '外语',
    '物理', '化学', '生物', '政治', '历史', '地理',
  ];

  // 计算各字段的百分位（使用统一分析引擎）
  const rawStats = useMemo(() => {
    return selections.map(s => {
      const result = extractFieldValues(rows, s.field);
      const stats = computeStats(result.values, result.truncatedRows);

      if (!stats) {
        return { field: s.field, userValue: s.userValue, percentile: 0, max: 0, min: 0, mean: 0, median: 0, count: 0 };
      }

      // 使用统一分析引擎的百分位计算和 rank 判断
      const percentile = computePercentile(result.values, s.userValue, checkIsRankField(s.field));

      return { field: s.field, userValue: s.userValue, percentile, max: stats.max, min: stats.min, mean: stats.mean, median: stats.median, count: stats.count };
    });
  }, [selections, rows]);

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

  const validStats = useMemo(() => sortedStats.filter(s => s.userValue !== undefined && Number.isFinite(s.userValue)), [sortedStats]);
  const validRadarStats = useMemo(() => radarStats.filter(s => s.userValue !== undefined && Number.isFinite(s.userValue)), [radarStats]);

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
        formatter: (params: any) => {
          const idx = reversed.length - 1 - params[0].dataIndex;
          const s = validStats[idx];
          return `字段：${s.field}<br/>你的输入值：${s.userValue}<br/>百分位：${s.percentile.toFixed(1)}%`;
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
        axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' },
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
          formatter: (p: any) => `${p.value.toFixed(1)}%`, fontSize: 11,
        },
        barMaxWidth: 28,
      }],
    } as EChartsOption;
  }, [validStats, viewMode, animationToken]);

  // 雷达图
  const radarOption: EChartsOption | null = useMemo(() => {
    if (validRadarStats.length < 2) return null;
    const indicator = validRadarStats.map(s => ({ name: s.field, max: 100 }));
    const data = validRadarStats.map(s => s.percentile);
    const allFieldInfo = validRadarStats
      .map(s => `${s.field}: ${s.userValue} → ${s.percentile.toFixed(1)}%`)
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
        formatter: (params: any) => {
          const idx = params.dataIndex;
          const hovered = validRadarStats[idx];
          return `当前悬停字段：${hovered.field}<br/>你的输入值：${hovered.userValue}<br/>百分位：${hovered.percentile.toFixed(1)}%<br/><br/>该图同时包含其他字段，见下方字段列表。<br/>──────────────<br/>${allFieldInfo}`;
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
  }, [validRadarStats, viewMode, animationToken]);

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
      {/* 学生搜索框 */}
      {rows.length > 0 && (
        <div style={styles.studentSearchContainer}>
          <div style={styles.studentSearchRow}>
            <div style={styles.studentSearchWrap}>
              <svg style={styles.studentSearchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="输入姓名或学号查找并自动填充"
                value={studentSearchQuery}
                onChange={e => setStudentSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    performStudentLookup();
                  }
                }}
                style={styles.studentSearchInput}
              />
            </div>
            <button 
              style={styles.studentSearchButton}
              onClick={performStudentLookup}
            >
              查找并填充
            </button>
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
              以下字段在该学生中无数据：{emptyFields.join('、')}
            </div>
          )}

          {/* 学生选择器 */}
          {showStudentPicker && matchedStudents.length > 1 && (
            <div style={styles.studentPicker}>
              <div style={styles.studentPickerHeader}>
                <span>找到 {matchedStudents.length} 个匹配学生，请选择：</span>
                <button
                  style={styles.studentPickerClose}
                  onClick={() => {
                    setShowStudentPicker(false);
                    setMatchedStudents([]);
                    setStudentSearchQuery('');
                    setLookupMessage(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div style={styles.studentPickerList}>
                {matchedStudents.map((student, idx) => {
                  const nameField = headers.find(h => h.toLowerCase().includes('姓名'));
                  const studentIdField = headers.find(h => h.toLowerCase().includes('学号'));
                  const classField = headers.find(h => h.toLowerCase().includes('班级'));
                  const name = nameField ? student[nameField] : '';
                  const studentId = studentIdField ? student[studentIdField] : '';
                  const className = classField ? student[classField] : '';

                  return (
                    <div
                      key={idx}
                      style={styles.studentPickerItem}
                      onClick={() => selectStudent(student)}
                    >
                      <span style={styles.studentPickerName}>{name}</span>
                      {studentId && <span style={styles.studentPickerId}>{studentId}</span>}
                      {className && <span style={styles.studentPickerClass}>{className}</span>}
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
          <div key={index} style={styles.fieldItem}>
            <div style={styles.fieldName}>{sel.field}</div>
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
                      const num = parseFloat(val);
                      if (!isNaN(num)) {
                        updateField(index, 'userValue', num);
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
              粘贴整行成绩
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
        如果当前表格不是完整全量数据，字段百分位可能失真。
        <br />
        百分位口径：低于该值人数 / 有效数值数量 × 100%。
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
        <div style={{ minHeight: '320px', width: '100%' }}>
          <ReactECharts option={barOption} style={{ height: Math.max(320, validStats.length * 40 + 80), width: '100%' }} />
        </div>
      )}
      {viewMode === 'radar' && radarOption && (
        <div style={{ minHeight: '320px', width: '100%' }}>
          <ReactECharts option={radarOption} style={{ height: '400px', width: '100%' }} />
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
                  推荐字段
                </button>
                <button
                  style={{ ...bs.quickBtn, ...(activeQuickMode === 'totalRank' ? bs.quickBtnActive : {}) }}
                  onClick={quickSelectTotalAndRank}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20V10M18 20V4M6 20v-4" />
                  </svg>
                  总分+排名
                </button>
                <button
                  style={{ ...bs.quickBtn, ...(activeQuickMode === 'sectionTotal' ? bs.quickBtnActive : {}) }}
                  onClick={quickSelectSectionTotal}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 9h6v6H9z" />
                  </svg>
                  模块合计
                </button>
                <button
                  style={{ ...bs.quickBtn, ...(activeQuickMode === 'courseScore' ? bs.quickBtnActive : {}) }}
                  onClick={quickSelectCourseScore}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                  课程成绩
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
              <h3 style={pm.title}>粘贴整行成绩</h3>
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
  // 学生搜索框样式
  studentSearchContainer: {
    marginBottom: '16px',
    padding: '12px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  studentSearchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  studentSearchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  studentSearchIcon: {
    position: 'absolute',
    left: '10px',
    color: '#94a3b8',
    pointerEvents: 'none',
  },
  studentSearchInput: {
    width: '100%',
    padding: '8px 12px 8px 36px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  studentSearchButton: {
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
  // 学生选择器样式
  studentPicker: {
    marginTop: '12px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  studentPickerHeader: {
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
  studentPickerClose: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    color: '#64748b',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  studentPickerList: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  studentPickerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  studentPickerName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#0f172a',
  },
  studentPickerId: {
    fontSize: '12px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  studentPickerClass: {
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
