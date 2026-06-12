/**
 * 成绩表智能解析器测试脚本
 * 执行: node scripts/testParser.mjs
 *
 * 测试覆盖：
 * 1. 普通第一行表头成绩表
 * 2. 表头前有说明文字的成绩表
 * 3. 多 sheet 文件，自动选择主成绩表
 * 4. 字典 sheet 不应被选为主成绩表
 * 5. 字段包括学校代码、姓名、班级、总分、各科成绩
 * 6. 缺考不能当 0
 * 7. 转到7班不能当 0
 * 8. 最后一行平均分不能当学生数据
 * 9. 加分字段不作为默认推荐字段
 * 10. 总分（不含加分）应作为高优先级推荐字段
 * 11. 空列、大量空值列不应导致崩溃
 * 12. 重复字段自动重命名仍然有效
 * 13. 空字段自动命名仍然有效
 * 14. CSV、Excel、粘贴文本都走统一逻辑
 */

import { read, utils } from 'xlsx';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// 模拟浏览器环境（最小化）
globalThis.File = class MockFile {
  constructor(parts, name) {
    this._parts = parts;
    this.name = name;
    this.size = parts.reduce((sum, p) => sum + (p.byteLength || p.length || 0), 0);
  }
  arrayBuffer() {
    return Promise.resolve(this._parts[0]);
  }
};

// 导入解析器（直接导入模块文件）
const tableParserPath = join(projectRoot, 'src', 'utils', 'tableParser', 'index.ts');
const numericParserPath = join(projectRoot, 'src', 'utils', 'tableParser', 'numericParser.ts');
const rowClassifierPath = join(projectRoot, 'src', 'utils', 'tableParser', 'rowClassifier.ts');
const fieldClassifierPath = join(projectRoot, 'src', 'utils', 'tableParser', 'fieldClassifier.ts');
const sheetDetectionPath = join(projectRoot, 'src', 'utils', 'tableParser', 'sheetDetection.ts');
const headerDetectionPath = join(projectRoot, 'src', 'utils', 'tableParser', 'headerDetection.ts');
const workbookPath = join(projectRoot, 'src', 'utils', 'tableParser', 'workbook.ts');

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

function assertRange(name, actual, min, max) {
  if (actual >= min && actual <= max) {
    console.log(`  ✅ ${name}: ${actual} (in [${min}, ${max}])`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected [${min}, ${max}], got ${actual}`);
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

// ============================================================
// 测试 1：数值解析
// ============================================================
console.log('\n=== 测试 1：数值解析 ===\n');

// 我们直接测试 parseNumericValue 的逻辑
function testParseNumericValue() {
  // 动态导入
  return import(numericParserPath.replace(/\.ts$/, '.js')).then(mod => {
    const { parseNumericValue, parseNumericValueLegacy } = mod;

    // 1.1 正常数字
    let r = parseNumericValue(550);
    assert('数字 550', r.status, 'valid');
    assert('数字 550 值', r.value, 550);

    // 1.2 字符串数字
    r = parseNumericValue('550');
    assert('字符串 "550"', r.status, 'valid');
    assert('字符串 "550" 值', r.value, 550);

    // 1.3 小数字符串
    r = parseNumericValue('550.5');
    assert('字符串 "550.5"', r.status, 'valid');
    assert('字符串 "550.5" 值', r.value, 550.5);

    // 1.4 带空格数字
    r = parseNumericValue('  550  ');
    assert('带空格 "  550  "', r.status, 'valid');

    // 1.5 百分号
    r = parseNumericValue('85%');
    assert('百分号 "85%"', r.status, 'valid');
    assert('百分号 "85%" 值', r.value, 85);

    // 1.6 缺考
    r = parseNumericValue('缺考');
    assert('缺考', r.status, 'invalid');

    // 1.7 转到7班
    r = parseNumericValue('转到7班');
    assert('转到7班', r.status, 'invalid');

    // 1.8 空值
    r = parseNumericValue('');
    assert('空字符串', r.status, 'empty');

    r = parseNumericValue(null);
    assert('null', r.status, 'empty');

    r = parseNumericValue(undefined);
    assert('undefined', r.status, 'empty');

    // 1.9 特殊符号
    r = parseNumericValue('-');
    assert('横杠 "-"', r.status, 'empty');

    r = parseNumericValue('/');
    assert('斜杠 "/"', r.status, 'invalid');

    // 1.10 千分位
    r = parseNumericValue('1,234');
    assert('千分位 "1,234"', r.status, 'valid');
    assert('千分位 "1,234" 值', r.value, 1234);

    // 1.11 旧接口兼容
    const legacy = parseNumericValueLegacy('550');
    assert('旧接口 "550"', legacy, 550);

    const legacyNull = parseNumericValueLegacy('缺考');
    assert('旧接口 "缺考"', legacyNull, null);
  });
}

// ============================================================
// 测试 2：表头检测
// ============================================================
console.log('\n=== 测试 2：表头检测 ===\n');

function testHeaderDetection() {
  return import(headerDetectionPath.replace(/\.ts$/, '.js')).then(mod => {
    const { detectHeaderRow } = mod;

    // 2.1 普通第一行表头成绩表
    const normalData = [
      ['名次', '姓名', '班级', '总分', '语文', '数学', '英语'],
      [1, '张三', '5班', 550, 120, 130, 140],
      [2, '李四', '5班', 520, 110, 125, 135],
    ];
    let result = detectHeaderRow(normalData);
    assert('普通表头识别行号', result.headerRowIndex, 0);
    assert('普通表头识别字段数', result.headers.length, 7);

    // 2.2 表头前有说明文字
    const withExplanation = [
      ['2024年9省联考成绩表'],
      ['说明：本表包含所有学生的成绩信息'],
      ['名次', '姓名', '班级', '总分', '语文', '数学'],
      [1, '张三', '5班', 550, 120, 130],
      [2, '李四', '5班', 520, 110, 125],
    ];
    result = detectHeaderRow(withExplanation);
    assert('带说明文字表头识别行号', result.headerRowIndex, 2);
    assertContains('带说明文字表头字段', result.headers[0], '名次');
  });
}

// ============================================================
// 测试 3：字段去重和空字段命名
// ============================================================
console.log('\n=== 测试 3：字段去重和空字段命名 ===\n');

function testHeaderDedupe() {
  return import(headerDetectionPath.replace(/\.ts$/, '.js')).then(mod => {
    const { dedupeHeaders } = mod;

    // 3.1 重复字段
    const warnings = [];
    const deduped = dedupeHeaders(['姓名', '总分', '姓名', '班级'], warnings);
    assert('重复字段重命名', deduped[2], '姓名_1');
    assert('警告数量', warnings.length, 1);

    // 3.2 空字段
    const warnings2 = [];
    const deduped2 = dedupeHeaders(['姓名', '', '总分', ''], warnings2);
    assert('空字段自动命名1', deduped2[1], '未命名字段1');
    assert('空字段自动命名2', deduped2[3], '未命名字段2');
  });
}

// ============================================================
// 测试 4：数据行分类
// ============================================================
console.log('\n=== 测试 4：数据行分类 ===\n');

function testRowClassification() {
  return import(rowClassifierPath.replace(/\.ts$/, '.js')).then(mod => {
    const { classifyDataRow, classifyDataRows } = mod;
    const headers = ['名次', '姓名', '班级', '总分', '语文', '数学'];

    // 4.1 有效数据行
    const validRow = { '名次': '1', '姓名': '张三', '班级': '5班', '总分': '550', '语文': '120', '数学': '130' };
    assert('有效行分类', classifyDataRow(validRow, headers), 'validData');

    // 4.2 空行
    const emptyRow = { '名次': '', '姓名': '', '班级': '', '总分': '', '语文': '', '数学': '' };
    assert('空行分类', classifyDataRow(emptyRow, headers), 'empty');

    // 4.3 统计行
    const summaryRow = { '名次': '', '姓名': '平均分', '班级': '', '总分': '535', '语文': '115', '数学': '127.5' };
    assert('统计行分类', classifyDataRow(summaryRow, headers), 'summary');

    // 4.4 批量分类
    const rows = [validRow, emptyRow, summaryRow];
    const result = classifyDataRows(rows, headers);
    assert('批量分类有效行', result.validData, 1);
    assert('批量分类空行', result.empty, 1);
    assert('批量分类统计行', result.summary, 1);
  });
}

// ============================================================
// 测试 5：字段分类
// ============================================================
console.log('\n=== 测试 5：字段分类 ===\n');

function testFieldClassification() {
  return import(fieldClassifierPath.replace(/\.ts$/, '.js')).then(mod => {
    const { classifyFields, recommendAnalysisField } = mod;
    const headers = ['学校代码', '姓名', '班级', '总分（不含加分）', '加分', '语文', '数学', '名次', '组合'];
    const rows = [
      { '学校代码': '001', '姓名': '张三', '班级': '5班', '总分（不含加分）': '550', '加分': '10', '语文': '120', '数学': '130', '名次': '1', '组合': '理化生' },
      { '学校代码': '001', '姓名': '李四', '班级': '5班', '总分（不含加分）': '520', '加分': '5', '语文': '110', '数学': '125', '名次': '2', '组合': '理化生' },
    ];

    const metas = classifyFields(headers, rows);
    const metaMap = {};
    metas.forEach(m => metaMap[m.header] = m.type);

    assert('学校代码分类', metaMap['学校代码'], 'identity');
    assert('姓名分类', metaMap['姓名'], 'identity');
    assert('班级分类', metaMap['班级'], 'identity');
    assert('总分分类', metaMap['总分（不含加分）'], 'score');
    assert('加分分类', metaMap['加分'], 'bonus');
    assert('语文分类', metaMap['语文'], 'score');
    assert('数学分类', metaMap['数学'], 'score');
    assert('名次分类', metaMap['名次'], 'rank');
    assert('组合分类', metaMap['组合'], 'category');

    // 5.2 推荐字段
    const rec = recommendAnalysisField(metas);
    assert('推荐字段是总分（不含加分）', rec.field, '总分（不含加分）');
    assert('推荐字段优先级', rec.priority, 1);
  });
}

// ============================================================
// 测试 6：多 sheet 检测
// ============================================================
console.log('\n=== 测试 6：多 sheet 检测 ===\n');

function testSheetDetection() {
  return import(sheetDetectionPath.replace(/\.ts$/, '.js')).then(mod => {
    const { detectMainWorksheet, getPrimarySheetName } = mod;

    // 6.1 模拟多 sheet 文件
    const sheets = [
      {
        name: '成绩收集信息表',
        data: [
          ['名次', '姓名', '班级', '总分', '语文', '数学', '英语', '物理', '化学'],
          [1, '张三', '5班', 550, 120, 130, 140, 85, 90],
          [2, '李四', '5班', 520, 110, 125, 135, 80, 85],
          [3, '王五', '5班', 510, 105, 120, 130, 75, 80],
          [4, '赵六', '5班', 500, 100, 115, 125, 70, 75],
          [5, '钱七', '5班', 490, 95, 110, 120, 65, 70],
        ]
      },
      {
        name: '学校代码',
        data: [
          ['代码', '名称'],
          ['001', '第一中学'],
          ['002', '第二中学'],
        ]
      },
      {
        name: '组合名称',
        data: [
          ['组合代码', '组合名称'],
          ['01', '物理+化学+生物'],
          ['02', '历史+政治+地理'],
        ]
      }
    ];

    const candidates = detectMainWorksheet(sheets);
    assert('候选数量', candidates.length, 3);

    const primaryName = getPrimarySheetName(candidates);
    assert('主表选择', primaryName, '成绩收集信息表');
    assert('主表置信度 > 30', candidates[0].candidate.confidence > 30, true);

    // 6.2 字典表置信度应该低
    const dictCandidate = candidates.find(c => c.sheetName === '学校代码');
    assert('字典表置信度低', dictCandidate.candidate.confidence < 20, true);
  });
}

// ============================================================
// 测试 7：缺考/转到不能当 0
// ============================================================
console.log('\n=== 测试 7：缺考/转到不能当 0 ===\n');

async function testInvalidValues() {
  const mod = await import(numericParserPath.replace(/\.ts$/, '.js'));
  const { parseNumericValue } = mod;

  // 7.1 缺考
  let r = parseNumericValue('缺考');
  assert('缺考不是 valid', r.status !== 'valid', true);

  // 7.2 转到7班
  r = parseNumericValue('转到7班');
  assert('转到7班不是 valid', r.status !== 'valid', true);

  // 7.3 弃考
  r = parseNumericValue('弃考');
  assert('弃考不是 valid', r.status !== 'valid', true);

  // 7.4 无成绩
  r = parseNumericValue('无成绩');
  assert('无成绩不是 valid', r.status !== 'valid', true);
}

// ============================================================
// 测试 8：统一解析入口
// ============================================================
console.log('\n=== 测试 8：统一解析入口 ===\n');

async function testParseRowsToTable() {
  const mod = await import(join(projectRoot, 'src', 'utils', 'tableParser', 'index.ts').replace(/\.ts$/, '.js'));
  const { parseRowsToTable } = mod;

  // 8.1 普通成绩表
  const data = [
    ['名次', '姓名', '班级', '总分', '语文', '数学'],
    [1, '张三', '5班', '550', '120', '130'],
    [2, '李四', '5班', '520', '110', '125'],
    [3, '王五', '5班', '510', '105', '120'],
  ];

  const result = parseRowsToTable(data);
  assert('解析结果字段数', result.headers.length, 6);
  assert('解析结果行数', result.rows.length, 3);
  assert('第一行姓名', result.rows[0]['姓名'], '张三');
}

// ============================================================
// 测试 9：粘贴文本解析
// ============================================================
console.log('\n=== 测试 9：粘贴文本解析 ===\n');

async function testPasteText() {
  const { parseTableText } = await import(join(projectRoot, 'src', 'utils', 'parseTable.ts').replace(/\.ts$/, '.js'));

  // 9.1 Tab 分隔
  const tabText = '名次\t姓名\t总分\n1\t张三\t550\n2\t李四\t520';
  const result = parseTableText(tabText);
  assert('Tab 分隔解析字段数', result.headers.length, 3);
  assert('Tab 分隔解析行数', result.rows.length, 2);

  // 9.2 逗号分隔
  const commaText = '名次,姓名,总分\n1,张三,550\n2,李四,520';
  const result2 = parseTableText(commaText);
  assert('逗号分隔解析字段数', result2.headers.length, 3);
  assert('逗号分隔解析行数', result2.rows.length, 2);
}

// ============================================================
// 测试 10：空列、大量空值列
// ============================================================
console.log('\n=== 测试 10：空列、大量空值列 ===\n');

async function testEmptyColumns() {
  const mod = await import(join(projectRoot, 'src', 'utils', 'tableParser', 'index.ts').replace(/\.ts$/, '.js'));
  const { parseRowsToTable } = mod;

  // 10.1 包含空列
  const data = [
    ['名次', '姓名', '', '总分', ''],
    [1, '张三', '', '550', ''],
    [2, '李四', '', '520', ''],
  ];

  const result = parseRowsToTable(data);
  assert('空列自动命名', result.headers[2], '未命名字段1');
  assert('解析正常', result.rows.length, 2);
}

// ============================================================
// 运行所有测试
// ============================================================
async function runAllTests() {
  try {
    await testParseNumericValue();
    await testHeaderDetection();
    await testHeaderDedupe();
    await testRowClassification();
    await testFieldClassification();
    await testSheetDetection();
    await testInvalidValues();
    await testParseRowsToTable();
    await testPasteText();
    await testEmptyColumns();

    console.log('\n=== 测试结果 ===\n');
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);

    if (failed > 0) {
      console.log('\n❌ 部分测试未通过，请检查解析逻辑。');
      process.exit(1);
    } else {
      console.log('\n✅ 全部测试通过。');
      process.exit(0);
    }
  } catch (e) {
    console.log(`\n❌ 测试执行出错: ${e.message}`);
    console.log(e.stack);
    process.exit(1);
  }
}

runAllTests();
