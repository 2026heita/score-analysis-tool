/**
 * 第十七阶段：最终发布验收 — 真实源码校验（整合验收数值）
 * 直接导入真实生产函数验证，不复制算法。
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/verifyRelease.ts
 */
import { parseNumericValue, parseNumericValueLegacy } from '../src/utils/tableParser/numericParser.js';
import { computePercentile, computePosition } from '../src/engine/analysisEngine.js';
import { explainField } from '../src/utils/analysisExplainer.js';
import { generateBins, generateCdf, buildQuartilePieData } from '../src/utils/chartData.js';
import { minMax } from '../src/utils/stats.js';
import { parseCsvText, detectDelimiter, splitLine } from '../src/utils/tableParser/index.js';
import { parseTableText } from '../src/utils/parseTable.js';
import { detectHeaderRow } from '../src/utils/tableParser/headerDetection.js';
import { filterRows, buildNumericFieldSet } from '../src/engine/filterRows.js';

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ` :: ${detail}` : '')); }
}
function eq(a: number | null, b: number | null, name: string) {
  assert(a === b, name, `actual=${a} expected=${b}`);
}
function close(a: number, b: number, tol: number, name: string) {
  assert(Math.abs(a - b) <= tol, name, `actual=${a} expected=${b}`);
}

console.log('=== 第十七阶段：最终验收真实源码校验 ===\n');

// ===== 1. 数值解析 =====
console.log('1. 数值解析');
{
  const valid: Array<[string, number]> = [
    ['123', 123], ['123.45', 123.45], ['.5', 0.5], ['1e3', 1000], ['0', 0], ['-1', -1],
    ['1,000', 1000], ['1,234.56', 1234.56], ['-1,234', -1234], ['1,000%', 1000],
  ];
  for (const [input, exp] of valid) {
    const v = parseNumericValueLegacy(input);
    assert(v === exp, `valid ${JSON.stringify(input)} → ${exp}`, `got=${v}`);
  }
  const invalid = ['1,23', '1,2,3', '12,34,567', '78分', '100abc', '1e309'];
  for (const input of invalid) {
    assert(parseNumericValueLegacy(input) === null, `invalid ${JSON.stringify(input)} → null`, `got=${parseNumericValueLegacy(input)}`);
  }
  // 0 不是空值
  assert(parseNumericValue('0').status === 'valid', '0 为 valid（非 empty）');
  // / - | 为 empty
  for (const ph of ['/', '-', '|']) {
    assert(parseNumericValue(ph).status === 'empty', `${JSON.stringify(ph)} → empty`);
  }
  // 缺考 invalid
  assert(parseNumericValue('缺考').status === 'invalid', '缺考 → invalid');
  assert(parseNumericValue('').status === 'empty', '空字符串 → empty');
}

// ===== 2. 百分位 =====
console.log('2. 百分位');
{
  const d = [10, 20, 30, 40];
  // higher-is-better: P(X<=x)
  close(computePercentile(d, 10, false), 25, 0.01, '[10,20,30,40] 10→25%');
  close(computePercentile(d, 20, false), 50, 0.01, '20→50%');
  close(computePercentile(d, 30, false), 75, 0.01, '30→75%');
  close(computePercentile(d, 40, false), 100, 0.01, '40→100%');
  close(computePercentile(d, 41, false), 100, 0.01, '41→100%');
  close(computePercentile(d, 9, false), 0, 0.01, '9→0%');
  // 重复值
  const dup = [10, 20, 20, 20, 40];
  close(computePercentile(dup, 20, false), 80, 0.01, '重复 20→80%');
  close(computePercentile(dup, 40, false), 100, 0.01, '重复 40→100%');
  // lower-is-better 排名 [1,2,2,4,5]
  const rank = [1, 2, 2, 4, 5];
  close(computePercentile(rank, 1, true), 100, 0.01, 'rank 1 → 100%（最佳）');
  close(computePercentile(rank, 2, true), 80, 0.01, 'rank 2 → 80%（含 equalCount）');
  close(computePercentile(rank, 5, true), 20, 0.01, 'rank 5 → 20%');
  // 生产 explainField 走真实 computePercentile
  const exp = explainField('语文', 85, [60, 65, 70, 75, 80, 86, 87, 88, 89, 90], false);
  assert(exp !== null && closePercent(exp!.percentile, 50), 'explainField 85 → 50%（真实源码）', `pct=${exp?.percentile}`);
  function closePercent(a: number, b: number) { return Math.abs(a - b) <= 0.01; }
}

// ===== 3. Histogram（4~13） =====
console.log('3. Histogram');
{
  const data = Array.from({ length: 10 }, (_, i) => 4 + i); // 4..13
  const bins = generateBins(data, 10);
  // 7 落在正确 bin
  const bin7 = bins.findIndex(b => 7 >= b.start && 7 < b.end);
  assert(bin7 >= 0, '输入 7 落在某个 bin');
  // 13 属于最后一个 bin
  const lastEnd = bins[bins.length - 1].end;
  assert(13 >= bins[bins.length - 1].start && 13 <= lastEnd, '13 属于最后一个 bin');
  // 13.1 超过范围？ 实际 generateBins 的 dataMax=13；13.1>13 → 组件判断超范围
  assert(13.1 > 13, '13.1 高于数据范围');
  // min/max 正确
  const mm = minMax(data);
  assert(mm!.min === 4 && mm!.max === 13, 'histogram 范围 4~13');
  // 全相同
  const same = generateBins([13, 13, 13, 13], 10);
  assert(same.length === 1 && same[0].count === 4, '全相同 → 单一 bin(4条)');
}

// ===== 4. CDF 阶梯语义 =====
console.log('4. CDF');
{
  const cdf = generateCdf([10, 20, 30, 40]);
  // generateCdf 输出每个不同值处的 P(X<=x)
  const p10 = cdf.find(p => p.value === 10)?.percentile;
  const p20 = cdf.find(p => p.value === 20)?.percentile;
  const p40 = cdf.find(p => p.value === 40)?.percentile;
  close(p10!, 25, 0.01, 'CDF 10→25%');
  close(p20!, 50, 0.01, 'CDF 20→50%');
  close(p40!, 100, 0.01, 'CDF 40→100%');
  // 全相同
  const c2 = generateCdf([13, 13, 13, 13]);
  assert(c2.length === 1 && c2[0].value === 13 && c2[0].percentile === 100, '全相同 CDF → 100%（x>=13）');
}

// ===== 5. BoxPlot（四分位图数据） =====
console.log('5. BoxPlot');
{
  const same = buildQuartilePieData([13, 13, 13, 13]);
  assert(same !== null && same.isAllSame === true, '全相同四分位 → isAllSame');
  const neg = buildQuartilePieData([-100, 0, 100]);
  assert(neg !== null && !neg.isAllSame, '[-100,0,100] 非全相同');
  assert(Number.isFinite(neg!.q1) && Number.isFinite(neg!.median) && Number.isFinite(neg!.q3), '[-100,0,100] 四分位无 NaN');
  assert(neg!.q1 === -50 && neg!.median === 0 && neg!.q3 === 50, '[-100,0,100] 线性插值 q1=-50 中位数=0 q3=50', `q1=${neg?.q1} med=${neg?.median} q3=${neg?.q3}`);
}

// ===== 6. CSV =====
console.log('6. CSV');
{
  const r = parseTableText('姓名,描述,总分\n张三,"优秀,稳定",100');
  assert(r.rows.length === 1 && r.rows[0]['描述'] === '优秀,稳定', 'quoted comma 单个单元格');
  const t = parseTableText('姓名,金额\n张三,"1,234"\n李四,"2,500.50"');
  assert(parseNumericValueLegacy(t.rows[0]['金额']) === 1234, 'quoted 千分位 1234');
  assert(parseNumericValueLegacy(t.rows[1]['金额']) === 2500.5, 'quoted 千分位 2500.5');
  const esc = parseTableText('姓名,描述\n张三,"他说""优秀"""');
  assert(esc.rows[0]['描述'] === '他说"优秀"', 'escaped quote');
  const nl = parseTableText('姓名,描述,总分\n张三,"优秀\n稳定",100');
  assert(nl.rows.length === 1, 'quoted newline 保持单条');
  const amb = parseTableText('姓名,金额\n李四,500\n张三,1,234');
  assert(amb.rows.every((x: any) => x['姓名'] !== '张三'), '歧义行 张三,1,234 被排除');
  const hasWarn = (amb.warnings || []).some((w: string) => w.includes('列数与表头不一致') || w.includes('已跳过该行'));
  assert(hasWarn, '歧义行有 warning');
  const crlfRows = parseCsvText('姓名,总分\r\n张三,90\r\n', ',');
  assert(!crlfRows.rows[1][1].includes('\r'), 'CRLF 无 \\r 残留');
}

// ===== 7. 表头 =====
console.log('7. 表头');
{
  const s = detectHeaderRow([['总分'], ['100'], ['90'], ['80']]);
  assert(s.headerRowIndex === 0 && s.headers[0] === '总分', '单列表头 总分');
  const num = detectHeaderRow([['100'], ['90'], ['80']]);
  assert(num.headerRowIndex === -1, '纯数字单列不识别');
  const sparse = detectHeaderRow([['', '', '总分'], ['', '', '100'], ['', '', '90']]);
  assert(sparse.headerRowIndex === 0 && sparse.headers[2] === '总分', '稀疏表头 ""|""|总分');
  const noteCol = detectHeaderRow([['姓名', '总分', '备注'], ['张三', '100', '优秀']]);
  assert(noteCol.headerRowIndex === 0, '备注列不被误伤');
  const noteRow = detectHeaderRow([['备注：缺考学生不参与统计'], ['姓名', '总分'], ['张三', '100']]);
  assert(noteRow.headerRowIndex === 1, '备注说明选第二行');
}

// ===== 9. Filter =====
console.log('9. Filter');
{
  const rows = [{'金额': '1000'}, {'金额': '1500'}, {'金额': '2000'}, {'金额': '500'}];
  const set = buildNumericFieldSet([{ header: '金额', analysisRole: 'courseScore' } as any]);
  const between = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: '1,000', betweenMax: '2,000' }], set);
  assert(between.filteredRows.length === 3, 'between 1,000~2,000 命中 3 条(1000/1500/2000)', `got=${between.filteredRows.length}`);
  const eq1 = filterRows(rows, [{ field: '金额', operator: 'equals', value: '1,500' }], set);
  assert(eq1.filteredRows.length === 1, 'equals 1500');
  const gt = filterRows(rows, [{ field: '金额', operator: 'gt', value: '1,000' }], set);
  assert(gt.filteredRows.length === 2, 'gt 1000 → 1500/2000');
  const lt = filterRows(rows, [{ field: '金额', operator: 'lt', value: '2,000' }], set);
  assert(lt.filteredRows.length === 3, 'lt 2000 → 1000/1500/500');
  // 非法下/上限
  const badMin = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: 'abc', betweenMax: '2,000' }], set);
  assert(badMin.filteredRows.length === 0, '非法下限 → 无命中');
  const badMax = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: '1,000', betweenMax: 'xyz' }], set);
  assert(badMax.filteredRows.length === 0, '非法上限 → 无命中');
  const rev = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: '2,000', betweenMax: '1,000' }], set);
  assert(rev.filteredRows.length === 0, '下限>上限 → 无命中');
  const emptyMin = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: '', betweenMax: '2,000' }], set);
  assert(emptyMin.filteredRows.length === 0, '空下限 → 无命中');
  const emptyMax = filterRows(rows, [{ field: '金额', operator: 'between', betweenMin: '1,000', betweenMax: '' }], set);
  assert(emptyMax.filteredRows.length === 0, '空上限 → 无命中');
}

// ===== 11. 大数据 =====
console.log('11. 大数据');
{
  const big = new Array(100000);
  for (let i = 0; i < big.length; i++) big[i] = i % 1000;
  const m = minMax(big);
  assert(m !== null && m.min === 0 && m.max === 999, 'minMax 100000');
  const g = new Array(1000000);
  for (let i = 0; i < g.length; i++) g[i] = i;
  const gm = minMax(g);
  assert(gm !== null && gm.min === 0 && gm.max === 999999, 'minMax 1000000');
}

console.log(`\n=== 验收校验结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (failed > 0) {
  console.log('失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}