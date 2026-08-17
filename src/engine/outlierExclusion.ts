/**
 * 异常值排除 - 纯函数（无 React 依赖）
 *
 * 职责：把"排除异常值"定义为一层作用于分析行的过滤，供 Hook / 测试共用。
 *
 * 数据层级：
 *   原始数据 -> 普通筛选后的 analysisRows -> 异常值排除后的分析行
 *
 * 原则：
 * - 不修改传入数组，只返回过滤后的新数组；
 * - 检测基于完整当前分析行（含已排除候选），以便面板展示并可恢复。
 */

import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

/** 字段数值提取结果：数值数组 + 与之对应的真实行下标 */
export interface FieldNumericExtract {
  values: number[];
  rowIndices: number[];
}

/**
 * 提取某字段的数值，并保留与 analysisRows 对应的真实行下标。
 * 仅统计可解析为数字、且非空白的行。
 */
export function extractFieldNumericValues(
  rows: Record<string, string>[],
  fieldName: string
): FieldNumericExtract {
  const values: number[] = [];
  const rowIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]?.[fieldName];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const num = parseNumericValueLegacy(String(raw));
    if (num !== null) {
      values.push(num);
      rowIndices.push(i);
    }
  }
  return { values, rowIndices };
}

/**
 * 过滤掉被排除的行（不修改原数组）。
 * @param rows 当前分析行
 * @param excludedRowIndices 要排除的真实行下标集合
 */
export function filterRowsExcluding(
  rows: Record<string, string>[],
  excludedRowIndices: ReadonlySet<number>
): Record<string, string>[] {
  if (!excludedRowIndices || excludedRowIndices.size === 0) return rows;
  return rows.filter((_, idx) => !excludedRowIndices.has(idx));
}