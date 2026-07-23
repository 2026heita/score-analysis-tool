/**
 * 真实源码测试：Stage 0A-2 抽样算法
 */
import { systematic_even_v1 } from '../../src/engine/sampling.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${details ? ': ' + details : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

console.log('=== 真实源码测试：Stage 0A-2 抽样算法 ===\n');

// 测试空数组
console.log('测试边界情况:');
assert('空数组返回空', arraysEqual(systematic_even_v1(0, 100), []));
assert('sampleSize=0返回空', arraysEqual(systematic_even_v1(100, 0), []));
assert('sampleSize<0返回空', arraysEqual(systematic_even_v1(100, -1), []));

// 测试 sampleSize=1
const single = systematic_even_v1(100, 1);
assert('sampleSize=1返回首行', single.length === 1 && single[0] === 0);

// 测试行数<样本数
const small = systematic_even_v1(50, 100);
assert('行数<样本数返回全部', small.length === 50);

// 测试 5001 行抽 5000
const sampled1 = systematic_even_v1(5001, 5000);
assert('5001行抽5000长度为5000', sampled1.length === 5000);
assert('包含首行', sampled1[0] === 0);
assert('包含末行', sampled1[4999] === 5000);

// 测试 20000 行抽 5000
const sampled2 = systematic_even_v1(20000, 5000);
assert('20000行抽5000长度为5000', sampled2.length === 5000);
assert('包含首行', sampled2[0] === 0);
assert('包含末行', sampled2[4999] === 19999);

// 测试等距
const diffs: number[] = [];
for (let i = 1; i < sampled2.length; i++) {
  diffs.push(sampled2[i] - sampled2[i - 1]);
}
const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
assert('等距抽样平均差值≈4', Math.abs(avgDiff - 4) < 0.1, `avgDiff=${avgDiff.toFixed(2)}`);

// 测试无重复
const uniqueSet = new Set(sampled2);
assert('无重复索引', uniqueSet.size === sampled2.length);

// 测试输出递增
let isSorted = true;
for (let i = 1; i < sampled2.length; i++) {
  if (sampled2[i] <= sampled2[i - 1]) {
    isSorted = false;
    break;
  }
}
assert('输出递增', isSorted);

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
