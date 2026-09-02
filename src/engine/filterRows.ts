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
import { parseNumericValueLegacy, isEmptyLike } from '../utils/tableParser/numericParser';

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
  /** 筛选值（"between" 旧格式为逗号分隔 "min,max"，仅兼容无千分位歧义的简单场景） */
  value: string;
  /** between 最小值（独立输入框，推荐格式；直接经 parseNumericValueLegacy 解析） */
  betweenMin?: string;
  /** between 最大值（独立输入框，推荐格式；直接经 parseNumericValueLegacy 解析） */
  betweenMax?: string;
}

/** 筛选摘要 */
export interface FilterSummary {
  originalCount: number;
  filteredCount: number;
  filterRatio: number;
  activeConditions: number;
}

/** 数值分析角色集合 */
// @deprecated legacy 教育/旧解析角色白名单；仅旧 fieldMeta 链路使用。通用主链路用
// analysisRole='metric' 或内容数值证据(numericRatio)判定，不再依赖这些教育角色。
const NUMERIC_ROLES = new Set(['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment']);

/** 内容证据：数值占比达到该阈值才视为"可数字筛选"（混合列允许少量非数值） */
const NUMERIC_RATIO_THRESHOLD = 0.5;

/**
 * 判断字段是否可进行数字条件筛选（等于/大于/小于/范围等）。
 *
 * 关键设计：把"能否数字筛选"与"是否为推荐分析指标"（analysisRole）解耦。
 * - 语义明确为数值指标的字段（primaryTotal/rank/sectionTotal/courseScore/adjustment）→ 可数字筛选
 * - 身份/编码类字段（学号、考号、身份证号、学校代码、商品编码、SKU、订单编号、手机号等）
 *   即使字段名不含关键数字，也绝不能仅因"内容全是数字"就自动变成普通数值指标，
 *   因此 analysisRole === 'identity' 或长数字唯一串保持排除。
 * - 其他字段（如 Revenue/销售额/利润/成本/价格/库存等无传统成绩关键词，但内容数值占比高）
 *   依据内容数值证据（contentFeature.numericRatio）决定是否可数字筛选，
 *   而不是强行加成绩关键词或把分析角色改为 courseScore。
 */
export function isNumericFilterField(meta: FieldMeta): boolean {
  // 1) 语义明确的数值指标 → 可数字筛选
  if (NUMERIC_ROLES.has(meta.analysisRole)) return true;

  // 2) 身份/编码字段 → 保护，不可数字筛选（不因内容数字而误判）
  if (meta.analysisRole === 'identity' || meta.type === 'identity') {
    return false;
  }

  // 3) 长数字唯一串（拟序号/编码，如 SKU、订单编号、手机号）→ 保护
  const cf = meta.contentFeature;
  if (cf && cf.valuePattern === 'longNumber' && cf.uniqueRatio > 0.8) {
    return false;
  }

  // 4) 内容数值证据：数值占比达阈值即具备数字筛选能力
  const ratio = cf?.numericRatio ?? (meta.validCount / Math.max(1, meta.textCount + meta.invalidCount + meta.validCount));
  return ratio >= NUMERIC_RATIO_THRESHOLD;
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
 * 解析 between 上下限
 *
 * 优先级：
 * 1. betweenMin / betweenMax（两个独立输入框，无千分位歧义，各自直接经 parseNumericValueLegacy 解析）
 * 2. 旧格式 value "min,max"（仅当整个字符串不是合法数值时，避免 "1,000" 被拆成 1 和 0）
 *
 * 非法输入返回 null（条件无效），不静默转换、不猜测逗号含义。
 * 下限大于上限时返回 null（条件无效），不自动交换顺序。
 */
function parseBetweenBounds(cond: FilterCondition): [number, number] | null {
  // 新格式：只要存在 betweenMin/betweenMax 字段，就以它们为准
  const hasNewFields = cond.betweenMin !== undefined || cond.betweenMax !== undefined;
  if (hasNewFields) {
    const min = parseNumericValueLegacy(cond.betweenMin);
    const max = parseNumericValueLegacy(cond.betweenMax);
    if (min === null || max === null) return null;
    if (min > max) return null;
    return [min, max];
  }

  // 旧格式兼容：value "min,max"，仅限明确无千分位歧义的简单场景（如 "80,90"）
  const legacy = cond.value;
  if (legacy === null || legacy === undefined || String(legacy).trim() === '') return null;
  const trimmed = String(legacy).trim();
  // 整个字符串本身是合法数值（如 "1,000"）→ 是单个值，不是范围 → 无效
  if (parseNumericValueLegacy(trimmed) !== null) return null;
  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount !== 1) return null;
  const [left, right] = trimmed.split(',');
  const min = parseNumericValueLegacy(left.trim());
  const max = parseNumericValueLegacy(right.trim());
  if (min === null || max === null) return null;
  if (min > max) return null;
  return [min, max];
}

/**
 * 归一化单个筛选条件（迁移旧版 between 格式）
 *
 * 旧格式（第十一阶段前）：{ operator: 'between', value: '80,90' }
 * 新格式：{ operator: 'between', betweenMin: '80', betweenMax: '90' }
 *
 * 规则：
 * 1. 仅处理 between 且无新字段的旧条件；可可靠解析时迁移为 betweenMin/betweenMax 并清空旧 value
 * 2. 无法可靠解析的旧条件（如 value '1,000,2,000' 存在历史歧义）保持原样，不猜测、不拆分
 * 3. 其他 operator 不受影响
 */
export function normalizeFilterCondition(cond: FilterCondition): FilterCondition {
  if (cond.operator !== 'between') return cond;
  if (cond.betweenMin !== undefined || cond.betweenMax !== undefined) return cond;

  const bounds = parseBetweenBounds(cond);
  if (bounds === null) return cond;

  return {
    ...cond,
    value: '',
    betweenMin: String(bounds[0]),
    betweenMax: String(bounds[1]),
  };
}

/**
 * 归一化筛选条件数组（见 normalizeFilterCondition）
 */
export function normalizeFilterConditions(conditions: FilterCondition[]): FilterCondition[] {
  return conditions.map(normalizeFilterCondition);
}

/**
 * 评估数值条件
 */
function evaluateNumericCondition(
  raw: string | undefined,
  cond: FilterCondition
): boolean {
  const operator = cond.operator as NumericOperator;
  const condValue = cond.value;

  // 空值处理：与项目统一空值语义一致（""/空格/占位符 "-"…"/" 等均为空）
  const isEmpty = isEmptyLike(raw);
  if (operator === 'isEmpty') return isEmpty;
  if (operator === 'isNotEmpty') return !isEmpty;
  if (isEmpty) return false; // 空值不满足其他数值条件

  const num = parseNumericValueLegacy(raw);
  if (num === null) return false; // 非数值不满足条件

  switch (operator) {
    case 'gt': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num > v;
    }
    case 'lt': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num < v;
    }
    case 'gte': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num >= v;
    }
    case 'lte': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num <= v;
    }
    case 'equals': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num === v;
    }
    case 'between': {
      const bounds = parseBetweenBounds(cond);
      if (bounds === null) return false;
      return num >= bounds[0] && num <= bounds[1];
    }
    default:
      return true;
  }
}

/**
 * 评估文本条件
 */
function evaluateTextCondition(
  raw: unknown,
  operator: TextOperator,
  condValue: string
): boolean {
  // 文本字面量比较使用去空格后的字符串；null/undefined 视为 ''
  const trimmed = String(raw ?? '').trim();

  switch (operator) {
    case 'equals':
      return trimmed === condValue.trim();
    case 'contains':
      return trimmed.includes(condValue.trim());
    case 'notContains':
      return !trimmed.includes(condValue.trim());
    case 'isEmpty':
      // 文本为空复用统一空值语义（""/空格/占位符 "-"…"/" 等）
      return isEmptyLike(raw);
    case 'isNotEmpty':
      return !isEmptyLike(raw);
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
        return evaluateNumericCondition(rawValue, cond);
      } else {
        return evaluateTextCondition(rawValue, cond.operator as TextOperator, cond.value);
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