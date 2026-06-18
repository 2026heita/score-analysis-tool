/**
 * 数据筛选 - 纯函数
 * 
 * 职责：基于多条件对数据行进行 AND 筛选，不修改原始数据
 * 
 * 核心原则：
 * 1. 不修改原始 parsedData，返回新数组
 * 2. 空条件 = 使用全部数据
 * 3. 多条件全部为 AND 组合
 * 4. 非法数值条件不崩溃，该条件不匹配即可
 */

import type { FieldMeta } from '../utils/tableParser/types';

/** 文本字段操作符 */
export type TextOperator = 'equals' | 'contains' | 'notContains' | 'isEmpty' | 'isNotEmpty';

/** 数值字段操作符 */
export type NumericOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'equals' | 'isEmpty' | 'isNotEmpty';

/** 筛选条件 */
export interface FilterCondition {
  /** 字段名 */
  field: string;
  /** 操作符 */
  operator: TextOperator | NumericOperator;
  /** 筛选值（"between" 时用逗号分隔：min,max） */
  value: string;
}

/** 筛选摘要 */
export interface FilterSummary {
  originalCount: number;
  filteredCount: number;
  filterRatio: number;
  activeConditions: number;
}

/** 数值分析角色集合 */
const NUMERIC_ROLES = new Set(['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment']);

/**
 * 判断字段是否为数值类型
 */
export function isNumericFilterField(meta: FieldMeta): boolean {
  return NUMERIC_ROLES.has(meta.analysisRole);
}

/**
 * 从字段元数据列表构建数值字段名集合
 */
export function buildNumericFieldSet(fieldMetas: FieldMeta[]): Set<string> {
  return new Set(
    fieldMetas.filter(m => isNumericFilterField(m)).map(m => m.header)
  );
}

/**
 * 评估数值条件
 */
function evaluateNumericCondition(
  raw: string | undefined,
  operator: NumericOperator,
  condValue: string
): boolean {
  // 空值处理
  const isEmpty = raw === undefined || raw === null || raw.trim() === '';
  if (operator === 'isEmpty') return isEmpty;
  if (operator === 'isNotEmpty') return !isEmpty;
  if (isEmpty) return false; // 空值不满足其他数值条件

  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return false; // 非数值不满足条件

  switch (operator) {
    case 'gt': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num > v;
    }
    case 'lt': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num < v;
    }
    case 'gte': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num >= v;
    }
    case 'lte': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num <= v;
    }
    case 'equals': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num === v;
    }
    case 'between': {
      const parts = condValue.split(',').map(s => parseFloat(s.trim()));
      if (parts.length !== 2 || !parts.every(Number.isFinite)) return false;
      return num >= parts[0] && num <= parts[1];
    }
    default:
      return true;
  }
}

/**
 * 评估文本条件
 */
function evaluateTextCondition(
  raw: string,
  operator: TextOperator,
  condValue: string
): boolean {
  const trimmed = raw.trim();

  switch (operator) {
    case 'equals':
      return trimmed === condValue.trim();
    case 'contains':
      return trimmed.includes(condValue.trim());
    case 'notContains':
      return !trimmed.includes(condValue.trim());
    case 'isEmpty':
      return trimmed === '';
    case 'isNotEmpty':
      return trimmed !== '';
    default:
      return true;
  }
}

/**
 * 对数据行进行筛选
 * 
 * @param rows 原始数据行
 * @param conditions 筛选条件数组（AND 组合）
 * @param numericFields 数值字段名集合
 * @returns 筛选后行数组和筛选摘要
 */
export function filterRows(
  rows: Record<string, string>[],
  conditions: FilterCondition[],
  numericFields: Set<string>
): { filteredRows: Record<string, string>[]; filterSummary: FilterSummary } {
  const activeConditions = conditions.filter(c => c.field && c.operator);

  // 空条件 = 使用全部数据
  if (activeConditions.length === 0) {
    return {
      filteredRows: rows,
      filterSummary: {
        originalCount: rows.length,
        filteredCount: rows.length,
        filterRatio: 0,
        activeConditions: 0,
      },
    };
  }

  const filteredRows = rows.filter(row => {
    return activeConditions.every(cond => {
      const rawValue = row[cond.field];
      const isNumeric = numericFields.has(cond.field);

      if (isNumeric) {
        return evaluateNumericCondition(rawValue, cond.operator as NumericOperator, cond.value);
      } else {
        return evaluateTextCondition(rawValue || '', cond.operator as TextOperator, cond.value);
      }
    });
  });

  return {
    filteredRows,
    filterSummary: {
      originalCount: rows.length,
      filteredCount: filteredRows.length,
      filterRatio: rows.length > 0 ? (rows.length - filteredRows.length) / rows.length : 0,
      activeConditions: activeConditions.length,
    },
  };
}