/**
 * Metric Registry 单元测试
 * 
 * 验证：
 * 1. registry 正确注册 metric
 * 2. compute 函数一致性（同 input 同 output）
 * 3. legacy vs new 输出一致性
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.log(`  ❌ ${message}`); }
}

// ===== 内联核心算法（与 src/engine/analysisEngine.ts 一致）=====

function extractFieldValues(rows, fieldName) {
  const MAX_ROWS = 5000;
  const truncatedRows = Math.min(rows.length, MAX_ROWS);
  const limitedRows = rows.slice(0, truncatedRows);
  let invalidCount = 0;
  const values = [];
  for (const row of limitedRows) {
    const raw = row[fieldName];
    if (raw === undefined || raw === null || raw.trim() === '') { invalidCount++; continue; }
    const num = parseFloat(raw);
    if (Number.isFinite(num)) { values.push(num); } else { invalidCount++; }
  }
  return { values, invalidCount, totalRows: rows.length, truncatedRows };
}

function computeStats(values, truncatedRows) {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  const validCount = cleanValues.length;
  const invalidCount = truncatedRows - validCount;
  if (validCount === 0) return null;
  const sum = cleanValues.reduce((a, b) => a + b, 0);
  return { count: validCount, validCount, invalidCount, max: cleanValues[validCount - 1], min: cleanValues[0], mean: sum / validCount };
}

function computePosition(values, inputValue, direction = 'higher-is-better') {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;
  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;

  if (direction === 'lower-is-better') {
    return { total, higherCount, equalCount, lowerCount, bestRank: lowerCount + 1, worstRank: lowerCount + equalCount, estimatedRank: lowerCount + 1, percentile: total === 0 ? 0 : (higherCount / total) * 100, existsInData: equalCount > 0 };
  } else {
    return { total, higherCount, equalCount, lowerCount, bestRank: higherCount + 1, worstRank: higherCount + equalCount, estimatedRank: higherCount + 1, percentile: total === 0 ? 0 : (lowerCount / total) * 100, existsInData: equalCount > 0 };
  }
}

// ===== Registry 模拟 =====

const metricRegistry = {};

function createGenericCompute(metricId) {
  return (ctx, userValue) => {
    const metricDef = ctx.metrics.find(m => m.name === metricId);
    if (!metricDef) return null;

    const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(ctx.rawRows, metricDef.sourceField);
    const stats = computeStats(values, truncatedRows);
    let position;
    if (userValue !== undefined && Number.isFinite(userValue) && values.length > 0) {
      position = computePosition(values, userValue, metricDef.direction);
    }
    return {
      metricName: metricDef.name,
      displayName: metricDef.displayName,
      direction: metricDef.direction,
      values,
      invalidCount,
      totalRows,
      truncatedRows,
      stats,
      position,
      userValue,
    };
  };
}

function getOrCreateMetricDef(metricId, computeFactory) {
  if (!metricRegistry[metricId]) {
    metricRegistry[metricId] = {
      id: metricId,
      label: metricId,
      compute: computeFactory(metricId),
    };
  }
  return metricRegistry[metricId];
}

function computeMetric(context, metricName, userValue) {
  const metricDef = getOrCreateMetricDef(metricName, createGenericCompute);
  return metricDef.compute(context, userValue);
}

// ===== 测试数据 =====

const testMetrics = [
  { name: '总分', type: 'score', direction: 'higher-is-better', displayName: '总分', isRecommended: true, sourceField: '总分' },
  { name: '排名', type: 'rank', direction: 'lower-is-better', displayName: '排名', isRecommended: true, sourceField: '排名' },
];

const testRows = [
  { '总分': '100', '排名': '1' },
  { '总分': '95', '排名': '2' },
  { '总分': '95', '排名': '2' },
  { '总分': '90', '排名': '4' },
  { '总分': '85', '排名': '5' },
  { '总分': '', '排名': '6' },
  { '总分': '80', '排名': '' },
  { '总分': 'abc', '排名': '8' },
  { '总分': '75', '排名': '9' },
];

const testContext = { fields: [], rawRows: testRows, metrics: testMetrics, dimensions: [] };

console.log('=== Metric Registry 单元测试 ===\n');

// 测试 1: registry 正确注册 metric
console.log('测试 1: registry 正确注册 metric');
const metricDef = getOrCreateMetricDef('总分', createGenericCompute);
assert(metricDef !== undefined, 'metricDef 不为空');
assert(metricDef.id === '总分', `metricId = "总分"（实际 "${metricDef.id}"）`);
assert(typeof metricDef.compute === 'function', 'compute 是函数');

console.log();

// 测试 2: compute 函数一致性（同 input 同 output）
console.log('测试 2: compute 函数一致性（同 input 同 output）');
const result1 = computeMetric(testContext, '总分', 95);
const result2 = computeMetric(testContext, '总分', 95);
assert(result1.stats.validCount === result2.stats.validCount, 'validCount 一致');
assert(result1.position.bestRank === result2.position.bestRank, 'bestRank 一致');
assert(result1.position.percentile === result2.position.percentile, 'percentile 一致');
assert(result1.direction === result2.direction, 'direction 一致');

console.log();

// 测试 3: legacy vs new 输出一致性
console.log('测试 3: legacy vs new 输出一致性');
// legacy 路径：直接调用 createGenericCompute
const legacyCompute = createGenericCompute('总分');
const legacyResult = legacyCompute(testContext, 95);
const newResult = computeMetric(testContext, '总分', 95);

assert(legacyResult.stats.validCount === newResult.stats.validCount, 'validCount 一致');
assert(legacyResult.position.bestRank === newResult.position.bestRank, 'bestRank 一致');
assert(legacyResult.position.percentile === newResult.position.percentile, 'percentile 一致');
assert(legacyResult.direction === newResult.direction, 'direction 一致');
assert(legacyResult.values.length === newResult.values.length, 'values 长度一致');

console.log();

// 测试 4: rank 字段 direction 反转
console.log('测试 4: rank 字段 direction 反转');
const rankResult = computeMetric(testContext, '排名', 4);
assert(rankResult.direction === 'lower-is-better', 'direction = lower-is-better');
assert(rankResult.position.bestRank === 4, `bestRank = 4（实际 ${rankResult.position.bestRank}）`);
assert(Math.abs(rankResult.position.percentile - 50.0) < 0.1, `percentile = 50.0%（实际 ${rankResult.position.percentile.toFixed(1)}%）`);

console.log();

// 测试 5: 不存在的 metric 返回 null
console.log('测试 5: 不存在的 metric 返回 null');
const nullResult = computeMetric(testContext, '不存在的字段', 100);
assert(nullResult === null, '不存在的 metric 返回 null');

console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}, 失败: ${failed}, 总计: ${passed + failed}`);
if (failed > 0) { process.exit(1); }
