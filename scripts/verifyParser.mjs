// Parser verification test script
import { detectHeaderRow, parseRowsToTable, dedupeHeaders, cleanHeaderName, filterDataRows } from '../src/utils/tableParser.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ 失败: ${message}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ 通过: ${name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e.message}`);
  }
}

// ============================================================
// Test 1: 第一行就是表头
// ============================================================
test('第一行就是表头', () => {
  const rows = [
    ['名次', '总分', '外语'],
    ['1', '650', '130'],
    ['2', '640', '125'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 0, `headerRowIndex 应为 0，实际 ${result.headerRowIndex}`);
  assert(result.headers[0] === '名次', '第一个表头应为 名次');
  assert(result.headers[1] === '总分', '第二个表头应为 总分');
});

// ============================================================
// Test 2: 前面有标题和说明，表头在后面
// ============================================================
test('前面有说明行，表头在第 4 行', () => {
  const rows = [
    ['2024年期末考试成绩查询结果'],
    ['查询条件：高二年级'],
    [''],
    ['名次', '总分', '语文', '数学', '外语'],
    ['1', '680', '135', '148', '142'],
    ['2', '670', '130', '145', '138'],
    ['3', '660', '128', '140', '135'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 3, `headerRowIndex 应为 3，实际 ${result.headerRowIndex}`);
  assert(result.headers[0] === '名次', '第一个表头应为 名次');
  assert(result.headers[1] === '总分', '第二个表头应为 总分');
});

// ============================================================
// Test 3: 表头前有空行
// ============================================================
test('表头前有空行', () => {
  const rows = [
    ['标题'],
    [''],
    ['说明文字'],
    [''],
    ['名次', '总分', '外语'],
    ['1', '650', '130'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 4, `headerRowIndex 应为 4，实际 ${result.headerRowIndex}`);
});

// ============================================================
// Test 4: 表头重复字段自动重命名
// ============================================================
test('重复字段自动重命名', () => {
  const rows = [
    ['名次', '总分', '总分', '外语'],
    ['1', '650', '140', '130'],
  ];
  const warnings = [];
  const headers = dedupeHeaders(rows[0].map(String), warnings);
  assert(headers[0] === '名次', '第一个字段应为 名次');
  assert(headers[1] === '总分', '第二个字段应为 总分');
  assert(headers[2] === '总分_2', '第三个字段应为 总分_2');
  assert(headers[3] === '外语', '第四个字段应为 外语');
  assert(warnings.length > 0, '应有重复字段警告');
});

// ============================================================
// Test 5: 表头中有空字段
// ============================================================
test('表头中有空字段自动命名', () => {
  const rows = [
    ['名次', '', '总分', '', '外语'],
    ['1', 'A', '650', 'B', '130'],
  ];
  const warnings = [];
  const headers = dedupeHeaders(rows[0].map(String), warnings);
  assert(headers[0] === '名次', '第一个字段应为 名次');
  assert(headers[1] === '未命名字段1', '空字段应自动命名');
  assert(headers[2] === '总分', '第三个字段应为 总分');
  assert(headers[3] === '未命名字段2', '第二个空字段应自动命名');
  assert(headers[4] === '外语', '第五个字段应为 外语');
});

// ============================================================
// Test 6: 只有说明文字，没有表头
// ============================================================
test('只有说明文字，抛出明确错误', () => {
  const rows = [
    ['2024年期末考试成绩查询结果'],
    ['查询条件：高二年级'],
    ['请携带身份证到教务处查询'],
  ];
  try {
    parseRowsToTable(rows);
    assert(false, '应抛出错误');
  } catch (e) {
    assert(
      e.message.includes('未能识别有效表头'),
      `错误消息应包含"未能识别有效表头"，实际: ${e.message}`,
    );
  }
});

// ============================================================
// Test 7: 识别到表头但没有数据行
// ============================================================
test('识别到表头但没有数据行，抛出明确错误', () => {
  const rows = [
    ['名次', '总分', '外语'],
  ];
  try {
    parseRowsToTable(rows);
    assert(false, '应抛出错误');
  } catch (e) {
    assert(
      e.message.includes('已识别到表头') && e.message.includes('数据行'),
      `错误消息应提示已识别表头但无数据，实际: ${e.message}`,
    );
  }
});

// ============================================================
// Test 8: 真实场景 - 前面有多行说明，表头在中间
// ============================================================
test('真实场景：前面多行说明 + 空行 + 表头', () => {
  const rows = [
    ['2024年学业水平测试成绩'],
    ['考生成绩查询结果'],
    [''],
    ['注：以下成绩仅供参考'],
    [''],
    ['名次', '总分', '语文数学两科之和', '语文或数学单科最高成绩', '外语单科成绩', '首选科目单科成绩', '再选科目单科最高成绩', '再选科目单科次高成绩'],
    ['1', '680', '280', '145', '142', '95', '98', '92'],
    ['2', '670', '275', '140', '138', '93', '95', '88'],
    ['3', '660', '268', '138', '135', '90', '92', '85'],
    ['4', '650', '260', '135', '130', '88', '90', '82'],
    ['5', '640', '255', '132', '128', '85', '88', '80'],
  ];
  const result = detectHeaderRow(rows);
  assert(result.headerRowIndex === 5, `headerRowIndex 应为 5，实际 ${result.headerRowIndex}`);
  assert(result.headers[0] === '名次', '第一个表头应为 名次');
  assert(result.headers[1] === '总分', '第二个表头应为 总分');
  assert(result.headers[5] === '外语单科成绩', '第六个表头应为 外语单科成绩');
  assert(result.dataRows.length >= 5, `数据行应 >= 5，实际 ${result.dataRows.length}`);
});

// ============================================================
// Test 9: cleanHeaderName 去除不可见字符
// ============================================================
test('cleanHeaderName 去除空白和合并空格', () => {
  assert(cleanHeaderName('  总分  ') === '总分', '去除首尾空格');
  assert(cleanHeaderName('总  分') === '总 分', '合并连续空格');
  assert(cleanHeaderName('') === '', '空字符串保持空');
  assert(cleanHeaderName('\t 外语 \n') === '外语', '去除制表符和换行');
});

// ============================================================
// Test 10: filterDataRows 过滤说明行
// ============================================================
test('filterDataRows 过滤说明性文字行', () => {
  const headers = ['名次', '总分', '外语'];
  const rawRows = [
    ['1', '650', '130'],
    ['注：成绩仅供参考'],
    ['2', '640', '125'],
    ['', '', ''],
    ['3', '630', '120'],
  ];
  const rows = filterDataRows(rawRows, headers);
  assert(rows.length === 3, `数据行应为 3，实际 ${rows.length}`);
  assert(rows[0]['名次'] === '1', '第一行名次应为 1');
  assert(rows[1]['名次'] === '2', '第二行名次应为 2');
  assert(rows[2]['名次'] === '3', '第三行名次应为 3');
});

// ============================================================
// Summary
// ============================================================
console.log('');
console.log(`=== 解析器测试 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(failed === 0 ? '✅ 全部测试通过。' : '❌ 有测试失败。');
process.exit(failed === 0 ? 0 : 1);
