/**
 * 导出分析结果 - 纯函数
 * 
 * 职责：将分析结果导出为 CSV 格式，支持中文和特殊字符转义
 * 
 * 核心原则：
 * 1. 输出 UTF-8 BOM，保证 Excel 打开中文不乱码
 * 2. 正确处理逗号、双引号、换行符转义
 * 3. 不修改任何现有模块
 * 4. Stage 0A-2: 记录抽样信息
 */

import type { GroupStats } from './groupByDimension';
import type { StatsResult, PositionResult } from '../types';
import type { MetricResult } from './context';
import type { SamplingInfo } from '../hooks/useAnalysisDataset';
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

/**
 * CSV 单元格公式注入防护（OWASP CSV Injection 推荐做法）。
 *
 * 规则：对【文本】单元格，若去掉前导空白/Tab 后以 `= + @` 开头，或已 `-` 开头但
 * 不是合法数字（如 `-CMD`），则添加单引号前缀 `'`，使 Excel / LibreOffice 打开时
 * 作为文本而不是公式执行。这是目前主流表格软件普遍接受的防注入做法。
 *
 * 区分点：
 * - JS number：直接原样输出，绝不加前缀（-10 / 0 / 1e8 保持数字）。
 * - 字符串合法数字（-10、-100.5、-1e3、-0.25）：经 parseNumericValueLegacy 判定为
 *   数字 → 不加前缀，避免把正常负数改坏。
 * - 真正的公式样文本（=1+1、+SUM、-CMD、@SUM）：加 `'` 前缀。
 *
 * 该防护发生在 CSV quoting 之前；随后 escapeCsvCell 仍正确做
 * quoted comma / escaped quote / 换行支持，互不破坏。
 */
export function sanitizeSpreadsheetCell(value: string | number): string | number {
  if (typeof value === 'number') {
    return value; // 数字原样输出，不保护
  }
  const str = String(value ?? '');
  const trimmed = str.trim();

  if (trimmed === '') return str;

  const first = trimmed[0];
  if (first === '=' || first === '+' || first === '@') {
    return `'${str}`;
  }
  if (first === '-') {
    // 合法负数不是注入；非数字的 `-CMD` 才需要保护
    if (parseNumericValueLegacy(trimmed) !== null) {
      return str; // 合法数字（如 -10、-1e3）
    }
    return `'${str}`;
  }
  return str;
}

/**
 * CSV 单元格转义
 * - 先做公式注入防护（sanitizeSpreadsheetCell）
 * - 包含逗号、双引号、换行符时用双引号包裹
 * - 内部双引号转义为两个双引号
 */
function escapeCsvCell(value: string | number): string {
  const safe = sanitizeSpreadsheetCell(value);
  const str = String(safe ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 生成 CSV 行字符串
 */
function buildCsvLine(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * 生成带 BOM 的 CSV 内容
 */
function buildCsvContent(lines: string[]): string {
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 触发浏览器下载文件
 */
export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 生成时间戳字符串（YYYYMMDD-HHmmss）
 */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 导出分组统计为 CSV
 * 
 * 表头：维度值, 数量, 均值, 中位数, 最小值, 最大值, Q25, Q75
 */
export function exportGroupStatsToCsv(groupStats: GroupStats[]): string {
  const header = buildCsvLine(['维度值', '数量', '均值', '中位数', '最小值', '最大值', 'Q25', 'Q75']);
  const rows = groupStats.map(gs =>
    buildCsvLine([
      gs.dimensionValue,
      gs.count,
      gs.mean,
      gs.median,
      gs.min,
      gs.max,
      gs.q25,
      gs.q75,
    ])
  );
  return buildCsvContent([header, ...rows]);
}

/**
 * 导出筛选后数据为 CSV
 * 
 * 保留原始字段顺序，首行为表头
 */
export function exportFilteredRowsToCsv(rows: Record<string, string>[], headers: string[]): string {
  const header = buildCsvLine(headers);
  const dataRows = rows.map(row =>
    buildCsvLine(headers.map(h => row[h] ?? ''))
  );
  return buildCsvContent([header, ...dataRows]);
}

/**
 * 导出当前指标摘要为 CSV
 * 
 * 包含：统计指标 + 相对位置 + 抽样信息
 */
export function exportSummaryToCsv(
  metricResult: MetricResult | null,
  stats: StatsResult | null,
  position: PositionResult | null,
  fieldName: string,
  samplingInfo?: SamplingInfo | null
): string {
  const lines: string[] = [];

  // 抽样信息部分（Stage 0A-2）
  if (samplingInfo) {
    lines.push(buildCsvLine(['数据抽样信息', '']));
    lines.push(buildCsvLine(['抽样算法', samplingInfo.algorithm]));
    lines.push(buildCsvLine(['原始行数', samplingInfo.originalRowCount]));
    lines.push(buildCsvLine(['抽样后行数', samplingInfo.sampledRowCount]));
    lines.push('');
  }

  // 指标字段名
  lines.push(buildCsvLine(['指标字段', fieldName]));
  lines.push('');

  // 统计指标部分
  if (stats) {
    lines.push(buildCsvLine(['统计指标', '数值']));
    lines.push(buildCsvLine(['有效数值', stats.validCount]));
    lines.push(buildCsvLine(['无效/空值', stats.invalidCount]));
    lines.push(buildCsvLine(['总数', stats.count]));
    lines.push(buildCsvLine(['均值', stats.mean]));
    lines.push(buildCsvLine(['中位数', stats.median]));
    lines.push(buildCsvLine(['最小值', stats.min]));
    lines.push(buildCsvLine(['最大值', stats.max]));
    lines.push(buildCsvLine(['Q25', stats.q25]));
    lines.push(buildCsvLine(['Q75', stats.q75]));
    lines.push(buildCsvLine(['Q90', stats.q90]));
    lines.push(buildCsvLine(['Q95', stats.q95]));
  }

  lines.push('');

  // 相对位置部分（neutral/unspecified 不输出）
  const isNeutralOrUnspecified = metricResult?.direction === 'neutral' || metricResult?.direction === 'unspecified';
  if (position && !isNeutralOrUnspecified) {
    lines.push(buildCsvLine(['相对位置', '数值']));
    lines.push(buildCsvLine(['总记录数', position.total]));
    lines.push(buildCsvLine(['高于该值记录数', position.higherCount]));
    lines.push(buildCsvLine(['等于该值记录数', position.equalCount]));
    lines.push(buildCsvLine(['低于该值记录数', position.lowerCount]));
    lines.push(buildCsvLine(['相对位置区间起点', position.bestRank]));
    lines.push(buildCsvLine(['相对位置区间终点', position.worstRank]));
    lines.push(buildCsvLine(['估算相对位置', position.estimatedRank]));
    lines.push(buildCsvLine(['百分位', position.percentile]));
    lines.push(buildCsvLine(['该值是否存在于数据中', position.existsInData ? '是' : '否']));
    lines.push(buildCsvLine(['是否超出数据范围', position.isOutOfRange ? (position.outOfRangeDirection === 'below' ? '低于数据范围' : '高于数据范围') : '否']));
  }

  lines.push('');

  // 指标解读部分
  if (metricResult) {
    lines.push(buildCsvLine(['指标解读', '内容']));
    lines.push(buildCsvLine(['指标名', metricResult.metricName]));
    lines.push(buildCsvLine(['显示名', metricResult.displayName]));
    
    // 修复：neutral/unspecified 不得显示为"越低越好"
    let directionText: string;
    if (metricResult.direction === 'higher-is-better') {
      directionText = '越高越好';
    } else if (metricResult.direction === 'lower-is-better') {
      directionText = '越低越好';
    } else if (metricResult.direction === 'neutral') {
      directionText = '中性（无优劣方向）';
    } else {
      // unspecified
      directionText = '未指定方向';
    }
    lines.push(buildCsvLine(['方向', directionText]));
    
    lines.push(buildCsvLine(['总行数', metricResult.totalRows]));
    lines.push(buildCsvLine(['有效值数量', metricResult.values.length]));
    lines.push(buildCsvLine(['无效值数量', metricResult.invalidCount]));
    
    // neutral/unspecified 添加说明
    if (isNeutralOrUnspecified) {
      lines.push('');
      lines.push(buildCsvLine(['说明', '当前字段方向未指定，仅展示统计分布，不进行优劣评价。']));
    }
  }

  return buildCsvContent(lines);
}