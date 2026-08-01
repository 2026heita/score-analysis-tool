import { parseRowsToTable, detectDelimiter, splitLine } from './tableParser';
import type { ParsedTable } from '../types';

/**
 * 解析表格文本，支持智能表头识别。
 *
 * 1. 自动检测分隔符（Tab / 逗号 / 多空格）
 * 2. 将文本转为二维数组
 * 3. 使用统一 parseRowsToTable 进行表头识别、字段清洗、数据行过滤
 */
export function parseTableText(text: string): ParsedTable {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('请先粘贴或输入表格数据。');
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 1) {
    throw new Error('至少需要字段行和一行数据');
  }

  // 检测分隔符
  const delimiter = detectDelimiter(lines[0]);

  // 转为二维数组
  const rows: unknown[][] = lines.map(line => splitLine(line, delimiter));

  // 使用统一解析
  return parseRowsToTable(rows);
}
