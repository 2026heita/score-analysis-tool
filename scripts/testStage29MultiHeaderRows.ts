/**
 * 阶段 29：多级表头 / 标题行下的实际数据行数与 20,000 行限制核查
 *
 * 背景：第二十六阶段把规则改为「实际数据行 > 20,000 → 整份拒绝」。
 * 此前审查风险：多层表头时只按第一层表头减行，导致后续表头层被算进实际数据行，
 * 使 20000 行的合法文件被误判为 20001 → 误拒绝。
 *
 * 修复（workbook.ts）：rawRowCount 改为取表头检测结果 detection.dataRows.length
 * （该值已按真实表头深度从数据起始行切片），单层下与 headerRowIndex+1 等价，行为不变。
 *
 * 测试：
 * 1. 单层表头（CSV/粘贴真实链 parseRawRows）19999/20000/20001
 * 2. CSV 标题行 + 单层表头（parseTableText）标题不计入数据行
 * 3. 真实 .xlsx（合并单元格）两层表头 19999/20000/20001
 * 4. 真实 .xlsx（合并单元格）标题行 + 两层表头
 */

import { read, utils, write } from 'xlsx';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRawRows, MAX_ROWS } from '../src/utils/tableParser/workbook.js';
import { parseTableText } from '../src/utils/parseTable.js';
import { detectHeaderRow } from '../src/utils/tableParser/headerDetection.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

const tmp = mkdtempSync(join(tmpdir(), 'ph29-'));
function buildXlsx(rows: any[][], merges: any[]): string {
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  utils.book_append_sheet(wb, ws, 'S');
  const p = join(tmp, 'f.xlsx');
  writeFileSync(p, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  return p;
}
function readSheet(path: string) {
  const wb = read(readFileSync(path), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false });
  const sheet = wb.Sheets['S'];
  const data = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
  const merges = ((sheet['!merges'] as any[]) || []).map((m: any) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
  return { data, merges };
}

console.log('=== 阶段29 多级表头行数核查 ===');

console.log('1. 单层表头（parseRawRows）');
{
  const r19999 = parseRawRows([['姓名', '总分'], ...Array.from({ length: 19999 }, () => ['张三', 80])]);
  ok(r19999.dataVolumeState.parsedRowCount === 19999 && r19999.dataVolumeState.rawRowCount === 19999, '单层+19999 parsedRowCount=19999');
  const r20000 = parseRawRows([['姓名', '总分'], ...Array.from({ length: 20000 }, () => ['张三', 80])]);
  ok(r20000.dataVolumeState.parsedRowCount === 20000, '单层+20000 parsedRowCount=20000');
  let threw = false;
  try { parseRawRows([['姓名', '总分'], ...Array.from({ length: 20001 }, () => ['张三', 80])]); } catch (e: any) { threw = e && e.name === 'ParseError'; }
  ok(threw, '单层+20001 整份拒绝');
}

console.log('2. CSV 标题行 + 单层表头（parseTableText）');
{
  const text = '2026年销售数据汇总\n姓名,总分\n张三,80\n李四,90\n王五,95';
  const r = parseTableText(text);
  ok(r.dataVolumeState.rawRowCount === 3 && r.dataVolumeState.parsedRowCount === 3, 'CSV 标题行不计入数据行，真实数据 3 条');
}

console.log('3. 真实 xlsx 两层表头（合并单元格）19999/20000/20001');
{
  function twoLevel(n: number): string {
    const rows: any[] = [['学号', '德育', '', '智育'], ['', '加分', '扣分', '总分']];
    for (let i = 0; i < n; i++) rows.push([i, 5, 0, 88]);
    return buildXlsx(rows, [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }]);
  }
  // 与 parseSheetData 相同的生产计数口径：rawRowCount = detection.dataRows.length
  for (const n of [19999, 20000]) {
    const { data, merges } = readSheet(twoLevel(n));
    const det = detectHeaderRow(data, merges);
    ok(det.isMultiRow === true, `两层表头(${n}) 识别为多级表头`);
    ok(det.dataRows.length === n, `两层表头+${n} 实际数据行=${n}（原只减一层会错算成 ${n + 1}）`);
    ok(det.dataRows.length <= MAX_ROWS, `两层表头+${n} <=20000 允许（不误拒绝）`);
  }
  {
    const { data, merges } = readSheet(twoLevel(20001));
    const det = detectHeaderRow(data, merges);
    ok(det.dataRows.length === 20001, `两层表头+20001 实际数据行=20001`);
    ok(det.dataRows.length > MAX_ROWS, `两层表头+20001 >20000 → 整份拒绝`);
  }
}

console.log('4. 真实 xlsx 标题行 + 两层表头（合并单元格）');
{
  function titleTwoLevel(n: number): string {
    const rows: any[] = [['2026年综合测评表', '', '', ''], ['', '德育', '', '智育'], ['姓名', '加分', '扣分', '总分']];
    for (let i = 0; i < n; i++) rows.push(['张三', 5, 0, 88]);
    return buildXlsx(rows, [{ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }]);
  }
  for (const n of [19999, 20000]) {
    const { data, merges } = readSheet(titleTwoLevel(n));
    const det = detectHeaderRow(data, merges);
    ok(det.dataRows.length === n, `标题+两层+${n} 实际数据行=${n}（标题与两层表头均不计入）`);
    ok(det.dataRows.length <= MAX_ROWS, `标题+两层+${n} <=20000 允许`);
  }
  {
    const { data, merges } = readSheet(titleTwoLevel(20001));
    const det = detectHeaderRow(data, merges);
    ok(det.dataRows.length === 20001, `标题+两层+20001 实际数据行=20001`);
    ok(det.dataRows.length > MAX_ROWS, `标题+两层+20001 >20000 → 整份拒绝`);
  }
}

rmSync(tmp, { recursive: true, force: true });

console.log('通过: ' + passed + ' 失败: ' + failed);
if (failed > 0) { console.log('失败: ' + failures.join('; ')); process.exit(1); }
else { console.log('ALL PASS'); process.exit(0); }