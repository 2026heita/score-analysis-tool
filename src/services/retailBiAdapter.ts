/**
 * 零售 BI 数据适配器。
 *
 * 作用：
 * 1. 将零售 BI API 返回的数据转换为平台统一的 ParsedTable；
 * 2. 将接口字段映射为适合展示和分析的中文表头；
 * 3. 保留 ISO 日期和纯数字字符串，供现有字段系统识别；
 * 4. 不负责 API 请求、界面状态或字段类型推断。
 */

import type { ParsedTable } from '../types';
import type { SalesOverviewRow } from '../types/retailBi';

/**
 * 零售销售趋势数据的统一表头。
 */
const RETAIL_BI_HEADERS = [
  '日期',
  '销售额',
  '订单数',
  '客户数',
  '销售数量',
  '平均客单价',
  '数据来源',
];

/**
 * 将零售 BI 销售趋势数据转换为平台分析格式。
 *
 * 不构造旧版 ParseSummary，避免旧成绩分析类型系统
 * 将销售额、订单数等字段错误识别为 score。
 */
export function convertSalesDataToParsedTable(
  data: SalesOverviewRow[],
): ParsedTable {
  const rows: Record<string, string>[] = data.map((row) => ({
    日期: row.dt,
    销售额: String(row.totalSales),
    订单数: String(row.totalOrders),
    客户数: String(row.totalCustomers),
    销售数量: String(row.totalQuantity),
    平均客单价: String(row.avgOrderValue),
    数据来源: row.sourceSystem,
  }));

  return {
    headers: [...RETAIL_BI_HEADERS],
    rows,
    warnings:
      data.length === 0
        ? ['指定日期范围内没有可供分析的零售 BI 数据']
        : [],
  };
}
