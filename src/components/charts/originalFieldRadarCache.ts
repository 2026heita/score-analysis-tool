/**
 * OriginalFieldRadar 模块级缓存（轻量模块，不含 echarts 依赖）。
 *
 * 目的：让 App 需要「清空雷达图缓存」时不必急切 import 图表模块（OriginalFieldRadar →
 * EChartsWrapper → echarts），否则会让 echarts 在应用入口同步被加载、打入主 bundle。
 * 该缓存状态从 OriginalFieldRadar.tsx 抽出，供 App 与图表组件共同持有。
 */

export type RadarViewMode = 'bar' | 'radar';

let _cachedSelectedFields: string[] | null = null;
let _cachedFieldValues: Record<string, number> | null = null;
let _cachedViewMode: RadarViewMode | null = null;

/** 读取缓存的字段选择（无则 null） */
export function getRadarSelectedFieldsCache(): string[] | null {
  return _cachedSelectedFields;
}

/** 读取缓存的字段->用户数值（无则 null） */
export function getRadarFieldValuesCache(): Record<string, number> | null {
  return _cachedFieldValues;
}

/** 读取缓存的视图模式（无则 null） */
export function getRadarViewModeCache(): RadarViewMode | null {
  return _cachedViewMode;
}

/** 写入缓存（在渲染/状态变化时同步，避免组件重挂载丢失） */
export function setRadarCache(
  fields: string[],
  values: Record<string, number>,
  mode: RadarViewMode,
): void {
  _cachedSelectedFields = fields;
  _cachedFieldValues = { ...values };
  _cachedViewMode = mode;
}

/** 显式清除缓存：应在切换数据集、清空数据、加载示例数据时调用 */
export function clearOriginalFieldRadarCache(): void {
  _cachedSelectedFields = null;
  _cachedFieldValues = null;
  _cachedViewMode = null;
}