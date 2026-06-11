import type { ParsedTable } from '../types';

/**
 * 解析表格文本，按优先级尝试分隔符：
 * 1. Tab 分隔（Excel 复制默认）
 * 2. 逗号分隔
 * 3. 多个空格分隔
 *
 * 返回包含 headers、rows、warnings 的结构
 */
export function parseTableText(text: string): ParsedTable {
  const warnings: string[] = [];

  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('至少需要字段行和一行数据');
  }

  // 检测第一行的分隔符类型
  const firstLine = lines[0];
  let delimiter: 'tab' | 'comma' | 'multi-space';

  if (firstLine.includes('\t')) {
    delimiter = 'tab';
  } else if (firstLine.includes(',')) {
    delimiter = 'comma';
  } else {
    delimiter = 'multi-space';
  }

  const splitLine = (line: string): string[] => {
    switch (delimiter) {
      case 'tab':
        return line.split('\t').map(c => c.trim());
      case 'comma':
        return line.split(',').map(c => c.trim());
      case 'multi-space':
        return line.split(/\s{2,}/).map(c => c.trim());
    }
  };

  let headers = splitLine(firstLine);

  if (headers.length <= 1) {
    // 回退：尝试其他分隔符
    const altHeaders = firstLine.split(/\t|,|\s{2,}/).map(h => h.trim()).filter(Boolean);
    if (altHeaders.length > 1) {
      warnings.push('字段分隔符不明确，已自动切换分隔方式。');
      headers = altHeaders;
    }
  }

  // 处理重复字段名：自动加后缀
  const seen: Record<string, number> = {};
  const dedupedHeaders = headers.map(h => {
    const key = h.toLowerCase();
    if (seen[key] !== undefined) {
      seen[key]++;
      warnings.push('检测到重复字段名，已自动重命名。');
      return `${h}_${seen[key]}`;
    }
    seen[key] = 0;
    return h;
  });

  const rows = lines.slice(1).map(line => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    dedupedHeaders.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });

  if (dedupedHeaders.length <= 0) {
    throw new Error('字段解析失败，请确认第一行为字段名。');
  }

  return {
    headers: dedupedHeaders,
    rows,
    warnings,
  };
}
