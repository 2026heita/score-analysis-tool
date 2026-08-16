import { parseRowsToTable, detectDelimiter, splitLine, parseCsvText } from './tableParser';
import type { ParsedTable } from '../types';

/**
 * 解析表格文本，支持智能表头识别。
 *
 * 1. 自动检测分隔符（Tab / 逗号 / 多空格）
 * 2. 将文本转为二维数组
 * 3. 使用统一 parseRowsToTable 进行表头识别、字段清洗、数据行过滤
 *
 * 逗号分隔（CSV）路径使用引号感知状态机整段解析：
 * - 引号内逗号/换行保持为一个单元格
 * - 引号内双引号转义
 * - CRLF 不产生 \r 残留
 * - 未闭合引号返回 warning
 */
export function parseTableText(text: string): ParsedTable {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('请先粘贴或输入表格数据。');
  }

  // 检测分隔符（引号感知，忽略引号内逗号）
  const firstLine = trimmed.split(/\r?\n/)[0];
  const delimiter = detectDelimiter(firstLine);

  let rows: unknown[][];
  let csvWarnings: string[] = [];

  if (delimiter === 'comma') {
    // 整段引号感知解析，支持引号内换行与 CRLF
    const parsed = parseCsvText(trimmed, ',');
    rows = parsed.rows;
    csvWarnings = parsed.warnings;
  } else {
    // Tab / 多空格：保持逐行拆分
    const lines = trimmed.split(/\r?\n/);
    rows = lines.map(line => splitLine(line, delimiter));
  }

  // 使用统一解析
  const result = parseRowsToTable(rows);

  // 合并 CSV 引号相关警告（如未闭合引号）
  if (csvWarnings.length > 0) {
    result.warnings = [...csvWarnings, ...(result.warnings || [])];
  }

  return result;
}
