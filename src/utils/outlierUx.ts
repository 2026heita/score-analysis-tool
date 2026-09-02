/**
 * 异常值 UI 文案与纯逻辑（无 React 依赖，便于单元测试）
 *
 * 职责：把所有"给用户看的异常值文案/状态映射/上下文选取"收拢到一处，
 * 供 OutlierDetailsDialog 与 GeneralDataOverview 复用，并直接作为 contract 测试对象。
 * 本模块只做展示化，绝不修改任何检测算法 / 异常数量 / 阈值 / 行号映射。
 */

import type {
  OutlierDetectionBounds,
  OutlierDetectionResult,
  OutlierRecord,
} from '../engine/outlierDetection';

/** 上下文列最大数量 */
export const MAX_CONTEXT_COLS = 3;

/** 异常记录每页条数 */
export const OUTLIER_PAGE_SIZE = 20;

/** 记录总数对应的页数（<=PAGE_SIZE → 1 页，不显示分页控件） */
export function outlierTotalPages(count: number): number {
  return Math.max(1, Math.ceil(count / OUTLIER_PAGE_SIZE));
}

/** 取第 page 页（0 基）的记录窗口 */
export function paginateRecords<T>(records: readonly T[], page: number): T[] {
  const start = page * OUTLIER_PAGE_SIZE;
  return records.slice(start, start + OUTLIER_PAGE_SIZE);
}

/** 数值格式化（千分位；纯显示） */
export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('zh-CN');
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 判断字段名是否疑似百分比（仅为展示追加 %，不做货币等其他推测） */
export function looksLikePercent(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('%') || lower.includes('率') || /percent|ratio/.test(lower);
}

/** 值列展示：数字加千分位，百分比字段追加 % */
export function fmtValue(n: number | undefined | null, fieldName: string): string {
  const base = fmtNum(n);
  return looksLikePercent(fieldName) && base !== '—' && /[\d]/.test(base) ? `${base}%` : base;
}

/** 方向 badge 文案 */
export function directionLabel(direction: OutlierRecord['direction']): string {
  return direction === 'high' ? '↑ 偏高' : '↓ 偏低';
}

/**
 * 高/低异常数量统计。
 * 仅按 records.direction 统计，不做任何二次检测。
 */
export function countDirections(records: OutlierRecord[]): { high: number; low: number } {
  let high = 0;
  let low = 0;
  for (const r of records) {
    if (r.direction === 'high') high++;
    else low++;
  }
  return { high, low };
}

/**
 * 把记录原因转成更自然的中文。
 * reason 形如 "> 上界 53200" / "< 下界 350"；仅基于已有 bounds 做展示化。
 * 若 distance / upper 可靠，额外提示"超出上界 X%"。
 * 不做任何二次检测，不暴露内部枚举。
 */
export function friendlyReason(
  record: OutlierRecord,
  bounds: OutlierDetectionBounds | undefined,
  fieldName: string
): string {
  const isPercent = looksLikePercent(fieldName);
  const boundary = record.direction === 'high' ? bounds?.upper : bounds?.lower;
  if (boundary !== undefined && Number.isFinite(boundary)) {
    const head = record.direction === 'high' ? '高于统计上界' : '低于统计下界';
    let base = `${head} ${fmtNum(boundary)}${isPercent ? '%' : ''}`;
    if (
      record.direction === 'high' &&
      bounds &&
      Number.isFinite(record.distance) &&
      Number.isFinite(bounds.upper) &&
      bounds.upper > 0
    ) {
      const pct = (record.distance / bounds.upper) * 100;
      if (Number.isFinite(pct)) base = `${base}（超出上界 ${pct.toFixed(1)}%）`;
    }
    return base;
  }
  return String(record.reason || '')
    .replace(/^>\s*上界/, '高于统计上界')
    .replace(/^<\s*下界/, '低于统计下界');
}

/**
 * "通用数据概览 → 数值字段基础统计"表的异常值单元格渲染描述（纯数据，不含 React）。
 * 返回统一结构：
 *  - button：检测到异常候选 → 可点击入口（文案统一为"N 个异常候选 · 查看解析"）
 *  - text：无异常 / 样本不足 / 变化过小 / 不适用 等静态度文案
 *
 * @param compact 移动端命中时启用更短文案（"⚠ N · 解析"），仅对 button 生效。
 */
export type OutlierCellView =
  | { kind: 'button'; count: number; text: string; ariaLabel: string }
  | { kind: 'text'; text: string; title?: string };

/** 异常入口文案的固定前缀「查看解析」（统一 CTA，避免用"查看详情"） */
export const OUTLIER_CTA = '查看解析';

export function outlierCellFor(
  status: OutlierDetectionResult['status'],
  count: number,
  fieldName: string,
  samples: number | undefined,
  compact?: boolean
): OutlierCellView {
  switch (status) {
    case 'detected':
      if (count > 0) {
        return {
          kind: 'button',
          count,
          text: compact ? `${count} · ${OUTLIER_CTA}` : `${count} 个异常候选 · ${OUTLIER_CTA}`,
          ariaLabel: `查看${fieldName}的 ${count} 条异常候选解析`,
        };
      }
      return { kind: 'text', text: '无明显异常' };
    case 'none':
      return { kind: 'text', text: '无明显异常' };
    case 'insufficient_data':
      return {
        kind: 'text',
        text: '样本不足',
        title: samples !== undefined && samples > 0
          ? `有效样本 ${samples}（不足 8），未执行异常判断`
          : '有效样本不足，未执行异常判断',
      };
    case 'insufficient_variation':
      return { kind: 'text', text: '变化过小', title: '数据变化过小，无法可靠判断' };
    case 'unsupported':
      return { kind: 'text', text: '不适用', title: '该字段不适合连续型异常检测' };
    default:
      return { kind: 'text', text: '—' };
  }
}

/**
 * 选取上下文字段（按 analysisRole 优先级：identifier > time > dimension）。
 * @param schemas 字段模式定义
 * @param currentField 当前异常指标字段（需排除）
 * @param fallbackKeys 无 schemas 时的降级字段键
 */
export function selectContextColumns(
  schemas: Array<{ fieldId: string; sourceName: string; analysisRole: string }> | undefined,
  currentField: string,
  fallbackKeys: string[]
): string[] {
  if (schemas && schemas.length > 0) {
    const priorityOrder: Record<string, number> = { identifier: 0, time: 1, dimension: 2 };
    return schemas
      .filter((s) => s.fieldId !== currentField)
      .filter((s) => priorityOrder[s.analysisRole] !== undefined)
      .sort((a, b) => (priorityOrder[a.analysisRole] ?? 99) - (priorityOrder[b.analysisRole] ?? 99))
      .slice(0, MAX_CONTEXT_COLS)
      .map((s) => s.sourceName);
  }
  return fallbackKeys.filter((k) => k !== currentField).slice(0, MAX_CONTEXT_COLS);
}

/**
 * 第一屏"为什么异常"的解释段落（纯数据，不含 React）。
 *
 * 内容：
 *  - method：检测方法（IQR 四分位距）
 *  - range：正常统计范围（lower ～ upper，百分比字段追加 %）
 *  - highCount / lowCount：高/低异常候选数（仅按 records.direction 统计，不二次检测）
 *  - countsLine：例如 "共有 3 条记录超出该范围：2 高 1 低"
 *
 * 供 OutlierDetailsDialog 顶部自然语言解释直接使用，并可作 contract 测试对象。
 */
export interface OutlierExplain {
  method: string;
  rangeText: string | null;
  highCount: number;
  lowCount: number;
  totalOutliers: number;
  countsLine: string;
}

/** 正常统计范围文案（lower ～ upper）。无有效 bounds 返回 null。 */
export function normalRangeText(
  bounds: OutlierDetectionBounds | undefined | null,
  fieldName: string
): string | null {
  if (
    !bounds ||
    !Number.isFinite(bounds.lower) ||
    !Number.isFinite(bounds.upper)
  ) {
    return null;
  }
  const pct = looksLikePercent(fieldName) ? '%' : '';
  return `${fmtNum(bounds.lower)}${pct} ～ ${fmtNum(bounds.upper)}${pct}`;
}

export function buildExplain(
  result: OutlierDetectionResult,
  fieldName: string
): OutlierExplain {
  const { high, low } = countDirections(result.records);
  const total = result.outlierCount;
  const rangeText = normalRangeText(result.bounds, fieldName);
  const parts: string[] = [];
  if (high > 0) parts.push(`${high} 条高于上界`);
  if (low > 0) parts.push(`${low} 条低于下界`);
  return {
    method: 'IQR（四分位距）',
    rangeText,
    highCount: high,
    lowCount: low,
    totalOutliers: total,
    countsLine: parts.length
      ? `共有 ${total} 条记录超出该范围：${parts.join('，')}`
      : `共有 ${total} 条记录超出该范围`,
  };
}