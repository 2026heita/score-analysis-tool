/**
 * 相关性分析器测试脚本
 * 测试 Pearson 相关性计算的正确性
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✓ ${message} (${actual.toFixed(4)} ≈ ${expected})`);
  } else {
    failed++;
    console.error(`  ✗ ${message} (${actual.toFixed(4)} ≠ ${expected}, diff=${diff.toFixed(4)})`);
  }
}

// ============================================================
// 内联核心算法（与 src/engine/correlationAnalyzer.ts 一致）
// ============================================================

function parseNumericValueLegacy(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '') return null;
  // 包含逗号时必须通过严格千分位校验
  if (str.includes(',')) {
    const strictThousands = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    if (!strictThousands.test(str)) return null;
  }
  const cleaned = str.replace(/,/g, '');
  const num = Number(cleaned);
  if (isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { r: 0, n };

  // 配对有效值
  const pairsX = [];
  const pairsY = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      pairsX.push(x[i]);
      pairsY.push(y[i]);
    }
  }

  const count = pairsX.length;
  if (count < 2) return { r: 0, n: count };

  // 计算均值
  let sumX = 0, sumY = 0;
  for (let i = 0; i < count; i++) {
    sumX += pairsX[i];
    sumY += pairsY[i];
  }
  const meanX = sumX / count;
  const meanY = sumY / count;

  // 计算 Pearson
  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < count; i++) {
    const dx = pairsX[i] - meanX;
    const dy = pairsY[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator === 0) return { r: 0, n: count };

  const r = sumXY / denominator;
  return { r: Math.max(-1, Math.min(1, r)), n: count };
}

function roundTo(value, decimalPlaces) {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

function extractColumnVectors(headers, rows, numericalFields) {
  const columns = {};

  for (const field of numericalFields) {
    columns[field] = rows.map(row => {
      const raw = row[field];
      if (raw === undefined || raw === null || raw.trim() === '') return null;
      const num = parseNumericValueLegacy(raw);
      return num === null ? null : num;
    });
  }

  return columns;
}

function analyzeCorrelationsSimple(headers, rows, config = {}) {
  const cfg = { topN: 5, minValidCount: 5, strongThreshold: 0.7, moderateThreshold: 0.3, ...config };
  const warnings = [];

  // 快速判断数值字段：数值比例 >= 70%
  const numericalFields = [];
  for (const header of headers) {
    let numCount = 0;
    let total = 0;
    for (const row of rows) {
      const raw = row[header];
      if (raw === undefined || raw === null || raw.trim() === '') continue;
      total++;
      const num = parseNumericValueLegacy(raw);
      if (num !== null) numCount++;
    }
    if (total > 0 && numCount / total >= 0.7) {
      numericalFields.push(header);
    }
  }

  if (numericalFields.length < 2) {
    return {
      numericalFields,
      totalPairs: 0,
      matrix: {},
      topPositive: [],
      topNegative: [],
      weakCorrelations: [],
      warnings: ['数值字段不足 2 个，无法计算相关性。'],
    };
  }

  // 提取列向量
  const columns = extractColumnVectors(headers, rows, numericalFields);

  // 计算所有字段对的 Pearson
  const matrix = {};
  const allPairs = [];

  for (const field of numericalFields) {
    matrix[field] = {};
  }

  for (let i = 0; i < numericalFields.length; i++) {
    for (let j = i + 1; j < numericalFields.length; j++) {
      const fieldA = numericalFields[i];
      const fieldB = numericalFields[j];

      const colA = columns[fieldA];
      const colB = columns[fieldB];

      const { r, n } = pearsonCorrelation(colA, colB);

      // 写入矩阵（对称）
      matrix[fieldA][fieldB] = roundTo(r, 4);
      matrix[fieldB][fieldA] = roundTo(r, 4);

      if (n >= cfg.minValidCount) {
        const absR = Math.abs(r);
        let strength = 'weak';
        if (absR >= cfg.strongThreshold) strength = 'strong';
        else if (absR >= cfg.moderateThreshold) strength = 'moderate';

        let direction = 'none';
        if (r > 0.01) direction = 'positive';
        else if (r < -0.01) direction = 'negative';

        allPairs.push({
          fieldA,
          fieldB,
          pearson: roundTo(r, 4),
          validCount: n,
          strength,
          direction,
        });
      }
    }
  }

  // 对角线
  for (const field of numericalFields) {
    matrix[field][field] = 1;
  }

  // 排序提取 Top N
  const sortedByCorr = [...allPairs].sort((a, b) => b.pearson - a.pearson);
  const topPositive = sortedByCorr
    .filter(p => p.pearson > 0)
    .slice(0, cfg.topN);

  const sortedByNeg = [...allPairs].sort((a, b) => a.pearson - b.pearson);
  const topNegative = sortedByNeg
    .filter(p => p.pearson < 0)
    .slice(0, cfg.topN);

  // 低相关字段对
  const weakCorrelations = allPairs
    .filter(p => p.strength === 'weak')
    .sort((a, b) => Math.abs(a.pearson) - Math.abs(b.pearson))
    .slice(0, cfg.topN);

  if (rows.length < cfg.minValidCount) {
    warnings.push(`数据行数较少（${rows.length} 行），相关性结果可能不稳定。`);
  }

  return {
    numericalFields,
    totalPairs: allPairs.length,
    matrix,
    topPositive,
    topNegative,
    weakCorrelations,
    warnings,
  };
}

// ============================================================
// 测试用例
// ============================================================

console.log('\n=== 相关性分析器测试 ===\n');

// 测试 1: 完全正相关
console.log('测试 1: 完全正相关');
const x1 = [1, 2, 3, 4, 5];
const y1 = [2, 4, 6, 8, 10];
const result1 = pearsonCorrelation(x1, y1);
assertApprox(result1.r, 1.0, 0.001, '完全正相关 r ≈ 1.0');

// 测试 2: 完全负相关
console.log('\n测试 2: 完全负相关');
const x2 = [1, 2, 3, 4, 5];
const y2 = [10, 8, 6, 4, 2];
const result2 = pearsonCorrelation(x2, y2);
assertApprox(result2.r, -1.0, 0.001, '完全负相关 r ≈ -1.0');

// 测试 3: 无相关
console.log('\n测试 3: 无相关');
const x3 = [1, 2, 3, 4, 5];
const y3 = [2, 1, 4, 3, 2];
const result3 = pearsonCorrelation(x3, y3);
assert(Math.abs(result3.r) < 0.5, `无相关 |r| < 0.5 (实际: ${result3.r.toFixed(4)})`);

// 测试 4: 处理空值
console.log('\n测试 4: 处理空值');
const x4 = [1, 2, null, 4, 5];
const y4 = [2, 4, 6, null, 10];
const result4 = pearsonCorrelation(x4, y4);
assert(result4.n === 3, `有效配对数 = 3 (实际: ${result4.n})`);
assertApprox(result4.r, 1.0, 0.01, '跳过空值后仍为正相关');

// 测试 5: 处理 NaN
console.log('\n测试 5: 处理 NaN');
const x5 = [1, 2, NaN, 4, 5];
const y5 = [2, 4, 6, NaN, 10];
const result5 = pearsonCorrelation(x5, y5);
assert(result5.n === 3, `有效配对数 = 3 (实际: ${result5.n})`);
assertApprox(result5.r, 1.0, 0.01, '跳过 NaN 后仍为正相关');

// 测试 6: 数值字段不足
console.log('\n测试 6: 数值字段不足');
const headers6 = ['姓名', '语文'];
const rows6 = [
  { '姓名': '张三', '语文': '85' },
  { '姓名': '李四', '语文': '90' },
];
const result6 = analyzeCorrelationsSimple(headers6, rows6);
assert(result6.numericalFields.length === 1, '只识别到 1 个数值字段');
assert(result6.totalPairs === 0, '无法计算相关性对');
assert(result6.warnings.length > 0, '返回警告信息');

// 测试 7: 非数值字段跳过
console.log('\n测试 7: 非数值字段跳过');
const headers7 = ['姓名', '语文', '数学', '英语'];
const rows7 = [
  { '姓名': '张三', '语文': '85', '数学': '90', '英语': '88' },
  { '姓名': '李四', '语文': '90', '数学': '85', '英语': '92' },
  { '姓名': '王五', '语文': '88', '数学': '92', '英语': '90' },
  { '姓名': '赵六', '语文': '92', '数学': '88', '英语': '85' },
  { '姓名': '钱七', '语文': '86', '数学': '91', '英语': '89' },
];
const result7 = analyzeCorrelationsSimple(headers7, rows7);
assert(result7.numericalFields.length === 3, '识别到 3 个数值字段');
assert(result7.numericalFields.includes('姓名') === false, '姓名字段被正确跳过');
assert(result7.totalPairs === 3, '计算了 3 对相关性');

// 测试 8: 不输出因果判断
console.log('\n测试 8: 不输出因果判断');
const result8 = analyzeCorrelationsSimple(headers7, rows7);
const hasCausalLanguage = JSON.stringify(result8).includes('因果') || 
                          JSON.stringify(result8).includes('导致') ||
                          JSON.stringify(result8).includes('影响');
assert(!hasCausalLanguage, '结果中不包含因果判断语言');

// 测试 9: 相关性矩阵对称性
console.log('\n测试 9: 相关性矩阵对称性');
const headers9 = ['A', 'B', 'C'];
const rows9 = [
  { 'A': '1', 'B': '2', 'C': '3' },
  { 'A': '2', 'B': '4', 'C': '6' },
  { 'A': '3', 'B': '6', 'C': '9' },
  { 'A': '4', 'B': '8', 'C': '12' },
  { 'A': '5', 'B': '10', 'C': '15' },
];
const result9 = analyzeCorrelationsSimple(headers9, rows9);
assert(result9.matrix['A']['B'] === result9.matrix['B']['A'], '矩阵对称: A-B = B-A');
assert(result9.matrix['A']['C'] === result9.matrix['C']['A'], '矩阵对称: A-C = C-A');
assert(result9.matrix['B']['C'] === result9.matrix['C']['B'], '矩阵对称: B-C = C-B');

// 测试 10: 对角线为 1
console.log('\n测试 10: 对角线为 1');
assert(result9.matrix['A']['A'] === 1, 'A-A 对角线 = 1');
assert(result9.matrix['B']['B'] === 1, 'B-B 对角线 = 1');
assert(result9.matrix['C']['C'] === 1, 'C-C 对角线 = 1');

// 测试 11: 强正相关识别
console.log('\n测试 11: 强正相关识别');
assert(result9.topPositive.length > 0, '识别到正相关字段对');
assert(result9.topPositive[0].pearson > 0.7, '最强正相关 > 0.7');

// 测试 12: 数据量警告
console.log('\n测试 12: 数据量警告');
const headers12 = ['A', 'B'];
const rows12 = [
  { 'A': '1', 'B': '2' },
  { 'A': '2', 'B': '4' },
];
const result12 = analyzeCorrelationsSimple(headers12, rows12);
assert(result12.warnings.some(w => w.includes('数据行数较少')), '数据量少时返回警告');

// 测试 13: 空数据集不崩溃
console.log('\n测试 13: 空数据集不崩溃');
const result13 = analyzeCorrelationsSimple([], []);
assert(result13.numericalFields.length === 0, '空数据集返回空字段列表');
assert(result13.totalPairs === 0, '空数据集返回 0 对');

// 测试 14: 单行数据不崩溃
console.log('\n测试 14: 单行数据不崩溃');
const headers14 = ['A', 'B'];
const rows14 = [{ 'A': '1', 'B': '2' }];
const result14 = analyzeCorrelationsSimple(headers14, rows14);
assert(result14.totalPairs === 0, '单行数据无法计算相关性');

// 测试 15: 常量字段处理
console.log('\n测试 15: 常量字段处理');
const x15 = [5, 5, 5, 5, 5];
const y15 = [1, 2, 3, 4, 5];
const result15 = pearsonCorrelation(x15, y15);
assert(result15.r === 0, '常量字段相关系数为 0');

// ============================================================
// 测试结果汇总
// ============================================================

console.log('\n=== 测试结果汇总 ===');
console.log(`通过: ${passed}, 失败: ${failed}`);

if (failed > 0) {
  console.error('\n❌ 部分测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
