import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { parseTableText } from './utils/parseTable';
import { parseTableFile } from './utils/fileImport';
import { usePersistedState } from './hooks/usePersistedState';
import { useParsedTable } from './hooks/useParsedTable';
import { APP_VERSION } from './config/version';
import { APP_NAME } from './config/app';
import UsageGuide from './components/UsageGuide';
import UpdateNotice from './components/UpdateNotice';
import { clearOriginalFieldRadarCache } from './components/charts/OriginalFieldRadar';
import SampleDataSelector from './components/SampleDataSelector';
import { isNumericField as checkIsNumericField } from './engine/analysisEngine';
import { useFilterState } from './hooks/useFilterState';
import { useGroupAnalysis } from './hooks/useGroupAnalysis';
import { useAnalysisDataset } from './hooks/useAnalysisDataset';
import { calculateFieldAnalyticScore } from './utils/tableParser/fieldClassifier';
// v1.8: Lazy load analysis section — 分析引擎 + 图表不在首屏加载
const AnalysisSection = lazy(() => import('./components/AnalysisSection'));
export default function App() {
    const { loadState, save, clear, getDefault } = usePersistedState();
    const [showSampleSelector, setShowSampleSelector] = useState(false);
    // ===== 注入全局动画样式 =====
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .section-animate {
        animation: fadeInUp 0.2s ease-out;
      }
      .stat-card-hover:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .header-btn:hover {
        background: rgba(255,255,255,0.25);
        color: #fff;
      }
      .parse-btn:hover {
        box-shadow: 0 4px 16px rgba(37,99,235,0.4);
      }
      .sample-btn:hover {
        background: #dbeafe;
      }
      .copy-btn:hover {
        background: #dbeafe;
      }
    `;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);
    const savedState = useMemo(() => loadState(), [loadState]);
    // ===== Hooks：解析 / 上下文 / 指标计算 =====
    const { rawText, setRawText, parsedData, setParsedData, parseError, setParseError, parseWarnings, setParseWarnings, fileError, setFileError, parseSummary, setParseSummary, availableSheets, setAvailableSheets, selectedSheet, setSelectedSheet, isParsing, setIsParsing, parseReport, textareaRef, activeTableId, dataVolumeState, // Stage 0A-1: 数据量状态
     } = useParsedTable();
    // ===== 用户交互状态 =====
    const [selectedField, setSelectedField] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [showAllFields, setShowAllFields] = useState(false);
    const [activeChartTab, setActiveChartTab] = useState('histogram');
    const [saveMsg, setSaveMsg] = useState(null);
    const [originalFieldState, setOriginalFieldState] = useState(savedState?.originalFieldRadar ?? { selections: [], viewMode: 'bar' });
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    // ===== Stage 0A-1: 分析能力判断 =====
    const canAnalyze = useMemo(() => {
        return parsedData != null &&
            dataVolumeState != null &&
            !dataVolumeState.isParseTruncated;
    }, [parsedData, dataVolumeState]);
    // ===== v1.3 Hooks：筛选 / 分组 / 导出 =====
    const { filterConditions, setFilterConditions, filterCollapsed, setFilterCollapsed, numericFieldSet, filterResult, filteredParsedData, resetFilter, } = useFilterState(canAnalyze ? parsedData : null, parseSummary, activeTableId);
    // ===== Stage 0A-2: 统一分析数据集 =====
    // 生成稳定的 filterRevision（基于筛选条件序列化）
    const filterRevision = useMemo(() => {
        if (!filterConditions.length)
            return 0;
        const serialized = filterConditions
            .map(c => `${c.field}:${c.operator}:${c.value}`)
            .join('|');
        // 简单哈希转为正整数
        let hash = 0;
        for (let i = 0; i < serialized.length; i++) {
            hash = ((hash << 5) - hash) + serialized.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }, [filterConditions]);
    const { dataset: analysisDataset, confirmDataset, cancelDataset, } = useAnalysisDataset(filteredParsedData, activeTableId, filterRevision);
    const { selectedDimension, setSelectedDimension, availableDimensions, resetGroupAnalysis, } = useGroupAnalysis(analysisDataset?.status === 'ready_full' || analysisDataset?.status === 'ready_sampled' ? filteredParsedData : null, parseSummary);
    // ===== 自动保存 =====
    useEffect(() => {
        save({
            rawText,
            selectedField,
            inputValue,
            showAllFields,
            activeChartTab,
            originalFieldRadar: originalFieldState,
            analysisMode: 'scoreRate',
            filterConditions,
            selectedDimension,
        });
    }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, filterConditions, selectedDimension, save]);
    // ===== 页面加载后恢复保存状态 =====
    useEffect(() => {
        if (savedState?.rawText) {
            setRawText(savedState.rawText);
            setSelectedField(savedState.selectedField ?? '');
            setInputValue(savedState.inputValue ?? '');
            setShowAllFields(savedState.showAllFields ?? false);
            setActiveChartTab(savedState.activeChartTab ?? 'histogram');
            setOriginalFieldState(savedState.originalFieldRadar ?? { selections: [], viewMode: 'bar' });
            setFilterConditions(savedState.filterConditions ?? [{ field: '', operator: 'equals', value: '' }]);
            setSelectedDimension(savedState.selectedDimension ?? '');
        }
    }, []);
    // ===== 字段判断（使用统一分析引擎） =====
    const isNumericField = useCallback((header) => {
        if (!parsedData)
            return false;
        return checkIsNumericField(parsedData.rows, header);
    }, [parsedData]);
    const shouldExclude = useCallback((header) => {
        if (!parseSummary?.fieldTypes)
            return false;
        const meta = parseSummary.fieldTypes.find(f => f.header === header);
        if (!meta)
            return false;
        const score = calculateFieldAnalyticScore(meta);
        return !score.isAnalyzable;
    }, [parseSummary]);
    const getFieldAnalysisRole = useCallback((header) => {
        if (!parseSummary?.fieldTypes)
            return 'unknown';
        const meta = parseSummary.fieldTypes.find(f => f.header === header);
        return meta?.analysisRole || 'unknown';
    }, [parseSummary]);
    const isRecommendedField = useCallback((header) => {
        const role = getFieldAnalysisRole(header);
        return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
    }, [getFieldAnalysisRole]);
    const availableFields = useMemo(() => {
        if (!parsedData)
            return [];
        if (showAllFields) {
            return parsedData.headers;
        }
        const recommended = parsedData.headers.filter(h => isRecommendedField(h) && !shouldExclude(h));
        if (recommended.length === 0 && parsedData.headers.length > 0) {
            const numericCandidates = parsedData.headers.filter(h => {
                const role = getFieldAnalysisRole(h);
                if (role === 'identity' || role === 'textMeta' || role === 'invalid' || role === 'adjustment') {
                    return false;
                }
                return isNumericField(h) && !shouldExclude(h);
            });
            if (numericCandidates.length > 0) {
                return numericCandidates;
            }
        }
        return recommended;
    }, [parsedData, showAllFields, isRecommendedField, shouldExclude, getFieldAnalysisRole, isNumericField]);
    const isFallbackFieldMode = useMemo(() => {
        if (!parsedData || showAllFields)
            return false;
        const recommended = parsedData.headers.filter(h => isRecommendedField(h) && !shouldExclude(h));
        return recommended.length === 0 && availableFields.length > 0;
    }, [parsedData, showAllFields, isRecommendedField, shouldExclude, availableFields]);
    const groupedFields = useMemo(() => {
        if (!parsedData || !showAllFields)
            return null;
        const recommended = [];
        const adjustment = [];
        const identity = [];
        const textMeta = [];
        const others = [];
        for (const header of parsedData.headers) {
            const role = getFieldAnalysisRole(header);
            if (role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore') {
                recommended.push(header);
            }
            else if (role === 'adjustment') {
                adjustment.push(header);
            }
            else if (role === 'identity') {
                identity.push(header);
            }
            else if (role === 'textMeta') {
                textMeta.push(header);
            }
            else {
                others.push(header);
            }
        }
        return { recommended, adjustment, identity, textMeta, others };
    }, [parsedData, showAllFields, getFieldAnalysisRole]);
    // ===== 事件处理 =====
    const handleParse = useCallback(() => {
        if (!rawText.trim()) {
            setParseError('请先粘贴表格数据。');
            setParsedData(null);
            return;
        }
        try {
            const result = parseTableText(rawText);
            setParsedData(result);
            setParseWarnings(result.warnings || []);
            setParseError(null);
            setActiveChartTab('histogram');
        }
        catch (e) {
            setParseError(e instanceof Error ? e.message : '解析失败');
            setParsedData(null);
        }
    }, [rawText, setParsedData, setParseWarnings, setParseError]);
    const handleSave = useCallback(() => {
        save({
            rawText,
            selectedField,
            inputValue,
            showAllFields,
            activeChartTab,
            originalFieldRadar: originalFieldState,
            analysisMode: 'scoreRate',
            filterConditions,
            selectedDimension,
        });
        setSaveMsg('已保存当前输入');
        setTimeout(() => setSaveMsg(null), 2000);
    }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, filterConditions, selectedDimension, save]);
    const handleReset = useCallback(() => {
        const def = getDefault();
        setRawText(def.rawText);
        setSelectedField(def.selectedField);
        setInputValue(def.inputValue);
        setShowAllFields(def.showAllFields);
        setActiveChartTab(def.activeChartTab);
        resetGroupAnalysis();
        resetFilter();
        setOriginalFieldState(def.originalFieldRadar);
        try {
            const result = parseTableText(def.rawText);
            setParsedData(result);
            setParseWarnings(result.warnings || []);
            setParseError(null);
        }
        catch {
            setParsedData(null);
        }
        save(def);
        setSaveMsg('已恢复默认设置');
        setTimeout(() => setSaveMsg(null), 2000);
        setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
    }, [getDefault, save, setRawText, setParsedData, setParseWarnings, setParseError, textareaRef, resetFilter, resetGroupAnalysis]);
    const handleClear = useCallback(() => {
        clear();
        clearOriginalFieldRadarCache();
        setRawText('');
        setParsedData(null);
        setParseError(null);
        setParseWarnings([]);
        setSelectedField('');
        setInputValue('');
        setShowAllFields(false);
        resetGroupAnalysis();
        resetFilter();
        setActiveChartTab('histogram');
        setOriginalFieldState({ selections: [], viewMode: 'bar' });
        setSaveMsg('已清空数据');
        setTimeout(() => setSaveMsg(null), 2000);
    }, [clear, setRawText, setParsedData, setParseError, setParseWarnings, resetFilter, resetGroupAnalysis]);
    const handleFillSample = useCallback(() => {
        setShowSampleSelector(true);
    }, []);
    const handleLoadSampleDataset = useCallback((dataset) => {
        if (rawText.trim() && !window.confirm('当前输入会被示例数据覆盖，是否继续？'))
            return;
        clearOriginalFieldRadarCache();
        setOriginalFieldState({ selections: [], viewMode: 'bar' });
        setSelectedField('');
        setInputValue('');
        resetGroupAnalysis();
        resetFilter();
        setActiveChartTab('histogram');
        setParseSummary(null);
        const text = [
            dataset.headers.join('\t'),
            ...dataset.rows.map(row => dataset.headers.map(h => row[h] ?? '').join('\t'))
        ].join('\n');
        setRawText(text);
        try {
            const result = parseTableText(text);
            setParsedData(result);
            setParseWarnings(result.warnings || []);
            setParseError(null);
            setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
        }
        catch { /* 静默 */ }
    }, [rawText, setRawText, setParsedData, setParseWarnings, setParseError, setParseSummary, textareaRef, resetFilter, resetGroupAnalysis]);
    const handleFileUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setFileError(null);
        setParseSummary(null);
        setAvailableSheets(null);
        setSelectedSheet(null);
        clearOriginalFieldRadarCache();
        setOriginalFieldState({ selections: [], viewMode: 'bar' });
        setIsParsing(true);
        if (file.size > 5 * 1024 * 1024) {
            setTimeout(() => {
                setParseWarnings(['文件较大，解析可能需要几秒，请耐心等待...']);
            }, 100);
        }
        parseTableFile(file)
            .then(result => {
            setParsedData(result);
            setParseWarnings(result.warnings || []);
            setParseError(null);
            setIsParsing(false);
            // Stage 0A-2: 移除旧的 5000 行警告，抽样确认由 useAnalysisDataset 统一处理
            if (result.summary) {
                setParseSummary(result.summary);
                if (result.summary.recommendedField) {
                    setSelectedField(result.summary.recommendedField);
                }
            }
            if (result.availableSheets && result.availableSheets.length > 1) {
                setAvailableSheets(result.availableSheets);
            }
            const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
            setRawText(text);
            setActiveChartTab('histogram');
        })
            .catch(err => {
            setFileError(err instanceof Error ? err.message : '文件解析失败');
            setParsedData(null);
            setParseWarnings([]);
            setParseSummary(null);
            setIsParsing(false);
        });
        e.target.value = '';
    }, [setRawText, setParsedData, setParseWarnings, setParseError, setFileError, setParseSummary, setAvailableSheets, setSelectedSheet, setIsParsing]);
    const handleSheetChange = useCallback((sheetName) => {
        setSelectedSheet(sheetName);
        clearOriginalFieldRadarCache();
        setOriginalFieldState({ selections: [], viewMode: 'bar' });
        if (parsedData && parsedData.reparseSheet) {
            parsedData.reparseSheet(sheetName)
                .then(result => {
                setParsedData(result);
                setParseWarnings(result.warnings || []);
                setParseError(null);
                if (result.summary) {
                    setParseSummary(result.summary);
                    if (result.summary.recommendedField) {
                        setSelectedField(result.summary.recommendedField);
                    }
                }
                const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
                setRawText(text);
            })
                .catch(err => {
                setFileError(err instanceof Error ? err.message : '切换工作表失败');
            });
        }
    }, [parsedData, setRawText, setParsedData, setParseWarnings, setParseError, setFileError, setParseSummary, setSelectedSheet]);
    // ===== 渲染 =====
    return (_jsxs("div", { style: styles.container, children: [_jsxs("header", { style: styles.header, children: [_jsx("h1", { style: styles.title, children: APP_NAME }), _jsx("p", { style: styles.subtitle, children: "\u7C98\u8D34\u8868\u683C\u6570\u636E\uFF0C\u5FEB\u901F\u5206\u6790\u6570\u636E\u5206\u5E03\u3001\u6392\u540D\u4E0E\u76F8\u5BF9\u4F4D\u7F6E" }), _jsxs("div", { style: styles.headerActions, children: [_jsx("button", { className: "header-btn", style: styles.headerButton, onClick: handleSave, children: "\u4FDD\u5B58\u5F53\u524D\u8F93\u5165" }), _jsx("button", { className: "header-btn", style: styles.headerButton, onClick: () => { if (window.confirm('确定恢复默认设置？当前输入会被覆盖。'))
                                    handleReset(); }, children: "\u6062\u590D\u9ED8\u8BA4" }), _jsx("button", { className: "header-btn", style: { ...styles.headerButton, color: '#fca5a5' }, onClick: () => { if (window.confirm('确定清空所有数据？'))
                                    handleClear(); }, children: "\u6E05\u7A7A\u6570\u636E" })] }), saveMsg && _jsx("p", { style: styles.saveMsg, children: saveMsg })] }), _jsxs("main", { style: styles.main, children: [_jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u6570\u636E\u8F93\u5165" }), _jsx(UsageGuide, {}), _jsx(UpdateNotice, {}), _jsx("p", { style: styles.hint, children: "\u5EFA\u8BAE\u76F4\u63A5\u4ECE Excel \u590D\u5236\u6574\u5757\u8868\u683C\u540E\u7C98\u8D34\u5230\u4E0B\u65B9\u6587\u672C\u6846\u4E2D\u3002" }), _jsx("p", { style: styles.rowLimitHint, children: "\u5EFA\u8BAE\u5355\u6B21\u7C98\u8D34\u6570\u636E\u91CF\u4E0D\u8D85\u8FC7 2 \u4E07\u884C\u3002\u6570\u636E\u91CF\u8FC7\u5927\u65F6\uFF0C\u6D4F\u89C8\u5668\u53EF\u80FD\u51FA\u73B0\u5361\u987F\u3002" }), _jsxs("div", { style: styles.fileUploadRow, children: [_jsxs("label", { style: styles.fileUploadLabel, children: [_jsx("input", { type: "file", accept: ".csv,.xlsx,.xls", style: styles.fileInput, onChange: handleFileUpload }), _jsx("span", { style: styles.fileUploadButton, children: "\u4E0A\u4F20 CSV / Excel \u6587\u4EF6" })] }), _jsx("span", { style: styles.fileUploadNote, children: "\u6587\u4EF6\u53EA\u5728\u6D4F\u89C8\u5668\u672C\u5730\u89E3\u6790\uFF0C\u4E0D\u4E0A\u4F20\u670D\u52A1\u5668\u3002" })] }), _jsx(SampleDataSelector, { isOpen: showSampleSelector, onSelect: handleLoadSampleDataset, onClose: () => setShowSampleSelector(false) }), _jsx("textarea", { ref: textareaRef, style: styles.textarea, placeholder: "\u7C98\u8D34\u8868\u683C\u6570\u636E\n\u7B2C\u4E00\u884C\u4E3A\u5B57\u6BB5\u540D\uFF0C\u540E\u7EED\u884C\u4E3A\u6570\u636E\n\u652F\u6301 Tab\u3001\u9017\u53F7\u3001\u591A\u7A7A\u683C\u5206\u9694", value: rawText, onChange: e => setRawText(e.target.value), rows: 8 }), _jsxs("div", { style: styles.parseRow, children: [_jsx("button", { className: "parse-btn", style: styles.parseButton, onClick: handleParse, children: "\u89E3\u6790\u6570\u636E" }), _jsx("button", { className: "sample-btn", style: styles.sampleButton, onClick: handleFillSample, children: "\u586B\u5165\u793A\u4F8B\u6570\u636E" })] }), parseError && _jsx("p", { style: styles.error, children: parseError }), fileError && _jsx("p", { style: styles.error, children: fileError }), isParsing && _jsx("p", { style: styles.loading, children: "\u6B63\u5728\u89E3\u6790\u6587\u4EF6..." }), parseWarnings.map((w, i) => (_jsx("p", { style: styles.warning, children: w }, i)))] }), !parsedData && !parseError && (_jsx("p", { style: styles.emptyHint, children: "\u8BF7\u5148\u7C98\u8D34\u8868\u683C\u6570\u636E\u3002" })), parsedData && dataVolumeState?.isParseTruncated && (_jsxs("section", { style: { ...styles.card, marginTop: '20px', borderColor: '#f59e0b', backgroundColor: '#fef3c7' }, children: [_jsx("h3", { style: { margin: '0 0 12px', color: '#92400e', fontSize: '16px' }, children: "\u26A0\uFE0F \u6570\u636E\u91CF\u8D85\u51FA\u5206\u6790\u4E0A\u9650" }), _jsxs("p", { style: { margin: '0 0 8px', color: '#78350f', fontSize: '14px', lineHeight: '1.6' }, children: ["\u5F53\u524D\u6570\u636E\u5305\u542B ", _jsx("strong", { children: dataVolumeState.rawRowCount.toLocaleString() }), " \u884C\uFF0C\u8D85\u51FA\u7CFB\u7EDF\u5206\u6790\u4E0A\u9650\uFF0820,000 \u884C\uFF09\u3002"] }), _jsxs("p", { style: { margin: '0 0 8px', color: '#78350f', fontSize: '14px', lineHeight: '1.6' }, children: ["\u5DF2\u89E3\u6790\u524D ", _jsx("strong", { children: dataVolumeState.parsedRowCount.toLocaleString() }), " \u884C\u7528\u4E8E\u6570\u636E\u9884\u89C8\uFF0C\u4F46", _jsx("strong", { children: "\u4E0D\u751F\u6210\u6B63\u5F0F\u5206\u6790\u7ED3\u679C" }), "\u3002"] }), dataVolumeState.parseTruncationWarning && (_jsx("p", { style: { margin: '8px 0 0', color: '#92400e', fontSize: '13px', fontStyle: 'italic' }, children: dataVolumeState.parseTruncationWarning })), _jsx("p", { style: { margin: '12px 0 0', color: '#78350f', fontSize: '13px', fontWeight: '500' }, children: "\u8BF7\u51CF\u5C11\u6570\u636E\u91CF\u540E\u91CD\u65B0\u89E3\u6790\uFF0C\u6216\u8054\u7CFB\u6280\u672F\u652F\u6301\u83B7\u53D6\u4F01\u4E1A\u7248\u5168\u91CF\u5206\u6790\u80FD\u529B\u3002" })] })), parsedData && !dataVolumeState?.isParseTruncated && (_jsx(Suspense, { fallback: _jsx("div", { style: { textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }, children: "\u52A0\u8F7D\u5206\u6790\u5F15\u64CE..." }), children: _jsx(AnalysisSection, { parsedData: parsedData, parseSummary: parseSummary, parseReport: parseReport, filteredParsedData: filteredParsedData, filterResult: filterResult, filterConditions: filterConditions, setFilterConditions: setFilterConditions, filterCollapsed: filterCollapsed, setFilterCollapsed: setFilterCollapsed, numericFieldSet: numericFieldSet, analysisDataset: analysisDataset, confirmDataset: confirmDataset, cancelDataset: cancelDataset, selectedDimension: selectedDimension, setSelectedDimension: setSelectedDimension, availableDimensions: availableDimensions, selectedField: selectedField, setSelectedField: setSelectedField, inputValue: inputValue, setInputValue: setInputValue, showAllFields: showAllFields, setShowAllFields: setShowAllFields, activeChartTab: activeChartTab, setActiveChartTab: setActiveChartTab, originalFieldState: originalFieldState, setOriginalFieldState: setOriginalFieldState, availableSheets: availableSheets, selectedSheet: selectedSheet, handleSheetChange: handleSheetChange, isNumericField: isNumericField, getFieldAnalysisRole: getFieldAnalysisRole, availableFields: availableFields, isFallbackFieldMode: isFallbackFieldMode, groupedFields: groupedFields, analysisExplanationRef: { parsedData, originalFieldState, parseSummary }, showDebugPanel: showDebugPanel, setShowDebugPanel: setShowDebugPanel }) }))] }), _jsxs("footer", { style: styles.footer, children: [_jsxs("div", { style: styles.footerVersion, children: ["\u7248\u672C\uFF1A", APP_VERSION] }), _jsxs("div", { style: styles.footerSection, children: [_jsx("div", { style: styles.footerLabel, children: "\u8BF4\u660E\uFF1A" }), _jsx("p", { style: styles.footerText, children: "\u672C\u5DE5\u5177\u4EC5\u57FA\u4E8E\u7528\u6237\u7C98\u8D34\u7684\u6570\u636E\u8FDB\u884C\u7EDF\u8BA1\u5206\u6790\uFF0C\u4E0D\u4EE3\u8868\u5B98\u65B9\u6392\u540D\u7ED3\u679C\u3002\u82E5\u8F93\u5165\u6570\u636E\u4E0D\u662F\u5B8C\u6574\u5168\u91CF\u6570\u636E\uFF0C\u767E\u5206\u4F4D\u3001\u540D\u6B21\u533A\u95F4\u548C\u56FE\u8868\u7ED3\u679C\u53EF\u80FD\u5931\u771F\u3002" })] }), _jsxs("div", { style: styles.footerSection, children: [_jsx("div", { style: styles.footerLabel, children: "\u9690\u79C1\uFF1A" }), _jsx("p", { style: styles.footerText, children: "\u672C\u5DE5\u5177\u5728\u6D4F\u89C8\u5668\u672C\u5730\u8FD0\u884C\uFF0C\u6570\u636E\u9ED8\u8BA4\u4E0D\u4E0A\u4F20\u670D\u52A1\u5668\u3002\u4FDD\u5B58\u5185\u5BB9\u4EC5\u5B58\u50A8\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u4E2D\u3002\u4E0D\u540C\u7528\u6237\u3001\u4E0D\u540C\u8BBE\u5907\u3001\u4E0D\u540C\u6D4F\u89C8\u5668\u4E4B\u95F4\u7684\u6570\u636E\u4E92\u4E0D\u5171\u4EAB\u3002" })] })] })] }));
}
const styles = {
    container: { minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b', position: 'relative', zIndex: 1 },
    header: { background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 40%, #7c3aed 100%)', color: '#fff', padding: '32px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' },
    title: { margin: '0 0 4px', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em', textShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    subtitle: { margin: '0 0 14px', fontSize: '14px', opacity: 0.9, fontWeight: 400 },
    headerActions: { display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' },
    headerButton: { padding: '4px 12px', background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', backdropFilter: 'blur(4px)' },
    saveMsg: { margin: '8px 0 0', fontSize: '12px', color: '#86efac', fontWeight: 500 },
    main: { maxWidth: '800px', margin: '0 auto', padding: '20px 16px' },
    section: { background: '#fff', borderRadius: '14px', padding: '20px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.04)', transition: 'box-shadow 0.2s, transform 0.2s', border: '1px solid rgba(226, 232, 240, 0.8)' },
    sectionTitle: { margin: '0 0 14px', fontSize: '16px', fontWeight: 600, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' },
    hint: { margin: '0 0 10px', fontSize: '13px', color: '#4338ca', background: 'linear-gradient(135deg, #eef2ff 0%, #f0f7ff 100%)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #6366f1' },
    textarea: { width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s' },
    parseRow: { display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' },
    parseButton: { padding: '10px 24px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.3)', transition: 'all 0.15s' },
    sampleButton: { padding: '10px 24px', background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: '10px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    copyButton: { padding: '4px 12px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s' },
    exportButton: { padding: '4px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px' },
    error: { margin: '8px 0 0', color: '#ef4444', fontSize: '14px' },
    warning: { margin: '8px 0 0', color: '#92400e', fontSize: '13px', background: '#fffbeb', padding: '6px 10px', borderRadius: '6px' },
    loading: { margin: '8px 0 0', color: '#6366f1', fontSize: '14px', fontWeight: 500 },
    errorSection: { border: '1px solid #fecaca', background: '#fef2f2' },
    errorText: { margin: 0, color: '#dc2626', fontSize: '14px', fontWeight: 500 },
    infoRow: { display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' },
    infoLabel: { color: '#64748b', fontSize: '14px' },
    infoValue: { color: '#1e293b', fontWeight: 600, fontSize: '14px' },
    settingsRow: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
    settingItem: { flex: '1 1 200px', minWidth: '180px' },
    settingLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 500 },
    settingActions: { display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' },
    toggleLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', cursor: 'pointer', userSelect: 'none' },
    checkbox: { cursor: 'pointer' },
    select: { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box', outline: 'none' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' },
    statCard: { background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '10px', padding: '12px', textAlign: 'center', transition: 'transform 0.15s, box-shadow 0.15s', border: '1px solid rgba(226, 232, 240, 0.6)' },
    statLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
    statValue: { fontSize: '18px', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' },
    positionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' },
    summaryBox: { background: 'linear-gradient(135deg, #eef2ff 0%, #eff6ff 100%)', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px 16px', fontSize: '14px', lineHeight: 1.7, color: '#4338ca', marginBottom: '16px' },
    positionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' },
    positionItem: { background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '10px', padding: '12px', textAlign: 'center', border: '1px solid rgba(226, 232, 240, 0.6)' },
    positionLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
    positionValue: { fontSize: '15px', fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' },
    positionHighlight: { background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px', textAlign: 'center' },
    positionHighlightLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
    positionHighlightValue: { fontSize: '22px', fontWeight: 700, color: '#6366f1', fontFamily: 'monospace' },
    note: { margin: '8px 0 0', fontSize: '11px', color: '#94a3b8' },
    emptyHint: { textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '14px' },
    emptyChart: { textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' },
    radarSection: { marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' },
    footer: { textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px', borderTop: '1px solid #e2e8f0', marginTop: '16px' },
    footerVersion: { fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '12px' },
    footerSection: { marginBottom: '8px' },
    footerLabel: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '2px' },
    footerText: { margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 },
    rowLimitHint: { margin: '0 0 10px', fontSize: '12px', color: '#92400e', background: '#fffbeb', padding: '6px 12px', borderRadius: '6px', borderLeft: '3px solid #f59e0b' },
    fileUploadRow: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' },
    fileUploadLabel: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer' },
    fileInput: { display: 'none' },
    fileUploadButton: { padding: '8px 16px', background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)', color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' },
    fileUploadNote: { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' },
    summaryItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(226, 232, 240, 0.6)' },
    summaryLabel: { color: '#64748b', fontSize: '12px' },
    summaryValue: { color: '#1e293b', fontWeight: 600, fontSize: '13px' },
    summaryHighlight: { color: '#6366f1' },
    sheetSelector: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
    sheetButton: { padding: '8px 16px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    sheetButtonActive: { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', borderColor: 'transparent' },
    fallbackHint: { margin: '12px 0', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '13px', color: '#92400e' },
};
