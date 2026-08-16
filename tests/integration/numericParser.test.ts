/**
 * 真实源码测试：numericParser
 */
import {
  parseNumericValue,
  parseNumericValueLegacy
} from '../../src/utils/tableParser/numericParser.js';

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

console.log('=== 真实源码测试：numericParser ===\n');

// empty 状态测试
console.log('测试 empty 状态:');
assert('null → empty', parseNumericValue(null).status, 'empty');
assert('undefined → empty', parseNumericValue(undefined).status, 'empty');
assert('空字符串 → empty', parseNumericValue('').status, 'empty');
assert('纯空格 → empty', parseNumericValue('   ').status, 'empty');
assert('"-" → empty', parseNumericValue('-').status, 'empty');
assert('"—" → empty', parseNumericValue('—').status, 'empty');
assert('"–" → empty', parseNumericValue('–').status, 'empty');
assert('"/" → empty', parseNumericValue('/').status, 'empty');
assert('"\\\\" → empty', parseNumericValue('\\').status, 'empty');
assert('"|" → empty', parseNumericValue('|').status, 'empty');

// invalid 状态测试
console.log('\n测试 invalid 状态:');
assert('"缺考" → invalid', parseNumericValue('缺考').status, 'invalid');
assert('"弃考" → invalid', parseNumericValue('弃考').status, 'invalid');
assert('"转到7班" → invalid', parseNumericValue('转到7班').status, 'invalid');
assert('"无成绩" → invalid', parseNumericValue('无成绩').status, 'invalid');
assert('"abc" → invalid', parseNumericValue('abc').status, 'invalid');
assert('"1,23" → invalid', parseNumericValue('1,23').status, 'invalid');
assert('"1,2,3" → invalid', parseNumericValue('1,2,3').status, 'invalid');
assert('"12,34,567" → invalid', parseNumericValue('12,34,567').status, 'invalid');
assert('"1,00%" → invalid', parseNumericValue('1,00%').status, 'invalid');

// valid 状态测试
console.log('\n测试 valid 状态:');
assert('"0" → valid', parseNumericValue('0').status, 'valid');
assert('"0" 值', parseNumericValue('0').value, 0);
assert('"-1" → valid', parseNumericValue('-1').status, 'valid');
assert('"-1" 值', parseNumericValue('-1').value, -1);
assert('"1,000" → valid', parseNumericValue('1,000').status, 'valid');
assert('"1,000" 值', parseNumericValue('1,000').value, 1000);
assert('"12,345" → valid', parseNumericValue('12,345').status, 'valid');
assert('"12,345" 值', parseNumericValue('12,345').value, 12345);
assert('"1,234.56" → valid', parseNumericValue('1,234.56').status, 'valid');
assert('"1,234.56" 值', parseNumericValue('1,234.56').value, 1234.56);
assert('"-1,234.56" → valid', parseNumericValue('-1,234.56').status, 'valid');
assert('"-1,234.56" 值', parseNumericValue('-1,234.56').value, -1234.56);
assert('"1,000%" → valid', parseNumericValue('1,000%').status, 'valid');
assert('"1,000%" 值', parseNumericValue('1,000%').value, 1000);
assert('".5" → valid', parseNumericValue('.5').status, 'valid');
assert('".5" 值', parseNumericValue('.5').value, 0.5);
assert('"1e3" → valid', parseNumericValue('1e3').status, 'valid');
assert('"1e3" 值', parseNumericValue('1e3').value, 1000);

// Legacy 接口测试
console.log('\n测试 Legacy 接口:');
assert('Legacy "550"', parseNumericValueLegacy('550'), 550);
assert('Legacy "缺考"', parseNumericValueLegacy('缺考'), null);
assert('Legacy "1,234"', parseNumericValueLegacy('1,234'), 1234);
assert('Legacy "1,23"', parseNumericValueLegacy('1,23'), null);
assert('Legacy "/"', parseNumericValueLegacy('/'), null);

console.log(`\n=== 测试结果 ===\n通过: ${passed}\n失败: ${failed}\n`);

if (failed > 0) {
  console.log('❌ 测试失败');
  process.exit(1);
} else {
  console.log('✅ 全部测试通过');
}
