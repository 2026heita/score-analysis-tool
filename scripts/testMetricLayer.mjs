/**
 * Metric Layer v0 测试脚本
 * 验证 buildSemanticDefinitions 的映射规则
 */

// 内联 FieldMeta 类型定义（避免 TypeScript 导入问题）
/**
 * @typedef {Object} FieldMeta
 * @property {string} header
 * @property {string} type
 * @property {string} analysisRole
 * @property {number} validCount
 * @property {number} emptyCount
 * @property {number} invalidCount
 * @property {number} textCount
 * @property {number} confidence
 * @property {string} reason
 * @property {Object} [contentFeature]
 */

// 内联 metricLayer 实现
const ANALYZABLE_ROLES = ['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment'];

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

const ENTITY_KEYWORDS = ['学号', '考号', '编号', 'ID', '姓名', '学生姓名', '考生号', '准考证'];
const DIMENSION_KEYWORDS = ['班级', '学校', '部门', '组别', '类别', '科类', '选科', '组合'];

function isEntityIdentity(meta) {
  const headerLower = meta.header.toLowerCase();
  for (const kw of DIMENSION_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return false;
    }
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
// 测试用例
// ============================================================

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${expected}`);
    console.log(`    Actual: ${actual}`);
    failed++;
  }
}

function assertTrue(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

console.log('=== Metric Layer v0 测试 ===\n');

// 测试 1: primaryTotal 映射
console.log('1. primaryTotal → Metric (total, higher-is-better, recommended)');
{
  const fieldMetas = [
    {
      header: '总分',
      type: 'score',
      analysisRole: 'primaryTotal',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.95,
      reason: '字段名包含"总分"',
      contentFeature: { min: 400, max: 750, mean: 580, numericRatio: 1, uniqueRatio: 0.8, integerRatio: 1, decimalRatio: 0, avgStringLength: 3, valuePattern: 'scoreLike' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.metrics.length, 1, 'metrics 数量 = 1');
  assertEqual(result.metrics[0].type, 'total', 'type = total');
  assertEqual(result.metrics[0].direction, 'higher-is-better', 'direction = higher-is-better');
  assertEqual(result.metrics[0].isRecommended, true, 'isRecommended = true');
}

// 测试 2: rank 映射
console.log('\n2. rank → Metric (rank, lower-is-better, recommended)');
{
  const fieldMetas = [
    {
      header: '年级名次',
      type: 'rank',
      analysisRole: 'rank',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.9,
      reason: '字段名包含"名次"',
      contentFeature: { min: 1, max: 100, mean: 50, numericRatio: 1, uniqueRatio: 1, integerRatio: 1, decimalRatio: 0, avgStringLength: 2, valuePattern: 'rankLike' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.metrics.length, 1, 'metrics 数量 = 1');
  assertEqual(result.metrics[0].type, 'rank', 'type = rank');
  assertEqual(result.metrics[0].direction, 'lower-is-better', 'direction = lower-is-better');
  assertEqual(result.metrics[0].isRecommended, true, 'isRecommended = true');
}

// 测试 3: courseScore 映射
console.log('\n3. courseScore → Metric (score, higher-is-better, recommended)');
{
  const fieldMetas = [
    {
      header: '数学',
      type: 'score',
      analysisRole: 'courseScore',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.9,
      reason: '字段名包含课程名',
      contentFeature: { min: 60, max: 150, mean: 105, numericRatio: 1, uniqueRatio: 0.5, integerRatio: 1, decimalRatio: 0, avgStringLength: 2, valuePattern: 'scoreLike' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.metrics.length, 1, 'metrics 数量 = 1');
  assertEqual(result.metrics[0].type, 'score', 'type = score');
  assertEqual(result.metrics[0].direction, 'higher-is-better', 'direction = higher-is-better');
  assertEqual(result.metrics[0].isRecommended, true, 'isRecommended = true');
}

// 测试 4: adjustment 映射
console.log('\n4. adjustment → Metric (adjustment, higher-is-better, NOT recommended)');
{
  const fieldMetas = [
    {
      header: '政策加分',
      type: 'bonus',
      analysisRole: 'adjustment',
      validCount: 20,
      emptyCount: 80,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.85,
      reason: '字段名包含"加分"',
      contentFeature: { min: 0, max: 20, mean: 5, numericRatio: 0.2, uniqueRatio: 0.3, integerRatio: 1, decimalRatio: 0, avgStringLength: 1, valuePattern: 'scoreLike' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.metrics.length, 1, 'metrics 数量 = 1');
  assertEqual(result.metrics[0].type, 'adjustment', 'type = adjustment');
  assertEqual(result.metrics[0].direction, 'higher-is-better', 'direction = higher-is-better');
  assertEqual(result.metrics[0].isRecommended, false, 'isRecommended = false');
}

// 测试 5: identity (学号) → Entity (id, primary key)
console.log('\n5. identity (学号) → Entity (id, primary key)');
{
  const fieldMetas = [
    {
      header: '学号',
      type: 'identity',
      analysisRole: 'identity',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.95,
      reason: '字段名包含"学号"',
      contentFeature: { min: 10001, max: 10100, mean: 10050, numericRatio: 1, uniqueRatio: 1, integerRatio: 1, decimalRatio: 0, avgStringLength: 5, valuePattern: 'longNumber' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.entities.length, 1, 'entities 数量 = 1');
  assertEqual(result.entities[0].type, 'id', 'type = id');
  assertEqual(result.entities[0].isPrimaryKey, true, 'isPrimaryKey = true');
  assertEqual(result.dimensions.length, 0, 'dimensions 数量 = 0');
}

// 测试 6: identity (姓名) → Entity (identity, not primary key)
console.log('\n6. identity (姓名) → Entity (identity, not primary key)');
{
  const fieldMetas = [
    {
      header: '姓名',
      type: 'identity',
      analysisRole: 'identity',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.95,
      reason: '字段名包含"姓名"',
      contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.8, integerRatio: 0, decimalRatio: 0, avgStringLength: 3, valuePattern: 'chineseName' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.entities.length, 1, 'entities 数量 = 1');
  assertEqual(result.entities[0].type, 'identity', 'type = identity');
  assertEqual(result.entities[0].isPrimaryKey, false, 'isPrimaryKey = false');
}

// 测试 7: identity (班级) → Dimension (group)
console.log('\n7. identity (班级) → Dimension (group)');
{
  const fieldMetas = [
    {
      header: '班级',
      type: 'identity',
      analysisRole: 'identity',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.9,
      reason: '字段名包含"班级"',
      contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.05, integerRatio: 0, decimalRatio: 0, avgStringLength: 4, valuePattern: 'classLabel' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.entities.length, 0, 'entities 数量 = 0');
  assertEqual(result.dimensions.length, 1, 'dimensions 数量 = 1');
  assertEqual(result.dimensions[0].type, 'group', 'type = group');
}

// 测试 8: textMeta → Dimension
console.log('\n8. textMeta → Dimension');
{
  const fieldMetas = [
    {
      header: '组合',
      type: 'text',
      analysisRole: 'textMeta',
      validCount: 100,
      emptyCount: 0,
      invalidCount: 0,
      textCount: 100,
      confidence: 0.85,
      reason: '字段名包含"组合"',
      contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.1, integerRatio: 0, decimalRatio: 0, avgStringLength: 6, valuePattern: 'mixed' }
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.dimensions.length, 1, 'dimensions 数量 = 1');
  assertEqual(result.dimensions[0].type, 'category', 'type = category');
}

// 测试 9: unknown/invalid → 忽略
console.log('\n9. unknown/invalid → 忽略');
{
  const fieldMetas = [
    {
      header: '未命名字段',
      type: 'unknown',
      analysisRole: 'invalid',
      validCount: 0,
      emptyCount: 100,
      invalidCount: 0,
      textCount: 0,
      confidence: 0.5,
      reason: '字段名无法识别',
    }
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  assertEqual(result.metrics.length, 0, 'metrics 数量 = 0');
  assertEqual(result.entities.length, 0, 'entities 数量 = 0');
  assertEqual(result.dimensions.length, 0, 'dimensions 数量 = 0');
}

// 测试 10: 综合测试
console.log('\n10. 综合测试：多种字段类型混合');
{
  const fieldMetas = [
    { header: '学号', type: 'identity', analysisRole: 'identity', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.95, reason: '学号', contentFeature: { min: 10001, max: 10100, mean: 10050, numericRatio: 1, uniqueRatio: 1, integerRatio: 1, decimalRatio: 0, avgStringLength: 5, valuePattern: 'longNumber' } },
    { header: '姓名', type: 'identity', analysisRole: 'identity', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.95, reason: '姓名', contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.8, integerRatio: 0, decimalRatio: 0, avgStringLength: 3, valuePattern: 'chineseName' } },
    { header: '班级', type: 'identity', analysisRole: 'identity', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.9, reason: '班级', contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.05, integerRatio: 0, decimalRatio: 0, avgStringLength: 4, valuePattern: 'classLabel' } },
    { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.95, reason: '总分', contentFeature: { min: 400, max: 750, mean: 580, numericRatio: 1, uniqueRatio: 0.8, integerRatio: 1, decimalRatio: 0, avgStringLength: 3, valuePattern: 'scoreLike' } },
    { header: '年级名次', type: 'rank', analysisRole: 'rank', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.9, reason: '名次', contentFeature: { min: 1, max: 100, mean: 50, numericRatio: 1, uniqueRatio: 1, integerRatio: 1, decimalRatio: 0, avgStringLength: 2, valuePattern: 'rankLike' } },
    { header: '数学', type: 'score', analysisRole: 'courseScore', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 0, confidence: 0.9, reason: '课程', contentFeature: { min: 60, max: 150, mean: 105, numericRatio: 1, uniqueRatio: 0.5, integerRatio: 1, decimalRatio: 0, avgStringLength: 2, valuePattern: 'scoreLike' } },
    { header: '政策加分', type: 'bonus', analysisRole: 'adjustment', validCount: 20, emptyCount: 80, invalidCount: 0, textCount: 0, confidence: 0.85, reason: '加分', contentFeature: { min: 0, max: 20, mean: 5, numericRatio: 0.2, uniqueRatio: 0.3, integerRatio: 1, decimalRatio: 0, avgStringLength: 1, valuePattern: 'scoreLike' } },
    { header: '组合', type: 'text', analysisRole: 'textMeta', validCount: 100, emptyCount: 0, invalidCount: 0, textCount: 100, confidence: 0.85, reason: '组合', contentFeature: { min: null, max: null, mean: null, numericRatio: 0, uniqueRatio: 0.1, integerRatio: 0, decimalRatio: 0, avgStringLength: 6, valuePattern: 'mixed' } },
  ];
  const result = buildSemanticDefinitions(fieldMetas);
  
  assertEqual(result.metrics.length, 4, 'metrics 数量 = 4 (总分 + 名次 + 数学 + 加分)');
  assertEqual(result.entities.length, 2, 'entities 数量 = 2 (学号 + 姓名)');
  assertEqual(result.dimensions.length, 2, 'dimensions 数量 = 2 (班级 + 组合)');
  
  // 验证 rank 方向
  const rankMetric = result.metrics.find(m => m.name === '年级名次');
  assertTrue(rankMetric && rankMetric.direction === 'lower-is-better', '年级名次 direction = lower-is-better');
  
  // 验证 adjustment 不推荐
  const adjustmentMetric = result.metrics.find(m => m.name === '政策加分');
  assertTrue(adjustmentMetric && adjustmentMetric.isRecommended === false, '政策加分 isRecommended = false');
  
  // 验证主键
  const primaryKey = result.entities.find(e => e.isPrimaryKey);
  assertTrue(primaryKey && primaryKey.name === '学号', '学号是主键');
}

// 输出结果
console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ 所有测试通过');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败');
  process.exit(1);
}
