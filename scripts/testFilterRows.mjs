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

function parseNumericValueLegacy(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === '') return null;
  
  // 严格千分位校验
  if (str.includes(',')) {
    const strictThousands = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    if (!strictThousands.test(str)) return null;
    const cleaned = str.replace(/,/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function parseBetweenBounds(cond) {
  // 新格式：只要存在 betweenMin/betweenMax 字段，就以它们为准
  const hasNewFields = cond.betweenMin !== undefined || cond.betweenMax !== undefined;
  if (hasNewFields) {
    const min = parseNumericValueLegacy(cond.betweenMin);
    const max = parseNumericValueLegacy(cond.betweenMax);
    if (min === null || max === null) return null;
    if (min > max) return null;
    return [min, max];
  }

  // 旧格式兼容：value "min,max"，仅限明确无千分位歧义的简单场景（如 "80,90"）
  const legacy = cond.value;
  if (legacy === null || legacy === undefined || String(legacy).trim() === '') return null;
  const trimmed = String(legacy).trim();
  // 整个字符串本身是合法数值（如 "1,000"）→ 是单个值，不是范围 → 无效
  if (parseNumericValueLegacy(trimmed) !== null) return null;
  const commaCount = (trimmed.match(/,/g) || []).length;
  if (commaCount !== 1) return null;
  const parts = trimmed.split(',');
  const min = parseNumericValueLegacy(parts[0].trim());
  const max = parseNumericValueLegacy(parts[1].trim());
  if (min === null || max === null) return null;
  if (min > max) return null;
  return [min, max];
}

function normalizeFilterCondition(cond) {
  if (cond.operator !== 'between') return cond;
  if (cond.betweenMin !== undefined || cond.betweenMax !== undefined) return cond;

  const bounds = parseBetweenBounds(cond);
  if (bounds === null) return cond;

  return {
    ...cond,
    value: '',
    betweenMin: String(bounds[0]),
    betweenMax: String(bounds[1]),
  };
}

function normalizeFilterConditions(conditions) {
  return conditions.map(normalizeFilterCondition);
}

function evaluateNumericCondition(raw, cond) {
  const operator = cond.operator;
  const condValue = cond.value;
  const isEmpty = raw === undefined || raw === null || raw.trim() === '';
  if (operator === 'isEmpty') return isEmpty;
  if (operator === 'isNotEmpty') return !isEmpty;
  if (isEmpty) return false;

  const num = parseNumericValueLegacy(raw);
  if (num === null) return false;

  switch (operator) {
    case 'gt': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num > v;
    }
    case 'lt': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num < v;
    }
    case 'gte': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num >= v;
    }
    case 'lte': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num <= v;
    }
    case 'equals': {
      const v = parseNumericValueLegacy(condValue);
      return v !== null && num === v;
    }
    case 'between': {
      const bounds = parseBetweenBounds(cond);
      if (bounds === null) return false;
      return num >= bounds[0] && num <= bounds[1];
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
        return evaluateNumericCondition(rawValue, cond);
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
assert(result6.filteredRows.every(r => parseNumericValueLegacy(r['总分']) > 85), '总分都>85');

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
  const v = parseNumericValueLegacy(r['总分']);
  return v !== null && v >= 80 && v <= 90;
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

const result18d = filterRows(rows, [
  { field: '总分', operator: 'between', value: '', betweenMin: '80' },
], numericFields);
assertEqual(result18d.filteredRows.length, 0, '新格式只填最小值 0 条（条件不完整）');

const result18e = filterRows(rows, [
  { field: '总分', operator: 'between', value: '', betweenMax: '90' },
], numericFields);
assertEqual(result18e.filteredRows.length, 0, '新格式只填最大值 0 条（条件不完整）');

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
    const num = parseNumericValueLegacy(metricRaw);
    if (num === null) continue;
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

// ============================================================
// 测试 22: 千分位 between（新格式两输入框）
// ============================================================
console.log('\n22. 千分位 between（两输入框）');

// 边界数据：1000 / 1500 / 2000（含边界值）
const boundRows = [
  { 姓名: 'C1', 金额: '1000' },
  { 姓名: 'C2', 金额: '1500' },
  { 姓名: 'C3', 金额: '2000' },
  { 姓名: 'C4', 金额: '800' },
  { 姓名: 'C5', 金额: '2200' },
];
const boundFields = new Set(['金额']);

const result22a = filterRows(boundRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '1,000', betweenMax: '2,000' },
], boundFields);
assertEqual(result22a.filteredRows.length, 3, '1,000~2,000 含边界 3 条（1000/1500/2000）');
assert(result22a.filteredRows.every(r => {
  const v = parseNumericValueLegacy(r['金额']);
  return v !== null && v >= 1000 && v <= 2000;
}), '数值都在 1000-2000 之间（含边界）');

const bigRows = [
  { 姓名: 'D1', 金额: '9,000' },
  { 姓名: 'D2', 金额: '10,000' },
  { 姓名: 'D3', 金额: '15,000' },
  { 姓名: 'D4', 金额: '20,000' },
  { 姓名: 'D5', 金额: '25,000' },
];
const bigFields = new Set(['金额']);

const result22b = filterRows(bigRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '10,000', betweenMax: '20,000' },
], bigFields);
assertEqual(result22b.filteredRows.length, 3, '10,000~20,000 含边界 3 条');

const decRows = [
  { 姓名: 'E1', 金额: '1,000.5' },
  { 姓名: 'E2', 金额: '1,500.25' },
  { 姓名: 'E3', 金额: '2,000.75' },
  { 姓名: 'E4', 金额: '2,500' },
  { 姓名: 'E5', 金额: '999.5' },
];
const decFields = new Set(['金额']);

const result22c = filterRows(decRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '1,000.5', betweenMax: '2,000.75' },
], decFields);
assertEqual(result22c.filteredRows.length, 3, '1,000.5~2,000.75 含边界 3 条');

const negRows = [
  { 姓名: 'F1', 金额: '-2,500' },
  { 姓名: 'F2', 金额: '-2,000' },
  { 姓名: 'F3', 金额: '-1,500' },
  { 姓名: 'F4', 金额: '-1,000' },
  { 姓名: 'F5', 金额: '-500' },
];
const negFields = new Set(['金额']);

const result22d = filterRows(negRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '-2,000', betweenMax: '-1,000' },
], negFields);
assertEqual(result22d.filteredRows.length, 3, '-2,000~-1,000 含边界 3 条');

const sciRows = [
  { 姓名: 'G1', 金额: '800' },
  { 姓名: 'G2', 金额: '1000' },
  { 姓名: 'G3', 金额: '1500' },
  { 姓名: 'G4', 金额: '2000' },
  { 姓名: 'G5', 金额: '2200' },
];
const sciFields = new Set(['金额']);

const result22e = filterRows(sciRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '1e3', betweenMax: '2e3' },
], sciFields);
assertEqual(result22e.filteredRows.length, 3, '1e3~2e3 含边界 3 条');

// ============================================================
// 测试 23: 非法 between 输入（不静默转换）
// ============================================================
console.log('\n23. 非法 between 输入');

const invalidCases = [
  { label: '非法千分位 1,00 ~ 2,000', min: '1,00', max: '2,000' },
  { label: '多逗号 1,2,3 ~ 2,000', min: '1,2,3', max: '2,000' },
  { label: 'abc ~ 2000', min: 'abc', max: '2000' },
  { label: '1000 ~ abc', min: '1000', max: 'abc' },
];
for (const c of invalidCases) {
  const res = filterRows(boundRows, [
    { field: '金额', operator: 'between', value: '', betweenMin: c.min, betweenMax: c.max },
  ], boundFields);
  assertEqual(res.filteredRows.length, 0, `${c.label} 0 条（不崩溃、不静默转换）`);
}

const singleRes = filterRows(boundRows, [
  { field: '金额', operator: 'between', value: '', betweenMin: '1,000' },
], boundFields);
assertEqual(singleRes.filteredRows.length, 0, '新格式只填最小值 0 条');

// ============================================================
// 测试 24: 旧格式兼容与歧义防护
// ============================================================
console.log('\n24. 旧格式兼容与歧义防护');

// 无歧义旧格式 "80,90" 由测试 10 覆盖；这里验证歧义场景
const legacySingle = filterRows(boundRows, [
  { field: '金额', operator: 'between', value: '1,000' },
], boundFields);
assertEqual(legacySingle.filteredRows.length, 0, '旧格式 value "1,000" 0 条（不拆成 1~0）');

const legacyMulti = filterRows(boundRows, [
  { field: '金额', operator: 'between', value: '1,000,2,000' },
], boundFields);
assertEqual(legacyMulti.filteredRows.length, 0, '旧格式 value "1,000,2,000" 0 条（不拆 4 段）');

// ============================================================
// 测试 25: 下限大于上限（不自动交换）
// ============================================================
console.log('\n25. 下限大于上限');

const result25a = filterRows(rows, [
  { field: '总分', operator: 'between', value: '', betweenMin: '90', betweenMax: '80' },
], numericFields);
assertEqual(result25a.filteredRows.length, 0, '新格式 90~80 0 条（条件无效）');

const result25b = filterRows(rows, [
  { field: '总分', operator: 'between', value: '90,80' },
], numericFields);
assertEqual(result25b.filteredRows.length, 0, '旧格式 90,80 0 条（条件无效）');

// ============================================================
// 测试 26: 旧版 between 格式迁移（normalizeFilterCondition）
// ============================================================
console.log('\n26. 旧版 between 格式迁移');

// 26a: 无歧义旧格式 "80,90" → betweenMin/betweenMax
const legacy1 = { field: '总分', operator: 'between', value: '80,90' };
const migrated1 = normalizeFilterCondition(legacy1);
assertEqual(migrated1.betweenMin, '80', '旧格式 "80,90" → betweenMin "80"');
assertEqual(migrated1.betweenMax, '90', '旧格式 "80,90" → betweenMax "90"');
assertEqual(migrated1.value, '', '迁移后旧 value 被清空');
assertEqual(migrated1.operator, 'between', 'operator 保持 between');
assert(!Object.prototype.hasOwnProperty.call(legacy1, 'betweenMin'), '原对象不被修改（纯函数）');

// 26b: 迁移后筛选结果与迁移前一致
const result26bBefore = filterRows(rows, [legacy1], numericFields);
const result26bAfter = filterRows(rows, [migrated1], numericFields);
assertEqual(result26bBefore.filteredRows.length, 3, '迁移前筛选 3 条');
assertEqual(result26bAfter.filteredRows.length, 3, '迁移后筛选 3 条');
assertEqual(result26bAfter.filteredRows.map(r => r['姓名']).join(','), result26bBefore.filteredRows.map(r => r['姓名']).join(','), '迁移前后筛选结果完全一致');

// 26c: 歧义旧格式 "1,000,2,000" 不迁移（不猜测）
const ambiguous = { field: '金额', operator: 'between', value: '1,000,2,000' };
const ambiguousNorm = normalizeFilterCondition(ambiguous);
assertEqual(ambiguousNorm.betweenMin, undefined, '歧义格式不生成 betweenMin');
assertEqual(ambiguousNorm.betweenMax, undefined, '歧义格式不生成 betweenMax');
assertEqual(ambiguousNorm.value, '1,000,2,000', '歧义格式 value 保持原样（不偷偷转换）');

// 26d: 单值 "1,000" 不迁移
const single = { field: '金额', operator: 'between', value: '1,000' };
const singleNorm = normalizeFilterCondition(single);
assertEqual(singleNorm.betweenMin, undefined, '单值 "1,000" 不迁移');
assertEqual(singleNorm.value, '1,000', '单值 "1,000" value 保持原样');

// 26e: 新格式（已有 betweenMin/betweenMax）保持不变
const newFormat = { field: '金额', operator: 'between', value: '', betweenMin: '1,000', betweenMax: '2,000' };
const newFormatNorm = normalizeFilterCondition(newFormat);
assertEqual(newFormatNorm.betweenMin, '1,000', '新格式 betweenMin 保持原字符串');
assertEqual(newFormatNorm.betweenMax, '2,000', '新格式 betweenMax 保持原字符串');
assertEqual(newFormatNorm.value, '', '新格式 value 保持为空');

// 26f: 非 between 操作符不受影响
const gtCond = { field: '总分', operator: 'gt', value: '80' };
const gtNorm = normalizeFilterCondition(gtCond);
assertEqual(gtNorm, gtCond, 'gt 条件原样返回（同一引用）');
const eqCond = { field: '班级', operator: 'equals', value: 'A班' };
assertEqual(normalizeFilterCondition(eqCond), eqCond, '文本 equals 原样返回（同一引用）');

// 26g: 归一化数组（混合场景）
const mixed = normalizeFilterConditions([
  { field: '总分', operator: 'between', value: '80,90' },
  { field: '金额', operator: 'between', value: '1,000,2,000' },
  { field: '班级', operator: 'equals', value: 'A班' },
]);
assertEqual(mixed[0].betweenMin, '80', '数组归一化：旧格式迁移为 80');
assertEqual(mixed[0].betweenMax, '90', '数组归一化：旧格式迁移为 90');
assertEqual(mixed[1].value, '1,000,2,000', '数组归一化：歧义格式保持原样');
assertEqual(mixed[1].betweenMin, undefined, '数组归一化：歧义格式不生成 betweenMin');
assertEqual(mixed[2].operator, 'equals', '数组归一化：非 between 不变');

// 26h: 幂等性 — 迁移结果再次归一化不变
const idempotent = normalizeFilterCondition(migrated1);
assertEqual(idempotent.betweenMin, '80', '幂等：再次归一化 betweenMin 不变');
assertEqual(idempotent.betweenMax, '90', '幂等：再次归一化 betweenMax 不变');
assertEqual(idempotent.value, '', '幂等：value 保持为空');

// 26i: 迁移后新格式边界（含千分位）筛选正确
const result26i = filterRows(boundRows, [normalizeFilterCondition({ field: '金额', operator: 'between', value: '1,000,2,000' })], boundFields);
assertEqual(result26i.filteredRows.length, 0, '迁移后歧义格式条件仍无效 0 条');

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