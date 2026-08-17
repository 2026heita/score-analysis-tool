/**
 * 第二十二阶段：汇总行判断回归测试
 * 直接导入真实生产函数，不复制简化 detector。
 *
 * 核心：汇总行判断必须依赖"这一行整体像汇总记录"（精确汇总标签 + 行数字结构），
 * 不能只靠任意文本单元格 contains("统计") 这类模糊匹配，否则会静默删掉正常记录。
 *
 * 覆盖：
 *  1. 正常记录保留（商品名/活动名/部门名/姓名含"统计""累计""合计"等字样）
 *  2. 真实汇总行排除（平均分/最大值/最小值/合计/总计）
 *  3. 无文字标签但全数字的统计式行（姓名为空等）合理处理
 *  4. 模糊边界：编辑式文本含关键词但其余字段非数字 → 宁可保留
 *  5. 完整 parseRawRows 链路最终 validRows 过滤正确
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testRowClassifierSummary.ts
 */
import { classifyDataRow, classifyDataRows } from '../src/utils/tableParser/rowClassifier.js';
import { parseRawRows } from '../src/utils/tableParser/workbook.js';

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

console.log('=== 第二十二阶段：汇总行判断回归测试 ===\n');

// ===== 1. 正常记录保留 =====
console.log('1. 正常业务/学生记录保留');
{
  const cases: Array<[string, Record<string, string>, string[]]> = [
    ['商品=统计学教材', { '商品': '统计学教材', '销售额': '1200' }, ['商品', '销售额']],
    ['活动=累计消费促销', { '活动': '累计消费促销', '订单数': '50' }, ['活动', '订单数']],
    ['部门=统计部', { '部门': '统计部', '利润': '300' }, ['部门', '利润']],
    ['商品=合计牌计算器', { '商品': '合计牌计算器', '库存': '20' }, ['商品', '库存']],
    ['姓名=李统计', { '姓名': '李统计', '总分': '90' }, ['姓名', '总分']],
    ['分类=年度统计', { '分类': '年度统计', '数值': '100' }, ['分类', '数值']],
    ['分类=累计数据', { '分类': '累计数据', '数值': '50' }, ['分类', '数值']],
    ['分类=统计结果', { '分类': '统计结果', '数值': '30' }, ['分类', '数值']],
  ];
  for (const [name, row, headers] of cases) {
    const type = classifyDataRow(row, headers);
    assert(type === 'validData', `${name} 保留为 validData`, `type=${type}`);
  }
}

// ===== 2. 真实汇总行排除 =====
console.log('\n2. 真实汇总行排除');
{
  const cases: Array<[string, Record<string, string>, string[]]> = [
    ['平均分|85', { '姓名': '平均分', '分数': '85' }, ['姓名', '分数']],
    ['最大值|100', { '姓名': '最大值', '数学': '100' }, ['姓名', '数学']],
    ['最小值|60', { '姓名': '最小值', '数学': '60' }, ['姓名', '数学']],
    ['合计|8500', { '姓名': '合计', '总分': '8500' }, ['姓名', '总分']],
    ['总计|8500', { '姓名': '总计', '总分': '8500' }, ['姓名', '总分']],
  ];
  for (const [name, row, headers] of cases) {
    const type = classifyDataRow(row, headers);
    assert(type === 'summary', `${name} 排除为 summary`, `type=${type}`);
  }
}

// ===== 3. 无文字标签但全数字的统计式行 =====
console.log('\n3. 无文字标签的统计式行');
{
  // 姓名为空、其余全数字：无精确标签、非状态行 → 保留为 validData
  const noLabel = { '姓名': '', '总分': '85', '数学': '90', '英语': '80' };
  const type = classifyDataRow(noLabel, ['姓名', '总分', '数学', '英语']);
  assert(type === 'validData', '无文字标签的全数字行 → validData（不因无关键词误删）', `type=${type}`);
}

// ===== 4. 模糊边界：命中标签但另一字段为文字 → 宁可保留 =====
console.log('\n4. 模糊边界（标签+文字字段 → 保留）');
{
  // 标签"平均分"但其余字段是文字（如备注），无法可靠判定 → 不判 summary
  const row = { '姓名': '平均分', '数学': 'abc', '备注': '缺考处理说明' };
  const type = classifyDataRow(row, ['姓名', '数学', '备注']);
  assert(type === 'validData', '标签但其余为文字 → 保留（宁可保留不误删）', `type=${type}`);
}

// ===== 5. 完整 parseRawRows 链路最终过滤 =====
console.log('\n5. parseRawRows 最终 validRows 正确');
{
  const raw = [
    ['姓名', '数学', '英语'],
    ['李统计', '90', '85'],
    ['平均分', '85', '80'],
    ['统计学教材', '77', '88'],
    ['合计', '8500', 'null_ignored'],
  ];
  const result = parseRawRows(raw);
  assert(result.summary!.summaryRows === 2, '识别出 2 行汇总（平均分、合计）', `=${result.summary!.summaryRows}`);
  assert(result.summary!.validDataRows >= 2, '至少 2 行有效数据（李统计、统计学教材）', `=${result.summary!.validDataRows}`);
  // 有效行必须包含"统计学教材"与"李统计"，不包含"平均分"/"合计"
  const names = result.rows.map(r => r['姓名'] ?? r['姓名']);
  assert(result.rows.some(r => r['姓名'] === '李统计'), '有效行含 李统计');
  assert(result.rows.some(r => r['姓名'] === '统计学教材'), '有效行含 统计学教材');
  assert(!result.rows.some(r => r['姓名'] === '平均分'), '有效行不含 平均分');
  const allNames = result.rows.map(r => JSON.stringify(r));
  assert(allNames.some(n => n.includes('统计学教材')), '有效行含 统计学教材 数据');
  // 说明：当前表头是"姓名"，因此"合计"(总分列8500)仍应被 summary 排除
  assert(!result.rows.some(r => r['数学'] === '8500'), '合计行数据不进入有效行');
}

// ===== 6. classifyDataRows 统计一致性 =====
console.log('\n6. classifyDataRows 统计');
{
  const headers = ['姓名', '数学'];
  const rows = [
    { '姓名': '张三', '数学': '90' },
    { '姓名': '平均分', '数学': '85' },
    { '姓名': '李四', '数学': '80' },
    { '姓名': '累计推广员', '数学': '75' },
  ];
  const stats = classifyDataRows(rows, headers);
  assert(stats.validData === 3, '3 行有效数据', `=${stats.validData}`);
  assert(stats.summary === 1, '1 行汇总（平均分）', `=${stats.summary}`);
  assert(stats.validRows.length === 3, 'validRows 长度 3', `=${stats.validRows.length}`);
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