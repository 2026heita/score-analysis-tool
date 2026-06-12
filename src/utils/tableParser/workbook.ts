// ============================================================
// 成绩表智能解析器 - 工作簿解析主入口
// ============================================================

import { read, utils } from 'xlsx';
import type { ParsedTableResult, WorkbookCandidate, ParseSummary } from './types';
import { detectMainWorksheet, getPrimarySheetName, getAvailableSheetNames } from './sheetDetection';
import { detectHeaderRow, dedupeHeaders } from './headerDetection';
import { classifyFields, recommendAnalysisField } from './fieldClassifier';
import { classifyDataRows } from './rowClassifier';
import { throwEmptyFile, throwNoHeader, throwNoData, throwNoSheet, throwNoDataInSheet } from './errors';

// ============================================================
// 安全限制
// ============================================================
const MAX_ROWS = 20000;
const MAX_COLS = 200;

/**
 * 解析 Excel 工作簿（多 sheet 支持）
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
  // 读取工作簿
  const workbook = read(arrayBuffer, { type: 'array', cellFormula: false, cellHTML: false });
  const sheetNames = workbook.SheetNames;

  if (!sheetNames || sheetNames.length === 0) {
    throwNoSheet();
  }

  // 将每个 sheet 转为二维数组
  const sheetsData: { name: string; data: unknown[][] }[] = sheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const data = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
    // 限制列数
    const trimmed = data.map(row => {
      if (!Array.isArray(row)) return [String(row ?? '')];
      return row.slice(0, MAX_COLS);
    });
    return { name, data: trimmed };
  });

  // 检测主工作表
  const candidates = detectMainWorksheet(sheetsData);

  // 如果指定了 sheet，使用指定的
  let selectedCandidate: WorkbookCandidate | undefined;
  if (targetSheetName) {
    selectedCandidate = candidates.find(c => c.sheetName === targetSheetName);
    if (!selectedCandidate) {
      // 指定的 sheet 不存在，回退到自动选择
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
  const result = parseSheetData(selectedCandidate.sheetName, selectedCandidate.rawData, candidates);

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
  allCandidates?: WorkbookCandidate[],
): ParsedTableResult {
  // 限制行数
  const trimmedData = rawData.slice(0, MAX_ROWS);

  if (trimmedData.length === 0) {
    throwEmptyFile();
  }

  // 表头识别
  const detection = detectHeaderRow(trimmedData);

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
