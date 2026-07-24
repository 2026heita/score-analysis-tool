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
  /** v1.4：统一表切换标识，每次数据变更时自增，驱动下游 hook 重置 */
  activeTableId: number;
  /** Stage 0A-1：数据量状态（记录解析阶段的行数口径信息） */
  dataVolumeState: DataVolumeState | null;
  setDataVolumeState: (v: DataVolumeState | null) => void;
}

export function useParsedTable(): UseParsedTableReturn {
  const [rawText, setRawText] = useState('');
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

  const textareaRef = useRef<HTMLTextAreaElement>(null!);

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

  // ===== 自动解析已粘贴的数据（Stage 0A-1: 使用 pendingInternalRawTextRef 防止内部更新触发重复解析） =====
  useEffect(() => {
    if (!rawText.trim()) return;
    
    // 检查是否为内部同步更新
    if (pendingInternalRawTextRef.current === rawText) {
      // 消费内部更新标记，不重新解析
      pendingInternalRawTextRef.current = null;
      return;
    }
    
    // 用户输入处理：执行解析
    try {
      const result = parseTableText(rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
      
      // 同步更新 dataVolumeState（文本粘贴路径）
      if (result.dataVolumeState) {
        setDataVolumeState(result.dataVolumeState);
      }
      
      // 同步更新 parseSummary（包含字段分类信息）
      if (result.summary) {
        setParseSummary(result.summary);
      }
    } catch { /* 忽略 */ }
  }, [rawText]);

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
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
      
      // 同步更新 dataVolumeState
      if (result.dataVolumeState) {
        setDataVolumeState(result.dataVolumeState);
      }
      
      // 同步更新 parseSummary
      if (result.summary) {
        setParseSummary(result.summary);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败');
      setParsedData(null);
      setParseSummary(null);
    }
  }, [rawText]);

  // ===== 文件上传（Stage 0A-1: 添加异步版本控制和 dataVolumeState） =====
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    setParseSummary(null);
    setAvailableSheets(null);
    setSelectedSheet(null);
    setIsParsing(true);

    if (file.size > 5 * 1024 * 1024) {
      setTimeout(() => {
        setParseWarnings(['文件较大，解析可能需要几秒，请耐心等待...']);
      }, 100);
    }

    // Stage 0A-1: 异步解析版本控制
    const currentVersion = ++parseVersionRef.current;

    parseTableFile(file)
      .then(result => {
        // Stage 0A-1: 异步解析版本检查：丢弃旧结果
        if (parseVersionRef.current !== currentVersion) return;
        
        setParsedData(result);
        setParseError(null);
        setIsParsing(false);

        // Stage 0A-1: 保存数据量状态
        if (result.dataVolumeState) {
          setDataVolumeState(result.dataVolumeState);
        }

        // 合并警告
        const warnings = [...(result.warnings || [])];
        if (result.dataVolumeState?.isParseTruncated && result.dataVolumeState.parseTruncationWarning) {
          warnings.push(result.dataVolumeState.parseTruncationWarning);
        }
        
        // Stage 0A-2: 移除旧的 5000 行警告，抽样确认由 useAnalysisDataset 统一处理
        
        setParseWarnings(warnings);

        if (result.summary) {
          setParseSummary(result.summary);
        }
        if (result.availableSheets && result.availableSheets.length > 1) {
          setAvailableSheets(result.availableSheets);
        }
        
        // Stage 0A-1: 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
        const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
        pendingInternalRawTextRef.current = text;
        setRawText(text);
      })
      .catch(err => {
        // Stage 0A-1: 异步解析版本检查
        if (parseVersionRef.current !== currentVersion) return;
        
        setFileError(err instanceof Error ? err.message : '文件解析失败');
        setParsedData(null);
        setParseWarnings([]);
        setParseSummary(null);
        setIsParsing(false);
      });
    e.target.value = '';
  }, []);

  // ===== Sheet 切换（Stage 0A-1: 添加异步版本控制和 dataVolumeState） =====
  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
      // Stage 0A-1: 异步解析版本控制
      const currentVersion = ++parseVersionRef.current;
      
      (parsedData as ParsedFileResult).reparseSheet!(sheetName)
        .then(result => {
          // Stage 0A-1: 异步解析版本检查：丢弃旧结果
          if (parseVersionRef.current !== currentVersion) return;
          
          setParsedData(result);
          setParseError(null);

          // Stage 0A-1: 更新数据量状态
          if (result.dataVolumeState) {
            setDataVolumeState(result.dataVolumeState);
          }

          // 合并警告
          const warnings = [...(result.warnings || [])];
          if (result.dataVolumeState?.isParseTruncated && result.dataVolumeState.parseTruncationWarning) {
            warnings.push(result.dataVolumeState.parseTruncationWarning);
          }
          setParseWarnings(warnings);

          if (result.summary) {
            setParseSummary(result.summary);
          }

          // Stage 0A-1: 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
          const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
          pendingInternalRawTextRef.current = text;
          setRawText(text);
        })
        .catch(err => {
          // Stage 0A-1: 异步解析版本检查
          if (parseVersionRef.current !== currentVersion) return;
          
          setFileError(err instanceof Error ? err.message : '切换工作表失败');
        });
    }
  }, [parsedData]);

  // ===== 加载示例数据集（Stage 0A-1: 统一解析入口） =====
  const loadSampleDataset = useCallback((headers: string[], rows: Record<string, string | number | null>[]) => {
    // 构建文本数据
    const text = [
      headers.join('\t'),
      ...rows.map(row => headers.map(h => row[h] ?? '').join('\t'))
    ].join('\n');

    // 设置内部更新标记，防止二次解析
    pendingInternalRawTextRef.current = text;
    setRawText(text);

    // 执行解析
    try {
      const result = parseTableText(text);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
      
      // 同步更新 dataVolumeState
      if (result.dataVolumeState) {
        setDataVolumeState(result.dataVolumeState);
      }
      
      // 同步更新 parseSummary
      if (result.summary) {
        setParseSummary(result.summary);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败');
      setParsedData(null);
      setParseSummary(null);
    }
  }, []);

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
    activeTableId,
    dataVolumeState,
    setDataVolumeState,
  };
}