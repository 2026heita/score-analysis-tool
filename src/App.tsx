import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { usePersistedState } from './hooks/usePersistedState';
import { useParsedTable } from './hooks/useParsedTable';
import { latestAppVersion } from './data/updateLogs';
import { APP_NAME } from './config/app';
import type { ChartTab, OriginalFieldRadarState, ParsedTable } from './types';
import UsageGuide from './components/UsageGuide';
import UpdateNotice from './components/UpdateNotice';
import { clearOriginalFieldRadarCache } from './components/charts/OriginalFieldRadar';
import SampleDataSelector from './components/SampleDataSelector';
import { isNumericField as checkIsNumericField } from './engine/analysisEngine';
import type { SampleDataset } from './data/sampleDatasets';
import { useFilterState } from './hooks/useFilterState';
import { useGroupAnalysis } from './hooks/useGroupAnalysis';
import { useAnalysisDataset } from './hooks/useAnalysisDataset';
import { calculateFieldAnalyticScore } from './utils/tableParser/fieldClassifier';
import { createHeroDataFlowSelection } from './data/heroDataFlowPool';
import { RetailBiConnectionForm } from './components/RetailBiConnectionForm';

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
  const {
    rawText, setRawText,
    parsedData,
    parseError,
    parseWarnings,
    fileError,
    parseSummary,
    availableSheets,
    selectedSheet,
    isParsing,
    parseReport,
    textareaRef,
    activeTableId,
    dataVolumeState, // Stage 0A-1: 数据量状态
    handleParse,
    handleFileUpload,
    handleSheetChange,
    loadSampleDataset,
    clearParsedTable,
    applyExternalParsedTable, // 零售 BI 数据注入
  } = useParsedTable();

  // ===== 用户交互状态 =====
  const [selectedField, setSelectedField] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('histogram');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [originalFieldState, setOriginalFieldState] = useState<OriginalFieldRadarState>(
    savedState?.originalFieldRadar ?? { selections: [], viewMode: 'bar' }
  );
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // ===== Hero 数据流候选池选择（惰性初始化，确保文本稳定） =====
  const [heroDataFlowTexts] = useState(() => createHeroDataFlowSelection());

  // ===== Stage 0A-1: 分析能力判断 =====
  const canAnalyze = useMemo(() => {
    return (
      parsedData != null &&
      dataVolumeState?.isParseTruncated !== true
    );
  }, [parsedData, dataVolumeState]);

  // ===== v1.3 Hooks：筛选 / 分组 / 导出 =====
  const {
    filterConditions, setFilterConditions,
    filterCollapsed, setFilterCollapsed,
    numericFieldSet,
    filterResult,
    filteredParsedData,
    resetFilter,
  } = useFilterState(canAnalyze ? parsedData : null, parseSummary, activeTableId);

  // ===== Stage 0A-2: 统一分析数据集 =====
  // 生成稳定的 filterRevision（基于筛选条件序列化）
  const filterRevision = useMemo(() => {
    if (!filterConditions.length) return 0;
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
  
  const {
    dataset: analysisDataset,
    confirmDataset,
    cancelDataset,
  } = useAnalysisDataset(filteredParsedData, activeTableId, filterRevision);

  const {
    selectedDimension, setSelectedDimension,
    availableDimensions,
    resetGroupAnalysis,
  } = useGroupAnalysis(
    analysisDataset?.status === 'ready_full' || analysisDataset?.status === 'ready_sampled' ? filteredParsedData : null,
    parseSummary,
    analysisDataset
  );

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
      setActiveChartTab((savedState.activeChartTab as ChartTab) ?? 'histogram');
      setOriginalFieldState(savedState.originalFieldRadar ?? { selections: [], viewMode: 'bar' });
      setFilterConditions(savedState.filterConditions ?? [{ field: '', operator: 'equals', value: '' }]);
      setSelectedDimension(savedState.selectedDimension ?? '');
    }
  }, []);

  // ===== 字段判断（使用统一分析引擎） =====
  const isNumericField = useCallback((header: string): boolean => {
    // Stage 1A-1: 优先使用 analysisDataset.fields
    if (analysisDataset?.fields && analysisDataset.fields.length > 0) {
      const schema = analysisDataset.fields.find(f => f.fieldId === header);
      return schema?.dataType === 'number';
    }
    // Fallback: 使用旧逻辑
    if (!parsedData) return false;
    return checkIsNumericField(parsedData.rows, header);
  }, [parsedData, analysisDataset]);

  const shouldExclude = useCallback((header: string): boolean => {
    // Stage 1A-1: 优先使用 analysisDataset.fields
    if (analysisDataset?.fields && analysisDataset.fields.length > 0) {
      const schema = analysisDataset.fields.find(f => f.fieldId === header);
      if (!schema) return false;
      // ignored 或未指定的字段应排除
      return schema.analysisRole === 'ignored' || schema.analysisRole === 'unspecified';
    }
    // Fallback: 使用旧逻辑
    if (!parseSummary?.fieldTypes) return false;
    const meta = parseSummary.fieldTypes.find(f => f.header === header);
    if (!meta) return false;
    const score = calculateFieldAnalyticScore(meta);
    return !score.isAnalyzable;
  }, [parseSummary, analysisDataset]);

  const getFieldAnalysisRole = useCallback((header: string): string => {
    // Stage 1A-1: 优先使用 analysisDataset.fields
    if (analysisDataset?.fields && analysisDataset.fields.length > 0) {
      const schema = analysisDataset.fields.find(f => f.fieldId === header);
      if (!schema) return 'unknown';
      // 映射 ResolvedFieldSchema.analysisRole 到旧角色名称（兼容 UI）
      switch (schema.analysisRole) {
        case 'metric':
          // 根据 metricDirection 判断具体类型
          if (schema.metricDirection === 'lower_is_better') return 'rank';
          return 'courseScore'; // 默认映射为 courseScore
        case 'dimension':
          return 'identity'; // 维度字段映射为 identity
        case 'identifier':
          return 'identity';
        case 'time':
          return 'textMeta';
        case 'description':
          return 'textMeta';
        case 'ignored':
          return 'invalid';
        default:
          return 'unknown';
      }
    }
    // Fallback: 使用旧逻辑
    if (!parseSummary?.fieldTypes) return 'unknown';
    const meta = parseSummary.fieldTypes.find(f => f.header === header);
    return meta?.analysisRole || 'unknown';
  }, [parseSummary, analysisDataset]);

  const isRecommendedField = useCallback((header: string): boolean => {
    // Stage 1A-1: 优先使用 analysisDataset.fields
    if (analysisDataset?.fields && analysisDataset.fields.length > 0) {
      const schema = analysisDataset.fields.find(f => f.fieldId === header);
      if (!schema) return false;
      // metric 类型的字段推荐
      return schema.analysisRole === 'metric';
    }
    // Fallback: 使用旧逻辑
    const role = getFieldAnalysisRole(header);
    return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
  }, [getFieldAnalysisRole, analysisDataset]);

  const availableFields = useMemo(() => {
    if (!parsedData) return [];
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
    if (!parsedData || showAllFields) return false;
    const recommended = parsedData.headers.filter(h => isRecommendedField(h) && !shouldExclude(h));
    return recommended.length === 0 && availableFields.length > 0;
  }, [parsedData, showAllFields, isRecommendedField, shouldExclude, availableFields]);

  const groupedFields = useMemo(() => {
    if (!parsedData || !showAllFields) return null;

    const recommended: string[] = [];
    const adjustment: string[] = [];
    const identity: string[] = [];
    const textMeta: string[] = [];
    const others: string[] = [];

    for (const header of parsedData.headers) {
      const role = getFieldAnalysisRole(header);
      if (role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore') {
        recommended.push(header);
      } else if (role === 'adjustment') {
        adjustment.push(header);
      } else if (role === 'identity') {
        identity.push(header);
      } else if (role === 'textMeta') {
        textMeta.push(header);
      } else {
        others.push(header);
      }
    }

    return { recommended, adjustment, identity, textMeta, others };
  }, [parsedData, showAllFields, getFieldAnalysisRole]);

  // ===== 事件处理 =====
  const handleParseWithReset = useCallback(() => {
    handleParse();
    setActiveChartTab('histogram');
  }, [handleParse]);

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
    setActiveChartTab(def.activeChartTab as ChartTab);
    resetGroupAnalysis();
    resetFilter();
    setOriginalFieldState(def.originalFieldRadar);
    save(def);
    setSaveMsg('已恢复默认设置');
    setTimeout(() => setSaveMsg(null), 2000);
    setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
  }, [getDefault, save, setRawText, textareaRef, resetFilter, resetGroupAnalysis]);

  const handleClear = useCallback(() => {
    clear();
    clearOriginalFieldRadarCache();
    clearParsedTable();
    setSelectedField(''); setInputValue(''); setShowAllFields(false);
    resetGroupAnalysis();
    resetFilter();
    setActiveChartTab('histogram');
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setSaveMsg('已清空数据');
    setTimeout(() => setSaveMsg(null), 2000);
  }, [clear, clearParsedTable, resetFilter, resetGroupAnalysis]);

  // ===== 零售 BI 数据加载回调 =====
  const handleRetailBiDataLoaded = useCallback(
    (table: ParsedTable) => {
      // 使用 applyExternalParsedTable 安全注入数据
      // 该方法内部处理：版本控制、rawText 清空、skipNextRawTextEffect 标志、所有状态注入
      applyExternalParsedTable(table);

      // 重置用户交互状态
      setSelectedField('');
      setInputValue('');
      setShowAllFields(false);
      setActiveChartTab('histogram');
      setOriginalFieldState({ selections: [], viewMode: 'bar' });
      clearOriginalFieldRadarCache();
      resetGroupAnalysis();
      resetFilter();
    },
    [
      applyExternalParsedTable,
      resetFilter,
      resetGroupAnalysis,
    ],
  );

  const handleFillSample = useCallback(() => {
    setShowSampleSelector(true);
  }, []);

  const handleLoadSampleDataset = useCallback((dataset: SampleDataset) => {
    if (rawText.trim() && !window.confirm('当前输入会被示例数据覆盖，是否继续？')) return;

    clearOriginalFieldRadarCache();
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setSelectedField('');
    setInputValue('');
    resetGroupAnalysis();
    resetFilter();
    setActiveChartTab('histogram');

    loadSampleDataset(dataset.headers, dataset.rows);
    setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
  }, [rawText, textareaRef, resetFilter, resetGroupAnalysis, loadSampleDataset]);

  const handleFileUploadWithReset = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    clearOriginalFieldRadarCache();
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setSelectedField('');
    handleFileUpload(e);
    setActiveChartTab('histogram');
  }, [handleFileUpload]);

  const handleSheetChangeWithReset = useCallback((sheetName: string) => {
    clearOriginalFieldRadarCache();
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setSelectedField('');
    handleSheetChange(sheetName);
  }, [handleSheetChange]);

  // ===== 渲染 =====
  return (
    <div style={styles.container}>
      <div style={styles.heroWrapper}>
        <header style={styles.header}>
          {/* 动态光晕背景 */}
          <div className="hero-glow hero-glow-1" />
          <div className="hero-glow hero-glow-2" />
          {/* 科技装饰网格 */}
          <div className="hero-grid-decoration" />

          <div className="hero-foreground">
            <h1 className="hero-title-shimmer" style={styles.title}>{APP_NAME}</h1>
            <p style={styles.subtitle}>粘贴表格数据，快速分析数据分布、统计特征与相对位置</p>
            <div style={styles.headerActions}>
              <button className="hero-btn-primary" onClick={handleSave}>保存当前输入</button>
              <button className="hero-btn-secondary" onClick={() => { if (window.confirm('确定恢复默认设置？当前输入会被覆盖。')) handleReset(); }}>恢复默认</button>
              <button className="hero-btn-secondary" style={{ color: '#fca5a5', borderColor: 'rgba(252, 165, 165, 0.3)' }} onClick={() => { if (window.confirm('确定清空所有数据？')) handleClear(); }}>清空数据</button>
            </div>
            {/* 信息标签 */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
              <span className="hero-info-tag">🔒 浏览器本地处理</span>
              <span className="hero-info-tag"> 支持 Excel / CSV</span>
              <span className="hero-info-tag">⚡ 快速分析</span>
            </div>
            {saveMsg && <p style={styles.saveMsg}>{saveMsg}</p>}
          </div>
        </header>

        {/* 数据流动画层：放在 header 外，避免 overflow:hidden 裁切 */}
        <div className="hero-data-flow" aria-hidden="true">
          {heroDataFlowTexts.map((text, index) => (
            <div 
              key={`hero-data-element-${index + 1}`} 
              className={`hero-data-element hero-data-element-${index + 1}`}
            >
              {text}
            </div>
          ))}
        </div>
      </div>

      <main style={styles.main}>
        {/* 数据输入区 */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>数据输入</h2>
          <UsageGuide />
          <UpdateNotice />
          <p style={styles.hint}>可直接粘贴表格，或上传 CSV / Excel 文件；也可加载示例数据或使用下方的外部数据源。</p>
          <p style={styles.rowLimitHint}>建议单次加载的数据量不超过 2 万行。数据量过大时，浏览器可能出现卡顿。</p>
          <div style={styles.fileUploadRow}>
            <label style={styles.fileUploadLabel}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                style={styles.fileInput}
                onChange={handleFileUploadWithReset}
              />
              <span style={styles.fileUploadButton}>上传 CSV / Excel 文件</span>
            </label>
            <span style={styles.fileUploadNote}>文件只在浏览器本地解析，不上传服务器。</span>
          </div>
          <SampleDataSelector
            isOpen={showSampleSelector}
            onSelect={handleLoadSampleDataset}
            onClose={() => setShowSampleSelector(false)}
          />
          <textarea
            ref={textareaRef}
            style={styles.textarea}
            placeholder="粘贴表格数据&#10;第一行为字段名，后续行为数据&#10;支持 Tab、逗号、多空格分隔"
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={8}
          />
          <div style={styles.parseRow}>
            <button className="parse-btn" style={styles.parseButton} onClick={handleParseWithReset}>解析数据</button>
            <button className="sample-btn" style={styles.sampleButton} onClick={handleFillSample}>填入示例数据</button>
          </div>

          {/* 外部数据源入口 */}
          <div style={{ marginTop: '20px' }}>
            <RetailBiConnectionForm onDataLoaded={handleRetailBiDataLoaded} />
          </div>

          {parseError && <p style={styles.error}>{parseError}</p>}
          {fileError && <p style={styles.error}>{fileError}</p>}
          {isParsing && <p style={styles.loading}>正在解析文件...</p>}
          {parseWarnings.map((w, i) => (
            <p key={i} style={styles.warning}>{w}</p>
          ))}
        </section>

        {!parsedData && !parseError && (
          <p style={styles.emptyHint}>请先粘贴、上传或加载一份数据。</p>
        )}

        {parsedData && dataVolumeState?.isParseTruncated && (
          <section style={{ ...styles.card, marginTop: '20px', borderColor: '#f59e0b', backgroundColor: '#fef3c7' }}>
            <h3 style={{ margin: '0 0 12px', color: '#92400e', fontSize: '16px' }}>⚠️ 数据量超出分析上限</h3>
            <p style={{ margin: '0 0 8px', color: '#78350f', fontSize: '14px', lineHeight: '1.6' }}>
              当前数据包含 <strong>{dataVolumeState.rawRowCount.toLocaleString()}</strong> 行，超出系统分析上限（20,000 行）。
            </p>
            <p style={{ margin: '0 0 8px', color: '#78350f', fontSize: '14px', lineHeight: '1.6' }}>
              已解析前 <strong>{dataVolumeState.parsedRowCount.toLocaleString()}</strong> 行用于数据预览，但<strong>不生成正式分析结果</strong>。
            </p>
            {dataVolumeState.parseTruncationWarning && (
              <p style={{ margin: '8px 0 0', color: '#92400e', fontSize: '13px', fontStyle: 'italic' }}>
                {dataVolumeState.parseTruncationWarning}
              </p>
            )}
            <p style={{ margin: '12px 0 0', color: '#78350f', fontSize: '13px', fontWeight: '500' }}>
              请减少数据量后重新解析，或联系技术支持获取企业版全量分析能力。
            </p>
          </section>
        )}

        {parsedData && !dataVolumeState?.isParseTruncated && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }}>加载分析引擎...</div>}>
            <AnalysisSection
              parsedData={parsedData}
              parseSummary={parseSummary}
              parseReport={parseReport}
              filteredParsedData={filteredParsedData}
              filterResult={filterResult}
              filterConditions={filterConditions}
              setFilterConditions={setFilterConditions}
              filterCollapsed={filterCollapsed}
              setFilterCollapsed={setFilterCollapsed}
              numericFieldSet={numericFieldSet}
              analysisDataset={analysisDataset}
              confirmDataset={confirmDataset}
              cancelDataset={cancelDataset}
              selectedDimension={selectedDimension}
              setSelectedDimension={setSelectedDimension}
              availableDimensions={availableDimensions}
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              inputValue={inputValue}
              setInputValue={setInputValue}
              showAllFields={showAllFields}
              setShowAllFields={setShowAllFields}
              activeChartTab={activeChartTab}
              setActiveChartTab={setActiveChartTab}
              originalFieldState={originalFieldState}
              setOriginalFieldState={setOriginalFieldState}
              availableSheets={availableSheets}
              selectedSheet={selectedSheet}
              handleSheetChange={handleSheetChangeWithReset}
              isNumericField={isNumericField}
              getFieldAnalysisRole={getFieldAnalysisRole}
              availableFields={availableFields}
              isFallbackFieldMode={isFallbackFieldMode}
              groupedFields={groupedFields}
              analysisExplanationRef={{ parsedData, originalFieldState, parseSummary }}
              showDebugPanel={showDebugPanel}
              setShowDebugPanel={setShowDebugPanel}
            />
          </Suspense>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerVersion}>版本：{latestAppVersion}</div>
        <div style={styles.footerSection}>
          <div style={styles.footerLabel}>说明：</div>
          <p style={styles.footerText}>本工具仅基于当前加载的数据进行统计分析，不代表官方评价或业务结论。若当前数据不是完整全量数据，百分位、相对位置和图表结果可能存在偏差。</p>
        </div>
        <div style={styles.footerSection}>
          <div style={styles.footerLabel}>隐私：</div>
          <p style={styles.footerText}>本地文件、粘贴文本和示例数据默认在浏览器中处理；使用外部数据源时，页面会请求你配置的服务地址。本地保存的输入与设置仅存储在当前浏览器中，不会在不同设备或浏览器之间自动同步。</p>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b', position: 'relative', zIndex: 1 },
  heroWrapper: { position: 'relative' },
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