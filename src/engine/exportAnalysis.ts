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

/**
 * CSV 单元格转义
 * - 包含逗号、双引号、换行符时用双引号包裹
 * - 内部双引号转义为两个双引号
 */
function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
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
 * 包含：统计指标 + 排名定位 + 抽样信息
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

  // 排名定位部分
  if (position) {
    lines.push(buildCsvLine(['排名定位', '数值']));
    lines.push(buildCsvLine(['总人数', position.total]));
    lines.push(buildCsvLine(['高于你的数量', position.higherCount]));
    lines.push(buildCsvLine(['与你相等的数量', position.equalCount]));
    lines.push(buildCsvLine(['低于你的数量', position.lowerCount]));
    lines.push(buildCsvLine(['最佳排名', position.bestRank]));
    lines.push(buildCsvLine(['最差排名', position.worstRank]));
    lines.push(buildCsvLine(['预估排名', position.estimatedRank]));
    lines.push(buildCsvLine(['百分位', position.percentile]));
    lines.push(buildCsvLine(['数值在数据中', position.existsInData ? '是' : '否']));
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
  }

  return buildCsvContent(lines);
}