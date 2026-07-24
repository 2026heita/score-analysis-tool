/**
 * useParsedTable - 表格解析 Hook
 * 
 * 职责：管理表格文本/文件输入 → 解析 → 结果的全流程
 * 
 * 封装内容：
 * - rawText / parsedData / parseError / parseWarnings 等状态
 * - 文本解析（handleParse）
 * - 文件导入（handleFileUpload）
 * - Sheet 切换（handleSheetChange）
 * - 自动解析（rawText 变化时）
 * - 解析报告派生（parseReport）
 * - 清空/重置（clearParsedTable / resetParsedTable）
 * - 异步版本控制（防止旧结果覆盖新数据）
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { parseTableText } from '../utils/parseTable';
import { parseTableFile, type ParsedFileResult } from '../utils/fileImport';
import { buildParseReport } from '../utils/tableParser';
import type { ParsedTable, DataVolumeState } from '../types';
import type { ParseSummary } from '../utils/tableParser/types';

let _tableIdCounter = 0;

export interface UseParsedTableReturn {
  rawText: string;
  setRawText: (text: string) => void;
  parsedData: ParsedTable | null;
  setParsedData: (data: ParsedTable | null) => void;
  parseError: string | null;
  setParseError: (err: string | null) => void;
  parseWarnings: string[];
  setParseWarnings: (warnings: string[]) => void;
  fileError: string | null;
  setFileError: (err: string | null) => void;
  parseSummary: ParseSummary | null;
  setParseSummary: (summary: ParseSummary | null) => void;
  availableSheets: string[] | null;
  setAvailableSheets: (sheets: string[] | null) => void;
  selectedSheet: string | null;
  setSelectedSheet: (sheet: string | null) => void;
  isParsing: boolean;
  setIsParsing: (v: boolean) => void;
  parseReport: ReturnType<typeof buildParseReport> | null;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleParse: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSheetChange: (sheetName: string) => void;
  loadSampleDataset: (headers: string[], rows: Record<string, string | number | null>[]) => void;
  clearParsedTable: () => void;
  resetParsedTable: () => void;
  /** v1.4：统一表切换标识，每次数据变更时自增，驱动下游 hook 重置 */
  activeTableId: number;
  /** Stage 0A-1：数据量状态（记录解析阶段的行数口径信息） */
  dataVolumeState: DataVolumeState | null;
  setDataVolumeState: (v: DataVolumeState | null) => void;
}

export function useParsedTable(): UseParsedTableReturn {
  const [rawText, setRawTextState] = useState('');
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[] | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [activeTableId, setActiveTableId] = useState(() => ++_tableIdCounter);
  
  // Stage 0A-1: 数据量状态
  const [dataVolumeState, setDataVolumeState] = useState<DataVolumeState | null>(null);

  // Stage 0A-1: 内部更新守卫（防止 file upload / sheet switch 触发二次解析）
  const pendingInternalRawTextRef = useRef<string | null>(null);
  
  // Stage 0A-1: 异步解析版本控制（防止旧解析结果覆盖新数据）
  const parseVersionRef = useRef(0);

  // 组件卸载标记（防止卸载后写状态）
  const isMountedRef = useRef(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null!);

  // 组件卸载时设置标记
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 安全的状态设置函数（组件卸载后不写状态）
  const safeSetState = useCallback(<T>(setter: (v: T) => void, value: T) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  // ===== v1.4：数据源变更时自增 activeTableId，驱动下游 hook 重置 =====
  useEffect(() => {
    if (parsedData) {
      setActiveTableId(++_tableIdCounter);
    }
  }, [parsedData, selectedSheet]);

  // ===== 解析报告派生 =====
  const parseReport = useMemo(() => {
    if (!parsedData || !parseSummary?.fieldTypes) return null;
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

  // ===== 应用解析结果（原子化，避免重复代码 =====
  const applyParseResult = useCallback((result: ParsedTable) => {
    if (!isMountedRef.current) return;
    setParsedData(result);
    setParseWarnings(result.warnings || []);
    setParseError(null);
    if (result.dataVolumeState) {
      setDataVolumeState(result.dataVolumeState);
    }
    if (result.summary) {
      setParseSummary(result.summary);
    }
  }, []);

  // ===== 清空所有解析状态 =====
  const clearParseState = useCallback(() => {
    if (!isMountedRef.current) return;
    setParsedData(null);
    setParseWarnings([]);
    setParseError(null);
    setParseSummary(null);
    setDataVolumeState(null);
    setFileError(null);
    setAvailableSheets(null);
    setSelectedSheet(null);
    setIsParsing(false);
  }, []);

  // ===== 自定义 setRawText：用户编辑时递增版本号 =====
  const setRawText = useCallback((text: string) => {
    if (!isMountedRef.current) return;
    
    // 如果是内部同步更新，不递增版本号
    if (pendingInternalRawTextRef.current === text) {
      pendingInternalRawTextRef.current = null;
      setRawTextState(text);
      return;
    }
    
    // 用户编辑：立即递增版本号，使旧的异步请求失效
    parseVersionRef.current++;
    pendingInternalRawTextRef.current = null;
    setRawTextState(text);
  }, []);

  // ===== 自动解析已粘贴的数据 =====
  useEffect(() => {
    if (!rawText.trim()) {
      // 空文本时清空解析结果
      clearParseState();
      return;
    }
    
    // 检查是否为内部同步更新
    if (pendingInternalRawTextRef.current === rawText) {
      // 消费内部更新标记，不重新解析
      pendingInternalRawTextRef.current = null;
      return;
    }
    
    // 用户输入处理：执行解析
    try {
      const result = parseTableText(rawText);
      applyParseResult(result);
    } catch { /* 忽略 */ }
  }, [rawText, applyParseResult, clearParseState]);

  // ===== 手动解析 =====
  const handleParse = useCallback(() => {
    if (!rawText.trim()) {
      setParseError('请先粘贴表格数据。');
      setParsedData(null);
      setParseSummary(null);
      return;
    }
    try {
      const result = parseTableText(rawText);
      applyParseResult(result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败');
      setParsedData(null);
      setParseSummary(null);
    }
  }, [rawText, applyParseResult]);

  // ===== 文件上传 =====
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 递增版本号，使旧请求失效
    const currentVersion = ++parseVersionRef.current;
    
    safeSetState(setFileError, null);
    safeSetState(setParseSummary, null);
    safeSetState(setAvailableSheets, null);
    safeSetState(setSelectedSheet, null);
    safeSetState(setIsParsing, true);

    if (file.size > 5 * 1024 * 1024) {
      setTimeout(() => {
        if (parseVersionRef.current === currentVersion && isMountedRef.current) {
          setParseWarnings(['文件较大，解析可能需要几秒，请耐心等待...']);
        }
      }, 100);
    }

    parseTableFile(file)
      .then(result => {
        // 版本检查：丢弃旧结果
        if (parseVersionRef.current !== currentVersion) return;
        if (!isMountedRef.current) return;
        
        applyParseResult(result);
        safeSetState(setIsParsing, false);

        // 合并警告
        const warnings = [...(result.warnings || [])];
        if (result.dataVolumeState?.isParseTruncated && result.dataVolumeState.parseTruncationWarning) {
          warnings.push(result.dataVolumeState.parseTruncationWarning);
        }
        safeSetState(setParseWarnings, warnings);

        if (result.availableSheets && result.availableSheets.length > 1) {
          safeSetState(setAvailableSheets, result.availableSheets);
        }
        
        // 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
        const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
        pendingInternalRawTextRef.current = text;
        safeSetState(setRawTextState, text);
      })
      .catch(err => {
        // 版本检查
        if (parseVersionRef.current !== currentVersion) return;
        if (!isMountedRef.current) return;
        
        safeSetState(setFileError, err instanceof Error ? err.message : '文件解析失败');
        safeSetState(setParsedData, null);
        safeSetState(setParseWarnings, []);
        safeSetState(setParseSummary, null);
        safeSetState(setIsParsing, false);
      });
    e.target.value = '';
  }, [applyParseResult, safeSetState]);

  // ===== Sheet 切换 =====
  const handleSheetChange = useCallback((sheetName: string) => {
    safeSetState(setSelectedSheet, sheetName);
    if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
      // 递增版本号，使旧请求失效
      const currentVersion = ++parseVersionRef.current;
      
      (parsedData as ParsedFileResult).reparseSheet!(sheetName)
        .then(result => {
          // 版本检查：丢弃旧结果
          if (parseVersionRef.current !== currentVersion) return;
          if (!isMountedRef.current) return;
          
          applyParseResult(result);

          // 合并警告
          const warnings = [...(result.warnings || [])];
          if (result.dataVolumeState?.isParseTruncated && result.dataVolumeState.parseTruncationWarning) {
            warnings.push(result.dataVolumeState.parseTruncationWarning);
          }
          safeSetState(setParseWarnings, warnings);

          if (result.summary) {
            safeSetState(setParseSummary, result.summary);
          }

          // 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
          const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
          pendingInternalRawTextRef.current = text;
          safeSetState(setRawTextState, text);
        })
        .catch(err => {
          // 版本检查
          if (parseVersionRef.current !== currentVersion) return;
          if (!isMountedRef.current) return;
          
          safeSetState(setFileError, err instanceof Error ? err.message : '切换工作表失败');
        });
    }
  }, [parsedData, applyParseResult, safeSetState]);

  // ===== 加载示例数据集 =====
  const loadSampleDataset = useCallback((headers: string[], rows: Record<string, string | number | null>[]) => {
    // 递增版本号
    parseVersionRef.current++;
    
    // 构建文本数据
    const text = [
      headers.join('\t'),
      ...rows.map(row => headers.map(h => row[h] ?? '').join('\t'))
    ].join('\n');

    // 设置内部更新标记，防止二次解析
    pendingInternalRawTextRef.current = text;
    safeSetState(setRawTextState, text);

    // 执行解析
    try {
      const result = parseTableText(text);
      applyParseResult(result);
    } catch (e) {
      safeSetState(setParseError, e instanceof Error ? e.message : '解析失败');
      safeSetState(setParsedData, null);
      safeSetState(setParseSummary, null);
    }
  }, [applyParseResult, safeSetState]);

  // ===== 清空表格（保留 rawText 为空，清除所有解析结果）
  const clearParsedTable = useCallback(() => {
    // 递增版本号，使所有旧异步请求失效
    parseVersionRef.current++;
    pendingInternalRawTextRef.current = null;
    safeSetState(setRawTextState, '');
    clearParseState();
  }, [clearParseState, safeSetState]);

  // ===== 重置表格（完全重置到初始状态）
  const resetParsedTable = useCallback(() => {
    // 递增版本号
    parseVersionRef.current++;
    pendingInternalRawTextRef.current = null;
    safeSetState(setRawTextState, '');
    clearParseState();
  }, [clearParseState, safeSetState]);

  return {
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
    handleParse,
    handleFileUpload,
    handleSheetChange,
    loadSampleDataset,
    clearParsedTable,
    resetParsedTable,
    activeTableId,
    dataVolumeState,
    setDataVolumeState,
  };
}
