// ============================================================
// 成绩表智能解析器 - 表头检测（支持多级表头）
// ============================================================

import type { HeaderDetectionResult } from './types';
import { detectAndFlattenMultiRowHeaders, MergeRange } from './headerFlattener';

// ============================================================
// 常量
// ============================================================
const HEADER_SCAN_ROWS = 30;
const MIN_HEADER_SCORE = 5;

// ============================================================
// 关键词
// ============================================================
const HEADER_KEYWORDS = [
  '名次', '排名', '位次', '序号', '总分', '成绩',
  '语文', '数学', '外语', '英语', '物理', '化学', '生物', '政治', '历史', '地理',
  '科目', '人数', '累计', '最高', '最低', '平均',
  '单科', '两科', '之和', '最高成绩', '次高', '得分率',
  '合计', '标准分', '原始分',
  '姓名', '班级', '学校', '考号', '座号', '学号',
  '德育', '智育', '体育', '美育', '劳育', '综合',
];

const EXPLANATION_KEYWORDS = [
  '说明', '提示', '注：', '备注', '请', '查询',
  '查询条件', '查询结果', '以下', '包含', '以上', '仅供参考',
];

// ============================================================
// 表头检测主函数（支持多级表头）
// ============================================================
export function detectHeaderRow(rawRows: unknown[][], merges?: MergeRange[]): HeaderDetectionResult {
  // 多级表头检测仅在有 merges 信息时启用（即 Excel 上传场景）
  if (merges && merges.length > 0) {
    const multiRowResult = detectAndFlattenMultiRowHeaders(rawRows, merges);

    if (multiRowResult.isMultiRow) {
      // 二次校验：检查扁平化后的字段名是否合法
      const invalidCount = multiRowResult.headers.filter(h => isInvalidFieldName(h)).length;
      const totalNonEmpty = multiRowResult.headers.filter(h => h && h.trim() !== '').length;

      // 如果非法字段超过阈值的 30%，回退到单行表头
      if (totalNonEmpty > 0 && invalidCount / totalNonEmpty > 0.3) {
        return detectSingleHeaderRow(rawRows);
      }

      // 多级表头：使用扁平化后的字段名
      const headers = multiRowResult.headers;
      const dataStartRow = multiRowResult.headerRows[1] + 1;
      const dataRows = rawRows.slice(dataStartRow);

      return {
        headerRowIndex: multiRowResult.headerRows[0],
        headers,
        dataRows,
        confidence: 30, // 多级表头置信度
        isMultiRow: true,
        headerRowRange: multiRowResult.headerRows,
      };
    }
  }

  // 不是多级表头（或无 merges），使用原来的单行表头检测
  return detectSingleHeaderRow(rawRows);
}

// ============================================================
// 字段名合法性校验
// ============================================================

/**
 * 判断字段名是否非法（主要由数字、下划线、小数点组成）
 * 例如：93_80、0_0、101.60_91.60、202409602096_202409602084
 */
function isInvalidFieldName(name: string): boolean {
  if (!name || name.trim() === '') return false; // 空字段不算非法

  const trimmed = name.trim();

  // 移除下划线和小数点后，检查剩余内容是否主要是数字
  const withoutSeparators = trimmed.replace(/[_\.\s]/g, '');
  if (withoutSeparators.length === 0) return true;

  // 检查去除分隔符后是否全是数字
  if (/^\d+$/.test(withoutSeparators)) return true;

  // 检查是否数字字符占比超过 80%
  const digitCount = (withoutSeparators.match(/\d/g) || []).length;
  if (digitCount / withoutSeparators.length > 0.8) return true;

  return false;
}

/**
 * 原有的单行表头检测逻辑
 */
function detectSingleHeaderRow(rawRows: unknown[][]): HeaderDetectionResult {
  const scanLimit = Math.min(rawRows.length, HEADER_SCAN_ROWS);
  let bestScore = -Infinity;
  let bestIdx = -1;

  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rowStrs: string[] = row.map(v => String(v ?? '').trim());
    const score = scoreHeaderCandidate(rowStrs, row, rawRows, i);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestScore < MIN_HEADER_SCORE) {
    return {
      headerRowIndex: -1,
      headers: [],
      dataRows: [],
      confidence: 0,
    };
  }

  const headerRow = rawRows[bestIdx];
  const headers = headerRow.map(h => String(h ?? '').trim());
  const dataRows = rawRows.slice(bestIdx + 1);

  return {
    headerRowIndex: bestIdx,
    headers,
    dataRows,
    confidence: bestScore,
  };
}

// ============================================================
// 表头候选评分
// ============================================================
function scoreHeaderCandidate(
  rowStrs: string[],
  _row: unknown[],
  allRows: unknown[][],
  index: number,
): number {
  let score = 0;

  const nonEmpty = rowStrs.filter(c => c !== '' && c !== '-');
  const nonEmptyCount = nonEmpty.length;

  if (nonEmptyCount < 2) {
    score -= 20;
    return score;
  }

  // 非空越多适当加分
  score += Math.min(nonEmptyCount * 2, 10);

  // 说明性文字扣分
  if (isExplanationRow(rowStrs)) {
    score -= 15;
  }

  // 关键词加分
  let keywordHits = 0;
  for (const cell of nonEmpty) {
    for (const kw of HEADER_KEYWORDS) {
      if (cell.includes(kw)) {
        keywordHits++;
        break;
      }
    }
  }
  score += keywordHits * 5;

  // 字段大部分是纯数字 → 像数据行不像表头
  const numericCells = nonEmpty.filter(c => {
    const n = parseFloat(c);
    return !isNaN(n) && c !== '';
  }).length;
  if (numericCells / Math.max(nonEmptyCount, 1) > 0.7 && nonEmptyCount >= 3) {
    score -= 15;
  }

  // 检查后续行是否有数值数据
  for (let offset = 1; offset <= 3; offset++) {
    const nextIdx = index + offset;
    if (nextIdx < allRows.length) {
      const nextRow = allRows[nextIdx];
      if (nextRow && Array.isArray(nextRow)) {
        const nextNumCount = rowHasManyNumbers(nextRow as unknown[]);
        if (nextNumCount >= 2) {
          score += 3;
          break;
        }
        if (isEmptyRow(nextRow as unknown[])) {
          score -= 2;
        }
      }
    }
  }

  // 整行像标题（只有一个长文本）
  if (nonEmptyCount === 1 && nonEmpty[0] && nonEmpty[0].length > 20) {
    score -= 20;
  }

  return score;
}

// ============================================================
// 行特征判断
// ============================================================
function isEmptyRow(row: unknown[]): boolean {
  if (!row || row.length === 0) return true;
  return row.every(c => c === '' || c === '-' || c === null || c === undefined);
}

function isExplanationRow(strs: string[]): boolean {
  const text = strs.join(' ');
  return EXPLANATION_KEYWORDS.some(kw => text.includes(kw));
}

function rowHasManyNumbers(row: unknown[]): number {
  if (!row || row.length === 0) return 0;
  return row.filter(v => {
    const str = String(v ?? '').trim();
    if (str === '' || str === '-') return false;
    const n = parseFloat(str);
    return !isNaN(n) && Number.isFinite(n);
  }).length;
}

// ============================================================
// 清洗表头名
// ============================================================
export function cleanHeaderName(raw: string): string {
  let cleaned = raw.replace(/[\u0000-\u001f\u007f\u00a0]/g, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ============================================================
// 字段去重
// ============================================================
export function dedupeHeaders(headers: string[], warnings: string[]): string[] {
  const seen: Record<string, number> = {};
  let hasDup = false;
  const result: string[] = [];
  let emptyCounter = 0;

  for (const h of headers) {
    const cleaned = cleanHeaderName(h);
    if (cleaned === '') {
      emptyCounter++;
      result.push(`未命名字段${emptyCounter}`);
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen[key] !== undefined) {
      hasDup = true;
      seen[key]++;
      result.push(`${cleaned}_${seen[key]}`);
    } else {
      seen[key] = 0;
      result.push(cleaned);
    }
  }
  if (hasDup) warnings.push('检测到重复字段名，已自动重命名。');
  return result;
}
