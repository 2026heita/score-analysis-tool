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
import { parseNumericValueLegacy } from '../utils/tableParser/numericParser';

// ============================================================
// 通用字段名规则（不包含教育特定关键词）
// ============================================================

/**
 * 标识符字段关键词（仅通用业务概念）。
 * 教育领域专用词（如"学号"）不放在通用规则里，由 legacy education 兼容层处理。
 */
const IDENTIFIER_KEYWORDS = [
  'id', '编号', '代码', '编码', '账号', '工号', '订单号', 'sku', '货号', '条码',
  '手机号', '电话', '身份证', '护照', '卡号',
];

/** 时间字段中文关键词（英文部分交给 matchesDatetimeName 做词边界判断，
 *  避免 'responseTimeMs'/'loadTime' 等毫秒/耗时字段被误判为时间） */
const DATETIME_CHINESE_KEYWORDS = [
  '时间', '日期', '创建时间', '更新时间', '开始时间', '结束时间',
];

/** 类别字段关键词（仅通用业务概念）。
 *  "专业/班级"等教育领域多义词不硬编码为通用维度，交给 legacy education 兼容层。
 *  门店/仓库/渠道等是通用业务分组概念，不属于教育领域。 */
const CATEGORY_KEYWORDS = [
  '类型', '类别', '分类', '状态', '级别', '等级', '部门', '地区',
  '省份', '城市', '性别', '民族', '门店', '店铺', '仓库', '渠道', '站点',
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
 * @returns 推断的字段模式
 */
export function inferGenericFieldSchema(
  header: string,
  columnValues: string[],
): FieldSchema {
  const headerLower = header.toLowerCase().trim();
  
  // 计算统计信息
  const statistics = computeFieldStatistics(columnValues);
  
  // 计算通用结构特征（仅描述"数据长什么样"，不含业务语义）
  const feature = computeStructureFeature(columnValues);
  
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
  
  // 2. 时间字段（词边界感知，避免 'responseTimeMs' 等毫秒/耗时字段误判）
  if (matchesDatetimeName(headerLower)) {
    return {
      dataType: 'datetime',
      analysisRole: 'time',
      metricDirection: 'neutral',
      reason: `字段名符合时间特征`,
    };
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

/**
 * 判断字段名是否符合"时间"特征（词边界感知）。
 *
 * 设计原则：
 * - 中文时间词（时间/日期/创建时间等）按子串匹配；
 * - 英文 'time'/'date' 必须出现在词边界（前后缀/独立），
 *   避免 'responseTimeMs'、'loadTime'、'timeout'、'meantime' 等
 *   毫秒/耗时字段被误判为日期时间；
 * - 'datetime'/'timestamp' 为专有名，按子串匹配。
 */
function matchesDatetimeName(headerLower: string): boolean {
  // 中文时间关键词
  for (const kw of DATETIME_CHINESE_KEYWORDS) {
    if (headerLower.includes(kw)) return true;
  }
  // 专有英文时间词
  if (headerLower.includes('datetime')) return true;
  if (headerLower.includes('timestamp')) return true;
  // 词边界感知的 date/time 前缀或后缀
  if (/(^|[_-\s/])(time|date)/.test(headerLower)) return true; // 前缀 date: 2026... / date_xxx
  if (/[_-\s](time|date)$/.test(headerLower)) return true;     // 后缀 create_time / end_date
  return false;
}

// ============================================================
// 基于内容特征推断
// ============================================================

/**
 * 通用内容结构特征。
 * 只描述"数据长什么样"（结构），不描述"业务上是什么"。
 * 业务含义由 schema 推断再结合字段名决定，绝不根据 0~150 范围或中文字段名推断"成绩"、
 * 也绝不把小整数序列推断为"排名"。
 */
interface StructureFeature {
  numericRatio: number;      // 可解析为数值的比例 (0-1)
  integerRatio: number;      // 有效数值中整数比例 (0-1)
  uniqueRatio: number;       // 唯一值比例 (0-1)
  longDigitRatio: number;    // 纯数字且长度>=6 的比例 (0-1)
  avgStringLength: number;   // 平均字符串长度
  smallIntRatio: number;     // 有效数值中 1..N 小整数比例 (0-1)
  min: number | null;
  max: number | null;
  mean: number | null;
}

interface StructureInferResult {
  dataType: FieldDataType;
  analysisRole: FieldAnalysisRole;
  metricDirection: FieldMetricDirection;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  reasons: string[];
}

function inferByContentFeature(
  feature: StructureFeature
): StructureInferResult {
  const reasons: string[] = [];
  
  // 1. 高数值比例 → 数值类型
  if (feature.numericRatio > 0.8) {
    reasons.push(`数值比例高(${(feature.numericRatio * 100).toFixed(0)}%)`);
    
    // 1a. 高唯一率 + 长数字串 → 标识符（如工号/订单号/流水号）
    if (feature.uniqueRatio > 0.9 && feature.longDigitRatio > 0.5) {
      reasons.push('唯一率高且多为长数字串');
      return {
        dataType: 'identifier',
        analysisRole: 'identifier',
        metricDirection: 'neutral',
        confidence: 'high',
        reasons,
      };
    }
    
    // 1b. 小整数 + 高唯一率：可能是序号/优先级/量级/编号等。
    // 仅作为结构特征，绝不赋予"排名"业务语义。
    if (
      feature.integerRatio > 0.9 &&
      feature.smallIntRatio > 0.7 &&
      feature.uniqueRatio > 0.5
    ) {
      reasons.push('内容为连续小整数（可能是序号/优先级/编号，非业务结论）');
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
    // 3a. 高唯一率 + 长文本 → 描述
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
    
    // 3b. 低唯一率 → 类别（有限取值，如状态/地区/类别）
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
    
    // 3c. 普通文本
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

function computeStructureFeature(columnValues: string[]): StructureFeature {
  const total = columnValues.length;

  if (total === 0) {
    return {
      numericRatio: 0,
      integerRatio: 0,
      uniqueRatio: 0,
      longDigitRatio: 0,
      avgStringLength: 0,
      smallIntRatio: 0,
      min: null,
      max: null,
      mean: null,
    };
  }

  let validCount = 0;
  let integerCount = 0;
  let smallIntCount = 0;
  let longDigit = 0;
  let min: number | null = null;
  let max: number | null = null;
  let sum = 0;

  const uniqueValues = new Set<string>();
  let totalLength = 0;

  for (const val of columnValues) {
    uniqueValues.add(val);
    totalLength += val.length;

    const trimmed = val.trim();
    if (!trimmed) continue;

    // 长数字串（>=6 位纯数字）
    if (/^\d{6,}$/.test(trimmed)) {
      longDigit++;
    }

    const num = parseNumericValueLegacy(trimmed);
    if (num !== null) {
      validCount++;
      sum += num;

      if (min === null || num < min) min = num;
      if (max === null || num > max) max = num;

      if (Number.isInteger(num)) {
        integerCount++;
        if (num >= 1 && num <= total * 2) {
          smallIntCount++;
        }
      }
    }
  }

  return {
    numericRatio: validCount / total,
    integerRatio: validCount > 0 ? integerCount / validCount : 0,
    uniqueRatio: uniqueValues.size / total,
    longDigitRatio: longDigit / total,
    avgStringLength: totalLength / total,
    smallIntRatio: validCount > 0 ? smallIntCount / validCount : 0,
    min,
    max,
    mean: validCount > 0 ? sum / validCount : null,
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
