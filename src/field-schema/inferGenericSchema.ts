/**
 * Stage 1A-1: 通用字段模式推断
 * 
 * 职责：基于数据结构和字段名推断字段模式
 * 设计原则：
 * 1. 仅使用通用规则，不包含教育特定关键词
 * 2. 推断结果作为建议，不是最终结论
 * 3. 可以追踪推断来源和原因
 */

import type {
  FieldSchema,
  FieldDataType,
  FieldAnalysisRole,
  FieldMetricDirection,
  FieldInference,
  FieldStatistics,
} from './types';
import type { ContentFeature } from '../utils/tableParser/types';
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

// ============================================================
// 通用字段名规则（不包含教育特定关键词）
// ============================================================

/** 标识符字段关键词 */
const IDENTIFIER_KEYWORDS = [
  'id', '编号', '代码', '编码', '账号', '学号', '工号', '订单号',
  '手机号', '电话', '身份证', '护照', '卡号',
];

/** 时间字段关键词 */
const DATETIME_KEYWORDS = [
  '时间', '日期', 'date', 'time', 'datetime', 'timestamp',
  '创建时间', '更新时间', '开始时间', '结束时间',
];

/** 类别字段关键词 */
const CATEGORY_KEYWORDS = [
  '类型', '类别', '分类', '状态', '级别', '等级', '部门', '地区',
  '省份', '城市', '性别', '民族', '专业', '班级',
];

/** 描述字段关键词 */
const DESCRIPTION_KEYWORDS = [
  '说明', '备注', '描述', '摘要', '内容', '详情', '地址',
];

/** 布尔字段关键词 */
const BOOLEAN_KEYWORDS = [
  '是否', '已', '未', '有效', '启用', '禁用',
];

// ============================================================
// 推断主函数
// ============================================================

/**
 * 推断单个字段的模式
 * 
 * @param header 字段名
 * @param columnValues 该列的所有值
 * @param contentFeature 内容特征（可选）
 * @returns 推断的字段模式
 */
export function inferGenericFieldSchema(
  header: string,
  columnValues: string[],
  contentFeature?: ContentFeature
): FieldSchema {
  const headerLower = header.toLowerCase().trim();
  
  // 计算统计信息
  const statistics = computeFieldStatistics(columnValues);
  
  // 如果没有提供 contentFeature，则基于 columnValues 计算
  const feature = contentFeature || computeContentFeature(columnValues);
  
  // 第一步：基于字段名规则推断
  const nameResult = inferByFieldName(headerLower);
  
  // 第二步：如果字段名未命中，基于内容特征推断
  let dataType: FieldDataType;
  let analysisRole: FieldAnalysisRole;
  let metricDirection: FieldMetricDirection;
  let inference: FieldInference;
  
  if (nameResult) {
    dataType = nameResult.dataType;
    analysisRole = nameResult.analysisRole;
    metricDirection = nameResult.metricDirection;
    inference = {
      source: 'name_rule',
      confidence: 'high',
      reasons: [nameResult.reason],
    };
  } else {
    // 基于内容特征推断
    const structureResult = inferByContentFeature(feature);
    dataType = structureResult.dataType;
    analysisRole = structureResult.analysisRole;
    metricDirection = structureResult.metricDirection;
    inference = {
      source: 'structure',
      confidence: structureResult.confidence,
      reasons: structureResult.reasons,
    };
  }
  
  return {
    fieldId: header,
    sourceName: header,
    dataType,
    analysisRole,
    metricDirection,
    inference,
    statistics,
  };
}

// ============================================================
// 基于字段名推断
// ============================================================

interface NameInferResult {
  dataType: FieldDataType;
  analysisRole: FieldAnalysisRole;
  metricDirection: FieldMetricDirection;
  reason: string;
}

function inferByFieldName(headerLower: string): NameInferResult | null {
  // 1. 标识符字段
  for (const kw of IDENTIFIER_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        dataType: 'identifier',
        analysisRole: 'identifier',
        metricDirection: 'neutral',
        reason: `字段名包含"${kw}"`,
      };
    }
  }
  
  // 2. 时间字段
  for (const kw of DATETIME_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        dataType: 'datetime',
        analysisRole: 'time',
        metricDirection: 'neutral',
        reason: `字段名包含"${kw}"`,
      };
    }
  }
  
  // 3. 类别字段
  for (const kw of CATEGORY_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        dataType: 'category',
        analysisRole: 'dimension',
        metricDirection: 'neutral',
        reason: `字段名包含"${kw}"`,
      };
    }
  }
  
  // 4. 描述字段
  for (const kw of DESCRIPTION_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        dataType: 'text',
        analysisRole: 'description',
        metricDirection: 'neutral',
        reason: `字段名包含"${kw}"`,
      };
    }
  }
  
  // 5. 布尔字段
  for (const kw of BOOLEAN_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return {
        dataType: 'boolean',
        analysisRole: 'dimension',
        metricDirection: 'neutral',
        reason: `字段名包含"${kw}"`,
      };
    }
  }
  
  return null;
}

// ============================================================
// 基于内容特征推断
// ============================================================

interface StructureInferResult {
  dataType: FieldDataType;
  analysisRole: FieldAnalysisRole;
  metricDirection: FieldMetricDirection;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  reasons: string[];
}

function inferByContentFeature(
  feature: ContentFeature
): StructureInferResult {
  const reasons: string[] = [];
  
  // 1. 高数值比例 → 数值类型
  if (feature.numericRatio > 0.8) {
    reasons.push(`数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)`);
    
    // 1a. 高唯一率 + 长数字串 → 标识符
    if (feature.uniqueRatio > 0.9 && feature.valuePattern === 'longNumber') {
      reasons.push('唯一率高且为长数字串');
      return {
        dataType: 'identifier',
        analysisRole: 'identifier',
        metricDirection: 'neutral',
        confidence: 'high',
        reasons,
      };
    }
    
    // 1b. 小整数 + 高唯一率 → 可能是排名（但不确定方向）
    if (
      feature.integerRatio > 0.9 &&
      feature.valuePattern === 'rankLike' &&
      feature.uniqueRatio > 0.5
    ) {
      reasons.push('内容为小整数，符合排名特征');
      // 通用模式不强制方向，设为 unspecified
      return {
        dataType: 'number',
        analysisRole: 'metric',
        metricDirection: 'unspecified',
        confidence: 'medium',
        reasons,
      };
    }
    
    // 1c. 普通数值 → 数值类型
    reasons.push('大部分为数值');
    return {
      dataType: 'number',
      analysisRole: 'metric',
      metricDirection: 'unspecified',
      confidence: 'high',
      reasons,
    };
  }
  
  // 2. 中等数值比例（0.5 - 0.8）
  if (feature.numericRatio > 0.5) {
    reasons.push(`数值比例中等(${(feature.numericRatio * 100).toFixed(0)}%)`);
    
    // 可能是数值或类别，取决于唯一率
    if (feature.uniqueRatio < 0.2) {
      reasons.push('唯一率低，可能是类别');
      return {
        dataType: 'category',
        analysisRole: 'dimension',
        metricDirection: 'neutral',
        confidence: 'medium',
        reasons,
      };
    }
    
    return {
      dataType: 'number',
      analysisRole: 'metric',
      metricDirection: 'unspecified',
      confidence: 'medium',
      reasons,
    };
  }
  
  // 3. 低数值比例 → 文本或类别
  if (feature.numericRatio < 0.3) {
    // 3a. 高唯一率 + 长文本 → 标识符或描述
    if (feature.uniqueRatio > 0.8 && feature.avgStringLength > 10) {
      reasons.push('唯一率高且平均字符串长度长');
      return {
        dataType: 'text',
        analysisRole: 'description',
        metricDirection: 'neutral',
        confidence: 'medium',
        reasons,
      };
    }
    
    // 3b. 低唯一率 → 类别
    if (feature.uniqueRatio < 0.3) {
      reasons.push('唯一率低');
      return {
        dataType: 'category',
        analysisRole: 'dimension',
        metricDirection: 'neutral',
        confidence: 'medium',
        reasons,
      };
    }
    
    // 3c. 中文姓名模式
    if (feature.valuePattern === 'chineseName') {
      reasons.push('内容符合中文姓名模式');
      return {
        dataType: 'text',
        analysisRole: 'identifier',
        metricDirection: 'neutral',
        confidence: 'medium',
        reasons,
      };
    }
    
    // 3d. 普通文本
    reasons.push('大部分为文本');
    return {
      dataType: 'text',
      analysisRole: 'description',
      metricDirection: 'neutral',
      confidence: 'low',
      reasons,
    };
  }
  
  // 4. 无法判断
  reasons.push('无法通过内容特征确定类型');
  return {
    dataType: 'unknown',
    analysisRole: 'unspecified',
    metricDirection: 'unspecified',
    confidence: 'unknown',
    reasons,
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 计算字段统计信息
 */
function computeFieldStatistics(columnValues: string[]): FieldStatistics {
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
    
    // 收集前 3 个非空值作为示例
    if (sampleValues.length < 3) {
      // 尝试解析为数值
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

/**
 * 计算内容特征（简化版，用于没有提供 contentFeature 的情况）
 */
function computeContentFeature(columnValues: string[]): ContentFeature {
  const total = columnValues.length;
  
  if (total === 0) {
    return {
      numericRatio: 0,
      integerRatio: 0,
      decimalRatio: 0,
      uniqueRatio: 0,
      min: null,
      max: null,
      mean: null,
      avgStringLength: 0,
      valuePattern: 'unknown',
    };
  }
  
  let validCount = 0;
  let integerCount = 0;
  let decimalCount = 0;
  let min: number | null = null;
  let max: number | null = null;
  let sum = 0;
  
  const uniqueValues = new Set<string>();
  let totalLength = 0;
  
  let chineseNameCount = 0;
  let longNumberCount = 0;
  let rankLikeCount = 0;
  
  for (const val of columnValues) {
    uniqueValues.add(val);
    totalLength += val.length;
    
    const trimmed = val.trim();
    if (!trimmed) continue;
    
    const num = parseNumericValueLegacy(trimmed);
    if (num !== null) {
      validCount++;
      sum += num;
      
      if (min === null || num < min) min = num;
      if (max === null || num > max) max = num;
      
      if (Number.isInteger(num)) {
        integerCount++;
      } else {
        decimalCount++;
      }
      
      if (Number.isInteger(num) && num >= 1 && num <= total * 2) {
        rankLikeCount++;
      }
    }
    
    // 中文姓名模式
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(trimmed)) {
      chineseNameCount++;
    }
    
    // 长数字串模式
    if (/^\d{6,}$/.test(trimmed)) {
      longNumberCount++;
    }
  }
  
  const numericRatio = validCount / total;
  const integerRatio = validCount > 0 ? integerCount / validCount : 0;
  const decimalRatio = validCount > 0 ? decimalCount / validCount : 0;
  const uniqueRatio = uniqueValues.size / total;
  const mean = validCount > 0 ? sum / validCount : null;
  const avgStringLength = totalLength / total;
  
  let valuePattern: ContentFeature['valuePattern'] = 'unknown';
  if (chineseNameCount / total > 0.5) {
    valuePattern = 'chineseName';
  } else if (longNumberCount / total > 0.5) {
    valuePattern = 'longNumber';
  } else if (numericRatio > 0.5 && rankLikeCount / validCount > 0.7) {
    valuePattern = 'rankLike';
  }
  
  return {
    numericRatio,
    integerRatio,
    decimalRatio,
    uniqueRatio,
    min,
    max,
    mean,
    avgStringLength,
    valuePattern,
  };
}
