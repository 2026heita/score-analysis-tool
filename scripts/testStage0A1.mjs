/**
 * Stage 0A-1 行数上限验收测试（基于真实生产源码）
 * 执行: npx tsx scripts/testStage0A1.mjs
 *
 * 生产规则（第二十六阶段收口后）：
 * - 真实数据行数 < 20,000 行：正常分析；
 * - 真实数据行数 = 20,000 行：正常分析；
 * - 真实数据行数 > 20,000 行：整份拒绝，返回明确行数超限错误；
 * - 不再采用"截断前 20,000 行继续分析"的旧行为。
 *
 * 本脚本不复制任何业务逻辑，直接调用生产解析入口 parseRawRows 进行断言。
 */

import { parseRawRows, MAX_ROWS } from '../src/utils/tableParser/workbook.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}${detail ? ': ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
    failed++;
    failures.push(name);
  }
}

// 构建 [表头, ...数据行] 的二维数组，真实数据行数为 rowCount
function buildTable(rowCount) {
  const rows = [['姓名', '成绩']];
  for (let i = 0; i < rowCount; i++) rows.push([`学生${i}`, String(80 + (i % 20))]);
  return rows;
}

const okCount = (r) => r.summary.validDataRows;

console.log('=== Stage 0A-1 行数上限验收测试（真实源码）===');

// 1. 19,999 行：成功
console.log('\n[1] 19,999 行（应成功）');
{
  const r = parseRawRows(buildTable(19999));
  assert('成功解析，isParseTruncated = false', r.dataVolumeState.isParseTruncated === false);
  assert('parsedRowCount = 19999', r.dataVolumeState.parsedRowCount === 19999);
  assert('validDataRows = 19999', okCount(r) === 19999, `实际 ${okCount(r)}`);
}

// 2. 20,000 行：成功
console.log('\n[2] 20,000 行（应成功）');
{
  const r = parseRawRows(buildTable(20000));
  assert('成功解析，isParseTruncated = false', r.dataVolumeState.isParseTruncated === false);
  assert('parsedRowCount = 20000', r.dataVolumeState.parsedRowCount === 20000);
  assert('validDataRows = 20000', okCount(r) === 20000, `实际 ${okCount(r)}`);
}

// 3. 20,001 行：整份拒绝，且为明确行数超限错误（非随机异常）
console.log('\n[3] 20,001 行（应整份拒绝）');
{
  let name = '';
  let message = '';
  let threw = false;
  try {
    parseRawRows(buildTable(20001));
  } catch (e) {
    threw = true;
    name = e && e.name;
    message = e && e.message ? String(e.message) : '';
  }
  assert('抛出错误', threw);
  assert('错误类型为 ParseError（非随机异常）', name === 'ParseError', `实际 ${name}`);
  assert('错误语义包含上限 20,000', message.includes('20,000'), `实际 ${message}`);
  assert('错误语义包含精简提示', message.includes('精简'), `实际 ${message}`);
  assert('错误确为"行数超限"语义（非其他解析错误）', message.includes('超出单次分析上限'), `实际 ${message}`);
}

// 4. 边界值一致性：MAX_ROWS 常量与生产上限一致
console.log('\n[4] 常量一致性');
assert('MAX_ROWS = 20000', MAX_ROWS === 20000, `实际 ${MAX_ROWS}`);

console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (failed > 0) {
  console.log(`失败项: ${failures.join('; ')}`);
  process.exit(1);
}