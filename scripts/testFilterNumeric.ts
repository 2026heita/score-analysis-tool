/**
 * 第二十阶段：通用数字字段筛选能力回归测试
 * 直接导入真实生产函数，不复制简化 detector。
 *
 * 核心：把"能否数字筛选"与"是否为推荐分析指标"解耦，
 * 内容数值占比高、且非身份/编码的字段应具备等于/大于/小于/范围筛选。
 *
 * 覆盖：
 *  1. Revenue/销售额/利润/成本/价格/库存/订单数 内容全数字 → 应支持数字筛选
 *  2. 千分位数字筛选（大于 2,000 命中 2500/10000）
 *  3. 小数/负数数字筛选（利润 -100.5 / 0 / 250.75）
 *  4. 身份/编码字段（学号/考号/身份证号/学校代码/商品编码/SKU/手机号）
 *     不因"内容全数字"被推荐为普通数值指标，也不被数字筛选
 *  5. 混合列：多数数值即按数字筛选（1010 案例），非因一条 invalid 变文本
 *  6. 数值证据不足的列不加数字条件
 *  7. 等于/范围 operator 实际筛选正确
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testFilterNumeric.ts
 */
import { classifyFields } from '../src/utils/tableParser/fieldClassifier.js';
import {
  isNumericFilterField,
  buildNumericFieldSet,
  filterRows,
} from '../src/engine/filterRows.js';

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

function classify(header: string, values: (string | number)[]) {
  const rows = values.map(v => ({ [header]: String(v) }));
  return classifyFields([header], rows)[0];
}

console.log('=== 第二十阶段：通用数字字段筛选回归测试 ===\n');

// ===== 1. 全数字业务字段应支持数字筛选 =====
console.log('1. 全数字业务字段（Revenue/销售额/成本/价格/库存/订单数）');
{
  const fields = ['Revenue', '销售额', '成本', '价格', '库存', '订单数', '利润'];
  for (const f of fields) {
    const meta = classify(f, [1200, 3500, 10000, 850, 2000, 5500, 9999]);
    assert(isNumericFilterField(meta) === true, `${f} 可数字筛选`, `ratio=${meta.contentFeature?.numericRatio} role=${meta.analysisRole}`);
  }
}

// ===== 2. 千分位数字筛选 =====
console.log('\n2. 千分位数字筛选');
{
  const header = '销售额';
  const rows = [{ [header]: '1,000' }, { [header]: '2,500' }, { [header]: '10,000' }];
  const set = new Set([header]);
  // 大于 2,000
  const r = filterRows(rows, [{ field: header, operator: 'gt', value: '2,000' }], set);
  const hit = r.filteredRows.map(x => x[header]).sort();
  assert(JSON.stringify(hit) === JSON.stringify(['10,000', '2,500']), '大于 2,000 命中 2500 与 10000', `hit=${JSON.stringify(hit)}`);
  // 范围 between（1000 ~ 3000）
  const rb = filterRows(rows, [{ field: header, operator: 'between', betweenMin: '1,000', betweenMax: '3,000' }], set);
  assert(JSON.stringify(rb.filteredRows.map(x => x[header])) === JSON.stringify(['1,000', '2,500']), '介于 1000~3000 命中 1000 与 2500', `=${JSON.stringify(rb.filteredRows)}`);
}

// ===== 3. 小数/负数数字筛选 =====
console.log('\n3. 小数/负数数字筛选');
{
  const header = '利润';
  const rows = [{ [header]: '-100.5' }, { [header]: '0' }, { [header]: '250.75' }, { [header]: '10' }];
  const set = new Set([header]);
  const gt = filterRows(rows, [{ field: header, operator: 'gt', value: '0' }], set);
  assert(JSON.stringify(gt.filteredRows.map(x => x[header])) === JSON.stringify(['250.75', '10']), '利润大于0 命中 250.75 与 10', `=${JSON.stringify(gt.filteredRows)}`);
  const lt = filterRows(rows, [{ field: header, operator: 'lt', value: '-50' }], set);
  assert(JSON.stringify(lt.filteredRows.map(x => x[header])) === JSON.stringify(['-100.5']), '利润小于-50 命中 -100.5', `=${JSON.stringify(lt.filteredRows)}`);
  const eq = filterRows(rows, [{ field: header, operator: 'equals', value: '0' }], set);
  assert(eq.filteredRows.length === 1 && eq.filteredRows[0][header] === '0', '利润等于0 命中 0');
}

// ===== 4. 身份/编码字段受保护 =====
console.log('\n4. 身份/编码字段不受数字筛选误判');
{
  const idCases: Record<string, (string|number)[]> = {
    '学号': ['20240001', '20240002', '20240003', '20240004'],
    '考号': ['1001', '1002', '1003', '1004'],
    '身份证号': ['110101200001011234', '110101200002021234'],
    '学校代码': ['001', '002', '003'],
    '商品编码': ['100001', '100002', '100003', '100004'],
    '手机号': ['13800138001', '13900139002', '13700137003'],
  };
  for (const [f, vals] of Object.entries(idCases)) {
    const meta = classify(f, vals);
    assert(isNumericFilterField(meta) === false, `${f} 不因内容数字被误判为数字筛选`, `ratio=${meta.contentFeature?.numericRatio} type=${meta.type}`);
  }
  // SKU 混合编码（含字母）也不应被数字筛选
  const sku = classify('SKU', ['ABC-001', 'ABC-002', 'ABC-003']);
  assert(isNumericFilterField(sku) === false, 'SKU（含字母）不数字筛选');
}

// ===== 5. 混合列：多数数值即数字筛选 =====
console.log('\n5. 混合列（数值占多数）');
{
  const meta = classify('金额', ['100', '200', '未知', '300']);
  assert(isNumericFilterField(meta) === true, '金额[100,200,未知,300] 可数字筛选（ratio 0.75）', `ratio=${meta.contentFeature?.numericRatio}`);
}

// ===== 6. 数值证据不足不加数字筛选 =====
console.log('\n6. 数值证据不足的列');
{
  const meta = classify('金额', ['100', 'abc', '缺考', '备注']);
  assert(isNumericFilterField(meta) === false, '金额[100,abc,缺考,备注] 不数字筛选', `ratio=${meta.contentFeature?.numericRatio}`);
}

// ===== 7. 等于 / 范围实际筛选 + numericFieldSet 集成 =====
console.log('\n7. numericFieldSet 集成 + 等于/范围');
{
  const headers = ['销售额', '成本', '学号'];
  const rows = [
    { '销售额': '1000', '成本': '200', '学号': '20240001' },
    { '销售额': '2500', '成本': '150', '学号': '20240002' },
    { '销售额': '10000', '成本': '5000', '学号': '2500' },
  ];
  const metas = classifyFields(headers, rows);
  const set = buildNumericFieldSet(metas);
  assert(set.has('销售额'), '销售额在 numericFieldSet');
  assert(set.has('成本'), '成本在 numericFieldSet');
  assert(!set.has('学号'), '学号不在 numericFieldSet');

  // 数值筛选走 evaluateNumericCondition（即使原始值为字符串数字）
  const eq = filterRows(rows, [{ field: '销售额', operator: 'equals', value: '2500' }], set);
  assert(eq.filteredRows.length === 1 && eq.filteredRows[0]['销售额'] === '2500', '销售额等于2500');
  const between = filterRows(rows, [{ field: '成本', operator: 'between', betweenMin: '100', betweenMax: '300' }], set);
  assert(between.filteredRows.length === 2, '成本 100~300 命中两行', `=${between.filteredRows.length}`);
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