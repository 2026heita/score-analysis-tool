/**
 * 第十六阶段：Math.min/max(...array) 数组展开风险回归测试
 * 直接导入真实生产函数验证，不复制算法。
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testMinMax.ts
 */
import { minMax } from '../src/utils/stats.js';
import { computePosition } from '../src/engine/analysisEngine.js';
import { generateBins } from '../src/utils/chartData.js';

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

console.log('=== 第十六阶段：min/max 安全工具回归测试 ===\n');

// ===== 基础语义 =====
console.log('1. minMax 基础语义');
{
  const a = minMax([10, 20, 30]);
  assert(a!.min === 10 && a!.max === 30, '[10,20,30] → min 10 / max 30');
  const b = minMax([-100, 0, 100]);
  assert(b!.min === -100 && b!.max === 100, '[-100,0,100] → min -100 / max 100');
  const c = minMax([13, 13, 13]);
  assert(c!.min === 13 && c!.max === 13, '[13,13,13] → min 13 / max 13');
  const d = minMax([]);
  assert(d === null, '空数组 → null（不依赖 Infinity/-Infinity）');
  const e = minMax([5]);
  assert(e!.min === 5 && e!.max === 5, '单元素 [5] → 5 / 5');
}

// ===== 大数组 =====
console.log('\n2. 大数组（不依赖 spread）');
{
  function run(name: string, n: number, expectedMax: number) {
    const arr = new Array(n);
    for (let i = 0; i < n; i++) arr[i] = i % 1000000; // 有限数字，含重复
    const t0 = Date.now();
    const mm = minMax(arr);
    const dt = Date.now() - t0;
    assert(mm !== null, `${name}: 不抛 RangeError 且非 null`, `dt=${dt}ms`);
    assert(mm!.min === 0 && mm!.max === expectedMax, `${name}: min=0 max=${expectedMax}`, `got min=${mm!.min} max=${mm!.max}`);
    console.log(`      ${name} 耗时 ${dt}ms`);
  }
  // 0~9999
  {
    const arr = new Array(10000);
    for (let i = 0; i < 10000; i++) arr[i] = i;
    const mm = minMax(arr);
    assert(mm!.min === 0 && mm!.max === 9999, '10000 (0~9999) → min 0 / max 9999');
  }
  run('100000', 100000, 99999);
  run('1000000', 1000000, 999999);
}

// ===== computePosition 统计一致性（min/max 影响超范围判断） =====
console.log('\n3. computePosition 超范围判断（依赖 min/max）');
{
  const p1 = computePosition([10, 20, 30], 9, 'higher-is-better');
  assert(p1.isOutOfRange === true && p1.outOfRangeDirection === 'below', '[10,20,30] 输入9 → below');
  const p2 = computePosition([10, 20, 30], 31, 'higher-is-better');
  assert(p2.isOutOfRange === true && p2.outOfRangeDirection === 'above', '[10,20,30] 输入31 → above');
  const p3 = computePosition([10, 20, 30], 25, 'higher-is-better');
  assert(p3.isOutOfRange === false, '[10,20,30] 输入25 → 范围内');
  const p4 = computePosition([13, 13, 13], 5, 'higher-is-better');
  assert(p4.isOutOfRange === true && p4.outOfRangeDirection === 'below', '[13,13,13] 输入5 → below');
}

// ===== generateBins 行为不变 =====
console.log('\n4. generateBins 行为不变');
{
  const bins = generateBins([10, 20, 30, 40], 4);
  assert(bins.length === 4, '分 bin 数量 = 4');
  // 最后一个 bin 应包含最大值
  const lastBinCount = bins[3].count;
  assert(lastBinCount === 1, '最大值 40 落入最后一组', `lastBinCount=${lastBinCount}`);
  // 全相同
  const same = generateBins([13, 13, 13], 10);
  assert(same.length === 1 && same[0].label === '13', '全相同 → 单一 bin(13)');
  // 负数
  const neg = generateBins([-100, -10, 0, 10, 100], 5);
  assert(neg.length === 5, '正负混合分 bin 正常');
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