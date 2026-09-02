/**
 * 异常值检测（结构化）误判防护回归测试
 *
 * 直接验证通用异常检测模块 detectFieldOutliers 的状态机与边界处理：
 *   A. 极端值 → high outlier，能被检出
 *   B. IQR=0 不武断判异常（变化过小 → insufficient_variation）
 *   C. 有效样本 < minSampleSize → 不判异常（insufficient_data）
 *   D. 低基数离散整数 → 跳过（unsupported）
 *   E. identifier 字段 → 跳过（unsupported）
 *   F. NaN / null / Infinity → 忽略，不污染四分位统计
 *   G. 异常 record 携带正确原始行下标
 *   H. 筛选后检测：基于传入值，rowIndex 仍能定位原始记录
 *   I. 普通零售销售数据：一个极端值能显示具体记录
 *   J. 无异常数据 → outlierCount === 0
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testOutlierDetection.ts
 */
import { detectFieldOutliers } from '../src/engine/outlierDetection.js';
import type { OutlierDetectionResult } from '../src/engine/outlierDetection.js';

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

console.log('=== 异常值检测（结构化）误判防护回归测试 ===\n');

// ===== A. 极端值识别为 high outlier =====
console.log('A. [10,11,12,13,14,15,16,100] → 100 为高异常');
{
  const r = detectFieldOutliers([10, 11, 12, 13, 14, 15, 16, 100], { field: 'val' });
  assert(r.status === 'detected', `status === 'detected'（实际 ${r.status}）`);
  assert(r.outlierCount === 1, `outlierCount === 1（实际 ${r.outlierCount}）`);
  assert(r.records[0]?.value === 100, '记录值为 100');
  assert(r.records[0]?.direction === 'high', '方向为 high');
  assert(r.records[0]?.rowIndex === 7, 'rowIndex 指向原数组下标 7', `实际 ${r.records[0]?.rowIndex}`);
  assert(r.records[0]?.reason.includes('> 上界'), `判定依据含上界（实际 ${r.records[0]?.reason}）`);
  assert(r.records[0]?.distance != null && r.records[0].distance > 0, 'distance > 0');
  assert(r.bounds != null && r.records[0].value > r.bounds.upper, '记录值高于 upper bound');
}

// ===== B. IQR=0 不武断判异常 =====
console.log('B. [10,10,10,10,10,10,10,11] → 变化过小，11 不判异常');
{
  const r = detectFieldOutliers([10, 10, 10, 10, 10, 10, 10, 11], { field: 'val' });
  assert(
    r.status === 'insufficient_variation' || (r.status === 'detected' && r.outlierCount === 0),
    `status 为 insufficient_variation 或空检测（实际 ${r.status} / ${r.outlierCount}）`
  );
  const flag11 = r.records.some(rec => rec.value === 11);
  assert(!flag11, '11 未被判异常（IQR=0 不武断）');
}

// ===== B2. 极端相对主值仍应被检出（IQR=0 但有真实极端值） =====
console.log('B2. [10,10,10,10,10,10,10,1000] → 1000 显著偏离主值区应检出');
{
  const r = detectFieldOutliers([10, 10, 10, 10, 10, 10, 10, 1000], { field: 'val' });
  assert(r.status !== 'insufficient_variation', `状态不是 insufficient_variation（实际 ${r.status}）`);
  const flag1000 = r.records.some(rec => rec.value === 1000);
  assert(flag1000, '1000 被检出为异常候选');
}

// ===== C. 有效样本 < minSampleSize → 不判异常 =====
console.log('C. 有效样本过少（7 个）→ insufficient_data');
{
  const r = detectFieldOutliers([10, 11, 12, 13, 14, 15, 100], { field: 'val' });
  assert(r.status === 'insufficient_data', `status === 'insufficient_data'（实际 ${r.status}）`);
  assert(r.outlierCount === 0, 'outlierCount === 0');
  assert(r.records.length === 0, '无异常记录');
}

// ===== D. 低基数离散整数 → 跳过 =====
console.log('D. [1,2,3,1,2,3,1,2] 低基数离散 → unsupported');
{
  const r = detectFieldOutliers([1, 2, 3, 1, 2, 3, 1, 2], { field: 'statusCode' });
  assert(r.status === 'unsupported', `status === 'unsupported'（实际 ${r.status}）`);
  assert(r.discreteLowCardinality === true, 'discreteLowCardinality === true');
  assert(r.outlierCount === 0, 'outlierCount === 0');
}

// ===== E. identifier 字段 → 跳过 =====
console.log('E. identifier 字段 [10001,10002,10003,99999,...] → unsupported');
{
  const r = detectFieldOutliers(
    [10001, 10002, 10003, 10004, 99999, 10005, 10006, 10007],
    { field: 'id', fieldRole: 'identifier' }
  );
  assert(r.status === 'unsupported', `status === 'unsupported'（实际 ${r.status}）`);
  assert(r.outlierCount === 0, 'outlierCount === 0');
}

// ===== F. NaN / null / Infinity 被忽略 =====
console.log('F. NaN / null / Infinity 忽略，不污染四分位');
{
  const clean: number[] = [10, 11, 12, 13, 14, 15, 16, 17];
  const dirty = [10, 11, NaN, 12, 13, 14, 15, 16, 17, Infinity];
  const rc = detectFieldOutliers(clean, { field: 'val' });
  const rd = detectFieldOutliers(dirty as number[], { field: 'val' });
  assert(rd.sampleSize === clean.length, `dirty 有效样本 = ${clean.length}（实际 ${rd.sampleSize}）`);
  assert(rd.stats!.q1 === rc.stats!.q1, 'Q1 与纯净数据一致');
  assert(rd.stats!.q3 === rc.stats!.q3, 'Q3 与纯净数据一致');
  assert(rd.stats!.iqr === rc.stats!.iqr, 'IQR 与纯净数据一致');
  assert(rd.status === rc.status, '检测状态一致（无异常）');
}

// ===== G. 异常 record 携带正确原始行下标 =====
console.log('G. 极端值下标正确映射');
{
  const values = [10, 11, 12, 13, 14, 15, 16, 8, 1000];
  const r = detectFieldOutliers(values, { field: 'val' });
  const rec = r.records.find(x => x.value === 1000);
  assert(rec != null, '1000 被检出');
  assert(rec!.rowIndex === 8, `rowIndex === 8（实际 ${rec!.rowIndex}）`, `values[${rec!.rowIndex}] = ${values[rec!.rowIndex]}`);
  assert(values[rec!.rowIndex] === 1000, '按 rowIndex 能取回原值');
}

// ===== H. 筛选后检测：rowIndex 仍能映射原始记录 =====
console.log('H. 基于筛选后的值检测，rowIndex 定位原始记录');
{
  // 原始 12 行，带业务上下文
  const rawContext: Array<{ id: string; sales: number }> = Array.from({ length: 12 }, (_, i) => ({
    id: `R${i + 1}`,
    sales: [100, 105, 103, 110, 108, 5000, 107, 102, 106, 104, 101, 109][i],
  }));
  // 普通筛选：保留 id 包含 R 的所有行（本例全量），模拟"分析数据集"
  const filtered = rawContext;
  // 检测取值 + 到原始记录的映射
  const values = filtered.map(r => r.sales);
  const r = detectFieldOutliers(values, { field: 'sales' });
  assert(r.status === 'detected', '检测到异常');
  const rec = r.records.find(x => x.value === 5000);
  assert(rec != null, '5000 被检出');
  // rowIndex 映射回原始记录
  const originalRow = filtered[rec!.rowIndex];
  assert(originalRow != null && originalRow.sales === 5000, `rowIndex=${rec!.rowIndex} 能定位原始记录（${originalRow?.id}）`);
  assert(originalRow.id === 'R6', '定位到正确业务记录 R6');
}

// ===== I. 普通零售销售数据：极端值显示具体记录 =====
console.log('I. 销售 [100,105,103,110,108,107,102,106,5000] → 5000 显示具体记录');
{
  const r = detectFieldOutliers([100, 105, 103, 110, 108, 107, 102, 106, 5000], { field: 'sales' });
  assert(r.status === 'detected', `status === 'detected'（实际 ${r.status}）`);
  assert(r.bounds != null, '有上下界');
  const rec = r.records.find(x => x.value === 5000);
  assert(rec != null, '5000 被检出为具体记录');
  assert(rec!.rowIndex === 8, `rowIndex === 8（实际 ${rec!.rowIndex}）`);
  assert(rec!.direction === 'high', '方向 high');
  assert(rec!.reason.includes('上界'), `判定依据含上界（实际 ${rec!.reason}）`);
  // 其余正常业务波动不被误判
  const falsePositives = r.records.filter(x => x.value !== 5000);
  assert(falsePositives.length === 0, `仅 5000 一个候选（实际 ${r.records.map(x => x.value)}）`);
}

// ===== J. 无异常数据 → outlierCount === 0 =====
console.log('J. [10,11,12,13,14,15,16,17] → 无异常');
{
  const r = detectFieldOutliers([10, 11, 12, 13, 14, 15, 16, 17], { field: 'val' });
  assert(r.status === 'none', `status === 'none'（实际 ${r.status}）`);
  assert(r.outlierCount === 0, 'outlierCount === 0');
  assert(r.records.length === 0, '无异常记录');
}

// ===== 附加：结构化字段完整性 =====
console.log('附加. 结构化结果字段完整');
{
  const r = detectFieldOutliers([10, 11, 12, 13, 14, 15, 16, 100], { field: 'sales' });
  assert(r.field === 'sales', 'field 字段正确');
  assert(r.method === 'iqr', 'method === iqr');
  assert(r.sampleSize === 8, 'sampleSize 正确');
  assert(r.uniqueCount === 8, 'uniqueCount 正确');
  assert(r.stats != null, '有 stats');
  assert(r.stats!.min === 10 && r.stats!.max === 100, 'min/max 正确');
  assert(typeof r.stats!.q1 === 'number' && typeof r.stats!.q3 === 'number', 'q1/q3 为数字');
  assert(r.stats!.iqr === r.stats!.q3 - r.stats!.q1, 'iqr = q3 - q1');
}

// ===== 附加：上下界数值合理性 =====
console.log('附加. bounds 单调一致');
{
  const r = detectFieldOutliers([100, 105, 103, 110, 108, 107, 102, 106, 5000], { field: 'sales' });
  assert(r.bounds!.lower < r.bounds!.upper, `下界 < 上界（${r.bounds!.lower} < ${r.bounds!.upper}）`);
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