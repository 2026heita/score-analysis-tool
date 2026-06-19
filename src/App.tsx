import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { parseTableText } from './utils/parseTable';
import { parseTableFile, type ParsedFileResult } from './utils/fileImport';
import { usePersistedState } from './hooks/usePersistedState';
import { useParsedTable } from './hooks/useParsedTable';
import { APP_VERSION } from './config/version';
import { APP_NAME } from './config/app';
import type { ChartTab, OriginalFieldRadarState } from './types';
import UsageGuide from './components/UsageGuide';
import UpdateNotice from './components/UpdateNotice';
import { clearOriginalFieldRadarCache } from './components/charts/OriginalFieldRadar';
import SampleDataSelector from './components/SampleDataSelector';
import { isNumericField as checkIsNumericField } from './engine/analysisEngine';
import type { SampleDataset } from './data/sampleDatasets';
import { useFilterState } from './hooks/useFilterState';
import { useGroupAnalysis } from './hooks/useGroupAnalysis';
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
  const {
    rawText, setRawText,
    parsedData, setParsedData,
    parseError, setParseError,
    parseWarnings, setParseWarnings,
    fileError, setFileError,
    parseSummary, setParseSummary,
    availableSheets, setAvailableSheets,
    selectedSheet, setSelectedSheet,
    isParsing, setIsParsing,
    parseReport,
    textareaRef,
    activeTableId,
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

  // ===== v1.3 Hooks：筛选 / 分组 / 导出 =====
  const {
    filterConditions, setFilterConditions,
    filterCollapsed, setFilterCollapsed,
    numericFieldSet,
    filterResult,
    filteredParsedData,
    resetFilter,
  } = useFilterState(parsedData, parseSummary, activeTableId);

  const {
    selectedDimension, setSelectedDimension,
    availableDimensions,
    resetGroupAnalysis,
  } = useGroupAnalysis(filteredParsedData, parseSummary);

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
    if (!parsedData) return false;
    return checkIsNumericField(parsedData.rows, header);
  }, [parsedData]);

  const shouldExclude = useCallback((header: string): boolean => {
    if (!parseSummary?.fieldTypes) return false;
    const meta = parseSummary.fieldTypes.find(f => f.header === header);
    if (!meta) return false;
    const score = calculateFieldAnalyticScore(meta);
    return !score.isAnalyzable;
  }, [parseSummary]);

  const getFieldAnalysisRole = useCallback((header: string): string => {
    if (!parseSummary?.fieldTypes) return 'unknown';
    const meta = parseSummary.fieldTypes.find(f => f.header === header);
    return meta?.analysisRole || 'unknown';
  }, [parseSummary]);

  const isRecommendedField = useCallback((header: string): boolean => {
    const role = getFieldAnalysisRole(header);
    return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
  }, [getFieldAnalysisRole]);

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
    } catch (e) {
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
    setActiveChartTab(def.activeChartTab as ChartTab);
    resetGroupAnalysis();
    resetFilter();
    setOriginalFieldState(def.originalFieldRadar);
    try {
      const result = parseTableText(def.rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
    } catch { setParsedData(null); }
    save(def);
    setSaveMsg('已恢复默认设置');
    setTimeout(() => setSaveMsg(null), 2000);
    setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
  }, [getDefault, save, setRawText, setParsedData, setParseWarnings, setParseError, textareaRef, resetFilter, resetGroupAnalysis]);

  const handleClear = useCallback(() => {
    clear();
    clearOriginalFieldRadarCache();
    setRawText(''); setParsedData(null); setParseError(null); setParseWarnings([]);
    setSelectedField(''); setInputValue(''); setShowAllFields(false);
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

  const handleLoadSampleDataset = useCallback((dataset: SampleDataset) => {
    if (rawText.trim() && !window.confirm('当前输入会被示例数据覆盖，是否继续？')) return;

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
    } catch { /* 静默 */ }
  }, [rawText, setRawText, setParsedData, setParseWarnings, setParseError, setParseSummary, textareaRef, resetFilter, resetGroupAnalysis]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

        if (result.rows.length > 5000) {
          setParseWarnings([
            ...result.warnings,
            `当前数据量较大（${result.rows.length} 行），为避免卡顿，所有分析结果（包括排名、百分位等）仅基于前 5000 行数据计算。如需全表分析，请谨慎核对结果。`
          ]);
        }

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

  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    clearOriginalFieldRadarCache();
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
      (parsedData as ParsedFileResult).reparseSheet!(sheetName)
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
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>{APP_NAME}</h1>
        <p style={styles.subtitle}>粘贴表格数据，快速分析数据分布、排名与相对位置</p>
        <div style={styles.headerActions}>
          <button className="header-btn" style={styles.headerButton} onClick={handleSave}>保存当前输入</button>
          <button className="header-btn" style={styles.headerButton} onClick={() => { if (window.confirm('确定恢复默认设置？当前输入会被覆盖。')) handleReset(); }}>恢复默认</button>
          <button className="header-btn" style={{ ...styles.headerButton, color: '#fca5a5' }} onClick={() => { if (window.confirm('确定清空所有数据？')) handleClear(); }}>清空数据</button>
        </div>
        {saveMsg && <p style={styles.saveMsg}>{saveMsg}</p>}
      </header>

      <main style={styles.main}>
        {/* 数据输入区 */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>数据输入</h2>
          <UsageGuide />
          <UpdateNotice />
          <p style={styles.hint}>建议直接从 Excel 复制整块表格后粘贴到下方文本框中。</p>
          <p style={styles.rowLimitHint}>建议单次粘贴数据量不超过 2 万行。数据量过大时，浏览器可能出现卡顿。</p>
          <div style={styles.fileUploadRow}>
            <label style={styles.fileUploadLabel}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                style={styles.fileInput}
                onChange={handleFileUpload}
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
            <button className="parse-btn" style={styles.parseButton} onClick={handleParse}>解析数据</button>
            <button className="sample-btn" style={styles.sampleButton} onClick={handleFillSample}>填入示例数据</button>
          </div>
          {parseError && <p style={styles.error}>{parseError}</p>}
          {fileError && <p style={styles.error}>{fileError}</p>}
          {isParsing && <p style={styles.loading}>正在解析文件...</p>}
          {parseWarnings.map((w, i) => (
            <p key={i} style={styles.warning}>{w}</p>
          ))}
        </section>

        {!parsedData && !parseError && (
          <p style={styles.emptyHint}>请先粘贴表格数据。</p>
        )}

        {parsedData && (
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
              handleSheetChange={handleSheetChange}
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
        <div style={styles.footerVersion}>版本：{APP_VERSION}</div>
        <div style={styles.footerSection}>
          <div style={styles.footerLabel}>说明：</div>
          <p style={styles.footerText}>本工具仅基于用户粘贴的数据进行统计分析，不代表官方排名结果。若输入数据不是完整全量数据，百分位、名次区间和图表结果可能失真。</p>
        </div>
        <div style={styles.footerSection}>
          <div style={styles.footerLabel}>隐私：</div>
          <p style={styles.footerText}>本工具在浏览器本地运行，数据默认不上传服务器。保存内容仅存储在当前浏览器中。不同用户、不同设备、不同浏览器之间的数据互不共享。</p>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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