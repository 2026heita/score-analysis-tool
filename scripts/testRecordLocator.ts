/**
 * 记录定位字段识别引擎（recordLocator）回归测试
 *
 * 覆盖 6 个场景：
 *   案例1 标准成绩表
 *   案例2 字段改名后的成绩表
 *   案例3 多行表头（模拟合并标题扁平化）成绩表
 *   案例4 姓名重复，需要 姓名+班级 组合定位
 *   案例5 无学号，只有"编号"字段
 *   案例6 英文字段成绩表
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testRecordLocator.ts
 */
import {
  analyzeLocatorFields,
  buildLocatorReport,
  matchRowsByField,
  matchRowsByCombo,
} from '../src/utils/tableParser/recordLocator.js';
import type { LocatorFieldAnalysis } from '../src/utils/tableParser/recordLocator.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function field(analysis: LocatorFieldAnalysis[], name: string) {
  return analysis.find(a => a.fieldName === name);
}

console.log('=== 记录定位字段识别引擎回归测试 ===\n');

// ===== 案例1：标准成绩表 =====
console.log('案例1 标准成绩表');
{
  const headers = ['学号', '姓名', '班级', '语文', '数学', '英语'];
  const rows = [
    { '学号': '20260001', '姓名': '张三', '班级': '高一(1)班', '语文': '120', '数学': '130', '英语': '110' },
    { '学号': '20260002', '姓名': '李四', '班级': '高一(1)班', '语文': '110', '数学': '120', '英语': '100' },
    { '学号': '20260003', '姓名': '王五', '班级': '高一(2)班', '语文': '130', '数学': '110', '英语': '120' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const id = field(analysis, '学号');
  assert(id?.semantic === 'identifier', '学号 → identifier');
  assert(id?.normalizedName === 'student_id', '学号 → normalizedName=student_id');
  assert(!!id && id.uniqueness >= 0.99, '学号唯一性 100%', `uniqueness=${id?.uniqueness}`);
  assert(!!id && id.confidence >= 0.85, '学号置信度>=0.85', `confidence=${id?.confidence}`);
  const report = buildLocatorReport(analysis, '20260001', rows);
  assert(report.uniqueField === '学号', '报告识别唯一字段=学号', `uniqueField=${report.uniqueField}`);
  const hit = matchRowsByField('学号', '20260001', rows, { semantic: 'identifier' });
  assert(hit.length === 1 && hit[0]['姓名'] === '张三', '按学号定位到张三');
}

// ===== 案例2：字段改名后的成绩表 =====
console.log('\n案例2 字段改名后的成绩表');
{
  const headers = ['学生编号', '学生姓名', '行政班', '语文', '数学', '英语'];
  const rows = [
    { '学生编号': 'A1001', '学生姓名': '张三', '行政班': '高一(1)班', '语文': '120', '数学': '130', '英语': '110' },
    { '学生编号': 'A1002', '学生姓名': '李四', '行政班': '高一(1)班', '语文': '110', '数学': '120', '英语': '100' },
    { '学生编号': 'A1003', '学生姓名': '王五', '行政班': '高一(2)班', '语文': '130', '数学': '110', '英语': '120' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const id = field(analysis, '学生编号');
  const name = field(analysis, '学生姓名');
  const group = field(analysis, '行政班');
  assert(id?.semantic === 'identifier' && id.confidence >= 0.8, '学生编号 → identifier 高置信', `conf=${id?.confidence}`);
  assert(name?.semantic === 'name' && name.confidence >= 0.8, '学生姓名 → name', `conf=${name?.confidence}`);
  assert(group?.semantic === 'group' && group.confidence >= 0.8, '行政班 → group', `conf=${group?.confidence}`);
  const report = buildLocatorReport(analysis, 'A1002', rows);
  assert(report.uniqueField === '学生编号', '唯一字段=学生编号');
  const hit = matchRowsByField('学生编号', 'A1002', rows, { semantic: 'identifier' });
  assert(hit.length === 1 && hit[0]['学生姓名'] === '李四', '按改名后学号定位到李四');
}

// ===== 案例3：多行表头（合并标题扁平化）成绩表 =====
console.log('\n案例3 多行表头（合并标题扁平化）成绩表');
{
  // 模拟上游 headerFlattener 将"学生信息"跨列合并标题拼进字段名后的结果
  const headers = ['学生信息-学号', '学生信息-姓名', '学生信息-班级', '成绩-语文', '成绩-数学', '成绩-英语'];
  const rows = [
    { '学生信息-学号': '20260001', '学生信息-姓名': '张三', '学生信息-班级': '高一(1)班', '成绩-语文': '120', '成绩-数学': '130', '成绩-英语': '110' },
    { '学生信息-学号': '20260002', '学生信息-姓名': '李四', '学生信息-班级': '高一(1)班', '成绩-语文': '110', '成绩-数学': '120', '成绩-英语': '100' },
    { '学生信息-学号': '20260002', '学生信息-姓名': '王五', '学生信息-班级': '高一(1)班', '成绩-语文': '130', '成绩-数学': '110', '成绩-英语': '120' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const id = field(analysis, '学生信息-学号');
  assert(id?.semantic === 'identifier' && id.normalizedName === 'student_id', '扁平化学号 → identifier/student_id', `name=${id?.normalizedName}`);
  const name = field(analysis, '学生信息-姓名');
  assert(name?.semantic === 'name', '扁平化姓名 → name');
  const group = field(analysis, '学生信息-班级');
  assert(group?.semantic === 'group', '扁平化班级 → group');
  const hit = matchRowsByField('学生信息-学号', '20260001', rows, { semantic: 'identifier' });
  assert(hit.length === 1 && hit[0]['学生信息-姓名'] === '张三', '按扁平化学号定位到张三');
}

// ===== 案例4：姓名重复，需要 姓名+班级 组合定位 =====
console.log('\n案例4 姓名重复，需要姓名+班级组合定位');
{
  const headers = ['姓名', '班级', '成绩'];
  const rows = [
    { '姓名': '张三', '班级': '高一(3)班', '成绩': '88' },
    { '姓名': '张三', '班级': '高二(1)班', '成绩': '92' },
    { '姓名': '李四', '班级': '高一(3)班', '成绩': '75' },
    { '姓名': '王五', '班级': '高一(3)班', '成绩': '80' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const report = buildLocatorReport(analysis, '张三', rows);
  assert(report.uniqueField === null || report.uniqueField !== '姓名', '无可靠唯一字段（姓名有重复）');
  const nameCand = report.candidates.find(c => c.semantic === 'name');
  assert(!!nameCand && nameCand.matchedCount === 2, '姓名匹配2条（张三重复）', `count=${nameCand?.matchedCount}`);
  const groupCand = report.candidates.find(c => c.semantic === 'group');
  assert(!!groupCand, '存在分组候选班级');
  assert(report.suggestion.includes('姓名') && report.suggestion.includes('班级'), '给出 姓名+班级 建议', report.suggestion);
  // 组合定位：姓名+班级 精确到 1 条
  const combo = matchRowsByCombo(
    [{ field: '姓名', value: '张三' }, { field: '班级', value: '高一(3)班' }],
    rows, analysis,
  );
  assert(combo.length === 1 && combo[0]['成绩'] === '88', '姓名+班级组合定位到唯一记录');
}

// ===== 案例5：无学号，只有"编号"字段 =====
console.log('\n案例5 无学号，只有编号字段');
{
  const headers = ['编号', '姓名', '成绩'];
  const rows = [
    { '编号': '00123', '姓名': '张三', '成绩': '88' },
    { '编号': '00124', '姓名': '李四', '成绩': '91' },
    { '编号': '00125', '姓名': '王五', '成绩': '85' },
    { '编号': '00126', '姓名': '赵六', '成绩': '90' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const id = field(analysis, '编号');
  assert(!!id && id.semantic === 'identifier' && id.isCandidate, '编号 → identifier 候选', `sem=${id?.semantic} cand=${id?.isCandidate}`);
  assert(!!id && id.confidence >= 0.7, '编号置信度>=0.7', `conf=${id?.confidence}`);
  const report = buildLocatorReport(analysis, '00125', rows);
  assert(report.uniqueField === '编号', '唯一字段=编号（数据模式识别）');
  const hit = matchRowsByField('编号', '00125', rows, { semantic: 'identifier' });
  assert(hit.length === 1 && hit[0]['姓名'] === '王五', '按编号定位到王五');
}

// ===== 案例6：英文字段成绩表 =====
console.log('\n案例6 英文字段成绩表');
{
  const headers = ['StudentID', 'Name', 'Class', 'Math', 'English'];
  const rows = [
    { StudentID: 'S001', Name: 'Alice', Class: 'Class 1', Math: '95', English: '88' },
    { StudentID: 'S002', Name: 'Bob', Class: 'Class 1', Math: '90', English: '85' },
    { StudentID: 'S003', Name: 'Alice', Class: 'Class 2', Math: '92', English: '91' },
  ];
  const analysis = analyzeLocatorFields(headers, rows);
  const id = field(analysis, 'StudentID');
  assert(!!id && id.semantic === 'identifier' && id.isCandidate, 'StudentID → identifier', `sem=${id?.semantic}`);
  const name = field(analysis, 'Name');
  assert(!!name && name.semantic === 'name', 'Name → name');
  const cls = field(analysis, 'Class');
  assert(!!cls && cls.semantic === 'group', 'Class → group');
  const hit = matchRowsByField('StudentID', 'S002', rows, { semantic: 'identifier' });
  assert(hit.length === 1 && hit[0]['Name'] === 'Bob', '按 StudentID 定位到 Bob');
  // Name 有重复，组合 Name+Class 定位
  const combo = matchRowsByCombo(
    [{ field: 'Name', value: 'Alice' }, { field: 'Class', value: 'Class 2' }],
    rows, analysis,
  );
  assert(combo.length === 1 && combo[0]['StudentID'] === 'S003', 'Name+Class 组合定位到 S003');
}

// ======== 汇总 ========
console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\n全部通过 ✓');