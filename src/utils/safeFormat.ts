/**
 * 安全数值格式化模块
 * 用于统一处理所有需要展示给用户的数值，避免运行时崩溃
 */

/**
 * 判断值是否为有限数字（排除 undefined、null、NaN、Infinity、字符串、对象等）
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 安全格式化数值
 * @param value 待格式化的值
 * @param decimals 小数位数（默认 1，范围 0-20）
 * @param fallback 无效值时的替代文本（默认 "—"）
 * @returns 格式化后的字符串
 */
export function safeFormatNumber(
  value: unknown,
  decimals: number = 1,
  fallback: string = '—'
): string {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  // 限制小数位数在 0-20 范围内，避免 RangeError
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  return value.toFixed(safeDecimals);
}

/**
 * 安全格式化百分比
 * @param value 待格式化的值（应为 0-100 之间的数值）
 * @param decimals 小数位数（默认 1，范围 0-20）
 * @param fallback 无效值时的替代文本（默认 "—"）
 * @returns 格式化后的百分比字符串，如 "85.3%"
 */
export function safeFormatPercent(
  value: unknown,
  decimals: number = 1,
  fallback: string = '—'
): string {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  // 限制小数位数在 0-20 范围内，避免 RangeError
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  return `${value.toFixed(safeDecimals)}%`;
}

/**
 * 从 ECharts formatter 参数中安全提取数值
 * ECharts 的 formatter 参数可能是：
 * - 数字：直接使用
 * - 数组：取第一个元素
 * - 对象：尝试从 value 字段提取
 * @param param ECharts formatter 参数
 * @returns 提取的数值，无效时返回 undefined
 */
export function extractNumericFromEChartsParam(param: unknown): number | undefined {
  if (isFiniteNumber(param)) {
    return param;
  }
  
  if (Array.isArray(param) && param.length > 0) {
    const first = param[0];
    if (isFiniteNumber(first)) {
      return first;
    }
  }
  
  if (param && typeof param === 'object' && 'value' in param) {
    const val = (param as any).value;
    if (isFiniteNumber(val)) {
      return val;
    }
  }
  
  return undefined;
}

/**
 * 判断 percentile 值是否有效（可用于展示和计算）
 * 用于过滤无效的分析结果
 */
export function isValidPercentile(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}
