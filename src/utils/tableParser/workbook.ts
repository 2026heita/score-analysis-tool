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
  // 保存物理总行数（截断前）
  const physicalRowCount = rawData.length;

  if (physicalRowCount === 0) {
    throwEmptyFile();
  }

  // 表头识别（支持多级表头）
  const detection = detectHeaderRow(rawData, merges);

  if (detection.headerRowIndex < 0) {
    throwNoHeader();
  }

  // 计算表头占用行数和原始数据行数
  const headerRowCount = detection.headerRowIndex + 1;
  const rawRowCount = physicalRowCount - headerRowCount;

  // 限制解析行数（20000）
  const parsedRowCount = Math.min(rawRowCount, MAX_ROWS);
  const isParseTruncated = rawRowCount > MAX_ROWS;

  // 如果发生截断，生成警告
  let parseTruncationWarning: string | undefined;
  if (isParseTruncated) {
    const unparsedRows = rawRowCount - parsedRowCount;
    parseTruncationWarning = `原始文件包含 ${physicalRowCount} 行数据，当前解析上限为 20,000 行，尚有 ${unparsedRows} 行未解析。`;
  }

  // 限制数据行用于后续处理
  const trimmedDataRows = detection.dataRows.slice(0, parsedRowCount);

  // 清洗表头
  const warnings: string[] = [];
  const headers = dedupeHeaders(detection.headers, warnings);

  // 构建原始行对象
  const rawRows: Record<string, string>[] = [];
  for (const row of trimmedDataRows) {
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

  // 构建数据量状态
  const dataVolumeState: import('../../types').DataVolumeState = {
    physicalRowCount,
    headerRowCount,
    rawRowCount,
    parsedRowCount,
    validRowCount: rowClassification.validData,
    emptyRowCount: rowClassification.empty,
    statusRowCount: rowClassification.statusOnly,
    summaryRowCount: rowClassification.summary,
    invalidRowCount: rowClassification.invalid,
    isParseTruncated,
    parseTruncationWarning,
  };

  return {
    headers,
    rows: resultRows,
    warnings,
    summary,
    fieldMetas,
    rowMetas: [],
    availableSheets: allCandidates ? getAvailableSheetNames(allCandidates) : [sheetName],
    dataVolumeState,
  };
}

/**
 * 解析原始二维数组（兼容旧接口，用于 CSV / 粘贴文本）
 */
export function parseRawRows(rawRows: unknown[][]): ParsedTableResult {
  if (!rawRows || rawRows.length === 0) {
    throwEmptyFile();
  }

  // 保存物理总行数
  const physicalRowCount = rawRows.length;

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

  // 计算表头占用行数和原始数据行数
  const headerRowCount = detection.headerRowIndex + 1;
  const rawRowCount = physicalRowCount - headerRowCount;

  // 限制解析行数（20000）
  const parsedRowCount = Math.min(rawRowCount, MAX_ROWS);
  const isParseTruncated = rawRowCount > MAX_ROWS;

  // 如果发生截断，生成警告
  let parseTruncationWarning: string | undefined;
  if (isParseTruncated) {
    const unparsedRows = rawRowCount - parsedRowCount;
    parseTruncationWarning = `原始数据包含 ${physicalRowCount} 行，当前解析上限为 20,000 行，尚有 ${unparsedRows} 行未解析。`;
  }

  // 限制数据行用于后续处理
  const trimmedDataRows = detection.dataRows.slice(0, parsedRowCount);

  // 清洗表头
  const warnings: string[] = [];
  const headers = dedupeHeaders(detection.headers, warnings);

  // 构建原始行对象（含行宽校验：禁止静默列错位）
  const rawRowsObj: Record<string, string>[] = [];
  const headerCount = headers.length;
  let malformedRowCount = 0;
  let shortRowCount = 0;
  for (let dataIdx = 0; dataIdx < trimmedDataRows.length; dataIdx++) {
    const row = trimmedDataRows[dataIdx];
    if (!row || !Array.isArray(row)) continue;

    const rowLen = row.length;
    const isNonEmptyDataRow = row.some(cell => cell !== '' && cell !== null && cell !== undefined);
    // 原始文件中的行号：表头行 headerRowIndex+1，数据行从 headerRowIndex+2 起
    const originalLine = detection.headerRowIndex + 2 + dataIdx;

    // 多列：可能因未加引号的逗号造成错位，判为 malformed，排除该行，不静默截断
    if (rowLen > headerCount) {
      const hasExtraNonEmpty = row.slice(headerCount).some(cell => cell !== '' && cell !== null && cell !== undefined);
      if (hasExtraNonEmpty) {
        malformedRowCount++;
        warnings.push(
          `第 ${originalLine} 行列数为 ${rowLen}，但表头为 ${headerCount} 列，该行可能包含未加引号的逗号（如 "1,234"），已跳过该行。请使用引号或改为 Tab 分隔。`
        );
        continue;
      }
    }

    const obj: Record<string, string> = {};
    for (let i = 0; i < headerCount; i++) {
      obj[headers[i]] = i < rowLen ? String(row[i] ?? '').trim() : '';
    }
    // 少列：补空并记录 warning（明确规则，不允许静默丢弃）
    if (isNonEmptyDataRow && rowLen < headerCount) {
      shortRowCount++;
      warnings.push(
        `第 ${originalLine} 行列数为 ${rowLen}，少于表头 ${headerCount} 列，缺失的末尾列已补为空值。`
      );
    }
    rawRowsObj.push(obj);
  }

  if (malformedRowCount > 0) {
    warnings.push(`检测到 ${malformedRowCount} 行列数与表头不一致（多于表头），已从分析中排除。`);
  }
  if (shortRowCount > 0) {
    warnings.push(`检测到 ${shortRowCount} 行数据少于表头列数，缺失列已补空。`);
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

  // 构建数据量状态
  const dataVolumeState: import('../../types').DataVolumeState = {
    physicalRowCount,
    headerRowCount,
    rawRowCount,
    parsedRowCount,
    validRowCount: rowClassification.validData,
    emptyRowCount: rowClassification.empty,
    statusRowCount: rowClassification.statusOnly,
    summaryRowCount: rowClassification.summary,
    invalidRowCount: rowClassification.invalid,
    isParseTruncated,
    parseTruncationWarning,
  };

  return {
    headers,
    rows: resultRows,
    warnings,
    summary,
    fieldMetas,
    rowMetas: [],
    dataVolumeState,
  };
}

// ============================================================
// 导出
// ============================================================
export { MAX_ROWS, MAX_COLS };
