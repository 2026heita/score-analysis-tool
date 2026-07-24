/**
 * Stage 1A-1: 字段模式优先级解析
 * 
 * 职责：根据优先级规则解析最终字段模式
 * 优先级：用户明确配置 > 当前启用模板推荐 > 通用自动推断 > 旧系统兼容结果 > unspecified / unknown
 * 
 * 设计原则：
 * 1. 用户设置不得被重新推断覆盖
 * 2. 用户设置为 unspecified 时也视为明确配置
 * 3. 用户忽略字段后，该字段不得参与分析
 * 4. neutral 和 unspecified 不生成优劣评价
 * 5. 通用模式下，字段名包含"排名"不得直接强制为 lower_is_better
 * 6. 教育模板可以推荐 lower_is_better，但必须保留推荐来源
 */

import type {
  FieldSchema,
  ResolvedFieldSchema,
  SchemaMode,
  FieldDataType,
  FieldAnalysisRole,
} from './types';
import { inferGenericFieldSchema } from './inferGenericSchema';
import { applyEducationTemplate } from './templates/education';
import { mapLegacyFieldMetaToSchema } from './legacyAdapter';
import type { FieldMeta } from '../utils/tableParser/types';
import type { ContentFeature } from '../utils/tableParser/types';

// ============================================================
// 解析配置
// ============================================================

/** 解析配置 */
export interface ResolveConfig {
  /** 当前平台模式 */
  mode: SchemaMode;
  
  /** 旧字段元数据（可选，用于兼容） */
  legacyFieldMeta?: FieldMeta;
  
  /** 内容特征（可选） */
  contentFeature?: ContentFeature;
  
  /** 列值（可选，用于统计） */
  columnValues?: string[];
}

// ============================================================
// 主解析函数
// ============================================================

/**
 * 解析字段模式（应用优先级规则）
 * 
 * @param header 字段名
 * @param schema 当前字段模式（可能包含用户覆盖）
 * @param config 解析配置
 * @returns 解析后的最终字段模式
 */
export function resolveFieldSchema(
  header: string,
  schema: FieldSchema | null,
  config: ResolveConfig
): ResolvedFieldSchema {
  const { mode, legacyFieldMeta, contentFeature, columnValues } = config;
  
  // 优先级 1：用户明确配置
  if (schema?.userOverride) {
    return applyUserOverride(schema);
  }
  
  // 优先级 2：教育模板推荐（仅 education 模式）
  if (mode === 'education') {
    // 2a: 已有 schema 上尝试模板
    if (schema) {
      const templateResult = applyEducationTemplate(header, schema);
      if (templateResult) {
        return extractResolvedSchema(templateResult);
      }
    }
    // 2b: legacy 上尝试模板
    if (legacyFieldMeta) {
      const legacySchema = mapLegacyFieldMetaToSchema(legacyFieldMeta, columnValues);
      const templateResult = applyEducationTemplate(header, legacySchema);
      if (templateResult) {
        return extractResolvedSchema(templateResult);
      }
    }
    // 2c: 内容推断上尝试模板
    if (columnValues) {
      const inferredSchema = inferGenericFieldSchema(header, columnValues, contentFeature);
      const templateResult = applyEducationTemplate(header, inferredSchema);
      if (templateResult) {
        return extractResolvedSchema(templateResult);
      }
    }
  }
  
  // 优先级 3：通用自动推断（generic 模式优先使用内容推断）
  if (columnValues) {
    const inferredSchema = inferGenericFieldSchema(header, columnValues, contentFeature);
    // 如果通用推断得到有意义的结果，直接使用
    if (inferredSchema.dataType !== 'unknown' || inferredSchema.analysisRole !== 'unspecified') {
      return extractResolvedSchema(inferredSchema);
    }
  }
  
  // 优先级 4：已有 schema（非 legacy 来源）
  if (schema && schema.inference.source !== 'legacy') {
    return extractResolvedSchema(schema);
  }
  
  // 优先级 5：旧系统兼容结果（仅作为兜底）
  if (legacyFieldMeta) {
    const legacySchema = mapLegacyFieldMetaToSchema(legacyFieldMeta, columnValues);
    return extractResolvedSchema(legacySchema);
  }
  
  // 兜底：返回 unspecified
  return {
    fieldId: header,
    sourceName: header,
    dataType: 'unknown',
    analysisRole: 'unspecified',
    metricDirection: 'unspecified',
    ignored: false,
    inferenceSource: 'structure',
    inferenceConfidence: 'unknown',
    inferenceReasons: ['无法推断字段模式'],
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 应用用户覆盖
 */
function applyUserOverride(schema: FieldSchema): ResolvedFieldSchema {
  const override = schema.userOverride!;
  
  return {
    fieldId: schema.fieldId,
    sourceName: schema.sourceName,
    dataType: override.dataType ?? schema.dataType,
    analysisRole: override.analysisRole ?? schema.analysisRole,
    metricDirection: override.metricDirection ?? schema.metricDirection,
    ignored: override.ignored ?? false,
    inferenceSource: 'user',
    inferenceConfidence: 'high',
    inferenceReasons: [
      `用户明确配置${override.reason ? `：${override.reason}` : ''}`,
    ],
  };
}

/**
 * 提取解析后的字段模式
 */
function extractResolvedSchema(schema: FieldSchema): ResolvedFieldSchema {
  return {
    fieldId: schema.fieldId,
    sourceName: schema.sourceName,
    dataType: schema.dataType,
    analysisRole: schema.analysisRole,
    metricDirection: schema.metricDirection,
    ignored: false,
    inferenceSource: schema.inference.source,
    inferenceConfidence: schema.inference.confidence,
    inferenceReasons: schema.inference.reasons,
  };
}

// ============================================================
// 批量解析
// ============================================================

/**
 * 批量解析字段模式
 * 
 * @param headers 字段名数组
 * @param schemas 当前字段模式数组（可选）
 * @param config 解析配置
 * @returns 解析后的最终字段模式数组
 */
export function resolveFieldSchemas(
  headers: string[],
  schemas: (FieldSchema | null)[] | null,
  config: Omit<ResolveConfig, 'legacyFieldMeta'> & {
    legacyFieldMetas?: FieldMeta[];
    rows?: Record<string, string>[];
  }
): ResolvedFieldSchema[] {
  const { mode, legacyFieldMetas, rows } = config;
  
  return headers.map((header, index) => {
    const schema = schemas?.[index] ?? null;
    const legacyFieldMeta = legacyFieldMetas?.[index];
    const columnValues = rows?.map(row => row[header] ?? '');
    
    return resolveFieldSchema(header, schema, {
      mode,
      legacyFieldMeta,
      columnValues,
    });
  });
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 检查字段是否应该参与分析
 */
export function shouldAnalyzeField(resolved: ResolvedFieldSchema): boolean {
  // 忽略的字段不参与分析
  if (resolved.ignored) return false;
  
  // ignored 角色不参与分析
  if (resolved.analysisRole === 'ignored') return false;
  
  // unspecified 角色不参与分析（需要用户确认）
  if (resolved.analysisRole === 'unspecified') return false;
  
  return true;
}

/**
 * 检查字段是否应该生成优劣评价
 */
export function shouldGenerateDirectionEvaluation(
  resolved: ResolvedFieldSchema
): boolean {
  // neutral 和 unspecified 不生成优劣评价
  if (resolved.metricDirection === 'neutral') return false;
  if (resolved.metricDirection === 'unspecified') return false;
  
  return true;
}

/**
 * 获取字段的显示标签
 */
export function getFieldDisplayLabel(resolved: ResolvedFieldSchema): string {
  const typeLabels: Record<FieldDataType, string> = {
    number: '数值',
    category: '类别',
    datetime: '日期时间',
    boolean: '布尔',
    text: '文本',
    identifier: '标识符',
    unknown: '未知',
  };
  
  const roleLabels: Record<FieldAnalysisRole, string> = {
    metric: '指标',
    dimension: '维度',
    identifier: '标识符',
    time: '时间',
    description: '描述',
    ignored: '已忽略',
    unspecified: '未指定',
  };
  
  return `${typeLabels[resolved.dataType]} / ${roleLabels[resolved.analysisRole]}`;
}
