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
 * 单日销售概览指标数据（overview 接口返回）。
 */
export interface SalesOverviewVO {
  dt: string;
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuantity: number;
  avgOrderValue: number;
  sourceSystem: string;
}

/**
 * 销售趋势数据行（trend 接口返回的数组元素）。
 * 与 SalesOverviewVO 结构相同，语义上用于趋势数据。
 */
export type SalesOverviewRow = SalesOverviewVO;

/**
 * 零售 BI 项目的连接及查询配置。
 */
export interface RetailBiConnectionConfig {
  baseUrl: string;
  startDate: string;
  endDate: string;
}

/**
 * 环比变化百分比（comparison 接口返回）。
 * 字段名包含 Percent，表示返回值 12.34 是百分之十二点三四。
 * 上一可用业务日某项指标为 0 时，对应百分比为 null。
 */
export interface SalesOverviewChangePercentVO {
  totalSalesPercent: number | null;
  totalOrdersPercent: number | null;
  totalCustomersPercent: number | null;
  totalQuantityPercent: number | null;
  avgOrderValuePercent: number | null;
}

/**
 * 日环比对比结果（comparison 接口返回）。
 * comparisonDate 表示同一 source_system 下上一可用业务日期。
 * 当 comparisonAvailable=false 时，comparisonDate 为 null。
 */
export interface SalesOverviewComparisonVO {
  date: string;
  comparisonDate: string | null;
  comparisonAvailable: boolean;
  current: SalesOverviewVO;
  previous: SalesOverviewVO | null;
  changePercent: SalesOverviewChangePercentVO | null;
}

/**
 * 经营异常数据行（anomalies 接口返回）。
 *
 * anomalyLevel 当前仅展示 MEDIUM / HIGH；
 * primaryDriver 仅表示基于指标分解选出的主要直接驱动项，
 * 不表示因果关系。
 */
export interface SalesAnomalyVO {
  dt: string;
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  totalQuantity: number;
  avgOrderValue: number;
  prevDt: string | null;
  prevSales: number | null;
  salesChangePct: number | null;
  salesLossAmount: number | null;
  ordersChangePct: number | null;
  customersChangePct: number | null;
  quantityChangePct: number | null;
  aovChangePct: number | null;
  anomalyLevel: 'MEDIUM' | 'HIGH' | string;
  primaryDriver: 'ORDERS' | 'AVG_ORDER_VALUE' | string | null;
  sourceSystem: string;
}
