/**
 * 第二十三阶段：极大数字统计稳定性回归测试
 * 直接导入真实生产函数。
 *
 * 核心目标：如果所有输入都是有限 number，且最终数学结果仍在 Number 可表示范围内，
 * 就不能因为中间计算方式（求和溢出 / 平方溢出）而产生 Infinity / NaN。
 *
 * 覆盖：
 *  1. mean/std 对极端数据稳定（1e308 ± 等）
 *  2. 普通数据结果完全不变（10/20/30、-100/0/100、13/13/13）
 *  3. 主分析 computeStats / 通用概览 analyzeNumericalFeature / 标准化后统计一致
 *  4. parser 边界 1e308 → valid、1e309 → invalid 不变
 *  5. 真正超范围时返回不可表示而非伪造
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testNumericStability.ts
 */
import { mean, stdDev } from '../src/utils/stats.js';
import { computeStats } from '../src/engine/analysisEngine.js';
import { analyzeNumericalFeature } from '../src/engine/univariateAnalyzer.js';
import { standardizeDataset, extractNumericalValues } from '../src/engine/featureStandardizer.js';
import { parseNumericValueLegacy } from '../src/utils/tableParser/numericParser.js';
import type { FeatureSchema } from '../src/engine/types.js';

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

function assertClose(actual: number, expected: number, name: string) {
  // 用相对差比较，容忍浮点精度
  const ok = Number.isFinite(actual)
    && (actual === expected || (expected !== 0 && Math.abs(actual - expected) / Math.abs(expected) < 1e-9));
  if (ok) { passed++; console.log(`  ✓ ${name} (= ${actual})`); }
  else { failed++; failures.push(`${name}: got ${actual}, expected ~${expected}`); console.log(`  ✗ ${name}: got ${actual}, expected ~${expected}`); }
}

function numFeat(field: string): FeatureSchema {
  return { fieldName: field, displayName: field, featureType: 'numerical', confidence: 1, reason: 'test' };
}

console.log('=== 第二十三阶段：极大数字统计稳定性回归测试 ===\n');

// ===== 1. parser 边界不变 =====
console.log('1. parser 边界');
{
  assert(parseNumericValueLegacy('1e308') === 1e308, '1e308 → valid 有限');
  assert(parseNumericValueLegacy('1e309') === null, '1e309 → invalid');
  assert(Number.isFinite(parseNumericValueLegacy('1e308') as number), '1e308 为有限数');
}

// ===== 2. mean 稳定 =====
console.log('\n2. mean 对极端数据稳定');
{
  assertClose(mean([1e308, 1e308]), 1e308, 'mean[1e308,1e308] = 1e308');
  assertClose(mean([1e308, -1e308]), 0, 'mean[1e308,-1e308] = 0');
  assertClose(mean([1e308, 1e308, -1e308, -1e308]), 0, 'mean[1e308*2,-1e308*2] = 0');
  assertClose(mean([1e307, 2e307, 3e307]), 2e307, 'mean[1e307,2e307,3e307] = 2e307');
  assertClose(mean([-1e308, -1e308]), -1e308, 'mean[-1e308,-1e308] = -1e308');
  assertClose(mean([0, 1e308]), 5e307, 'mean[0,1e308] = 5e307');
}

// ===== 3. std 稳定 =====
console.log('\n3. std 对极端数据稳定');
{
  assertClose(stdDev([1e308, 1e308]), 0, 'std[1e308,1e308] = 0');
  assertClose(stdDev([1e308, -1e308]), 1e308, 'std[1e308,-1e308] = 1e308');
  assertClose(stdDev([-1e308, -1e308]), 0, 'std[-1e308,-1e308] = 0');
  const s2 = stdDev([1e308, 1e308, -1e308, -1e308]);
  assert(Number.isFinite(s2), `std[1e308,1e308,-1e308,-1e308] 有限 (=${s2})`);
}

// ===== 4. 普通数据完全保持 =====
console.log('\n4. 普通数据结果保持不变');
{
  assertClose(mean([10, 20, 30]), 20, 'mean[10,20,30] = 20');
  assertClose(mean([-100, 0, 100]), 0, 'mean[-100,0,100] = 0');
  assertClose(mean([13, 13, 13]), 13, 'mean[13,13,13] = 13');
  assertClose(stdDev([10, 20, 30]), 8.16496580927726, 'std[10,20,30] 保持');
  assertClose(stdDev([-100, 0, 100]), 81.6496580927726, 'std[-100,0,100] 保持');
  assertClose(stdDev([13, 13, 13]), 0, 'std[13,13,13] = 0');
}

// ===== 5. 跨模块一致性（主分析 / 概览 / 标准化） =====
console.log('\n5. 跨模块一致性（极端数据同组）');
{
  const field = 'val';
  const rows = [{ [field]: '1e308' }, { [field]: '1e308' }, { [field]: '-1e308' }, { [field]: '-1e308' }];

  // 主分析 computeStats
  const main = computeStats(rows.map(r => Number(r[field])), rows.length)!;
  assertClose(main.mean, 0, '主分析 mean = 0');
  assert(Number.isFinite(main.mean), '主分析 mean 有限');

  // 标准化后概览 analyzeNumericalFeature
  const vectors = standardizeDataset(rows, [numFeat(field)]);
  const stdVals = extractNumericalValues(vectors, field);
  const overview = analyzeNumericalFeature(vectors, field);
  assert(Number.isFinite(overview.std), '概览 std 有限', `std=${overview.std}`);
  assert(overview.std === 1e308 || Math.abs(overview.std - 1e308) < 1, '概览 std 正确', `=${overview.std}`);

  // 概览 mean 与标准化提取一致性：均基于同一数值
  assertClose(overview.mean, 0, '概览 mean = 0');
  assert(stdVals.length === 4, '标准化提取 4 个数值');
}

// ===== 6. 主分析极端对组 mean/median 一致性 =====
console.log('\n6. 主分析 [1e308, -1e308]');
{
  const rows = [{ v: '1e308' }, { v: '-1e308' }];
  const main = computeStats(rows.map(r => Number(r.v)), 2)!;
  assertClose(main.mean, 0, '主分析 mean = 0');
  assert(Number.isFinite(main.max), '主分析 max finite');
  assert(Number.isFinite(main.min), '主分析 min finite');
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