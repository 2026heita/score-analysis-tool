// ============================================================
// 成绩表智能解析器 - 字段分类（关键词 + 内容特征 + 置信度）
// ============================================================

import type { FieldMeta, FieldType, AnalysisRole, ContentFeature } from './types';
import { parseNumericValue } from './numericParser';
import { analyzeContentFeature } from './contentAnalyzer';

// ============================================================
// 分类关键词
// ============================================================

const IDENTITY_KEYWORDS = [
  '学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
  '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族',
  '院系', '专业', '行政班', '教学班',
];

const SCORE_KEYWORDS = [
  '总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物',
  '政治', '历史', '地理', '成绩', '分数', '得分',
  '总分（不含加分）', '原始总分', '标准总分',
  '综合', '文科综合', '理科综合',
  // 新增关键词
  '高考成绩', '综合成绩', '赋分后成绩', '赋分前成绩', '语数英总',
  '等级分', '标准分', '原始分', '转换分',
];

const RANK_KEYWORDS = [
  '名次', '排名', '位次', '年级名次', '班级名次',
  // 新增关键词
  '校排', '班排', '年排', '级排',
];

const BONUS_KEYWORDS = [
  '加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分',
  '奖励分', '奖励',
];

const PENALTY_KEYWORDS = [
  '扣分', '违纪扣分', '惩罚',
];

const CATEGORY_KEYWORDS = [
  '组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称',
  '选考', '首选', '再选',
];

// 总分相关关键词（用于 primaryTotal 识别）
const PRIMARY_TOTAL_KEYWORDS = [
  '总分', '总成绩', '综合成绩', '总评', '最终成绩',
  // 新增关键词
  '高考成绩', '赋分后成绩', '赋分前成绩', '语数英总',
  '等级分', '标准分',
];

// 合计相关关键词（用于 sectionTotal 识别）
const SECTION_TOTAL_KEYWORDS = [
  '合计', '总计', '小计', '模块合计', '模块总分', '类别总分',
];

/**
 * 判断是否为纯加分字段（如"加分"、"政策加分"）
 * 排除"不含加分"、"原始分"等场景
 */
function isPureBonusField(headerLower: string): boolean {
  if (headerLower.includes('不含')) return false;
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
    const counts = countColumnValues(columnValues);
    const contentFeature = analyzeContentFeature(columnValues);

    // 第一步：基于关键词的初步分类
    const keywordType = classifyFieldByKeyword(header);

    // 第二步：如果关键词未命中，基于内容特征分类
    let type: FieldType;
    let reason: string;
    let confidence: number;

    if (keywordType) {
      type = keywordType.type;
      reason = keywordType.reason;
      confidence = 0.9;
    } else {
      // 关键词未命中，使用内容特征
      const contentResult = classifyFieldByContent(header, columnValues, contentFeature, rows.length);
      type = contentResult.type;
      reason = contentResult.reason;
      confidence = contentResult.confidence;
    }

    // 第三步：内容特征微调置信度
    const adjusted = adjustConfidence(type, confidence, contentFeature, counts, columnValues.length, header);
    confidence = adjusted.confidence;
    if (adjusted.reasonAddition) {
      reason += '，' + adjusted.reasonAddition;
    }

    // 第四步：确定 analysisRole
    const analysisRole = classifyAnalysisRole(header, type, contentFeature);

    return {
      header,
      type,
      analysisRole,
      validCount: counts.valid,
      emptyCount: counts.empty,
      invalidCount: counts.invalid,
      textCount: counts.text,
      confidence,
      reason,
      contentFeature,
    };
  });
}

// ============================================================
// 关键词分类
// ============================================================

interface KeywordClassifyResult {
  type: FieldType;
  reason: string;
}

/**
 * 基于关键词对字段进行初步分类
 * 返回 null 表示关键词未命中
 */
function classifyFieldByKeyword(header: string): KeywordClassifyResult | null {
  const headerLower = header.toLowerCase().trim();

  // 0. 检查非法字段名（优先级最高）
  if (isInvalidHeaderName(headerLower)) {
    return { type: 'unknown', reason: `字段名"${header}"疑似数据行误识别为表头` };
  }

  // 1. rank 检查（需在 identity 之前，因为"班级排名"包含"班级"但本质是排名字段）
  for (const kw of RANK_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'rank', reason: `字段名包含"${kw}"` };
    }
  }

  // 2. identity 检查
  for (const kw of IDENTITY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'identity', reason: `字段名包含"${kw}"` };
    }
  }

  // 3. score 检查（需在 bonus 之前，因为"总分（不含加分）"包含"加分"但本质是成绩字段）
  for (const kw of SCORE_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'score', reason: `字段名包含"${kw}"` };
    }
  }

  // 4. category 检查
  for (const kw of CATEGORY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'category', reason: `字段名包含"${kw}"` };
    }
  }

  // 5. bonus 检查（在 score 之后，避免"总分（不含加分）"被误判为 bonus）
  for (const kw of BONUS_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'bonus', reason: `字段名包含"${kw}"` };
    }
  }

  // 6. penalty 检查
  for (const kw of PENALTY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return { type: 'penalty', reason: `字段名包含"${kw}"` };
    }
  }

  return null;
}

// ============================================================
// 内容特征分类
// ============================================================

interface ContentClassifyResult {
  type: FieldType;
  reason: string;
  confidence: number;
}

/**
 * 基于内容特征对字段进行分类（关键词未命中时使用）
 */
function classifyFieldByContent(
  header: string,
  columnValues: string[],
  feature: ContentFeature,
  rowCount: number,
): ContentClassifyResult {
  const headerLower = header.toLowerCase().trim();
  const total = columnValues.length;

  // 1. 检查字段名是否像非法字段名（纯数字、下划线、小数点拼接）
  if (isInvalidHeaderName(headerLower)) {
    return {
      type: 'unknown',
      reason: `字段名"${header}"主要由数字/符号组成，疑似数据行误识别`,
      confidence: 0.95,
    };
  }

  // 2. 基于内容特征判断
  if (feature.numericRatio > 0.5) {
    // 大部分是数值

    // 2a. 内容像排名（小整数、高唯一率、范围在1~rowCount*2）
    if (
      feature.integerRatio > 0.8 &&
      feature.valuePattern === 'rankLike' &&
      feature.uniqueRatio > 0.5 &&
      feature.max !== null && feature.max <= rowCount * 2
    ) {
      return {
        type: 'rank',
        reason: `字段名无明确关键词，但内容为1~${rowCount}范围内的整数，符合排名特征`,
        confidence: 0.7,
      };
    }

    // 2b. 内容像学号/考号（长数字串、高唯一率）
    if (
      feature.valuePattern === 'longNumber' &&
      feature.uniqueRatio > 0.8
    ) {
      return {
        type: 'identity',
        reason: `内容为长数字串且唯一率高(${(feature.uniqueRatio * 100).toFixed(0)}%)，疑似学号/考号`,
        confidence: 0.8,
      };
    }

    // 2c. 内容像班级标签
    if (feature.valuePattern === 'classLabel') {
      return {
        type: 'identity',
        reason: `内容包含班级相关关键词，疑似班级/分组字段`,
        confidence: 0.85,
      };
    }

    // 2d. 内容像分数（数值在合理分数范围内）
    if (
      feature.valuePattern === 'scoreLike' &&
      feature.numericRatio > 0.7
    ) {
      // 检查字段名是否包含中文字符（课程名通常有中文）
      if (/[\u4e00-\u9fa5]/.test(headerLower)) {
        return {
          type: 'score',
          reason: `字段名含中文且数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)，范围${feature.min ?? '?'}~${feature.max ?? '?'}，符合成绩特征`,
          confidence: 0.8,
        };
      }
      // 即使字段名没有中文，如果数值特征明显，也可能是成绩
      return {
        type: 'score',
        reason: `数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)，范围${feature.min ?? '?'}~${feature.max ?? '?'}，符合成绩特征`,
        confidence: 0.65,
      };
    }

    // 2e. 字段名包含中文字符，且大部分是数值 → 可能是课程成绩
    if (/[\u4e00-\u9fa5]/.test(headerLower)) {
      return {
        type: 'score',
        reason: `字段名含中文，数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)`,
        confidence: 0.75,
      };
    }

    // 2f. 字段名数字比例过高 → 可能是编码
    const digitCount = (headerLower.match(/\d/g) || []).length;
    if (headerLower.length > 0 && digitCount / headerLower.length > 0.5) {
      return {
        type: 'unknown',
        reason: `字段名数字比例过高，疑似编码字段`,
        confidence: 0.7,
      };
    }

    return {
      type: 'unknown',
      reason: `数值比例高但无法确定具体类型`,
      confidence: 0.5,
    };
  }

  // 3. 大部分是文本
  const textCount = total - feature.numericRatio * total;
  if (total > 0 && textCount / total > 0.6) {
    // 检查是否为中文姓名
    if (feature.valuePattern === 'chineseName') {
      return {
        type: 'identity',
        reason: `内容多为2-4个中文字符，疑似姓名字段`,
        confidence: 0.8,
      };
    }

    // 检查是否为班级标签
    if (feature.valuePattern === 'classLabel') {
      return {
        type: 'identity',
        reason: `内容包含班级相关关键词`,
        confidence: 0.85,
      };
    }

    return {
      type: 'text',
      reason: `大部分内容为文本(${((textCount / total) * 100).toFixed(0)}%)`,
      confidence: 0.7,
    };
  }

  return {
    type: 'unknown',
    reason: `无法通过关键词或内容特征确定类型`,
    confidence: 0.3,
  };
}

// ============================================================
// 置信度微调
// ============================================================

interface ConfidenceAdjustResult {
  confidence: number;
  reasonAddition?: string;
}

/**
 * 基于内容特征微调置信度
 */
function adjustConfidence(
  type: FieldType,
  baseConfidence: number,
  feature: ContentFeature,
  _counts: { valid: number; empty: number; invalid: number; text: number },
  total: number,
  header: string,
): ConfidenceAdjustResult {
  let confidence = baseConfidence;
  const reasons: string[] = [];

  if (total === 0) return { confidence: 0 };

  // 关键词命中的字段，内容特征可以进一步确认
  if (type === 'score') {
    // 如果数值比例高，置信度提升
    if (feature.numericRatio > 0.8) {
      confidence = Math.min(0.95, confidence + 0.05);
      reasons.push(`数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)确认`);
    } else if (feature.numericRatio < 0.5) {
      confidence = Math.max(0.5, confidence - 0.2);
      reasons.push(`数值比例低(${(feature.numericRatio * 100).toFixed(0)}%)，置信度降低`);
    }
    
    // courseScore 增强：数值比例高且范围在常见分数区间（0-150）
    if (feature.numericRatio > 0.8 && feature.min !== null && feature.max !== null) {
      if (feature.min >= 0 && feature.max <= 150 && feature.max >= 60) {
        confidence = Math.min(0.95, confidence + 0.05);
        reasons.push(`分数范围合理(${feature.min.toFixed(0)}~${feature.max.toFixed(0)})`);
      }
    }
  }

  if (type === 'rank') {
    // 排名应该是整数且范围合理
    if (feature.integerRatio > 0.9 && feature.valuePattern === 'rankLike') {
      confidence = Math.min(0.95, confidence + 0.05);
      reasons.push(`整数且范围符合排名特征`);
    } else if (feature.integerRatio < 0.7) {
      confidence = Math.max(0.6, confidence - 0.15);
      reasons.push(`非整数比例较高，置信度降低`);
    }
    
    // rank 增强：字段名含排名关键词且内容为小整数
    const headerLower = header.toLowerCase();
    const rankKeywords = ['排名', '名次', '位次', '班排', '校排', '年排', '级排'];
    const hasRankKeyword = rankKeywords.some(kw => headerLower.includes(kw));
    if (hasRankKeyword && feature.integerRatio > 0.9 && feature.max !== null && feature.max <= total * 2) {
      confidence = Math.min(0.95, confidence + 0.05);
      reasons.push(`字段名含排名关键词且内容为小整数`);
    }
  }

  if (type === 'identity') {
    // 身份字段如果唯一率高，确认
    if (feature.uniqueRatio > 0.9) {
      confidence = Math.min(0.95, confidence + 0.05);
      reasons.push(`唯一率高(${(feature.uniqueRatio * 100).toFixed(0)}%)确认`);
    }
    
    // identity 增强：长数字串、高唯一率时提高置信度，防止误判为 courseScore
    if (feature.valuePattern === 'longNumber' && feature.uniqueRatio > 0.8) {
      confidence = Math.min(0.95, confidence + 0.1);
      reasons.push(`长数字串且唯一率高，确认为身份标识`);
    }
  }

  // 内容特征分类的字段，如果数值比例低，降低置信度
  if (baseConfidence < 0.85 && feature.numericRatio < 0.5 && (type === 'score' || type === 'rank')) {
    confidence = Math.max(0.4, confidence - 0.15);
    reasons.push(`数值比例不足`);
  }
  
  // bonus/penalty 增强：关键词命中时保持高置信度
  if ((type === 'bonus' || type === 'penalty') && baseConfidence >= 0.9) {
    confidence = Math.min(0.95, confidence + 0.02);
    reasons.push(`加扣分字段确认`);
  }
  
  // unknown/invalid 增强：非法字段名时提高置信度
  if (type === 'unknown' && baseConfidence >= 0.9) {
    const headerLower = header.toLowerCase();
    if (isInvalidHeaderName(headerLower)) {
      confidence = Math.min(0.98, confidence + 0.03);
      reasons.push(`非法字段名确认`);
    }
  }

  return {
    confidence: Math.round(confidence * 100) / 100,
    reasonAddition: reasons.length > 0 ? reasons.join('，') : undefined,
  };
}

// ============================================================
// 非法字段名检测
// ============================================================

/**
 * 判断字段名是否像非法字段名（数据行误识别为表头）
 */
function isInvalidHeaderName(headerLower: string): boolean {
  // 空或全空白
  if (!headerLower || /^[\s]+$/.test(headerLower)) return true;

  // 未命名字段
  if (headerLower.startsWith('未命名字段')) return true;

  // 全符号
  if (/^[\s_\-\.]+$/.test(headerLower)) return true;

  // 类似 93_80、0_0、101.60_91.60、202409602096_202409602084 这种数据行拼接
  // 特征：包含下划线且两侧都是数字，或整体是数字+小数点+下划线
  if (/^\d+[\._]\d+/.test(headerLower) || /^\d+_\d+/.test(headerLower)) return true;

  // 纯数字字段名（长度>=4）
  const digitsOnly = headerLower.replace(/[_\-\s\.]/g, '');
  if (/^\d{4,}$/.test(digitsOnly)) return true;

  // 字段名中数字+符号占比超过80%且长度>=6
  if (headerLower.length >= 6) {
    const nonDigitNonAlpha = headerLower.replace(/[\d_\-\.\s]/g, '');
    if (nonDigitNonAlpha.length / headerLower.length < 0.2) return true;
  }

  return false;
}

// ============================================================
// 基础分类函数
// ============================================================

/**
 * 对字段进行分析价值分层（AnalysisRole）
 */
function classifyAnalysisRole(header: string, type: FieldType, _feature?: ContentFeature): AnalysisRole {
  const headerLower = header.toLowerCase().trim();

  // 1. 未命名字段 → invalid
  if (isInvalidHeaderName(headerLower)) {
    return 'invalid';
  }

  // 2. 总分相关 → primaryTotal
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
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
 * 
 * 置信度 < 0.55 的字段不进入默认推荐
 */
export function recommendAnalysisField(fieldMetas: FieldMeta[]): { field: string | null; priority: number } {
  // 优先级 1: primaryTotal（总分相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'primaryTotal' && meta.validCount > 0 && meta.confidence >= 0.55) {
      return { field: meta.header, priority: 1 };
    }
  }

  // 优先级 2: rank（排名相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'rank' && meta.validCount > 0 && meta.confidence >= 0.55) {
      return { field: meta.header, priority: 2 };
    }
  }

  // 优先级 3: sectionTotal（合计相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'sectionTotal' && meta.validCount > 0 && meta.confidence >= 0.55) {
      return { field: meta.header, priority: 3 };
    }
  }

  // 优先级 4: courseScore（具体课程成绩）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'courseScore' && meta.validCount > 0 && meta.confidence >= 0.55) {
      return { field: meta.header, priority: 4 };
    }
  }

  // 优先级 5: 其他数值字段（排除不推荐的类型）
  for (const meta of fieldMetas) {
    if (meta.validCount > 0 && meta.confidence >= 0.55 && shouldIncludeInRecommendationByRole(meta.analysisRole)) {
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
  return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
}

/**
 * 获取所有可用于分析的字段（基于 analysisRole）
 * 默认推荐只包含置信度 >= 0.55 的字段
 */
export function getAnalyzableFields(fieldMetas: FieldMeta[], showAll: boolean = false): string[] {
  if (showAll) {
    return fieldMetas
      .filter(meta => meta.analysisRole !== 'invalid')
      .map(meta => meta.header);
  }
  // 默认只显示推荐分析字段且置信度 >= 0.55
  return fieldMetas
    .filter(meta => meta.validCount > 0 && meta.confidence >= 0.55 && shouldIncludeInRecommendationByRole(meta.analysisRole))
    .map(meta => meta.header);
}
