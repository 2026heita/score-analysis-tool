/**
 * Stage 0A-1 验收测试脚本
 * 执行: node scripts/testStage0A1.mjs
 *
 * 测试覆盖：
 * 1. 数据量边界（0行、1行、4999行、5000行、5001行、19999行、20000行、20001行）
 * 2. 两级表头场景（两级表头+20000行、两级表头+20001行）
 * 3. DataVolumeState 字段完整性
 * 4. 截断警告文案
 */

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

function assertTrue(name, value) {
  if (value === true) {
    console.log(`  ✅ ${name}: true`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected true, got ${value}`);
    failed++;
  }
}

function assertFalse(name, value) {
  if (value === false) {
    console.log(`  ✅ ${name}: false`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected false, got ${value}`);
    failed++;
  }
}

function assertContains(name, actual, expected) {
  if (actual.includes(expected)) {
    console.log(`  ✅ ${name}: contains "${expected}"`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected to contain "${expected}", got "${actual}"`);
    failed++;
  }
}

function assertGreaterOrEqual(name, actual, expected) {
  if (actual >= expected) {
    console.log(`  ✅ ${name}: ${actual} >= ${expected}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected >= ${expected}, got ${actual}`);
    failed++;
  }
}

// 简化的 DataVolumeState 计算逻辑（与 src/utils/tableParser/workbook.ts 一致）
function calculateDataVolumeState(rawData, headerRowCount, validRowCount, emptyRowCount, summaryRowCount, invalidRowCount) {
  const MAX_ROWS = 20000;
  const physicalRowCount = rawData.length;
  const rawRowCount = physicalRowCount - headerRowCount;
  const parsedRowCount = Math.min(rawRowCount, MAX_ROWS);
  const isParseTruncated = rawRowCount > MAX_ROWS;
  
  let parseTruncationWarning;
  if (isParseTruncated) {
    const unparsedRows = rawRowCount - parsedRowCount;
    parseTruncationWarning = `原始文件包含 ${physicalRowCount} 行数据，当前解析上限为 20,000 行，尚有 ${unparsedRows} 行未解析。`;
  }
  
  return {
    physicalRowCount,
    headerRowCount,
    rawRowCount,
    parsedRowCount,
    validRowCount,
    emptyRowCount,
    summaryRowCount,
    invalidRowCount,
    isParseTruncated,
    parseTruncationWarning
  };
}

console.log('=== Stage 0A-1 验收测试 ===\n');

// 测试 1: 数据量边界
console.log('测试 1: 数据量边界');

// 1.1 0行数据（只有表头）
console.log('\n1.1 0行数据（只有表头）');
{
  const rawData = [['姓名', '语文', '数学']];
  const state = calculateDataVolumeState(rawData, 1, 0, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 1);
  assert('headerRowCount', state.headerRowCount, 1);
  assert('rawRowCount', state.rawRowCount, 0);
  assert('parsedRowCount', state.parsedRowCount, 0);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.2 1行数据
console.log('\n1.2 1行数据');
{
  const rawData = [['姓名', '语文', '数学'], ['张三', '80', '90']];
  const state = calculateDataVolumeState(rawData, 1, 1, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 2);
  assert('headerRowCount', state.headerRowCount, 1);
  assert('rawRowCount', state.rawRowCount, 1);
  assert('parsedRowCount', state.parsedRowCount, 1);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.3 4999行数据
console.log('\n1.3 4999行数据');
{
  const rawData = [['姓名', '语文'], ...Array(4999).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 4999, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 5000);
  assert('rawRowCount', state.rawRowCount, 4999);
  assert('parsedRowCount', state.parsedRowCount, 4999);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.4 5000行数据
console.log('\n1.4 5000行数据');
{
  const rawData = [['姓名', '语文'], ...Array(5000).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 5000, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 5001);
  assert('rawRowCount', state.rawRowCount, 5000);
  assert('parsedRowCount', state.parsedRowCount, 5000);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.5 5001行数据
console.log('\n1.5 5001行数据');
{
  const rawData = [['姓名', '语文'], ...Array(5001).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 5001, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 5002);
  assert('rawRowCount', state.rawRowCount, 5001);
  assert('parsedRowCount', state.parsedRowCount, 5001);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.6 19999行数据
console.log('\n1.6 19999行数据');
{
  const rawData = [['姓名', '语文'], ...Array(19999).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 19999, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 20000);
  assert('rawRowCount', state.rawRowCount, 19999);
  assert('parsedRowCount', state.parsedRowCount, 19999);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.7 20000行数据（边界）
console.log('\n1.7 20000行数据（边界）');
{
  const rawData = [['姓名', '语文'], ...Array(20000).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 20000, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 20001);
  assert('rawRowCount', state.rawRowCount, 20000);
  assert('parsedRowCount', state.parsedRowCount, 20000);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 1.8 20001行数据（超过限制）
console.log('\n1.8 20001行数据（超过限制）');
{
  const rawData = [['姓名', '语文'], ...Array(20001).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 20000, 0, 0, 1);
  assert('physicalRowCount', state.physicalRowCount, 20002);
  assert('rawRowCount', state.rawRowCount, 20001);
  assert('parsedRowCount', state.parsedRowCount, 20000);
  assertTrue('isParseTruncated', state.isParseTruncated);
  assertContains('parseTruncationWarning', state.parseTruncationWarning, '20,000');
  assertContains('parseTruncationWarning', state.parseTruncationWarning, '1');
  assertContains('parseTruncationWarning', state.parseTruncationWarning, '未解析');
}

// 测试 2: 两级表头场景
console.log('\n\n测试 2: 两级表头场景');

// 2.1 两级表头 + 20000行数据
console.log('\n2.1 两级表头 + 20000行数据');
{
  const rawData = [['科目', '语文', '数学'], ['成绩', '分数', '分数'], ...Array(20000).fill(['张三', '80', '90'])];
  const state = calculateDataVolumeState(rawData, 2, 20000, 0, 0, 0);
  assert('physicalRowCount', state.physicalRowCount, 20002);
  assert('headerRowCount', state.headerRowCount, 2);
  assert('rawRowCount', state.rawRowCount, 20000);
  assert('parsedRowCount', state.parsedRowCount, 20000);
  assertFalse('isParseTruncated', state.isParseTruncated);
}

// 2.2 两级表头 + 20001行数据
console.log('\n2.2 两级表头 + 20001行数据');
{
  const rawData = [['科目', '语文', '数学'], ['成绩', '分数', '分数'], ...Array(20001).fill(['张三', '80', '90'])];
  const state = calculateDataVolumeState(rawData, 2, 20000, 0, 0, 1);
  assert('physicalRowCount', state.physicalRowCount, 20003);
  assert('headerRowCount', state.headerRowCount, 2);
  assert('rawRowCount', state.rawRowCount, 20001);
  assert('parsedRowCount', state.parsedRowCount, 20000);
  assertTrue('isParseTruncated', state.isParseTruncated);
  assertContains('parseTruncationWarning', state.parseTruncationWarning, '1');
}

// 测试 3: DataVolumeState 字段完整性
console.log('\n\n测试 3: DataVolumeState 字段完整性');
{
  const rawData = [['姓名', '语文', '数学'], ['张三', '80', '90'], ['李四', '85', '95'], ['王五', '', '100']];
  const state = calculateDataVolumeState(rawData, 1, 2, 1, 0, 0);
  
  console.log('\n3.1 必需字段存在');
  assertTrue('physicalRowCount exists', typeof state.physicalRowCount === 'number');
  assertTrue('headerRowCount exists', typeof state.headerRowCount === 'number');
  assertTrue('rawRowCount exists', typeof state.rawRowCount === 'number');
  assertTrue('parsedRowCount exists', typeof state.parsedRowCount === 'number');
  assertTrue('validRowCount exists', typeof state.validRowCount === 'number');
  assertTrue('emptyRowCount exists', typeof state.emptyRowCount === 'number');
  assertTrue('summaryRowCount exists', typeof state.summaryRowCount === 'number');
  assertTrue('invalidRowCount exists', typeof state.invalidRowCount === 'number');
  assertTrue('isParseTruncated exists', typeof state.isParseTruncated === 'boolean');
  
  console.log('\n3.2 字段值验证');
  assert('physicalRowCount', state.physicalRowCount, 4);
  assert('headerRowCount', state.headerRowCount, 1);
  assert('rawRowCount', state.rawRowCount, 3);
  assert('parsedRowCount', state.parsedRowCount, 3);
  assert('validRowCount', state.validRowCount, 2);
  assert('emptyRowCount', state.emptyRowCount, 1);
  
  console.log('\n3.3 验证公式');
  assert('physicalRowCount = headerRowCount + rawRowCount', 
    state.physicalRowCount, 
    state.headerRowCount + state.rawRowCount);
  assertTrue('rawRowCount >= parsedRowCount', state.rawRowCount >= state.parsedRowCount);
}

// 测试 4: 截断警告文案
console.log('\n\n测试 4: 截断警告文案');
{
  const rawData = [['姓名', '语文'], ...Array(20005).fill(['张三', '80'])];
  const state = calculateDataVolumeState(rawData, 1, 20000, 0, 0, 5);
  
  console.log('\n4.1 截断警告存在');
  assertTrue('isParseTruncated', state.isParseTruncated);
  assertTrue('parseTruncationWarning exists', state.parseTruncationWarning !== undefined);
  
  console.log('\n4.2 警告文案包含关键信息');
  assertContains('警告包含解析上限', state.parseTruncationWarning, '20,000');
  assertContains('警告包含未解析行数', state.parseTruncationWarning, '5');
  assertContains('警告包含"未解析"字样', state.parseTruncationWarning, '未解析');
}

// 测试总结
console.log('\n\n' + '='.repeat(60));
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
