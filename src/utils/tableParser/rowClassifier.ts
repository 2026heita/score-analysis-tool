// ============================================================
// 成绩表智能解析器 - 数据行分类
// ============================================================

import type { RowType } from './types';
import { parseNumericValueLegacy } from './numericParser';

// 独立汇总标签：仅当单元格【整个值】精确等于这些标签时才视为汇总标签。
// 不做子串匹配，避免"统计学教材/累计消费促销/统计部"这类正常文本被误伤。
const SUMMARY_LABELS = [
  '平均', '合计', '总计', '小计', '汇总', '累计', '最大值', '最小值',
  '标准差', '平均分', '总分平均', '年级平均', '班级平均', '全校',
];

// 状态值关键词
const STATUS_KEYWORDS = [
  '缺考', '弃考', '转班', '转到', '转至', '无成绩',
  '休学', '退学', '请假', '缓考', '借读',
];

/**
 * 判断一个单元格是否是【完整的】汇总标签（精确匹配，非子串包含）
 */
function isExactSummaryLabel(value: string): boolean {
  const t = value.trim();
  return t !== '' && SUMMARY_LABELS.includes(t);
}

/**
 * 分类数据行
 * 
 * 分类规则（按优先级）：
 * 1. 全空行 → empty
 * 2. 汇总行：整行"看起来像一张统计记录" → summary
 * 3. 所有非空值都是状态关键词 → statusOnly
 * 4. 其他所有情况 → validData
 * 
 * 汇总行判定（v2.2.x 收紧）：
 * 不再使用"整行拼接文本包含某关键词"的模糊判断（那会把"统计学教材""累计消费促销"
 * 等正常记录误伤为汇总行）。
 * 改为：
 *   a. 至少一个单元格精确等于汇总标签（如"平均分""合计""总计""最大值""最小值"）；
 *   b. 该行其他非空字段大部分是数字（≥ 非空的一半），或除标签外无其他字段。
 * 若无法可靠判定（如只命中标签但其余字段多为文本），宁可保留为普通数据。
 * 
 * @param row - 数据行（Record<string, string>）
 * @param headers - 表头数组
 * @returns RowType 分类结果
 */
export function classifyDataRow(row: Record<string, string>, headers: string[]): RowType {
  const values = headers.map(h => {
    const v = row[h];
    return v === null || v === undefined ? '' : String(v).trim();
  });

  // 1. 全空行 → empty
  if (values.every(v => v === '')) {
    return 'empty';
  }

  // 2. 汇总行：基于"精确标签 + 行数字结构"
  const labelIndexes = values
    .map((v, i) => (isExactSummaryLabel(v) ? i : -1))
    .filter(i => i >= 0);

  if (labelIndexes.length > 0) {
    // 其余非空字段（去掉标签后）
    const otherNonEmpty = values.filter((v, i) => v !== '' && !labelIndexes.includes(i));
    let numericCount = 0;
    for (const v of otherNonEmpty) {
      if (parseNumericValueLegacy(v) !== null) numericCount++;
    }
    // 规则：无其他字段，或大部分其他字段是数字 → 汇总行
    const isNumericDominated = otherNonEmpty.length === 0
      || (otherNonEmpty.length > 0 && numericCount / otherNonEmpty.length >= 0.5);
    if (isNumericDominated) {
      return 'summary';
    }
    // 否则：命中标签但其余多为文本 → 无法可靠判定，保留为普通数据
  }

  // 3. 统计非空值和状态值
  let statusCount = 0;
  let nonEmptyCount = 0;

  for (const val of values) {
    if (val === '') continue;
    nonEmptyCount++;

    const isStatus = STATUS_KEYWORDS.some(kw => val.includes(kw));
    if (isStatus) {
      statusCount++;
    }
  }

  // 4. 所有非空值都是状态关键词 → statusOnly
  if (nonEmptyCount > 0 && statusCount === nonEmptyCount) {
    return 'statusOnly';
  }

  // 5. 其他所有情况 → validData
  return 'validData';
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
