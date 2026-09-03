/**
 * AnalysisSection - v1.8 Lazy loaded analysis component
 * 
 * 包含完整的分析 pipeline：orchestrator → metric → export → 所有分析 UI
 * 通过 React.lazy 延迟加载，首屏不加载分析引擎和图表库
 */

import { useMemo, useCallback, useEffect, useState } from 'react';
import { useAnalysisOrchestrator } from '../hooks/useAnalysisOrchestrator';
import { useMetricResult } from '../hooks/useMetricResult';
import { useOutlierExclusion } from '../hooks/useOutlierExclusion';
import { useExportActions } from '../hooks/useExportActions';
import { formatNumber } from '../utils/stats';
import { generateExplanation } from '../utils/analysisExplainer';
import { safeFormatPercent } from '../utils/safeFormat';
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';
import { toHistogramProps, toBoxPlotProps, toCdfProps, toQuartilePieProps, toTimeSeriesProps } from '../engine/chartAdapter';
import { preloadECharts } from '../utils/echartsSetup';
import { ErrorBoundary } from './ErrorBoundary';
import ChartTabs from './charts/ChartTabs';
import HistogramChart from './charts/HistogramChart';
import BoxPlotChart from './charts/BoxPlotChart';
import CdfChart from './charts/CdfChart';
import QuartilePieChart from './charts/QuartilePieChart';
import TimeSeriesLineChart from './charts/TimeSeriesLineChart';
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
import type { ChartTab, OriginalFieldRadarState, ParsedTable } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';
import type { FilterCondition } from '../engine/filterRows';
import HelpPopover from './help/HelpPopover';
import { getHelp } from '../data/helpContent';

// 相对位置方向覆盖类型（仅本组件使用）
type PositionDirectionOverride = 'higher_is_better' | 'lower_is_better';

export interface AnalysisSectionProps {
  // ─── 数据 ───
  parsedData: ParsedTable;
  parseSummary: ParseSummary | null;
  parseReport: unknown;

  // ─── 筛选状态 ───
  filteredParsedData: ParsedTable | null;
  filterResult: {
    filteredRows: Record<string, string>[];
    filterSummary: {
      originalCount: number;
      filteredCount: number;
      filterRatio: number;
      activeConditions: number;
    };
  } | null;
  filterConditions: FilterCondition[];
  setFilterConditions: (conditions: FilterCondition[]) => void;
  filterCollapsed: boolean;
  setFilterCollapsed: (collapsed: boolean) => void;
  numericFieldSet: Set<string>;

  // ─── Stage 0A-2: 统一分析数据集 ───
  analysisDataset: {
    rows: Record<string, string>[];
    headers: string[];
    status: 'no_data' | 'parse_truncated' | 'awaiting_confirmation' | 'cancelled' | 'ready_full' | 'ready_sampled';
    datasetKey: string;
    samplingInfo: {
      algorithm: 'systematic_even_v1';
      originalRowCount: number;
      sampledRowCount: number;
      indices: number[];
    } | null;
    fields?: import('../field-schema').ResolvedFieldSchema[];
  } | null;
  confirmDataset: (key: string) => void;
  cancelDataset: (key: string) => void;

  // ─── 分组状态 ───
  selectedDimension: string;
  setSelectedDimension: (dimension: string) => void;
  availableDimensions: { header: string; riskLevel: string; riskHint?: string }[];

  // ─── 字段选择状态 ───
  selectedField: string;
  setSelectedField: (field: string) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  showAllFields: boolean;
  setShowAllFields: (show: boolean) => void;

  // ─── 图表 ───
  activeChartTab: ChartTab;
  setActiveChartTab: (tab: ChartTab) => void;

  // ─── 雷达图 ───
  originalFieldState: OriginalFieldRadarState;
  setOriginalFieldState: (state: OriginalFieldRadarState) => void;

  // ─── 工作表 ───
  availableSheets: string[] | null;
  selectedSheet: string | null;
  handleSheetChange: (sheetName: string) => void;

  // ─── 字段工具 ───
  isNumericField: (header: string) => boolean;
  getFieldAnalysisRole: (header: string) => string;
  getFieldMetricDirection: (header: string) => string;

  // ─── 计算值 ───
  availableFields: string[];
  isFallbackFieldMode: boolean;
  groupedFields: Record<string, string[]> | null;
  analysisExplanationRef: {
    parsedData: ParsedTable | null;
    originalFieldState: OriginalFieldRadarState;
    parseSummary: ParseSummary | null;
  };

  // ─── 调试 ───
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean | ((prev: boolean) => boolean)) => void;
}

export default function AnalysisSection(props: AnalysisSectionProps) {
  const {
    parsedData, parseSummary, parseReport,
    filteredParsedData, filterResult, filterConditions, setFilterConditions,
    filterCollapsed, setFilterCollapsed, numericFieldSet,
    analysisDataset, confirmDataset, cancelDataset,
    selectedDimension, setSelectedDimension, availableDimensions,
    selectedField, setSelectedField, inputValue, setInputValue,
    showAllFields, setShowAllFields, activeChartTab, setActiveChartTab,
    originalFieldState, setOriginalFieldState,
    availableSheets, selectedSheet, handleSheetChange,
    isNumericField, getFieldAnalysisRole, getFieldMetricDirection,
    availableFields, isFallbackFieldMode, groupedFields,
    analysisExplanationRef,
    showDebugPanel, setShowDebugPanel,
  } = props;

  // ===== 相对位置方向覆盖状态 =====
  const [directionOverrides, setDirectionOverrides] = useState<Record<string, PositionDirectionOverride>>({});
  const selectedDirectionOverride = selectedField ? directionOverrides[selectedField] : undefined;

  // ===== 移动端检测：缩小调试面板浮动按钮足迹，减少对正文的遮挡 =====
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 520px)');
    const onChange = () => setIsNarrowScreen(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 读取当前字段的默认方向定义
  const selectedFieldDefinition = useMemo(() => {
    if (!selectedField || !analysisDataset?.fields) {
      return undefined;
    }

    return analysisDataset.fields.find(
      field =>
        field.fieldId === selectedField &&
        field.analysisRole === 'metric'
    );
  }, [analysisDataset?.fields, selectedField]);

  // 数据集变化时清空方向覆盖
  useEffect(() => {
    setDirectionOverrides({});
  }, [analysisDataset?.datasetKey]);

  // 构建有效分析数据集（应用方向覆盖）
  const effectiveAnalysisDataset = useMemo(() => {
    if (
      !analysisDataset ||
      !selectedField ||
      !selectedDirectionOverride ||
      !analysisDataset.fields
    ) {
      return analysisDataset;
    }

    let hasChanged = false;

    const fields = analysisDataset.fields.map((field) => {
      if (
        field.fieldId !== selectedField ||
        field.analysisRole !== 'metric' ||
        field.metricDirection === selectedDirectionOverride
      ) {
        return field;
      }

      hasChanged = true;

      return {
        ...field,
        metricDirection: selectedDirectionOverride,
      };
    });

    if (!hasChanged) {
      return analysisDataset;
    }

    return {
      ...analysisDataset,
      fields,
    };
  }, [analysisDataset, selectedField, selectedDirectionOverride]);

  // ===== 异常值排除状态（按字段隔离，作用于当前分析行，不修改原始数据） =====
  const outlierExclusion = useOutlierExclusion(
    effectiveAnalysisDataset?.rows ?? null,
    selectedField
  );

  // 构建"异常值排除后"的分析数据集：rows 替换为排除后的行
  // （fields 等其余字段保持与 effectiveAnalysisDataset 一致，便于下游语义层复用）
  const exclusionAppliedDataset = useMemo(() => {
    if (!effectiveAnalysisDataset) return effectiveAnalysisDataset;
    if (!selectedField) return effectiveAnalysisDataset;
    if (outlierExclusion.analysisExcludedRowIndices.size === 0) {
      return effectiveAnalysisDataset;
    }
    return {
      ...effectiveAnalysisDataset,
      rows: outlierExclusion.analysisRowsAfterExclusion,
    };
  }, [effectiveAnalysisDataset, selectedField, outlierExclusion.analysisExcludedRowIndices, outlierExclusion.analysisRowsAfterExclusion]);

  // ===== v1.5 Orchestration：统一调度层 =====
  const {
    core: { metricResult, correlationResult },
    derived: { derivedData },
    view: { viewContext },
    metricDefs,
  } = useAnalysisOrchestrator(exclusionAppliedDataset, parseSummary, selectedField, inputValue, selectedDimension);

  const { stats, position, fieldValues } = useMetricResult(metricResult);

  // neutral/unspecified 指标不显示相对位置（不生成优劣评价）
  const showPositionSection = metricResult && 
    metricResult.direction !== 'neutral' && 
    metricResult.direction !== 'unspecified';

  // v1.9.1: 当 dataset ready 时预加载 echarts 模块（requestIdleCallback，不阻塞渲染）
  useEffect(() => {
    if (metricResult) {
      // 预加载图表区域可能用到的所有 chart type
      preloadECharts(['bar', 'line', 'pie', 'boxplot', 'scatter', 'radar']);
    }
  }, [!!metricResult]);

  // v1.9.1: 缓存 chart props，避免每次 render 重新计算
  const chartProps = useMemo(() => {
    if (!metricResult) return null;
    return {
      histogram: toHistogramProps(metricResult),
      boxplot: toBoxPlotProps(metricResult),
      cdf: toCdfProps(metricResult),
      quartile: toQuartilePieProps(metricResult),
    };
  }, [metricResult]);

  // ===== 时间序列折线图数据 =====
  // 查找第一个时间字段（直接从 analysisDataset.fields 查找，避免旧角色映射）
  const timeField = useMemo(() => {
    return analysisDataset?.fields?.find(
      (field) => field.analysisRole === 'time' || field.dataType === 'datetime'
    )?.fieldId ?? null;
  }, [analysisDataset?.fields]);

  // 计算时间序列数据
  const timeSeriesData = useMemo(() => {
    if (!timeField || !selectedField || !isNumericField(selectedField)) return null;
    if (!analysisDataset?.rows || analysisDataset.rows.length === 0) return null;

    return toTimeSeriesProps(
      analysisDataset.rows,
      timeField,
      selectedField
    );
  }, [analysisDataset?.rows, timeField, selectedField, isNumericField]);

  // 防止隐藏标签状态残留：当时间字段不存在时，自动切回 histogram
  useEffect(() => {
    if (activeChartTab === 'timeseries' && !timeField) {
      setActiveChartTab('histogram');
    }
  }, [activeChartTab, timeField, setActiveChartTab]);

  const {
    handleExportFilteredData,
    handleExportGroupAnalysis,
    handleExportMetricSummary,
  } = useExportActions(
    filteredParsedData,
    filterResult,
    viewContext?.groupStats ?? null,
    metricResult,
    stats,
    position,
    selectedField,
    analysisDataset?.samplingInfo ?? null
  );

  // ===== 分析解释派生 =====
  // Stage 0A-2: 使用 analysisDataset.rows 代替 parsedData.rows
  const analysisExplanation = useMemo(() => {
    const { originalFieldState: ofs, parseSummary: ps } = analysisExplanationRef;
    if (!analysisDataset || !ofs?.selections?.length) return null;
    
    // 只有 ready_full 或 ready_sampled 才生成解释
    if (analysisDataset.status !== 'ready_full' && analysisDataset.status !== 'ready_sampled') {
      return null;
    }

    const rankFields = new Set<string>();
    if (ps?.fieldTypes) {
      for (const meta of ps.fieldTypes) {
        if (meta.analysisRole === 'rank') {
          rankFields.add(meta.header);
        }
      }
    }

    // 构建字段方向映射（neutral/unspecified 不生成优劣评价）
    const fieldDirections: Record<string, 'higher-is-better' | 'lower-is-better' | 'neutral' | 'unspecified'> = {};
    if (metricDefs) {
      for (const metric of metricDefs) {
        fieldDirections[metric.sourceField] = metric.direction;
      }
    }

    const fieldValues: Record<string, number> = {};
    const fieldData: Record<string, number[]> = {};

    for (const selection of ofs.selections) {
      const { field, userValue } = selection;
      if (!field || userValue === undefined || isNaN(userValue)) continue;
      fieldValues[field] = userValue;
      // Stage 0A-2: 使用 analysisDataset.rows
      const values = analysisDataset.rows
        .map(row => {
          const val = row[field];
          if (val === undefined || val === '' || val === null) return null;
          const num = parseNumericValueLegacy(val);
          return num;
        })
        .filter((v): v is number => v !== null && Number.isFinite(v));
      if (values.length > 0) fieldData[field] = values;
    }

    if (Object.keys(fieldValues).length === 0) return null;
    return generateExplanation(fieldValues, fieldData, rankFields, fieldDirections);
  }, [analysisExplanationRef, analysisDataset, metricDefs]);

  // ===== 计算值 =====
  const inputNum = inputValue ? (parseNumericValueLegacy(inputValue) ?? NaN) : NaN;
  const hasInputError = inputValue.trim() !== '' && isNaN(inputNum);

  const summaryText = useMemo(() => {
    // neutral/unspecified 指标不生成相对位置摘要
    if (!showPositionSection || !position || !stats || isNaN(inputNum)) return '';
    const numStr = formatNumber(inputNum);
    const direction = metricResult?.direction;
    
    // 根据字段方向生成不同的文案
    let comparisonText: string;
    if (direction === 'lower-is-better') {
      comparisonText = `按"数值越低越优"口径，该值的相对表现优于或等于约 ${safeFormatPercent(position.percentile)} 的有效记录。`;
    } else if (direction === 'neutral' || direction === 'unspecified') {
      comparisonText = `该值位于约 ${safeFormatPercent(position.percentile)} 百分位。`;
    } else {
      // higher-is-better 或默认
      comparisonText = `按"数值越高越优"口径，该值的相对表现优于或等于约 ${safeFormatPercent(position.percentile)} 的有效记录。`;
    }
    
    if (position.existsInData) {
      return `你的【${selectedField}】为 ${numStr}。当前数据共有 ${position.total} 条有效记录，其中高于该值的有 ${position.higherCount} 条，与该值相同的有 ${position.equalCount} 条。该值的相对位置区间为第 ${position.bestRank} 位至第 ${position.worstRank} 位。${comparisonText}`;
    }
    return `当前数据中不存在该值。如果将该值加入当前数据，估算相对位置为第 ${position.estimatedRank} 位。${comparisonText}`;
  }, [showPositionSection, position, stats, selectedField, inputNum, metricResult?.direction]);

  // ===== 复制摘要 =====
  const fallbackCopy = useCallback((text: string, cb: (msg: string) => void) => {
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
    } catch {
      cb('当前浏览器不支持自动复制，请手动复制。');
    }
  }, []);

  const handleCopySummary = useCallback(() => {
    if (!stats || !selectedField) return;
    
    // neutral/unspecified 指标不生成排名部分
    const isNeutralOrUnspecified = metricResult?.direction === 'neutral' || metricResult?.direction === 'unspecified';
    
    const lines: string[] = [];
    lines.push('【数据分析摘要】');
    lines.push('');
    lines.push(`分析字段：${selectedField}`);
    if (inputValue) {
      lines.push(`你的数值：${inputValue}`);
    }
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
    
    // neutral/unspecified 不生成相对位置部分
    if (!isNeutralOrUnspecified && position) {
      lines.push('');
      lines.push('二、相对位置');
      lines.push(`高于该值记录数：${position.higherCount}`);
      lines.push(`等于该值记录数：${position.equalCount}`);
      lines.push(`低于该值记录数：${position.lowerCount}`);
      if (position.existsInData) {
        lines.push(`相对位置区间：第 ${position.bestRank} 位至第 ${position.worstRank} 位`);
      } else {
        lines.push(`估算相对位置：第 ${position.estimatedRank} 位`);
        lines.push('当前数据中不存在该值，相对位置为基于当前数据的估算。');
      }
      
      // 根据字段方向生成百分位说明
      const direction = metricResult?.direction;
      if (direction === 'lower-is-better') {
        lines.push(`百分位：约 ${safeFormatPercent(position.percentile)}（按"数值越低越优"口径）`);
      } else {
        lines.push(`百分位：约 ${safeFormatPercent(position.percentile)}（按"数值越高越优"口径）`);
      }
      
      lines.push('');
      lines.push('三、口径说明');
      
      // 根据字段方向生成百分位口径说明
      if (direction === 'lower-is-better') {
        lines.push('百分位口径：不低于该值的有效记录数 / 有效记录总数。');
      } else {
        lines.push('百分位口径：不高于该值的有效记录数 / 有效记录总数。');
      }
      lines.push('存在相同数值时使用相对位置区间，不强行给出单一位置。');
    } else if (isNeutralOrUnspecified) {
      lines.push('');
      lines.push('二、说明');
      lines.push('当前字段方向未指定，仅展示统计分布，不进行优劣评价。');
    }

    const text = lines.join('\n');
    const setMsg = (msg: string) => {
      // 使用全局 temp 消息机制
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;padding:8px 20px;border-radius:8px;z-index:99999;font-size:14px;';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => setMsg('已复制分析摘要')).catch(() => fallbackCopy(text, setMsg));
    } else {
      fallbackCopy(text, setMsg);
    }
  }, [stats, position, selectedField, inputValue, fallbackCopy]);

  function formatComparisonText(input: number, ref: number): string {
    if (!Number.isFinite(input) || !Number.isFinite(ref)) return '-';
    const diff = input - ref;
    if (Math.abs(diff) < 0.005) return '持平';
    const absDiff = Number.isInteger(Math.abs(diff)) ? Math.abs(diff).toString() : Math.abs(diff).toFixed(2);
    return diff > 0 ? `高 ${absDiff}` : `低 ${absDiff}`;
  }
  // 注意：第280行的 Math.abs(diff).toFixed(2) 是安全的，因为前面已经用 Number.isFinite 验证了 input 和 ref

  // ===== 渲染 =====
  return (
    <>
      {availableFields.length === 0 && (
        <section style={{ ...styles.section, ...styles.errorSection }}>
          <p style={styles.errorText}>
            {(() => {
              if (!parsedData.rows || parsedData.rows.length === 0) {
                return '表格数据为空，请检查是否成功读取到数据行。';
              }
              if (!parsedData.headers || parsedData.headers.length === 0) {
                return '未识别到表头字段，请确认第一行为字段名。';
              }
              if (parseSummary?.fieldTypes) {
                const allInvalid = parseSummary.fieldTypes.every(
                  m => m.analysisRole === 'invalid' || m.analysisRole === 'identity' || m.analysisRole === 'textMeta'
                );
                if (allInvalid) {
                  return '已识别字段，但未发现推荐分析字段，请尝试打开"显示全部字段"并手动选择数值字段。';
                }
              }
              return '当前表格没有可分析的数值字段，请尝试打开"显示全部字段"并手动选择。';
            })()}
          </p>
          <p style={styles.hint}>
            如果文件包含复杂表头，建议使用 Excel 复制表格后粘贴文本方式。
          </p>
        </section>
      )}

      {availableFields.length > 0 && (
        <>
          {/* Stage 0A-2: 抽样确认对话框 */}
          {analysisDataset?.status === 'awaiting_confirmation' && (
            <section style={{ ...styles.section, ...styles.confirmationDialog }}>
              <h2 style={styles.sectionTitle}>数据量较大，是否启用抽样分析？</h2>
              <div style={styles.dialogContent}>
                <p style={styles.dialogText}>
                  当前筛选后数据包含 <strong>{filteredParsedData?.rows.length ?? 0}</strong> 行，
                  分析上限为 <strong>5000</strong> 行。
                </p>
                <p style={styles.dialogHint}>
                  <strong>抽样算法：</strong>systematic_even_v1（等距确定性抽样）
                </p>
                <p style={styles.dialogHint}>
                  <strong>确定性：</strong>相同输入数据将得到相同的抽样结果
                </p>
                <p style={styles.dialogWarning}>
                  <strong>注意：</strong>如果数据具有明显的有序性或周期性特征，抽样结果可能存在偏差。
                </p>
              </div>
              <div style={styles.dialogActions}>
                <button
                  onClick={() => confirmDataset(analysisDataset.datasetKey)}
                  style={styles.confirmBtn}
                >
                  确认使用抽样分析
                </button>
                <button
                  onClick={() => cancelDataset(analysisDataset.datasetKey)}
                  style={styles.cancelBtn}
                >
                  取消分析
                </button>
              </div>
            </section>
          )}

          {/* Stage 0A-2: 已取消提示 */}
          {analysisDataset?.status === 'cancelled' && (
            <section style={{ ...styles.section, ...styles.cancelledSection }}>
              <p style={styles.cancelledText}>
                已取消分析。当前不执行任何统计计算。
              </p>
              <div style={styles.dialogActions}>
                <button
                  onClick={() => setFilterCollapsed(false)}
                  style={styles.modifyFilterBtn}
                >
                  修改筛选条件
                </button>
                <button
                  onClick={() => confirmDataset(analysisDataset.datasetKey)}
                  style={styles.reconfirmBtn}
                >
                  重新确认抽样分析
                </button>
              </div>
            </section>
          )}

          {/* Stage 0A-2: 抽样信息展示（持续显示） */}
          {analysisDataset?.status === 'ready_sampled' && analysisDataset.samplingInfo && (
            <section style={{ ...styles.section, ...styles.samplingInfoBox }}>
              <p style={styles.samplingInfoText}>
                <strong>抽样分析模式</strong>：当前结果基于样本而非全部筛选数据。
              </p>
              <ul style={styles.samplingInfoList}>
                <li>筛选后行数：{analysisDataset.samplingInfo.originalRowCount}</li>
                <li>实际分析行数：{analysisDataset.samplingInfo.sampledRowCount}</li>
                <li>抽样算法：{analysisDataset.samplingInfo.algorithm}</li>
              </ul>
            </section>
          )}

          {parseSummary && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>识别摘要 <HelpPopover content={getHelp('field')} /></h2>
              <div style={styles.summaryGrid}>
                <SummaryItem label="已识别主表" value={parseSummary.sheetName} />
                <SummaryItem label="识别字段" value={`${parseSummary.fieldCount} 个`} />
                <SummaryItem label="有效数据行" value={`${parseSummary.validDataRows} 行`} />
                {parseSummary.emptyRows > 0 && <SummaryItem label="跳过空行" value={`${parseSummary.emptyRows} 行`} />}
                {parseSummary.summaryRows > 0 && <SummaryItem label="跳过统计行" value={`${parseSummary.summaryRows} 行`} />}
                {parseSummary.statusRows > 0 && <SummaryItem label="状态/无效行" value={`${parseSummary.statusRows} 行`} />}
                {parseSummary.recommendedField && (
                  <SummaryItem label="推荐分析字段" value={parseSummary.recommendedField} highlight />
                )}
              </div>
            </section>
          )}

          {parseReport && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>解析报告</h2>
              <ParseReportPanel report={parseReport as Parameters<typeof ParseReportPanel>[0]['report']} />
            </section>
          )}

          <ErrorBoundary>
          <section style={styles.section}>
            <GeneralDataOverview 
              headers={analysisDataset?.headers ?? parsedData.headers} 
              rows={analysisDataset?.rows ?? parsedData.rows} 
              schemas={analysisDataset?.fields}
            />
          </section>
          </ErrorBoundary>

          <ErrorBoundary>
          <RelationshipAnalysisPanel correlationResult={correlationResult} />
          </ErrorBoundary>

          {availableSheets && availableSheets.length > 1 && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>工作表选择</h2>
              <div style={styles.sheetSelector}>
                {availableSheets.map(sheet => (
                  <button
                    key={sheet}
                    style={{
                      ...styles.sheetButton,
                      ...(selectedSheet === sheet ? styles.sheetButtonActive : {}),
                      ...(parseSummary?.sheetName === sheet && !selectedSheet ? styles.sheetButtonActive : {}),
                    }}
                    onClick={() => handleSheetChange(sheet)}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>解析结果</h2>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>字段数：</span>
              <span style={styles.infoValue}>{parsedData.headers.length}</span>
              <span style={styles.infoLabel}>数据行数：</span>
              <span style={styles.infoValue}>{parsedData.rows.length}</span>
              {filteredParsedData && filterResult && filterResult.filterSummary.activeConditions > 0 && (
                <button
                  className="copy-btn"
                  style={styles.exportButton}
                  onClick={handleExportFilteredData}
                >
                  导出筛选后数据 CSV
                </button>
              )}
            </div>
          </section>

          <ErrorBoundary>
            <FilterPanel
              headers={parsedData.headers}
              numericFields={numericFieldSet}
              conditions={filterConditions}
              onConditionsChange={setFilterConditions}
              filterSummary={filterResult?.filterSummary ?? null}
              collapsed={filterCollapsed}
              onToggleCollapse={() => setFilterCollapsed(!filterCollapsed)}
            />
          </ErrorBoundary>

          <AnalysisContextHint
            originalCount={parsedData.rows.length}
            filteredCount={filterResult?.filterSummary.filteredCount ?? parsedData.rows.length}
            activeConditions={filterResult?.filterSummary.activeConditions ?? 0}
            selectedDimension={selectedDimension}
            isFilteredEmpty={filterResult ? filterResult.filterSummary.filteredCount === 0 && filterResult.filterSummary.activeConditions > 0 : false}
          />

          {filterResult?.filterSummary && filterResult.filterSummary.activeConditions > 0 && filterResult.filterSummary.filteredCount === 0 && (
            <section style={styles.section}>
              <p style={styles.warning}>
                当前筛选条件下无匹配记录，已保留原始数据继续分析展示；可调整筛选条件后重新筛选。
              </p>
            </section>
          )}

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>分析设置</h2>
            {isFallbackFieldMode && (
              <div style={styles.fallbackHint}>
                <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>系统未能自动推荐字段，但检测到若干数值字段，可手动选择后分析。</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  建议打开"显示全部字段"以查看完整字段列表，或尝试粘贴表格文本方式。
                </p>
              </div>
            )}
            <div style={styles.settingsRow}>
              <div style={styles.settingItem}>
                <label style={styles.settingLabel}>分析字段 <HelpPopover content={getHelp('position_field')} /></label>
              <select style={styles.select} value={selectedField} onChange={e => {
                  // 切换字段时清空用户输入值，避免旧值用于新字段分析
                  if (e.target.value !== selectedField) {
                    setInputValue('');
                  }
                  setSelectedField(e.target.value);
                }}>
                  {showAllFields && groupedFields ? (
                    <>
                      {groupedFields.metrics?.length > 0 && (
                        <optgroup label="推荐指标">
                          {groupedFields.metrics.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.dimensions?.length > 0 && (
                        <optgroup label="维度字段">
                          {groupedFields.dimensions.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.identifiers?.length > 0 && (
                        <optgroup label="标识字段">
                          {groupedFields.identifiers.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.timeFields?.length > 0 && (
                        <optgroup label="时间字段">
                          {groupedFields.timeFields.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.descriptions?.length > 0 && (
                        <optgroup label="描述字段">
                          {groupedFields.descriptions.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.others?.length > 0 && (
                        <optgroup label="其他字段">
                          {groupedFields.others.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  ) : (
                    availableFields.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))
                  )}
                </select>
              </div>
              <div style={styles.settingItem}>
                <label style={styles.settingLabel}>你的数值 <HelpPopover content={getHelp('reference_value')} /></label>
                <input type="number" style={styles.input} placeholder="输入数值" value={inputValue} onChange={e => setInputValue(e.target.value)} />
              </div>
              <div style={styles.settingItem}>
                <label style={styles.settingLabel}>相对位置方向（可选）</label>
                <select
                  style={styles.select}
                  value={selectedDirectionOverride ?? ''}
                  onChange={e => {
                    const value = e.target.value as PositionDirectionOverride | '';
                    setDirectionOverrides(previous => {
                      const next = { ...previous };
                      if (!value) {
                        delete next[selectedField];
                      } else {
                        next[selectedField] = value;
                      }
                      return next;
                    });
                  }}
                  disabled={!selectedField}
                >
                  <option value="">使用字段默认方向</option>
                  <option value="higher_is_better">数值越高，位置越靠前</option>
                  <option value="lower_is_better">数值越低，位置越靠前</option>
                </select>
                <p style={styles.hint}>
                  {selectedDirectionOverride === 'higher_is_better'
                    ? '当前按"数值越高，位置越靠前"计算相对位置。'
                    : selectedDirectionOverride === 'lower_is_better'
                    ? '当前按"数值越低，位置越靠前"计算相对位置。'
                    : selectedFieldDefinition?.metricDirection === 'higher_is_better'
                    ? '当前使用字段默认方向："数值越高，位置越靠前"。'
                    : selectedFieldDefinition?.metricDirection === 'lower_is_better'
                    ? '当前使用字段默认方向："数值越低，位置越靠前"。'
                    : '当前字段未指定相对位置方向，仅展示统计分布；选择方向后可查看相对位置。'}
                </p>
              </div>
              <div style={styles.settingActions}>
                <label style={styles.toggleLabel}>
                  <input type="checkbox" checked={showAllFields} onChange={e => setShowAllFields(e.target.checked)} style={styles.checkbox} />
                  显示全部字段
                </label>
              </div>
            </div>
            {availableDimensions.length > 0 && (
              <div style={{ ...styles.settingsRow, marginTop: '12px' }}>
                <div style={styles.settingItem}>
                  <label style={styles.settingLabel}>分组维度（可选）<HelpPopover content={getHelp('group_dimension')} /></label>
                  <select
                    style={styles.select}
                    value={selectedDimension}
                    onChange={e => setSelectedDimension(e.target.value)}
                  >
                    <option value="">不分组</option>
                    {availableDimensions.map(dim => (
                      <option key={dim.header} value={dim.header}>
                        {dim.header}{dim.riskLevel === 'warning' ? ' ⚠' : ''}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selected = availableDimensions.find(d => d.header === selectedDimension);
                    if (selected?.riskLevel === 'warning') {
                      return <p style={styles.warning}>{selected.riskHint}</p>;
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
            {hasInputError && <p style={styles.error}>请输入有效数字。</p>}
            {inputValue === '' && position === null && selectedField && (
              <p style={styles.hint}>请输入你的数值后再查看相对位置。</p>
            )}
          </section>

          {selectedField && stats === null && fieldValues.length === 0 && (
            <section style={{ ...styles.section, ...styles.errorSection }}>
              <p style={styles.errorText}>当前字段没有可分析的有效数值，请选择其他字段。</p>
            </section>
          )}

          {stats && (
            <ErrorBoundary>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>统计指标</h2>
              <div style={styles.statsGrid}>
                <StatCard label="有效数值" value={stats.validCount.toString()} />
                <StatCard label="无效/空值" value={stats.invalidCount.toString()} />
                <StatCard label="最高" value={formatNumber(stats.max)} />
                <StatCard label="最低" value={formatNumber(stats.min)} />
                <StatCard label="平均值" value={formatNumber(stats.mean)} />
                <StatCard label="中位数" value={formatNumber(stats.median)} />
                <StatCard label="25% 分位" value={formatNumber(stats.q25)} />
                <StatCard label="75% 分位" value={formatNumber(stats.q75)} />
                <StatCard label="90% 分位" value={formatNumber(stats.q90)} />
                <StatCard label="95% 分位" value={formatNumber(stats.q95)} />
              </div>
              
              {/* 导出操作区域 - 所有有 stats 的情况都可用 */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button className="copy-btn" style={styles.copyButton} onClick={handleCopySummary}>复制分析摘要</button>
                <button
                  className="copy-btn"
                  style={styles.exportButton}
                  disabled={!stats}
                  onClick={handleExportMetricSummary}
                >
                  导出指标摘要 CSV
                </button>
              </div>
              
              {/* neutral/unspecified 提示 */}
              {(metricResult?.direction === 'neutral' || metricResult?.direction === 'unspecified') && (
                <p style={{ ...styles.hint, marginTop: '12px' }}>
                  当前字段方向未指定，仅展示统计分布，不进行优劣评价。
                </p>
              )}
            </section>
            </ErrorBoundary>
          )}

          {showPositionSection && position && stats && !isNaN(inputNum) && (
            <ErrorBoundary>
            <section style={styles.section}>
              <div style={styles.positionHeader}>
                <h2 style={styles.sectionTitle}>相对位置 <HelpPopover content={getHelp('position')} /></h2>
              </div>

              {summaryText && <div style={styles.summaryBox}>{summaryText}</div>}

              <div style={styles.positionGrid}>
                <PositionItem label="与平均值对比" value={formatComparisonText(inputNum, stats.mean)} />
                <PositionItem label="与中位数对比" value={formatComparisonText(inputNum, stats.median)} />
                <PositionItem label="低于该值记录数" value={`${position.lowerCount} 条记录`} />
                <PositionItem label="等于该值记录数" value={`${position.equalCount} 条记录`} />
                <PositionItem label="高于该值记录数" value={`${position.higherCount} 条记录`} />
                {position.existsInData ? (
                  <PositionItem label="相对位置区间" value={`第 ${position.bestRank} 位至第 ${position.worstRank} 位`} />
                ) : (
                  <PositionItem label="估算相对位置" value={`第 ${position.estimatedRank} 位`} />
                )}
              </div>

              <div style={styles.positionHighlight}>
                <div style={styles.positionHighlightLabel}>百分位</div>
                <div style={styles.positionHighlightValue}>约 {safeFormatPercent(position.percentile)}</div>
              </div>

              {metricResult?.direction === 'lower-is-better' ? (
                <p style={styles.note}>百分位口径：不低于该值的有效记录数 / 有效记录总数。</p>
              ) : (
                <p style={styles.note}>百分位口径：不高于该值的有效记录数 / 有效记录总数。</p>
              )}

              {position.isOutOfRange && (
                <p style={styles.warning}>
                  {position.outOfRangeDirection === 'below' 
                    ? '你的数值低于当前字段数据范围，相对位置结果仅为基于当前数据的估算。'
                    : '你的数值高于当前字段数据范围，相对位置结果仅为基于当前数据的估算。'}
                </p>
              )}
            </section>
            </ErrorBoundary>
          )}

          {parsedData && (
            <ErrorBoundary>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>图表分析</h2>

              {selectedField && metricResult && chartProps && (
                <>
                  <ChartTabs activeTab={activeChartTab} onChange={setActiveChartTab} hasTimeField={Boolean(timeField)} />
                  {activeChartTab === 'histogram' && <HistogramChart {...chartProps.histogram} />}
                  {activeChartTab === 'boxplot' && <BoxPlotChart {...chartProps.boxplot} />}
                  {activeChartTab === 'cdf' && <CdfChart {...chartProps.cdf} />}
                  {activeChartTab === 'quartile' && <QuartilePieChart {...chartProps.quartile} />}
                  {activeChartTab === 'timeseries' && (
                    <>
                      <div style={styles.chartHelpRow}>
                        <span style={styles.chartHelpLabel}>时间趋势</span>
                        <HelpPopover content={getHelp('timeseries')} />
                      </div>
                      {timeField && timeSeriesData ? (
                        <>
                          <TimeSeriesLineChart
                            dates={timeSeriesData.dates}
                            values={timeSeriesData.values}
                            fieldName={selectedField}
                            dateFieldName={timeField}
                            duplicateCount={timeSeriesData.duplicateCount}
                          />
                          {timeSeriesData.invalidDateCount > 0 && (
                            <p style={{ ...styles.hint, marginTop: '12px' }}>
                              已跳过 {timeSeriesData.invalidDateCount} 条无法识别时间的数据。
                            </p>
                          )}
                          {timeSeriesData.invalidValueCount > 0 && (
                            <p style={{ ...styles.hint, marginTop: '8px' }}>
                              检测到 {timeSeriesData.invalidValueCount} 个缺失或无效数值，折线将在对应位置断开。
                            </p>
                          )}
                        </>
                      ) : !timeField ? (
                        <div style={styles.emptyChart}>当前数据集中未识别到可用的时间字段。</div>
                      ) : (
                        <div style={styles.emptyChart}>请选择一个数值字段查看时间趋势。</div>
                      )}
                    </>
                  )}
                </>
              )}

              {selectedField && fieldValues.length === 0 && (
                <div style={styles.emptyChart}>暂无可视化数据</div>
              )}

              <div style={styles.radarSection}>
                <RadarAnalysis
                  headers={analysisDataset?.headers ?? parsedData.headers}
                  rows={analysisDataset?.rows ?? parsedData.rows}
                  isNumericField={isNumericField}
                  getFieldAnalysisRole={getFieldAnalysisRole}
                  getFieldMetricDirection={getFieldMetricDirection}
                  originalFieldState={originalFieldState}
                  onOriginalFieldChange={setOriginalFieldState}
                />
              </div>

              {analysisExplanation && (
                <ErrorBoundary>
                  <AnalysisExplainer explanation={analysisExplanation} />
                </ErrorBoundary>
              )}

              {selectedField && outlierExclusion.detectionValues.length > 0 && stats && (
                <ErrorBoundary>
                  <OutlierPanel
                    selectedField={selectedField}
                    values={outlierExclusion.detectionValues}
                    rowIndices={outlierExclusion.detectionRowIndices}
                    excludedRowIndices={outlierExclusion.excludedRowIndices}
                    onExcludeChange={outlierExclusion.setExcludedRowIndices}
                    filteredRowCount={effectiveAnalysisDataset?.rows.length ?? 0}
                    contextRows={effectiveAnalysisDataset?.rows}
                    schemas={effectiveAnalysisDataset?.fields}
                  />
                </ErrorBoundary>
              )}
            </section>
            </ErrorBoundary>
          )}

          {viewContext?.groupStats && viewContext.groupStats.length > 0 && (
            <ErrorBoundary>
            <section style={styles.section}>
              <div style={styles.positionHeader}>
                <h2 style={styles.sectionTitle}>分组分析 <HelpPopover content={getHelp('group')} /></h2>
                <button
                  className="copy-btn"
                  style={styles.exportButton}
                  onClick={handleExportGroupAnalysis}
                >
                  导出分组分析 CSV
                </button>
              </div>
              <GroupBarChart
                groupStats={viewContext.groupStats}
                metricField={selectedField}
                dimensionField={selectedDimension}
              />
              <GroupAnalysis
                groupStats={viewContext.groupStats}
                metricField={selectedField}
                dimensionField={selectedDimension}
              />
            </section>
            </ErrorBoundary>
          )}

          {viewContext?.groupStats !== null && viewContext?.groupStats !== undefined && viewContext.groupStats.length === 0 && selectedField && selectedDimension && (
            <section style={{ ...styles.section, ...styles.errorSection }}>
              <p style={styles.errorText}>
                所选维度【{selectedDimension}】下没有可分析的数值数据，请检查指标字段和维度字段是否匹配。
              </p>
            </section>
          )}
        </>
      )}

      {/* 调试面板开关：仅开发环境 */}
      {import.meta.env.DEV && (
        <>
          <button
            onClick={() => setShowDebugPanel((prev: boolean) => !prev)}
            style={{
              position: 'fixed',
              right: isNarrowScreen ? 8 : 16,
              bottom: isNarrowScreen ? 8 : 16,
              zIndex: 9999,
              padding: isNarrowScreen ? '6px 10px' : '8px 16px',
              backgroundColor: showDebugPanel ? '#ef4444' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: isNarrowScreen ? '12px' : '14px',
              opacity: isNarrowScreen ? 0.78 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {isNarrowScreen ? '调试' : (showDebugPanel ? '隐藏调试面板' : '显示调试面板')}
          </button>

          {showDebugPanel && selectedField && metricResult && (
            <div style={{
              position: 'fixed',
              right: isNarrowScreen ? 8 : 16,
              bottom: isNarrowScreen ? 40 : 60,
              zIndex: 9998,
              maxWidth: isNarrowScreen ? 'calc(100% - 16px)' : '400px',
              maxHeight: '60vh',
              overflow: 'auto',
            }}>
              <ErrorBoundary>
                <DebugPanel
                  context={derivedData}
                  metricResult={metricResult}
                  selectedField={selectedField}
                  metricDef={metricDefs.find(m => m.name === selectedField)}
                />
              </ErrorBoundary>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card-hover" style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function PositionItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.positionItem}>
      <div style={styles.positionLabel}>{label}</div>
      <div style={styles.positionValue}>{value}</div>
    </div>
  );
}

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={styles.summaryItem}>
      <span style={styles.summaryLabel}>{label}：</span>
      <span style={{ ...styles.summaryValue, ...(highlight ? styles.summaryHighlight : {}) }}>{value}</span>
    </div>
  );
}

// ─── 样式（与 App.tsx 保持一致） ──────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  section: { background: '#fff', borderRadius: '14px', padding: '20px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(99,102,241,0.04)', transition: 'box-shadow 0.2s, transform 0.2s', border: '1px solid rgba(226, 232, 240, 0.8)' },
  sectionTitle: { margin: '0 0 14px', fontSize: '16px', fontWeight: 600, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' },
  chartHelpRow: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' },
  chartHelpLabel: { fontSize: '14px', fontWeight: 600, color: '#334155' },
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