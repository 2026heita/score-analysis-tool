// ============================================================
// 通用表格工作簿解析器 - 多工作表检测
// ============================================================
// 设计原则（通用模式，不包含教育/考试特定关键词）：
// - 不因某个 sheet 出现"姓名+成绩"就认为它更像主表；
// - 主表候选纯粹用"结构是否适合作为数据表"来评分：非空行数、列数、
//   表头有效性、表头下方数据行数、可解析数值密度、结构一致性。
// 业务语义（成交额、库存、成绩……）由上层 schema 推断决定，与本层无关。

import type { SheetCandidate, WorkbookCandidate } from './types';
import type { MergeRange } from './headerFlattener';
import { detectHeaderRow } from './headerDetection';
import { parseNumericValueLegacy } from './numericParser';
import { minMax } from '../stats';

// 辅助/代码/说明类 sheet 关键词（通用业务层面几乎不可能是主数据表，应避免作为主表）
const DICT_SHEET_KEYWORDS = [
  '代码', '字典', '说明', '备注', '参数', '配置', '对照', '映射',
  'code', 'dict', 'dictionary', 'mapping', 'reference', 'readme',
];

const HEADER_SCAN_ROWS = 30;

/**
 * 检测多个工作表中最可能的主数据表
 * 
 * @param workbookSheets - 工作表数组，每项包含 { name, data }
 * @returns 排序后的候选列表，置信度最高的排在最前
 */
export function detectMainWorksheet(
  workbookSheets: { name: string; data: unknown[][]; merges: MergeRange[] }[],
): WorkbookCandidate[] {
  if (workbookSheets.length === 0) {
    return [];
  }

  // 如果只有一个 sheet，直接返回
  if (workbookSheets.length === 1) {
    const sheet = workbookSheets[0];
    const candidate = evaluateSheetCandidate(sheet.name, sheet.data, sheet.merges);
    return [{
      sheetName: sheet.name,
      rawData: sheet.data,
      merges: sheet.merges,
      candidate,
    }];
  }

  // 评估每个 sheet
  const candidates: WorkbookCandidate[] = workbookSheets.map(sheet => ({
    sheetName: sheet.name,
    rawData: sheet.data,
    merges: sheet.merges,
    candidate: evaluateSheetCandidate(sheet.name, sheet.data, sheet.merges),
  }));

  // 按置信度降序排序
  candidates.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  return candidates;
}

/**
 * 评估单个工作表的候选分数
 *
 * 全部为结构化/通用评分，不依赖任何教育关键词。
 * scoreKeywordsCount / hasIdentityField / hasScoreField 仅保留字段以兼容旧类型，
 * 不再参与评分（通用模式一律为 0 / false）。
 */
function evaluateSheetCandidate(name: string, data: unknown[][], merges: MergeRange[]): SheetCandidate {
  const rowCount = data.length;
  const lengths = data.map(r => Array.isArray(r) ? r.length : 1);
  const mm = minMax(lengths);
  const colCount = data.length > 0 ? (mm ? mm.max : 0) : 0;

  let score = 0;

  // 1. 辅助/说明/代码类 sheet 名称 → 大幅扣分（几乎不可能是主数据表）
  const nameLower = name.toLowerCase();
  for (const kw of DICT_SHEET_KEYWORDS) {
    if (nameLower.includes(kw.toLowerCase())) {
      score -= 50;
      break;
    }
  }

  // 2. 行数评分（主数据表通常行数较多）
  if (rowCount >= 10) score += 5;
  if (rowCount >= 30) score += 5;
  if (rowCount >= 50) score += 3;
  if (rowCount < 5) score -= 10;

  // 3. 列数评分（少于 3 列多半是说明/目录页）
  if (colCount >= 5) score += 3;
  if (colCount >= 10) score += 3;
  if (colCount < 3) score -= 5;

  // 4. 数值密度评分：前几行中可解析为数值的单元格比例越高，越像数据表
  let numericCellCount = 0;
  let numericTotalCellCount = 0;
  const scanRows = data.slice(0, HEADER_SCAN_ROWS);
  for (const row of scanRows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const s = String(cell ?? '').trim();
      if (s === '') continue;
      numericTotalCellCount++;
      if (parseNumericValueLegacy(s) !== null) numericCellCount++;
    }
  }
  if (numericTotalCellCount > 0) {
    const density = numericCellCount / numericTotalCellCount;
    if (density >= 0.5) score += 8;
    else if (density >= 0.25) score += 4;
  }

  // 5. 检测表头有效性：有合法表头 + 表头后有足够多数据行 → 强主表信号
  const headerResult = detectHeaderRow(data, merges);
  if (headerResult.headerRowIndex >= 0) {
    score += 20;
    const dataRows = headerResult.dataRows.length;
    if (dataRows >= 5) score += 5;
    if (dataRows >= 20) score += 5;
  }

  // 6. 行/列宽比：超过 50 列的表多半不是紧凑业务主表
  if (colCount > 50) score -= 5;

  // 归一化置信度到 0-100 范围
  const confidence = Math.max(0, Math.min(100, score));

  return {
    name,
    rowCount,
    colCount,
    scoreKeywordsCount: 0,
    hasIdentityField: false,
    hasScoreField: false,
    numericColCount: numericCellCount,
    confidence,
  };
}

/**
 * 获取主工作表名称（置信度最高的）
 * 
 * @returns 主工作表名称，如果无法可靠判断则返回 null
 */
export function getPrimarySheetName(
  candidates: WorkbookCandidate[],
): string | null {
  if (candidates.length === 0) return null;

  const best = candidates[0];
  const second = candidates[1];

  // 如果最佳候选置信度足够高，或者比第二高明显高，选择最佳
  if (best.candidate.confidence > 30) {
    if (!second || best.candidate.confidence - second.candidate.confidence > 15) {
      return best.sheetName;
    }
  }

  // 如果最佳候选置信度很低，返回 null 提示用户选择
  if (best.candidate.confidence < 10) {
    return null;
  }

  // 有一定置信度但不是特别高，返回最佳
  return best.sheetName;
}

/**
 * 获取所有可用 sheet 名称列表
 */
export function getAvailableSheetNames(
  candidates: WorkbookCandidate[],
): string[] {
  return candidates.map(c => c.sheetName);
}
