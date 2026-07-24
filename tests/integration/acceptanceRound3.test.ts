/**
 * 第三重独立验收真实源码测试
 * 
 * 直接导入并调用真实源码：
 * - parseTableText
 * - parseRawRows
 * - classifyDataRows
 * - classifyFields
 * 
 * 测试内容：
 * 1. 三列表不被误判为汇总行
 * 2. rank 误判修复（普通成绩60-100不为rank）
 * 3. 5000/5001/20000/20001 行数据验证
 * 4. 56×18宽表字段识别
 * 5. 56×18长表字段识别
 * 6. 销售表字段和行分类
 */

import { parseTableText } from '../../src/utils/parseTable.js';
import { parseRawRows } from '../../src/utils/tableParser/workbook.js';
import { classifyDataRows } from '../../src/utils/tableParser/rowClassifier.js';
import { classifyFields } from '../../src/utils/tableParser/fieldClassifier.js';
import type { FieldMeta } from '../../src/utils/tableParser/types.js';

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

function generateSalesTable(rows: number, cols: number = 3): string {
  const headers = cols === 3 
    ? ['订单号', '销售额', '地区'] 
    : ['订单号', '销售额', '成本', '利润', '数量', '地区', '日期'];
  
  const regions = ['华东', '华北', '华南', '西南', '西北', '东北', '华中'];
  const lines: string[] = [headers.join('\t')];
  
  for (let i = 1; i <= rows; i++) {
    const row: string[] = [];
    if (cols === 3) {
      row.push(`ORD${String(i).padStart(6, '0')}`);
      row.push((Math.random() * 10000 + 100).toFixed(2));
      row.push(regions[i % regions.length]);
    } else {
      row.push(`ORD${String(i).padStart(6, '0')}`);
      const sales = Math.random() * 10000 + 100;
      row.push(sales.toFixed(2));
      row.push((sales * 0.6).toFixed(2));
      row.push((sales * 0.4).toFixed(2));
      row.push(String(Math.floor(Math.random() * 100 + 1)));
      row.push(regions[i % regions.length]);
      row.push(`2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
    }
    lines.push(row.join('\t'));
  }
  
  return lines.join('\n');
}

function generateScoreWideTable(rows: number, subjects: string[]): string {
  const headers = ['学号', '姓名', ...subjects];
  const lines: string[] = [headers.join('\t')];
  
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
  const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];
  
  for (let i = 1; i <= rows; i++) {
    const row: string[] = [];
    row.push(`2024${String(i).padStart(4, '0')}`);
    row.push(surnames[i % surnames.length] + names[i % names.length]);
    for (let j = 0; j < subjects.length; j++) {
      const score = 60 + Math.floor(Math.random() * 40);
      row.push(String(score));
    }
    lines.push(row.join('\t'));
  }
  
  return lines.join('\n');
}

function generateScoreLongTable(rows: number, subjects: string[]): string {
  const headers = ['学号', '姓名', '科目', '成绩'];
  const lines: string[] = [headers.join('\t')];
  
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
  const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];
  
  for (let i = 1; i <= rows; i++) {
    for (const subject of subjects) {
      const row: string[] = [];
      row.push(`2024${String(i).padStart(4, '0')}`);
      row.push(surnames[i % surnames.length] + names[i % names.length]);
      row.push(subject);
      const score = 60 + Math.floor(Math.random() * 40);
      row.push(String(score));
      lines.push(row.join('\t'));
    }
  }
  
  return lines.join('\n');
}

console.log('='.repeat(60));
console.log('第三重独立验收真实源码测试');
console.log('='.repeat(60));

// ============================================================
// 测试一：三列表不被误判为汇总行
// ============================================================
console.log('\n📊 测试一：三列销售表不被误判为汇总行');

const sales3col = generateSalesTable(100, 3);
const sales3result = parseTableText(sales3col);
const sales3summary = sales3result.summary;

assert('三列表 parsedRowCount > 0', sales3result.rows.length > 0);
assert('三列表 validDataRows = 100 (不是0)', sales3summary?.validDataRows === 100, 
  `实际: ${sales3summary?.validDataRows}`);
assert('三列表 summaryRows = 0', sales3summary?.summaryRows === 0, 
  `实际: ${sales3summary?.summaryRows}`);
assert('三列表 emptyRows = 0', sales3summary?.emptyRows === 0,
  `实际: ${sales3summary?.emptyRows}`);

// ============================================================
// 测试二：5000/5001/20000/20001 行验证
// ============================================================
console.log('\n📊 测试二：大数据量行分类和截断验证');

// 5000 行
console.log('  5000 行三列销售表:');
const sales5000 = generateSalesTable(5000, 3);
const result5000 = parseTableText(sales5000);
assert('5000行 validDataRows = 5000', result5000.summary?.validDataRows === 5000,
  `实际: ${result5000.summary?.validDataRows}`);
assert('5000行 summaryRows = 0', result5000.summary?.summaryRows === 0,
  `实际: ${result5000.summary?.summaryRows}`);
assert('5000行 isParseTruncated = false', result5000.dataVolumeState?.isParseTruncated === false,
  `实际: ${result5000.dataVolumeState?.isParseTruncated}`);

// 5001 行
console.log('  5001 行三列销售表:');
const sales5001 = generateSalesTable(5001, 3);
const result5001 = parseTableText(sales5001);
assert('5001行 validDataRows = 5001', result5001.summary?.validDataRows === 5001,
  `实际: ${result5001.summary?.validDataRows}`);
assert('5001行 summaryRows = 0', result5001.summary?.summaryRows === 0,
  `实际: ${result5001.summary?.summaryRows}`);

// 20000 行
console.log('  20000 行三列销售表:');
const sales20000 = generateSalesTable(20000, 3);
const result20000 = parseTableText(sales20000);
assert('20000行 validDataRows = 20000', result20000.summary?.validDataRows === 20000,
  `实际: ${result20000.summary?.validDataRows}`);
assert('20000行 isParseTruncated = false', result20000.dataVolumeState?.isParseTruncated === false,
  `实际: ${result20000.dataVolumeState?.isParseTruncated}`);

// 20001 行
console.log('  20001 行三列销售表:');
const sales20001 = generateSalesTable(20001, 3);
const result20001 = parseTableText(sales20001);
assert('20001行 parsedRowCount = 20000', result20001.dataVolumeState?.parsedRowCount === 20000,
  `实际: ${result20001.dataVolumeState?.parsedRowCount}`);
assert('20001行 isParseTruncated = true', result20001.dataVolumeState?.isParseTruncated === true,
  `实际: ${result20001.dataVolumeState?.isParseTruncated}`);

// ============================================================
// 测试三：rank 误判修复（普通成绩60-100不为rank）
// ============================================================
console.log('\n📊 测试三：rank 误判修复验证');

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '体育', '音乐', '美术'];

// 56行宽表
console.log('  56行×9科目宽表（成绩60~99）:');
const wide56 = generateScoreWideTable(56, subjects);
const wide56result = parseTableText(wide56);
const wide56fields: FieldMeta[] = wide56result.summary?.fieldTypes || [];

// 验证所有科目都不是 rank
const rankFields = wide56fields.filter(f => f.analysisRole === 'rank');
const nonIdentityRankFields = rankFields.filter(f => 
  !f.header.includes('排名') && !f.header.includes('名次') && !f.header.includes('位次')
);

assert('体育成绩不是rank', 
  wide56fields.find(f => f.header === '体育')?.analysisRole !== 'rank',
  `实际: ${wide56fields.find(f => f.header === '体育')?.analysisRole}`);
assert('音乐成绩不是rank', 
  wide56fields.find(f => f.header === '音乐')?.analysisRole !== 'rank',
  `实际: ${wide56fields.find(f => f.header === '音乐')?.analysisRole}`);
assert('美术成绩不是rank', 
  wide56fields.find(f => f.header === '美术')?.analysisRole !== 'rank',
  `实际: ${wide56fields.find(f => f.header === '美术')?.analysisRole}`);
assert('不含排名关键词的字段都不是rank', nonIdentityRankFields.length === 0,
  `误判为rank的字段: ${nonIdentityRankFields.map(f => f.header).join(', ')}`);

// 测试含"排名"字段的情况
console.log('  含"排名"字段的表:');
const rankHeaders = ['学号', '姓名', '总分', '年级排名'];
const rankRowsArr: string[][] = [rankHeaders];
const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];

for (let i = 1; i <= 56; i++) {
  rankRowsArr.push([
    `2024${String(i).padStart(4, '0')}`,
    surnames[i % surnames.length] + names[i % names.length],
    String(400 + Math.floor(Math.random() * 100)),
    String(i)
  ]);
}

const rankText = rankRowsArr.map(r => r.join('\t')).join('\n');
const rankResult = parseTableText(rankText);
const rankFields2: FieldMeta[] = rankResult.summary?.fieldTypes || [];
const rankField = rankFields2.find(f => f.header === '年级排名');

assert('"年级排名"字段识别为rank', rankField?.analysisRole === 'rank',
  `实际: ${rankField?.analysisRole}`);

// ============================================================
// 测试四：56×18宽表字段识别
// ============================================================
console.log('\n📊 测试四：56×18宽表字段识别');

const manySubjects = [
  '语文', '数学', '英语', '物理', '化学', '生物',
  '政治', '历史', '地理', '体育', '音乐', '美术',
  '信息技术', '通用技术', '心理健康', '劳动技术', '研究性学习', '社会实践'
];

const wide18 = generateScoreWideTable(56, manySubjects);
const wide18result = parseTableText(wide18);
const wide18fields: FieldMeta[] = wide18result.summary?.fieldTypes || [];

assert('56×18宽表 rows = 56', wide18result.rows.length === 56,
  `实际: ${wide18result.rows.length}`);
assert('56×18宽表字段数 = 20（学号+姓名+18科目）', wide18fields.length === 20,
  `实际: ${wide18fields.length}`);

// 检查普通科目的识别类型
const peField = wide18fields.find(f => f.header === '体育');
const musicField = wide18fields.find(f => f.header === '音乐');
const artField = wide18fields.find(f => f.header === '美术');

assert('体育字段类型为 score 或 courseScore 或 number/metric', 
  peField?.analysisRole === 'courseScore' || peField?.analysisRole?.includes('score') || 
  peField?.analysisRole?.includes('number') || peField?.analysisRole?.includes('metric'),
  `实际: ${peField?.analysisRole}`);
assert('音乐字段类型不为rank', musicField?.analysisRole !== 'rank',
  `实际: ${musicField?.analysisRole}`);
assert('美术字段类型不为rank', artField?.analysisRole !== 'rank',
  `实际: ${artField?.analysisRole}`);

console.log('  字段识别详情:');
for (const f of wide18fields) {
  console.log(`    - ${f.header}: ${f.analysisRole} (confidence: ${f.confidence})`);
}

// ============================================================
// 测试五：56×18长表字段识别
// ============================================================
console.log('\n📊 测试五：56×18长表字段识别');

const longSubjects = manySubjects.slice(0, 18);
const longTable = generateScoreLongTable(56, longSubjects);
const longResult = parseTableText(longTable);
const longFields: FieldMeta[] = longResult.summary?.fieldTypes || [];

assert('长表 parsedRowCount = 56×18 = 1008', longResult.rows.length === 1008,
  `实际: ${longResult.rows.length}`);
assert('长表 validDataRows = 1008', longResult.summary?.validDataRows === 1008,
  `实际: ${longResult.summary?.validDataRows}`);
assert('长表字段数 = 4（学号+姓名+科目+成绩）', longFields.length === 4,
  `实际: ${longFields.length}`);

console.log('  长表字段识别:');
for (const f of longFields) {
  console.log(`    - ${f.header}: ${f.analysisRole} (confidence: ${f.confidence})`);
}

// ============================================================
// 测试六：七列销售表字段和行分类
// ============================================================
console.log('\n📊 测试六：七列销售表字段和行分类');

const sales7col = generateSalesTable(200, 7);
const sales7result = parseTableText(sales7col);
const sales7fields: FieldMeta[] = sales7result.summary?.fieldTypes || [];

assert('七列销售表 validDataRows = 200', sales7result.summary?.validDataRows === 200,
  `实际: ${sales7result.summary?.validDataRows}`);
assert('七列销售表 summaryRows = 0', sales7result.summary?.summaryRows === 0,
  `实际: ${sales7result.summary?.summaryRows}`);
assert('七列销售表字段数 = 7', sales7fields.length === 7,
  `实际: ${sales7fields.length}`);

console.log('  销售表字段识别:');
for (const f of sales7fields) {
  console.log(`    - ${f.header}: ${f.analysisRole} (confidence: ${f.confidence})`);
}

// ============================================================
// 测试七：明确汇总行识别
// ============================================================
console.log('\n📊 测试七：明确汇总行识别验证');

// 使用 classifyDataRows 直接测试（避免表头检测干扰）
const summaryTestRows = [
  { '订单号': 'ORD000001', '销售额': '1234.56', '地区': '华东' },
  { '订单号': 'ORD000002', '销售额': '2345.67', '地区': '华北' },
  { '订单号': 'ORD000003', '销售额': '3456.78', '地区': '华南' },
  { '订单号': 'ORD000004', '销售额': '4567.89', '地区': '西南' },
  { '订单号': 'ORD000005', '销售额': '5678.90', '地区': '西北' },
  { '订单号': '合计', '销售额': '17283.80', '地区': '' },
  { '订单号': '平均', '销售额': '3456.76', '地区': '' },
  { '订单号': '总计', '销售额': '17283.80', '地区': '' },
  { '订单号': '汇总', '销售额': '17283.80', '地区': '' },
];
const summaryTestHeaders = ['订单号', '销售额', '地区'];

const summaryRowResult = classifyDataRows(summaryTestRows, summaryTestHeaders);

assert('汇总测试 validData = 5', summaryRowResult.validData === 5,
  `实际: ${summaryRowResult.validData}`);
assert('汇总测试 summary = 4 (合计/平均/总计/汇总)', summaryRowResult.summary === 4,
  `实际: ${summaryRowResult.summary}`);

// ============================================================
// 测试八：classifyDataRows 和 classifyFields 直接调用
// ============================================================
console.log('\n📊 测试八：直接调用 classifyDataRows 和 classifyFields');

// 构造 parseRawRows 输入格式
const testHeaders = ['订单号', '销售额', '地区'];
const testRawRows: any[][] = [testHeaders];
for (let i = 1; i <= 10; i++) {
  testRawRows.push([`ORD${String(i).padStart(6, '0')}`, (i * 100.5).toFixed(2), '华东']);
}

const rawResult = parseRawRows(testRawRows);
assert('parseRawRows 返回 headers', rawResult.headers.length === 3);
assert('parseRawRows 返回 rows', rawResult.rows.length === 10);
assert('parseRawRows 返回 dataVolumeState', rawResult.dataVolumeState !== undefined);

// 直接调用 classifyDataRows
const rowClassification = classifyDataRows(rawResult.rows, rawResult.headers);
assert('classifyDataRows 返回 validData', rowClassification.validData === 10,
  `实际: ${rowClassification.validData}`);
assert('classifyDataRows 返回 summary = 0', rowClassification.summary === 0,
  `实际: ${rowClassification.summary}`);

// 直接调用 classifyFields
const fieldClassification = classifyFields(rawResult.headers, rawResult.rows);
assert('classifyFields 返回字段数组', fieldClassification.length === 3);

console.log('  classifyFields 结果:');
for (const f of fieldClassification) {
  console.log(`    - ${f.header}: ${f.analysisRole}`);
}

// ============================================================
// 测试结果汇总
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📋 总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 有测试失败，退出码 1');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
}
