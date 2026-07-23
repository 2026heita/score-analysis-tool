/**
 * 真实源码测试：日期解析
 */
import { parseNumericValue } from '../../src/utils/tableParser/numericParser.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${details ? ': ' + details : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

console.log('=== 真实源码测试：日期解析 ===\n');

// 日期格式应该返回 invalid，不应解析为数字
console.log('测试日期格式:');

const date1 = parseNumericValue('2024-01-01');
assert('2024-01-01 不应解析为数字', date1.status === 'invalid', `status=${date1.status}`);

const date2 = parseNumericValue('2024/01/01');
assert('2024/01/01 不应解析为数字', date2.status === 'invalid', `status=${date2.status}`);

const date3 = parseNumericValue('2024年1月1日');
assert('2024年1月1日 不应解析为数字', date3.status === 'invalid', `status=${date3.status}`);

const date4 = parseNumericValue('2024-01-01 12:30');
assert('2024-01-01 12:30 不应解析为数字', date4.status === 'invalid', `status=${date4.status}`);

// 普通数字仍应正常解析
console.log('\n测试普通数字:');

const num1 = parseNumericValue('2024');
assert('2024 应解析为数字', num1.status === 'valid', `status=${num1.status}`);
if (num1.status === 'valid') {
  assert('2024 值为 2024', num1.value === 2024, `value=${num1.value}`);
}

const num2 = parseNumericValue('85.5');
assert('85.5 应解析为数字', num2.status === 'valid', `status=${num2.status}`);
if (num2.status === 'valid') {
  assert('85.5 值为 85.5', num2.value === 85.5, `value=${num2.value}`);
}

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
