/**
 * Stage 1A-1: 通用字段模式类型定义
 * 
 * 设计原则：
 * 1. 不使用 score、courseScore 等教育概念作为核心类型
 * 2. 自动推断值和用户覆盖值分离
 * 3. 可以追踪推断来源和原因
 * 4. 可以表达不确定状态
 */

// ============================================================
// 通用数据类型
// ============================================================

/** 通用数据类型 */
export type FieldDataType =
  | 'number'       // 数值类型（连续数值）
  | 'category'     // 类别类型（离散分类）
  | 'datetime'     // 日期时间类型
  | 'boolean'      // 布尔类型
  | 'text'         // 文本类型（长文本、描述）
  | 'identifier'   // 标识符类型（主键、ID）
  | 'unknown';     // 未知类型

// ============================================================
// 通用分析角色
// ============================================================

/** 通用分析角色 */
export type FieldAnalysisRole =
  | 'metric'       // 指标字段（参与统计计算）
  | 'dimension'    // 维度字段（用于分组）
  | 'identifier'   // 标识符字段（主键、ID）
  | 'time'         // 时间字段（日期、时间戳）
  | 'description'  // 描述字段（备注、说明）
  | 'ignored'      // 忽略字段（不参与分析）
  | 'unspecified'; // 未指定（需要用户确认）

// ============================================================
// 通用指标方向
// ============================================================

/** 通用指标方向 */
export type FieldMetricDirection =
  | 'higher_is_better'  // 越高越好（如成绩、销售额）
  | 'lower_is_better'   // 越低越好（如排名、错误率）
  | 'neutral'           // 中性（如温度、年龄）
  | 'unspecified';      // 未指定（通用模式默认）

// ============================================================
// 推断来源与置信度
// ============================================================

/** 推断来源 */
export type InferenceSource =
  | 'structure'   // 基于数据结构推断（数值比例、唯一值率等）
  | 'name_rule'   // 基于字段名规则推断（关键词匹配）
  | 'template'    // 基于模板推荐
  | 'legacy'      // 来自旧系统兼容映射
  | 'user';       // 用户明确配置

/** 推断置信度 */
export type InferenceConfidence =
  | 'high'       // 高置信度（>= 0.8）
  | 'medium'     // 中置信度（0.5 - 0.8）
  | 'low'        // 低置信度（< 0.5）
  | 'unknown';   // 未知（无法评估）

/** 推断信息 */
export interface FieldInference {
  /** 推断来源 */
  source: InferenceSource;
  
  /** 推断置信度 */
  confidence: InferenceConfidence;
  
  /** 推断原因列表 */
  reasons: string[];
}

// ============================================================
// 用户覆盖配置
// ============================================================

/** 用户覆盖配置 */
export interface FieldUserOverride {
  /** 用户设置的数据类型 */
  dataType?: FieldDataType;
  
  /** 用户设置的分析角色 */
  analysisRole?: FieldAnalysisRole;
  
  /** 用户设置的指标方向 */
  metricDirection?: FieldMetricDirection;
  
  /** 用户是否忽略该字段 */
  ignored?: boolean;
  
  /** 用户修改原因（可选） */
  reason?: string;
}

// ============================================================
// 字段统计信息
// ============================================================

/** 字段统计信息 */
export interface FieldStatistics {
  /** 缺失值数量 */
  missingCount?: number;
  
  /** 唯一值数量 */
  uniqueCount?: number;
  
  /** 示例值（前 3 个非空值） */
  sampleValues?: unknown[];
}

// ============================================================
// 字段模式核心定义
// ============================================================

/** 字段模式 */
export interface FieldSchema {
  /** 字段唯一标识（通常为字段名） */
  fieldId: string;
  
  /** 原始字段名 */
  sourceName: string;
  
  /** 自动推断的数据类型 */
  dataType: FieldDataType;
  
  /** 自动推断的分析角色 */
  analysisRole: FieldAnalysisRole;
  
  /** 自动推断的指标方向 */
  metricDirection: FieldMetricDirection;
  
  /** 推断信息 */
  inference: FieldInference;
  
  /** 用户覆盖配置（可选） */
  userOverride?: FieldUserOverride;
  
  /** 字段统计信息（可选） */
  statistics?: FieldStatistics;
}

// ============================================================
// 平台模式
// ============================================================

/** 平台模式 */
export type SchemaMode = 'generic' | 'education';

// ============================================================
// 字段模式集合
// ============================================================

/** 字段模式集合 */
export interface FieldSchemaSet {
  /** 数据集标识 */
  datasetKey: string;
  
  /** 字段模式数组 */
  fields: FieldSchema[];
  
  /** 当前平台模式 */
  mode: SchemaMode;
  
  /** 是否全部已用户确认 */
  allConfirmed: boolean;
  
  /** 创建时间 */
  createdAt: string;
  
  /** 最后修改时间 */
  updatedAt: string;
}

// ============================================================
// 解析后的最终字段模式
// ============================================================

/** 解析后的最终字段模式（应用优先级后） */
export interface ResolvedFieldSchema {
  /** 字段唯一标识 */
  fieldId: string;
  
  /** 原始字段名 */
  sourceName: string;
  
  /** 最终数据类型 */
  dataType: FieldDataType;
  
  /** 最终分析角色 */
  analysisRole: FieldAnalysisRole;
  
  /** 最终指标方向 */
  metricDirection: FieldMetricDirection;
  
  /** 是否忽略 */
  ignored: boolean;
  
  /** 推断来源（最终） */
  inferenceSource: InferenceSource;
  
  /** 推断置信度（最终） */
  inferenceConfidence: InferenceConfidence;
  
  /** 推断原因（最终） */
  inferenceReasons: string[];
}
