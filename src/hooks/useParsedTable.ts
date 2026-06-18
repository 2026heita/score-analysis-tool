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
import type { ParsedTable } from '../types';
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
  /** v1.4：统一表切换标识，每次数据变更时自增，驱动下游 hook 重置 */
  activeTableId: number;
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

  // ===== 手动解析 =====
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
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败');
      setParsedData(null);
    }
  }, [rawText]);

  // ===== 文件上传 =====
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
        }
        if (result.availableSheets && result.availableSheets.length > 1) {
          setAvailableSheets(result.availableSheets);
        }
        const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
        setRawText(text);
      })
      .catch(err => {
        setFileError(err instanceof Error ? err.message : '文件解析失败');
        setParsedData(null);
        setParseWarnings([]);
        setParseSummary(null);
        setIsParsing(false);
      });
    e.target.value = '';
  }, []);

  // ===== Sheet 切换 =====
  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
      (parsedData as ParsedFileResult).reparseSheet!(sheetName)
        .then(result => {
          setParsedData(result);
          setParseWarnings(result.warnings || []);
          setParseError(null);
          if (result.summary) {
            setParseSummary(result.summary);
          }
          const text = [result.headers.join('\t'), ...result.rows.map(r => result.headers.map(h => r[h] ?? '').join('\t'))].join('\n');
          setRawText(text);
        })
        .catch(err => {
          setFileError(err instanceof Error ? err.message : '切换工作表失败');
        });
    }
  }, [parsedData]);

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
    activeTableId,
  };
}