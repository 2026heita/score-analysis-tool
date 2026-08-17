/**
 * 第二十一阶段：百分号口径一致性回归测试
 * 直接导入真实生产函数，不修改测试以迎合。
 *
 * 权威规则（numericParser）：用户表格原始百分号使用"百分数值"语义
 *   85% → 85, 12.5% → 12.5, 1,000% → 1000
 * 任何分析模块不得再次因原始字符串带 "%" 而除以 100（否则 85% → 0.85）。
 *
 * 验证跨模块一致性：
 *   - 主分析引擎 computeMetric（parseNumericValueLegacy）
 *   - feature standardizer standardizeDataset / extractNumericalValues
 *   - 通用概览 analyzeNumericalFeature（基于 standardized vectors）
 *   - correlation 数据提取（parseNumericValueLegacy）
 *   - chart adapter（基于 metricResult.values）
 *
 * 覆盖：
 *  1. 普通百分号 85% / 90% / 100%
 *  2. 小数百分号 12.5% / 0.5%
 *  3. 负百分号 -10%
 *  4. 千分位百分号 1,000%
 *  5. 非法 1,00% / 1,2,3% / abc% → invalid
 *  6. 混合列 85% / 90 / 95% / 100 → 统一尺度
 *  7. `完成率` fast-100 → min/max/mean/median = 80/100/90/90 在各模块一致
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testPercentConsistency.ts
 */
import { parseNumericValueLegacy } from '../src/utils/tableParser/numericParser.js';
import { standardizeDataset, extractNumericalValues } from '../src/engine/featureStandardizer.js';
import { analyzeNumericalFeature } from '../src/engine/univariateAnalyzer.js';
import { computeMetric } from '../src/engine/analysisEngine.js';
import { toHistogramProps, toBoxPlotProps, toCdfProps } from '../src/engine/chartAdapter.js';
import type { FeatureSchema } from '../src/engine/types.js';
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

function numFeat(field: string): FeatureSchema {
  return { fieldName: field, displayName: field, featureType: 'numerical', confidence: 1, reason: 'test' };
}

function metricDef(field: string): MetricDefinition {
  return { name: field, type: 'score', direction: 'higher-is-better', displayName: field, isRecommended: true, sourceField: field };
}

function buildCtx(rows: Record<string, string>[]): DerivedDataContext {
  return { filteredRows: rows, fieldScores: {}, outliers: {} };
}

console.log('=== 第二十一阶段：百分号口径一致性回归测试 ===\n');

// ===== 1. 普通百分号（parseNumericValueLegacy 权威） =====
console.log('1. 普通百分号');
{
  assert(parseNumericValueLegacy('85%') === 85, '85% → 85');
  assert(parseNumericValueLegacy('90%') === 90, '90% → 90');
  assert(parseNumericValueLegacy('100%') === 100, '100% → 100');
}

// ===== 2. 小数百分号 =====
console.log('\n2. 小数百分号');
{
  assert(parseNumericValueLegacy('12.5%') === 12.5, '12.5% → 12.5');
  assert(parseNumericValueLegacy('0.5%') === 0.5, '0.5% → 0.5');
}

// ===== 3. 负百分号 =====
console.log('\n3. 负百分号');
{
  assert(parseNumericValueLegacy('-10%') === -10, '-10% → -10');
}

// ===== 4. 千分位百分号 =====
console.log('\n4. 千分位百分号');
{
  assert(parseNumericValueLegacy('1,000%') === 1000, '1,000% → 1000');
}

// ===== 5. 非法百分号继续 invalid =====
console.log('\n5. 非法百分号');
{
  assert(parseNumericValueLegacy('1,00%') === null, '1,00% → invalid');
  assert(parseNumericValueLegacy('1,2,3%') === null, '1,2,3% → invalid');
  assert(parseNumericValueLegacy('abc%') === null, 'abc% → invalid');
}

// ===== 6. 混合列统一尺度（85% / 90 / 95% / 100） =====
console.log('\n6. 混合列统一尺度（85% / 90 / 95% / 100）');
{
  // 主分析入口
  const mainVals = ['85%', '90', '95%', '100'].map(v => parseNumericValueLegacy(v));
  assert(JSON.stringify(mainVals) === JSON.stringify([85, 90, 95, 100]), '主分析 parseNumericValueLegacy 统一 [85,90,95,100]', `=${JSON.stringify(mainVals)}`);

  // standardizer 入口
  const rows = [{ 'v': '85%' }, { 'v': '90' }, { 'v': '95%' }, { 'v': '100' }];
  const vectors = standardizeDataset(rows, [numFeat('v')]);
  const stdVals = extractNumericalValues(vectors, 'v');
  assert(JSON.stringify(stdVals) === JSON.stringify([85, 90, 95, 100]), 'standardizer 统一 [85,90,95,100]', `=${JSON.stringify(stdVals)}`);
}

// ===== 7. 完成率 80~100% 跨模块一致性 =====
console.log('\n7. 完成率 80%/85%/90%/95%/100% 跨模块一致性');
{
  const field = '完成率';
  const rows = [
    { [field]: '80%' },
    { [field]: '85%' },
    { [field]: '90%' },
    { [field]: '95%' },
    { [field]: '100%' },
  ];

  // (a) 主分析引擎
  const main = computeMetric(buildCtx(rows), metricDef(field))!;
  assert(main.stats!.min === 80 && main.stats!.max === 100, '主分析 min=80 max=100', `=${main.stats!.min}/${main.stats!.max}`);
  assert(Math.abs(main.stats!.mean - 90) < 1e-9, '主分析 mean=90', `=${main.stats!.mean}`);
  assert(main.stats!.median === 90, '主分析 median=90', `=${main.stats!.median}`);
  assert(JSON.stringify(main.values) === JSON.stringify([80, 85, 90, 95, 100]), '主分析 values 原始 [80,85,90,95,100]', `=${JSON.stringify(main.values)}`);

  // (b) feature standardizer
  const vectors = standardizeDataset(rows, [numFeat(field)]);
  const stdVals = extractNumericalValues(vectors, field);
  assert(JSON.stringify(stdVals) === JSON.stringify([80, 85, 90, 95, 100]), 'standardizer 原始 [80,85,90,95,100]', `=${JSON.stringify(stdVals)}`);

  // (c) 通用概览（analyzeNumericalFeature 基于 standardized vectors）
  const overview = analyzeNumericalFeature(vectors, field);
  assert(overview.min === 80 && overview.max === 100, '概览 min=80 max=100', `=${overview.min}/${overview.max}`);
  assert(Math.abs(overview.mean - 90) < 1e-9, '概览 mean=90', `=${overview.mean}`);
  assert(overview.median === 90, '概览 median=90', `=${overview.median}`);

  // (d) correlation 提取入口（parseNumericValueLegacy）
  const corrVals = rows.map(r => parseNumericValueLegacy(r[field]));
  assert(JSON.stringify(corrVals) === JSON.stringify([80, 85, 90, 95, 100]), 'correlation 提取 [80,85,90,95,100]', `=${JSON.stringify(corrVals)}`);

  // (e) chart adapter（基于主分析 metricResult.values）
  const hist = toHistogramProps(main).values;
  const box = toBoxPlotProps(main).values;
  const cdf = toCdfProps(main).values;
  const exp = JSON.stringify([80, 85, 90, 95, 100]);
  assert(JSON.stringify(hist) === exp, 'Histogram values [80,85,90,95,100]');
  assert(JSON.stringify(box) === exp, 'BoxPlot values [80,85,90,95,100]');
  assert(JSON.stringify(cdf) === exp, 'CDF values [80,85,90,95,100]');
}

// ===== 8. 混合写法主统计一致 =====
console.log('\n8. 混合写法 85% / 90 / 95% / 100 的统计口径');
{
  const field = 'v';
  const rows = [{ [field]: '85%' }, { [field]: '90' }, { [field]: '95%' }, { [field]: '100' }];
  const vectors = standardizeDataset(rows, [numFeat(field)]);
  const stdVals = extractNumericalValues(vectors, field);
  const s = analyzeNumericalFeature(vectors, field);
  assert(s.min === 85 && s.max === 100, '混合列 min=85 max=100', `=${s.min}/${s.max}`);
  const mean = (85 + 90 + 95 + 100) / 4;
  assert(Math.abs(s.mean - mean) < 1e-9, `混合列 mean=${mean}`, `=${s.mean}`);
  assert(s.median === 92.5, '混合列 median=92.5', `=${s.median}`);
  assert(JSON.stringify(stdVals) === JSON.stringify([85, 90, 95, 100]), '混合列真值统一', `=${JSON.stringify(stdVals)}`);
}

// ===== 9. numericRatio / 数字筛选仍有效 =====
console.log('\n9. 百分号列仍被视为数值（数字筛选/识别不失效）');
{
  const field = '完成率';
  const rows = [{ [field]: '85%' }, { [field]: '90%' }, { [field]: '95%' }, { [field]: '100%' }];
  const vectors = standardizeDataset(rows, [numFeat(field)]);
  const stdVals = extractNumericalValues(vectors, field);
  assert(stdVals.length === 4, '标准化的数值行数 = 4（全部是数值型）', `=${stdVals.length}`);

  // 数字筛选走 parseNumericValueLegacy
  const { filterRows } = await import('../src/engine/filterRows.js');
  const r = filterRows(rows, [{ field, operator: 'gt', value: '90' }], new Set([field]));
  assert(JSON.stringify(r.filteredRows.map(x => x[field])) === JSON.stringify(['95%', '100%']), '完成率 >90 命中 95% 与 100%', `=${JSON.stringify(r.filteredRows)}`);
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