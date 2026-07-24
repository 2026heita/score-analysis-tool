// ============================================================
// 成绩表智能解析器 - 数据行分类
// ============================================================

import type { RowType } from './types';

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
 * 分类规则（按优先级）：
 * 1. 全空行 → empty
 * 2. 包含明确汇总关键词 → summary
 * 3. 所有非空值都是状态关键词 → statusOnly
 * 4. 其他所有情况 → validData
 * 
 * 注意：不再依赖身份字段或数值字段的存在，支持通用业务表
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

  // 2. 包含明确汇总关键词 → summary
  const rowText = values.join(' ');
  if (SUMMARY_KEYWORDS.some(kw => rowText.includes(kw))) {
    return 'summary';
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
  // 只有当整行都是状态词时才判定为 statusOnly，避免误判混合数据行
  if (nonEmptyCount > 0 && statusCount === nonEmptyCount) {
    return 'statusOnly';
  }

  // 5. 其他所有情况 → validData
  // 不再依赖身份字段或数值字段的存在，支持通用业务表
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
