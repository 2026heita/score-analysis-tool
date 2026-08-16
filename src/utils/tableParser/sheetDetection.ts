// ============================================================
// 成绩表智能解析器 - 多工作表检测
// ============================================================

import type { SheetCandidate, WorkbookCandidate } from './types';
import type { MergeRange } from './headerFlattener';
import { detectHeaderRow } from './headerDetection';
import { parseNumericValueLegacy } from './numericParser';
import { minMax } from '../stats';

// 主成绩表关键词（加分关键词，不硬编码具体表名）
const MAIN_SHEET_KEYWORDS = [
  '成绩', '分数', '得分', '考试', '测评', '测试',
  '成绩收集', '成绩统计', '成绩汇总', '考试结果',
];

// 字典表/代码表关键词（应避免作为主表）
const DICT_SHEET_KEYWORDS = [
  '代码', '字典', '组合名称', '科目代码', '学校代码',
  '说明', '备注', '参数', '配置', '对照', '映射',
  'code', 'dict', 'dictionary', 'mapping', 'reference',
];

// 成绩相关字段关键词
const SCORE_FIELD_KEYWORDS = [
  '总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物',
  '政治', '历史', '地理', '成绩', '分数', '得分',
];

// 身份字段关键词
const IDENTITY_FIELD_KEYWORDS = [
  '姓名', '名字', '班级', '考号', '座号', '学号', '考生',
];

const HEADER_SCAN_ROWS = 30;

/**
 * 检测多个工作表中最可能的主成绩表
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
 */
function evaluateSheetCandidate(name: string, data: unknown[][], merges: MergeRange[]): SheetCandidate {
  const rowCount = data.length;
  const lengths = data.map(r => Array.isArray(r) ? r.length : 1);
  const mm = minMax(lengths);
  const colCount = data.length > 0 ? (mm ? mm.max : 0) : 0;

  let score = 0;

  // 1. 字典表关键词 → 大幅扣分
  const nameLower = name.toLowerCase();
  for (const kw of DICT_SHEET_KEYWORDS) {
    if (nameLower.includes(kw.toLowerCase())) {
      score -= 50;
      break;
    }
  }

  // 2. 主成绩表关键词 → 加分
  for (const kw of MAIN_SHEET_KEYWORDS) {
    if (nameLower.includes(kw.toLowerCase())) {
      score += 15;
      break;
    }
  }

  // 3. 行数评分（主成绩表通常行数较多）
  if (rowCount >= 10) score += 5;
  if (rowCount >= 30) score += 5;
  if (rowCount >= 50) score += 3;
  if (rowCount < 5) score -= 10;

  // 4. 列数评分
  if (colCount >= 5) score += 3;
  if (colCount >= 10) score += 3;
  if (colCount < 3) score -= 5;

  // 5. 扫描前几行，检查字段关键词
  const scanRows = data.slice(0, HEADER_SCAN_ROWS);
  let scoreKeywordsCount = 0;
  let hasIdentityField = false;
  let hasScoreField = false;

  for (const row of scanRows) {
    if (!Array.isArray(row)) continue;
    const rowText = row.map(v => String(v ?? '').trim()).join(' ');
    const rowTextLower = rowText.toLowerCase();

    for (const kw of SCORE_FIELD_KEYWORDS) {
      if (rowTextLower.includes(kw.toLowerCase())) {
        scoreKeywordsCount++;
        hasScoreField = true;
        break;
      }
    }

    for (const kw of IDENTITY_FIELD_KEYWORDS) {
      if (rowTextLower.includes(kw.toLowerCase())) {
        hasIdentityField = true;
        break;
      }
    }
  }

  // 6. 字段关键词命中加分
  score += scoreKeywordsCount * 8;

  // 7. 包含身份字段加分
  if (hasIdentityField) score += 10;

  // 8. 包含成绩字段加分
  if (hasScoreField) score += 8;

  // 9. 计算数值列数量
  let numericColCount = 0;
  if (data.length > 1) {
    const firstDataRow = data[Math.min(1, data.length - 1)];
    if (Array.isArray(firstDataRow)) {
      numericColCount = firstDataRow.filter(v => {
        return parseNumericValueLegacy(String(v ?? '').trim()) !== null;
      }).length;
    }
  }
  score += numericColCount * 2;

  // 10. 检测表头有效性
  const headerResult = detectHeaderRow(data, merges);
  if (headerResult.headerRowIndex >= 0) {
    score += 20;
    // 如果表头后有多行数据，额外加分
    const dataRows = headerResult.dataRows.length;
    if (dataRows >= 5) score += 5;
    if (dataRows >= 20) score += 5;
  }

  // 11. 行数/列数比：太宽的表可能不是成绩表
  if (colCount > 50) score -= 5;

  // 归一化置信度到 0-100 范围
  const confidence = Math.max(0, Math.min(100, score));

  return {
    name,
    rowCount,
    colCount,
    scoreKeywordsCount,
    hasIdentityField,
    hasScoreField,
    numericColCount,
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
