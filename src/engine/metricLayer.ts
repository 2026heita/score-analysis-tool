/**
 * Metric Layer v0 - 内部语义层
 * 
 * 职责：将 FieldMeta[] 或 ResolvedFieldSchema[] 映射为语义化的 MetricDefinition / EntityDefinition / DimensionDefinition
 * 
 * 核心原则：
 * 1. 只作为内部语义层，不改变现有 UI
 * 2. 不修改 selectedFields / fieldValues
 * 3. 不改变现有字段分类逻辑
 * 4. 提供语义化接口供后续使用
 * 5. 支持 ResolvedFieldSchema 作为首选数据源
 */

import type { FieldMeta } from '../utils/tableParser/types';
import type { ResolvedFieldSchema } from '../field-schema';

// ============================================================
// 类型定义
// ============================================================

/** 指标方向 */
export type MetricDirection = 'higher-is-better' | 'lower-is-better';

/** 指标类型 */
export type MetricType = 'score' | 'rank' | 'total' | 'adjustment' | 'numeric';

/** 指标定义 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  direction: MetricDirection;
  displayName: string;
  isRecommended: boolean;
  sourceField: string;
  contentFeature?: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
}

/** 实体定义 */
export interface EntityDefinition {
  name: string;
  type: 'identity' | 'id';
  displayName: string;
  isPrimaryKey: boolean;
}

/** 维度定义 */
export interface DimensionDefinition {
  name: string;
  type: 'category' | 'status' | 'group';
  displayName: string;
  values?: string[];
}

/** 语义层定义 */
export interface SemanticDefinitions {
  metrics: MetricDefinition[];
  entities: EntityDefinition[];
  dimensions: DimensionDefinition[];
}

// ============================================================
// 内部辅助函数
// ============================================================

/** 可分析的 analysisRole 列表 */
const ANALYZABLE_ROLES = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment'];

/** 判断是否为可分析的 analysisRole */
function isAnalyzableRole(role: string): boolean {
  return ANALYZABLE_ROLES.includes(role);
}

/** 根据 analysisRole 获取 MetricType */
function getMetricType(role: string): MetricType {
  switch (role) {
    case 'primaryTotal': return 'total';
    case 'rank': return 'rank';
    case 'sectionTotal': return 'total';
    case 'courseScore': return 'score';
    case 'adjustment': return 'adjustment';
    default: return 'numeric';
  }
}

/** 根据 analysisRole 获取 MetricDirection */
function getMetricDirection(role: string): MetricDirection {
  // rank 字段：越小越好
  return role === 'rank' ? 'lower-is-better' : 'higher-is-better';
}

/** 根据 analysisRole 判断是否推荐 */
function getMetricRecommended(role: string): boolean {
  // adjustment 不推荐参与默认分析
  return role !== 'adjustment';
}

/** 构建 MetricDefinition */
function buildMetricDefinition(meta: FieldMeta): MetricDefinition {
  return {
    name: meta.header,
    type: getMetricType(meta.analysisRole),
    direction: getMetricDirection(meta.analysisRole),
    displayName: meta.header,
    isRecommended: getMetricRecommended(meta.analysisRole),
    sourceField: meta.header,
    contentFeature: meta.contentFeature ? {
      min: meta.contentFeature.min,
      max: meta.contentFeature.max,
      mean: meta.contentFeature.mean,
    } : undefined,
  };
}

/** identity 字段中，属于 dimension（分组/类别）的关键词 */
const DIMENSION_KEYWORDS = ['班级', '学校', '部门', '组别', '类别', '科类', '选科', '组合'];

/** 判断 identity 字段是否为 entity */
function isEntityIdentity(meta: FieldMeta): boolean {
  const headerLower = meta.header.toLowerCase();
  
  // 检查是否为 dimension 关键词
  for (const kw of DIMENSION_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return false;
    }
  }
  
  // 默认为 entity
  return true;
}

/** 判断 identity 字段是否为主键 */
function isPrimaryKeyIdentity(meta: FieldMeta): boolean {
  const headerLower = meta.header.toLowerCase();
  
  // 学号、考号、编号、ID 等长数字串且唯一率高
  const isIdField = headerLower.includes('学号') || 
                    headerLower.includes('考号') || 
                    headerLower.includes('编号') ||
                    headerLower.includes('id');
  
  if (!isIdField) return false;
  
  // 检查内容特征：唯一率高且是数值
  if (meta.contentFeature) {
    return meta.contentFeature.uniqueRatio === 1 && meta.contentFeature.numericRatio === 1;
  }
  
  return false;
}

/** 构建 EntityDefinition */
function buildEntityDefinition(meta: FieldMeta): EntityDefinition {
  const isPK = isPrimaryKeyIdentity(meta);
  return {
    name: meta.header,
    type: isPK ? 'id' : 'identity',
    displayName: meta.header,
    isPrimaryKey: isPK,
  };
}

/** 构建 DimensionDefinition */
function buildDimensionDefinition(meta: FieldMeta): DimensionDefinition {
  // 判断维度类型
  let dimType: 'category' | 'status' | 'group' = 'category';
  const headerLower = meta.header.toLowerCase();
  
  if (headerLower.includes('班级') || headerLower.includes('组别') || headerLower.includes('部门')) {
    dimType = 'group';
  } else if (headerLower.includes('状态') || headerLower.includes('缺考')) {
    dimType = 'status';
  }
  
  return {
    name: meta.header,
    type: dimType,
    displayName: meta.header,
  };
}

// ============================================================
// 公开接口
// ============================================================

/**
 * 从 FieldMeta[] 构建语义层定义
 * 
 * 映射规则：
 * 1. primaryTotal / rank / sectionTotal / courseScore / adjustment → Metric
 *    - rank: direction='lower-is-better'
 *    - adjustment: isRecommended=false
 * 2. identity 字段：
 *    - 学号/考号/编号/ID/姓名 → Entity
 *    - 班级/学校/部门/组别/类别/科类/选科 → Dimension
 *    - 无法判断的 → Entity (isPrimaryKey=false)
 * 3. textMeta → Dimension（如果适合）
 * 4. unknown / invalid → 忽略
 * 
 * @param fieldMetas 字段元数据数组
 * @returns 语义层定义
 */
export function buildSemanticDefinitions(
  fieldMetas: FieldMeta[]
): SemanticDefinitions {
  const metrics: MetricDefinition[] = [];
  const entities: EntityDefinition[] = [];
  const dimensions: DimensionDefinition[] = [];

  for (const meta of fieldMetas) {
    // 1. identity 字段：区分 entity 和 dimension
    if (meta.analysisRole === 'identity') {
      if (isEntityIdentity(meta)) {
        entities.push(buildEntityDefinition(meta));
      } else {
        dimensions.push(buildDimensionDefinition(meta));
      }
      continue;
    }

    // 2. textMeta → Dimension（如果适合）
    if (meta.analysisRole === 'textMeta') {
      // 数值比例太高的不适合做维度
      if (meta.contentFeature?.numericRatio && meta.contentFeature.numericRatio > 0.5) {
        continue;
      }
      dimensions.push(buildDimensionDefinition(meta));
      continue;
    }

    // 3. 可分析的数值字段 → Metric
    if (isAnalyzableRole(meta.analysisRole)) {
      metrics.push(buildMetricDefinition(meta));
      continue;
    }

    // 4. unknown / invalid / 其他 → 忽略
  }

  return { metrics, entities, dimensions };
}

/**
 * 获取所有推荐的 metrics
 */
export function getRecommendedMetrics(semantic: SemanticDefinitions): MetricDefinition[] {
  return semantic.metrics.filter(m => m.isRecommended);
}

/**
 * 获取所有 rank 类型的 metrics
 */
export function getRankMetrics(semantic: SemanticDefinitions): MetricDefinition[] {
  return semantic.metrics.filter(m => m.type === 'rank');
}

/**
 * 获取所有 entity 类型的定义
 */
export function getEntities(semantic: SemanticDefinitions): EntityDefinition[] {
  return semantic.entities;
}

/**
 * 获取主键 entity
 */
export function getPrimaryKeyEntity(semantic: SemanticDefinitions): EntityDefinition | null {
  return semantic.entities.find(e => e.isPrimaryKey) || null;
}

// ============================================================
// ResolvedFieldSchema 适配层
// ============================================================

/**
 * 从 ResolvedFieldSchema 构建 MetricDefinition
 * 
 * 映射规则：
 * - analysisRole = 'metric' → MetricDefinition
 * - metricDirection 映射：
 *   - higher_is_better → higher-is-better
 *   - lower_is_better → lower-is-better
 *   - neutral / unspecified → 默认为 higher-is-better（但标记 isRecommended=false）
 */
function buildMetricFromResolvedSchema(schema: ResolvedFieldSchema): MetricDefinition | null {
  if (schema.analysisRole !== 'metric') {
    return null;
  }

  // 映射 metricDirection
  let direction: MetricDirection = 'higher-is-better';
  let isRecommended = true;

  if (schema.metricDirection === 'higher_is_better') {
    direction = 'higher-is-better';
  } else if (schema.metricDirection === 'lower_is_better') {
    direction = 'lower-is-better';
  } else {
    // neutral 或 unspecified：默认 higher-is-better，但不推荐
    direction = 'higher-is-better';
    isRecommended = false;
  }

  // 确定 metric type
  let type: MetricType = 'numeric';
  if (schema.metricDirection === 'lower_is_better') {
    type = 'rank';
  }

  return {
    name: schema.fieldId,
    type,
    direction,
    displayName: schema.sourceName,
    isRecommended,
    sourceField: schema.fieldId,
  };
}

/**
 * 从 ResolvedFieldSchema 构建 DimensionDefinition
 * 
 * 映射规则：
 * - analysisRole = 'dimension' → DimensionDefinition
 * - analysisRole = 'time' → DimensionDefinition (type='category')
 */
function buildDimensionFromResolvedSchema(schema: ResolvedFieldSchema): DimensionDefinition | null {
  if (schema.analysisRole !== 'dimension' && schema.analysisRole !== 'time') {
    return null;
  }

  // 时间字段作为 category 维度
  const type = schema.analysisRole === 'time' ? 'category' : 'category';

  return {
    name: schema.fieldId,
    type,
    displayName: schema.sourceName,
  };
}

/**
 * 从 ResolvedFieldSchema 构建 EntityDefinition
 * 
 * 映射规则：
 * - analysisRole = 'identifier' → EntityDefinition
 */
function buildEntityFromResolvedSchema(schema: ResolvedFieldSchema): EntityDefinition | null {
  if (schema.analysisRole !== 'identifier') {
    return null;
  }

  // 判断是否为主键（根据推断来源和置信度）
  const isPrimaryKey = schema.inferenceSource === 'template' && 
                       schema.inferenceConfidence === 'high';

  return {
    name: schema.fieldId,
    type: isPrimaryKey ? 'id' : 'identity',
    displayName: schema.sourceName,
    isPrimaryKey,
  };
}

/**
 * 从 ResolvedFieldSchema[] 构建语义层定义
 * 
 * 映射规则：
 * 1. analysisRole = 'metric' → MetricDefinition
 *    - metricDirection 映射：higher_is_better/lower_is_better/neutral/unspecified
 * 2. analysisRole = 'dimension' / 'time' → DimensionDefinition
 * 3. analysisRole = 'identifier' → EntityDefinition
 * 4. analysisRole = 'description' / 'ignored' → 忽略
 * 
 * @param resolvedSchemas 解析后的字段模式数组
 * @returns 语义层定义
 */
export function buildSemanticDefinitionsFromResolved(
  resolvedSchemas: ResolvedFieldSchema[]
): SemanticDefinitions {
  const metrics: MetricDefinition[] = [];
  const entities: EntityDefinition[] = [];
  const dimensions: DimensionDefinition[] = [];

  for (const schema of resolvedSchemas) {
    // 1. metric → MetricDefinition
    if (schema.analysisRole === 'metric') {
      const metric = buildMetricFromResolvedSchema(schema);
      if (metric) {
        metrics.push(metric);
      }
      continue;
    }

    // 2. dimension / time → DimensionDefinition
    if (schema.analysisRole === 'dimension' || schema.analysisRole === 'time') {
      const dimension = buildDimensionFromResolvedSchema(schema);
      if (dimension) {
        dimensions.push(dimension);
      }
      continue;
    }

    // 3. identifier → EntityDefinition
    if (schema.analysisRole === 'identifier') {
      const entity = buildEntityFromResolvedSchema(schema);
      if (entity) {
        entities.push(entity);
      }
      continue;
    }

    // 4. description / ignored / unspecified → 忽略
  }

  return { metrics, entities, dimensions };
}
