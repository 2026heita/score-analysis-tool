/**
 * 真实源码测试：Stage 0A-1 DataVolumeState
 */
import { parseRawRows } from '../../src/utils/tableParser/workbook.js';

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

console.log('=== 真实源码测试：Stage 0A-1 DataVolumeState ===\n');

// 测试 20001 行数据（应触发整份拒绝）
console.log('测试 20001 行数据:');

const headers = ['姓名', '成绩'];
const rows: any[][] = [headers];
for (let i = 0; i < 20001; i++) {
  rows.push([`学生${i}`, String(80 + (i % 20))]);
}

let rejected = false;
let rejectMsg = '';
try {
  parseRawRows(rows);
} catch (e: any) {
  rejected = e && e.name === 'ParseError';
  rejectMsg = String(e && e.message);
}

assert('20001 行整份拒绝（ParseError）', rejected);
assert('拒绝提示包含上限与精简提示', rejectMsg.indexOf('20,000') >= 0 && rejectMsg.indexOf('精简') >= 0);

// 测试 5000 行数据（不应截断）
console.log('\n测试 5000 行数据:');

const rows2: any[][] = [headers];
for (let i = 0; i < 5000; i++) {
  rows2.push([`学生${i}`, String(80 + (i % 20))]);
}

const result2 = parseRawRows(rows2);

assert('dataVolumeState 存在', result2.dataVolumeState !== undefined);
assert('isParseTruncated 为 false', result2.dataVolumeState?.isParseTruncated === false);
assert('parsedRowCount 为 5000', result2.dataVolumeState?.parsedRowCount === 5000);

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
