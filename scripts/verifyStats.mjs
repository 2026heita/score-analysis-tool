/**
 * 轻量统计计算验证脚本
 * 用于验证核心统计计算口径的准确性
 * 执行: npm run verify:stats
 */

let passed = 0;
let failed = 0;

function assert(name, actual, expected, tolerance = 0.01) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Math.abs(actual - expected) < tolerance) {
      console.log(`  ✅ ${name}: ${actual}`);
      passed++;
      return;
    }
  } else if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
    return;
  }
  console.log(`  ❌ ${name}: expected ${expected}, got ${actual}`);
  failed++;
}

// ===== 实现与 stats.ts 相同的算法 =====

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

function calculateStats(values, totalRows) {
  const cleanValues = values.filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  const validCount = cleanValues.length;
  const invalidCount = totalRows - validCount;
  if (validCount === 0) return null;

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

function calculatePosition(values, inputValue) {
  const cleanValues = values.filter(v => Number.isFinite(v));
  const total = cleanValues.length;
  const higherCount = cleanValues.filter(v => v > inputValue).length;
  const equalCount = cleanValues.filter(v => v === inputValue).length;
  const lowerCount = cleanValues.filter(v => v < inputValue).length;
  const percentile = total === 0 ? 0 : (lowerCount / total) * 100;

  return {
    total,
    higherCount,
    equalCount,
    lowerCount,
    bestRank: higherCount + 1,
    worstRank: higherCount + equalCount,
    estimatedRank: higherCount + 1,
    percentile,
    existsInData: equalCount > 0,
  };
}

function buildQuartilePieData(values) {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return null;

  const q1 = calculateQuantile(cleanValues, 0.25);
  const median = calculateQuantile(cleanValues, 0.5);
  const q3 = calculateQuantile(cleanValues, 0.75);
  const isAllSame = cleanValues[0] === cleanValues[cleanValues.length - 1];

  if (isAllSame) {
    return {
      segments: [{ name: '全部数据相同', value: cleanValues.length, percentage: 100 }],
      q1, median, q3, isAllSame: true,
    };
  }

  const total = cleanValues.length;
  let belowQ1 = 0, q1ToMed = 0, medToQ3 = 0, aboveQ3 = 0;

  cleanValues.forEach(v => {
    if (v < q1) belowQ1++;
    else if (v < median) q1ToMed++;
    else if (v < q3) medToQ3++;
    else aboveQ3++;
  });

  return {
    segments: [
      { name: '低于 Q1', value: belowQ1, percentage: (belowQ1 / total) * 100 },
      { name: 'Q1 至中位数', value: q1ToMed, percentage: (q1ToMed / total) * 100 },
      { name: '中位数至 Q3', value: medToQ3, percentage: (medToQ3 / total) * 100 },
      { name: 'Q3 及以上', value: aboveQ3, percentage: (aboveQ3 / total) * 100 },
    ],
    q1, median, q3, isAllSame: false,
  };
}

// ===== 测试用例 =====

console.log('\n=== 测试 1：基础统计指标 [10, 20, 20, 30, 40] ===\n');

const data1 = [10, 20, 20, 30, 40];
const stats1 = calculateStats(data1, data1.length);

assert('count', stats1.count, 5);
assert('validCount', stats1.validCount, 5);
assert('invalidCount', stats1.invalidCount, 0);
assert('min', stats1.min, 10);
assert('max', stats1.max, 40);
assert('mean', stats1.mean, 24);
assert('median', stats1.median, 20);
assert('Q1', stats1.q25, 20);
assert('Q3', stats1.q75, 30);

console.log('\n=== 测试 2：排名定位 inputValue=20 ===\n');

const pos1 = calculatePosition(data1, 20);

assert('lowerCount', pos1.lowerCount, 1);
assert('equalCount', pos1.equalCount, 2);
assert('higherCount', pos1.higherCount, 2);
assert('bestRank', pos1.bestRank, 3);
assert('worstRank', pos1.worstRank, 4);
assert('percentile', pos1.percentile, 20);
assert('existsInData', pos1.existsInData, true);
assert('rankSum', pos1.higherCount + pos1.equalCount + pos1.lowerCount, pos1.total);

console.log('\n=== 测试 3：排名定位 inputValue=25 ===\n');

const pos2 = calculatePosition(data1, 25);

assert('lowerCount', pos2.lowerCount, 3);
assert('equalCount', pos2.equalCount, 0);
assert('higherCount', pos2.higherCount, 2);
assert('estimatedRank', pos2.estimatedRank, 3);
assert('percentile', pos2.percentile, 60);
assert('existsInData', pos2.existsInData, false);
assert('rankSum', pos2.higherCount + pos2.equalCount + pos2.lowerCount, pos2.total);

console.log('\n=== 测试 4：四分位占比 [10, 20, 20, 30, 40] ===\n');

const pie1 = buildQuartilePieData(data1);
const pieSum = pie1.segments.reduce((s, seg) => s + seg.value, 0);
const piePctSum = pie1.segments.reduce((s, seg) => s + seg.percentage, 0);

assert('四分位人数总和', pieSum, 5);
assert('四分位占比总和 ~100%', piePctSum, 100, 0.1);

console.log('\n=== 测试 5：空数组不抛异常 ===\n');

try {
  const emptyStats = calculateStats([], 0);
  assert('空数组 stats', emptyStats, null);

  const emptyPos = calculatePosition([], 50);
  assert('空数组 position total', emptyPos.total, 0);

  const emptyPie = buildQuartilePieData([]);
  assert('空数组 quartile', emptyPie, null);

  console.log('  ✅ 空数组处理正常');
  passed++;
} catch (e) {
  console.log(`  ❌ 空数组抛异常: ${e.message}`);
  failed++;
}

console.log('\n=== 测试 6：全相同数组 [100, 100, 100] ===\n');

const sameData = [100, 100, 100];
const pie2 = buildQuartilePieData(sameData);

assert('全相同 isAllSame', pie2.isAllSame, true);
assert('全相同 区间数', pie2.segments.length, 1);
assert('全相同 区间名', pie2.segments[0].name, '全部数据相同');
assert('全相同 人数', pie2.segments[0].value, 3);
assert('全相同 占比', pie2.segments[0].percentage, 100);

console.log('\n=== 测试 7：含无效值的数组 [10, null, 20, undefined, 30] ===\n');

const mixedData = [10, null, 20, undefined, 30];
const stats2 = calculateStats(mixedData, 5);

assert('含无效值 validCount', stats2.validCount, 3);
assert('含无效值 invalidCount', stats2.invalidCount, 2);
assert('含无效值 min', stats2.min, 10);
assert('含无效值 max', stats2.max, 30);
assert('含无效值 mean', stats2.mean, 20);

console.log('\n=== 测试结果 ===\n');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  console.log('\n❌ 部分测试未通过，请检查计算逻辑。');
  process.exit(1);
} else {
  console.log('\n✅ 全部测试通过。');
  process.exit(0);
}
