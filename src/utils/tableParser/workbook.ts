// ============================================================
// 成绩表智能解析器 - 工作簿解析主入口
// ============================================================

// v1.9: xlsx 解析已移至 Worker 线程（src/workers/xlsx.worker.ts）
import type { ParsedTableResult, WorkbookCandidate, ParseSummary } from './types';
import type { MergeRange } from './headerFlattener';
import { detectMainWorksheet, getPrimarySheetName, getAvailableSheetNames } from './sheetDetection';
import { detectHeaderRow, dedupeHeaders } from './headerDetection';
import { classifyFields, recommendAnalysisField } from './fieldClassifier';
import { classifyDataRows } from './rowClassifier';
import { throwEmptyFile, throwNoHeader, throwNoData, throwNoSheet, throwNoDataInSheet } from './errors';
import { parseXlsxInWorker } from '../parseInWorker';

// ============================================================
// 安全限制
// ============================================================
const MAX_ROWS = 20000;
const MAX_COLS = 200;

/**
 * 解析 Excel 工作簿（多 sheet 支持，支持多级表头和合并单元格）
 * 
 * @param arrayBuffer - 文件 ArrayBuffer
 * @param fileName - 文件名（用于日志，非必需）
 * @param targetSheetName - 指定解析的 sheet 名称（可选，不指定则自动选择）
 * @returns ParsedTableResult
 */
export async function parseWorkbook(
  arrayBuffer: ArrayBuffer,
  _fileName?: string,
  targetSheetName?: string,
): Promise<ParsedTableResult> {
  // v1.9: 使用 Worker 解析 xlsx（避免主线程阻塞）
  const rawSheets = await parseXlsxInWorker(arrayBuffer);

  const sheetNames = rawSheets.map(s => s.name);

  if (!sheetNames || sheetNames.length === 0) {
    throwNoSheet();
  }

  // 限制列数并包装为统一格式
  const sheetsData: { name: string; data: unknown[][]; merges: MergeRange[] }[] = rawSheets.map(s => ({
    name: s.name,
    data: s.data.map(row => {
      if (!Array.isArray(row)) return [String(row ?? '')];
      return row.slice(0, MAX_COLS);
    }),
    merges: s.merges,
  }));

  // 检测主工作表
  const candidates = detectMainWorksheet(sheetsData);

  // 如果指定了 sheet，使用指定的
  let selectedCandidate: WorkbookCandidate | undefined;
  if (targetSheetName) {
    selectedCandidate = candidates.find(c => c.sheetName === targetSheetName);
    if (!selectedCandidate) {
      // 指定的 sheet 不存在，回退到自选择
      targetSheetName = undefined;
    }
  }

  if (!selectedCandidate) {
    // 自动选择主表
    const primaryName = getPrimarySheetName(candidates);
    if (primaryName) {
      selectedCandidate = candidates.find(c => c.sheetName === primaryName);
    } else {
      // 无法可靠判断，选择第一个有数据的 sheet
      selectedCandidate = candidates.find(c => c.rawData.length > 0) || candidates[0];
    }
  }

  if (!selectedCandidate) {
    throwNoDataInSheet();
  }

  // 解析选定的 sheet
  const result = parseSheetData(selectedCandidate.sheetName, selectedCandidate.rawData, selectedCandidate.merges, candidates);

  // 添加 sheet 信息
  result.availableSheets = getAvailableSheetNames(candidates);

  return result;
}

/**
 * 解析单个 sheet 的数据
 */
function parseSheetData(
  sheetName: string,
  rawData: unknown[][],
  merges: MergeRange[],
  allCandidates?: WorkbookCandidate[],
): ParsedTableResult {
  // 限制行数
  const trimmedData = rawData.slice(0, MAX_ROWS);

  if (trimmedData.length === 0) {
    throwEmptyFile();
  }

  // 表头识别（支持多级表头）
  const detection = detectHeaderRow(trimmedData, merges);

  if (detection.headerRowIndex < 0) {
    throwNoHeader();
  }

  // 清洗表头
  const warnings: string[] = [];
  const headers = dedupeHeaders(detection.headers, warnings);

  // 构建原始行对象
  const rawRows: Record<string, string>[] = [];
  for (const row of detection.dataRows) {
    if (!row || !Array.isArray(row)) continue;
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
    }
    rawRows.push(obj);
  }

  if (rawRows.length === 0) {
    throwNoData();
  }

  // 字段分类
  const fieldMetas = classifyFields(headers, rawRows);

  // 数据行分类
  const rowClassification = classifyDataRows(rawRows, headers);

  // 推荐分析字段
  const recommendation = recommendAnalysisField(fieldMetas);

  // 构建多级表头信息
  const isMultiRow = detection.isMultiRow === true;
  let headerRowRangeText: string | undefined;
  let dataStartRowText: string | undefined;
  if (isMultiRow && detection.headerRowRange) {
    const [start, end] = detection.headerRowRange;
    headerRowRangeText = `第 ${start + 1}-${end + 1} 行`;
    dataStartRowText = `第 ${end + 2} 行`;
  }

  // 构建解析摘要
  const summary: ParseSummary = {
    sheetName,
    fieldCount: headers.length,
    validDataRows: rowClassification.validData,
    emptyRows: rowClassification.empty,
    statusRows: rowClassification.statusOnly,
    summaryRows: rowClassification.summary,
    invalidRows: rowClassification.invalid,
    recommendedField: recommendation.field,
    recommendedFieldPriority: recommendation.priority,
    fieldTypes: fieldMetas,
    isMultiRow,
    headerRowRangeText,
    dataStartRowText,
  };

  // 构建最终结果
  // 使用分类后的有效数据行（或全部行，由上游决定）
  const resultRows = rowClassification.validRows.length > 0
    ? rowClassification.validRows
    : rawRows; // 如果没有有效行，使用全部行（保守策略）

  return {
    headers,
    rows: resultRows,
    warnings,
    summary,
    fieldMetas,
    rowMetas: [],
    availableSheets: allCandidates ? getAvailableSheetNames(allCandidates) : [sheetName],
  };
}

/**
 * 解析原始二维数组（兼容旧接口，用于 CSV / 粘贴文本）
 */
export function parseRawRows(rawRows: unknown[][]): ParsedTableResult {
  if (!rawRows || rawRows.length === 0) {
    throwEmptyFile();
  }

  // 限制列数
  const trimmed = rawRows.map(row => {
    if (!Array.isArray(row)) return [String(row ?? '')];
    return row.slice(0, MAX_COLS);
  });

  // 表头识别
  const detection = detectHeaderRow(trimmed);

  if (detection.headerRowIndex < 0) {
    throwNoHeader();
  }

  // 清洗表头
  const warnings: string[] = [];
  const headers = dedupeHeaders(detection.headers, warnings);

  // 构建原始行对象
  const rawRowsObj: Record<string, string>[] = [];
  for (const row of detection.dataRows) {
    if (!row || !Array.isArray(row)) continue;
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
    }
    rawRowsObj.push(obj);
  }

  if (rawRowsObj.length === 0) {
    throwNoData();
  }

  // 字段分类
  const fieldMetas = classifyFields(headers, rawRowsObj);

  // 数据行分类
  const rowClassification = classifyDataRows(rawRowsObj, headers);

  // 推荐分析字段
  const recommendation = recommendAnalysisField(fieldMetas);

  // 构建解析摘要
  const summary: ParseSummary = {
    sheetName: '粘贴数据',
    fieldCount: headers.length,
    validDataRows: rowClassification.validData,
    emptyRows: rowClassification.empty,
    statusRows: rowClassification.statusOnly,
    summaryRows: rowClassification.summary,
    invalidRows: rowClassification.invalid,
    recommendedField: recommendation.field,
    recommendedFieldPriority: recommendation.priority,
    fieldTypes: fieldMetas,
  };

  const resultRows = rowClassification.validRows.length > 0
    ? rowClassification.validRows
    : rawRowsObj;

  return {
    headers,
    rows: resultRows,
    warnings,
    summary,
    fieldMetas,
    rowMetas: [],
  };
}

// ============================================================
// 导出
// ============================================================
export { MAX_ROWS, MAX_COLS };
