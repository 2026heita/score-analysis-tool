import { validateFile } from '../src/utils/fileImport.js';
import { parseRawRows, MAX_ROWS } from '../src/utils/tableParser/workbook.js';
import { XLSX_WORKER_TIMEOUT_MS, parseXlsxInWorker } from '../src/utils/parseInWorker.js';
import { read, utils, write } from 'xlsx';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
console.log('=== 第二十六阶段：Excel 大文件与 Worker 健壮性回归测试 ===');

console.log('1. validateFile');
{
  const err = validateFile(new File([new Uint8Array(21 * 1024 * 1024)], 'big.xlsx'));
  ok(err !== null && err.indexOf('过大') >= 0 && err.indexOf('精简数据') >= 0, '超限拒绝含人话提示');
  ok(validateFile(new File([new Uint8Array(1024)], 'ok.xlsx')) === null, '小文件通过');
  ok(validateFile(new File([new Uint8Array(100)], 'a.txt')) !== null, '非Excel拒绝');
}

console.log('2. MAX_ROWS 边界');
{
  const below = [['姓名'], ...Array.from({ length: MAX_ROWS - 1 }, (_, i) => ['s' + i])];
  const rB = parseRawRows(below as unknown[][]);
  ok(rB.dataVolumeState.isParseTruncated === false && rB.rows.length === MAX_ROWS - 1, 'MAX_ROWS-1 成功');

  const at = [['姓名'], ...Array.from({ length: MAX_ROWS }, (_, i) => ['s' + i])];
  const rAt = parseRawRows(at as unknown[][]);
  ok(rAt.dataVolumeState.isParseTruncated === false && rAt.rows.length === MAX_ROWS, 'MAX_ROWS 成功');

  const over = [['姓名'], ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => ['s' + i])];
  let threw = false;
  try { parseRawRows(over as unknown[][]); } catch (e: any) {
    threw = (e && e.name === 'ParseError') && String(e.message).indexOf('20,000') >= 0;
  }
  ok(threw, 'MAX_ROWS+1 整份拒绝（抛 ParseError 且含 20,000 提示）');
}

console.log('2b. 真实 xlsx 超限整份拒绝（Worker 受限读取路径）');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xlsx-reject-'));
  const wb = utils.book_new();
  const rows = [['姓名', '分值']];
  for (let i = 1; i <= MAX_ROWS + 1; i++) rows.push(['s' + i, i]);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), '超限表');
  const p = join(tmp, 'over.xlsx');
  writeFileSync(p, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  // 与 Worker 相同的受限读取：sheetRows = MAX_ROWS+50
  const rawData = utils.sheet_to_json<any[]>(
    read(readFileSync(p), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false }).Sheets['超限表'],
    { header: 1, defval: '', raw: false },
  );
  ok(rawData.length === MAX_ROWS + 2, '受限读取完整拿到全部 ' + (MAX_ROWS + 2) + ' 物理行（未触发 cap）');
  let rejected = false;
  try { parseRawRows(rawData); } catch (e: any) { rejected = e && e.name === 'ParseError'; }
  ok(rejected, '真实超限 xlsx（20001 行数据）整份拒绝');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('3. 多层表头 + sheetRows 不切合法记录（真实 xlsx）');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xlsx-multi-'));
  const wb = utils.book_new();
  const full = [
    ['班级', '德育', '德育', '智育'], ['', '加分', '扣分', '合计'],
    ...Array.from({ length: MAX_ROWS }, () => ['5班', '3', '0', '88']),
  ];
  utils.book_append_sheet(wb, utils.aoa_to_sheet(full), '综合表');
  const p = join(tmp, 'multi.xlsx');
  writeFileSync(p, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  const data = utils.sheet_to_json(read(readFileSync(p), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false }).Sheets['综合表'], { header: 1, defval: '', raw: false });
  ok(data.length === MAX_ROWS + 2, '多层表头后 MAX_ROWS 条数据完整保留');
  ok(data[data.length - 1][0] === '5班', '最后一条合法记录保留');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('4. 超时常量');
{
  ok(XLSX_WORKER_TIMEOUT_MS === 30 * 1000 && XLSX_WORKER_TIMEOUT_MS > 5000, '生产超时30s');
}

console.log('5. sheetRows 第二层内存保护');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xlsx-rob-'));
  const wb = utils.book_new();
  const rows = [['姓名', '分值']];
  for (let i = 1; i <= MAX_ROWS + 200; i++) rows.push(['s' + i, i]);
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), '大表');
  const path = join(tmp, 'large.xlsx');
  writeFileSync(path, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  const data = utils.sheet_to_json(read(readFileSync(path), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false }).Sheets['大表'], { header: 1, defval: '', raw: false });
  ok(data.length === MAX_ROWS + 50, 'sheetRows 仅解析近上限行，不读整表 (' + data.length + ')');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('6. 真实 xlsx merges 中文 多sheet');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xlsx-rob2-'));
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([
    ['数据示范表'], ['班级', '德育', '德育', '怡园'], ['', '加分', '扣分', '成绩'],
    ['五班', '5', '0', '90%'], ['六班', '3', '1', '12.5%'],
  ]);
  ws['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }];
  utils.book_append_sheet(wb, ws, '中文明细');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['说明'], ['表']]), '说明');
  const p = join(tmp, 'regress.xlsx');
  writeFileSync(p, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  const rb = read(readFileSync(p), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false });
  ok(rb.SheetNames.length === 2 && rb.SheetNames[0] === '中文明细', '多sheet+中文名');
  const d = utils.sheet_to_json(rb.Sheets['中文明细'], { header: 1, defval: '', raw: false });
  ok(d[1][0] === '班级' && d[3][0] === '五班' && d[3][3] === '90%', '中文数据+百分号');
  ok(((rb.Sheets['中文明细']['!merges'] as any[]) || []).length === 1, 'merges 正常');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('7. 数字日期');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xlsx-rob3-'));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['数值'], [100], [95.5], [0], [-10], [new Date(2024, 0, 15)]]), '数值');
  const p = join(tmp, 'num.xlsx');
  writeFileSync(p, write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
  const raw = utils.sheet_to_json(read(readFileSync(p), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false }).Sheets['数值'], { header: 1, defval: '', raw: true });
  ok(raw[1][0] === 100 && raw[2][0] === 95.5 && raw[3][0] === 0 && raw[4][0] === -10 && raw[5][0] != null, '数字+日期');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('8. .xls');
{
  const tmp = mkdtempSync(join(tmpdir(), 'xls-rob-'));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['姓名', '总分'], ['王五', 88]]), 'Sheet1');
  const p = join(tmp, 'legacy.xls');
  writeFileSync(p, write(wb, { bookType: 'biff8', type: 'buffer' }) as Buffer);
  const d = utils.sheet_to_json(read(readFileSync(p), { type: 'buffer', sheetRows: MAX_ROWS + 50, cellFormula: false, cellHTML: false }).Sheets['Sheet1'], { header: 1, defval: '', raw: false });
  ok(d[0][0] === '姓名' && d[1][1] === '88', '.xls 数据正常');
  rmSync(tmp, { recursive: true, force: true });
}

// ---- 伪 Worker：用于驱动 parseXlsxInWorker 的各类出口 ----
type Handler = (e: any) => void;
class FakeWorker {
  static open: FakeWorker[] = [];
  handlers: Record<string, Handler[]> = {};
  terminated = false;
  terminateCount = 0;
  posted: any[] = [];
  constructor(_url?: unknown, _opt?: unknown) { FakeWorker.open.push(this); }
  addEventListener(t: string, cb: Handler) { (this.handlers[t] ||= []).push(cb); }
  removeEventListener(t: string, cb: Handler) { this.handlers[t] = (this.handlers[t] || []).filter(f => f !== cb); }
  postMessage(m: any) { this.posted.push(m); }
  terminate() { this.terminated = true; this.terminateCount++; }
  emit(t: string, e: any) { for (const cb of this.handlers[t] || []) cb(e); }
}

console.log('9. Worker 生命周期（全部出口必须 settle 且 terminate）');
{
  const original = (globalThis as any).Worker;
  (globalThis as any).Worker = FakeWorker as any;
  const lastWorker = () => FakeWorker.open[FakeWorker.open.length - 1];

  // success：message 返回数据
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 5000 });
    const wk = lastWorker();
    const id = wk.posted[0].id;
    wk.emit('message', { data: { id, sheetsData: [{ name: 'S', data: [[1]], merges: [] }] } });
    const out = await p;
    ok(out.length === 1 && out[0].name === 'S', 'success 正常返回解析结果');
    ok(wk.terminated && wk.terminateCount === 1, 'success 后恰好 terminate 一次');
  }

  // message 带 error 字段（Worker 内部主动报错）
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 5000 });
    const wk = lastWorker();
    const id = wk.posted[0].id;
    wk.emit('message', { data: { id, error: 'worker exploded' } });
    let msg = '';
    try { await p; } catch (e: any) { msg = String(e.message); }
    ok(msg.indexOf('worker exploded') >= 0, 'Worker 返回 error 拒绝');
    ok(wk.terminated, 'error 后 terminate');
  }

  // onerror 事件
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 5000 });
    const wk = lastWorker();
    wk.emit('error', { message: 'boom' });
    let msg = '';
    try { await p; } catch (e: any) { msg = String(e.message); }
    ok(msg.indexOf('boom') >= 0, 'onerror 拒绝');
    ok(wk.terminated, 'onerror 后 terminate');
  }

  // onmessageerror 事件
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 5000 });
    const wk = lastWorker();
    wk.emit('messageerror', {});
    let msg = '';
    try { await p; } catch (e: any) { msg = String(e.message); }
    ok(msg.indexOf('解析消息异常') >= 0, 'onmessageerror 拒绝');
    ok(wk.terminated, 'onmessageerror 后 terminate');
  }

  // timeout：不触发任何事件
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 1 });
    const wk = lastWorker();
    let msg = '';
    try { await p; } catch (e: any) { msg = String(e.message); }
    ok(msg.indexOf('过长') >= 0, 'timeout 拒绝');
    ok(wk.terminated && wk.terminateCount === 1, 'timeout 后 terminate 一次');
  }

  // 单次结算：success 后再次触发 error 不应二次 settle
  {
    const p = parseXlsxInWorker(new ArrayBuffer(8), { timeoutMs: 5000 });
    const wk = lastWorker();
    const id = wk.posted[0].id;
    wk.emit('message', { data: { id, sheetsData: [] } });
    await p;
    const before = wk.terminateCount;
    wk.emit('error', { message: 'late' }); // 已清理，不应触发任何 handler
    ok(wk.terminateCount === before, 'success 后事件被清理，不重复 settle');
  }

  (globalThis as any).Worker = original;
}

console.log('通过: ' + passed + ' 失败: ' + failed);
if (failed > 0) { console.log('失败: ' + failures.join('; ')); process.exit(1); }
else { console.log('ALL PASS'); process.exit(0); }

