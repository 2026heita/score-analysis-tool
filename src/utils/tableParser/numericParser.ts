// ============================================================
// 成绩表智能解析器 - 数值解析
// ============================================================

import type { ParsedNumber } from './types';

// 明确的非数值关键词（带文字的状态，返回 invalid）
const INVALID_KEYWORDS = [
  '缺考', '弃考', '转班', '转到', '无', '无成绩',
  '休学', '退学', '请假', '缓考',
];

// 缺失值占位符（单独作为占位符，返回 empty）
const EMPTY_PLACEHOLDERS = ['-', '—', '–', '/', '\\', '|'];

/**
 * 统一空值语义：判断一个原始单元格是否为缺失/空值。
 *
 * 这是项目权威的空值定义（来源：下述 parseNumericValue 的空值占位符规则），
 * 供筛选等消费方复用，避免各处各自用 "trim() === ''" 判断导致口径不一致。
 *
 * 规则：
 * - null / undefined → 空
 * - 数字（含 0）→ 非空（0 绝不能因 falsy 被视为空）
 * - 字符串 trim 后为 '' 或属于缺失占位符（"-","—","–","/","\\","|"）→ 空
 * - 其余（状态词"缺考/弃考/未参加"、普通文本、无效数字串等）→ 非空
 *
 * 注意：invalid ≠ empty。无法解析为数字的 "abc"/"1,23"/"100abc" 及状态词不算空。
 */
export function isEmptyLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return false;
  const str = String(value).trim();
  if (str === '') return true;
  return EMPTY_PLACEHOLDERS.includes(str);
}

// 日期格式正则（优先于数字解析）
const DATE_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,           // 2024-01-01, 2024/01/01
  /^\d{4}年\d{1,2}月\d{1,2}日?$/,            // 2024年1月1日
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/, // 2024-01-01 12:30
];

// 严格千分位格式正则：可选正负号 + 1-3位数字 + (逗号 + 恰好3位数字) + 可选小数
const STRICT_THOUSANDS_FORMAT = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/**
 * 严格解析数字字符串
 * - 如果包含逗号，必须通过千分位格式校验
 * - 如果不包含逗号，使用 Number() 解析
 * - 返回 number | null
 */
function parseNumericStringStrict(str: string): number | null {
  if (str === '') return null;
  
  // 如果包含逗号，必须严格校验千分位格式
  if (str.includes(',')) {
    if (!STRICT_THOUSANDS_FORMAT.test(str)) {
      return null; // 千分位格式不合法
    }
    // 格式合法，去除逗号后解析
    const cleaned = str.replace(/,/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  
  // 不包含逗号，直接使用 Number() 解析
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * 解析单个单元格的数值
 * 
 * 支持：
 * 1. 数字类型
 * 2. 字符串数字： "550"、"550.5"
 * 3. 带空格数字： " 550 "
 * 4. 百分号："85%" → 85（成绩场景）
 * 
 * 返回 invalid 的情况：
 * - 缺考、弃考、转到7班、转班、无、无成绩、-、/
 * 
 * 返回 empty 的情况：
 * - 空值、null、undefined、空字符串
 */
export function parseNumericValue(val: unknown): ParsedNumber {
  // 1. 空值处理
  if (val === null || val === undefined || val === '') {
    return { status: 'empty' };
  }

  // 2. 数字类型
  if (typeof val === 'number') {
    return Number.isFinite(val) ? { status: 'valid', value: val } : { status: 'invalid' };
  }

  // 3. 布尔类型（谨慎处理）
  if (typeof val === 'boolean') {
    return { status: 'invalid' };
  }

  // 4. 字符串处理
  const str = String(val).trim();

  // 4.1 空字符串 / 缺失值占位符（统一空值语义）
  if (isEmptyLike(str)) {
    return { status: 'empty' };
  }

  // 4.3 检查是否为明确的无效关键词（带文字的状态，返回 invalid）
  if (isInvalidKeyword(str)) {
    return { status: 'invalid' };
  }

  // 4.4 日期格式检测（优先于数字解析）
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(str)) {
      return { status: 'invalid' };
    }
  }

  // 4.5 处理百分号：成绩场景解析为数值部分
  if (str.endsWith('%')) {
    const numStr = str.slice(0, -1).trim();
    // 百分号内部也使用严格千分位校验
    const num = parseNumericStringStrict(numStr);
    if (num !== null) {
      return { status: 'valid', value: num };
    }
    return { status: 'invalid' };
  }

  // 4.6 使用严格解析函数（包含千分位校验）
  const num = parseNumericStringStrict(str);
  if (num !== null) {
    return { status: 'valid', value: num };
  }

  // 4.7 包含数字但解析失败的情况（如 "转到7班"）
  if (/\d/.test(str)) {
    // 包含数字但整体不是有效数字 → 无效
    return { status: 'invalid' };
  }

  return { status: 'invalid' };
}

/**
 * 检查是否为明确的无效关键词
 */
function isInvalidKeyword(str: string): boolean {
  const lower = str.toLowerCase();
  for (const kw of INVALID_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * 便捷函数：兼容旧的 parseNumericValue 接口（返回 number | null）
 */
export function parseNumericValueLegacy(val: unknown): number | null {
  const result = parseNumericValue(val);
  return result.status === 'valid' ? result.value : null;
}
