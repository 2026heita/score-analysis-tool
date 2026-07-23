/**
 * 真实源码测试：safeFormat
 */
import {
  isFiniteNumber,
  safeFormatNumber,
  safeFormatPercent,
  extractNumericFromEChartsParam,
  isValidPercentile
} from '../../src/utils/safeFormat.js';

let passed = 0;
let failed = 0;

function assert(name: string, actual: any, expected: any) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log('=== 真实源码测试：safeFormat ===\n');

// isFiniteNumber
console.log('测试 isFiniteNumber:');
assert('0 是有限数字', isFiniteNumber(0), true);
assert('100 是有限数字', isFiniteNumber(100), true);
assert('NaN 不是有限数字', isFiniteNumber(NaN), false);
assert('Infinity 不是有限数字', isFiniteNumber(Infinity), false);
assert('undefined 不是有限数字', isFiniteNumber(undefined), false);
assert('null 不是有限数字', isFiniteNumber(null), false);
assert('字符串不是有限数字', isFiniteNumber('100'), false);

// safeFormatNumber
console.log('\n测试 safeFormatNumber:');
assert('100 → "100.0"', safeFormatNumber(100), '100.0');
assert('85.345 → "85.3"', safeFormatNumber(85.345), '85.3');
assert('NaN → "—"', safeFormatNumber(NaN), '—');
assert('undefined → "—"', safeFormatNumber(undefined), '—');
assert('Infinity → "—"', safeFormatNumber(Infinity), '—');

// safeFormatPercent
console.log('\n测试 safeFormatPercent:');
assert('85.3 → "85.3%"', safeFormatPercent(85.3), '85.3%');
assert('NaN → "—"', safeFormatPercent(NaN), '—');
assert('undefined → "—"', safeFormatPercent(undefined), '—');

// extractNumericFromEChartsParam
console.log('\n测试 extractNumericFromEChartsParam:');
assert('数字 100 → 100', extractNumericFromEChartsParam(100), 100);
assert('数组 [85.5] → 85.5', extractNumericFromEChartsParam([85.5]), 85.5);
assert('对象 {value: 90} → 90', extractNumericFromEChartsParam({ value: 90 }), 90);
assert('undefined → undefined', extractNumericFromEChartsParam(undefined), undefined);

// isValidPercentile
console.log('\n测试 isValidPercentile:');
assert('0 是有效百分位', isValidPercentile(0), true);
assert('50.5 是有效百分位', isValidPercentile(50.5), true);
assert('100 是有效百分位', isValidPercentile(100), true);
assert('-1 不是有效百分位', isValidPercentile(-1), false);
assert('101 不是有效百分位', isValidPercentile(101), false);

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
