/**
 * 通用表格分析引擎 - 类型定义
 * 第一阶段：基础抽象层，支持任意结构化表格分析
 */

// 字段类型枚举
export type FeatureType = 
  | 'numerical'    // 数值型（可计算统计量）
  | 'categorical'  // 类别型（离散值）
  | 'temporal'     // 时间型（可解析为时间戳）
  | 'text'         // 文本型（长文本，不参与统计）
  | 'identifier'   // 标识符（学号、ID等高唯一性字段）
  | 'invalid';     // 无效字段（空列或全非法值）

// 单个字段的 Schema 定义
export interface FeatureSchema {
  fieldName: string;           // 原始字段名
  displayName: string;         // 显示名称
  featureType: FeatureType;    // 识别出的字段类型
  confidence: number;          // 识别置信度 0-1
  reason: string;              // 识别依据说明
  statsSummary?: FeatureStats; // 统计摘要（仅 numerical/categorical）
}

// 字段统计摘要
export interface FeatureStats {
  // 基础统计
  count: number;               // 总行数
  validCount: number;          // 有效值数量
  missingCount: number;        // 缺失值数量
  
  // 数值型统计（numerical）
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;                // 标准差
  q1?: number;                 // 第一四分位数
  q3?: number;                 // 第三四分位数
  iqr?: number;                // 四分位距
  
  // 类别型统计（categorical）
  uniqueCount?: number;        // 唯一值数量
  topCategories?: Array<{ value: string; count: number }>; // 前N个类别
}

// 数据集 Schema
export interface DatasetSchema {
  rowCount: number;            // 数据行数
  columnCount: number;         // 字段数量
  features: FeatureSchema[];   // 字段列表
  warnings: string[];          // 解析警告
}

// 特征向量（单行数据）
export interface FeatureVector {
  rowIndex: number;            // 行索引
  values: Record<string, any>; // 字段名 -> 原始值
}

// 分析结果
export interface AnalyticsResult {
  profile: FeatureStats[];           // 各字段统计概况
  rankings?: RankingResult[];        // 排名分析（数值型）
  distributions?: DistributionResult[]; // 分布分析
  relationships?: RelationshipResult[]; // 关系分析（后续阶段）
  clusters?: ClusterResult[];        // 聚类分析（后续阶段）
  anomalies?: AnomalyResult[];       // 异常检测
  insights: string[];                // 可解释洞察
}

// 排名结果
export interface RankingResult {
  fieldName: string;
  featureType: FeatureType;
  rankings: Array<{
    rowIndex: number;
    value: number;
    rank: number;
    percentile: number;
  }>;
}

// 分布结果
export interface DistributionResult {
  fieldName: string;
  featureType: FeatureType;
  histogram?: {
    bins: Array<{ min: number; max: number; count: number }>;
  };
  quartiles?: {
    q1: number;
    q2: number;
    q3: number;
    outliers: number[];
  };
}

// 关系结果（预留）
export interface RelationshipResult {
  fields: [string, string];
  correlation?: number;
  description: string;
}

// 聚类结果（预留）
export interface ClusterResult {
  clusterId: number;
  members: number[];
  centroid?: Record<string, number>;
}

// 异常结果
export interface AnomalyResult {
  fieldName: string;
  rowIndex: number;
  value: any;
  type: 'outlier' | 'missing' | 'invalid';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// 分析配置
export interface AnalyticsConfig {
  maxRows?: number;              // 最大分析行数（防卡死）
  includeIdentifiers?: boolean;  // 是否分析标识符字段
  outlierThreshold?: number;     // 异常值阈值（IQR倍数）
  topCategories?: number;        // 类别型显示前N个
}

// 默认配置
export const DEFAULT_CONFIG: AnalyticsConfig = {
  maxRows: 5000,
  includeIdentifiers: false,
  outlierThreshold: 1.5,
  topCategories: 5,
};
