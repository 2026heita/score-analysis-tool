import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { parseTableText } from './utils/parseTable';
import { calculateStats, calculatePosition, formatNumber } from './utils/stats';
import { saveState, loadSavedState, clearSavedState, getSystemDefaultState } from './utils/storage';
import type { ParsedTable, StatsResult, PositionResult, ChartTab, OriginalFieldRadarState, TraditionalSubjectEntry } from './types';
import UsageGuide from './components/UsageGuide';
import ChartTabs from './components/charts/ChartTabs';
import HistogramChart from './components/charts/HistogramChart';
import BoxPlotChart from './components/charts/BoxPlotChart';
import CdfChart from './components/charts/CdfChart';
import RadarAnalysis from './components/charts/RadarAnalysis';
import QuartilePieChart from './components/charts/QuartilePieChart';

const EXCLUDED_KEYWORDS = ['名次', '排名', '序号', '编号', '序号号'];

export default function App() {
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

  const savedState = useMemo(() => loadSavedState(), []);

  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [selectedField, setSelectedField] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('histogram');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [originalFieldState, setOriginalFieldState] = useState<OriginalFieldRadarState>(
    savedState?.originalFieldRadar ?? { selections: [], viewMode: 'bar' }
  );
  const [traditionalEntries, setTraditionalEntries] = useState<TraditionalSubjectEntry[]>(
    savedState?.traditionalSubjectRadar?.entries ?? getSystemDefaultState().traditionalSubjectRadar.entries
  );

  // ===== 自动保存 =====
  useEffect(() => {
    try {
      saveState({
        version: 1,
        rawText,
        selectedField,
        inputValue,
        showAllFields,
        activeChartTab,
        originalFieldRadar: originalFieldState,
        traditionalSubjectRadar: { entries: traditionalEntries },
        analysisMode: 'scoreRate',
      } as any);
    } catch { /* 静默 */ }
  }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, traditionalEntries]);

  // ===== 页面加载后恢复保存状态并自动解析 =====
  useEffect(() => {
    // 恢复保存的状态
    if (savedState?.rawText) {
      setRawText(savedState.rawText);
      setSelectedField(savedState.selectedField ?? '');
      setInputValue(savedState.inputValue ?? '');
      setShowAllFields(savedState.showAllFields ?? false);
      setActiveChartTab((savedState.activeChartTab as ChartTab) ?? 'histogram');
    }

    const textToParse = savedState?.rawText || rawText;
    if (textToParse.trim()) {
      try {
        const result = parseTableText(textToParse);
        setParsedData(result);
        setParseWarnings(result.warnings || []);
        setParseError(null);
      } catch { /* 忽略 */ }
    }
  }, []);

  // ===== 字段值提取 =====
  const rawFieldValues = useMemo(() => {
    if (!parsedData || !selectedField) return [];
    return parsedData.rows.map(row => {
      const val = row[selectedField];
      if (val === undefined || val === '' || val === null) return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    });
  }, [parsedData, selectedField]);

  const fieldValues = useMemo(() => {
    return rawFieldValues.filter((v): v is number => v !== null && Number.isFinite(v));
  }, [rawFieldValues]);

  // ===== 字段判断 =====
  const isNumericField = useCallback((header: string): boolean => {
    if (!parsedData) return false;
    const values = parsedData.rows.map(row => {
      const val = row[header];
      if (val === undefined || val === '' || val === null) return null;
      const num = parseFloat(val);
      return isNaN(num) ? null : num;
    });
    const numericCount = values.filter((v): v is number => v !== null).length;
    return numericCount > parsedData.rows.length * 0.5;
  }, [parsedData]);

  const shouldExclude = useCallback((header: string): boolean => {
    return EXCLUDED_KEYWORDS.some(kw => header.includes(kw));
  }, []);

  const availableFields = useMemo(() => {
    if (!parsedData) return [];
    if (showAllFields) return parsedData.headers.filter(h => isNumericField(h));
    return parsedData.headers.filter(h => isNumericField(h) && !shouldExclude(h));
  }, [parsedData, showAllFields, isNumericField, shouldExclude]);

  // ===== 自动选中字段 =====
  useEffect(() => {
    if (!parsedData) return;
    if (availableFields.length === 0) { setSelectedField(''); return; }

    // 如果用户已保存了有效字段，不覆盖
    if (selectedField && availableFields.includes(selectedField)) return;

    // 自动选择字段：优先"外语单科成绩"，否则第一个
    const preferred = availableFields.includes('外语单科成绩') ? '外语单科成绩' : availableFields[0];
    setSelectedField(preferred);
  }, [availableFields, selectedField, parsedData]);

  // ===== 统计计算（先定义，供后续 useCallback 使用） =====
  const stats: StatsResult | null = useMemo(() => {
    if (!parsedData || !selectedField || fieldValues.length === 0) return null;
    return calculateStats(rawFieldValues, parsedData.rows.length);
  }, [rawFieldValues, parsedData, selectedField, fieldValues]);

  const position: PositionResult | null = useMemo(() => {
    if (!inputValue || fieldValues.length === 0) return null;
    const val = parseFloat(inputValue);
    if (isNaN(val)) return null;
    return calculatePosition(fieldValues, val);
  }, [fieldValues, inputValue]);

  const inputNum = inputValue ? parseFloat(inputValue) : NaN;
  const hasInputError = inputValue.trim() !== '' && isNaN(inputNum);

  // ===== 自然语言总结 =====
  const summaryText = useMemo(() => {
    if (!position || !stats || isNaN(inputNum)) return '';
    const numStr = formatNumber(inputNum);
    if (position.existsInData) {
      return `你的【${selectedField}】为 ${numStr} 分。全表 ${position.total} 人中，高于你的人有 ${position.higherCount} 人，与你同分的有 ${position.equalCount} 人。你的名次区间为第 ${position.bestRank} 名 ~ 第 ${position.worstRank} 名，约高于 ${position.percentile.toFixed(1)}% 的有效数据。`;
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
    saveState({
      version: 1,
      rawText,
      selectedField,
      inputValue,
      showAllFields,
      activeChartTab,
      originalFieldRadar: originalFieldState,
      traditionalSubjectRadar: { entries: traditionalEntries },
      analysisMode: 'scoreRate',
    } as any);
    setSaveMsg('已保存当前输入');
    setTimeout(() => setSaveMsg(null), 2000);
  }, [rawText, selectedField, inputValue, showAllFields, activeChartTab, originalFieldState, traditionalEntries]);

  const handleReset = useCallback(() => {
    const def = getSystemDefaultState();
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
    saveState(def as any);
    setSaveMsg('已恢复默认设置');
    setTimeout(() => setSaveMsg(null), 2000);
    // textarea 回到顶部
    setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
  }, []);

  const handleClear = useCallback(() => {
    clearSavedState();
    setRawText(''); setParsedData(null); setParseError(null); setParseWarnings([]);
    setSelectedField(''); setInputValue(''); setShowAllFields(false);
    setActiveChartTab('histogram');
    setOriginalFieldState({ selections: [], viewMode: 'bar' });
    setTraditionalEntries(getSystemDefaultState().traditionalSubjectRadar.entries);
    setSaveMsg('已清空数据');
    setTimeout(() => setSaveMsg(null), 2000);
  }, []);

  const handleFillSample = useCallback(() => {
    if (rawText.trim() && !window.confirm('当前输入会被示例数据覆盖，是否继续？')) return;
    const def = getSystemDefaultState();
    setRawText(def.rawText);
    try {
      const result = parseTableText(def.rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
      setSelectedField('外语单科成绩');
      setInputValue('117');
      setActiveChartTab('histogram');
      // textarea 回到顶部
      setTimeout(() => { textareaRef.current?.scrollTo({ top: 0 }); }, 0);
    } catch { /* 静默 */ }
  }, [rawText]);

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
    lines.push('【成绩分析摘要】');
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
        <h1 style={styles.title}>成绩分析工具</h1>
        <p style={styles.subtitle}>粘贴表格数据，快速分析成绩分布与排名</p>
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
          <p style={styles.hint}>建议直接从 Excel 复制整块表格后粘贴到下方文本框中。</p>
          <p style={styles.rowLimitHint}>建议单次粘贴数据量不超过 2 万行。数据量过大时，浏览器可能出现卡顿。</p>
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
          {parseWarnings.map((w, i) => (
            <p key={i} style={styles.warning}>{w}</p>
          ))}
        </section>

        {!parsedData && !parseError && (
          <p style={styles.emptyHint}>请先粘贴表格数据。</p>
        )}

        {parsedData && availableFields.length === 0 && (
          <section style={{ ...styles.section, ...styles.errorSection }}>
            <p style={styles.errorText}>当前表格没有可分析的数值字段。</p>
          </section>
        )}

        {parsedData && availableFields.length > 0 && (
          <>
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
              <div style={styles.settingsRow}>
                <div style={styles.settingItem}>
                  <label style={styles.settingLabel}>分析字段</label>
                  <select style={styles.select} value={selectedField} onChange={e => setSelectedField(e.target.value)}>
                    {availableFields.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
                <div style={styles.settingItem}>
                  <label style={styles.settingLabel}>你的数值</label>
                  <input type="number" style={styles.input} placeholder="输入成绩" value={inputValue} onChange={e => setInputValue(e.target.value)} />
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
            )}

            {position && stats && !isNaN(inputNum) && (
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
            )}

            {parsedData && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>图表分析</h2>

                {selectedField && fieldValues.length > 0 && (
                  <>
                    <ChartTabs activeTab={activeChartTab} onChange={setActiveChartTab} />
                    {activeChartTab === 'histogram' && <HistogramChart values={fieldValues} fieldName={selectedField} userValue={isNaN(inputNum) ? undefined : inputNum} />}
                    {activeChartTab === 'boxplot' && <BoxPlotChart values={fieldValues} fieldName={selectedField} stats={stats ? { min: stats.min, q25: stats.q25, median: stats.median, q75: stats.q75, max: stats.max } : undefined} userValue={isNaN(inputNum) ? undefined : inputNum} />}
                    {activeChartTab === 'cdf' && <CdfChart values={fieldValues} fieldName={selectedField} userValue={isNaN(inputNum) ? undefined : inputNum} />}
                    {activeChartTab === 'quartile' && <QuartilePieChart values={fieldValues} fieldName={selectedField} userValue={isNaN(inputNum) ? undefined : inputNum} />}
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
              </section>
            )}
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerVersion}>版本：v0.1.0 本地 Demo</div>
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

function formatComparisonText(input: number, ref: number): string {
  if (!Number.isFinite(input) || !Number.isFinite(ref)) return '-';
  const diff = input - ref;
  if (Math.abs(diff) < 0.005) return '持平';
  const absDiff = Number.isInteger(Math.abs(diff)) ? Math.abs(diff).toString() : Math.abs(diff).toFixed(2);
  return diff > 0 ? `高 ${absDiff} 分` : `低 ${absDiff} 分`;
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b' },
  header: { background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', color: '#fff', padding: '28px 24px', textAlign: 'center' },
  title: { margin: '0 0 4px', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 14px', fontSize: '14px', opacity: 0.85, fontWeight: 400 },
  headerActions: { display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' },
  headerButton: { padding: '4px 12px', background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' },
  saveMsg: { margin: '8px 0 0', fontSize: '12px', color: '#86efac', fontWeight: 500 },
  main: { maxWidth: '800px', margin: '0 auto', padding: '20px 16px' },
  section: { background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s' },
  sectionTitle: { margin: '0 0 14px', fontSize: '16px', fontWeight: 600, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' },
  hint: { margin: '0 0 10px', fontSize: '13px', color: '#64748b', background: '#f0f7ff', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #3b82f6' },
  textarea: { width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', outline: 'none' },
  parseRow: { display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' },
  parseButton: { padding: '10px 24px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', transition: 'box-shadow 0.15s' },
  sampleButton: { padding: '10px 24px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' },
  copyButton: { padding: '4px 12px', background: '#f0f7ff', color: '#3b82f6', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s' },
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
  statCard: { background: '#f8fafc', borderRadius: '8px', padding: '12px', textAlign: 'center', transition: 'transform 0.15s, box-shadow 0.15s' },
  statLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
  statValue: { fontSize: '18px', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' },
  positionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' },
  summaryBox: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 16px', fontSize: '14px', lineHeight: 1.7, color: '#1e40af', marginBottom: '16px' },
  positionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' },
  positionItem: { background: '#f8fafc', borderRadius: '8px', padding: '12px', textAlign: 'center' },
  positionLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
  positionValue: { fontSize: '15px', fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' },
  positionHighlight: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px', textAlign: 'center' },
  positionHighlightLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px' },
  positionHighlightValue: { fontSize: '22px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' },
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
};
