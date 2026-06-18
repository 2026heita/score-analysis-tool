/**
 * v1.2 核心计算回归测试
 * 
 * 覆盖：
 * 1. rank 字段 lower-is-better 方向反转
 * 2. 普通分数字段 higher-is-better
 * 3. 百分位计算边界：空数组、单值、全相等、重复值
 * 4. 缺失值、空字符串、非法数字、NaN
 * 5. 5000 行截断后的 stats 和 position 行为
 * 6. 用户输入值不在原始数据中时的 estimatedRank / percentile 表现
 * 
 * 说明：本脚本内联核心算法（与 src/engine/analysisEngine.ts 一致），
 * 用于验证算法逻辑正确性，不依赖 TS 编译产物。
 */

let passed = 0;
let failed = 0;

// ===== 内联核心算法（与 analysisEngine.ts 完全一致） =====

const MAX_ROWS = 5000;

function extractFieldValues(rows, fieldName) {
  const totalRows = rows.length;
  const truncatedRows = Math.min(totalRows, MAX_ROWS);
  const limitedRows = rows.slice(0, truncatedRows);

  let invalidCount = 0;
  const values = [];

  for (const row of limitedRows) {
    const raw = row[fieldName];
    if (raw === undefined || raw === null || raw.trim() === '') {
      invalidCount++;
      continue;
    }
    const num = parseFloat(raw);
    if (Number.isFinite(num)) {
      values.push(num);
    } else {
      invalidCount++;
    }
  }

  return { values, invalidCount, totalRows, truncatedRows };
}

function calculateQuantile(values, q) {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return 0;
  const pos = (cleanValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (cleanValues[base + 1] !== undefined) {
    return cleanValues[base] + rest * (cleanValues[base + 1] - cleanValues[base]);
  }
  return cleanValues[base];
}

function computeStats(values, totalRows) {
  const cleanValues = values
    .filter(v => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);

  const validCount = cleanValues.length;
  const invalidCount = totalRows - validCount;

  if (validCount === 0) {
    return null;
  }

  const sum = cleanValues.reduce((acc, v) => acc + v, 0);
  const mean = sum / validCount;

  return {
    count: validCount,
    validCount,
    invalidCount,
    max: cleanValues[validCount - 1],
    min: cleanValues[0],
    mean,
    median: calculateQuantile(cleanValues, 0.5),
    q25: calculateQuantile(cleanValues, 0.25),
    q75: calculateQuantile(cleanValues, 0.75),
    q90: calculateQuantile(cleanValues, 0.9),
    q95: calculateQuantile(cleanValues, 0.95),
  };
}

function computePosition(values, inputValue, direction = 'higher-is-better') {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;

  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;

  let bestRank, worstRank, estimatedRank, percentile;

  if (direction === 'lower-is-better') {
    // rank 字段：数值越小越好
    bestRank = lowerCount + 1;
    worstRank = lowerCount + equalCount;
    estimatedRank = lowerCount + 1;
    percentile = total === 0 ? 0 : (higherCount / total) * 100;
  } else {
    // 普通字段：数值越大越好
    bestRank = higherCount + 1;
    worstRank = higherCount + equalCount;
    estimatedRank = higherCount + 1;
    percentile = total === 0 ? 0 : (lowerCount / total) * 100;
  }

  return {
    total,
    higherCount,
    equalCount,
    lowerCount,
    bestRank,
    worstRank,
    estimatedRank,
    percentile,
    existsInData: equalCount > 0,
  };
}

function computeMetric(context, metricName, userValue) {
  const metricDef = context.metrics.find(m => m.name === metricName);
  if (!metricDef) return null;

  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(
    context.rawRows,
    metricDef.sourceField
  );

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
}

// ===== 断言工具 =====

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${expected}`);
    console.log(`    Actual:   ${actual}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${expected} (±${tolerance})`);
    console.log(`    Actual:   ${actual}`);
  }
}

function assertNotNull(value, message) {
  if (value !== null && value !== undefined) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message} (got null/undefined)`);
  }
}

// ===== 测试数据构建 =====

function makeContext(rows, metrics) {
  return { fields: [], rawRows: rows, metrics, dimensions: [] };
}

function makeMetric(name, sourceField, direction) {
  return {
    name,
    displayName: name,
    direction,
    isRecommended: true,
    sourceField,
    type: direction === 'lower-is-better' ? 'rank' : 'score',
  };
}

console.log('=== v1.2 核心计算回归测试 ===\n');

// ================================================================
// 测试组 1: direction 方向正确性
// ================================================================
console.log('【测试组 1】direction 方向正确性\n');

// --- 1.1: 普通分数字段 higher-is-better ---
console.log('1.1 普通分数字段 higher-is-better');
{
  // 数据: 100, 90, 80, 70, 60
  const rows = [
    { score: '100' }, { score: '90' }, { score: '80' },
    { score: '70' }, { score: '60' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 80);

  // 高于 80: 2 人 (90, 100) → 排名 = 3
  // 低于 80: 2 人 (60, 70) → 百分位 = 2/5 * 100 = 40%
  assertEqual(result.position.bestRank, 3, '排名 = 3');
  assertEqual(result.position.worstRank, 3, '无同分，最差排名 = 3');
  assertClose(result.position.percentile, 40, 0.01, '百分位 = 40%');
  assert(result.position.existsInData, 'existsInData = true');
  assertEqual(result.position.higherCount, 2, '高于 80 的有 2 人');
  assertEqual(result.position.lowerCount, 2, '低于 80 的有 2 人');
  assertEqual(result.position.equalCount, 1, '等于 80 的有 1 人');
}

// --- 1.2: rank 字段 lower-is-better 方向反转 ---
console.log('\n1.2 rank 字段 lower-is-better 方向反转');
{
  // 排名: 1(最好), 2, 3, 4, 5(最差)
  const rows = [
    { rank: '1' }, { rank: '2' }, { rank: '3' },
    { rank: '4' }, { rank: '5' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 3);

  // lower-is-better: 越小越好
  // 低于 3: 2 人 (1, 2) → 排名 = 3
  // 高于 3: 2 人 (4, 5) → 百分位 = 2/5 * 100 = 40%（反转）
  assertEqual(result.direction, 'lower-is-better', 'direction = lower-is-better');
  assertEqual(result.position.bestRank, 3, '排名 = 3');
  assertEqual(result.position.worstRank, 3, '无同分，最差排名 = 3');
  assertClose(result.position.percentile, 40, 0.01, '百分位 = 40%（反转后）');
  assert(result.position.existsInData, 'existsInData = true');
  assertEqual(result.position.higherCount, 2, '高于 3 的有 2 人（排名更差）');
  assertEqual(result.position.lowerCount, 2, '低于 3 的有 2 人（排名更好）');
}

// --- 1.3: rank 字段方向反转与普通字段对比 ---
console.log('\n1.3 rank 字段方向反转与普通字段对比');
{
  const rows = [
    { val: '1' }, { val: '2' }, { val: '3' },
    { val: '4' }, { val: '5' },
  ];

  // 普通字段 higher-is-better：输入 3 → 排名 = 3, 百分位 = 40%
  const ctxHi = makeContext(rows, [makeMetric('val', 'val', 'higher-is-better')]);
  const rHi = computeMetric(ctxHi, 'val', 3);
  assertClose(rHi.position.percentile, 40, 0.01, 'higher-is-better: 百分位 = 40%');

  // rank 字段 lower-is-better：输入 3 → 排名 = 3, 百分位 = 40%
  const ctxLo = makeContext(rows, [makeMetric('val', 'val', 'lower-is-better')]);
  const rLo = computeMetric(ctxLo, 'val', 3);
  assertClose(rLo.position.percentile, 40, 0.01, 'lower-is-better: 百分位 = 40%');
  assertEqual(rLo.position.bestRank, 3, 'lower-is-better: 排名 = 3');

  // 两种方向在对称数据下结果相同（因为 3 正好在中间）
  assertClose(rHi.position.percentile, rLo.position.percentile, 0.01, '对称数据下两方向百分位一致');
}

// --- 1.4: rank 字段方向反转，输入值不在数据中 ---
console.log('\n1.4 rank 字段方向反转，输入值不在数据中');
{
  const rows = [
    { rank: '1' }, { rank: '2' }, { rank: '3' },
    { rank: '4' }, { rank: '5' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 2.5);

  // lower-is-better: 输入 2.5（不在数据中）
  // 高于 2.5: 3 人 (3, 4, 5) → 百分位 = 3/5 * 100 = 60%
  // 低于 2.5: 2 人 (1, 2) → 排名 = 3
  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 3, 'estimatedRank = 3');
  assertClose(result.position.percentile, 60, 0.01, '百分位 = 60%');
}

// ================================================================
// 测试组 2: 百分位计算边界
// ================================================================
console.log('\n【测试组 2】百分位计算边界\n');

// --- 2.1: 空数组 ---
console.log('2.1 空数组');
{
  const rows = [];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 80);
  assertNotNull(result, '返回结果不为 null');
  assertEqual(result.values.length, 0, 'values 为空');
  assertEqual(result.stats, null, 'stats 为 null');
  assertEqual(result.position, undefined, 'position 为 undefined（无有效值）');
}

// --- 2.2: 单值 ---
console.log('\n2.2 单值');
{
  const rows = [{ score: '85' }];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 85);

  assertEqual(result.stats.validCount, 1, '有效值 = 1');
  assertEqual(result.stats.min, 85, 'min = 85');
  assertEqual(result.stats.max, 85, 'max = 85');
  assertClose(result.stats.mean, 85, 0.01, 'mean = 85');
  assertClose(result.stats.median, 85, 0.01, 'median = 85');

  // 高于 85: 0 人 → 排名 = 1
  // 低于 85: 0 人 → 百分位 = 0%
  assertEqual(result.position.bestRank, 1, '排名 = 1');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%');
  assert(result.position.existsInData, 'existsInData = true');
}

// --- 2.3: 全相等 ---
console.log('\n2.3 全相等');
{
  const rows = [
    { score: '90' }, { score: '90' }, { score: '90' },
    { score: '90' }, { score: '90' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.position.bestRank, 1, '排名 = 1');
  assertEqual(result.position.worstRank, 5, '最差排名 = 5（全部同分）');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%（无低于）');
  assertEqual(result.position.equalCount, 5, '等于 90 的有 5 人');
  assertEqual(result.position.higherCount, 0, '高于 90 的有 0 人');
  assertEqual(result.position.lowerCount, 0, '低于 90 的有 0 人');
  assert(result.position.existsInData, 'existsInData = true');
}

// --- 2.4: 全相等 rank 字段 lower-is-better ---
console.log('\n2.4 全相等 rank 字段 lower-is-better');
{
  const rows = [
    { rank: '3' }, { rank: '3' }, { rank: '3' },
    { rank: '3' }, { rank: '3' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 3);

  assertEqual(result.position.bestRank, 1, '排名 = 1');
  assertEqual(result.position.worstRank, 5, '最差排名 = 5');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%（无高于）');
  assertEqual(result.position.equalCount, 5, '等于 3 的有 5 人');
}

// --- 2.5: 重复值（部分相等）---
console.log('\n2.5 重复值（部分相等）');
{
  const rows = [
    { score: '100' }, { score: '95' }, { score: '95' },
    { score: '90' }, { score: '85' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 95);

  assertEqual(result.position.higherCount, 1, '高于 95 的有 1 人 (100)');
  assertEqual(result.position.equalCount, 2, '等于 95 的有 2 人');
  assertEqual(result.position.lowerCount, 2, '低于 95 的有 2 人');
  assertEqual(result.position.bestRank, 2, '最佳排名 = 2');
  assertEqual(result.position.worstRank, 3, '最差排名 = 3');
  assertClose(result.position.percentile, 40, 0.01, '百分位 = 40%');
}

// --- 2.6: 重复值 rank 字段 lower-is-better ---
console.log('\n2.6 重复值 rank 字段 lower-is-better');
{
  const rows = [
    { rank: '1' }, { rank: '2' }, { rank: '2' },
    { rank: '4' }, { rank: '5' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 2);

  assertEqual(result.position.lowerCount, 1, '低于 2 的有 1 人 (1)');
  assertEqual(result.position.equalCount, 2, '等于 2 的有 2 人');
  assertEqual(result.position.higherCount, 2, '高于 2 的有 2 人 (4, 5)');
  assertEqual(result.position.bestRank, 2, '最佳排名 = 2');
  assertEqual(result.position.worstRank, 3, '最差排名 = 3');
  assertClose(result.position.percentile, 40, 0.01, '百分位 = 40%');
}

// ================================================================
// 测试组 3: 缺失值、空字符串、非法数字、NaN
// ================================================================
console.log('\n【测试组 3】缺失值、空字符串、非法数字、NaN\n');

// --- 3.1: 空字符串 ---
console.log('3.1 空字符串');
{
  const rows = [
    { score: '90' }, { score: '' }, { score: '85' },
    { score: '' }, { score: '95' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.stats.validCount, 3, '有效值 = 3');
  assertEqual(result.stats.invalidCount, 2, '无效值 = 2');
  assertEqual(result.position.total, 3, 'position.total = 3');
}

// --- 3.2: 非法数字字符串 ---
console.log('\n3.2 非法数字字符串');
{
  const rows = [
    { score: '90' }, { score: 'abc' }, { score: '85' },
    { score: 'N/A' }, { score: '95' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.stats.validCount, 3, '有效值 = 3（排除 abc 和 N/A）');
  assertEqual(result.stats.invalidCount, 2, '无效值 = 2');
}

// --- 3.3: NaN 字符串 ---
console.log('\n3.3 NaN 字符串');
{
  const rows = [
    { score: '90' }, { score: 'NaN' }, { score: '85' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.stats.validCount, 2, '有效值 = 2（排除 NaN）');
  assertEqual(result.stats.invalidCount, 1, '无效值 = 1');
}

// --- 3.4: undefined 值 ---
console.log('\n3.4 undefined 值');
{
  const rows = [
    { score: '90' }, { name: 'Alice' }, { score: '85' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.stats.validCount, 2, '有效值 = 2（排除 undefined）');
  assertEqual(result.stats.invalidCount, 1, '无效值 = 1');
}

// --- 3.5: 混合无效值 ---
console.log('\n3.5 混合无效值');
{
  const rows = [
    { score: '100' }, { score: '' }, { score: '95' },
    { score: 'abc' }, { score: undefined }, { score: 'NaN' },
    { score: '80' }, { score: null },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.stats.validCount, 3, '有效值 = 3');
  assertEqual(result.stats.invalidCount, 5, '无效值 = 5');
  assertClose(result.stats.mean, (100 + 95 + 80) / 3, 0.01, '均值正确');
}

// --- 3.6: 0 值有效 ---
console.log('\n3.6 0 值有效');
{
  const rows = [
    { score: '0' }, { score: '10' }, { score: '20' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 0);

  assertEqual(result.stats.validCount, 3, '0 值被正确识别');
  assertEqual(result.stats.min, 0, 'min = 0');
  assertEqual(result.position.bestRank, 3, '排名 = 3（最高 2 人高于 0）');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%');
}

// --- 3.7: 负数有效 ---
console.log('\n3.7 负数有效');
{
  const rows = [
    { score: '-10' }, { score: '0' }, { score: '10' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 0);

  assertEqual(result.stats.validCount, 3, '负数被正确识别');
  assertEqual(result.stats.min, -10, 'min = -10');
  assertEqual(result.position.bestRank, 2, '排名 = 2');
  assertClose(result.position.percentile, 100 / 3, 0.1, '百分位 = 33.3%');
}

// --- 3.8: 全部无效值 ---
console.log('\n3.8 全部无效值');
{
  const rows = [
    { score: '' }, { score: 'abc' }, { score: undefined },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 90);

  assertEqual(result.values.length, 0, '有效值 = 0');
  assertEqual(result.stats, null, 'stats 为 null');
  assertEqual(result.position, undefined, 'position 为 undefined');
}

// ================================================================
// 测试组 4: 5000 行截断行为
// ================================================================
console.log('\n【测试组 4】5000 行截断行为\n');

// --- 4.1: 小于 5000 行不截断 ---
console.log('4.1 小于 5000 行不截断');
{
  const rows = [];
  for (let i = 0; i < 100; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 50);

  assertEqual(result.totalRows, 100, 'totalRows = 100');
  assertEqual(result.truncatedRows, 100, 'truncatedRows = 100');
  assertEqual(result.values.length, 100, 'values.length = 100');
}

// --- 4.2: 恰好 5000 行不截断 ---
console.log('\n4.2 恰好 5000 行不截断');
{
  const rows = [];
  for (let i = 0; i < 5000; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 2500);

  assertEqual(result.totalRows, 5000, 'totalRows = 5000');
  assertEqual(result.truncatedRows, 5000, 'truncatedRows = 5000');
  assertEqual(result.values.length, 5000, 'values.length = 5000');
}

// --- 4.3: 超过 5000 行截断到 5000 ---
console.log('\n4.3 超过 5000 行截断到 5000');
{
  const rows = [];
  for (let i = 0; i < 6000; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 3000);

  assertEqual(result.totalRows, 6000, 'totalRows = 6000');
  assertEqual(result.truncatedRows, 5000, 'truncatedRows = 5000');
  assertEqual(result.values.length, 5000, 'values.length = 5000（截断后）');
}

// --- 4.4: 截断后的 stats 基于前 5000 行 ---
console.log('\n4.4 截断后的 stats 基于前 5000 行');
{
  const rows = [];
  // 前 5000 行: 0~4999
  for (let i = 0; i < 5000; i++) {
    rows.push({ score: String(i) });
  }
  // 后 1000 行: 5000~5999（被截断）
  for (let i = 5000; i < 6000; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 2500);

  // stats 只基于前 5000 行
  assertEqual(result.stats.validCount, 5000, '有效值 = 5000');
  assertEqual(result.stats.min, 0, 'min = 0');
  assertEqual(result.stats.max, 4999, 'max = 4999（不含后 1000 行）');
  assertClose(result.stats.mean, 2499.5, 0.1, 'mean = 2499.5');
}

// --- 4.5: 截断后的 position 基于前 5000 行 ---
console.log('\n4.5 截断后的 position 基于前 5000 行');
{
  const rows = [];
  for (let i = 0; i < 5000; i++) {
    rows.push({ score: String(i) });
  }
  for (let i = 5000; i < 6000; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 4000);

  // 前 5000 行中：高于 4000 的有 999 行 (4001~4999)
  assertEqual(result.position.higherCount, 999, '高于 4000 的有 999 人');
  assertEqual(result.position.lowerCount, 4000, '低于 4000 的有 4000 人');
  assertEqual(result.position.total, 5000, 'position.total = 5000');
  assertClose(result.position.percentile, 80, 0.1, '百分位 = 80%');
}

// ================================================================
// 测试组 5: 用户输入值不在原始数据中
// ================================================================
console.log('\n【测试组 5】用户输入值不在原始数据中\n');

// --- 5.1: 输入值高于所有数据 ---
console.log('5.1 输入值高于所有数据');
{
  const rows = [
    { score: '100' }, { score: '90' }, { score: '80' },
    { score: '70' }, { score: '60' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 120);

  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 1, 'estimatedRank = 1');
  assertClose(result.position.percentile, 100, 0.01, '百分位 = 100%');
  assertEqual(result.position.higherCount, 0, '高于 120 的有 0 人');
  assertEqual(result.position.lowerCount, 5, '低于 120 的有 5 人');
}

// --- 5.2: 输入值低于所有数据 ---
console.log('\n5.2 输入值低于所有数据');
{
  const rows = [
    { score: '100' }, { score: '90' }, { score: '80' },
    { score: '70' }, { score: '60' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 50);

  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 6, 'estimatedRank = 6');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%');
  assertEqual(result.position.higherCount, 5, '高于 50 的有 5 人');
  assertEqual(result.position.lowerCount, 0, '低于 50 的有 0 人');
}

// --- 5.3: 输入值在数据范围内但不存在 ---
console.log('\n5.3 输入值在数据范围内但不存在');
{
  const rows = [
    { score: '100' }, { score: '90' }, { score: '80' },
    { score: '70' }, { score: '60' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 85);

  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 3, 'estimatedRank = 3');
  assertEqual(result.position.higherCount, 2, '高于 85 的有 2 人 (90, 100)');
  assertEqual(result.position.lowerCount, 3, '低于 85 的有 3 人 (60, 70, 80)');
  assertClose(result.position.percentile, 60, 0.01, '百分位 = 60%');
}

// --- 5.4: rank 字段输入值超出范围 ---
console.log('\n5.4 rank 字段输入值超出范围');
{
  const rows = [
    { rank: '1' }, { rank: '2' }, { rank: '3' },
    { rank: '4' }, { rank: '5' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 0.5);

  // lower-is-better: 越小越好
  // 高于 0.5: 5 人 → 百分位 = 5/5 * 100 = 100%
  // 低于 0.5: 0 人 → 排名 = 1
  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 1, 'estimatedRank = 1');
  assertClose(result.position.percentile, 100, 0.01, '百分位 = 100%');
}

// --- 5.5: rank 字段输入值超出范围（另一端）---
console.log('\n5.5 rank 字段输入值超出范围（另一端）');
{
  const rows = [
    { rank: '1' }, { rank: '2' }, { rank: '3' },
    { rank: '4' }, { rank: '5' },
  ];
  const ctx = makeContext(rows, [makeMetric('rank', 'rank', 'lower-is-better')]);
  const result = computeMetric(ctx, 'rank', 10);

  // lower-is-better: 越小越好
  // 高于 10: 0 人 → 百分位 = 0%
  // 低于 10: 5 人 → 排名 = 6
  assert(!result.position.existsInData, 'existsInData = false');
  assertEqual(result.position.estimatedRank, 6, 'estimatedRank = 6');
  assertClose(result.position.percentile, 0, 0.01, '百分位 = 0%');
}

// ================================================================
// 测试组 6: stats 边界情况
// ================================================================
console.log('\n【测试组 6】stats 边界情况\n');

// --- 6.1: 大数值精度 ---
console.log('6.1 大数值精度');
{
  const rows = [
    { score: '999999' }, { score: '1000000' }, { score: '1000001' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 1000000);

  assertClose(result.stats.mean, 1000000, 0.01, 'mean = 1000000');
  assertEqual(result.stats.validCount, 3, 'validCount = 3');
  assert(result.position.existsInData, 'existsInData = true');
}

// --- 6.2: 小数值精度 ---
console.log('\n6.2 小数值精度');
{
  const rows = [
    { score: '0.001' }, { score: '0.002' }, { score: '0.003' },
  ];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 0.002);

  assertClose(result.stats.mean, 0.002, 0.0001, 'mean = 0.002');
  assert(result.position.existsInData, '小数值也能正确匹配');
}

// --- 6.3: 中位数偶数和奇数个 ---
console.log('\n6.3 中位数偶数和奇数个');
{
  // 偶数个
  const rowsEven = [
    { score: '10' }, { score: '20' }, { score: '30' }, { score: '40' },
  ];
  const ctxEven = makeContext(rowsEven, [makeMetric('score', 'score', 'higher-is-better')]);
  const resultEven = computeMetric(ctxEven, 'score', 25);
  // 中位数 = (20 + 30) / 2 = 25
  assertClose(resultEven.stats.median, 25, 0.01, '偶数个中位数 = 25');

  // 奇数个
  const rowsOdd = [
    { score: '10' }, { score: '20' }, { score: '30' },
  ];
  const ctxOdd = makeContext(rowsOdd, [makeMetric('score', 'score', 'higher-is-better')]);
  const resultOdd = computeMetric(ctxOdd, 'score', 20);
  assertClose(resultOdd.stats.median, 20, 0.01, '奇数个中位数 = 20');
}

// --- 6.4: q25/q75/q90/q95 分位数 ---
console.log('\n6.4 q25/q75/q90/q95 分位数');
{
  const rows = [];
  for (let i = 1; i <= 100; i++) {
    rows.push({ score: String(i) });
  }
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', 50);

  // 100 个值，sorted: 1..100
  // q25: pos = (100-1)*0.25 = 24.75 → base=24, rest=0.75 → sorted[24]=25, sorted[25]=26 → 25 + 0.75*1 = 25.75
  // 实际上: index 从 0 开始，sorted[24] = 25, sorted[25] = 26
  assertClose(result.stats.q25, 25.75, 0.1, 'q25 = 25.75');
  // q75: pos = (100-1)*0.75 = 74.25 → sorted[74]=75, sorted[75]=76 → 75.25
  assertClose(result.stats.q75, 75.25, 0.1, 'q75 = 75.25');
  // q90: pos = (100-1)*0.9 = 89.1 → sorted[89]=90, sorted[90]=91 → 90.1
  assertClose(result.stats.q90, 90.1, 0.1, 'q90 = 90.1');
  // q95: pos = (100-1)*0.95 = 94.05 → sorted[94]=95, sorted[95]=96 → 95.05
  assertClose(result.stats.q95, 95.05, 0.1, 'q95 = 95.05');
}

// ================================================================
// 测试组 7: 不存在的 metricName
// ================================================================
console.log('\n【测试组 7】不存在的 metricName\n');

console.log('7.1 不存在的 metricName 返回 null');
{
  const rows = [{ score: '90' }];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'nonexistent', 90);
  assertEqual(result, null, '返回 null');
}

// ================================================================
// 测试组 8: userValue 为 NaN 或 undefined
// ================================================================
console.log('\n【测试组 8】userValue 为 NaN 或 undefined\n');

console.log('8.1 userValue 为 NaN');
{
  const rows = [{ score: '90' }, { score: '85' }];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', NaN);

  assertNotNull(result.stats, 'stats 存在');
  assertEqual(result.position, undefined, 'position 为 undefined（NaN 不参与计算）');
}

console.log('\n8.2 userValue 为 undefined');
{
  const rows = [{ score: '90' }, { score: '85' }];
  const ctx = makeContext(rows, [makeMetric('score', 'score', 'higher-is-better')]);
  const result = computeMetric(ctx, 'score', undefined);

  assertNotNull(result.stats, 'stats 存在');
  assertEqual(result.position, undefined, 'position 为 undefined');
  assertEqual(result.userValue, undefined, 'userValue 为 undefined');
}

// ================================================================
// 输出结果
// ================================================================
console.log('\n' + '='.repeat(50));
console.log(`测试完成: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ 所有回归测试通过');
  process.exit(0);
}