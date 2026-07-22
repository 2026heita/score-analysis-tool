import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * AnalysisSection - v1.8 Lazy loaded analysis component
 *
 * 包含完整的分析 pipeline：orchestrator → metric → export → 所有分析 UI
 * 通过 React.lazy 延迟加载，首屏不加载分析引擎和图表库
 */
import { useMemo, useCallback, useEffect } from 'react';
import { useAnalysisOrchestrator } from '../hooks/useAnalysisOrchestrator';
import { useMetricResult } from '../hooks/useMetricResult';
import { useExportActions } from '../hooks/useExportActions';
import { formatNumber } from '../utils/stats';
import { generateExplanation } from '../utils/analysisExplainer';
import { safeFormatPercent } from '../utils/safeFormat';
import { toHistogramProps, toBoxPlotProps, toCdfProps, toQuartilePieProps } from '../engine/chartAdapter';
import { preloadECharts } from '../utils/echartsSetup';
import { ErrorBoundary } from './ErrorBoundary';
import ChartTabs from './charts/ChartTabs';
import HistogramChart from './charts/HistogramChart';
import BoxPlotChart from './charts/BoxPlotChart';
import CdfChart from './charts/CdfChart';
import QuartilePieChart from './charts/QuartilePieChart';
import RadarAnalysis from './charts/RadarAnalysis';
import ParseReportPanel from './ParseReportPanel';
import AnalysisExplainer from './AnalysisExplainer';
import GeneralDataOverview from './GeneralDataOverview';
import RelationshipAnalysisPanel from './RelationshipAnalysisPanel';
import FilterPanel from './FilterPanel';
import OutlierPanel from './OutlierPanel';
import AnalysisContextHint from './AnalysisContextHint';
import GroupAnalysis from './GroupAnalysis';
import GroupBarChart from './charts/GroupBarChart';
import { DebugPanel } from './DebugPanel';
export default function AnalysisSection(props) {
    const { parsedData, parseSummary, parseReport, filteredParsedData, filterResult, filterConditions, setFilterConditions, filterCollapsed, setFilterCollapsed, numericFieldSet, analysisDataset, confirmDataset, cancelDataset, selectedDimension, setSelectedDimension, availableDimensions, selectedField, setSelectedField, inputValue, setInputValue, showAllFields, setShowAllFields, activeChartTab, setActiveChartTab, originalFieldState, setOriginalFieldState, availableSheets, selectedSheet, handleSheetChange, isNumericField, getFieldAnalysisRole, availableFields, isFallbackFieldMode, groupedFields, analysisExplanationRef, showDebugPanel, setShowDebugPanel, } = props;
    // ===== v1.5 Orchestration：统一调度层 =====
    const { core: { metricResult, correlationResult }, derived: { derivedData }, view: { viewContext }, metricDefs, } = useAnalysisOrchestrator(analysisDataset, parseSummary, selectedField, inputValue, selectedDimension);
    const { stats, position, fieldValues } = useMetricResult(metricResult);
    // v1.9.1: 当 dataset ready 时预加载 echarts 模块（requestIdleCallback，不阻塞渲染）
    useEffect(() => {
        if (metricResult) {
            // 预加载图表区域可能用到的所有 chart type
            preloadECharts(['bar', 'line', 'pie', 'boxplot', 'scatter', 'radar']);
        }
    }, [!!metricResult]);
    // v1.9.1: 缓存 chart props，避免每次 render 重新计算
    const chartProps = useMemo(() => {
        if (!metricResult)
            return null;
        return {
            histogram: toHistogramProps(metricResult),
            boxplot: toBoxPlotProps(metricResult),
            cdf: toCdfProps(metricResult),
            quartile: toQuartilePieProps(metricResult),
        };
    }, [metricResult]);
    const { handleExportFilteredData, handleExportGroupAnalysis, handleExportMetricSummary, } = useExportActions(filteredParsedData, filterResult, viewContext?.groupStats ?? null, metricResult, stats, position, selectedField, analysisDataset?.samplingInfo ?? null);
    // ===== 分析解释派生 =====
    // Stage 0A-2: 使用 analysisDataset.rows 代替 parsedData.rows
    const analysisExplanation = useMemo(() => {
        const { originalFieldState: ofs, parseSummary: ps } = analysisExplanationRef;
        if (!analysisDataset || !ofs?.selections?.length)
            return null;
        // 只有 ready_full 或 ready_sampled 才生成解释
        if (analysisDataset.status !== 'ready_full' && analysisDataset.status !== 'ready_sampled') {
            return null;
        }
        const rankFields = new Set();
        if (ps?.fieldTypes) {
            for (const meta of ps.fieldTypes) {
                if (meta.analysisRole === 'rank') {
                    rankFields.add(meta.header);
                }
            }
        }
        const fieldValues = {};
        const fieldData = {};
        for (const selection of ofs.selections) {
            const { field, userValue } = selection;
            if (!field || userValue === undefined || isNaN(userValue))
                continue;
            fieldValues[field] = userValue;
            // Stage 0A-2: 使用 analysisDataset.rows
            const values = analysisDataset.rows
                .map(row => {
                const val = row[field];
                if (val === undefined || val === '' || val === null)
                    return null;
                const num = parseFloat(val);
                return isNaN(num) ? null : num;
            })
                .filter((v) => v !== null && Number.isFinite(v));
            if (values.length > 0)
                fieldData[field] = values;
        }
        if (Object.keys(fieldValues).length === 0)
            return null;
        return generateExplanation(fieldValues, fieldData, rankFields);
    }, [analysisExplanationRef, analysisDataset]);
    // ===== 计算值 =====
    const inputNum = inputValue ? parseFloat(inputValue) : NaN;
    const hasInputError = inputValue.trim() !== '' && isNaN(inputNum);
    const summaryText = useMemo(() => {
        if (!position || !stats || isNaN(inputNum))
            return '';
        const numStr = formatNumber(inputNum);
        if (position.existsInData) {
            return `你的【${selectedField}】为 ${numStr}。全表 ${position.total} 人中，高于你的人有 ${position.higherCount} 人，与你同分的有 ${position.equalCount} 人。你的名次区间为第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名，约高于 ${safeFormatPercent(position.percentile)} 的有效数据。`;
        }
        return `该值在表中不存在。如果按该值插入全表，估算名次为第 ${position.estimatedRank} 名，约高于 ${safeFormatPercent(position.percentile)} 的有效数据。`;
    }, [position, stats, selectedField, inputNum]);
    // ===== 复制摘要 =====
    const fallbackCopy = useCallback((text, cb) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            cb('已复制分析摘要');
        }
        catch {
            cb('当前浏览器不支持自动复制，请手动复制。');
        }
    }, []);
    const handleCopySummary = useCallback(() => {
        if (!stats || !position || !selectedField)
            return;
        const lines = [];
        lines.push('【数据分析摘要】');
        lines.push('');
        lines.push(`分析字段：${selectedField}`);
        lines.push(`你的数值：${inputValue}`);
        lines.push('');
        lines.push('一、统计指标');
        lines.push(`有效数值：${stats.validCount}`);
        lines.push(`无效/空值：${stats.invalidCount}`);
        lines.push(`最高值：${formatNumber(stats.max)}`);
        lines.push(`最低值：${formatNumber(stats.min)}`);
        lines.push(`平均值：${formatNumber(stats.mean)}`);
        lines.push(`中位数：${formatNumber(stats.median)}`);
        lines.push(`25% 分位：${formatNumber(stats.q25)}`);
        lines.push(`75% 分位：${formatNumber(stats.q75)}`);
        lines.push(`90% 分位：${formatNumber(stats.q90)}`);
        lines.push(`95% 分位：${formatNumber(stats.q95)}`);
        lines.push('');
        lines.push('二、排名定位');
        lines.push(`高于该值人数：${position.higherCount}`);
        lines.push(`等于该值人数：${position.equalCount}`);
        lines.push(`低于该值人数：${position.lowerCount}`);
        if (position.existsInData) {
            lines.push(`名次区间：第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名`);
        }
        else {
            lines.push(`估算名次：第 ${position.estimatedRank} 名`);
            lines.push('该值在表中不存在，名次为插入估算结果。');
        }
        lines.push(`百分位：约高于 ${safeFormatPercent(position.percentile)} 的有效数据`);
        lines.push('');
        lines.push('三、口径说明');
        lines.push('百分位口径：低于该值人数 / 有效数值数量 × 100%。');
        lines.push('同分情况下使用名次区间，不强行给出单一名次。');
        const text = lines.join('\n');
        const setMsg = (msg) => {
            // 使用全局 temp 消息机制
            const el = document.createElement('div');
            el.textContent = msg;
            el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;padding:8px 20px;border-radius:8px;z-index:99999;font-size:14px;';
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => setMsg('已复制分析摘要')).catch(() => fallbackCopy(text, setMsg));
        }
        else {
            fallbackCopy(text, setMsg);
        }
    }, [stats, position, selectedField, inputValue, fallbackCopy]);
    function formatComparisonText(input, ref) {
        if (!Number.isFinite(input) || !Number.isFinite(ref))
            return '-';
        const diff = input - ref;
        if (Math.abs(diff) < 0.005)
            return '持平';
        const absDiff = Number.isInteger(Math.abs(diff)) ? Math.abs(diff).toString() : Math.abs(diff).toFixed(2);
        return diff > 0 ? `高 ${absDiff} 分` : `低 ${absDiff} 分`;
    }
    // 注意：第280行的 Math.abs(diff).toFixed(2) 是安全的，因为前面已经用 Number.isFinite 验证了 input 和 ref
    // ===== 渲染 =====
    return (_jsxs(_Fragment, { children: [availableFields.length === 0 && (_jsxs("section", { style: { ...styles.section, ...styles.errorSection }, children: [_jsx("p", { style: styles.errorText, children: (() => {
                            if (!parsedData.rows || parsedData.rows.length === 0) {
                                return '表格数据为空，请检查是否成功读取到数据行。';
                            }
                            if (!parsedData.headers || parsedData.headers.length === 0) {
                                return '未识别到表头字段，请确认第一行为字段名。';
                            }
                            if (parseSummary?.fieldTypes) {
                                const allInvalid = parseSummary.fieldTypes.every(m => m.analysisRole === 'invalid' || m.analysisRole === 'identity' || m.analysisRole === 'textMeta');
                                if (allInvalid) {
                                    return '已识别字段，但未发现推荐分析字段，请尝试打开"显示全部字段"并手动选择数值字段。';
                                }
                            }
                            return '当前表格没有可分析的数值字段，请尝试打开"显示全部字段"并手动选择。';
                        })() }), _jsx("p", { style: styles.hint, children: "\u5982\u679C\u6587\u4EF6\u5305\u542B\u590D\u6742\u8868\u5934\uFF0C\u5EFA\u8BAE\u4F7F\u7528 Excel \u590D\u5236\u8868\u683C\u540E\u7C98\u8D34\u6587\u672C\u65B9\u5F0F\u3002" })] })), availableFields.length > 0 && (_jsxs(_Fragment, { children: [analysisDataset?.status === 'awaiting_confirmation' && (_jsxs("section", { style: { ...styles.section, ...styles.confirmationDialog }, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u6570\u636E\u91CF\u8F83\u5927\uFF0C\u662F\u5426\u542F\u7528\u62BD\u6837\u5206\u6790\uFF1F" }), _jsxs("div", { style: styles.dialogContent, children: [_jsxs("p", { style: styles.dialogText, children: ["\u5F53\u524D\u7B5B\u9009\u540E\u6570\u636E\u5305\u542B ", _jsx("strong", { children: filteredParsedData?.rows.length ?? 0 }), " \u884C\uFF0C \u5206\u6790\u4E0A\u9650\u4E3A ", _jsx("strong", { children: "5000" }), " \u884C\u3002"] }), _jsxs("p", { style: styles.dialogHint, children: [_jsx("strong", { children: "\u62BD\u6837\u7B97\u6CD5\uFF1A" }), "systematic_even_v1\uFF08\u7B49\u8DDD\u786E\u5B9A\u6027\u62BD\u6837\uFF09"] }), _jsxs("p", { style: styles.dialogHint, children: [_jsx("strong", { children: "\u786E\u5B9A\u6027\uFF1A" }), "\u76F8\u540C\u8F93\u5165\u6570\u636E\u5C06\u5F97\u5230\u76F8\u540C\u7684\u62BD\u6837\u7ED3\u679C"] }), _jsxs("p", { style: styles.dialogWarning, children: [_jsx("strong", { children: "\u6CE8\u610F\uFF1A" }), "\u5982\u679C\u6570\u636E\u5177\u6709\u660E\u663E\u7684\u6709\u5E8F\u6027\u6216\u5468\u671F\u6027\u7279\u5F81\uFF0C\u62BD\u6837\u7ED3\u679C\u53EF\u80FD\u5B58\u5728\u504F\u5DEE\u3002"] })] }), _jsxs("div", { style: styles.dialogActions, children: [_jsx("button", { onClick: () => confirmDataset(analysisDataset.datasetKey), style: styles.confirmBtn, children: "\u786E\u8BA4\u4F7F\u7528\u62BD\u6837\u5206\u6790" }), _jsx("button", { onClick: () => cancelDataset(analysisDataset.datasetKey), style: styles.cancelBtn, children: "\u53D6\u6D88\u5206\u6790" })] })] })), analysisDataset?.status === 'cancelled' && (_jsxs("section", { style: { ...styles.section, ...styles.cancelledSection }, children: [_jsx("p", { style: styles.cancelledText, children: "\u5DF2\u53D6\u6D88\u5206\u6790\u3002\u5F53\u524D\u4E0D\u6267\u884C\u4EFB\u4F55\u7EDF\u8BA1\u8BA1\u7B97\u3002" }), _jsxs("div", { style: styles.dialogActions, children: [_jsx("button", { onClick: () => setFilterCollapsed(false), style: styles.modifyFilterBtn, children: "\u4FEE\u6539\u7B5B\u9009\u6761\u4EF6" }), _jsx("button", { onClick: () => confirmDataset(analysisDataset.datasetKey), style: styles.reconfirmBtn, children: "\u91CD\u65B0\u786E\u8BA4\u62BD\u6837\u5206\u6790" })] })] })), analysisDataset?.status === 'ready_sampled' && analysisDataset.samplingInfo && (_jsxs("section", { style: { ...styles.section, ...styles.samplingInfoBox }, children: [_jsxs("p", { style: styles.samplingInfoText, children: [_jsx("strong", { children: "\u62BD\u6837\u5206\u6790\u6A21\u5F0F" }), "\uFF1A\u5F53\u524D\u7ED3\u679C\u57FA\u4E8E\u6837\u672C\u800C\u975E\u5168\u90E8\u7B5B\u9009\u6570\u636E\u3002"] }), _jsxs("ul", { style: styles.samplingInfoList, children: [_jsxs("li", { children: ["\u7B5B\u9009\u540E\u884C\u6570\uFF1A", analysisDataset.samplingInfo.originalRowCount] }), _jsxs("li", { children: ["\u5B9E\u9645\u5206\u6790\u884C\u6570\uFF1A", analysisDataset.samplingInfo.sampledRowCount] }), _jsxs("li", { children: ["\u62BD\u6837\u7B97\u6CD5\uFF1A", analysisDataset.samplingInfo.algorithm] })] })] })), parseSummary && (_jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u8BC6\u522B\u6458\u8981" }), _jsxs("div", { style: styles.summaryGrid, children: [_jsx(SummaryItem, { label: "\u5DF2\u8BC6\u522B\u4E3B\u8868", value: parseSummary.sheetName }), _jsx(SummaryItem, { label: "\u8BC6\u522B\u5B57\u6BB5", value: `${parseSummary.fieldCount} 个` }), _jsx(SummaryItem, { label: "\u6709\u6548\u6570\u636E\u884C", value: `${parseSummary.validDataRows} 行` }), parseSummary.emptyRows > 0 && _jsx(SummaryItem, { label: "\u8DF3\u8FC7\u7A7A\u884C", value: `${parseSummary.emptyRows} 行` }), parseSummary.summaryRows > 0 && _jsx(SummaryItem, { label: "\u8DF3\u8FC7\u7EDF\u8BA1\u884C", value: `${parseSummary.summaryRows} 行` }), parseSummary.statusRows > 0 && _jsx(SummaryItem, { label: "\u72B6\u6001/\u65E0\u6548\u884C", value: `${parseSummary.statusRows} 行` }), parseSummary.recommendedField && (_jsx(SummaryItem, { label: "\u63A8\u8350\u5206\u6790\u5B57\u6BB5", value: parseSummary.recommendedField, highlight: true }))] })] })), parseReport && (_jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u89E3\u6790\u62A5\u544A" }), _jsx(ParseReportPanel, { report: parseReport })] })), _jsx(ErrorBoundary, { children: _jsx("section", { style: styles.section, children: _jsx(GeneralDataOverview, { headers: analysisDataset?.headers ?? parsedData.headers, rows: analysisDataset?.rows ?? parsedData.rows }) }) }), _jsx(ErrorBoundary, { children: _jsx(RelationshipAnalysisPanel, { correlationResult: correlationResult }) }), availableSheets && availableSheets.length > 1 && (_jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u5DE5\u4F5C\u8868\u9009\u62E9" }), _jsx("div", { style: styles.sheetSelector, children: availableSheets.map(sheet => (_jsx("button", { style: {
                                        ...styles.sheetButton,
                                        ...(selectedSheet === sheet ? styles.sheetButtonActive : {}),
                                        ...(parseSummary?.sheetName === sheet && !selectedSheet ? styles.sheetButtonActive : {}),
                                    }, onClick: () => handleSheetChange(sheet), children: sheet }, sheet))) })] })), _jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u89E3\u6790\u7ED3\u679C" }), _jsxs("div", { style: styles.infoRow, children: [_jsx("span", { style: styles.infoLabel, children: "\u5B57\u6BB5\u6570\uFF1A" }), _jsx("span", { style: styles.infoValue, children: parsedData.headers.length }), _jsx("span", { style: styles.infoLabel, children: "\u6570\u636E\u884C\u6570\uFF1A" }), _jsx("span", { style: styles.infoValue, children: parsedData.rows.length }), filteredParsedData && filterResult && filterResult.filterSummary.activeConditions > 0 && (_jsx("button", { className: "copy-btn", style: styles.exportButton, onClick: handleExportFilteredData, children: "\u5BFC\u51FA\u7B5B\u9009\u540E\u6570\u636E CSV" }))] })] }), _jsx(ErrorBoundary, { children: _jsx(FilterPanel, { headers: parsedData.headers, numericFields: numericFieldSet, conditions: filterConditions, onConditionsChange: setFilterConditions, filterSummary: filterResult?.filterSummary ?? null, collapsed: filterCollapsed, onToggleCollapse: () => setFilterCollapsed(!filterCollapsed) }) }), _jsx(AnalysisContextHint, { originalCount: parsedData.rows.length, filteredCount: filterResult?.filterSummary.filteredCount ?? parsedData.rows.length, activeConditions: filterResult?.filterSummary.activeConditions ?? 0, selectedDimension: selectedDimension, isFilteredEmpty: filterResult ? filterResult.filterSummary.filteredCount === 0 && filterResult.filterSummary.activeConditions > 0 : false }), filterResult?.filterSummary && filterResult.filterSummary.activeConditions > 0 && filterResult.filterSummary.filteredCount === 0 && (_jsx("section", { style: { ...styles.section, ...styles.errorSection }, children: _jsx("p", { style: styles.errorText, children: "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u65E0\u53EF\u5206\u6790\u6570\u636E\uFF0C\u8BF7\u8C03\u6574\u7B5B\u9009\u6761\u4EF6\u540E\u91CD\u8BD5\u3002" }) })), _jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u5206\u6790\u8BBE\u7F6E" }), isFallbackFieldMode && (_jsxs("div", { style: styles.fallbackHint, children: [_jsx("p", { style: { margin: '0 0 4px 0', fontWeight: 500 }, children: "\u7CFB\u7EDF\u672A\u80FD\u81EA\u52A8\u63A8\u8350\u5B57\u6BB5\uFF0C\u4F46\u68C0\u6D4B\u5230\u82E5\u5E72\u6570\u503C\u5B57\u6BB5\uFF0C\u53EF\u624B\u52A8\u9009\u62E9\u540E\u5206\u6790\u3002" }), _jsx("p", { style: { margin: 0, fontSize: '12px', color: '#64748b' }, children: "\u5EFA\u8BAE\u6253\u5F00\"\u663E\u793A\u5168\u90E8\u5B57\u6BB5\"\u4EE5\u67E5\u770B\u5B8C\u6574\u5B57\u6BB5\u5217\u8868\uFF0C\u6216\u5C1D\u8BD5\u7C98\u8D34\u8868\u683C\u6587\u672C\u65B9\u5F0F\u3002" })] })), _jsxs("div", { style: styles.settingsRow, children: [_jsxs("div", { style: styles.settingItem, children: [_jsx("label", { style: styles.settingLabel, children: "\u5206\u6790\u5B57\u6BB5" }), _jsx("select", { style: styles.select, value: selectedField, onChange: e => setSelectedField(e.target.value), children: showAllFields && groupedFields ? (_jsxs(_Fragment, { children: [groupedFields.recommended?.length > 0 && (_jsx("optgroup", { label: "\u63A8\u8350\u5206\u6790\u5B57\u6BB5", children: groupedFields.recommended.map(header => (_jsx("option", { value: header, children: header }, header))) })), groupedFields.adjustment?.length > 0 && (_jsx("optgroup", { label: "\u52A0\u6263\u5206/\u8C03\u6574\u9879", children: groupedFields.adjustment.map(header => (_jsx("option", { value: header, children: header }, header))) })), groupedFields.identity?.length > 0 && (_jsx("optgroup", { label: "\u8EAB\u4EFD\u4FE1\u606F", children: groupedFields.identity.map(header => (_jsx("option", { value: header, children: header }, header))) })), groupedFields.textMeta?.length > 0 && (_jsx("optgroup", { label: "\u6587\u672C/\u5907\u6CE8\u5B57\u6BB5", children: groupedFields.textMeta.map(header => (_jsx("option", { value: header, children: header }, header))) })), groupedFields.others?.length > 0 && (_jsx("optgroup", { label: "\u5176\u4ED6\u5B57\u6BB5", children: groupedFields.others.map(header => (_jsx("option", { value: header, children: header }, header))) }))] })) : (availableFields.map(header => (_jsx("option", { value: header, children: header }, header)))) })] }), _jsxs("div", { style: styles.settingItem, children: [_jsx("label", { style: styles.settingLabel, children: "\u4F60\u7684\u6570\u503C" }), _jsx("input", { type: "number", style: styles.input, placeholder: "\u8F93\u5165\u6570\u503C", value: inputValue, onChange: e => setInputValue(e.target.value) })] }), _jsx("div", { style: styles.settingActions, children: _jsxs("label", { style: styles.toggleLabel, children: [_jsx("input", { type: "checkbox", checked: showAllFields, onChange: e => setShowAllFields(e.target.checked), style: styles.checkbox }), "\u663E\u793A\u5168\u90E8\u5B57\u6BB5"] }) })] }), availableDimensions.length > 0 && (_jsx("div", { style: { ...styles.settingsRow, marginTop: '12px' }, children: _jsxs("div", { style: styles.settingItem, children: [_jsx("label", { style: styles.settingLabel, children: "\u5206\u7EC4\u7EF4\u5EA6\uFF08\u53EF\u9009\uFF09" }), _jsxs("select", { style: styles.select, value: selectedDimension, onChange: e => setSelectedDimension(e.target.value), children: [_jsx("option", { value: "", children: "\u4E0D\u5206\u7EC4" }), availableDimensions.map(dim => (_jsxs("option", { value: dim.header, children: [dim.header, dim.riskLevel === 'warning' ? ' ⚠' : ''] }, dim.header)))] }), (() => {
                                            const selected = availableDimensions.find(d => d.header === selectedDimension);
                                            if (selected?.riskLevel === 'warning') {
                                                return _jsx("p", { style: styles.warning, children: selected.riskHint });
                                            }
                                            return null;
                                        })()] }) })), hasInputError && _jsx("p", { style: styles.error, children: "\u8BF7\u8F93\u5165\u6709\u6548\u6570\u5B57\u3002" }), inputValue === '' && position === null && selectedField && (_jsx("p", { style: styles.hint, children: "\u8BF7\u8F93\u5165\u4F60\u7684\u6570\u503C\u540E\u518D\u67E5\u770B\u6392\u540D\u5B9A\u4F4D\u3002" }))] }), selectedField && stats === null && fieldValues.length === 0 && (_jsx("section", { style: { ...styles.section, ...styles.errorSection }, children: _jsx("p", { style: styles.errorText, children: "\u5F53\u524D\u5B57\u6BB5\u6CA1\u6709\u53EF\u5206\u6790\u7684\u6709\u6548\u6570\u503C\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u5B57\u6BB5\u3002" }) })), stats && (_jsx(ErrorBoundary, { children: _jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u7EDF\u8BA1\u6307\u6807" }), _jsxs("div", { style: styles.statsGrid, children: [_jsx(StatCard, { label: "\u6709\u6548\u6570\u503C", value: stats.validCount.toString() }), _jsx(StatCard, { label: "\u65E0\u6548/\u7A7A\u503C", value: stats.invalidCount.toString() }), _jsx(StatCard, { label: "\u6700\u9AD8", value: formatNumber(stats.max) }), _jsx(StatCard, { label: "\u6700\u4F4E", value: formatNumber(stats.min) }), _jsx(StatCard, { label: "\u5E73\u5747\u503C", value: formatNumber(stats.mean) }), _jsx(StatCard, { label: "\u4E2D\u4F4D\u6570", value: formatNumber(stats.median) }), _jsx(StatCard, { label: "25% \u5206\u4F4D", value: formatNumber(stats.q25) }), _jsx(StatCard, { label: "75% \u5206\u4F4D", value: formatNumber(stats.q75) }), _jsx(StatCard, { label: "90% \u5206\u4F4D", value: formatNumber(stats.q90) }), _jsx(StatCard, { label: "95% \u5206\u4F4D", value: formatNumber(stats.q95) })] })] }) })), position && stats && !isNaN(inputNum) && (_jsx(ErrorBoundary, { children: _jsxs("section", { style: styles.section, children: [_jsxs("div", { style: styles.positionHeader, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u6392\u540D\u5B9A\u4F4D" }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { className: "copy-btn", style: styles.copyButton, onClick: handleCopySummary, children: "\u590D\u5236\u5206\u6790\u6458\u8981" }), _jsx("button", { className: "copy-btn", style: styles.exportButton, disabled: !stats && !position, onClick: handleExportMetricSummary, children: "\u5BFC\u51FA\u6307\u6807\u6458\u8981 CSV" })] })] }), summaryText && _jsx("div", { style: styles.summaryBox, children: summaryText }), _jsxs("div", { style: styles.positionGrid, children: [_jsx(PositionItem, { label: "\u4E0E\u5E73\u5747\u503C\u5BF9\u6BD4", value: formatComparisonText(inputNum, stats.mean) }), _jsx(PositionItem, { label: "\u4E0E\u4E2D\u4F4D\u6570\u5BF9\u6BD4", value: formatComparisonText(inputNum, stats.median) }), _jsx(PositionItem, { label: "\u4F4E\u4E8E\u8BE5\u503C\u4EBA\u6570", value: `${position.lowerCount} 人` }), _jsx(PositionItem, { label: "\u7B49\u4E8E\u8BE5\u503C\u4EBA\u6570", value: `${position.equalCount} 人` }), _jsx(PositionItem, { label: "\u9AD8\u4E8E\u8BE5\u503C\u4EBA\u6570", value: `${position.higherCount} 人` }), position.existsInData ? (_jsx(PositionItem, { label: "\u540D\u6B21\u533A\u95F4", value: `第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名` })) : (_jsx(PositionItem, { label: "\u4F30\u7B97\u540D\u6B21", value: `第 ${position.estimatedRank} 名` }))] }), _jsxs("div", { style: styles.positionHighlight, children: [_jsx("div", { style: styles.positionHighlightLabel, children: "\u767E\u5206\u4F4D" }), _jsxs("div", { style: styles.positionHighlightValue, children: ["\u7EA6 ", safeFormatPercent(position.percentile)] })] }), _jsx("p", { style: styles.note, children: "\u767E\u5206\u4F4D\u53E3\u5F84\uFF1A\u4F4E\u4E8E\u8BE5\u503C\u4EBA\u6570 / \u6709\u6548\u6570\u503C\u6570\u91CF \u00D7 100%\u3002" }), !position.existsInData && (_jsx("p", { style: styles.warning, children: "\u4F60\u7684\u6570\u503C\u8D85\u51FA\u5F53\u524D\u5B57\u6BB5\u6570\u636E\u8303\u56F4\uFF0C\u6392\u540D\u7ED3\u679C\u4EC5\u4F5C\u4E3A\u63D2\u5165\u4F30\u7B97\u3002" }))] }) })), parsedData && (_jsx(ErrorBoundary, { children: _jsxs("section", { style: styles.section, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u56FE\u8868\u5206\u6790" }), selectedField && metricResult && chartProps && (_jsxs(_Fragment, { children: [_jsx(ChartTabs, { activeTab: activeChartTab, onChange: setActiveChartTab }), activeChartTab === 'histogram' && _jsx(HistogramChart, { ...chartProps.histogram }), activeChartTab === 'boxplot' && _jsx(BoxPlotChart, { ...chartProps.boxplot }), activeChartTab === 'cdf' && _jsx(CdfChart, { ...chartProps.cdf }), activeChartTab === 'quartile' && _jsx(QuartilePieChart, { ...chartProps.quartile })] })), selectedField && fieldValues.length === 0 && (_jsx("div", { style: styles.emptyChart, children: "\u6682\u65E0\u53EF\u89C6\u5316\u6570\u636E" })), _jsx("div", { style: styles.radarSection, children: _jsx(RadarAnalysis, { headers: analysisDataset?.headers ?? parsedData.headers, rows: analysisDataset?.rows ?? parsedData.rows, isNumericField: isNumericField, getFieldAnalysisRole: getFieldAnalysisRole, originalFieldState: originalFieldState, onOriginalFieldChange: setOriginalFieldState }) }), analysisExplanation && (_jsx(ErrorBoundary, { children: _jsx(AnalysisExplainer, { explanation: analysisExplanation }) })), selectedField && fieldValues && stats && fieldValues.length > 0 && (_jsx(ErrorBoundary, { children: _jsx(OutlierPanel, { selectedField: selectedField, values: fieldValues }) }))] }) })), viewContext?.groupStats && viewContext.groupStats.length > 0 && (_jsx(ErrorBoundary, { children: _jsxs("section", { style: styles.section, children: [_jsxs("div", { style: styles.positionHeader, children: [_jsx("h2", { style: styles.sectionTitle, children: "\u5206\u7EC4\u5206\u6790" }), _jsx("button", { className: "copy-btn", style: styles.exportButton, onClick: handleExportGroupAnalysis, children: "\u5BFC\u51FA\u5206\u7EC4\u5206\u6790 CSV" })] }), _jsx(GroupBarChart, { groupStats: viewContext.groupStats, metricField: selectedField, dimensionField: selectedDimension }), _jsx(GroupAnalysis, { groupStats: viewContext.groupStats, metricField: selectedField, dimensionField: selectedDimension })] }) })), viewContext?.groupStats !== null && viewContext?.groupStats !== undefined && viewContext.groupStats.length === 0 && selectedField && selectedDimension && (_jsx("section", { style: { ...styles.section, ...styles.errorSection }, children: _jsxs("p", { style: styles.errorText, children: ["\u6240\u9009\u7EF4\u5EA6\u3010", selectedDimension, "\u3011\u4E0B\u6CA1\u6709\u53EF\u5206\u6790\u7684\u6570\u503C\u6570\u636E\uFF0C\u8BF7\u68C0\u67E5\u6307\u6807\u5B57\u6BB5\u548C\u7EF4\u5EA6\u5B57\u6BB5\u662F\u5426\u5339\u914D\u3002"] }) }))] })), import.meta.env.DEV && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setShowDebugPanel((prev) => !prev), style: {
                            position: 'fixed',
                            right: 16,
                            bottom: 16,
                            zIndex: 9999,
                            padding: '8px 16px',
                            backgroundColor: showDebugPanel ? '#ef4444' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }, children: showDebugPanel ? '隐藏调试面板' : '显示调试面板' }), showDebugPanel && selectedField && metricResult && (_jsx("div", { style: {
                            position: 'fixed',
                            right: 16,
                            bottom: 60,
                            zIndex: 9998,
                            maxWidth: '400px',
                            maxHeight: '60vh',
                            overflow: 'auto',
                        }, children: _jsx(ErrorBoundary, { children: _jsx(DebugPanel, { context: derivedData, metricResult: metricResult, selectedField: selectedField, metricDef: metricDefs.find(m => m.name === selectedField) }) }) }))] }))] }));
}
// ─── 子组件 ─────────────────────────────────────────────────────
function StatCard({ label, value }) {
    return (_jsxs("div", { className: "stat-card-hover", style: styles.statCard, children: [_jsx("div", { style: styles.statLabel, children: label }), _jsx("div", { style: styles.statValue, children: value })] }));
}
function PositionItem({ label, value }) {
    return (_jsxs("div", { style: styles.positionItem, children: [_jsx("div", { style: styles.positionLabel, children: label }), _jsx("div", { style: styles.positionValue, children: value })] }));
}
function SummaryItem({ label, value, highlight }) {
    return (_jsxs("div", { style: styles.summaryItem, children: [_jsxs("span", { style: styles.summaryLabel, children: [label, "\uFF1A"] }), _jsx("span", { style: { ...styles.summaryValue, ...(highlight ? styles.summaryHighlight : {}) }, children: value })] }));
}
// ─── 样式（与 App.tsx 保持一致） ──────────────────────────────────
const styles = {
    section: { background: '#fff', borderRadius: '14px', padding: '20px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.04)', transition: 'box-shadow 0.2s, transform 0.2s', border: '1px solid rgba(226, 232, 240, 0.8)' },
    sectionTitle: { margin: '0 0 14px', fontSize: '16px', fontWeight: 600, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' },
    hint: { margin: '0 0 10px', fontSize: '13px', color: '#4338ca', background: 'linear-gradient(135deg, #eef2ff 0%, #f0f7ff 100%)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #6366f1' },
    error: { margin: '8px 0 0', color: '#ef4444', fontSize: '14px' },
    warning: { margin: '8px 0 0', color: '#92400e', fontSize: '13px', background: '#fffbeb', padding: '6px 10px', borderRadius: '6px' },
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
    emptyChart: { textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' },
    radarSection: { marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' },
    summaryItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(226, 232, 240, 0.6)' },
    summaryLabel: { color: '#64748b', fontSize: '12px' },
    summaryValue: { color: '#1e293b', fontWeight: 600, fontSize: '13px' },
    summaryHighlight: { color: '#6366f1' },
    sheetSelector: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
    sheetButton: { padding: '8px 16px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    sheetButtonActive: { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', borderColor: 'transparent' },
    fallbackHint: { margin: '12px 0', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '13px', color: '#92400e' },
    copyButton: { padding: '4px 12px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s' },
    exportButton: { padding: '4px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px' },
    // Stage 0A-2: 抽样确认对话框样式
    confirmationDialog: { border: '2px solid #f59e0b', background: '#fffbeb' },
    dialogContent: { margin: '12px 0' },
    dialogText: { margin: '0 0 8px 0', fontSize: '14px', color: '#92400e', lineHeight: 1.6 },
    dialogHint: { margin: 0, fontSize: '12px', color: '#a16207', fontStyle: 'italic' },
    dialogActions: { display: 'flex', gap: '12px', marginTop: '16px' },
    confirmBtn: { padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    cancelBtn: { padding: '8px 20px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
    // Stage 0A-2: 抽样信息展示样式
    samplingInfoBox: { border: '1px solid #c7d2fe', background: '#eef2ff', padding: '12px 16px' },
    samplingInfoText: { margin: 0, fontSize: '13px', color: '#4338ca', lineHeight: 1.5 },
    samplingInfoList: { margin: '8px 0 0 20px', padding: 0, fontSize: '12px', color: '#4338ca', lineHeight: 1.8 },
    // Stage 0A-2: 已取消状态样式
    cancelledSection: { border: '1px solid #fde68a', background: '#fffbeb', padding: '16px' },
    cancelledText: { margin: '0 0 12px 0', fontSize: '14px', color: '#92400e', fontWeight: 500 },
    modifyFilterBtn: { padding: '8px 16px', background: '#fff', color: '#6366f1', border: '1px solid #6366f1', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
    reconfirmBtn: { padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
    // Stage 0A-2: 确认对话框警告样式
    dialogWarning: { margin: '8px 0 0 0', fontSize: '12px', color: '#dc2626', fontWeight: 500 },
};
