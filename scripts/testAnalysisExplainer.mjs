// 分析解释模块测试脚本（内联核心算法）
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

// 内联 calculateQuantile
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

// 内联 calculateStats
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

// 内联 getPerformanceTier
function getPerformanceTier(percentile) {
  if (percentile >= 90) return { tier: 'top10', tierLabel: '前 10%' };
  if (percentile >= 75) return { tier: 'top25', tierLabel: '前 25%' };
  if (percentile >= 25) return { tier: 'middle', tierLabel: '中游' };
  if (percentile >= 10) return { tier: 'bottom25', tierLabel: '后 25%' };
  return { tier: 'bottom10', tierLabel: '后 10%' };
}

// 内联 explainField
function explainField(field, userValue, values, isRankField = false) {
  const cleanValues = values.filter(v => Number.isFinite(v));
  if (cleanValues.length === 0) return null;
  const stats = calculateStats(cleanValues, cleanValues.length);
  if (!stats) return null;
  // 排名字段：数值越小越好，百分位 = 大于等于该值人数 / 有效人数 * 100
  // 普通字段：数值越大越好，百分位 = 小于等于该值人数 / 有效人数 * 100
  const count = isRankField
    ? cleanValues.filter(v => v >= userValue).length
    : cleanValues.filter(v => v <= userValue).length;
  const percentile = (count / cleanValues.length) * 100;
  const lowerCount = isRankField
    ? cleanValues.filter(v => v > userValue).length
    : cleanValues.filter(v => v < userValue).length;
  const { tier, tierLabel } = getPerformanceTier(percentile);
  const p75 = calculateQuantile(cleanValues, 0.75);
  const p90 = calculateQuantile(cleanValues, 0.9);
  const p95 = calculateQuantile(cleanValues, 0.95);
  return {
    field, userValue, mean: stats.mean, lowerCount, percentile, tier, tierLabel,
    diffFromMean: userValue - stats.mean,
    diffFromP75: userValue - p75,
    diffFromP90: userValue - p90,
    diffFromP95: userValue - p95,
    validCount: cleanValues.length,
  };
}

// 内联 summarizeFields
function summarizeFields(explanations) {
  if (explanations.length === 0) {
    return { top3Fields: [], bottom3Fields: [], averagePercentile: 0, fieldCount: 0, insufficientData: true };
  }
  const sorted = [...explanations].sort((a, b) => b.percentile - a.percentile);
  const top3Fields = sorted.slice(0, 3).map(e => ({ field: e.field, percentile: e.percentile }));
  const bottom3Fields = sorted.slice(-3).reverse().map(e => ({ field: e.field, percentile: e.percentile }));
  const averagePercentile = explanations.reduce((sum, e) => sum + e.percentile, 0) / explanations.length;
  const insufficientData = explanations.length < 3;
  return { top3Fields, bottom3Fields, averagePercentile, fieldCount: explanations.length, insufficientData };
}

// 内联 generateExplanation
function generateExplanation(fieldValues, fieldData, rankFields) {
  const fieldExplanations = [];
  for (const [field, userValue] of Object.entries(fieldValues)) {
    const values = fieldData[field];
    if (!values || values.length === 0) continue;
    const isRank = rankFields?.has(field) ?? false;
    const explanation = explainField(field, userValue, values, isRank);
    if (explanation) fieldExplanations.push(explanation);
  }
  const multiFieldSummary = summarizeFields(fieldExplanations);
  return { fieldExplanations, multiFieldSummary };
}

console.log('\n=== 分析解释模块测试 ===\n');

// 测试 1: explainField 基本功能
console.log('测试 1: explainField 基本功能');
const values1 = [60, 65, 70, 75, 80, 85, 90, 95, 100, 105];
const result1 = explainField('数学', 85, values1);
assert(result1 !== null, '返回结果不为空');
assert(result1.field === '数学', '字段名正确');
assert(result1.userValue === 85, '用户值正确');
assert(result1.lowerCount === 5, '超过人数正确（低于85的有5个: 60,65,70,75,80）');
// P(X<=85) = (5 个小于 + 1 个等于 85) / 10 = 60%
assert(result1.percentile === 60, '百分位正确（60%）');
assert(result1.tier === 'middle', '层级正确（中游）');
assert(result1.tierLabel === '中游', '层级标签正确');
assert(Math.abs(result1.mean - 82.5) < 0.01, '平均值正确');
assert(result1.diffFromMean === 2.5, '与平均值差距正确');
assert(result1.validCount === 10, '有效数量正确');

// 测试 2: 分层边界测试
console.log('\n测试 2: 分层边界测试');
const values2 = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// 前10%: 需要 percentile >= 90, 即 lowerCount/10 >= 0.9, lowerCount >= 9
const result2a = explainField('测试', 95, values2);
assert(result2a.percentile >= 90, `前10%: 百分位 ${result2a.percentile} >= 90`);
assert(result2a.tier === 'top10', '前10%: 层级正确');
assert(result2a.tierLabel === '前 10%', '前10%: 标签正确');

// 前25%: 需要 75 <= percentile < 90
const result2b = explainField('测试', 85, values2);
assert(result2b.percentile >= 75 && result2b.percentile < 90, `前25%: 百分位 ${result2b.percentile} 在75-90之间`);
assert(result2b.tier === 'top25', '前25%: 层级正确');

// 中游: 需要 25 <= percentile < 75
const result2c = explainField('测试', 55, values2);
assert(result2c.percentile >= 25 && result2c.percentile < 75, `中游: 百分位 ${result2c.percentile} 在25-75之间`);
assert(result2c.tier === 'middle', '中游: 层级正确');

// 后25%: 需要 10 <= percentile < 25
const result2d = explainField('测试', 15, values2);
assert(result2d.percentile >= 10 && result2d.percentile < 25, `后25%: 百分位 ${result2d.percentile} 在10-25之间`);
assert(result2d.tier === 'bottom25', '后25%: 层级正确');

// 后10%: 需要 percentile < 10
const result2e = explainField('测试', 5, values2);
assert(result2e.percentile < 10, `后10%: 百分位 ${result2e.percentile} < 10`);
assert(result2e.tier === 'bottom10', '后10%: 层级正确');

// 测试 3: 与分位数差距计算
console.log('\n测试 3: 与分位数差距计算');
const values3 = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
const result3 = explainField('测试', 100, values3);
assert(result3 !== null, '返回结果不为空');
assert(typeof result3.diffFromP75 === 'number', '与P75差距为数字');
assert(typeof result3.diffFromP90 === 'number', '与P90差距为数字');
assert(typeof result3.diffFromP95 === 'number', '与P95差距为数字');
assert(result3.diffFromP75 < 0, '100 < P75，差距为负');
assert(result3.diffFromP90 < 0, '100 < P90，差距为负');
assert(result3.diffFromP95 < 0, '100 < P95，差距为负');

// 测试 4: 空值和无效值处理
console.log('\n测试 4: 空值和无效值处理');
const result4a = explainField('测试', 80, []);
assert(result4a === null, '空数组返回null');

const result4b = explainField('测试', 80, [NaN, NaN, NaN]);
assert(result4b === null, '全无效值返回null');

const values4 = [60, 70, NaN, 80, NaN, 90];
const result4c = explainField('测试', 75, values4);
assert(result4c !== null, '混合有效/无效值时返回结果');
assert(result4c.validCount === 4, '有效数量正确（过滤了NaN）');

// 测试 5: summarizeFields 多字段摘要
console.log('\n测试 5: summarizeFields 多字段摘要');
const explanations5 = [
  { field: '数学', userValue: 90, mean: 80, lowerCount: 8, percentile: 80, tier: 'top25', tierLabel: '前 25%', diffFromMean: 10, diffFromP75: 5, diffFromP90: -2, diffFromP95: -5, validCount: 10 },
  { field: '语文', userValue: 85, mean: 78, lowerCount: 7, percentile: 70, tier: 'top25', tierLabel: '前 25%', diffFromMean: 7, diffFromP75: 3, diffFromP90: -4, diffFromP95: -7, validCount: 10 },
  { field: '英语', userValue: 75, mean: 72, lowerCount: 5, percentile: 50, tier: 'middle', tierLabel: '中游', diffFromMean: 3, diffFromP75: -2, diffFromP90: -8, diffFromP95: -12, validCount: 10 },
  { field: '物理', userValue: 65, mean: 70, lowerCount: 3, percentile: 30, tier: 'middle', tierLabel: '中游', diffFromMean: -5, diffFromP75: -10, diffFromP95: -20, validCount: 10 },
  { field: '化学', userValue: 60, mean: 68, lowerCount: 2, percentile: 20, tier: 'bottom25', tierLabel: '后 25%', diffFromMean: -8, diffFromP75: -15, diffFromP95: -25, validCount: 10 },
];

const summary5 = summarizeFields(explanations5);
assert(summary5.fieldCount === 5, '字段数量正确');
assert(summary5.top3Fields.length === 3, '前3字段数量正确');
assert(summary5.bottom3Fields.length === 3, '后3字段数量正确');
assert(summary5.top3Fields[0].field === '数学', '最强字段是数学');
assert(summary5.top3Fields[1].field === '语文', '第二强字段是语文');
assert(summary5.top3Fields[2].field === '英语', '第三强字段是英语');
assert(summary5.bottom3Fields[0].field === '化学', '最弱字段是化学');
assert(summary5.bottom3Fields[1].field === '物理', '第二弱字段是物理');
assert(summary5.bottom3Fields[2].field === '英语', '第三弱字段是英语');
assert(Math.abs(summary5.averagePercentile - 50) < 0.01, '平均百分位正确');
assert(summary5.insufficientData === false, '数据充足（>=3个字段）');

// 测试 6: 字段较少时的提示
console.log('\n测试 6: 字段较少时的提示');
const explanations6 = [
  { field: '数学', userValue: 90, mean: 80, lowerCount: 8, percentile: 80, tier: 'top25', tierLabel: '前 25%', diffFromMean: 10, diffFromP75: 5, diffFromP90: -2, diffFromP95: -5, validCount: 10 },
  { field: '语文', userValue: 85, mean: 78, lowerCount: 7, percentile: 70, tier: 'top25', tierLabel: '前 25%', diffFromMean: 7, diffFromP75: 3, diffFromP90: -4, diffFromP95: -7, validCount: 10 },
];

const summary6 = summarizeFields(explanations6);
assert(summary6.fieldCount === 2, '字段数量正确');
assert(summary6.insufficientData === true, '数据不足（<3个字段）');

// 测试 7: generateExplanation 完整流程
console.log('\n测试 7: generateExplanation 完整流程');
const fieldValues7 = { '数学': 90, '语文': 85, '英语': 75 };
const fieldData7 = {
  '数学': [60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
  '语文': [55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
  '英语': [50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
};

const explanation7 = generateExplanation(fieldValues7, fieldData7);
assert(explanation7.fieldExplanations.length === 3, '生成了3个字段的解释');
assert(explanation7.multiFieldSummary.fieldCount === 3, '多字段摘要字段数量正确');
assert(explanation7.multiFieldSummary.insufficientData === false, '数据充足');

// 测试 8: 空输入处理
console.log('\n测试 8: 空输入处理');
const explanation8 = generateExplanation({}, {});
assert(explanation8.fieldExplanations.length === 0, '空输入返回空解释数组');
assert(explanation8.multiFieldSummary.fieldCount === 0, '空输入字段数量为0');
assert(explanation8.multiFieldSummary.insufficientData === true, '空输入数据不足');

// 测试 9: 部分字段缺失数据
console.log('\n测试 9: 部分字段缺失数据');
const fieldValues9 = { '数学': 90, '语文': 85, '英语': 75 };
const fieldData9 = {
  '数学': [60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
  '语文': [],
  '英语': [50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
};

const explanation9 = generateExplanation(fieldValues9, fieldData9);
assert(explanation9.fieldExplanations.length === 2, '只生成了2个字段的解释（语文被跳过）');
assert(explanation9.fieldExplanations.find(e => e.field === '数学') !== undefined, '数学解释存在');
assert(explanation9.fieldExplanations.find(e => e.field === '英语') !== undefined, '英语解释存在');
assert(explanation9.fieldExplanations.find(e => e.field === '语文') === undefined, '语文解释不存在');

// 测试 10: 排名字段方向反转
console.log('\n测试 10: 排名字段方向反转');
const rankValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 排名数据，1最好，10最差

// 普通字段逻辑：85分在 [60,65,70,75,80,85,90,95,100,105] 中超过5人（60,65,70,75,80）
const scoreResult = explainField('数学', 85, [60, 65, 70, 75, 80, 85, 90, 95, 100, 105], false);
assert(scoreResult.lowerCount === 5, '普通字段：85分超过5人（比85小的有5个）');
// P(X<=85) = (5 个小于 + 1 个等于 85) / 10 = 60%
assert(scoreResult.percentile === 60, '普通字段：百分位60%');

// 排名字段逻辑：排名5在 [1,2,3,4,5,6,7,8,9,10] 中超过5人（6,7,8,9,10）
const rankResult = explainField('排名', 5, rankValues, true);
assert(rankResult.lowerCount === 5, '排名字段：排名5超过5人（比5大的有5个：6,7,8,9,10）');
// P(X>=5) = (5 个大于 + 1 个等于 5) / 10 = 60%
assert(rankResult.percentile === 60, '排名字段：百分位60%');

// 排名1（最好）应该超过9人
const rank1Result = explainField('排名', 1, rankValues, true);
assert(rank1Result.lowerCount === 9, '排名字段：排名1超过9人');
// P(X>=1) = 10 / 10 = 100%
assert(rank1Result.percentile === 100, '排名字段：排名1百分位100%');
assert(rank1Result.tier === 'top10', '排名字段：排名1属于前10%');

// 排名10（最差）应该超过0人
const rank10Result = explainField('排名', 10, rankValues, true);
assert(rank10Result.lowerCount === 0, '排名字段：排名10超过0人');
// P(X>=10) = 只有自身 1 个 / 10 = 10%
assert(rank10Result.percentile === 10, '排名字段：排名10百分位10%');
assert(rank10Result.tier === 'bottom25', '排名字段：排名10属于后25%（10% 落在 10-25 区间）');

// 测试 11: generateExplanation 传入 rankFields 参数
console.log('\n测试 11: generateExplanation 传入 rankFields 参数');
const fieldValues11 = { '数学': 85, '排名': 5 };
const fieldData11 = {
  '数学': [60, 65, 70, 75, 80, 85, 90, 95, 100, 105],
  '排名': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};
const rankFields11 = new Set(['排名']);

const explanation11 = generateExplanation(fieldValues11, fieldData11, rankFields11);
assert(explanation11.fieldExplanations.length === 2, '生成了2个字段的解释');

const mathExp = explanation11.fieldExplanations.find(e => e.field === '数学');
const rankExp = explanation11.fieldExplanations.find(e => e.field === '排名');
assert(mathExp !== undefined, '数学解释存在');
assert(rankExp !== undefined, '排名解释存在');
assert(mathExp.lowerCount === 5, '数学：85分超过5人');
assert(rankExp.lowerCount === 5, '排名：排名5超过5人（方向反转）');
// P(X<=85)=60%；P(X>=5)=60%
assert(mathExp.percentile === 60, '数学：百分位60%');
assert(rankExp.percentile === 60, '排名：百分位60%');

console.log(`\n=== 测试完成 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
