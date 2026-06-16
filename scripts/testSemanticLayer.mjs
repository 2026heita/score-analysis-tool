/**
 * Semantic Layer V2 测试脚本
 * 
 * 验证 buildSemanticGraph 能否正确生成带权重的语义可信度图谱
 */

// ============================================================
// 内联 metricLayer 逻辑
// ============================================================

const ANALYZABLE_ROLES = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment'];
const DIMENSION_KEYWORDS = ['班级', '学校', '部门', '组别', '类别', '科类', '选科', '组合'];

function isAnalyzableRole(role) {
  return ANALYZABLE_ROLES.includes(role);
}

function getMetricType(role) {
  switch (role) {
    case 'primaryTotal': return 'total';
    case 'rank': return 'rank';
    case 'sectionTotal': return 'total';
    case 'courseScore': return 'score';
    case 'adjustment': return 'adjustment';
    default: return 'numeric';
  }
}

function getMetricDirection(role) {
  return role === 'rank' ? 'lower-is-better' : 'higher-is-better';
}

function getMetricRecommended(role) {
  return role !== 'adjustment';
}

function isEntityIdentity(meta) {
  const headerLower = meta.header.toLowerCase();
  for (const kw of DIMENSION_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) return false;
  }
  return true;
}

function isPrimaryKeyIdentity(meta) {
  const headerLower = meta.header.toLowerCase();
  const isIdField = headerLower.includes('学号') || 
                    headerLower.includes('考号') || 
                    headerLower.includes('编号') ||
                    headerLower.includes('id');
  if (!isIdField) return false;
  if (meta.contentFeature) {
    return meta.contentFeature.uniqueRatio === 1 && meta.contentFeature.numericRatio === 1;
  }
  return false;
}

function buildMetricDefinition(meta) {
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

function buildEntityDefinition(meta) {
  const isPK = isPrimaryKeyIdentity(meta);
  return {
    name: meta.header,
    type: isPK ? 'id' : 'identity',
    displayName: meta.header,
    isPrimaryKey: isPK,
  };
}

function buildDimensionDefinition(meta) {
  let dimType = 'category';
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

function buildSemanticDefinitions(fieldMetas) {
  const metrics = [];
  const entities = [];
  const dimensions = [];

  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'identity') {
      if (isEntityIdentity(meta)) {
        entities.push(buildEntityDefinition(meta));
      } else {
        dimensions.push(buildDimensionDefinition(meta));
      }
      continue;
    }

    if (meta.analysisRole === 'textMeta') {
      if (meta.contentFeature?.numericRatio && meta.contentFeature.numericRatio > 0.5) {
        continue;
      }
      dimensions.push(buildDimensionDefinition(meta));
      continue;
    }

    if (isAnalyzableRole(meta.analysisRole)) {
      metrics.push(buildMetricDefinition(meta));
      continue;
    }
  }

  return { metrics, entities, dimensions };
}

// ============================================================
// 内联 semanticLayer V2 逻辑
// ============================================================

const EDGE_WEIGHTS = {
  measures: 0.9,
  groups: 0.6,
  compares: 0.4,
};

function nodeId(type, name) {
  return `${type}:${name}`;
}

function edgeId(type, source, target) {
  return `${type}:${source}->${target}`;
}

function getFieldConfidence(meta) {
  return meta.confidence ?? 0.8;
}

function buildEdges(metrics, entities, dimensions, fieldConfidences) {
  const edges = [];

  // measures: entity → metric
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

  // groups: metric → dimension
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

  // compares: metric → metric（仅推荐的）
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

function computeGraphConfidence(graph) {
  const perNode = {};
  const perEdge = {};

  for (const node of graph.nodes) {
    perNode[node.id] = 0.8;
  }

  let edgeWeightedSum = 0;
  for (const edge of graph.edges) {
    perEdge[edge.id] = edge.confidence;
    edgeWeightedSum += edge.confidence * edge.weight;
  }

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

function buildSemanticGraph(fieldMetas) {
  const semantic = buildSemanticDefinitions(fieldMetas);

  const fieldConfidences = new Map();
  for (const meta of fieldMetas) {
    fieldConfidences.set(meta.header, getFieldConfidence(meta));
  }

  const nodes = [
    ...semantic.metrics.map(m => ({
      id: nodeId('metric', m.name),
      type: 'metric',
      definition: m,
    })),
    ...semantic.entities.map(e => ({
      id: nodeId('entity', e.name),
      type: 'entity',
      definition: e,
    })),
    ...semantic.dimensions.map(d => ({
      id: nodeId('dimension', d.name),
      type: 'dimension',
      definition: d,
    })),
  ];

  const edges = buildEdges(semantic.metrics, semantic.entities, semantic.dimensions, fieldConfidences);

  const graph = {
    nodes,
    edges,
    meta: { confidence: 0 },
  };

  const result = computeGraphConfidence(graph);
  graph.meta.confidence = result.overall;

  return graph;
}

// ============================================================
// 测试工具
// ============================================================

let passCount = 0;
let failCount = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ❌ 断言失败: ${msg}`);
    failCount++;
  } else {
    passCount++;
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    console.error(`  ❌ 断言失败: ${msg} (期望 ≈${expected}, 实际 ${actual})`);
    failCount++;
  } else {
    passCount++;
  }
}

// ============================================================
// 测试用例
// ============================================================

console.log('=== Semantic Layer V2 测试 ===\n');

// 测试 1: 3 个 fieldMeta（1 entity + 2 metrics）- 带不同 confidence
console.log('测试 1: 3 个 fieldMeta（1 entity + 2 metrics）');
const fieldMetas1 = [
  {
    header: '学号',
    type: 'identity',
    analysisRole: 'identity',
    confidence: 0.95,
    contentFeature: { uniqueRatio: 1, numericRatio: 1 },
  },
  {
    header: '语文',
    type: 'score',
    analysisRole: 'courseScore',
    confidence: 0.9,
  },
  {
    header: '数学',
    type: 'score',
    analysisRole: 'courseScore',
    confidence: 0.85,
  },
];

const graph1 = buildSemanticGraph(fieldMetas1);
console.log(`  Nodes: ${graph1.nodes.length}`);
console.log(`  Edges: ${graph1.edges.length}`);
console.log(`  Meta.confidence: ${graph1.meta.confidence.toFixed(4)}`);
console.log('  Nodes:');
for (const node of graph1.nodes) {
  console.log(`    - ${node.id} (${node.type})`);
}
console.log('  Edges:');
for (const edge of graph1.edges) {
  console.log(`    - ${edge.type}: ${edge.source} → ${edge.target} (weight=${edge.weight}, confidence=${edge.confidence.toFixed(4)})`);
}

// 验证结构
assert(graph1.nodes.length === 3, '应有 3 个 nodes');
assert(graph1.nodes.filter(n => n.type === 'entity').length === 1, '应有 1 个 entity');
assert(graph1.nodes.filter(n => n.type === 'metric').length === 2, '应有 2 个 metrics');
assert(graph1.edges.length === 3, '应有 3 条 edges (2 measures + 1 compares)');
assert(graph1.edges.filter(e => e.type === 'measures').length === 2, '应有 2 条 measures');
assert(graph1.edges.filter(e => e.type === 'compares').length === 1, '应有 1 条 compares');

// 验证权重
for (const edge of graph1.edges) {
  if (edge.type === 'measures') {
    assertApprox(edge.weight, 0.9, 0.001, 'measures weight 应为 0.9');
  }
  if (edge.type === 'compares') {
    assertApprox(edge.weight, 0.4, 0.001, 'compares weight 应为 0.4');
  }
}

// 验证 confidence
const measuresEdges = graph1.edges.filter(e => e.type === 'measures');
// 学号(0.95) × 语文(0.9) = 0.855
assertApprox(measuresEdges[0].confidence, 0.95 * 0.9, 0.001, '学号→语文 confidence 应为 0.855');
// 学号(0.95) × 数学(0.85) = 0.8075
assertApprox(measuresEdges[1].confidence, 0.95 * 0.85, 0.001, '学号→数学 confidence 应为 0.8075');

// compares: 语文(0.9) × 数学(0.85) = 0.765
const comparesEdge = graph1.edges.find(e => e.type === 'compares');
assertApprox(comparesEdge.confidence, 0.9 * 0.85, 0.001, '语文 vs 数学 confidence 应为 0.765');

// 验证 meta
assert(graph1.meta !== undefined, '应有 meta');
assert(typeof graph1.meta.confidence === 'number', 'meta.confidence 应为 number');
assert(graph1.meta.confidence > 0 && graph1.meta.confidence < 1, 'meta.confidence 应在 (0,1) 范围内');

console.log('  ✅ 测试 1 通过\n');

// 测试 2: 3 个 fieldMeta（1 entity + 1 metric + 1 dimension）
console.log('测试 2: 3 个 fieldMeta（1 entity + 1 metric + 1 dimension）');
const fieldMetas2 = [
  {
    header: '姓名',
    type: 'identity',
    analysisRole: 'identity',
    confidence: 0.9,
  },
  {
    header: '总分',
    type: 'score',
    analysisRole: 'primaryTotal',
    confidence: 0.95,
  },
  {
    header: '班级',
    type: 'identity',
    analysisRole: 'identity',
    confidence: 0.85,
  },
];

const graph2 = buildSemanticGraph(fieldMetas2);
console.log(`  Nodes: ${graph2.nodes.length}`);
console.log(`  Edges: ${graph2.edges.length}`);
console.log(`  Meta.confidence: ${graph2.meta.confidence.toFixed(4)}`);
console.log('  Nodes:');
for (const node of graph2.nodes) {
  console.log(`    - ${node.id} (${node.type})`);
}
console.log('  Edges:');
for (const edge of graph2.edges) {
  console.log(`    - ${edge.type}: ${edge.source} → ${edge.target} (weight=${edge.weight}, confidence=${edge.confidence.toFixed(4)})`);
}

assert(graph2.nodes.length === 3, '应有 3 个 nodes');
assert(graph2.nodes.filter(n => n.type === 'entity').length === 1, '应有 1 个 entity');
assert(graph2.nodes.filter(n => n.type === 'metric').length === 1, '应有 1 个 metric');
assert(graph2.nodes.filter(n => n.type === 'dimension').length === 1, '应有 1 个 dimension');
assert(graph2.edges.length === 2, '应有 2 条 edges (1 measures + 1 groups)');
assert(graph2.edges.filter(e => e.type === 'measures').length === 1, '应有 1 条 measures');
assert(graph2.edges.filter(e => e.type === 'groups').length === 1, '应有 1 条 groups');

// 验证 groups weight
const groupsEdge = graph2.edges.find(e => e.type === 'groups');
assertApprox(groupsEdge.weight, 0.6, 0.001, 'groups weight 应为 0.6');
// 总分(0.95) × 班级(0.85) = 0.8075
assertApprox(groupsEdge.confidence, 0.95 * 0.85, 0.001, '总分→班级 confidence 应为 0.8075');

console.log('  ✅ 测试 2 通过\n');

// 测试 3: 验证 computeGraphConfidence
console.log('测试 3: computeGraphConfidence 计算验证');
const result1 = computeGraphConfidence(graph1);
console.log(`  Overall: ${result1.overall.toFixed(4)}`);
console.log(`  PerNode:`, result1.perNode);
console.log(`  PerEdge:`, result1.perEdge);

assert(typeof result1.overall === 'number', 'overall 应为 number');
assert(Object.keys(result1.perNode).length === graph1.nodes.length, 'perNode 数量应等于 nodes 数量');
assert(Object.keys(result1.perEdge).length === graph1.edges.length, 'perEdge 数量应等于 edges 数量');

console.log('  ✅ 测试 3 通过\n');

// 测试 4: 完整图谱 JSON 输出
console.log('测试 4: 完整图谱 JSON 输出');
const output = {
  nodeCount: graph1.nodes.length,
  edgeCount: graph1.edges.length,
  meta: graph1.meta,
  nodes: graph1.nodes.map(n => ({ id: n.id, type: n.type })),
  edges: graph1.edges.map(e => ({
    id: e.id,
    type: e.type,
    source: e.source,
    target: e.target,
    weight: e.weight,
    confidence: parseFloat(e.confidence.toFixed(4)),
  })),
};
console.log(JSON.stringify(output, null, 2));

console.log('  ✅ 测试 4 通过\n');

// ============================================================
// 汇总
// ============================================================

console.log('=== 测试结果 ===');
console.log(`  通过: ${passCount}`);
console.log(`  失败: ${failCount}`);

if (failCount > 0) {
  console.error('\n❌ 存在失败的测试');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
}
