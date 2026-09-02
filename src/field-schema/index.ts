/**
 * Stage 1A-1: 通用字段模式模块导出入口
 * 
 * 职责：统一导出所有字段模式相关的类型和函数
 */

// 类型定义
export type {
  FieldDataType,
  FieldAnalysisRole,
  FieldMetricDirection,
  InferenceSource,
  InferenceConfidence,
  FieldInference,
  FieldUserOverride,
  FieldStatistics,
  FieldSchema,
  SchemaMode,
  FieldSchemaSet,
  ResolvedFieldSchema,
} from './types';

// 通用推断
export { inferGenericFieldSchema } from './inferGenericSchema';

// 教育模板
export {
  applyEducationTemplate,
  isEducationTemplateMatch,
  getEducationTemplateKeywords,
} from './templates/education';

// 旧模型兼容（仅单向：旧 → 新，供 legacy 数据兼容，通用主链路不得反向使用）
export {
  mapLegacyFieldTypeToDataType,
  mapLegacyAnalysisRoleToRole,
  mapLegacyAnalysisRoleToDirection,
  mapLegacyFieldMetaToSchema,
} from './legacyAdapter';

// 优先级解析
export {
  resolveFieldSchema,
  resolveFieldSchemas,
  shouldAnalyzeField,
  shouldGenerateDirectionEvaluation,
  getFieldDisplayLabel,
  type ResolveConfig,
} from './resolveFieldSchema';
