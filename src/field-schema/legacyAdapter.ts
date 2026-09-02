/**
 * Stage 1A-1: 旧模型兼容适配层 【legacy-only 单向兼容边界】
 * 
 * 职责：仅允许"旧教育 FieldType / AnalysisRole" → "新通用 FieldSchema"这一条单向映射。
 * 用于把历史 localStorage / 旧 tableParser 产出的教育字段元数据翻译成新通用 schema，
 * 属于历史数据兼容，不参与通用主链路（App / components / engine）的字段角色决策。
 * 
 * 设计原则：
 * 1. 集中管理所有映射逻辑，禁止在多个组件中重复写映射判断
 * 2. 不确定或存在多种解释的旧类型使用 unknown / unspecified
 * 3. 映射结果标注来源为 'legacy'
 * 4. 禁止"新 → 旧"反向映射：lower_is_better 不一定是 rank，metric 不一定是 courseScore
 * @deprecated 仅用于教育 legacy 数据兼容，通用主链路不得依赖
 */

import type {
  FieldSchema,
  FieldDataType,
  FieldAnalysisRole,
  FieldMetricDirection,
  FieldInference,
} from './types';
import type { FieldType, AnalysisRole, FieldMeta } from '../utils/tableParser/types';
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

// ============================================================
// 旧 FieldType 到新 FieldDataType 的映射
// ============================================================

/**
 * 将旧 FieldType 映射到新 FieldDataType
 */
export function mapLegacyFieldTypeToDataType(legacyType: FieldType): FieldDataType {
  switch (legacyType) {
    case 'score':
    case 'rank':
    case 'bonus':
    case 'penalty':
      return 'number';
    
    case 'category':
    case 'status':
      return 'category';
    
    case 'identity':
      // identity 可能是 identifier 或 category，需要根据上下文判断
      // 这里返回 unknown，由上层根据具体内容决定
      return 'unknown';
    
    case 'text':
      return 'text';
    
    case 'unknown':
      return 'unknown';
    
    default:
      return 'unknown';
  }
}

/**
 * 将旧 AnalysisRole 映射到新 FieldAnalysisRole
 */
export function mapLegacyAnalysisRoleToRole(legacyRole: AnalysisRole): FieldAnalysisRole {
  switch (legacyRole) {
    case 'primaryTotal':
    case 'rank':
    case 'sectionTotal':
    case 'courseScore':
    case 'adjustment':
      return 'metric';
    
    case 'identity':
      // identity 可能是 identifier 或 dimension，需要根据上下文判断
      return 'unspecified';
    
    case 'textMeta':
      return 'description';
    
    case 'unknown':
      return 'unspecified';
    
    case 'invalid':
      return 'ignored';
    
    default:
      return 'unspecified';
  }
}

/**
 * 将旧 AnalysisRole 映射到新 FieldMetricDirection
 */
export function mapLegacyAnalysisRoleToDirection(legacyRole: AnalysisRole): FieldMetricDirection {
  switch (legacyRole) {
    case 'rank':
      return 'lower_is_better';
    
    case 'primaryTotal':
    case 'sectionTotal':
    case 'courseScore':
      return 'higher_is_better';
    
    case 'adjustment':
      // adjustment 包含加分和扣分，需要根据字段名进一步判断
      // 这里返回 unspecified，由上层根据具体内容决定
      return 'unspecified';
    
    default:
      return 'unspecified';
  }
}

// ============================================================
// 完整的旧 FieldMeta 到新 FieldSchema 的映射
// ============================================================

/**
 * 将旧 FieldMeta 映射到新 FieldSchema
 * 
 * @param fieldMeta 旧的字段元数据
 * @param columnValues 该列的值（用于统计信息，可选）
 * @returns 新的字段模式
 */
export function mapLegacyFieldMetaToSchema(
  fieldMeta: FieldMeta,
  columnValues?: string[]
): FieldSchema {
  const { header, type, analysisRole, confidence, reason } = fieldMeta;
  
  // 映射数据类型
  let dataType = mapLegacyFieldTypeToDataType(type);
  
  // 特殊处理 identity 类型
  if (type === 'identity') {
    // 根据 analysisRole 和关键词判断是 identifier 还是 dimension
    const isDimension = isIdentityDimension(header);
    if (isDimension) {
      dataType = 'category';
    } else {
      dataType = 'identifier';
    }
  }
  
  // 映射分析角色
  let role = mapLegacyAnalysisRoleToRole(analysisRole);
  
  // 特殊处理 identity 角色
  if (analysisRole === 'identity') {
    const isDimension = isIdentityDimension(header);
    role = isDimension ? 'dimension' : 'identifier';
  }
  
  // 映射指标方向
  const direction = mapLegacyAnalysisRoleToDirection(analysisRole);
  
  // 构建推断信息
  const inference: FieldInference = {
    source: 'legacy',
    confidence: confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
    reasons: [`旧系统映射：${reason || `type=${type}, role=${analysisRole}`}`],
  };
  
  // 构建统计信息
  const statistics = columnValues ? computeStatistics(columnValues) : undefined;
  
  return {
    fieldId: header,
    sourceName: header,
    dataType,
    analysisRole: role,
    metricDirection: direction,
    inference,
    statistics,
  };
}

/**
 * 判断 identity 字段是否为维度（分组字段）
 */
function isIdentityDimension(header: string): boolean {
  const headerLower = header.toLowerCase();
  const dimensionKeywords = [
    '班级', '学校', '院系', '专业', '行政班', '教学班',
    '性别', '民族', '科类', '组合', '选科',
  ];
  return dimensionKeywords.some(kw => headerLower.includes(kw.toLowerCase()));
}

/**
 * 计算字段统计信息
 */
function computeStatistics(columnValues: string[]): {
  missingCount: number;
  uniqueCount: number;
  sampleValues: unknown[];
} {
  const uniqueValues = new Set<string>();
  let missingCount = 0;
  const sampleValues: unknown[] = [];
  
  for (const val of columnValues) {
    const trimmed = val.trim();
    
    if (!trimmed || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
      missingCount++;
      continue;
    }
    
    uniqueValues.add(val);
    
    if (sampleValues.length < 3) {
      const num = parseNumericValueLegacy(val);
      if (num !== null) {
        sampleValues.push(num);
      } else {
        sampleValues.push(val);
      }
    }
  }
  
  return {
    missingCount,
    uniqueCount: uniqueValues.size,
    sampleValues,
  };
}


