/**
 * 阶段 30：最终发布审查——交叉场景验证（真实生产函数，只验证不改生产）
 *
 * 场景 A：CSV 标题 + 表头 + 引号逗号 + 千分位 + 百分号 + "/"
 * 场景 B：真实 xlsx 多级表头 20000/20001 由 scripts/testStage29MultiHeaderRows.ts 覆盖
 * 场景 C：普通筛选 -> 异常值排除 -> 恢复（统计/计数同步），字段切换隔离由 testOutlierExclusion 覆盖
 * 场景 D：百分号 + 极端数值 + 空值混合，不出现两套百分号尺度亦不出现 Infinity/NaN
 * 场景 E：A→错误B→C 的旧分析残留清除由 scripts/testStateReliability.ts（纯链路）+ 阶段27 覆盖
 */

import { parseTableText } from '../src/utils/parseTable.js';
import { parseRawRows } from '../src/utils/tableParser/workbook.js';
import { filterRows } from '../src/engine/filterRows.js';
import { parseNumericValueLegacy } from '../src/utils/tableParser/numericParser.js';
import { mean } from '../src/utils/stats.js';
import { extractFieldNumericValues, filterRowsExcluding } from '../src/engine/outlierExclusion.js';
import { detectOutliersFromValues } from '../src/engine/univariateAnalyzer.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

console.log('=== 阶段30 交叉场景验证 ===');

console.log('场景 A：CSV 标题/引号逗号/千分位/百分号/"/"');
{
  const csv = '2026年销售数据\n商品,销售额,完成率,备注\n统计学教材,"1,000",85%,"正常,稳定"\n普通商品,"2,500",90%,/';
  const r = parseTableText(csv);
  ok(r.dataVolumeState.rawRowCount === 2 && r.dataVolumeState.parsedRowCount === 2, 'A 标题跳过，真实数据 2 条');
  ok(r.rows.some(x => x['商品'] === '统计学教材'), 'A 统计学教材保留（未误删）');
  const sales = extractFieldNumericValues(r.rows as Record<string, string>[], '销售额').values;
  ok(JSON.stringify(sales) === '[1000,2500]', 'A 销售额按 1000/2500（千分位正确）');
  const rates = extractFieldNumericValues(r.rows as Record<string, string>[], '完成率').values;
  ok(JSON.stringify(rates) === '[85,90]', 'A 完成率按 85/90（百分号一致）');
  const emptyNotes = filterRows(r.rows as Record<string, string>[], [{ field: '备注', operator: 'isEmpty', value: '' }], new Set(['销售额'])).filteredRows.map(x => x['商品']);
  ok(JSON.stringify(emptyNotes) === '["普通商品"]', 'A "/" 为空值，isEmpty 命中普通商品');
  const gt0 = filterRows(r.rows as Record<string, string>[], [{ field: '销售额', operator: 'gt', value: '0' }], new Set(['销售额'])).filteredRows.length;
  ok(gt0 === 2, 'A 销售额数字筛选工作（>0 命中 2 条）');
}

console.log('场景 D：百分号 + 极端数值 + 空值混合');
{
  ok(parseNumericValueLegacy('85%') === 85 && parseNumericValueLegacy('100%') === 100, 'D 85%/100% → 85/100 单一尺度');
  ok(parseNumericValueLegacy('/') === null, 'D "/" 为空值（非数字）');
  const vals = ['1e308', '1e308'].map(v => parseNumericValueLegacy(v)!);
  ok(vals.every(v => Number.isFinite(v)), 'D 1e308 可解析为有限数字');
  const m = mean(vals);
  ok(Number.isFinite(m) && m === 1e308, 'D mean(1e308,1e308)=1e308，不出现 Infinity/NaN');
}

console.log('场景 C：普通筛选 -> 异常值排除 -> 恢复');
{
  const table: any[] = [['学号', '分', '分2']];
  for (let i = 0; i < 100; i++) table.push(['s' + i, 50 + (i % 10), 10 + (i % 5)]);
  table.push(['x', 1000, 999]);
  const parsed = parseRawRows(table);
  const numericFields = new Set(parsed.summary!.fieldTypes.filter((m: any) => m.header === '分' || m.header === '分2').map((m: any) => m.header));
  const filtered = filterRows(parsed.rows as Record<string, string>[], [{ field: '分', operator: 'gt', value: '0' }], numericFields).filteredRows;
  ok(filtered.length === 101, 'C 普通筛选后 101 条');
  const ext = extractFieldNumericValues(filtered, '分');
  const outs = detectOutliersFromValues(ext.values);
  ok(outs.map(o => o.value).includes(1000), 'C 检测出离群值 1000');
  const excludedSet = new Set(outs.map(o => ext.rowIndices[o.rowIndex]));
  const after = filterRowsExcluding(filtered, excludedSet);
  ok(after.length === 100 && mean(extractFieldNumericValues(after, '分').values) < 60, 'C 排除后计数=100 且均值被拉回（统计同步）');
  const restored = filterRowsExcluding(filtered, new Set());
  ok(restored.length === 101, 'C 恢复异常值后还原 101 条');
}

console.log('通过: ' + passed + ' 失败: ' + failed);
if (failed > 0) { console.log('失败: ' + failures.join('; ')); process.exit(1); }
else { console.log('ALL PASS'); process.exit(0); }