import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { extractFieldValues, computeStats, computePercentile } from '../../engine/analysisEngine';
import { parseNumericValue } from '../../utils/tableParser/numericParser';
import { safeFormatPercent, extractNumericFromEChartsParam, isValidPercentile } from '../../utils/safeFormat';
import EChartsWrapper from './EChartsWrapper';
// @deprecated 教育/高考功能已收敛至 legacy 区
import { FIXED_SUBJECT_ORDER } from '../../config/education';
const EXCLUDED_DEFAULT = ['名次', '排名', '序号', '编号'];
// 模块级缓存：在组件重新挂载时保留字段选择和数值
// 这是为了解决组件因父组件重渲染或 ReactECharts 导致的意外卸载/重新挂载问题
let _cachedSelectedFields = null;
let _cachedFieldValues = null;
let _cachedViewMode = null;
/**
 * 显式清除模块级缓存
 * 应在切换数据集、清空数据、加载示例数据时调用，防止旧数据污染新数据集。
 */
export function clearOriginalFieldRadarCache() {
    _cachedSelectedFields = null;
    _cachedFieldValues = null;
    _cachedViewMode = null;
}
// 字段分组配置：每个字段只属于一个分组
const FIELD_GROUP_CONFIG = [
    { key: 'totalRank', label: '总分 / 排名', roles: ['primaryTotal', 'rank'], defaultExpanded: true },
    { key: 'sectionTotal', label: '模块合计', roles: ['sectionTotal'], defaultExpanded: true },
    { key: 'courseScore', label: '数值字段', roles: ['courseScore'], defaultExpanded: true },
    { key: 'adjustment', label: '加扣分 / 调整项', roles: ['adjustment'], defaultExpanded: false },
    { key: 'identity', label: '身份信息', roles: ['identity'], defaultExpanded: false },
    { key: 'other', label: '其他字段', roles: ['textMeta', 'unknown'], defaultExpanded: false },
    { key: 'invalid', label: '无效 / 未命名字段', roles: ['invalid'], defaultExpanded: false },
];
// 字段类型标签映射
const ROLE_BADGE_MAP = {
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
export default function OriginalFieldRadar({ headers, rows, isNumericField, getFieldAnalysisRole, excludedKeywords, initialSelections, initialViewMode, onStateChange, }) {
    // 缓存清理：当 headers 变化时（说明切换了文件或重新解析），清空缓存
    const headersKey = headers.join(',');
    useEffect(() => {
        _cachedSelectedFields = null;
        _cachedFieldValues = null;
        _cachedViewMode = null;
    }, [headersKey]); // eslint-disable-line react-hooks/exhaustive-deps
    // 分离状态：字段选择（稳定）和用户输入值（频繁变化）
    // 优先使用缓存，其次使用 initialSelections，避免组件重新挂载时状态丢失
    const [selectedFields, setSelectedFields] = useState(() => {
        const cached = _cachedSelectedFields;
        if (cached && cached.length > 0) {
            return cached;
        }
        const initial = initialSelections?.map(s => s.field) ?? [];
        return initial;
    });
    const [fieldValues, setFieldValues] = useState(() => {
        const cached = _cachedFieldValues;
        if (cached && Object.keys(cached).length > 0) {
            return cached;
        }
        const values = {};
        initialSelections?.forEach(s => {
            if (s.userValue !== undefined && !isNaN(s.userValue)) {
                values[s.field] = s.userValue;
            }
        });
        return values;
    });
    const [viewMode, setViewMode] = useState(() => {
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
    const consumedTokenRef = useRef(null);
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
    const [tempSelections, setTempSelections] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [activeQuickMode, setActiveQuickMode] = useState(null);
    const [toastMessage, setToastMessage] = useState('');
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteErrors, setPasteErrors] = useState([]);
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [matchedStudents, setMatchedStudents] = useState([]);
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
    // 获取字段角色的辅助函数（仅使用 parseSummary 传入的分类，不做本地推断）
    const getFieldRole = useCallback((header) => {
        if (getFieldAnalysisRole) {
            return getFieldAnalysisRole(header);
        }
        return 'unknown';
    }, [getFieldAnalysisRole]);
    // 按 analysisRole 分组字段，每个字段只属于一个分组
    const groupedFields = useMemo(() => {
        const groups = {};
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
        const result = [];
        const priorityOrder = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'];
        for (const role of priorityOrder) {
            for (const field of numericFields) {
                if (result.length >= 12)
                    break;
                const fieldRole = getFieldRole(field);
                if (fieldRole === role && !result.includes(field)) {
                    result.push(field);
                }
            }
        }
        return result;
    }, [numericFields, getFieldRole]);
    // Toast 提示
    const showToast = useCallback((msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 2000);
    }, []);
    // 打开批量选择弹窗
    const openBatchModal = useCallback(() => {
        const current = new Set(selections.map(s => s.field));
        setTempSelections(current);
        setSearchQuery('');
        setActiveQuickMode(null);
        const expanded = new Set();
        for (const g of FIELD_GROUP_CONFIG) {
            if (g.defaultExpanded)
                expanded.add(g.key);
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
        const ordered = [];
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
    const toggleTempField = useCallback((field) => {
        setActiveQuickMode(null);
        setTempSelections(prev => {
            const next = new Set(prev);
            if (next.has(field))
                next.delete(field);
            else
                next.add(field);
            return next;
        });
    }, []);
    // 从已选预览中移除字段
    const removeFromTemp = useCallback((field) => {
        setActiveQuickMode(null);
        setTempSelections(prev => {
            const next = new Set(prev);
            next.delete(field);
            return next;
        });
    }, []);
    const toggleGroup = useCallback((groupKey) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey))
                next.delete(groupKey);
            else
                next.add(groupKey);
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
            showToast('当前表格没有匹配的数值字段');
            return;
        }
        setTempSelections(new Set(fields));
        setActiveQuickMode('courseScore');
        showToast(`已选择 ${fields.length} 个数值字段`);
    }, [groupedFields, showToast]);
    const quickClearAll = useCallback(() => {
        setTempSelections(new Set());
        setActiveQuickMode(null);
        showToast('已清空所有选择');
    }, [showToast]);
    // 快捷模式标签
    const quickModeLabel = {
        recommended: '推荐字段',
        totalRank: '总分 + 排名',
        sectionTotal: '模块合计',
        courseScore: '数值字段',
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
        const errors = [];
        const matchedFields = [];
        // 尝试匹配字段和数值
        for (let i = 0; i < values.length; i++) {
            const value = values[i].trim();
            const numValue = parseFloat(value);
            // 如果当前索引对应一个已选字段
            if (i < selections.length) {
                const field = selections[i].field;
                if (isNaN(numValue)) {
                    errors.push(`${field}: "${value}" 不是有效数字`);
                }
                else {
                    matchedFields.push({ field, value: numValue });
                }
            }
            else {
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
    const [lookupMessage, setLookupMessage] = useState(null);
    const [emptyFields, setEmptyFields] = useState([]);
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
            }
            else if (exactIdMatch.length > 1) {
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
            }
            else if (exactNameMatch.length > 1) {
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
            }
            else if (fuzzyNameMatch.length > 1) {
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
    const fillStudentData = useCallback((studentRow) => {
        const updates = {};
        const emptyFieldsList = [];
        for (const field of selectedFields) {
            const rawValue = studentRow[field];
            if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
                const parsed = parseNumericValue(rawValue);
                if (parsed.status === 'valid') {
                    updates[field] = parsed.value;
                }
            }
            else {
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
        }
        else {
            setLookupMessage({ type: 'warning', text: `已找到：${displayName}，但该学生所有字段均无数据。` });
        }
        // 清空选择器
        setMatchedStudents([]);
        setShowStudentPicker(false);
    }, [selectedFields, headers]);
    // 选择学生（从候选列表中选择）
    const selectStudent = useCallback((student) => {
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
    const removeField = useCallback((index) => {
        setSelectedFields(prev => {
            return prev.filter((_, i) => i !== index);
        });
    }, []);
    const updateField = useCallback((index, key, value) => {
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
        const newValues = {};
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
            // 使用 parseSummary 的 analysisRole 判断是否为排名字段
            const isRank = getFieldRole(s.field) === 'rank';
            const percentile = computePercentile(result.values, s.userValue, isRank);
            return { field: s.field, userValue: s.userValue, percentile, max: stats.max, min: stats.min, mean: stats.mean, median: stats.median, count: stats.count };
        });
    }, [selections, rows, getFieldRole]);
    const sortedStats = useMemo(() => {
        return [...rawStats].sort((a, b) => b.percentile - a.percentile);
    }, [rawStats]);
    const radarStats = useMemo(() => {
        return [...rawStats].sort((a, b) => {
            const aIdx = FIXED_SUBJECT_ORDER.findIndex(kw => a.field.includes(kw));
            const bIdx = FIXED_SUBJECT_ORDER.findIndex(kw => b.field.includes(kw));
            if (aIdx >= 0 && bIdx >= 0)
                return aIdx - bIdx;
            if (aIdx >= 0)
                return -1;
            if (bIdx >= 0)
                return 1;
            return selections.findIndex(s => s.field === a.field) - selections.findIndex(s => s.field === b.field);
        });
    }, [rawStats, selections]);
    const validStats = useMemo(() => sortedStats.filter(s => s.userValue !== undefined &&
        Number.isFinite(s.userValue) &&
        isValidPercentile(s.percentile)), [sortedStats]);
    const validRadarStats = useMemo(() => radarStats.filter(s => s.userValue !== undefined &&
        Number.isFinite(s.userValue) &&
        isValidPercentile(s.percentile)), [radarStats]);
    // 条形图
    const barOption = useMemo(() => {
        if (validStats.length === 0)
            return null;
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
                formatter: (params) => {
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
                        formatter: (p) => {
                            const value = extractNumericFromEChartsParam(p.value);
                            return safeFormatPercent(value);
                        }, fontSize: 11,
                    },
                    barMaxWidth: 28,
                }],
        };
    }, [validStats, viewMode, animationToken]);
    // 雷达图
    const radarOption = useMemo(() => {
        if (validRadarStats.length < 2)
            return null;
        const indicator = validRadarStats.map(s => ({ name: s.field, max: 100 }));
        const data = validRadarStats.map(s => s.percentile);
        const allFieldInfo = validRadarStats
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
                formatter: (params) => {
                    const idx = params.dataIndex;
                    const hovered = validRadarStats[idx];
                    return `当前悬停字段：${hovered.field}<br/>你的输入值：${hovered.userValue}<br/>百分位：${safeFormatPercent(hovered.percentile)}<br/><br/>该图同时包含其他字段，见下方字段列表。<br/>──────────────<br/>${allFieldInfo}`;
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
        };
    }, [validRadarStats, viewMode, animationToken]);
    // 图表渲染后消费 token，阻止后续重复动画
    useEffect(() => {
        const shouldAnimate = consumedTokenRef.current !== animationToken;
        if (shouldAnimate && ((viewMode === 'bar' && barOption) || (viewMode === 'radar' && radarOption))) {
            consumedTokenRef.current = animationToken;
        }
    }, [viewMode, animationToken, barOption, radarOption]);
    const conclusion = useMemo(() => {
        if (validStats.length < 2)
            return null;
        const advantages = validStats.slice(0, 2);
        const weaknesses = validStats.slice(-2).reverse();
        return { advantages, weaknesses };
    }, [validStats]);
    // 已选字段预览列表（保持分组顺序）
    const selectedFieldsPreview = useMemo(() => {
        const result = [];
        for (const g of FIELD_GROUP_CONFIG) {
            for (const f of groupedFields[g.key] || []) {
                if (tempSelections.has(f))
                    result.push(f);
            }
        }
        return result;
    }, [tempSelections, groupedFields]);
    return (_jsxs("div", { children: [rows.length > 0 && (_jsxs("div", { style: styles.studentSearchContainer, children: [_jsxs("div", { style: styles.studentSearchRow, children: [_jsxs("div", { style: styles.studentSearchWrap, children: [_jsxs("svg", { style: styles.studentSearchIcon, width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("path", { d: "M21 21l-4.35-4.35" })] }), _jsx("input", { type: "text", placeholder: "\u8F93\u5165\u59D3\u540D\u6216\u5B66\u53F7\u67E5\u627E\u5E76\u81EA\u52A8\u586B\u5145", value: studentSearchQuery, onChange: e => setStudentSearchQuery(e.target.value), onKeyDown: e => {
                                            if (e.key === 'Enter') {
                                                performStudentLookup();
                                            }
                                        }, style: styles.studentSearchInput })] }), _jsx("button", { style: styles.studentSearchButton, onClick: performStudentLookup, children: "\u67E5\u627E\u5E76\u586B\u5145" })] }), lookupMessage && (_jsx("div", { style: {
                            ...styles.lookupMessage,
                            ...(lookupMessage.type === 'success' ? styles.lookupMessageSuccess : {}),
                            ...(lookupMessage.type === 'error' ? styles.lookupMessageError : {}),
                            ...(lookupMessage.type === 'warning' ? styles.lookupMessageWarning : {}),
                        }, children: lookupMessage.text })), emptyFields.length > 0 && (_jsxs("div", { style: styles.emptyFieldsHint, children: ["\u4EE5\u4E0B\u5B57\u6BB5\u5728\u8BE5\u5B66\u751F\u4E2D\u65E0\u6570\u636E\uFF1A", emptyFields.join('、')] })), showStudentPicker && matchedStudents.length > 1 && (_jsxs("div", { style: styles.studentPicker, children: [_jsxs("div", { style: styles.studentPickerHeader, children: [_jsxs("span", { children: ["\u627E\u5230 ", matchedStudents.length, " \u4E2A\u5339\u914D\u5B66\u751F\uFF0C\u8BF7\u9009\u62E9\uFF1A"] }), _jsx("button", { style: styles.studentPickerClose, onClick: () => {
                                            setShowStudentPicker(false);
                                            setMatchedStudents([]);
                                            setStudentSearchQuery('');
                                            setLookupMessage(null);
                                        }, children: "\u00D7" })] }), _jsx("div", { style: styles.studentPickerList, children: matchedStudents.map((student, idx) => {
                                    const nameField = headers.find(h => h.toLowerCase().includes('姓名'));
                                    const studentIdField = headers.find(h => h.toLowerCase().includes('学号'));
                                    const classField = headers.find(h => h.toLowerCase().includes('班级'));
                                    const name = nameField ? student[nameField] : '';
                                    const studentId = studentIdField ? student[studentIdField] : '';
                                    const className = classField ? student[classField] : '';
                                    return (_jsxs("div", { style: styles.studentPickerItem, onClick: () => selectStudent(student), children: [_jsx("span", { style: styles.studentPickerName, children: name }), studentId && _jsx("span", { style: styles.studentPickerId, children: studentId }), className && _jsx("span", { style: styles.studentPickerClass, children: className })] }, idx));
                                }) })] }))] })), _jsxs("div", { style: styles.fieldList, children: [selections.map((sel, index) => (_jsxs("div", { style: styles.fieldItem, children: [_jsx("div", { style: styles.fieldName, children: sel.field }), _jsx("div", { style: styles.fieldInputWrap, children: _jsxs("label", { style: styles.fieldInputLabel, children: [_jsx("span", { style: styles.fieldLabel, children: "\u4F60\u7684\u6570\u503C" }), _jsx("input", { type: "number", style: styles.fieldInput, value: sel.userValue !== undefined ? sel.userValue : '', onChange: e => {
                                                const val = e.target.value.trim();
                                                if (val === '') {
                                                    // 清空输入时，删除该字段的值
                                                    const fieldName = selectedFields[index];
                                                    setFieldValues(prev => {
                                                        const next = { ...prev };
                                                        delete next[fieldName];
                                                        return next;
                                                    });
                                                }
                                                else {
                                                    const num = parseFloat(val);
                                                    if (!isNaN(num)) {
                                                        updateField(index, 'userValue', num);
                                                    }
                                                }
                                            }, placeholder: "\u8F93\u5165\u4F60\u7684\u6570\u503C" })] }) }), _jsx("button", { style: styles.removeButton, onClick: () => removeField(index), children: "\u00D7" })] }, index))), _jsxs("div", { style: styles.actionRow, children: [_jsxs("button", { style: styles.btnPrimary, onClick: openBatchModal, children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "3", width: "7", height: "7" }), _jsx("rect", { x: "3", y: "14", width: "7", height: "7" }), _jsx("rect", { x: "14", y: "14", width: "7", height: "7" })] }), "\u6279\u91CF\u9009\u62E9\u5B57\u6BB5"] }), selections.length > 0 && (_jsxs("button", { style: styles.btnSecondary, onClick: openPasteModal, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }) }), "\u7C98\u8D34\u6574\u884C\u6570\u636E"] })), _jsxs("button", { style: styles.btnSecondary, onClick: addField, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M12 5v14M5 12h14" }) }), "\u6DFB\u52A0\u5B57\u6BB5"] }), selections.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("button", { style: styles.btnSecondary, onClick: restoreRecommended, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }) }), "\u6062\u590D\u63A8\u8350"] }), _jsxs("button", { style: styles.btnDanger, onClick: clearAllFields, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" }) }), "\u6E05\u7A7A"] })] }))] })] }), selections.length > 10 && (_jsxs("div", { style: styles.warningBox, children: ["\u5B57\u6BB5\u8FC7\u591A\u53EF\u80FD\u5F71\u54CD\u56FE\u8868\u53EF\u8BFB\u6027\uFF0C\u5EFA\u8BAE\u9009\u62E9 5-10 \u4E2A\u6838\u5FC3\u5B57\u6BB5\u3002\u5F53\u524D\u5DF2\u9009 ", selections.length, " \u4E2A\u5B57\u6BB5\u3002"] })), _jsx("div", { style: styles.noteBox, children: "\u8BE5\u56FE\u8868\u793A\u4F60\u5728\u539F\u8868\u5404\u5B57\u6BB5\u4E2D\u7684\u76F8\u5BF9\u4F4D\u7F6E\uFF0C\u4E0D\u4EE3\u8868\u771F\u5B9E\u5355\u79D1\u5F3A\u5F31\u3002" }), _jsxs("div", { style: styles.noteBox2, children: ["\u96F7\u8FBE\u56FE\u6BCF\u4E2A\u8F74\u4EE3\u8868\u4E00\u4E2A\u5B57\u6BB5\uFF0C\u9F20\u6807\u60AC\u505C\u65F6\u4EC5\u663E\u793A\u5F53\u524D\u5B57\u6BB5\u8BE6\u60C5\u3002", _jsx("br", {}), "\u5982\u679C\u5F53\u524D\u8868\u683C\u4E0D\u662F\u5B8C\u6574\u5168\u91CF\u6570\u636E\uFF0C\u5B57\u6BB5\u767E\u5206\u4F4D\u53EF\u80FD\u5931\u771F\u3002", _jsx("br", {}), "\u767E\u5206\u4F4D\u53E3\u5F84\uFF1A\u4F4E\u4E8E\u8BE5\u503C\u4EBA\u6570 / \u6709\u6548\u6570\u503C\u6570\u91CF \u00D7 100%\u3002"] }), validStats.length > 0 && (_jsxs("div", { style: styles.toggleRow, children: [_jsx("button", { onClick: () => {
                            if (viewMode !== 'bar') {
                                setViewMode('bar');
                                setAnimationToken(t => t + 1);
                            }
                        }, style: { ...styles.toggleButton, ...(viewMode === 'bar' ? styles.toggleActive : {}) }, children: "\u6761\u5F62\u56FE" }), _jsx("button", { onClick: () => {
                            if (viewMode !== 'radar') {
                                setViewMode('radar');
                                setAnimationToken(t => t + 1);
                            }
                        }, disabled: validStats.length < 2, style: {
                            ...styles.toggleButton,
                            ...(viewMode === 'radar' ? styles.toggleActive : {}),
                            ...(validStats.length < 2 ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                        }, children: "\u96F7\u8FBE\u56FE" })] })), viewMode === 'bar' && barOption && (_jsx("div", { style: { minHeight: '320px', width: '100%' }, children: _jsx(EChartsWrapper, { option: barOption, chartTypes: ['bar', 'radar'], style: { height: Math.max(320, validStats.length * 40 + 80), width: '100%' } }) })), viewMode === 'radar' && radarOption && (_jsx("div", { style: { minHeight: '320px', width: '100%' }, children: _jsx(EChartsWrapper, { option: radarOption, chartTypes: ['bar', 'radar'], style: { height: '400px', width: '100%' } }) })), selections.length > 0 && validStats.length === 0 && (_jsxs("div", { style: styles.errorBox, children: [_jsx("p", { style: { margin: 0, color: '#dc2626' }, children: "\u5F53\u524D\u5B57\u6BB5\u6570\u636E\u4E2D\u6709\u6548\u6570\u503C\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u8BA1\u7B97\u767E\u5206\u4F4D\u3002" }), _jsx("p", { style: { margin: '8px 0 0', fontSize: '14px', color: '#64748b' }, children: "\u8BF7\u68C0\u67E5\u5B57\u6BB5\u503C\u662F\u5426\u5DF2\u586B\u5199\uFF0C\u6216\u5C1D\u8BD5\u91CD\u65B0\u9009\u62E9\u5B57\u6BB5\u3002" })] })), validRadarStats.length > 0 && (_jsxs("div", { style: styles.fieldTagContainer, children: [_jsx("span", { style: styles.fieldTagLabel, children: "\u5F53\u524D\u53C2\u4E0E\u5206\u6790\u5B57\u6BB5\uFF1A" }), validRadarStats.map(s => (_jsxs("span", { style: styles.fieldTag, children: [s.field, "\uFF08", safeFormatPercent(s.percentile), "\uFF09"] }, s.field)))] })), conclusion && (_jsxs("div", { style: styles.conclusionBox, children: [_jsxs("div", { style: styles.conclusionItem, children: [_jsx("span", { style: styles.conclusionLabel, children: "\u76F8\u5BF9\u4F18\u52BF\u5B57\u6BB5\uFF1A" }), _jsx("span", { style: { ...styles.conclusionValue, color: '#10b981' }, children: conclusion.advantages.map(a => `${a.field}（${safeFormatPercent(a.percentile)}）`).join('、') })] }), _jsxs("div", { style: styles.conclusionItem, children: [_jsx("span", { style: styles.conclusionLabel, children: "\u76F8\u5BF9\u5F31\u52BF\u5B57\u6BB5\uFF1A" }), _jsx("span", { style: { ...styles.conclusionValue, color: '#ef4444' }, children: conclusion.weaknesses.map(w => `${w.field}（${safeFormatPercent(w.percentile)}）`).join('、') })] })] })), selections.length === 0 && (_jsx("div", { style: styles.emptyHint, children: "\u70B9\u51FB\u4E0A\u65B9\u6309\u94AE\u4ECE\u5DF2\u89E3\u6790\u5B57\u6BB5\u4E2D\u9009\u62E9\uFF0C\u751F\u6210\u539F\u8868\u5B57\u6BB5\u76F8\u5BF9\u4F4D\u7F6E\u5206\u6790\u3002" })), showBatchModal && (_jsxs("div", { style: bs.overlay, onClick: closeBatchModal, children: [_jsxs("div", { style: bs.modal, onClick: e => e.stopPropagation(), children: [_jsxs("div", { style: bs.header, children: [_jsxs("div", { style: bs.headerContent, children: [_jsx("h3", { style: bs.title, children: "\u6279\u91CF\u9009\u62E9\u5206\u6790\u5B57\u6BB5" }), _jsx("p", { style: bs.subtitle, children: "\u9009\u62E9 5-10 \u4E2A\u6838\u5FC3\u5B57\u6BB5\u66F4\u9002\u5408\u96F7\u8FBE\u56FE\u5C55\u793A" })] }), _jsx("button", { style: bs.closeBtn, onClick: closeBatchModal, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) })] }), _jsxs("div", { style: bs.searchSection, children: [_jsxs("div", { style: bs.searchRow, children: [_jsxs("div", { style: bs.searchWrap, children: [_jsxs("svg", { style: bs.searchIcon, width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("path", { d: "M21 21l-4.35-4.35" })] }), _jsx("input", { type: "text", placeholder: "\u641C\u7D22\u5B57\u6BB5\u540D...", value: searchQuery, onChange: e => setSearchQuery(e.target.value), style: bs.searchInput }), searchQuery && (_jsx("button", { style: bs.clearSearch, onClick: () => setSearchQuery(''), children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) }))] }), _jsxs("div", { style: bs.selectedCount, children: [_jsx("span", { style: bs.countNumber, children: tempSelections.size }), _jsx("span", { style: bs.countLabel, children: " \u4E2A\u5B57\u6BB5\u5DF2\u9009\u62E9" }), tempSelections.size > 10 && (_jsx("span", { style: bs.countWarning, children: "\uFF08\u5EFA\u8BAE 5-10 \u4E2A\uFF09" }))] })] }), activeQuickMode && (_jsxs("div", { style: bs.modeIndicator, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#3b82f6", strokeWidth: "2", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) }), _jsxs("span", { children: ["\u5F53\u524D\u9009\u62E9\uFF1A", _jsx("strong", { children: quickModeLabel[activeQuickMode] })] })] }))] }), _jsxs("div", { style: bs.quickSection, children: [_jsx("span", { style: bs.quickLabel, children: "\u5FEB\u6377\u9009\u62E9\uFF1A" }), _jsxs("div", { style: bs.quickBtnGroup, children: [_jsxs("button", { style: { ...bs.quickBtn, ...(activeQuickMode === 'recommended' ? bs.quickBtnActive : {}) }, onClick: quickSelectRecommended, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }) }), "\u63A8\u8350\u5B57\u6BB5"] }), _jsxs("button", { style: { ...bs.quickBtn, ...(activeQuickMode === 'totalRank' ? bs.quickBtnActive : {}) }, onClick: quickSelectTotalAndRank, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M12 20V10M18 20V4M6 20v-4" }) }), "\u603B\u5206+\u6392\u540D"] }), _jsxs("button", { style: { ...bs.quickBtn, ...(activeQuickMode === 'sectionTotal' ? bs.quickBtnActive : {}) }, onClick: quickSelectSectionTotal, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }), _jsx("path", { d: "M9 9h6v6H9z" })] }), "\u6A21\u5757\u5408\u8BA1"] }), _jsxs("button", { style: { ...bs.quickBtn, ...(activeQuickMode === 'courseScore' ? bs.quickBtnActive : {}) }, onClick: quickSelectCourseScore, children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M4 19.5A2.5 2.5 0 016.5 17H20" }), _jsx("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" })] }), "\u6570\u503C\u5B57\u6BB5"] }), _jsxs("button", { style: bs.quickBtnDanger, onClick: quickClearAll, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" }) }), "\u6E05\u7A7A"] })] })] }), selectedFieldsPreview.length > 0 && (_jsxs("div", { style: bs.previewSection, children: [_jsx("span", { style: bs.previewLabel, children: "\u5DF2\u9009\u5B57\u6BB5\uFF1A" }), _jsx("div", { style: bs.previewPills, children: selectedFieldsPreview.map(field => (_jsxs("span", { style: bs.pill, children: [field, _jsx("button", { style: bs.pillRemove, onClick: () => removeFromTemp(field), children: _jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) })] }, field))) })] })), _jsx("div", { style: bs.body, children: FIELD_GROUP_CONFIG.map(group => {
                                    const fields = groupedFields[group.key] || [];
                                    const filteredFields = searchQuery
                                        ? fields.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()))
                                        : fields;
                                    if (filteredFields.length === 0)
                                        return null;
                                    const isExpanded = expandedGroups.has(group.key);
                                    const selectedInGroup = filteredFields.filter(f => tempSelections.has(f)).length;
                                    return (_jsxs("div", { style: bs.group, children: [_jsx("div", { style: bs.groupHeader, onClick: () => toggleGroup(group.key), children: _jsxs("div", { style: bs.groupHeaderLeft, children: [_jsx("svg", { style: {
                                                                ...bs.groupArrow,
                                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                            }, width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M9 18l6-6-6-6" }) }), _jsx("span", { style: bs.groupTitle, children: group.label }), _jsx("span", { style: bs.groupCount, children: filteredFields.length }), selectedInGroup > 0 && (_jsxs("span", { style: bs.groupSelectedBadge, children: [selectedInGroup, " \u5DF2\u9009"] }))] }) }), isExpanded && (_jsx("div", { style: bs.groupContent, children: filteredFields.map(field => {
                                                    const role = getFieldRole(field);
                                                    const badge = ROLE_BADGE_MAP[role] || ROLE_BADGE_MAP.unknown;
                                                    const isSelected = tempSelections.has(field);
                                                    const isRecommended = RECOMMENDED_ROLES.has(role);
                                                    return (_jsxs("div", { style: {
                                                            ...bs.fieldCard,
                                                            ...(isSelected ? bs.fieldCardSelected : {}),
                                                        }, onClick: () => toggleTempField(field), children: [_jsx("div", { style: {
                                                                    ...bs.fieldCheckbox,
                                                                    ...(isSelected ? {} : bs.fieldCheckboxOff),
                                                                }, children: isSelected && (_jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "white", strokeWidth: "3", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) })) }), _jsxs("div", { style: bs.fieldInfo, children: [_jsx("span", { style: bs.fieldCardName, children: field }), _jsxs("div", { style: bs.fieldBadges, children: [_jsx("span", { style: {
                                                                                    ...bs.badge,
                                                                                    color: badge.color,
                                                                                    background: badge.bg,
                                                                                }, children: badge.label }), isRecommended && (_jsx("span", { style: bs.recommendedBadge, children: "\u63A8\u8350" }))] })] })] }, field));
                                                }) }))] }, group.key));
                                }) }), _jsxs("div", { style: bs.footer, children: [_jsx("button", { style: bs.cancelBtn, onClick: closeBatchModal, children: "\u53D6\u6D88" }), _jsxs("button", { style: bs.confirmBtn, onClick: confirmBatchSelection, children: ["\u5E94\u7528\u9009\u62E9\uFF08\u5DF2\u9009 ", tempSelections.size, " \u4E2A\uFF09"] })] })] }), toastMessage && (_jsxs("div", { style: bs.toast, children: [_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "#10b981", strokeWidth: "2", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) }), toastMessage] }))] })), showPasteModal && (_jsx("div", { style: pm.overlay, onClick: closePasteModal, children: _jsxs("div", { style: pm.modal, onClick: e => e.stopPropagation(), children: [_jsxs("div", { style: pm.header, children: [_jsx("h3", { style: pm.title, children: "\u7C98\u8D34\u6574\u884C\u6570\u636E" }), _jsx("button", { style: pm.closeBtn, onClick: closePasteModal, children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M18 6L6 18M6 6l12 12" }) }) })] }), _jsxs("div", { style: pm.body, children: [_jsxs("div", { style: pm.hint, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#3b82f6", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 16v-4M12 8h.01" })] }), _jsx("span", { children: "\u4ECE Excel \u6216 CSV \u590D\u5236\u4E00\u884C\u6570\u636E\uFF0C\u7C98\u8D34\u5230\u4E0B\u65B9\u8F93\u5165\u6846\u3002\u7CFB\u7EDF\u5C06\u6309\u5B57\u6BB5\u987A\u5E8F\u81EA\u52A8\u586B\u5145\u3002" })] }), _jsxs("div", { style: pm.fieldOrder, children: [_jsx("span", { style: pm.fieldOrderLabel, children: "\u5F53\u524D\u5B57\u6BB5\u987A\u5E8F\uFF1A" }), _jsx("div", { style: pm.fieldOrderList, children: selections.map((s, i) => (_jsxs("span", { style: pm.fieldOrderItem, children: [i + 1, ". ", s.field] }, s.field))) })] }), _jsx("textarea", { style: pm.textarea, placeholder: "\u7C98\u8D34\u6570\u636E\uFF0C\u4F8B\u5982\uFF1A\n\u5F20\u4E09\t1\u73ED\t85\t90\t88\t92\t87\t537\t5\t10", value: pasteText, onChange: e => setPasteText(e.target.value), rows: 6 }), pasteErrors.length > 0 && (_jsxs("div", { style: pm.errorBox, children: [_jsxs("div", { style: pm.errorTitle, children: [_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "#dc2626", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 8v4M12 16h.01" })] }), _jsx("span", { children: "\u586B\u5145\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u4EE5\u4E0B\u95EE\u9898\uFF1A" })] }), _jsx("ul", { style: pm.errorList, children: pasteErrors.map((err, i) => (_jsx("li", { children: err }, i))) })] }))] }), _jsxs("div", { style: pm.footer, children: [_jsx("button", { style: pm.cancelBtn, onClick: closePasteModal, children: "\u53D6\u6D88" }), _jsxs("button", { style: pm.confirmBtn, onClick: handlePaste, children: [_jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M20 6L9 17l-5-5" }) }), "\u586B\u5145\u5B57\u6BB5"] })] })] }) }))] }));
}
// ============================================================
// 主组件样式
// ============================================================
const styles = {
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
const bs = {
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
const pm = {
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
