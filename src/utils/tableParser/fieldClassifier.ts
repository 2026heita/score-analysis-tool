// ============================================================
// 成绩表智能解析器 - 字段分类
// ============================================================

import type { FieldMeta, FieldType } from './types';
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

const CATEGORY_KEYWORDS = [
  '组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称',
  '选考', '首选', '再选',
];

// 不要推荐为分析字段的关键词
const EXCLUDED_FROM_RECOMMENDATION = [
  '学校代码', '学校名称', '姓名', '考号', '座号', '学号', '考生号', '准考证',
  '班级', '组合简称', '科类', '类别', '性别', '民族', '身份证号',
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
    const counts = countColumnValues(columnValues);

    return {
      header,
      type,
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

  // 1. identity 检查
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

  // 3. rank 检查
  for (const kw of RANK_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'rank';
    }
  }

  // 4. category 检查
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

  // 6. 基于列内容判断
  const counts = countColumnValues(columnValues);
  const total = columnValues.length;
  if (total === 0) return 'unknown';

  const textRatio = counts.text / total;
  const validRatio = counts.valid / total;

  // 如果大部分是文本，分类为 text
  if (textRatio > 0.6) return 'text';

  // 如果大部分是有效数值，但字段名不匹配 → unknown（让后续逻辑处理）
  if (validRatio > 0.5) return 'unknown';

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
 * 推荐优先级：
 * 1. 总分 / 总成绩 / 总分（不含加分）
 * 2. 语文、数学、英语/外语
 * 3. 物理、历史、化学、生物、政治、地理
 * 4. 名次/排名/位次
 * 5. 其他数值字段
 * 
 * 不推荐：学校代码、班级、加分字段、字典表字段、姓名、学校名称、组合简称
 */
export function recommendAnalysisField(fieldMetas: FieldMeta[]): { field: string | null; priority: number } {
  // 优先级 1: 总分（排除纯加分字段，但保留"不含加分"类字段）
  for (const meta of fieldMetas) {
    const lower = meta.header.toLowerCase();
    if ((lower.includes('总分') || lower.includes('总成绩')) && meta.validCount > 0) {
      // "不含加分"、"不含优惠"等仍然推荐，只有纯加分字段排除
      if (isPureBonusField(lower)) continue;
      return { field: meta.header, priority: 1 };
    }
  }

  // 优先级 2: 主科
  const mainSubjects = ['语文', '数学', '英语', '外语'];
  for (const subject of mainSubjects) {
    for (const meta of fieldMetas) {
      if (meta.header.includes(subject) && meta.validCount > 0) {
        return { field: meta.header, priority: 2 };
      }
    }
  }

  // 优先级 3: 其他学科
  const otherSubjects = ['物理', '历史', '化学', '生物', '政治', '地理'];
  for (const subject of otherSubjects) {
    for (const meta of fieldMetas) {
      if (meta.header.includes(subject) && meta.validCount > 0) {
        return { field: meta.header, priority: 3 };
      }
    }
  }

  // 优先级 4: 排名
  for (const meta of fieldMetas) {
    if (meta.type === 'rank' && meta.validCount > 0) {
      return { field: meta.header, priority: 4 };
    }
  }

  // 优先级 5: 其他数值字段（排除不推荐的）
  for (const meta of fieldMetas) {
    if (meta.validCount > 0 && shouldIncludeInRecommendation(meta.header)) {
      return { field: meta.header, priority: 5 };
    }
  }

  // 没有合适的字段
  return { field: null, priority: 99 };
}

/**
 * 判断字段是否应该包含在推荐中
 */
function shouldIncludeInRecommendation(header: string): boolean {
  const lower = header.toLowerCase();
  for (const kw of EXCLUDED_FROM_RECOMMENDATION) {
    if (lower.includes(kw.toLowerCase())) {
      return false;
    }
  }
  // 排除纯加分字段
  if (isPureBonusField(lower)) return false;
  return true;
}

/**
 * 获取所有可用于分析的字段（数值字段）
 */
export function getAnalyzableFields(fieldMetas: FieldMeta[], showAll: boolean = false): string[] {
  return fieldMetas
    .filter(meta => meta.validCount > 0 && (showAll || shouldIncludeInRecommendation(meta.header)))
    .map(meta => meta.header);
}
