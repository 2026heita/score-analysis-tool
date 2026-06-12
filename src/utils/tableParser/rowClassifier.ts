// ============================================================
// 成绩表智能解析器 - 数据行分类
// ============================================================

import type { RowType } from './types';
import { parseNumericValue } from './numericParser';

// 统计行关键词
const SUMMARY_KEYWORDS = [
  '平均', '合计', '统计', '汇总', '总分平均', '年级平均',
  '班级平均', '全校', '总计', '小计', '累计',
  '最大值', '最小值', '平均分', '标准差',
];

// 状态值关键词
const STATUS_KEYWORDS = [
  '缺考', '弃考', '转班', '转到', '转至', '无成绩',
  '休学', '退学', '请假', '缓考', '借读',
];

/**
 * 分类数据行
 * 
 * @param row - 数据行（Record<string, string>）
 * @param headers - 表头数组
 * @returns RowType 分类结果
 */
export function classifyDataRow(row: Record<string, string>, headers: string[]): RowType {
  const values = headers.map(h => row[h] ?? '');

  // 1. 全空行
  if (values.every(v => v === '' || v === '-' || v === null || v === undefined)) {
    return 'empty';
  }

  // 2. 检查是否包含统计关键词
  const rowText = values.join(' ');
  if (SUMMARY_KEYWORDS.some(kw => rowText.includes(kw))) {
    return 'summary';
  }

  // 3. 检查是否大量是状态值
  let statusCount = 0;
  let numericCount = 0;
  let nonEmptyCount = 0;

  for (const val of values) {
    if (val === '' || val === '-') continue;
    nonEmptyCount++;

    const isStatus = STATUS_KEYWORDS.some(kw => val.includes(kw));
    if (isStatus) {
      statusCount++;
    }

    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') {
      numericCount++;
    }
  }

  // 如果大量非空值是状态值 → statusOnly
  if (nonEmptyCount > 0 && statusCount / nonEmptyCount > 0.5 && numericCount === 0) {
    return 'statusOnly';
  }

  // 4. 检查是否为正常的学生数据行
  const hasIdentity = hasIdentityValue(row, headers);
  const hasValidScore = numericCount > 0;

  if (hasIdentity && hasValidScore) {
    return 'validData';
  }

  // 如果没有身份信息但有数值，且数值不多 → 可能是统计行
  if (!hasIdentity && numericCount <= 2 && nonEmptyCount <= 3) {
    // 如果数值看起来像平均值（小数位较多），判定为 summary
    const numericValues = values
      .map(v => parseNumericValue(v))
      .filter(r => r.status === 'valid')
      .map(r => r.value);

    if (numericValues.some(v => !Number.isInteger(v))) {
      return 'summary';
    }
  }

  // 默认当作有效数据（保守策略）
  return hasValidScore ? 'validData' : 'invalid';
}

/**
 * 检查行是否包含身份信息（姓名、考号等）
 */
function hasIdentityValue(row: Record<string, string>, headers: string[]): boolean {
  const identityKeywords = ['姓名', '名字', '考号', '座号', '学号', '考生号', '准考证'];

  for (const header of headers) {
    const headerLower = header.toLowerCase();
    for (const kw of identityKeywords) {
      if (headerLower.includes(kw.toLowerCase())) {
        const val = row[header]?.trim();
        if (val && val !== '' && val !== '-') {
          return true;
        }
      }
    }
  }

  // 如果没有找到明确的身份字段，检查是否有任何文本内容像姓名（2-4个中文字符）
  for (const val of Object.values(row)) {
    if (/^[\u4e00-\u9fa5]{2,6}$/.test(val.trim())) {
      return true;
    }
  }

  return false;
}

/**
 * 批量分类数据行，返回统计信息
 */
export function classifyDataRows(
  rows: Record<string, string>[],
  headers: string[],
): {
  validData: number;
  empty: number;
  statusOnly: number;
  summary: number;
  invalid: number;
  validRows: Record<string, string>[];
} {
  let validData = 0, empty = 0, statusOnly = 0, summary = 0, invalid = 0;
  const validRows: Record<string, string>[] = [];

  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    switch (type) {
      case 'validData':
        validData++;
        validRows.push(row);
        break;
      case 'empty':
        empty++;
        break;
      case 'statusOnly':
        statusOnly++;
        break;
      case 'summary':
        summary++;
        break;
      case 'invalid':
        invalid++;
        break;
    }
  }

  return { validData, empty, statusOnly, summary, invalid, validRows };
}
