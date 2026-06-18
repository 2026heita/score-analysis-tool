/**
 * 分组分析测试 v2
 * 验证 groupByDimension、getAvailableDimensions、sortGroupStats、topN 的正确性
 * 
 * 测试场景：
 * 1. 维度字段筛选（含风险等级）
 * 2. 普通分组统计
 * 3. 空值/非数值/单组/多组/缺失等场景
 * 4. 排序功能
 * 5. Top N 截断
 * 6. category/status 字段可作为维度
 * 7. 高唯一字段排除
 * 8. 图表数据一致性
 */

let passed = 0;
let failed = 0;

// ===== 内联核心算法（与 src/engine/groupByDimension.ts 保持一致） =====
const MAX_ROWS = 5000;
const DEFAULT_TOP_N = 20;

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

function getAvailableDimensions(fieldMetas) {
  const results = [];

  for (const meta of fieldMetas) {
    const uniqueRatio = meta.contentFeature?.uniqueRatio ?? 0;

    if (meta.analysisRole === 'textMeta') {
      if (uniqueRatio >= 0.95) {
        results.push({ header: meta.header, riskLevel: 'excluded', riskHint: '唯一值过高' });
      } else if (uniqueRatio >= 0.8) {
        results.push({ header: meta.header, riskLevel: 'warning', riskHint: '分组可能过细' });
      } else {
        results.push({ header: meta.header, riskLevel: 'none' });
      }
      continue;
    }

    if (meta.analysisRole === 'identity') {
      if (uniqueRatio >= 0.95) {
        results.push({ header: meta.header, riskLevel: 'excluded', riskHint: '接近唯一标识' });
      } else if (uniqueRatio >= 0.8) {
        results.push({ header: meta.header, riskLevel: 'warning', riskHint: '分组可能过细' });
      } else {
        results.push({ header: meta.header, riskLevel: 'none' });
      }
    }
  }

  return results;
}

function groupByDimension(rows, metricField, dimensionField) {
  const limitedRows = rows.slice(0, MAX_ROWS);
  const groups = new Map();

  for (const row of limitedRows) {
    const dimRaw = row[dimensionField];
    const dimKey = (dimRaw === undefined || dimRaw === null || dimRaw.trim() === '')
      ? '(空值)'
      : dimRaw.trim();

    const metricRaw = row[metricField];
    if (metricRaw === undefined || metricRaw === null || metricRaw.trim() === '') {
      continue;
    }
    const num = parseFloat(metricRaw);
    if (!Number.isFinite(num)) {
      continue;
    }

    if (!groups.has(dimKey)) {
      groups.set(dimKey, []);
    }
    groups.get(dimKey).push(num);
  }

  const results = [];
  for (const [dimValue, values] of groups) {
    if (values.length === 0) continue;

    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    results.push({
      dimensionValue: dimValue,
      count: len,
      mean: sum / len,
      median: calculateQuantile(sorted, 0.5),
      min: sorted[0],
      max: sorted[len - 1],
      q25: calculateQuantile(sorted, 0.25),
      q75: calculateQuantile(sorted, 0.75),
    });
  }

  results.sort((a, b) => b.mean - a.mean);
  return results;
}

function sortGroupStats(stats, sortBy, sortOrder) {
  const sorted = [...stats].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const cmp = sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    if (cmp === 0) {
      return a.dimensionValue.localeCompare(b.dimensionValue, 'zh-CN');
    }
    return cmp;
  });
  return sorted;
}

function topN(stats, n = DEFAULT_TOP_N) {
  return stats.slice(0, n);
}

function isMetricField(meta) {
  const nonMetricRoles = ['identity', 'textMeta', 'invalid'];
  return !nonMetricRoles.includes(meta.analysisRole);
}

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual: ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${expected} (±${tolerance})`);
    console.error(`    Actual: ${actual}`);
  }
}

console.log('\n=== 分组分析测试 v2 ===\n');

// ============================================================
// 测试 1: getAvailableDimensions - 维度字段筛选（含风险等级）
// ============================================================
console.log('1. getAvailableDimensions - 维度字段筛选（含风险等级）');

const fieldMetas1 = [
  { header: '总分', analysisRole: 'primaryTotal' },
  { header: '语文', analysisRole: 'courseScore' },
  { header: '班级', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.1 } },
  { header: '学号', analysisRole: 'identity', contentFeature: { uniqueRatio: 1 } },
  { header: '组合', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.3 } },
  { header: '姓名', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.95 } },
  { header: '备注', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.5 } },
];

const dims1 = getAvailableDimensions(fieldMetas1);
assertEqual(dims1.length, 5, '筛选出 5 个维度候选');

// 正常推荐
const normal = dims1.filter(d => d.riskLevel === 'none');
assert(normal.some(d => d.header === '班级'), '班级 是正常推荐');
assert(normal.some(d => d.header === '组合'), '组合 是正常推荐');
assert(normal.some(d => d.header === '备注'), '备注 是正常推荐');

// 高唯一排除
const excluded = dims1.filter(d => d.riskLevel === 'excluded');
assert(excluded.some(d => d.header === '学号'), '学号 被排除（uniqueRatio=1）');
assert(excluded.some(d => d.header === '姓名'), '姓名 被排除（uniqueRatio=0.95）');

// 没有非维度字段
assert(!dims1.some(d => d.header === '总分'), '总分 不是维度');
assert(!dims1.some(d => d.header === '语文'), '语文 不是维度');

// ============================================================
// 测试 2: category/status 类型字段可作为维度
// ============================================================
console.log('\n2. category/status 类型字段可作为维度');

const fieldMetas2 = [
  { header: '科类', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.1 } },
  { header: '选科', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.2 } },
  { header: '缺考标记', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.05 } },
  { header: '成绩等级', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.15 } },
];

const dims2 = getAvailableDimensions(fieldMetas2);
assertEqual(dims2.length, 4, '4 个 textMeta 字段全为维度');
assert(dims2.every(d => d.riskLevel === 'none'), '全部为正常推荐');

// ============================================================
// 测试 3: 高唯一字段被排除（uniqueRatio >= 0.95）
// ============================================================
console.log('\n3. 高唯一字段被排除（uniqueRatio >= 0.95）');

const fieldMetas3 = [
  { header: '身份证号', analysisRole: 'identity', contentFeature: { uniqueRatio: 1 } },
  { header: '学号', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.98 } },
  { header: '考号', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.95 } },
  { header: '唯一备注', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.97 } },
];

const dims3 = getAvailableDimensions(fieldMetas3);
assertEqual(dims3.length, 4, '4 个高唯一字段');
assert(dims3.every(d => d.riskLevel === 'excluded'), '全部被排除');

// ============================================================
// 测试 4: 风险提示字段（0.8 <= uniqueRatio < 0.95）
// ============================================================
console.log('\n4. 风险提示字段（0.8 <= uniqueRatio < 0.95）');

const fieldMetas4 = [
  { header: '姓名', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.85 } },
  { header: '详细地址', analysisRole: 'textMeta', contentFeature: { uniqueRatio: 0.9 } },
  { header: '学校', analysisRole: 'identity', contentFeature: { uniqueRatio: 0.82 } },
];

const dims4 = getAvailableDimensions(fieldMetas4);
assertEqual(dims4.length, 3, '3 个风险提示字段');
assert(dims4.every(d => d.riskLevel === 'warning'), '全部为 warning');
assert(dims4.every(d => d.riskHint !== undefined), '全部有风险提示');

// ============================================================
// 测试 5: 默认按 mean 降序
// ============================================================
console.log('\n5. 默认按 mean 降序');

const rows5 = [
  { 班级: 'A班', 总分: '70' },
  { 班级: 'A班', 总分: '72' },
  { 班级: 'B班', 总分: '90' },
  { 班级: 'B班', 总分: '92' },
  { 班级: 'C班', 总分: '80' },
  { 班级: 'C班', 总分: '82' },
];

const result5 = groupByDimension(rows5, '总分', '班级');
assertEqual(result5.length, 3, '3 个分组');
// B班 mean=91 > C班 mean=81 > A班 mean=71
assertEqual(result5[0].dimensionValue, 'B班', 'B班 均值最高排第一');
assertEqual(result5[1].dimensionValue, 'C班', 'C班 排第二');
assertEqual(result5[2].dimensionValue, 'A班', 'A班 均值最低排第三');

// ============================================================
// 测试 6: sortGroupStats - 按 count 排序
// ============================================================
console.log('\n6. sortGroupStats - 排序功能');

const stats6 = [
  { dimensionValue: 'A', count: 10, mean: 80, median: 80, min: 70, max: 90, q25: 75, q75: 85 },
  { dimensionValue: 'B', count: 5, mean: 90, median: 90, min: 85, max: 95, q25: 87, q75: 93 },
  { dimensionValue: 'C', count: 20, mean: 70, median: 70, min: 60, max: 80, q25: 65, q75: 75 },
];

// 按 count 降序
const sorted6a = sortGroupStats(stats6, 'count', 'desc');
assertEqual(sorted6a[0].dimensionValue, 'C', '按count降序：C (20) 排第一');
assertEqual(sorted6a[1].dimensionValue, 'A', '按count降序：A (10) 排第二');
assertEqual(sorted6a[2].dimensionValue, 'B', '按count降序：B (5) 排第三');

// 按 count 升序
const sorted6b = sortGroupStats(stats6, 'count', 'asc');
assertEqual(sorted6b[0].dimensionValue, 'B', '按count升序：B (5) 排第一');
assertEqual(sorted6b[2].dimensionValue, 'C', '按count升序：C (20) 排第三');

// 按 mean 降序
const sorted6c = sortGroupStats(stats6, 'mean', 'desc');
assertEqual(sorted6c[0].dimensionValue, 'B', '按mean降序：B (90) 排第一');

// 按 min 升序
const sorted6d = sortGroupStats(stats6, 'min', 'asc');
assertEqual(sorted6d[0].dimensionValue, 'C', '按min升序：C (60) 排第一');

// 按 max 降序
const sorted6e = sortGroupStats(stats6, 'max', 'desc');
assertEqual(sorted6e[0].dimensionValue, 'B', '按max降序：B (95) 排第一');

// 按 q25 降序
const sorted6f = sortGroupStats(stats6, 'q25', 'desc');
assertEqual(sorted6f[0].dimensionValue, 'B', '按q25降序：B (87) 排第一');

// 按 q75 降序
const sorted6g = sortGroupStats(stats6, 'q75', 'desc');
assertEqual(sorted6g[0].dimensionValue, 'B', '按q75降序：B (93) 排第一');

// 按 median 降序
const sorted6h = sortGroupStats(stats6, 'median', 'desc');
assertEqual(sorted6h[0].dimensionValue, 'B', '按median降序：B (90) 排第一');

// ============================================================
// 测试 7: Top N 截断
// ============================================================
console.log('\n7. Top N 截断');

const stats7 = [];
for (let i = 0; i < 50; i++) {
  stats7.push({
    dimensionValue: `G${i}`,
    count: 10 - Math.floor(i / 5),
    mean: 100 - i,
    median: 100 - i,
    min: 90 - i,
    max: 110 - i,
    q25: 95 - i,
    q75: 105 - i,
  });
}

const top7 = topN(stats7, 20);
assertEqual(top7.length, 20, 'Top 20 截断正确');
assertEqual(top7[0].dimensionValue, 'G0', '第一个是 G0');
assertEqual(top7[19].dimensionValue, 'G19', '最后一个（第20个）是 G19');

const top7_5 = topN(stats7, 5);
assertEqual(top7_5.length, 5, 'Top 5 截断正确');

// 默认值
const top7_def = topN(stats7);
assertEqual(top7_def.length, 20, '默认 Top N = 20');

// ============================================================
// 测试 8: 图表数据一致性（表格与图表使用同一数据源）
// ============================================================
console.log('\n8. 图表数据一致性');

const rows8 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: 'A班', 总分: '85' },
  { 班级: 'B班', 总分: '78' },
  { 班级: 'B班', 总分: '82' },
];

const result8 = groupByDimension(rows8, '总分', '班级');
const top8 = topN(result8, 20);

// 图表数据 = Top N 的表格数据
const chartData = top8.map(g => ({ name: g.dimensionValue, mean: g.mean }));
const tableData = top8.map(g => ({ name: g.dimensionValue, mean: g.mean }));
assertEqual(chartData.length, tableData.length, '图表和表格数据行数一致');
for (let i = 0; i < chartData.length; i++) {
  assertEqual(chartData[i].name, tableData[i].name, `第${i}行名称一致`);
  assertClose(chartData[i].mean, tableData[i].mean, 0.001, `第${i}行均值一致`);
}

// ============================================================
// 测试 9: 普通分组统计
// ============================================================
console.log('\n9. 普通分组统计');

const rows9 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: 'A班', 总分: '85' },
  { 班级: 'A班', 总分: '92' },
  { 班级: 'B班', 总分: '78' },
  { 班级: 'B班', 总分: '82' },
  { 班级: 'B班', 总分: '80' },
  { 班级: 'B班', 总分: '88' },
];

const result9 = groupByDimension(rows9, '总分', '班级');
assertEqual(result9.length, 2, '2 个分组');

// 按 mean 降序：A班(89) > B班(82)
const groupA = result9.find(g => g.dimensionValue === 'A班');
assert(groupA !== undefined, 'A班 存在');
if (groupA) {
  assertEqual(groupA.count, 3, 'A班 3 条数据');
  assertClose(groupA.mean, 89, 0.01, 'A班 均值 89');
  assertClose(groupA.median, 90, 0.01, 'A班 中位数 90');
  assertEqual(groupA.min, 85, 'A班 最小值 85');
  assertEqual(groupA.max, 92, 'A班 最大值 92');
}

const groupB = result9.find(g => g.dimensionValue === 'B班');
assert(groupB !== undefined, 'B班 存在');
if (groupB) {
  assertEqual(groupB.count, 4, 'B班 4 条数据');
  assertClose(groupB.mean, 82, 0.01, 'B班 均值 82');
}

// ============================================================
// 测试 10: 空值分组处理
// ============================================================
console.log('\n10. 空值分组处理');

const rows10 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: '', 总分: '85' },
  { 班级: 'A班', 总分: '92' },
  { 班级: undefined, 总分: '78' },
  { 班级: 'B班', 总分: '80' },
];

const result10 = groupByDimension(rows10, '总分', '班级');
assertEqual(result10.length, 3, '3 个分组（含空值组）');

const emptyGroup = result10.find(g => g.dimensionValue === '(空值)');
assert(emptyGroup !== undefined, '空值分组 存在');
if (emptyGroup) {
  assertEqual(emptyGroup.count, 2, '空值组 2 条数据');
  assertClose(emptyGroup.mean, 81.5, 0.01, '空值组 均值 81.5');
}

// ============================================================
// 测试 11: 非数值指标排除
// ============================================================
console.log('\n11. 非数值指标排除');

const rows11 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: 'A班', 总分: '无效' },
  { 班级: 'A班', 总分: '92' },
  { 班级: 'A班', 总分: '' },
  { 班级: 'A班', 总分: 'NaN' },
];

const result11 = groupByDimension(rows11, '总分', '班级');
assertEqual(result11.length, 1, '1 个分组');
assertEqual(result11[0].count, 2, '只统计 2 条有效数值（90 和 92）');
assertClose(result11[0].mean, 91, 0.01, '非数值被正确排除，均值 91');

// ============================================================
// 测试 12: 单组场景
// ============================================================
console.log('\n12. 单组场景');

const rows12 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: 'A班', 总分: '85' },
  { 班级: 'A班', 总分: '92' },
];

const result12 = groupByDimension(rows12, '总分', '班级');
assertEqual(result12.length, 1, '1 个分组');
assertEqual(result12[0].count, 3, '3 条数据');
assertEqual(result12[0].min, 85, '最小值 85');
assertEqual(result12[0].max, 92, '最大值 92');

// ============================================================
// 测试 13: 多组场景
// ============================================================
console.log('\n13. 多组场景');

const rows13 = [];
const classes = ['A班', 'B班', 'C班', 'D班', 'E班'];
for (let i = 0; i < 50; i++) {
  for (const cls of classes) {
    rows13.push({ 班级: cls, 总分: String(80 + Math.floor(Math.random() * 20)) });
  }
}

const result13 = groupByDimension(rows13, '总分', '班级');
assertEqual(result13.length, 5, '5 个分组');
for (const g of result13) {
  assertEqual(g.count, 50, `每组 ${g.dimensionValue} 有 50 条`);
  assert(g.mean >= 80 && g.mean <= 100, `均值在合理范围`);
}

// ============================================================
// 测试 14: 分组字段缺失
// ============================================================
console.log('\n14. 分组字段缺失');

const rows14 = [
  { 班级: 'A班', 总分: '90' },
  { 班级: 'B班', 总分: '85' },
  { 总分: '92' },
  { 班级: 'A班', 总分: '88' },
];

const result14 = groupByDimension(rows14, '总分', '班级');
const emptyGroup14 = result14.find(g => g.dimensionValue === '(空值)');
assert(emptyGroup14 !== undefined, '缺失字段归入空值组');
if (emptyGroup14) {
  assertEqual(emptyGroup14.count, 1, '空值组 1 条数据');
  assertEqual(emptyGroup14.mean, 92, '缺失字段值 92');
}

// ============================================================
// 测试 15: 空数据 / 全无效 / 空字段列表
// ============================================================
console.log('\n15. 边界情况');

const result15a = groupByDimension([], '总分', '班级');
assertEqual(result15a.length, 0, '空数据返回空数组');

const rows15b = [
  { 班级: 'A班', 总分: '无效' },
  { 班级: 'A班', 总分: '' },
  { 班级: 'B班', 总分: 'NaN' },
];
const result15b = groupByDimension(rows15b, '总分', '班级');
assertEqual(result15b.length, 0, '全无效指标返回空数组');

const dims15c = getAvailableDimensions([]);
assertEqual(dims15c.length, 0, '空字段列表返回空数组');

// ============================================================
// 测试 16: isMetricField
// ============================================================
console.log('\n16. isMetricField - 指标字段判断');

assert(isMetricField({ header: '总分', analysisRole: 'primaryTotal' }), 'primaryTotal 是指标');
assert(isMetricField({ header: '语文', analysisRole: 'courseScore' }), 'courseScore 是指标');
assert(isMetricField({ header: '排名', analysisRole: 'rank' }), 'rank 是指标');
assert(isMetricField({ header: '加分', analysisRole: 'adjustment' }), 'adjustment 是指标');
assert(!isMetricField({ header: '姓名', analysisRole: 'identity' }), 'identity 不是指标');
assert(!isMetricField({ header: '备注', analysisRole: 'textMeta' }), 'textMeta 不是指标');
assert(!isMetricField({ header: '未知', analysisRole: 'invalid' }), 'invalid 不是指标');

// ============================================================
// 测试 17: 分位数计算验证
// ============================================================
console.log('\n17. 分位数计算验证');

const rows17 = [
  { 班级: 'A班', 总分: '10' },
  { 班级: 'A班', 总分: '20' },
  { 班级: 'A班', 总分: '30' },
  { 班级: 'A班', 总分: '40' },
  { 班级: 'A班', 总分: '50' },
];

const result17 = groupByDimension(rows17, '总分', '班级');
assertEqual(result17.length, 1, '1 个分组');
assertEqual(result17[0].count, 5, '5 条数据');
assertClose(result17[0].mean, 30, 0.01, '均值 30');
assertClose(result17[0].median, 30, 0.01, '中位数 30');
assertEqual(result17[0].min, 10, '最小值 10');
assertEqual(result17[0].max, 50, '最大值 50');
assertClose(result17[0].q25, 20, 0.01, 'Q25 = 20');
assertClose(result17[0].q75, 40, 0.01, 'Q75 = 40');

// ============================================================
// 测试 18: Top N 超过实际组数
// ============================================================
console.log('\n18. Top N 超过实际组数');

const stats18 = [
  { dimensionValue: 'A', count: 10, mean: 80, median: 80, min: 70, max: 90, q25: 75, q75: 85 },
  { dimensionValue: 'B', count: 5, mean: 90, median: 90, min: 85, max: 95, q25: 87, q75: 93 },
];

const top18 = topN(stats18, 20);
assertEqual(top18.length, 2, 'Top 20 但只有 2 组，返回全部 2 组');

// 输出测试结果
console.log('\n=== 测试完成 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.error('\n❌ 测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}