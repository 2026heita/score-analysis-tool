/**
 * computeMetric 单元测试
 * 
 * 验证 metric-driven execution 的正确性
 * 由于项目使用 tsc -b + vite 编译，TS 源码不直接可用。
 * 本脚本通过内联核心算法（与 src/engine/analysisEngine.ts 中一致）来验证逻辑正确性。
 */

let passed = 0;
let failed = 0;

// ===== 内联核心算法 =====

// 统一数值解析（与 production 一致）
function parseNumericValueLegacy(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '') return null;

  // 包含逗号时必须通过严格千分位校验
  if (str.includes(',')) {
    const strictThousands = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    if (!strictThousands.test(str)) return null;
  }

  const cleaned = str.replace(/,/g, '');
  const num = Number(cleaned);

  if (isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

function extractFieldValues(rows, fieldName) {
  const MAX_ROWS = 5000;
  const truncatedRows = Math.min(rows.length, MAX_ROWS);
  const limitedRows = rows.slice(0, truncatedRows);
  let invalidCount = 0;
  const values = [];
  for (const row of limitedRows) {
    const raw = row[fieldName];
    if (raw === undefined || raw === null || raw.trim() === '') { invalidCount++; continue; }
    const num = parseNumericValueLegacy(raw);
    if (num !== null) { values.push(num); } else { invalidCount++; }
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

// 新版 computePosition：带 direction 参数（与 analysisEngine.ts 保持一致）
function computePosition(values, inputValue, direction = 'higher-is-better') {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;
  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;

  let percentile;
  if (direction === 'lower-is-better') {
    // lower-is-better: 大于等于该值人数 / 有效人数 * 100
    percentile = total === 0 ? 0 : ((higherCount + equalCount) / total) * 100;
    return { total, higherCount, equalCount, lowerCount, bestRank: lowerCount + 1, worstRank: lowerCount + equalCount, estimatedRank: lowerCount + 1, percentile, existsInData: equalCount > 0 };
  } else {
    // higher-is-better: 小于等于该值人数 / 有效人数 * 100
    percentile = total === 0 ? 0 : ((lowerCount + equalCount) / total) * 100;
    return { total, higherCount, equalCount, lowerCount, bestRank: higherCount + 1, worstRank: higherCount + equalCount, estimatedRank: higherCount + 1, percentile, existsInData: equalCount > 0 };
  }
}

// 新版 computeMetric：从 context 读取 direction
function computeMetric(context, metricName, userValue) {
  const metricDef = context.metrics.find(m => m.name === metricName);
  if (!metricDef) return null;
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(context.rawRows, metricDef.sourceField);
  const stats = computeStats(values, truncatedRows);
  let position;
  if (userValue !== undefined && Number.isFinite(userValue) && values.length > 0) {
    position = computePosition(values, userValue, metricDef.direction);
  }
  return { metricName: metricDef.name, displayName: metricDef.displayName, direction: metricDef.direction, values, invalidCount, totalRows, truncatedRows, stats, position, userValue };
}

// ===== 测试数据 =====

const testMetrics = [
  { name: '总分', type: 'score', direction: 'higher-is-better', displayName: '总分', isRecommended: true, sourceField: '总分' },
  { name: '排名', type: 'rank', direction: 'lower-is-better', displayName: '排名', isRecommended: true, sourceField: '排名' },
];

// 测试数据行：
// 总分: 100, 95, 95, 90, 85, '', 80, 'abc', 75 → 有效值 7 个: [100, 95, 95, 90, 85, 80, 75]
// 排名: 1, 2, 2, 4, 5, 6, '', 8, 9 → 有效值 8 个: [1, 2, 2, 4, 5, 6, 8, 9]
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

// ===== 测试用例 =====

function assert(condition, message) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.log(`  ❌ ${message}`); }
}

console.log('=== computeMetric 单元测试 ===\n');

// 测试 1: higher-is-better 字段（总分）
console.log('测试 1: higher-is-better 字段（总分），输入 95');
const scoreResult = computeMetric(testContext, '总分', 95);
// 有效值: [100, 95, 95, 90, 85, 80, 75]，共 7 个
// 高于 95: 1 人 (100)
// 等于 95: 2 人
// 低于 95: 4 人 (90, 85, 80, 75)
// higher-is-better: 排名 = higherCount + 1 = 2
// 百分位 = (lowerCount + equalCount) / total * 100 = 6/7 * 100 ≈ 85.7%
assert(scoreResult.direction === 'higher-is-better', 'direction 正确');
assert(scoreResult.stats.validCount === 7, `有效数值数量 = 7（实际 ${scoreResult.stats.validCount}）`);
assert(scoreResult.position.bestRank === 2, `排名 = 2（实际 ${scoreResult.position.bestRank}）`);
assert(Math.abs(scoreResult.position.percentile - 85.71) < 0.1, `百分位 ≈ 85.7%（实际 ${scoreResult.position.percentile.toFixed(1)}%）`);
assert(scoreResult.position.existsInData === true, 'existsInData = true');

console.log();

// 测试 2: lower-is-better 字段（排名）
console.log('测试 2: lower-is-better 字段（排名），输入 4');
const rankResult = computeMetric(testContext, '排名', 4);
// 有效值: [1, 2, 2, 4, 5, 6, 8, 9]，共 8 个
// 高于 4: 4 人 (5, 6, 8, 9)
// 等于 4: 1 人
// 低于 4: 3 人 (1, 2, 2)
// lower-is-better: 排名 = lowerCount + 1 = 4
// 百分位 = (higherCount + equalCount) / total * 100 = 5/8 * 100 = 62.5%（反转）
assert(rankResult.direction === 'lower-is-better', 'direction 正确');
assert(rankResult.stats.validCount === 8, `有效数值数量 = 8（实际 ${rankResult.stats.validCount}）`);
assert(rankResult.position.bestRank === 4, `排名 = 4（实际 ${rankResult.position.bestRank}）`);
assert(Math.abs(rankResult.position.percentile - 62.5) < 0.1, `百分位 = 62.5%（实际 ${rankResult.position.percentile.toFixed(1)}%）`);
assert(rankResult.position.existsInData === true, 'existsInData = true');

console.log();

// 测试 3: direction 修改后结果变化
console.log('测试 3: 将排名 direction 改为 higher-is-better，输入 4');
const modifiedMetrics = [{ ...testMetrics[1], direction: 'higher-is-better' }];
const modifiedContext = { fields: [], rawRows: testRows, metrics: modifiedMetrics, dimensions: [] };
const modifiedResult = computeMetric(modifiedContext, '排名', 4);
// 改为 higher-is-better 后：
// 排名 = higherCount + 1 = 4 + 1 = 5
// 百分位 = (lowerCount + equalCount) / total * 100 = 4/8 * 100 = 50.0%
assert(modifiedResult.direction === 'higher-is-better', 'direction 已修改');
assert(modifiedResult.position.bestRank === 5, `排名 = 5（实际 ${modifiedResult.position.bestRank}）`);
assert(Math.abs(modifiedResult.position.percentile - 50.0) < 0.1, `百分位 = 50.0%（实际 ${modifiedResult.position.percentile.toFixed(1)}%）`);
assert(modifiedResult.position.bestRank !== rankResult.position.bestRank, '修改 direction 后排名确实变化了');

console.log();

// 测试 4: 空值不参与计算
console.log('测试 4: 空值和非数值不参与计算');
assert(scoreResult.stats.validCount === 7, `总分有效值 = 7（排除了空值和 abc）`);
assert(scoreResult.stats.invalidCount === 2, `总分无效值 = 2（1 个空值 + 1 个 abc）`);
assert(rankResult.stats.validCount === 8, `排名有效值 = 8（排除了 1 个空值）`);

console.log();

// 测试 5: 相同值的处理
console.log('测试 5: 相同值的处理');
// 总分输入 95，有两个 95
assert(scoreResult.position.equalCount === 2, `等于 95 的人数 = 2（实际 ${scoreResult.position.equalCount}）`);
assert(scoreResult.position.existsInData === true, 'existsInData = true（值存在于数据中）');
// 排名输入 4，只有一个 4
assert(rankResult.position.equalCount === 1, `等于 4 的人数 = 1（实际 ${rankResult.position.equalCount}）`);

console.log();

// 测试 6: 不存在的 metricName
console.log('测试 6: 不存在的 metricName 返回 null');
const nullResult = computeMetric(testContext, '不存在的字段', 100);
assert(nullResult === null, '不存在的 metricName 返回 null');

console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}, 失败: ${failed}, 总计: ${passed + failed}`);
if (failed > 0) { process.exit(1); }
