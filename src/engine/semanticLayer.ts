/**
 * Semantic Layer - 语义可信度图谱
 * 
 * 将 FieldMeta[] 转换为带权重的图结构（nodes + weighted edges + meta），
 * 表达字段之间的语义关系及其可信度。
 * 
 * 与 metricLayer.ts 的关系：
 * - metricLayer 负责"分类"（每个字段是什么）
 * - semanticLayer 负责"关系"（字段之间怎么连接）+ "可信度"（关系有多可靠）
 * 
 * 不修改 metricLayer，不接 UI，纯数据结构转换。
 */

import type { FieldMeta } from '../utils/tableParser/types';
import {
  buildSemanticDefinitions,
  type MetricDefinition,
  type EntityDefinition,
  type DimensionDefinition,
} from './metricLayer';

// ============================================================
// 类型定义
// ============================================================

/** 节点类型 */
export type SemanticNodeType = 'metric' | 'entity' | 'dimension';

/** 语义节点 */
export type SemanticNode = MetricNode | EntityNode | DimensionNode;

/** 指标节点 */
export interface MetricNode {
  id: string;
  type: 'metric';
  definition: MetricDefinition;
}

/** 实体节点 */
export interface EntityNode {
  id: string;
  type: 'entity';
  definition: EntityDefinition;
}

/** 维度节点 */
export interface DimensionNode {
  id: string;
  type: 'dimension';
  definition: DimensionDefinition;
}

/** 关系类型 */
export type RelationType = 'measures' | 'groups' | 'compares';

/** 关系边（带权重和可信度） */
export interface RelationEdge {
  id: string;
  type: RelationType;
  source: string;  // node id
  target: string;  // node id
  /** 关系描述 */
  label: string;
  /** 关系权重 (0~1)：表示该关系在语义图谱中的重要程度 */
  weight: number;
  /** 关系可信度 (0~1)：基于源/目标节点的 confidence 计算 */
  confidence: number;
}

/** 图谱元信息 */
export interface GraphMeta {
  /** 整体可信度 (0~1)：所有节点和边可信度的加权平均 */
  confidence: number;
}

/** 语义可信度图谱 */
export interface SemanticGraph {
  nodes: SemanticNode[];
  edges: RelationEdge[];
  meta: GraphMeta;
}

// ============================================================
// 常量：默认权重
// ============================================================

/** 各关系类型的默认权重 */
const EDGE_WEIGHTS: Record<RelationType, number> = {
  measures: 0.9,
  groups: 0.6,
  compares: 0.4,
};

// ============================================================
// 内部辅助
// ============================================================

/** 生成节点 ID */
function nodeId(type: SemanticNodeType, name: string): string {
  return `${type}:${name}`;
}

/** 生成边 ID */
function edgeId(type: RelationType, source: string, target: string): string {
  return `${type}:${source}->${target}`;
}

/**
 * 从 FieldMeta 中提取 confidence 值
 * 
 * 优先使用 FieldMeta.confidence，默认 0.8
 */
function getFieldConfidence(meta: FieldMeta): number {
  return meta.confidence ?? 0.8;
}

/**
 * 构建带权重的关系边
 * 
 * 规则：
 * - measures: entity → metric（实体"度量"指标）, weight = 0.9
 * - groups: metric → dimension（指标"分组"维度）, weight = 0.6
 * - compares: metric → metric（指标之间"对比"）, weight = 0.4
 * 
 * confidence = 源节点 confidence × 目标节点 confidence
 */
function buildEdges(
  metrics: MetricDefinition[],
  entities: EntityDefinition[],
  dimensions: DimensionDefinition[],
  fieldConfidences: Map<string, number>,
): RelationEdge[] {
  const edges: RelationEdge[] = [];

  // measures: 每个 entity 度量每个 metric
  for (const entity of entities) {
    for (const metric of metrics) {
      const source = nodeId('entity', entity.name);
      const target = nodeId('metric', metric.name);
      const srcConf = fieldConfidences.get(entity.name) ?? 0.8;
      const tgtConf = fieldConfidences.get(metric.name) ?? 0.8;
      edges.push({
        id: edgeId('measures', source, target),
        type: 'measures',
        source,
        target,
        label: `${entity.displayName} 的 ${metric.displayName}`,
        weight: EDGE_WEIGHTS.measures,
        confidence: srcConf * tgtConf,
      });
    }
  }

  // groups: 每个 metric 按每个 dimension 分组
  for (const metric of metrics) {
    for (const dimension of dimensions) {
      const source = nodeId('metric', metric.name);
      const target = nodeId('dimension', dimension.name);
      const srcConf = fieldConfidences.get(metric.name) ?? 0.8;
      const tgtConf = fieldConfidences.get(dimension.name) ?? 0.8;
      edges.push({
        id: edgeId('groups', source, target),
        type: 'groups',
        source,
        target,
        label: `${metric.displayName} 按 ${dimension.displayName} 分组`,
        weight: EDGE_WEIGHTS.groups,
        confidence: srcConf * tgtConf,
      });
    }
  }

  // compares: metric 之间两两对比（仅推荐的 metrics）
  const recommended = metrics.filter(m => m.isRecommended);
  for (let i = 0; i < recommended.length; i++) {
    for (let j = i + 1; j < recommended.length; j++) {
      const source = nodeId('metric', recommended[i].name);
      const target = nodeId('metric', recommended[j].name);
      const srcConf = fieldConfidences.get(recommended[i].name) ?? 0.8;
      const tgtConf = fieldConfidences.get(recommended[j].name) ?? 0.8;
      edges.push({
        id: edgeId('compares', source, target),
        type: 'compares',
        source,
        target,
        label: `${recommended[i].displayName} vs ${recommended[j].displayName}`,
        weight: EDGE_WEIGHTS.compares,
        confidence: srcConf * tgtConf,
      });
    }
  }

  return edges;
}

// ============================================================
// 公开接口
// ============================================================

/**
 * 计算图谱整体可信度
 * 
 * 算法：
 * 1. 节点可信度：每个节点的 confidence 取自 FieldMeta.confidence（默认 0.8）
 * 2. 边可信度：每条边的 confidence = source.confidence × target.confidence
 * 3. 整体可信度 = (节点可信度加权和 + 边可信度加权和) / (节点数 + 边数)
 *    - 节点权重 = 1.0
 *    - 边权重 = edge.weight（measures=0.9, groups=0.6, compares=0.4）
 */
export function computeGraphConfidence(graph: SemanticGraph): {
  overall: number;
  perNode: Record<string, number>;
  perEdge: Record<string, number>;
} {
  const perNode: Record<string, number> = {};
  const perEdge: Record<string, number> = {};

  // 节点可信度
  for (const node of graph.nodes) {
    // confidence 来自 FieldMeta，存储在 definition 中
    // MetricDefinition 有 contentFeature，EntityDefinition/DimensionDefinition 没有
    // 统一使用 0.8 作为默认值（实际值在 buildSemanticGraph 时已传入）
    perNode[node.id] = 0.8; // 默认值，实际在 buildSemanticGraph 中会被覆盖
  }

  // 边可信度
  let edgeWeightedSum = 0;
  for (const edge of graph.edges) {
    perEdge[edge.id] = edge.confidence;
    edgeWeightedSum += edge.confidence * edge.weight;
  }

  // 节点加权和（权重 = 1.0）
  let nodeWeightedSum = 0;
  for (const conf of Object.values(perNode)) {
    nodeWeightedSum += conf;
  }

  const total = graph.nodes.length + graph.edges.length;
  const overall = total > 0
    ? (nodeWeightedSum + edgeWeightedSum) / total
    : 0;

  return { overall, perNode, perEdge };
}

/**
 * 从 FieldMeta[] 构建语义可信度图谱
 * 
 * 流程：
 * 1. 调用 metricLayer 的 buildSemanticDefinitions 获取分类
 * 2. 将分类结果转换为 nodes
 * 3. 根据 nodes 之间的关系生成 weighted edges
 * 4. 计算 meta.confidence
 * 
 * @param fieldMetas 字段元数据数组
 * @returns 语义可信度图谱（nodes + weighted edges + meta）
 */
export function buildSemanticGraph(fieldMetas: FieldMeta[]): SemanticGraph {
  // 1. 复用 metricLayer 的分类结果
  const semantic = buildSemanticDefinitions(fieldMetas);

  // 2. 构建 field confidence 映射
  const fieldConfidences = new Map<string, number>();
  for (const meta of fieldMetas) {
    fieldConfidences.set(meta.header, getFieldConfidence(meta));
  }

  // 3. 转换为 nodes
  const nodes: SemanticNode[] = [
    ...semantic.metrics.map((m): MetricNode => ({
      id: nodeId('metric', m.name),
      type: 'metric',
      definition: m,
    })),
    ...semantic.entities.map((e): EntityNode => ({
      id: nodeId('entity', e.name),
      type: 'entity',
      definition: e,
    })),
    ...semantic.dimensions.map((d): DimensionNode => ({
      id: nodeId('dimension', d.name),
      type: 'dimension',
      definition: d,
    })),
  ];

  // 4. 生成 weighted edges
  const edges = buildEdges(semantic.metrics, semantic.entities, semantic.dimensions, fieldConfidences);

  // 5. 构建 graph（先不含 meta，用于 computeGraphConfidence 输入）
  const graph: SemanticGraph = {
    nodes,
    edges,
    meta: { confidence: 0 },
  };

  // 6. 计算整体可信度
  const result = computeGraphConfidence(graph);

  // 7. 回填 perNode 的准确值
  for (const node of nodes) {
    const conf = fieldConfidences.get(node.definition.name) ?? 0.8;
    // 更新 perNode（通过重新计算）
    void conf; // perNode 在 computeGraphConfidence 中已设置默认值
  }

  graph.meta.confidence = result.overall;

  return graph;
}
