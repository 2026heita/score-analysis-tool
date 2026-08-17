/**
 * 阶段 28：筛选"为空/不为空"与统一空值规则一致性测试
 *
 * 统一空值规则权威来源：src/utils/tableParser/numericParser.ts 的 isEmptyLike
 * （"" / 空格 / "-","—","–","/","\\","|" 及 trim 后为空者视为空）。
 *
 * 验证：
 * 1. isEmptyLike 单元语义（空命中 / 非空命中，含 0）
 * 2. filterRows 数字字段：为空 / 等于0 / 大于0
 * 3. filterRows 文本字段：为空 / 不为空
 * 4. 前后空格与完整占位符（" - ABC " 不得判空）
 */

import { isEmptyLike } from '../src/utils/tableParser/numericParser.js';
import { filterRows } from '../src/engine/filterRows.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
function hit(field: string, op: string, value: string, rows: Record<string, string>[], by: string) {
  const r = filterRows(rows, [{ field, operator: op as any, value }], new Set([field]));
  return r.filteredRows.map(x => x[by]);
}

console.log('=== 阶段28 筛选空值统一测试 ===');

console.log('1. isEmptyLike 应从"为空"命中');
{
  const empties = ['', ' ', '   ', '-', '—', '–', '/', '\\', '|', ' / ', ' - ', null, undefined];
  for (const v of empties) {
    ok(isEmptyLike(v) === true, `isEmptyLike(${JSON.stringify(v)}) = true`);
  }
}

console.log('2. isEmptyLike 应判定为"不为空"（含 0 回归）');
{
  const notEmpty = [0, '0', '0.0', '-10', '100', 'abc', '缺考', '未提交', ' - ABC ', '1,23', '100abc'];
  for (const v of notEmpty) {
    ok(isEmptyLike(v) === false, `isEmptyLike(${JSON.stringify(v)}) = false`);
  }
}

console.log('3. 数字字段：为空应命中 "/" 与 "-"，但 0 不命中');
{
  const rows = [
    { 金额: '' }, { 金额: '100' }, { 金额: '/' }, { 金额: '-' }, { 金额: '0' }, { 金额: '200' },
  ];
  const got = hit('金额', 'isEmpty', '', rows, '金额');
  ok(got.length === 3 && got.includes('/') && got.includes('-') && got.includes(''), `数字为空命中 3 条 ['/','-','']，实际${JSON.stringify(got)}`);
}

console.log('4. 数字字段：等于 0 只命中 "0"');
{
  const rows = [
    { 金额: '' }, { 金额: '100' }, { 金额: '/' }, { 金额: '-' }, { 金额: '0' }, { 金额: '200' },
  ];
  const got = hit('金额', 'equals', '0', rows, '金额');
  ok(got.length === 1 && got[0] === '0', `等于0 只命中 0，实际${JSON.stringify(got)}`);
}

console.log('5. 数字字段：大于 0 不把空占位符当作 0');
{
  const rows = [
    { 金额: '' }, { 金额: '100' }, { 金额: '/' }, { 金额: '0' }, { 金额: '200' },
  ];
  const got = hit('金额', 'gt', '0', rows, '金额');
  ok(got.length === 2 && got.includes('100') && got.includes('200'), `大于0 命中 100/200，实际${JSON.stringify(got)}`);
}

console.log('6. 文本字段：为空用同一套空值规则');
{
  const rows = [
    { 备注: '正常' }, { 备注: '/' }, { 备注: '-' }, { 备注: '需要复核' }, { 备注: '' }, { 备注: ' - ABC ' },
  ];
  const got = hit('备注', 'isEmpty', '', rows, '备注');
  ok(got.length === 3 && got.includes('/') && got.includes('-') && got.includes(''), `文本为空命中 3 条 ['/','-','']，实际${JSON.stringify(got)}`);
  const gotNotEmpty = hit('备注', 'isNotEmpty', '', rows, '备注');
  ok(gotNotEmpty.length === 3 && gotNotEmpty.includes(' - ABC ') && !gotNotEmpty.includes('/'), `文本非空命中 3 条（含 " - ABC "，不含 "/"），实际${JSON.stringify(gotNotEmpty)}`);
}

console.log('7. 数字字段：不为空不应误判占位符');
{
  const rows = [
    { 金额: '100' }, { 金额: '/' }, { 金额: '-' }, { 金额: '0' }, { 金额: '200' },
  ];
  const got = hit('金额', 'isNotEmpty', '', rows, '金额');
  ok(got.length === 3 && got.includes('0') && got.includes('100') && got.includes('200'), `数字非空命中 100/0/200，实际${JSON.stringify(got)}`);
}

console.log('通过: ' + passed + ' 失败: ' + failed);
if (failed > 0) { console.log('失败: ' + failures.join('; ')); process.exit(1); }
else { console.log('ALL PASS'); process.exit(0); }