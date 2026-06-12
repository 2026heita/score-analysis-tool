// ============================================================
// 成绩表智能解析器 - 字段分类
// ============================================================

import type { FieldMeta, FieldType, AnalysisRole } from './types';
import { parseNumericValue } from './numericParser';

// ============================================================
// 分类关键词
// ============================================================

const IDENTITY_KEYWORDS = [
  '学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
  '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族',
];

const SCORE_KEYWORDS = [
  '总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物',
  '政治', '历史', '地理', '成绩', '分数', '得分',
  '总分（不含加分）', '原始总分', '标准总分',
  '综合', '文科综合', '理科综合',
];

const RANK_KEYWORDS = [
  '名次', '排名', '位次', '年级名次', '班级名次',
];

const BONUS_KEYWORDS = [
  '加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分',
];

const PENALTY_KEYWORDS = [
  '扣分',
];

const CATEGORY_KEYWORDS = [
  '组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称',
  '选考', '首选', '再选',
];

// 总分相关关键词（用于 primaryTotal 识别）
const PRIMARY_TOTAL_KEYWORDS = [
  '总分', '总成绩', '综合成绩', '总评', '最终成绩',
];

// 合计相关关键词（用于 sectionTotal 识别）
const SECTION_TOTAL_KEYWORDS = [
  '合计', '总计', '小计', '模块合计',
];

/**
 * 判断是否为纯加分字段（如"加分"、"政策加分"）
 * 排除"不含加分"、"原始分"等场景
 */
function isPureBonusField(headerLower: string): boolean {
  // 如果包含"不含加分"、"不含优惠"，不是纯加分字段
  if (headerLower.includes('不含')) return false;
  // 否则匹配加分关键词
  return BONUS_KEYWORDS.some(kw => headerLower.includes(kw.toLowerCase()));
}

// ============================================================
// 字段分类主函数
// ============================================================

/**
 * 对每个字段进行分类
 * 
 * @param headers - 表头数组
 * @param rows - 数据行数组（已解析为 Record<string, string>[]）
 * @returns FieldMeta 数组
 */
export function classifyFields(
  headers: string[],
  rows: Record<string, string>[],
): FieldMeta[] {
  return headers.map(header => {
    const columnValues = rows.map(row => row[header] ?? '');
    const type = classifyField(header, columnValues);
    const analysisRole = classifyAnalysisRole(header, type);
    const counts = countColumnValues(columnValues);

    return {
      header,
      type,
      analysisRole,
      validCount: counts.valid,
      emptyCount: counts.empty,
      invalidCount: counts.invalid,
      textCount: counts.text,
      confidence: computeConfidence(type, counts, columnValues.length),
    };
  });
}

/**
 * 对单个字段进行分类
 */
function classifyField(header: string, columnValues: string[]): FieldType {
  const headerLower = header.toLowerCase().trim();

  // 1. rank 检查（需在 identity 之前，因为"班级排名"包含"班级"但本质是排名字段）
  for (const kw of RANK_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'rank';
    }
  }

  // 2. identity 检查
  for (const kw of IDENTITY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'identity';
    }
  }

  // 2. score 检查（需在 bonus 之前，因为"总分（不含加分）"包含"加分"但本质是成绩字段）
  for (const kw of SCORE_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'score';
    }
  }

  // 3. category 检查
  for (const kw of CATEGORY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'category';
    }
  }

  // 5. bonus 检查（在 score 之后，避免"总分（不含加分）"被误判为 bonus）
  for (const kw of BONUS_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'bonus';
    }
  }

  // 6. penalty 检查
  for (const kw of PENALTY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'penalty';
    }
  }

  // 7. 基于列内容判断
  const counts = countColumnValues(columnValues);
  const total = columnValues.length;
  if (total === 0) return 'unknown';

  const textRatio = counts.text / total;
  const validRatio = counts.valid / total;

  // 如果大部分是文本，分类为 text
  if (textRatio > 0.6) return 'text';

  // 如果大部分是有效数值，需要进一步判断字段名
  if (validRatio > 0.5) {
    // 先检查字段名是否包含身份关键词（避免班级代码、班级名称等被误判）
    for (const kw of IDENTITY_KEYWORDS) {
      if (headerLower.includes(kw.toLowerCase())) {
        return 'identity';
      }
    }
    
    // 检查字段名是否包含"成绩"或"分数"
    if (headerLower.includes('成绩') || headerLower.includes('分数')) {
      return 'score';
    }
    
    // 检查字段名是否包含"合计"、"总计"、"小计"（合计也是成绩）
    if (headerLower.includes('合计') || headerLower.includes('总计') || headerLower.includes('小计')) {
      return 'score';
    }
    
    // 检查字段名是否看起来像编码（纯数字或数字比例过高）
    const digitsOnly = headerLower.replace(/[_\-\s]/g, '');
    if (/^\d+$/.test(digitsOnly)) {
      return 'unknown'; // 纯数字字段名，像学号、编码
    }
    
    // 检查字段名中数字比例是否过高（超过 50%）
    const digitCount = (headerLower.match(/\d/g) || []).length;
    if (digitCount / headerLower.length > 0.5) {
      return 'unknown'; // 数字比例过高，可能是编码
    }
    
    // 通用规则：如果字段名包含中文字符，视为成绩字段
    // 这样可以覆盖所有课程字段，包括多级表头展开的字段
    if (/[\u4e00-\u9fa5]/.test(headerLower)) {
      return 'score';
    }
    
    // 默认不归类为 score，避免误判
    return 'unknown';
  }

  return 'unknown';
}

/**
 * 对字段进行分析价值分层（AnalysisRole）
 */
function classifyAnalysisRole(header: string, type: FieldType): AnalysisRole {
  const headerLower = header.toLowerCase().trim();

  // 1. 未命名字段 → invalid
  if (headerLower.startsWith('未命名字段') || headerLower === '' || /^[\s_\-\.]+$/.test(headerLower)) {
    return 'invalid';
  }

  // 2. 总分相关 → primaryTotal
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      // 排除纯加分字段
      if (!isPureBonusField(headerLower)) {
        return 'primaryTotal';
      }
    }
  }

  // 3. 排名相关 → rank
  if (type === 'rank') {
    return 'rank';
  }

  // 4. 合计相关 → sectionTotal
  for (const kw of SECTION_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'sectionTotal';
    }
  }

  // 5. 加分/扣分 → adjustment
  if (type === 'bonus' || type === 'penalty') {
    return 'adjustment';
  }

  // 6. 身份字段 → identity
  if (type === 'identity') {
    return 'identity';
  }

  // 7. 文本/备注字段 → textMeta
  if (type === 'text' || type === 'category' || type === 'status') {
    return 'textMeta';
  }

  // 8. 具体课程成绩 → courseScore
  if (type === 'score') {
    return 'courseScore';
  }

  // 9. 其他 → unknown
  return 'unknown';
}

/**
 * 统计列值分布
 */
function countColumnValues(values: string[]): { valid: number; empty: number; invalid: number; text: number } {
  let valid = 0, empty = 0, invalid = 0, text = 0;

  for (const val of values) {
    const parsed = parseNumericValue(val);
    switch (parsed.status) {
      case 'valid':
        valid++;
        break;
      case 'empty':
        empty++;
        break;
      case 'invalid':
        invalid++;
        break;
    }
  }

  text = empty + invalid;
  return { valid, empty, invalid, text };
}

/**
 * 计算分类置信度
 */
function computeConfidence(type: FieldType, counts: { valid: number; text: number }, total: number): number {
  if (total === 0) return 0;

  // 如果基于关键词匹配，置信度较高
  if (type === 'identity' || type === 'score' || type === 'bonus' || type === 'category' || type === 'rank') {
    return 0.9;
  }

  // 如果基于内容判断
  const ratio = Math.max(counts.valid, counts.text) / total;
  return Math.min(0.8, ratio);
}

// ============================================================
// 推荐分析字段
// ============================================================

/**
 * 推荐最佳分析字段
 * 
 * 推荐优先级（基于 analysisRole）：
 * 1. primaryTotal：总分 / 总成绩 / 综合成绩 / 总评 / 最终成绩
 * 2. rank：排名 / 名次 / 位次
 * 3. sectionTotal：合计 / 总计 / 小计 / 模块合计
 * 4. courseScore：具体课程成绩
 * 5. 其他数值字段
 * 
 * 绝对不推荐：
 * - adjustment（加分、扣分）
 * - identity（学号、姓名、班级）
 * - textMeta（签名、备注、说明）
 * - unknown（未知字段）
 * - invalid（未命名字段、非法字段名）
 */
export function recommendAnalysisField(fieldMetas: FieldMeta[]): { field: string | null; priority: number } {
  // 优先级 1: primaryTotal（总分相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'primaryTotal' && meta.validCount > 0) {
      return { field: meta.header, priority: 1 };
    }
  }

  // 优先级 2: rank（排名相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'rank' && meta.validCount > 0) {
      return { field: meta.header, priority: 2 };
    }
  }

  // 优先级 3: sectionTotal（合计相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'sectionTotal' && meta.validCount > 0) {
      return { field: meta.header, priority: 3 };
    }
  }

  // 优先级 4: courseScore（具体课程成绩）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'courseScore' && meta.validCount > 0) {
      return { field: meta.header, priority: 4 };
    }
  }

  // 优先级 5: 其他数值字段（排除不推荐的类型）
  for (const meta of fieldMetas) {
    if (meta.validCount > 0 && shouldIncludeInRecommendationByRole(meta.analysisRole)) {
      return { field: meta.header, priority: 5 };
    }
  }

  // 没有合适的字段
  return { field: null, priority: 99 };
}

/**
 * 判断字段是否应该包含在推荐中（基于 analysisRole）
 */
function shouldIncludeInRecommendationByRole(role: AnalysisRole): boolean {
  // 只推荐 primaryTotal、rank、sectionTotal、courseScore
  return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
}

/**
 * 获取所有可用于分析的字段（基于 analysisRole）
 */
export function getAnalyzableFields(fieldMetas: FieldMeta[], showAll: boolean = false): string[] {
  if (showAll) {
    // 显示全部字段时，只排除 invalid
    return fieldMetas
      .filter(meta => meta.analysisRole !== 'invalid')
      .map(meta => meta.header);
  }
  // 默认只显示推荐分析字段
  return fieldMetas
    .filter(meta => meta.validCount > 0 && shouldIncludeInRecommendationByRole(meta.analysisRole))
    .map(meta => meta.header);
}
