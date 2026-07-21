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
import type { ChartTab, OriginalFieldRadarState, ParsedTable } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';
import type { FilterCondition } from '../engine/filterRows';

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
    isNumericField, getFieldAnalysisRole,
    availableFields, isFallbackFieldMode, groupedFields,
    analysisExplanationRef,
    showDebugPanel, setShowDebugPanel,
  } = props;

  // ===== v1.5 Orchestration：统一调度层 =====
  const {
    core: { metricResult, correlationResult },
    derived: { derivedData },
    view: { viewContext },
    metricDefs,
  } = useAnalysisOrchestrator(analysisDataset, parseSummary, selectedField, inputValue, selectedDimension);

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
    if (!metricResult) return null;
    return {
      histogram: toHistogramProps(metricResult),
      boxplot: toBoxPlotProps(metricResult),
      cdf: toCdfProps(metricResult),
      quartile: toQuartilePieProps(metricResult),
    };
  }, [metricResult]);

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
          const num = parseFloat(val);
          return isNaN(num) ? null : num;
        })
        .filter((v): v is number => v !== null && Number.isFinite(v));
      if (values.length > 0) fieldData[field] = values;
    }

    if (Object.keys(fieldValues).length === 0) return null;
    return generateExplanation(fieldValues, fieldData, rankFields);
  }, [analysisExplanationRef, analysisDataset]);

  // ===== 计算值 =====
  const inputNum = inputValue ? parseFloat(inputValue) : NaN;
  const hasInputError = inputValue.trim() !== '' && isNaN(inputNum);

  const summaryText = useMemo(() => {
    if (!position || !stats || isNaN(inputNum)) return '';
    const numStr = formatNumber(inputNum);
    if (position.existsInData) {
      return `你的【${selectedField}】为 ${numStr}。全表 ${position.total} 人中，高于你的人有 ${position.higherCount} 人，与你同分的有 ${position.equalCount} 人。你的名次区间为第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名，约高于 ${safeFormatPercent(position.percentile)} 的有效数据。`;
    }
    return `该值在表中不存在。如果按该值插入全表，估算名次为第 ${position.estimatedRank} 名，约高于 ${safeFormatPercent(position.percentile)} 的有效数据。`;
  }, [position, stats, selectedField, inputNum]);

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
    if (!stats || !position || !selectedField) return;
    const lines: string[] = [];
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
    } else {
      lines.push(`估算名次：第 ${position.estimatedRank} 名`);
      lines.push('该值在表中不存在，名次为插入估算结果。');
    }
    lines.push(`百分位：约高于 ${safeFormatPercent(position.percentile)} 的有效数据`);
    lines.push('');
    lines.push('三、口径说明');
    lines.push('百分位口径：低于该值人数 / 有效数值数量 × 100%。');
    lines.push('同分情况下使用名次区间，不强行给出单一名次。');

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
    return diff > 0 ? `高 ${absDiff} 分` : `低 ${absDiff} 分`;
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
              <h2 style={styles.sectionTitle}>识别摘要</h2>
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
            <section style={{ ...styles.section, ...styles.errorSection }}>
              <p style={styles.errorText}>
                当前筛选条件下无可分析数据，请调整筛选条件后重试。
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
                <label style={styles.settingLabel}>分析字段</label>
                <select style={styles.select} value={selectedField} onChange={e => setSelectedField(e.target.value)}>
                  {showAllFields && groupedFields ? (
                    <>
                      {groupedFields.recommended?.length > 0 && (
                        <optgroup label="推荐分析字段">
                          {groupedFields.recommended.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.adjustment?.length > 0 && (
                        <optgroup label="加扣分/调整项">
                          {groupedFields.adjustment.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.identity?.length > 0 && (
                        <optgroup label="身份信息">
                          {groupedFields.identity.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </optgroup>
                      )}
                      {groupedFields.textMeta?.length > 0 && (
                        <optgroup label="文本/备注字段">
                          {groupedFields.textMeta.map(header => (
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
                <label style={styles.settingLabel}>你的数值</label>
                <input type="number" style={styles.input} placeholder="输入数值" value={inputValue} onChange={e => setInputValue(e.target.value)} />
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
                  <label style={styles.settingLabel}>分组维度（可选）</label>
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
              <p style={styles.hint}>请输入你的数值后再查看排名定位。</p>
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
            </section>
            </ErrorBoundary>
          )}

          {position && stats && !isNaN(inputNum) && (
            <ErrorBoundary>
            <section style={styles.section}>
              <div style={styles.positionHeader}>
                <h2 style={styles.sectionTitle}>排名定位</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="copy-btn" style={styles.copyButton} onClick={handleCopySummary}>复制分析摘要</button>
                  <button
                    className="copy-btn"
                    style={styles.exportButton}
                    disabled={!stats && !position}
                    onClick={handleExportMetricSummary}
                  >
                    导出指标摘要 CSV
                  </button>
                </div>
              </div>

              {summaryText && <div style={styles.summaryBox}>{summaryText}</div>}

              <div style={styles.positionGrid}>
                <PositionItem label="与平均值对比" value={formatComparisonText(inputNum, stats.mean)} />
                <PositionItem label="与中位数对比" value={formatComparisonText(inputNum, stats.median)} />
                <PositionItem label="低于该值人数" value={`${position.lowerCount} 人`} />
                <PositionItem label="等于该值人数" value={`${position.equalCount} 人`} />
                <PositionItem label="高于该值人数" value={`${position.higherCount} 人`} />
                {position.existsInData ? (
                  <PositionItem label="名次区间" value={`第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名`} />
                ) : (
                  <PositionItem label="估算名次" value={`第 ${position.estimatedRank} 名`} />
                )}
              </div>

              <div style={styles.positionHighlight}>
                <div style={styles.positionHighlightLabel}>百分位</div>
                <div style={styles.positionHighlightValue}>约 {safeFormatPercent(position.percentile)}</div>
              </div>

              <p style={styles.note}>百分位口径：低于该值人数 / 有效数值数量 × 100%。</p>

              {!position.existsInData && (
                <p style={styles.warning}>你的数值超出当前字段数据范围，排名结果仅作为插入估算。</p>
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
                  <ChartTabs activeTab={activeChartTab} onChange={setActiveChartTab} />
                  {activeChartTab === 'histogram' && <HistogramChart {...chartProps.histogram} />}
                  {activeChartTab === 'boxplot' && <BoxPlotChart {...chartProps.boxplot} />}
                  {activeChartTab === 'cdf' && <CdfChart {...chartProps.cdf} />}
                  {activeChartTab === 'quartile' && <QuartilePieChart {...chartProps.quartile} />}
                </>
              )}

              {selectedField && fieldValues.length === 0 && (
                <div style={styles.emptyChart}>暂无可视化数据</div>
              )}

              <div style={styles.radarSection}>
                <RadarAnalysis
                  headers={parsedData.headers}
                  rows={parsedData.rows}
                  isNumericField={isNumericField}
                  getFieldAnalysisRole={getFieldAnalysisRole}
                  originalFieldState={originalFieldState}
                  onOriginalFieldChange={setOriginalFieldState}
                />
              </div>

              {analysisExplanation && (
                <ErrorBoundary>
                  <AnalysisExplainer explanation={analysisExplanation} />
                </ErrorBoundary>
              )}

              {selectedField && fieldValues && stats && fieldValues.length > 0 && (
                <ErrorBoundary>
                  <OutlierPanel
                    selectedField={selectedField}
                    values={fieldValues}
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
                <h2 style={styles.sectionTitle}>分组分析</h2>
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
            }}
          >
            {showDebugPanel ? '隐藏调试面板' : '显示调试面板'}
          </button>

          {showDebugPanel && selectedField && metricResult && (
            <div style={{
              position: 'fixed',
              right: 16,
              bottom: 60,
              zIndex: 9998,
              maxWidth: '400px',
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