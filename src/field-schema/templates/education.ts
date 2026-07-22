/**
 * Stage 1A-1: 教育模板规则
 * 
 * 职责：提供教育场景的字段推断规则
 * 设计原则：
 * 1. 教育模板是可选的，不污染通用模式
 * 2. 模板推荐作为建议，用户可以覆盖
 * 3. 所有规则必须明确标注来源为 'template'
 */

import type { FieldSchema } from '../types';

// ============================================================
// 教育模板关键词
// ============================================================

/** 成绩字段关键词 */
const SCORE_KEYWORDS = [
  '总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物',
  '政治', '历史', '地理', '成绩', '分数', '得分',
  '总分（不含加分）', '原始总分', '标准总分',
  '综合', '文科综合', '理科综合',
  '高考成绩', '综合成绩', '赋分后成绩', '赋分前成绩', '语数英总',
  '等级分', '标准分', '原始分', '转换分',
];

/** 排名字段关键词 */
const RANK_KEYWORDS = [
  '名次', '排名', '位次', '年级名次', '班级名次',
  '校排', '班排', '年排', '级排',
];

/** 加分字段关键词 */
const BONUS_KEYWORDS = [
  '加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分',
  '奖励分', '奖励',
];

/** 扣分字段关键词 */
const PENALTY_KEYWORDS = [
  '扣分', '违纪扣分', '惩罚',
];

/** 身份字段关键词 */
const IDENTITY_KEYWORDS = [
  '学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
  '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族',
  '院系', '专业', '行政班', '教学班',
];

/** 分类字段关键词 */
const CATEGORY_KEYWORDS = [
  '组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称',
  '选考', '首选', '再选',
];

// ============================================================
// 教育模板推断
// ============================================================

/**
 * 应用教育模板规则
 * 
 * @param header 字段名
 * @param baseSchema 基础推断结果（来自通用推断）
 * @returns 应用模板后的字段模式，如果不匹配则返回 null
 */
export function applyEducationTemplate(
  header: string,
  baseSchema: FieldSchema
): FieldSchema | null {
  const headerLower = header.toLowerCase().trim();
  
  // 1. 排名字段（优先级最高，因为"班级排名"包含"班级"但本质是排名）
  for (const kw of RANK_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        ...baseSchema,
        dataType: 'number',
        analysisRole: 'metric',
        metricDirection: 'lower_is_better',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为排名指标`],
        },
      };
    }
  }
  
  // 2. 成绩字段
  for (const kw of SCORE_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        ...baseSchema,
        dataType: 'number',
        analysisRole: 'metric',
        metricDirection: 'higher_is_better',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为成绩指标`],
        },
      };
    }
  }
  
  // 3. 加分字段
  for (const kw of BONUS_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        ...baseSchema,
        dataType: 'number',
        analysisRole: 'metric',
        metricDirection: 'higher_is_better',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为加分指标`],
        },
      };
    }
  }
  
  // 4. 扣分字段
  for (const kw of PENALTY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        ...baseSchema,
        dataType: 'number',
        analysisRole: 'metric',
        metricDirection: 'lower_is_better',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为扣分指标`],
        },
      };
    }
  }
  
  // 5. 身份字段（学号、考号等）
  for (const kw of IDENTITY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      // 判断是标识符还是维度
      const isDimension = kw === '班级' || kw === '学校' || kw === '学校名称' ||
                         kw === '院系' || kw === '专业' || kw === '行政班' || 
                         kw === '教学班' || kw === '性别' || kw === '民族';
      
      return {
        ...baseSchema,
        dataType: isDimension ? 'category' : 'identifier',
        analysisRole: isDimension ? 'dimension' : 'identifier',
        metricDirection: 'neutral',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为${isDimension ? '分组维度' : '身份标识'}`],
        },
      };
    }
  }
  
  // 6. 分类字段
  for (const kw of CATEGORY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        ...baseSchema,
        dataType: 'category',
        analysisRole: 'dimension',
        metricDirection: 'neutral',
        inference: {
          source: 'template',
          confidence: 'high',
          reasons: [`教育模板：字段名包含"${kw}"，推荐为分组维度`],
        },
      };
    }
  }
  
  // 不匹配任何教育规则
  return null;
}

/**
 * 检查字段是否匹配教育模板
 */
export function isEducationTemplateMatch(header: string): boolean {
  const headerLower = header.toLowerCase().trim();
  
  const allKeywords = [
    ...SCORE_KEYWORDS,
    ...RANK_KEYWORDS,
    ...BONUS_KEYWORDS,
    ...PENALTY_KEYWORDS,
    ...IDENTITY_KEYWORDS,
    ...CATEGORY_KEYWORDS,
  ];
  
  return allKeywords.some(kw => headerLower.includes(kw.toLowerCase()));
}

/**
 * 获取教育模板的关键词列表（用于调试和文档）
 */
export function getEducationTemplateKeywords(): {
  score: string[];
  rank: string[];
  bonus: string[];
  penalty: string[];
  identity: string[];
  category: string[];
} {
  return {
    score: [...SCORE_KEYWORDS],
    rank: [...RANK_KEYWORDS],
    bonus: [...BONUS_KEYWORDS],
    penalty: [...PENALTY_KEYWORDS],
    identity: [...IDENTITY_KEYWORDS],
    category: [...CATEGORY_KEYWORDS],
  };
}
