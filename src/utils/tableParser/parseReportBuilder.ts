// ============================================================
// 解析结果报告构建器
// ============================================================

import type {
  FieldMeta,
  ParseReport,
  ParseReportSummary,
  ParseReportField,
  ContentFeatureSummary,
} from './types';

/**
 * 构建解析结果报告
 * 
 * @param headers 表头数组
 * @param rows 数据行数组
 * @param fieldMetas 字段元数据数组
 * @param recommendedFields 推荐字段数组
 * @returns ParseReport 解析报告
 */
export function buildParseReport(
  _headers: string[],
  rows: Record<string, string>[],
  fieldMetas: FieldMeta[],
  recommendedFields: string[],
): ParseReport {
  const warnings: string[] = [];
  
  // 构建摘要统计
  const summary = buildSummary(fieldMetas, rows.length, recommendedFields);
  
  // 构建字段明细
  const fields = fieldMetas.map(meta => buildFieldDetail(meta, recommendedFields));
  
  // 生成警告信息
  if (summary.lowConfidenceCount > 0) {
    warnings.push(`发现 ${summary.lowConfidenceCount} 个低置信度字段（< 0.7），可能需要人工复核`);
  }
  
  if (summary.invalidCount > 0) {
    warnings.push(`发现 ${summary.invalidCount} 个非法/未命名字段，已自动排除`);
  }
  
  if (summary.recommendedFieldCount === 0) {
    warnings.push('未找到推荐分析字段，请检查表头命名或手动选择字段');
  }
  
  if (summary.primaryTotalCount === 0 && summary.courseScoreCount > 0) {
    // legacy education 特异性提示：单科成绩存在但未识别出总成绩字段。
    // 仅用于旧版教育字段元数据兼容；通用模式不会进入此分支。
    warnings.push('未识别到汇总/总成绩类字段，但存在单科成绩类字段（教育数据兼容）');
  }
  
  return { summary, fields, warnings };
}

/**
 * 构建摘要统计
 */
function buildSummary(
  fieldMetas: FieldMeta[],
  dataRowCount: number,
  recommendedFields: string[],
): ParseReportSummary {
  let identityCount = 0;
  let primaryTotalCount = 0;
  let rankCount = 0;
  let sectionTotalCount = 0;
  let courseScoreCount = 0;
  let adjustmentCount = 0;
  let textMetaCount = 0;
  let unknownCount = 0;
  let invalidCount = 0;
  let lowConfidenceCount = 0;
  
  for (const meta of fieldMetas) {
    // 按 analysisRole 统计
    switch (meta.analysisRole) {
      case 'identity':
        identityCount++;
        break;
      case 'primaryTotal':
        primaryTotalCount++;
        break;
      case 'rank':
        rankCount++;
        break;
      case 'sectionTotal':
        sectionTotalCount++;
        break;
      case 'courseScore':
        courseScoreCount++;
        break;
      case 'adjustment':
        adjustmentCount++;
        break;
      case 'textMeta':
        textMetaCount++;
        break;
      case 'unknown':
        unknownCount++;
        break;
      case 'invalid':
        invalidCount++;
        break;
    }
    
    // 低置信度统计
    if (meta.confidence < 0.7) {
      lowConfidenceCount++;
    }
  }
  
  return {
    dataRowCount,
    fieldCount: fieldMetas.length,
    recommendedFieldCount: recommendedFields.length,
    identityCount,
    primaryTotalCount,
    rankCount,
    sectionTotalCount,
    courseScoreCount,
    adjustmentCount,
    textMetaCount,
    unknownCount,
    invalidCount,
    lowConfidenceCount,
  };
}

/**
 * 构建字段明细
 */
function buildFieldDetail(
  meta: FieldMeta,
  recommendedFields: string[],
): ParseReportField {
  const isRecommended = recommendedFields.includes(meta.header);
  const { hiddenByDefault, hiddenReason } = determineHiddenStatus(meta, isRecommended);
  
  return {
    name: meta.header,
    type: meta.type,
    analysisRole: meta.analysisRole,
    confidence: meta.confidence,
    reason: meta.reason,
    recommended: isRecommended,
    hiddenByDefault,
    hiddenReason,
    contentFeature: meta.contentFeature ? buildContentFeatureSummary(meta.contentFeature) : undefined,
  };
}

/**
 * 确定字段隐藏状态和原因
 */
function determineHiddenStatus(
  meta: FieldMeta,
  isRecommended: boolean,
): { hiddenByDefault: boolean; hiddenReason: string } {
  if (isRecommended) {
    return { hiddenByDefault: false, hiddenReason: '' };
  }
  
  // 根据 analysisRole 确定隐藏原因（对旧版教育角色采用通用展示文案）
  switch (meta.analysisRole) {
    case 'identity':
      return { hiddenByDefault: true, hiddenReason: '标识/身份字段，不参与数值分析' };
    case 'adjustment':
      return { hiddenByDefault: true, hiddenReason: '调整性字段（加分/扣分），默认不参与数值分析' };
    case 'textMeta':
      return { hiddenByDefault: true, hiddenReason: '文本/元数据字段，不适合数值统计' };
    case 'invalid':
      return { hiddenByDefault: true, hiddenReason: '非法或未命名字段，已自动排除' };
    case 'unknown':
      return { hiddenByDefault: true, hiddenReason: '字段类型未知，需要人工确认' };
    default:
      // 其他情况（如 confidence 过低）
      if (meta.confidence < 0.55) {
        return { hiddenByDefault: true, hiddenReason: `分类置信度过低（${(meta.confidence * 100).toFixed(0)}%）` };
      }
      return { hiddenByDefault: true, hiddenReason: '非推荐分析字段' };
  }
}

/**
 * 构建内容特征摘要
 */
function buildContentFeatureSummary(feature: {
  numericRatio: number;
  uniqueRatio: number;
  min: number | null;
  max: number | null;
  valuePattern: string;
}): ContentFeatureSummary {
  return {
    numericRatio: feature.numericRatio,
    uniqueRatio: feature.uniqueRatio,
    min: feature.min,
    max: feature.max,
    valuePattern: feature.valuePattern,
  };
}
