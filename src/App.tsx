import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { parseTableText } from './utils/parseTable';
import { parseTableFile, type ParsedFileResult } from './utils/fileImport';
import { formatNumber } from './utils/stats';
import { usePersistedState } from './hooks/usePersistedState';
import { buildParseReport } from './utils/tableParser';
import { generateExplanation } from './utils/analysisExplainer';
import { APP_VERSION } from './config/version';
import type { ParsedTable, StatsResult, PositionResult, ChartTab, OriginalFieldRadarState, TraditionalSubjectEntry } from './types';
import type { ParseSummary } from './utils/tableParser/types';
import UsageGuide from './components/UsageGuide';
import UpdateNotice from './components/UpdateNotice';
import ChartTabs from './components/charts/ChartTabs';
import HistogramChart from './components/charts/HistogramChart';
import BoxPlotChart from './components/charts/BoxPlotChart';
import CdfChart from './components/charts/CdfChart';
import RadarAnalysis from './components/charts/RadarAnalysis';
import QuartilePieChart from './components/charts/QuartilePieChart';
import ParseReportPanel from './components/ParseReportPanel';
import AnalysisExplainer from './components/AnalysisExplainer';
import GeneralDataOverview from './components/GeneralDataOverview';
import RelationshipAnalysisPanel from './components/RelationshipAnalysisPanel';
import SampleDataSelector from './components/SampleDataSelector';
import { analyzeCorrelationsFromContext } from './engine/correlationAnalyzer';
import { isNumericField as checkIsNumericField } from './engine/analysisEngine';
import { buildAnalysisContext } from './engine/context';
import { computeMetric } from './engine/analysisEngine';
import { buildSemanticDefinitions } from './engine/metricLayer';
import { toHistogramProps, toBoxPlotProps, toCdfProps, toQuartilePieProps } from './engine/chartAdapter';
import { DebugPanel } from './components/DebugPanel';
import type { SampleDataset } from './data/sampleDatasets';
import { ErrorBoundary } from './components/ErrorBoundary';

const EXCLUDED_KEYWORDS = ['名次', '排名', '序号', '编号', '序号号'];

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

  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('histogram');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // ===== 解析报告派生（只读，不修改任何状态） =====
  const parseReport = useMemo(() => {
    if (!parsedData || !parseSummary?.fieldTypes) return null;
    // recommended 基于 analysisRole 判断，不依赖 showAllFields 开关
    const recommendedFields = parseSummary.fieldTypes
      .filter(meta => {
        const role = meta.analysisRole;
        return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
      })
      .map(meta => meta.header);
    return buildParseReport(
      parsedData.headers,
      parsedData.rows,
      parseSummary.fieldTypes,
      recommendedFields
    );
  }, [parsedData, parseSummary]);

  // ===== 构建统一分析上下文（AnalysisContext） =====
  const analysisContext = useMemo(() => {
    if (!parsedData || !parseSummary?.fieldTypes) return null;
    
    const semanticDefs = buildSemanticDefinitions(parseSummary.fieldTypes);
    
    return buildAnalysisContext(
      parseSummary.fieldTypes,
      parsedData.rows,
      semanticDefs.metrics,
      semanticDefs.dimensions
    );
  }, [parsedData, parseSummary]);

  // ===== 相关性分析派生（只读，不修改任何状态） =====
  const correlationResult = useMemo(() => {
    if (!analysisContext) return null;
    return analyzeCorrelationsFromContext(analysisContext);
  }, [analysisContext]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [originalFieldState, setOriginalFieldState] = useState<OriginalFieldRadarState>(
    savedState?.originalFieldRadar ?? { selections: [], viewMode: 'bar' }
  );
  const [traditionalEntries, setTraditionalEntries] = useState<TraditionalSubjectEntry[]>(
    savedState?.traditionalSubjectRadar?.entries ?? []
  );
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // ===== 分析解释派生（只读，不修改任何状态） =====
  const analysisExplanation = useMemo(() => {
    if (!parsedData || !originalFieldState?.selections?.length) return null;
    
    // 构建排名字段集合（用于反转百分位计算方向）
    const rankFields = new Set<string>();
    if (parseSummary?.fieldTypes) {
      for (const meta of parseSummary.fieldTypes) {
        if (meta.analysisRole === 'rank') {
          rankFields.add(meta.header);
        }
      }
    }
    
    // 构建 fieldValues 和 fieldData
    const fieldValues: Record<string, number> = {};
    const fieldData: Record<string, number[]> = {};
    
    for (const selection of originalFieldState.selections) {
      const { field, userValue } = selection;
      if (!field || userValue === undefined || isNaN(userValue)) continue;
      
      fieldValues[field] = userValue;
      
      // 提取该字段的所有数据
      const values = parsedData.rows
        .map(row => {
          const val = row[field];
          if (val === undefined || val === '' || val === null) return null;
          const num = parseFloat(val);
          return isNaN(num) ? null : num;
        })
        .filter((v): v is number => v !== null && Number.isFinite(v));
      
      if (values.length > 0) {
        fieldData[field] = values;
      }
    }
    
    if (Object.keys(fieldValues).length === 0) return null;
    
    return generateExplanation(fieldValues, fieldData, rankFields);
  }, [parsedData, originalFieldState, parseSummary]);

  // ===== 自动保存 =====
  useEffect(() => {
    save({
      version: 2,
      rawText,
      selectedField,
      inputValue,
      showAllFields,
      activeChartTab,
      originalFieldRadar: originalFieldState,
      traditionalSubjectRadar: { entries: traditionalEntries },
      analysisMode: 'scoreRate',
    });
  }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, traditionalEntries, save]);

  // ===== 页面加载后恢复保存状态 =====
  useEffect(() => {
    if (savedState?.rawText) {
      setRawText(savedState.rawText);
      setSelectedField(savedState.selectedField ?? '');
      setInputValue(savedState.inputValue ?? '');
      setShowAllFields(savedState.showAllFields ?? false);
      setActiveChartTab((savedState.activeChartTab as ChartTab) ?? 'histogram');
      setOriginalFieldState(savedState.originalFieldRadar ?? { selections: [], viewMode: 'bar' });
      setTraditionalEntries(savedState.traditionalSubjectRadar?.entries ?? []);
    }
  }, []);

  // ===== 自动解析已粘贴的数据 =====
  useEffect(() => {
    if (!rawText.trim()) return;
    try {
      const result = parseTableText(rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
    } catch { /* 忽略 */ }
  }, [rawText]);

  // ===== 使用 computeMetric 计算指标结果 =====
  const metricResult = useMemo(() => {
    if (!analysisContext || !selectedField) return null;
    
    const userValue = inputValue ? parseFloat(inputValue) : undefined;
    return computeMetric(analysisContext, selectedField, userValue);
  }, [analysisContext, selectedField, inputValue]);

  // ===== 从 metricResult 提取 stats 和 position =====
  const stats: StatsResult | null = useMemo(() => {
    return metricResult?.stats || null;
  }, [metricResult]);

  const position: PositionResult | null = useMemo(() => {
    return metricResult?.position || null;
  }, [metricResult]);

  const fieldValues = useMemo(() => {
    return metricResult?.values || [];
  }, [metricResult]);

  // ===== 字段判断（使用统一分析引擎） =====
  const isNumericField = useCallback((header: string): boolean => {
    if (!parsedData) return false;
    return checkIsNumericField(parsedData.rows, header);
  }, [parsedData]);

  const shouldExclude = useCallback((header: string): boolean => {
    return EXCLUDED_KEYWORDS.some(kw => header.includes(kw));
  }, []);

  // 获取字段的 analysisRole（从 parseSummary.fieldTypes）
  const getFieldAnalysisRole = useCallback((header: string): string => {
    if (!parseSummary?.fieldTypes) return 'unknown';
    const meta = parseSummary.fieldTypes.find(f => f.header === header);
    return meta?.analysisRole || 'unknown';
  }, [parseSummary]);

  // 判断是否为推荐分析字段（基于 analysisRole）
  const isRecommendedField = useCallback((header: string): boolean => {
    const role = getFieldAnalysisRole(header);
    // 只推荐 primaryTotal、rank、sectionTotal、courseScore
    return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
  }, [getFieldAnalysisRole]);

  const availableFields = useMemo(() => {
    if (!parsedData) return [];
    if (showAllFields) {
      // 显示全部字段时，返回所有字段（用于分组显示）
      return parsedData.headers;
    }
    // 默认视图：只显示推荐分析字段
    const recommended = parsedData.headers.filter(h => isRecommendedField(h) && !shouldExclude(h));
    
    // 兜底：如果推荐字段为空，但有数值字段，提供手动选择入口
    if (recommended.length === 0 && parsedData.headers.length > 0) {
      // 找出数值比例较高的 unknown 字段（排除 identity/textMeta/invalid）
      const numericCandidates = parsedData.headers.filter(h => {
        const role = getFieldAnalysisRole(h);
        // 排除身份、文本、无效字段
        if (role === 'identity' || role === 'textMeta' || role === 'invalid' || role === 'adjustment') {
          return false;
        }
        // 检查是否为数值字段
        return isNumericField(h) && !shouldExclude(h);
      });
      
      if (numericCandidates.length > 0) {
        // 返回数值候选字段，但不自动推荐，只提供手动选择入口
        return numericCandidates;
      }
    }
    
    return recommended;
  }, [parsedData, showAllFields, isRecommendedField, shouldExclude, getFieldAnalysisRole, isNumericField]);

  // 判断是否处于兜底状态（recommendedFields 为空但存在数值候选字段）
  const isFallbackFieldMode = useMemo(() => {
    if (!parsedData || showAllFields) return false;
    const recommended = parsedData.headers.filter(h => isRecommendedField(h) && !shouldExclude(h));
    return recommended.length === 0 && availableFields.length > 0;
  }, [parsedData, showAllFields, isRecommendedField, shouldExclude, availableFields]);

  // 分组字段（用于"显示全部字段"时的 optgroup）
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

  const inputNum = inputValue ? parseFloat(inputValue) : NaN;
  const hasInputError = inputValue.trim() !== '' && isNaN(inputNum);

  // ===== 自然语言总结 =====
  const summaryText = useMemo(() => {
    if (!position || !stats || isNaN(inputNum)) return '';
    const numStr = formatNumber(inputNum);
    if (position.existsInData) {
      return `你的【${selectedField}】为 ${numStr}。全表 ${position.total} 人中，高于你的人有 ${position.higherCount} 人，与你同分的有 ${position.equalCount} 人。你的名次区间为第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名，约高于 ${position.percentile.toFixed(1)}% 的有效数据。`;
    }
    return `该值在表中不存在。如果按该值插入全表，估算名次为第 ${position.estimatedRank} 名，约高于 ${position.percentile.toFixed(1)}% 的有效数据。`;
  }, [position, stats, selectedField, inputNum]);

  // ===== 事件处理（部分依赖于 stats/position，必须在它们之后定义） =====
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
  }, [rawText]);

  const handleSave = useCallback(() => {
    save({
      version: 1,
      rawText,
      selectedField,
      inputValue,
      showAllFields,
      activeChartTab,
      originalFieldRadar: originalFieldState,
      traditionalSubjectRadar: { entries: traditionalEntries },
      analysisMode: 'scoreRate',
    });
    setSaveMsg('已保存当前输入');
    setTimeout(() => setSaveMsg(null), 2000);
  }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, traditionalEntries, save]);

  const handleReset = useCallback(() => {
    const def = getDefault();
    setRawText(def.rawText);
    setSelectedField(def.selectedField);
    setInputValue(def.inputValue);
    setShowAllFields(def.showAllFields);
    setActiveChartTab(def.activeChartTab as ChartTab);
    setOriginalFieldState(def.originalFieldRadar);
    setTraditionalEntries(def.traditionalSubjectRadar.entries);
    try {
      const result = parseTableText(def.rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
    } catch { setParsedData(null); }
    save(def);
    setSaveMsg('已恢复默认设置');
    setTimeout(() => setSaveMsg(null), 2000);
    // textarea 回到顶部
    setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
  }, [getDefault, save]);

  const handleClear = useCallback(() => {
    clear();
    setRawText(''); setParsedData(null); setParseError(null); setParseWarnings([]);
    setSelectedField(''); setInputValue(''); setShowAllFields(false);
    setActiveChartTab('histogram');
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setTraditionalEntries([]);
    setSaveMsg('已清空数据');
    setTimeout(() => setSaveMsg(null), 2000);
  }, [clear]);

  const handleFillSample = useCallback(() => {
    setShowSampleSelector(true);
  }, []);

  const handleLoadSampleDataset = useCallback((dataset: SampleDataset) => {
    if (rawText.trim() && !window.confirm('当前输入会被示例数据覆盖，是否继续？')) return;

    // 清空旧状态
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setTraditionalEntries([]);
    setSelectedField('');
    setInputValue('');
    setActiveChartTab('histogram');
    setParseSummary(null);

    // 将示例数据转换为文本格式
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

      // textarea 回到顶部
      setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
    } catch { /* 静默 */ }
  }, [rawText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setParseSummary(null);
    setAvailableSheets(null);
    setSelectedSheet(null);
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setIsParsing(true);
    
    // 大文件提示
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
        
        // 大表格提示
        if (result.rows.length > 5000) {
          setParseWarnings([
            ...result.warnings,
            `当前数据量较大（${result.rows.length} 行），为避免卡顿，所有分析结果（包括排名、百分位等）仅基于前 5000 行数据计算。如需全表分析，请谨慎核对结果。`
          ]);
        }
        
        // 保存解析摘要
        if (result.summary) {
          setParseSummary(result.summary);
          // 自动选择推荐字段
          if (result.summary.recommendedField) {
            setSelectedField(result.summary.recommendedField);
          }
        }
        // 保存可用 sheet 列表
        if (result.availableSheets && result.availableSheets.length > 1) {
          setAvailableSheets(result.availableSheets);
        }
        // 将文件内容也转为文本填入 textarea，方便保存
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
    // 重置 input，允许重复选择同一文件
    e.target.value = '';
  }, []);

  // 切换 sheet 重新解析
  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    // 需要重新上传文件来解析不同 sheet，这里提示用户
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
  }, [parsedData]);

  const fallbackCopy = useCallback((text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setSaveMsg('已复制分析摘要');
    } catch {
      setSaveMsg('当前浏览器不支持自动复制，请手动复制。');
    }
    setTimeout(() => setSaveMsg(null), 3000);
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
    lines.push(`百分位：约高于 ${position.percentile.toFixed(1)}% 的有效数据`);
    lines.push('');
    lines.push('三、口径说明');
    lines.push('百分位口径：低于该值人数 / 有效数值数量 × 100%。');
    lines.push('同分情况下使用名次区间，不强行给出单一名次。');

    const text = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setSaveMsg('已复制分析摘要');
        setTimeout(() => setSaveMsg(null), 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }, [stats, position, selectedField, inputValue, fallbackCopy]);

  // ===== 渲染 =====
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>表格数据分析工具</h1>
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

        {parsedData && availableFields.length === 0 && (
          <section style={{ ...styles.section, ...styles.errorSection }}>
            <p style={styles.errorText}>
              {(() => {
                // 诊断不同原因显示不同提示
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

        {parsedData && availableFields.length > 0 && (
          <>
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
                <ParseReportPanel report={parseReport} />
              </section>
            )}

            <ErrorBoundary>
            <section style={styles.section}>
              <GeneralDataOverview headers={parsedData.headers} rows={parsedData.rows} />
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
              </div>
            </section>

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
                        {groupedFields.recommended.length > 0 && (
                          <optgroup label="推荐分析字段">
                            {groupedFields.recommended.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </optgroup>
                        )}
                        {groupedFields.adjustment.length > 0 && (
                          <optgroup label="加扣分/调整项">
                            {groupedFields.adjustment.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </optgroup>
                        )}
                        {groupedFields.identity.length > 0 && (
                          <optgroup label="身份信息">
                            {groupedFields.identity.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </optgroup>
                        )}
                        {groupedFields.textMeta.length > 0 && (
                          <optgroup label="文本/备注字段">
                            {groupedFields.textMeta.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </optgroup>
                        )}
                        {groupedFields.others.length > 0 && (
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
                  <button className="copy-btn" style={styles.copyButton} onClick={handleCopySummary}>复制分析摘要</button>
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
                  <div style={styles.positionHighlightValue}>约 {position.percentile.toFixed(1)}%</div>
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

                {selectedField && metricResult && (
                  <>
                    <ChartTabs activeTab={activeChartTab} onChange={setActiveChartTab} />
                    {activeChartTab === 'histogram' && <HistogramChart {...toHistogramProps(metricResult)} />}
                    {activeChartTab === 'boxplot' && <BoxPlotChart {...toBoxPlotProps(metricResult)} />}
                    {activeChartTab === 'cdf' && <CdfChart {...toCdfProps(metricResult)} />}
                    {activeChartTab === 'quartile' && <QuartilePieChart {...toQuartilePieProps(metricResult)} />}
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
                    originalFieldState={originalFieldState}
                    traditionalEntries={traditionalEntries}
                    onOriginalFieldChange={setOriginalFieldState}
                    onTraditionalChange={setTraditionalEntries}
                  />
                </div>

                {analysisExplanation && (
                  <ErrorBoundary>
                    <AnalysisExplainer explanation={analysisExplanation} />
                  </ErrorBoundary>
                )}
              </section>
              </ErrorBoundary>
            )}
          </>
        )}
      </main>

      {/* 调试面板开关：仅开发环境 */}
      {import.meta.env.DEV && (
        <>
          <button
            onClick={() => setShowDebugPanel(prev => !prev)}
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
                  context={analysisContext}
                  metricResult={metricResult}
                  selectedField={selectedField}
                />
              </ErrorBoundary>
            </div>
          )}
        </>
      )}

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

function formatComparisonText(input: number, ref: number): string {
  if (!Number.isFinite(input) || !Number.isFinite(ref)) return '-';
  const diff = input - ref;
  if (Math.abs(diff) < 0.005) return '持平';
  const absDiff = Number.isInteger(Math.abs(diff)) ? Math.abs(diff).toString() : Math.abs(diff).toFixed(2);
  return diff > 0 ? `高 ${absDiff} 分` : `低 ${absDiff} 分`;
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
