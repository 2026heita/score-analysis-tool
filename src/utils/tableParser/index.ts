// ============================================================
// 成绩表智能解析器 - 主入口
// ============================================================

// 类型导出
export type {
  ParsedNumber,
  FieldType,
  FieldMeta,
  ContentFeature,
  RowType,
  RowMeta,
  SheetCandidate,
  HeaderDetectionResult,
  ParseSummary,
  ParsedTableResult,
  WorkbookCandidate,
  ParseReport,
  ParseReportSummary,
  ParseReportField,
  ContentFeatureSummary,
} from './types';

// 核心解析函数
export {
  parseWorkbook,
  parseRawRows,
  MAX_ROWS,
  MAX_COLS,
} from './workbook';

// 数值解析（新接口）
export {
  parseNumericValue as parseNumericValueV2,
  parseNumericValueLegacy,
} from './numericParser';

// 表头检测
export {
  detectHeaderRow as detectHeaderRowV2,
  cleanHeaderName as cleanHeaderNameV2,
  dedupeHeaders as dedupeHeadersV2,
} from './headerDetection';

// 工作表检测
export {
  detectMainWorksheet,
  getPrimarySheetName,
  getAvailableSheetNames,
} from './sheetDetection';

// 字段分类
export {
  classifyFields,
  recommendAnalysisField,
  getAnalyzableFields,
} from './fieldClassifier';

// 解析报告构建
export {
  buildParseReport,
} from './parseReportBuilder';

// 行分类
export {
  classifyDataRow,
  classifyDataRows,
} from './rowClassifier';

// 错误
export {
  ParseError,
} from './errors';

// 多级表头扁平化
export {
  detectAndFlattenMultiRowHeaders,
  getMergedHeaders,
  extractSingleRowHeader,
} from './headerFlattener';
export type {
  MergeRange,
  MultiRowHeaderDetection,
} from './headerFlattener';

// CSV 引号感知解析
export {
  parseCsvText,
  parseCsvLine,
  countUnquotedChar,
} from './csvParser';

// ============================================================
// 向后兼容：导出旧接口
// ============================================================
import { parseRawRows } from './workbook';
import { parseNumericValueLegacy } from './numericParser';
import { countUnquotedChar, parseCsvLine } from './csvParser';
import { detectHeaderRow as detectHeaderRowNew, dedupeHeaders as dedupeHeadersNew, cleanHeaderName as cleanHeaderNameNew } from './headerDetection';
import type { ParsedTable } from '../../types';

// 安全限制
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function parseRowsToTable(rawRows: unknown[][]): ParsedTable {
  const result = parseRawRows(rawRows);
  return {
    headers: result.headers,
    rows: result.rows,
    warnings: result.warnings,
    summary: result.summary,
    dataVolumeState: result.dataVolumeState,
  };
}

export function parseNumericValue(val: unknown): number | null {
  return parseNumericValueLegacy(val);
}

export function cleanHeaderName(raw: string): string {
  return cleanHeaderNameNew(raw);
}

export function dedupeHeaders(headers: string[], warnings: string[]): string[] {
  return dedupeHeadersNew(headers, warnings);
}

export function detectHeaderRow(rawRows: unknown[][]): {
  headerRowIndex: number;
  headers: string[];
  dataRows: unknown[][];
  confidence: number;
  warnings: string[];
} {
  const result = detectHeaderRowNew(rawRows);
  return {
    ...result,
    warnings: [],
  };
}

// 文本模式分隔符检测
export function detectDelimiter(line: string): 'tab' | 'comma' | 'multi-space' {
  if (line.includes('\t')) return 'tab';
  // 使用引号感知的逗号计数，避免引号内逗号被误判
  const commaCount = countUnquotedChar(line, ',');
  if (commaCount >= 1) {
    // 使用引号感知解析检查是否确实有多个字段
    const parts = parseCsvLine(line, ',');
    const textParts = parts.filter(p => parseNumericValueLegacy(p.trim()) === null || p.trim() === '');
    if (textParts.length > 0 || parts.length >= 2) return 'comma';
  }
  return 'multi-space';
}

/**
 * 基于前几条非空记录综合判断分隔符。
 *
 * 不使用"仅第一行"判断，因为文本开头可能包含标题行、说明行（单列），
 * 真正的表格（表头 + 数据行）可能从第二行才开始。
 *
 * 方法：
 *  1. 取前 N 条非空物理行作为样本；
 *  2. 对每种候选分隔符（逗号/Tab/多空格）统计样本中"该分隔符能拆出多少列"；
 *  3. 采用"多数列数一致"的候选：能稳定把多条记录拆成一致多列（≥2）的候选可信度最高，
 *     单列（标题/说明）记录不投票，避免干扰；
 *  4. 命中数最高的候选胜出；并列时优先逗号 > Tab > 多空格。
 */
const MAX_DELIMITER_SAMPLE_LINES = 10;

function columnCountForDelimiter(line: string, delimiter: 'tab' | 'comma' | 'multi-space'): number {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').length;
    case 'comma':
      // 引号感知解析：引号内逗号不视为分隔符
      return parseCsvLine(line, ',').length;
    case 'multi-space':
      return line.split(/\s{2,}/).filter(c => c.trim() !== '').length;
  }
}

/**
 * 从多行文本综合判断分隔符。
 * @param text 完整表格文本（可含标题行/说明行）
 */
export function detectDelimiterFromText(text: string): 'tab' | 'comma' | 'multi-space' {
  const candidates: Array<'tab' | 'comma' | 'multi-space'> = ['comma', 'tab', 'multi-space'];

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '')
    .slice(0, MAX_DELIMITER_SAMPLE_LINES);

  if (lines.length === 0) {
    return 'multi-space';
  }

  let bestDelimiter: 'tab' | 'comma' | 'multi-space' = 'multi-space';
  let bestScore = -1;
  for (const delimiter of candidates) {
    // 统计各列数出现的次数（仅统计多列 >= 2）
    const countFreq = new Map<number, number>();
    for (const line of lines) {
      const c = columnCountForDelimiter(line, delimiter);
      if (c >= 2) {
        countFreq.set(c, (countFreq.get(c) || 0) + 1);
      }
    }
    // 一致性最高：同一列数出现次数最多的那一档
    let maxConsistent = 0;
    for (const freq of countFreq.values()) {
      if (freq > maxConsistent) maxConsistent = freq;
    }
    if (maxConsistent > bestScore) {
      bestScore = maxConsistent;
      bestDelimiter = delimiter;
    }
  }

  // 若没有任何多列候选得分，回退到基于首行的传统判断
  if (bestScore <= 0) {
    return detectDelimiter(lines[0]);
  }
  return bestDelimiter;
}

export function splitLine(line: string, delimiter: 'tab' | 'comma' | 'multi-space'): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').map(c => c.trim());
    case 'comma':
      // 使用引号感知 CSV 解析，避免千分位逗号或引号内逗号导致错列
      return parseCsvLine(line, ',');
    case 'multi-space':
      return line.split(/\s{2,}/).map(c => c.trim());
  }
}

// 数据行过滤（旧接口，保留兼容性）
export function filterDataRows(rawRows: unknown[], headers: string[]): Record<string, string>[] {
  const result = parseRawRows([headers, ...rawRows] as unknown[][]);
  return result.rows;
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `这个文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_FILE_SIZE / 1024 / 1024}MB），浏览器无法安全处理，请精简数据后重新上传。`;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
    return '仅支持 .csv、.xlsx、.xls 格式的文件。';
  }
  return null;
}

export { MAX_FILE_SIZE };
