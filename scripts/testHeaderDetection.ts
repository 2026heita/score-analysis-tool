/**
 * 第十五阶段：表头识别边界问题回归测试
 * 直接导入真实生产 headerDetection / parseRawRows 验证，不复制算法。
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testHeaderDetection.ts
 */
import {
  scoreHeaderCandidate,
  scoreSparseHeaderCandidate,
} from '../src/utils/tableParser/headerDetection.js';
import { detectHeaderRow } from '../src/utils/tableParser/headerDetection.js';
import { parseRawRows } from '../src/utils/tableParser/workbook.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else {
    failed++;
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

console.log('=== 第十五阶段：表头识别边界回归测试 ===\n');

// 辅助：打印单行候选的实际 score
function scoreOf(rowStrs: string[], allRows: unknown[][], index = 0): number {
  return scoreHeaderCandidate(rowStrs, [], allRows, index);
}

console.log('0. 典型候选行实际 score：');
const scoreRows: Array<[string, string[], unknown[][]]> = [
  ['单列"总分"', ['总分'], [['总分'], ['100'], ['90'], ['80']]],
  ['单列纯数字"100"', ['100'], [['100'], ['90'], ['80']]],
  ['多列"姓名|总分|备注"', ['姓名', '总分', '备注'], [['姓名', '总分', '备注'], ['张三', '100', '优秀']]],
  ['单列说明"备注：缺考学生不参与统计"', ['备注：缺考学生不参与统计'], [['备注：缺考学生不参与统计'], ['姓名', '总分'], ['张三', '100']]],
];
const scoreReport: Record<string, number> = {};
for (const [label, row, rows] of scoreRows) {
  const s = scoreOf(row, rows);
  scoreReport[label] = s;
  console.log(`    ${label} → score = ${s}`);
}

// 输出规范：总分>高分、100 低分、姓名|总分|备注 中等、备注说明 重罚
assert(scoreReport['单列"总分"'] >= 5, '总分 为高分(≥5)', `got=${scoreReport['单列"总分"']}`);
assert(scoreReport['单列纯数字"100"'] < 5, '100 为低分(<5，不识别)', `got=${scoreReport['单列纯数字"100"']}`);
assert(scoreReport['多列"姓名|总分|备注"'] >= 5, '姓名|总分|备注 为高分(≥5)', `got=${scoreReport['多列"姓名|总分|备注"']}`);
assert(scoreReport['单列说明"备注：缺考学生不参与统计"'] < 5, '备注说明为重罚(<5)', `got=${scoreReport['单列说明"备注：缺考学生不参与统计"']}`);
assert(scoreReport['单列"总分"'] > scoreReport['单列说明"备注：缺考学生不参与统计"'], '总分远高于备注说明');

// ===== A. 单列成绩 =====
console.log('\nA. 单列成绩');
{
  const d = detectHeaderRow([['总分'], ['100'], ['90'], ['80']]);
  assert(d.headerRowIndex === 0, '表头=总分(第0行)', `idx=${d.headerRowIndex}`);
  assert(d.headers[0] === '总分', '表头名为"总分"', `headers=${JSON.stringify(d.headers)}`);
  assert(d.dataRows.length === 3, '3 条数据');
}

// ===== B. 单列排名 =====
console.log('\nB. 单列排名');
{
  const d = detectHeaderRow([['排名'], ['1'], ['2'], ['3']]);
  assert(d.headerRowIndex === 0 && d.headers[0] === '排名', '表头=排名', `idx=${d.headerRowIndex}`);
  assert(d.dataRows.length === 3, '3 条数据');
}

// ===== C. 单列普通字段名 =====
console.log('\nC. 单列"考试成绩"');
{
  const d = detectHeaderRow([['考试成绩'], ['85'], ['90'], ['95']]);
  assert(d.headerRowIndex === 0 && d.headers[0] === '考试成绩', '表头=考试成绩（命中"成绩"关键词）', `idx=${d.headerRowIndex}`);
}

// ===== D. 纯数字单列 =====
console.log('\nD. 纯数字单列（不识别）');
{
  const d = detectHeaderRow([['100'], ['90'], ['80']]);
  assert(d.headerRowIndex === -1, '纯数字单列不识别表头', `idx=${d.headerRowIndex}`);
  assert(d.headers.length === 0, '无表头');
}

// ===== E. 空列 + 总分 =====
console.log('\nE. 空列 + 总分');
{
  const d = detectHeaderRow([['', '', '总分'], ['', '', '100'], ['', '', '90']]);
  assert(d.headerRowIndex === 0, '第一行为表头', `idx=${d.headerRowIndex}`);
  assert(d.headers[2] === '总分', '第三列为"总分"', `headers=${JSON.stringify(d.headers)}`);
  // 空列保留：纳入未命名字段逻辑（走 parseRawRows 的 dedupe）
  const r = parseRawRows([['', '', '总分'], ['', '', '100'], ['', '', '90']]);
  assert(r.headers.length === 3, '字段数为 3（含空列）', `headers=${JSON.stringify(r.headers)}`);
  assert(r.headers[0].includes('未命名'), '空列转为未命名字段', `headers=${JSON.stringify(r.headers)}`);
  assert(r.rows.length === 2, '2 条数据');
}

// ===== F. 正常备注列 =====
console.log('\nF. 正常备注列（多列表头不被误伤）');
{
  const d = detectHeaderRow([['姓名', '总分', '备注'], ['张三', '100', '优秀'], ['李四', '90', '正常']]);
  assert(d.headerRowIndex === 0, '第一行为表头', `idx=${d.headerRowIndex}`);
}

// ===== G. 真备注说明 =====
console.log('\nG. 真备注说明（选第二行）');
{
  const d = detectHeaderRow([['备注：缺考学生不参与统计'], ['姓名', '总分'], ['张三', '100']]);
  assert(d.headerRowIndex === 1, '表头=姓名|总分(第2行)', `idx=${d.headerRowIndex}`);
  assert(d.headers[0] === '姓名', '表头首列=姓名');
}

// ===== H. 备注列 + 说明行 =====
console.log('\nH. 备注列 + 说明行（选第二行）');
{
  const d = detectHeaderRow([['说明：成绩仅供参考'], ['姓名', '总分', '备注'], ['张三', '100', '优秀']]);
  assert(d.headerRowIndex === 1, '表头=姓名|总分|备注(第2行)', `idx=${d.headerRowIndex}`);
}

// ===== I. 标题 + 空行 + 表头 =====
console.log('\nI. 标题 + 空行 + 表头');
{
  const d = detectHeaderRow([['2026年期末考试'], [''], ['姓名', '总分', '备注'], ['张三', '100', '优秀']]);
  assert(d.headerRowIndex === 2, '表头=姓名|总分|备注(第3行)', `idx=${d.headerRowIndex}`);
}

// ===== J. 标题行 + 单列表 =====
console.log('\nJ. 标题行 + 单列表');
{
  const d = detectHeaderRow([['2026年考试成绩'], ['总分'], ['100'], ['90']]);
  assert(d.headerRowIndex === 1, '表头=总分(第2行)，不选标题行', `idx=${d.headerRowIndex}`);
}

// ===== K. 说明行 + 单列表 =====
console.log('\nK. 说明行 + 单列表');
{
  const d = detectHeaderRow([['说明：以下为本次考试成绩'], ['总分'], ['100'], ['90']]);
  assert(d.headerRowIndex === 1, '表头=总分(第2行)，不选说明行', `idx=${d.headerRowIndex}`);
}

console.log(`\n=== 结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (failed > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}