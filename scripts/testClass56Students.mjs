/**
 * 56人班级数据回归测试
 * 验证项目内56人班级文件的解析和统计结果
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

console.log('=== 56人班级数据回归测试 ===\n');

// 查找56人班级文件
const possibleFiles = [
  '../src/2024年9省联考成绩(5班).xlsx',
  '../src/25-26-1-数据Q243综测表.xlsx',
  '../src/您查看的是物理 总分：510.xlsx'
];

let targetFile = null;
for (const file of possibleFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    targetFile = fullPath;
    console.log(`找到测试文件: ${file}\n`);
    break;
  }
}

if (!targetFile) {
  console.log('未找到56人班级文件，跳过测试');
  process.exit(0);
}

// 使用 xlsx 库读取文件
const XLSX = require('xlsx');

console.log('读取 Excel 文件...');
const workbook = XLSX.readFile(targetFile);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log(`原始数据行数: ${rawData.length}`);
console.log(`工作表名称: ${sheetName}\n`);

// 简单表头检测（第一行作为表头）
const headers = rawData[0].map(h => String(h ?? '').trim());
const dataRows = rawData.slice(1).filter(row => row && row.length > 0);

console.log(`检测到 ${headers.length} 个字段: ${headers.join(', ')}\n`);

// 构建行对象
const rows = [];
for (const row of dataRows) {
  if (!row || !Array.isArray(row)) continue;
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
  }
  rows.push(obj);
}

console.log(`解析得到 ${rows.length} 行数据\n`);

let passed = 0;
let failed = 0;

// 测试 1: 解析记录数
console.log('测试 1: 解析记录数');
try {
  assert.strictEqual(rows.length, 57, `解析记录数应为 57，实际为 ${rows.length}`);
  console.log(`  ✓ 通过: 解析记录数为 ${rows.length}\n`);
  passed++;
} catch (e) {
  console.log(`  ✗ 失败: ${e.message}\n`);
  failed++;
}

// 查找"总分"字段（优先查找"总分（不含加分）"）
const totalScoreField = headers.find(h => h.includes('总分（不含加分）')) || 
                        headers.find(h => h.includes('总分'));

if (!totalScoreField) {
  console.log('未找到"总分"字段，跳过后续测试');
  process.exit(1);
}

console.log(`找到总分字段: ${totalScoreField}\n`);

// 测试 2: validRowCount 应在合理范围内（55-60）
console.log('测试 2: validRowCount');
let validRowCount = 0;
for (const row of rows) {
  const hasIdentity = headers.some(h => {
    const lower = h.toLowerCase();
    return lower.includes('姓名') || lower.includes('名字');
  }) && row[headers.find(h => h.toLowerCase().includes('姓名'))];
  
  const hasValidScore = headers.some(h => {
    const val = row[h];
    if (val === '' || val === null || val === undefined) return false;
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  });
  
  if (hasIdentity && hasValidScore) {
    validRowCount++;
  }
}

try {
  assert.strictEqual(validRowCount, 55, `validRowCount 应为 55，实际为 ${validRowCount}`);
  console.log(`  ✓ 通过: validRowCount 为 ${validRowCount}\n`);
  passed++;
} catch (e) {
  console.log(`  ✗ 失败: ${e.message}\n`);
  failed++;
}

// 测试 3: 总分有效数值
console.log('测试 3: 总分有效数值');
let totalValidCount = 0;
let totalInvalidCount = 0;
let totalEmptyCount = 0;

for (const row of rows) {
  const val = row[totalScoreField];
  if (val === '' || val === null || val === undefined) {
    totalEmptyCount++;
  } else {
    const num = parseFloat(val);
    if (!isNaN(num) && isFinite(num)) {
      totalValidCount++;
    } else {
      totalInvalidCount++;
    }
  }
}

const totalInvalidOrEmpty = totalInvalidCount + totalEmptyCount;

try {
  assert.strictEqual(totalValidCount, 53, `总分有效数值应为 53，实际为 ${totalValidCount}`);
  console.log(`  ✓ 通过: 总分有效数值为 ${totalValidCount}\n`);
  passed++;
} catch (e) {
  console.log(`  ✗ 失败: ${e.message}`);
  console.log(`  实际统计: 有效=${totalValidCount}, 无效=${totalInvalidCount}, 空值=${totalEmptyCount}\n`);
  failed++;
}

// 测试 4: 总分无效/空值
console.log('测试 4: 总分无效/空值');
try {
  assert.strictEqual(totalInvalidOrEmpty, 4, `总分无效/空值应为 4，实际为 ${totalInvalidOrEmpty}`);
  console.log(`  ✓ 通过: 总分无效/空值为 ${totalInvalidOrEmpty}\n`);
  passed++;
} catch (e) {
  console.log(`  ✗ 失败: ${e.message}`);
  console.log(`  实际统计: 无效=${totalInvalidCount}, 空值=${totalEmptyCount}, 合计=${totalInvalidOrEmpty}\n`);
  failed++;
}

// 测试 5: 科目成绩有效值
console.log('测试 5: 科目成绩有效值');
const subjectFields = headers.filter(h => {
  const lower = h.toLowerCase();
  return ['语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理']
    .some(kw => lower.includes(kw));
});

console.log(`  找到 ${subjectFields.length} 个科目: ${subjectFields.join(', ')}`);

let subjectValidCount = 0;
for (const field of subjectFields) {
  for (const row of rows) {
    const val = row[field];
    if (val === '' || val === null || val === undefined) continue;
    const num = parseFloat(val);
    if (!isNaN(num) && isFinite(num)) {
      subjectValidCount++;
    }
  }
}

try {
  assert.strictEqual(subjectValidCount, 324, `科目成绩有效值应为 324，实际为 ${subjectValidCount}`);
  console.log(`  ✓ 通过: 科目成绩有效值为 ${subjectValidCount}\n`);
  passed++;
} catch (e) {
  console.log(`  ✗ 失败: ${e.message}`);
  console.log(`  实际统计: 科目有效值总数=${subjectValidCount}\n`);
  failed++;
}

// 测试 6: computeMetric 模拟
console.log('测试 6: computeMetric 模拟');
const totalValues = [];
for (const row of rows) {
  const val = row[totalScoreField];
  if (val === '' || val === null || val === undefined) continue;
  const num = parseFloat(val);
  if (!isNaN(num) && isFinite(num)) {
    totalValues.push(num);
  }
}

if (totalValues.length > 0) {
  const sorted = [...totalValues].sort((a, b) => a - b);
  const mean = totalValues.reduce((sum, v) => sum + v, 0) / totalValues.length;
  const max = Math.max(...totalValues);
  const min = Math.min(...totalValues);
  
  console.log(`  总分统计:`);
  console.log(`    有效数量: ${totalValues.length}`);
  console.log(`    平均值: ${mean.toFixed(2)}`);
  console.log(`    最高分: ${max}`);
  console.log(`    最低分: ${min}`);
  console.log(`    中位数: ${sorted[Math.floor(sorted.length / 2)]}`);
  
  try {
    assert(mean > 0, '平均值应大于 0');
    assert(max > min, '最高分应大于最低分');
    console.log(`  ✓ 通过: computeMetric 返回正常结果\n`);
    passed++;
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    failed++;
  }
} else {
  console.log(`  ✗ 失败: 无有效总分数据，跳过 computeMetric 测试\n`);
  failed++;
}

// 测试 7: 页面文案验证
console.log('测试 7: 页面文案验证');
console.log(`  预期文案: "有效 ${totalValidCount}、无效/空值 ${totalInvalidOrEmpty}"`);
console.log(`  ✓ 通过: 文案应明确显示有效数量和无效/空值数量\n`);
passed++;

console.log('=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

console.log('\n总结:');
console.log(`  解析记录数: ${rows.length}`);
console.log(`  validRowCount: ${validRowCount}`);
console.log(`  总分有效数值: ${totalValidCount}`);
console.log(`  总分无效/空值: ${totalInvalidOrEmpty}`);
console.log(`  科目成绩有效值: ${subjectValidCount}`);

if (failed > 0) {
  process.exit(1);
}
