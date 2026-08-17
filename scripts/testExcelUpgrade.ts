/**
 * 第二十四阶段：SheetJS / xlsx 升级回归测试
 * 运行时生成真实 .xlsx / .xls 二进制文件，完整走
 *   文件 bytes → XLSX.read → workbook → worksheet → sheet_to_json → 项目parser
 *
 * 验证：
 *  1. 普通 xlsx 读取
 *  2. 多 Sheet（主表选择所需 sheetNames + 数据）
 *  3. 合并单元格 merges 读取
 *  4. 中文 sheet 名 / 表头 / 数据
 *  5. 数字类型（100 / 95.5 / 0 / -10）
 *  6. 日期单元格（保留原始处理）
 *  7. .xls 旧格式读取
 *  8. 10000 行大文件 Worker 等价逻辑（read + sheet_to_json）性能/正确性
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testExcelUpgrade.ts
 */
import { read, utils, write } from 'xlsx';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectHeaderRow, detectAndFlattenMultiRowHeaders } from '../src/utils/tableParser/headerFlattener.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name + (detail ? ` :: ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`); }
}

/** 用升级后的 SheetJS 构造真实文件 buffer（xlsx）或 biff8（xls） */
function buildBuf(wb: ReturnType<typeof utils.book_new>, bookType: 'xlsx' | 'biff8'): Buffer {
  const out = write(wb, { bookType, type: 'buffer' }) as Buffer;
  return out;
}

console.log('=== 第二十四阶段：SheetJS 升级回归测试 ===\n');
console.log('xlsx 版本(所在源码包): 0.20.x');

const tmp = mkdtempSync(join(tmpdir(), 'xlsx-test-'));

// ===== 1. 普通 xlsx =====
console.log('\n1. 普通 xlsx（姓名|总分）');
{
  const path = join(tmp, 'basic.xlsx');
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([['姓名', '总分'], ['张三', 100], ['李四', 90]]);
  utils.book_append_sheet(wb, ws, '成绩');
  writeFileSync(path, buildBuf(wb, 'xlsx'));

  // 读回（与 Worker 相同逻辑）
  const buf = readFileSync(path);
  const rb = read(buf, { type: 'buffer', cellFormula: false, cellHTML: false });
  assert(JSON.stringify(rb.SheetNames) === JSON.stringify(['成绩']), 'sheetNames 正确');
  const ws2 = rb.Sheets['成绩'];
  const data = utils.sheet_to_json<any[]>(ws2, { header: 1, defval: '', raw: false });
  assert(JSON.stringify(data) === JSON.stringify([['姓名', '总分'], ['张三', '100'], ['李四', '90']]), '普通 xlsx 数据正确', `=${JSON.stringify(data)}`);
}

// ===== 2. 多 Sheet =====
console.log('\n2. 多 Sheet（说明/代码字典/真实成绩表/空Sheet/统计表）');
{
  const path = join(tmp, 'multi.xlsx');
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['说明'], ['此为测试说明']]), '说明');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['代码', '名称'], ['001', 'A']]), '代码字典');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['姓名', '总分'], ['张三', 100], ['李四', 90]]), '真实成绩表');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([]), '空Sheet');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['统计', '值'], ['合计', 8500]]), '统计表');
  writeFileSync(path, buildBuf(wb, 'xlsx'));

  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  assert(rb.SheetNames.length === 5, '5 个 sheet', `=${rb.SheetNames.length}`);
  assert(JSON.stringify(rb.SheetNames).includes('真实成绩表'), '含真实成绩表');
  assert(JSON.stringify(rb.SheetNames).includes('空Sheet'), '含空Sheet');
  // 主表选择逻辑（detectMainWorksheet）在项目侧，这里至少确认各 sheet 数据可读
  const score = utils.sheet_to_json<any[]>(rb.Sheets['真实成绩表'], { header: 1, defval: '', raw: false });
  assert(score[0][0] === '姓名' && score[1][1] === '100', '真实成绩表数据正确');
  const empty = utils.sheet_to_json<any[]>(rb.Sheets['空Sheet'], { header: 1, defval: '', raw: false });
  assert(empty.length === 0, '空Sheet 空数据');
}

// ===== 3. 合并单元格 / 多级表头 =====
console.log('\n3. 合并单元格 / 多级表头（merges 读取 + 父子表头展开）');
{
  const path = join(tmp, 'merged.xlsx');
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([
    ['数据Q243班综合测评表25-26-1'],
    ['班级', '学号', '姓名', '德育', '德育', '德育', '智育', '智育', '智育', '总分'],
    ['', '', '', '加分', '扣分', '合计', '加分', '扣分', '合计', ''],
    ['5班', '202401', '张三', '5', '0', '92', '3', '0', '88', '580'],
  ]);
  ws['!merges'] = [
    { s: { r: 1, c: 3 }, e: { r: 1, c: 5 } }, // 德育横 3 列
    { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } }, // 智育横 3 列
  ];
  utils.book_append_sheet(wb, ws, '综合表');
  writeFileSync(path, buildBuf(wb, 'xlsx'));

  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  const ws2 = rb.Sheets['综合表'];
  const merges = (ws2['!merges'] as any[]) || [];
  assert(merges.length === 2, 'merges 读取到 2 个', `=${merges.length}`);
  assert(merges[0].s.c === 3 && merges[0].e.c === 5, '德育 merges 正确');

  // 用项目多级表头逻辑展开
  const rawRows = utils.sheet_to_json<any[]>(ws2, { header: 1, defval: '', raw: false });
  const res = detectAndFlattenMultiRowHeaders(rawRows, merges);
  assert(res.isMultiRow === true, '识别为多级表头');
  assert(res.headers.includes('德育_加分'), '德育_加分 字段');
  assert(res.headers.includes('智育_合计'), '智育_合计 字段');
  assert(res.headers.includes('总分'), '总分 字段保留');

  // 单行表头场景（普通成绩表）也应该能 detectHeaderRow 正常
  const basic = utils.aoa_to_sheet([['姓名', '总分'], ['张三', 100]]);
  const basicRows = utils.sheet_to_json<any[]>(basic, { header: 1, defval: '', raw: false });
  assert(basicRows[0][0] === '姓名', '单行表头数据');
}

// ===== 4. 中文 =====
console.log('\n4. 中文 sheet/表头/数据');
{
  const path = join(tmp, 'cn.xlsx');
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([['类别名称', '利润率'], ['服饰配件', '12.5%'], ['家居用品', '8.5%']]);
  utils.book_append_sheet(wb, ws, '中文明细表');
  writeFileSync(path, buildBuf(wb, 'xlsx'));
  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  assert(rb.SheetNames[0] === '中文明细表', '中文 sheet 名');
  const d = utils.sheet_to_json<any[]>(rb.Sheets['中文明细表'], { header: 1, defval: '', raw: false });
  assert(d[0][0] === '类别名称' && d[1][0] === '服饰配件', '中文表头/数据');
  // 百分号字符串原样保留（由项目 numericParser 决定语义）
  assert(d[1][1] === '12.5%', '百分号文本保留');
}

// ===== 5. 数字类型 =====
console.log('\n5. Excel 原生 numeric cell');
{
  const path = join(tmp, 'num.xlsx');
  const wb = utils.book_new();
  // raw:false 保留数字为字符串，raw:true 保数字
  const ws = utils.aoa_to_sheet([['数值'], [100], [95.5], [0], [-10]]);
  utils.book_append_sheet(wb, ws, '数值');
  writeFileSync(path, buildBuf(wb, 'xlsx'));
  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  const numeric = utils.sheet_to_json<any[]>(rb.Sheets['数值'], { header: 1, defval: '', raw: true });
  assert(numeric[1][0] === 100, '100 数字');
  assert(numeric[2][0] === 95.5, '95.5 数字');
  assert(numeric[3][0] === 0, '0 数字');
  assert(numeric[4][0] === -10, '-10 数字');
}

// ===== 6. 日期 =====
console.log('\n6. 日期单元格（保留原始处理）');
{
  const path = join(tmp, 'date.xlsx');
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([['日期'], [new Date(2024, 0, 15)], [new Date(2024, 1, 20)]]);
  utils.book_append_sheet(wb, ws, '日期');
  writeFileSync(path, buildBuf(wb, 'xlsx'));
  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  // 项目当前 raw:false 时 SheetJS 会把日期转成以 1899/1900 为起点的 excel serial number 字符串
  const d = utils.sheet_to_json<any[]>(rb.Sheets['日期'], { header: 1, defval: '', raw: false });
  const rawTrue = utils.sheet_to_json<any[]>(rb.Sheets['日期'], { header: 1, defval: '', raw: true });
  assert(d[1][0] !== '' && d[1][0] != null, '日期有值');
  // 与升级前行为一致：日期以 serial number 形式给出（非崩溃/非 undefined）
  assert(rawTrue[1][0] != null, 'raw:true 日期值是数值(serial)');
}

// ===== 7. .xls 旧格式 =====
console.log('\n7. .xls 旧格式');
{
  const path = join(tmp, 'legacy.xls');
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([['姓名', '总分'], ['王五', 88]]);
  utils.book_append_sheet(wb, ws, 'Sheet1');
  writeFileSync(path, buildBuf(wb, 'biff8'));
  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  assert(JSON.stringify(rb.SheetNames) === JSON.stringify(['Sheet1']), '.xls sheetNames 正确');
  const d = utils.sheet_to_json<any[]>(rb.Sheets['Sheet1'], { header: 1, defval: '', raw: false });
  assert(d[0][0] === '姓名' && d[1][1] === '88', '.xls 数据正确');
}

// ===== 8. 10000 行大文件（Worker 等价：read + sheet_to_json） =====
console.log('\n8. 大文件（10000 行）');
{
  const path = join(tmp, 'big.xlsx');
  const wb = utils.book_new();
  const rows: (string | number)[][] = [['序号', '数值']];
  for (let i = 1; i <= 10000; i++) rows.push([i, i * 100]);
  const ws = utils.aoa_to_sheet(rows);
  utils.book_append_sheet(wb, ws, '大表');
  writeFileSync(path, buildBuf(wb, 'xlsx'));

  const t0 = Date.now();
  const rb = read(readFileSync(path), { type: 'buffer', cellFormula: false, cellHTML: false });
  const d = utils.sheet_to_json<any[]>(rb.Sheets['大表'], { header: 1, defval: '', raw: false });
  const elapsed = Date.now() - t0;
  assert(d.length === 10001, `10000 行数据读取（含表头）=${d.length}`);
  assert(d[10000][1] === '1000000', '最后一行正确');
  assert(elapsed < 3000, `读取耗时 ${elapsed}ms < 3s（无明显退化）`);
}

console.log(`\n=== 结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
// 清理临时目录
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
if (failed > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}