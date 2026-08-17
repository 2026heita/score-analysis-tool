import { parseRowsToTable, detectDelimiterFromText, splitLine, parseCsvText } from './tableParser';
import { ParseError } from './tableParser/errors';
import type { ParsedTable } from '../types';

/**
 * 解析表格文本，支持智能表头识别。
 *
 * 1. 基于前几条非空记录综合判断分隔符（Tab / 逗号 / 多空格）
 *    而非只看第一行，能正确处理"标题行/说明行在表格之前"的场景。
 * 2. 将文本转为二维数组
 * 3. 使用统一 parseRowsToTable 进行表头识别、字段清洗、数据行过滤
 *
 * 逗号分隔（CSV）路径使用引号感知状态机整段解析：
 * - 引号内逗号/换行保持为一个单元格
 * - 引号内双引号转义
 * - CRLF 不产生 \r 残留
 * - 未闭合引号返回 warning，且该残缺逻辑记录被排除，不进入有效数据
 */
export function parseTableText(text: string): ParsedTable {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('请先粘贴或输入表格数据。');
  }

  // 综合前几条非空记录判断分隔符（引号感知，忽略引号内逗号）
  const delimiter = detectDelimiterFromText(trimmed);

  let rows: unknown[][];
  let csvWarnings: string[] = [];

  if (delimiter === 'comma') {
    // 整段引号感知解析，支持引号内换行与 CRLF
    const parsed = parseCsvText(trimmed, ',');
    csvWarnings = parsed.warnings;

    // 未闭合引号的残缺逻辑记录不允许进入有效数据
    const malformedSet = new Set(parsed.malformedRowIndices);
    rows = parsed.rows.filter((_, idx) => !malformedSet.has(idx));
  } else {
    // Tab / 多空格：保持逐行拆分
    const lines = trimmed.split(/\r?\n/);
    rows = lines.map(line => splitLine(line, delimiter));
  }

  // 使用统一解析；若因排除未闭合引号的残缺记录导致无有效数据，
  // 将 CSV 引号警告并入错误信息，避免"提示有问题却仍拿到错误数据"。
  try {
    const result = parseRowsToTable(rows);

    // 合并 CSV 引号相关警告（如未闭合引号）
    if (csvWarnings.length > 0) {
      result.warnings = [...csvWarnings, ...(result.warnings || [])];
    }

    return result;
  } catch (err) {
    if (csvWarnings.length > 0) {
      const detail = err instanceof Error && err.message ? err.message : '解析失败';
      throw new ParseError(`${csvWarnings.join(' ')}\n${detail}`);
    }
    throw err;
  }
}
