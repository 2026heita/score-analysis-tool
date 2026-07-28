/**
 * 零售 BI API 类型定义。
 *
 * 作用：
 * 1. 约束 Spring Boot 零售指标接口的响应结构；
 * 2. 为 API 客户端和连接组件提供统一类型；
 * 3. 避免在多个文件中重复定义接口字段。
 */

/**
 * 后端统一响应结构。
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  requestId?: string;
}

/**
 * 单日销售概览指标数据。
 */
export interface SalesOverviewRow {
  dt: string;
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuantity: number;
  avgOrderValue: number;
  sourceSystem: string;
}

/**
 * 零售 BI 项目的连接及查询配置。
 */
export interface RetailBiConnectionConfig {
  baseUrl: string;
  startDate: string;
  endDate: string;
}
