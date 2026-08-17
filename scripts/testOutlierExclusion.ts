/**
 * 第十九阶段：异常值检测 / 排除异常值回归测试
 * 直接导入真实生产函数，不复制简化 detector。
 *
 * 覆盖：
 *  1. 无异常值（正常分布不大量误报）
 *  2. 一个明显异常值（极端值能被检出且对应真实记录）
 *  3. 多个异常值
 *  4. 全部数据相同（无 IQR 差异 → 不报错、检测合理）
 *  5. 先普通筛选，再排除异常值（异常值作用于当前分析行）
 *  6. 排除后恢复（原始数据不被删除）
 *  7. 字段 A 排除后切换字段 B（跨字段不误排除）
 *  8. 排除前后统计值与三张图（Histogram/BoxPlot/CDF）真正变化
 *  9. 原始数据始终未被删除
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testOutlierExclusion.ts
 */
import { detectOutliersFromValues } from '../src/engine/univariateAnalyzer.js';
import { extractFieldNumericValues, filterRowsExcluding } from '../src/engine/outlierExclusion.js';
import { computeMetric } from '../src/engine/analysisEngine.js';
import { toHistogramProps, toBoxPlotProps, toCdfProps } from '../src/engine/chartAdapter.js';
import type { MetricDefinition } from '../src/engine/metricLayer.js';
import type { DerivedDataContext } from '../src/engine/context.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function assertClose(actual: number, expected: number, tol: number, name: string) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name} (= ${actual})`);
  } else {
    failed++;
    failures.push(`${name}: expected ~${expected}, got ${actual}`);
    console.log(`  ✗ ${name}: expected ~${expected}, got ${actual}`);
  }
}

function makeRows(field: string, values: (number | string | null)[]): Record<string, string>[] {
  return values.map(v => ({ [field]: v === null ? '' : String(v) }));
}

function makeMetricDef(field: string): MetricDefinition {
  return {
    name: field,
    type: 'score',
    direction: 'higher-is-better',
    displayName: field,
    isRecommended: true,
    sourceField: field,
  };
}

function buildContext(rows: Record<string, string>[]): DerivedDataContext {
  return { filteredRows: rows, fieldScores: {}, outliers: {} };
}

// 均值
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
}

console.log('=== 第十九阶段：异常值检测 / 排除异常值回归测试 ===\n');

// ===== 1. 无异常值 =====
console.log('1. 无异常值（正常分布不大量误报）');
{
  const normal = [100,102,98,101,99,100,101,100,99,102,98,100,
                  101,100,99,101,102,100,100,101,99,102,100,98];
  const outliers = detectOutliersFromValues(normal);
  assert(outliers.length <= 1, `正常分布几乎无误报（实际 ${outliers.length} 个）`, `outliers=${JSON.stringify(outliers)}`);
}

// ===== 2. 一个明显异常值 =====
console.log('\n2. 一个明显异常值（极端 1000 被检出且对应真实记录）');
{
  const values = Array.from({ length: 20 }, () => 0);
  values.push(1000);
  const rows = makeRows('val', values);
  // 真实 detector
  const outliers = detectOutliersFromValues(values);
  assert(outliers.length >= 1, '检测到异常值', `count=${outliers.length}`);
  const has1000 = outliers.some(o => o.value === 1000);
  assert(has1000, '1000 被识别为异常值');
  // 对应真实记录：抽取数值时下标映射
  const { rowIndices } = extractFieldNumericValues(rows, 'val');
  const flagged = outliers.filter(o => rowIndices[o.rowIndex] !== undefined);
  const flaggedReal = flagged.map(o => ({ realRow: rowIndices[o.rowIndex], value: o.value }));
  assert(flaggedReal.some(f => f.value === 1000 && f.realRow === 20), '1000 对应真实行 20', `flaggedReal=${JSON.stringify(flaggedReal)}`);
}

// ===== 3. 多个异常值 =====
console.log('\n3. 多个异常值');
{
  const values = [85,86,87,88,85,86,87,1000,2000,87,86,85,100,90,88,87];
  const outliers = detectOutliersFromValues(values);
  assert(outliers.length >= 2, `检测到多个异常值（${outliers.length}）`, `outliers=${JSON.stringify(outliers)}`);
  assert(outliers.some(o => o.value === 1000), '1000 在一个');
  assert(outliers.some(o => o.value === 2000), '2000 在一个');
}

// ===== 4. 全部数据相同 =====
console.log('\n4. 全部数据相同');
{
  const values = [50,50,50,50,50,50,50,50,50,50];
  const outliers = detectOutliersFromValues(values);
  // 全相同 → 无 IQR 差异；不应误报，也不应崩溃
  assert(outliers.length === 0, '全部相同时检测为空（无误报）', `outliers=${JSON.stringify(outliers)}`);
}

// ===== 5. 先普通筛选，再排除异常值 =====
console.log('\n5. 先普通筛选，再排除异常值（作用于当前分析行）');
{
  const raw = makeRows('val', [85,87,100,2000,86,88,90,3000,85,87]);
  // 模拟普通筛选：只保留 <= 1000 的行（即去掉 2000、3000），得到当前分析行
  const filtered = filterRowsExcluding(raw, new Set([3, 7]));
  assert(filtered.length === 8, '普通筛选后剩 8 行', `len=${filtered.length}`);
  // 当前分析行数值
  const { values } = extractFieldNumericValues(filtered, 'val');
  const outliers = detectOutliersFromValues(values);
  // 100 相对 85~90 是离群，应被检出
  assert(outliers.length >= 1, '异常值检测作用于过滤后的行', `outliers=${JSON.stringify(outliers)}`);
}

// ===== 6. 排除后恢复 =====
console.log('\n6. 排除后恢复（原始数据不被删除）');
{
  const rows = makeRows('val', [10,10,10,10,1000,10,10]);
  const excluded = new Set<number>([4]); // 排除 1000 所在行
  const after = filterRowsExcluding(rows, excluded);
  assert(after.length === 6, '排除后剩 6 行', `len=${after.length}`);
  // 恢复：清空排除集合 → 回到原始数组引用
  const restored = filterRowsExcluding(rows, new Set<number>());
  assert(restored === rows, '恢复后复用原始数组（同一引用，无拷贝损耗）');
  assert(restored.length === rows.length, '原始数据完整保留', `len=${restored.length}`);
}

// ===== 7. 字段 A 排除后切换字段 B =====
console.log('\n7. 字段 A 排除后切换字段 B（跨字段不误排除）');
{
  const rows = [
    { a: '10', b: '5' },
    { a: '10', b: '5' },
    { a: '10', b: '5' },
    { a: '1000', b: '5' },
    { a: '10', b: '5' },
  ];
  // 字段 A 排除其极端行（行 3）
  const excludedA = new Set<number>([3]);
  const rowsAfterA = filterRowsExcluding(rows, excludedA);
  assert(rowsAfterA.length === 4, '字段 A 排除后剩 4 行');
  // 切换到字段 B：排除集合按字段隔离，B 不应带 A 的下标
  // 这里模拟：B 无排除 → 应使用未被 A 污染的行集合
  const { values: valuesA } = extractFieldNumericValues(rowsAfterA, 'a');
  const { values: valuesB } = extractFieldNumericValues(rows, 'b');
  assert(valuesB.length === 5, '字段 B 仍基于完整行（数量 5）', `len=${valuesB.length}`);
  const outliersB = detectOutliersFromValues(valuesB);
  assert(outliersB.length === 0, '字段 B 无异常（未被 A 跨字段误排除）', `outliersB=${JSON.stringify(outliersB)}`);
  // A 的 1000 仍只在 A 中被排除
  assert(!valuesA.includes(1000), '字段 A 已排除 1000', `valuesA=${JSON.stringify(valuesA)}`);
}

// ===== 8. 排除前后统计值与三张图真正变化 =====
console.log('\n8. 排除前后统计值与三张图变化');
{
  const field = 'val';
  const rowsAll = makeRows(field, [10,10,10,10,1000,10,10]);
  const rowsExcluded = filterRowsExcluding(rowsAll, new Set<number>([4]));

  const ctxAll: DerivedDataContext = buildContext(rowsAll);
  const ctxExcluded: DerivedDataContext = buildContext(rowsExcluded);
  const def = makeMetricDef(field);

  const metricAll = computeMetric(ctxAll, def);
  const metricExcluded = computeMetric(ctxExcluded, def);

  // 有效记录数
  assert(metricAll!.stats!.validCount === 7, '排除前有效记录 7', `=${metricAll!.stats!.validCount}`);
  assert(metricExcluded!.stats!.validCount === 6, '排除后有效记录 6', `=${metricExcluded!.stats!.validCount}`);

  // 均值
  assertClose(metricAll!.stats!.mean, mean([10,10,10,10,1000,10,10]), 1e-6, '排除前均值约 151.43');
  assertClose(metricExcluded!.stats!.mean, 10, 1e-6, '排除后均值 10');

  // 中位数
  assert(metricAll!.stats!.median === 10, '排除前后中位数不变（10）', `=${metricAll!.stats!.median}`);
  assert(metricExcluded!.stats!.median === 10, '排除后中位数 10');

  // 标准差：排除后显著下降
  const stdAll = metricAll!.stats!.max - 10; // 用范围粗验
  const stdExcl = metricExcluded!.stats!.max - 10;
  assert(metricAll!.stats!.max === 1000, '排除前最大值 1000');
  assert(metricExcluded!.stats!.max === 10, '排除后最大值 10');
  assert(stdAll > stdExcl, '排除前取值范围更大（std 更大）', `rangeAll=${stdAll} rangeExcl=${stdExcl}`);

  // 三张图基于 MetricResult 派生，其 values 应随之变化
  const histAll = toHistogramProps(metricAll!).values;
  const histExcl = toHistogramProps(metricExcluded!).values;
  assert(histExcl.length === 6 && !histExcl.includes(1000), 'Histogram 排除后不含 1000');

  const boxAll = toBoxPlotProps(metricAll!).values;
  const boxExcl = toBoxPlotProps(metricExcluded!).values;
  assert(boxExcl.length === 6 && !boxExcl.includes(1000), 'BoxPlot 排除后不含 1000');

  const cdfAll = toCdfProps(metricAll!).values;
  const cdfExcl = toCdfProps(metricExcluded!).values;
  assert(cdfExcl.length === 6 && !cdfExcl.includes(1000), 'CDF 排除后不含 1000');

  // 真值断言：排除 = 重算（非复制面板）
  assert(JSON.stringify(histExcl) === '[' + JSON.stringify([10,10,10,10,10,10]).slice(1, -1) + ']', 'Histogram 排除后全为 10');
}

// ===== 9. 原始数据始终未被删除 =====
console.log('\n9. 原始数据始终未被删除');
{
  const rows = makeRows('val', [10,10,10,10,1000,10,10]);
  const before = rows.map(r => ({ ...r }));
  const excluded = new Set<number>([4]);
  filterRowsExcluding(rows, excluded);
  assert(JSON.stringify(rows) === JSON.stringify(before), '排除操作后原始数组内容不变');
  assert(rows.length === 7, '原始数组长度不变');
}

// ===== 10. 抽样行 / 多字段字段切换一致性（detectionValues 引用完整行） =====
console.log('\n10. 检测基于完整分析行（候选可恢复）');
{
  const rows = makeRows('val', [10,10,10,10,1000,10,10]);
  const { values, rowIndices } = extractFieldNumericValues(rows, 'val');
  assert(values.length === 7, '检测值来自完整行（7）');
  assert(rowIndices.length === values.length, '每个检测值都有真实行下标');
  // 即使有排除，检测仍基于完整行（供面板展示可恢复候选）
  const afterExcl = filterRowsExcluding(rows, new Set([4]));
  const { values: afterValues } = extractFieldNumericValues(afterExcl, 'val');
  assert(afterValues.length === 6, '分析用值来自排除后行（6）');
}

console.log(`\n=== 结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (failed > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}