/**
 * 数据筛选测试
 * 验证 filterRows 纯函数的正确性
 * 
 * 测试场景：
 * 1. 文本等于/包含/不包含/为空/非空
 * 2. 数值大于/小于/大于等于/小于等于/介于/等于/为空/非空
 * 3. 多条件 AND
 * 4. 空条件
 * 5. 筛选结果为空
 * 6. 筛选后分组分析正确
 */

let passed = 0;
let failed = 0;

// ===== 内联核心算法（与 src/engine/filterRows.ts 保持一致） =====

const NUMERIC_ROLES = new Set(['primaryTotal', 'rank', 'sectionTotal', 'courseScore', 'adjustment']);

function isNumericFilterField(meta) {
  return NUMERIC_ROLES.has(meta.analysisRole);
}

function buildNumericFieldSet(fieldMetas) {
  return new Set(fieldMetas.filter(m => isNumericFilterField(m)).map(m => m.header));
}

function evaluateNumericCondition(raw, operator, condValue) {
  const isEmpty = raw === undefined || raw === null || raw.trim() === '';
  if (operator === 'isEmpty') return isEmpty;
  if (operator === 'isNotEmpty') return !isEmpty;
  if (isEmpty) return false;

  const num = parseFloat(raw);
  if (!Number.isFinite(num)) return false;

  switch (operator) {
    case 'gt': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num > v;
    }
    case 'lt': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num < v;
    }
    case 'gte': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num >= v;
    }
    case 'lte': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num <= v;
    }
    case 'equals': {
      const v = parseFloat(condValue);
      return Number.isFinite(v) && num === v;
    }
    case 'between': {
      const parts = condValue.split(',').map(s => parseFloat(s.trim()));
      if (parts.length !== 2 || !parts.every(Number.isFinite)) return false;
      return num >= parts[0] && num <= parts[1];
    }
    default:
      return true;
  }
}

function evaluateTextCondition(raw, operator, condValue) {
  const trimmed = raw.trim();

  switch (operator) {
    case 'equals':
      return trimmed === condValue.trim();
    case 'contains':
      return trimmed.includes(condValue.trim());
    case 'notContains':
      return !trimmed.includes(condValue.trim());
    case 'isEmpty':
      return trimmed === '';
    case 'isNotEmpty':
      return trimmed !== '';
    default:
      return true;
  }
}

function filterRows(rows, conditions, numericFields) {
  const activeConditions = conditions.filter(c => c.field && c.operator);

  if (activeConditions.length === 0) {
    return {
      filteredRows: rows,
      filterSummary: {
        originalCount: rows.length,
        filteredCount: rows.length,
        filterRatio: 0,
        activeConditions: 0,
      },
    };
  }

  const filteredRows = rows.filter(row => {
    return activeConditions.every(cond => {
      const rawValue = row[cond.field];
      const isNumeric = numericFields.has(cond.field);

      if (isNumeric) {
        return evaluateNumericCondition(rawValue, cond.operator, cond.value);
      } else {
        return evaluateTextCondition(rawValue || '', cond.operator, cond.value);
      }
    });
  });

  return {
    filteredRows,
    filterSummary: {
      originalCount: rows.length,
      filteredCount: filteredRows.length,
      filterRatio: rows.length > 0 ? (rows.length - filteredRows.length) / rows.length : 0,
      activeConditions: activeConditions.length,
    },
  };
}

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual: ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== 数据筛选测试 ===\n');

// 准备测试数据
const rows = [
  { 班级: 'A班', 姓名: '张三', 总分: '90', 语文: '88', 备注: '优秀' },
  { 班级: 'A班', 姓名: '李四', 总分: '85', 语文: '82', 备注: '' },
  { 班级: 'B班', 姓名: '王五', 总分: '78', 语文: '75', 备注: '合格' },
  { 班级: 'B班', 姓名: '赵六', 总分: '92', 语文: '90', 备注: '优秀' },
  { 班级: 'C班', 姓名: '孙七', 总分: '80', 语文: '78', 备注: '' },
  { 班级: 'C班', 姓名: '', 总分: '', 语文: '', 备注: '' },
];

const numericFields = new Set(['总分', '语文']);

// ============================================================
// 测试 1: 文本等于
// ============================================================
console.log('1. 文本等于');

const result1 = filterRows(rows, [
  { field: '班级', operator: 'equals', value: 'A班' },
], numericFields);
assertEqual(result1.filteredRows.length, 2, 'A班 2 条');
assertEqual(result1.filterSummary.originalCount, 6, '原始 6 条');
assertEqual(result1.filterSummary.filteredCount, 2, '筛选后 2 条');
assert(result1.filteredRows.every(r => r['班级'] === 'A班'), '全部是 A班');

// ============================================================
// 测试 2: 文本包含
// ============================================================
console.log('\n2. 文本包含');

const result2 = filterRows(rows, [
  { field: '备注', operator: 'contains', value: '优秀' },
], numericFields);
assertEqual(result2.filteredRows.length, 2, '备注含优秀 2 条');
assert(result2.filteredRows.every(r => r['备注'].includes('优秀')), '备注都包含优秀');

// ============================================================
// 测试 3: 文本不包含
// ============================================================
console.log('\n3. 文本不包含');

const result3 = filterRows(rows, [
  { field: '班级', operator: 'notContains', value: 'A' },
], numericFields);
assertEqual(result3.filteredRows.length, 4, '不含A 4 条');
assert(result3.filteredRows.every(r => !r['班级'].includes('A')), '班级都不含 A');

// ============================================================
// 测试 4: 文本为空
// ============================================================
console.log('\n4. 文本为空');

const result4 = filterRows(rows, [
  { field: '备注', operator: 'isEmpty', value: '' },
], numericFields);
assertEqual(result4.filteredRows.length, 3, '备注为空 3 条');
assert(result4.filteredRows.every(r => r['备注'].trim() === ''), '备注都为空');

// ============================================================
// 测试 5: 文本非空
// ============================================================
console.log('\n5. 文本非空');

const result5 = filterRows(rows, [
  { field: '备注', operator: 'isNotEmpty', value: '' },
], numericFields);
assertEqual(result5.filteredRows.length, 3, '备注非空 3 条（含空字符串的孙七不算）');
assert(result5.filteredRows.every(r => r['备注'].trim() !== ''), '备注都非空');

// ============================================================
// 测试 6: 数值大于
// ============================================================
console.log('\n6. 数值大于');

const result6 = filterRows(rows, [
  { field: '总分', operator: 'gt', value: '85' },
], numericFields);
assertEqual(result6.filteredRows.length, 2, '总分>85 2 条');
assert(result6.filteredRows.every(r => parseFloat(r['总分']) > 85), '总分都>85');

// ============================================================
// 测试 7: 数值小于
// ============================================================
console.log('\n7. 数值小于');

const result7 = filterRows(rows, [
  { field: '总分', operator: 'lt', value: '80' },
], numericFields);
assertEqual(result7.filteredRows.length, 1, '总分<80 1 条');
assertEqual(result7.filteredRows[0].姓名, '王五', '王五 78');

// ============================================================
// 测试 8: 数值大于等于
// ============================================================
console.log('\n8. 数值大于等于');

const result8 = filterRows(rows, [
  { field: '总分', operator: 'gte', value: '90' },
], numericFields);
assertEqual(result8.filteredRows.length, 2, '总分>=90 2 条');

// ============================================================
// 测试 9: 数值小于等于
// ============================================================
console.log('\n9. 数值小于等于');

const result9 = filterRows(rows, [
  { field: '总分', operator: 'lte', value: '80' },
], numericFields);
assertEqual(result9.filteredRows.length, 2, '总分<=80 2 条（80和78）');

// ============================================================
// 测试 10: 数值介于
// ============================================================
console.log('\n10. 数值介于');

const result10 = filterRows(rows, [
  { field: '总分', operator: 'between', value: '80,90' },
], numericFields);
assertEqual(result10.filteredRows.length, 3, '总分在80-90之间 3 条');
assert(result10.filteredRows.every(r => {
  const v = parseFloat(r['总分']);
  return v >= 80 && v <= 90;
}), '总分都在 80-90 之间');

// ============================================================
// 测试 11: 数值等于
// ============================================================
console.log('\n11. 数值等于');

const result11 = filterRows(rows, [
  { field: '总分', operator: 'equals', value: '80' },
], numericFields);
assertEqual(result11.filteredRows.length, 1, '总分=80 1 条');
assertEqual(result11.filteredRows[0].姓名, '孙七', '孙七 80');

// ============================================================
// 测试 12: 数值为空
// ============================================================
console.log('\n12. 数值为空');

const result12 = filterRows(rows, [
  { field: '总分', operator: 'isEmpty', value: '' },
], numericFields);
assertEqual(result12.filteredRows.length, 1, '总分为空 1 条（孙七空行）');

// ============================================================
// 测试 13: 数值非空
// ============================================================
console.log('\n13. 数值非空');

const result13 = filterRows(rows, [
  { field: '总分', operator: 'isNotEmpty', value: '' },
], numericFields);
assertEqual(result13.filteredRows.length, 5, '总分非空 5 条');

// ============================================================
// 测试 14: 多条件 AND
// ============================================================
console.log('\n14. 多条件 AND');

const result14 = filterRows(rows, [
  { field: '班级', operator: 'equals', value: 'A班' },
  { field: '总分', operator: 'gt', value: '85' },
], numericFields);
assertEqual(result14.filteredRows.length, 1, 'A班且总分>85 1 条');
assertEqual(result14.filteredRows[0].姓名, '张三', '张三 90');

// ============================================================
// 测试 15: 三条件 AND
// ============================================================
console.log('\n15. 三条件 AND');

const result15 = filterRows(rows, [
  { field: '班级', operator: 'notContains', value: 'C' },
  { field: '总分', operator: 'gte', value: '85' },
  { field: '备注', operator: 'isNotEmpty', value: '' },
], numericFields);
assertEqual(result15.filteredRows.length, 2, '非C班、总分>=85、备注非空 2 条');

// ============================================================
// 测试 16: 空条件（使用全部数据）
// ============================================================
console.log('\n16. 空条件');

const result16 = filterRows(rows, [], numericFields);
assertEqual(result16.filteredRows.length, 6, '空条件返回全部 6 条');
assertEqual(result16.filterSummary.activeConditions, 0, '活跃条件 0');

const result16b = filterRows(rows, [
  { field: '', operator: 'equals', value: '' },
], numericFields);
assertEqual(result16b.filteredRows.length, 6, 'field为空的条件也被忽略');
assertEqual(result16b.filterSummary.activeConditions, 0, '活跃条件 0');

// ============================================================
// 测试 17: 筛选结果为空
// ============================================================
console.log('\n17. 筛选结果为空');

const result17 = filterRows(rows, [
  { field: '班级', operator: 'equals', value: 'D班' },
], numericFields);
assertEqual(result17.filteredRows.length, 0, 'D班不存在 0 条');
assertEqual(result17.filterSummary.filterRatio, 1, '过滤比例 100%');

// ============================================================
// 测试 18: 非法数值条件不崩溃
// ============================================================
console.log('\n18. 非法数值条件');

const result18 = filterRows(rows, [
  { field: '总分', operator: 'gt', value: 'abc' },
], numericFields);
assertEqual(result18.filteredRows.length, 0, '非法数值gt 0 条（不崩溃）');

const result18b = filterRows(rows, [
  { field: '总分', operator: 'between', value: 'abc' },
], numericFields);
assertEqual(result18b.filteredRows.length, 0, '非法between 0 条（不崩溃）');

const result18c = filterRows(rows, [
  { field: '总分', operator: 'between', value: '80' },
], numericFields);
assertEqual(result18c.filteredRows.length, 0, 'between只有一个值 0 条（不崩溃）');

// ============================================================
// 测试 19: buildNumericFieldSet
// ============================================================
console.log('\n19. buildNumericFieldSet');

const fieldMetas = [
  { header: '总分', analysisRole: 'primaryTotal' },
  { header: '语文', analysisRole: 'courseScore' },
  { header: '班级', analysisRole: 'identity' },
  { header: '姓名', analysisRole: 'identity' },
  { header: '备注', analysisRole: 'textMeta' },
  { header: '排名', analysisRole: 'rank' },
  { header: '加分', analysisRole: 'adjustment' },
];

const numSet = buildNumericFieldSet(fieldMetas);
assertEqual(numSet.size, 4, '4 个数值字段');
assert(numSet.has('总分'), '总分是数值');
assert(numSet.has('语文'), '语文是数值');
assert(numSet.has('排名'), '排名是数值');
assert(numSet.has('加分'), '加分是数值');
assert(!numSet.has('班级'), '班级不是数值');
assert(!numSet.has('姓名'), '姓名不是数值');
assert(!numSet.has('备注'), '备注不是数值');

// ============================================================
// 测试 20: 筛选后分组分析
// ============================================================
console.log('\n20. 筛选后分组分析');

// 插入 groupByDimension 内联函数
function calculateQuantile(values, q) {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return 0;
  const pos = (cleanValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (cleanValues[base + 1] !== undefined) {
    return cleanValues[base] + rest * (cleanValues[base + 1] - cleanValues[base]);
  }
  return cleanValues[base];
}

function groupByDimension(rows, metricField, dimensionField) {
  const groups = new Map();
  for (const row of rows) {
    const dimRaw = row[dimensionField];
    const dimKey = (dimRaw === undefined || dimRaw === null || dimRaw.trim() === '')
      ? '(空值)'
      : dimRaw.trim();
    const metricRaw = row[metricField];
    if (metricRaw === undefined || metricRaw === null || metricRaw.trim() === '') continue;
    const num = parseFloat(metricRaw);
    if (!Number.isFinite(num)) continue;
    if (!groups.has(dimKey)) groups.set(dimKey, []);
    groups.get(dimKey).push(num);
  }
  const results = [];
  for (const [dimValue, values] of groups) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    results.push({
      dimensionValue: dimValue,
      count: len,
      mean: sum / len,
      median: calculateQuantile(sorted, 0.5),
      min: sorted[0],
      max: sorted[len - 1],
      q25: calculateQuantile(sorted, 0.25),
      q75: calculateQuantile(sorted, 0.75),
    });
  }
  results.sort((a, b) => b.mean - a.mean);
  return results;
}

// 筛选：只要A班和B班
const filteredRows = filterRows(rows, [
  { field: '班级', operator: 'notContains', value: 'C' },
], numericFields).filteredRows;

assertEqual(filteredRows.length, 4, '筛选后 4 条（非C班）');

const groupResult = groupByDimension(filteredRows, '总分', '班级');
assertEqual(groupResult.length, 2, '2 个分组（A班和B班）');

const groupA = groupResult.find(g => g.dimensionValue === 'A班');
assert(groupA !== undefined, 'A班 存在');
if (groupA) {
  assertEqual(groupA.count, 2, 'A班 2 条');
  // mean: (90+85)/2 = 87.5
}

const groupB = groupResult.find(g => g.dimensionValue === 'B班');
assert(groupB !== undefined, 'B班 存在');
if (groupB) {
  assertEqual(groupB.count, 2, 'B班 2 条');
  // mean: (78+92)/2 = 85
}

// 验证 C班 不在结果中
assert(!groupResult.some(g => g.dimensionValue === 'C班'), 'C班 被过滤掉了');

// ============================================================
// 测试 21: 筛选不影响原始数据
// ============================================================
console.log('\n21. 筛选不影响原始数据');

const originalRows = [...rows];
const result21 = filterRows(rows, [
  { field: '班级', operator: 'equals', value: 'A班' },
], numericFields);
assertEqual(rows.length, 6, '原始 rows 仍然是 6 条');
assertEqual(originalRows.length, 6, '备份的 originalRows 也是 6 条');
assertEqual(result21.filteredRows.length, 2, '筛选结果 2 条');

// 输出测试结果
console.log('\n=== 测试完成 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.error('\n❌ 测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}