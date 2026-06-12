// ============================================================
// 成绩表智能解析器 - 主入口
// ============================================================

// 类型导出
export type {
  ParsedNumber,
  FieldType,
  FieldMeta,
  RowType,
  RowMeta,
  SheetCandidate,
  HeaderDetectionResult,
  ParseSummary,
  ParsedTableResult,
  WorkbookCandidate,
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

// ============================================================
// 向后兼容：导出旧接口
// ============================================================
import { parseRawRows } from './workbook';
import { parseNumericValueLegacy } from './numericParser';
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
  const commaCount = (line.match(/,/g) || []).length;
  if (commaCount >= 1) {
    const parts = line.split(',');
    const textParts = parts.filter(p => isNaN(parseFloat(p.trim())) || p.trim() === '');
    if (textParts.length > 0 || parts.length >= 2) return 'comma';
  }
  return 'multi-space';
}

export function splitLine(line: string, delimiter: 'tab' | 'comma' | 'multi-space'): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').map(c => c.trim());
    case 'comma':
      return line.split(',').map(c => c.trim());
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
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB。`;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
    return '仅支持 .csv、.xlsx、.xls 格式的文件。';
  }
  return null;
}

export { MAX_FILE_SIZE };
