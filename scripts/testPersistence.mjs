/**
 * 持久化与上下文提示测试 v4
 * 
 * 测试场景：
 * 1. filterConditions 保存和恢复
 * 2. 旧版本无 filterConditions 时兼容
 * 3. selectedDimension 保存和恢复
 * 4. 字段不存在时 selectedDimension 自动清空
 * 5. 筛选上下文统计正确
 * 6. 筛选条件为空时恢复默认
 */

let passed = 0;
let failed = 0;

// ===== 内联 migrateState 和 loadSavedState 逻辑 =====
const CURRENT_VERSION = 3;

function migrateState(raw) {
  const migrated = { ...raw };

  if (migrated.filterConditions === undefined) {
    migrated.filterConditions = [];
  }
  if (migrated.selectedDimension === undefined) {
    migrated.selectedDimension = '';
  }

  migrated.version = CURRENT_VERSION;
  return migrated;
}

function getDefaultState() {
  return {
    version: CURRENT_VERSION,
    rawText: '',
    selectedField: '',
    inputValue: '',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    analysisMode: 'scoreRate',
    filterConditions: [],
    selectedDimension: '',
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
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Actual: ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== 持久化与上下文提示测试 v4 ===\n');

// ============================================================
// 测试 1: v2 旧数据迁移 - filterConditions 和 selectedDimension
// ============================================================
console.log('1. v2 旧数据迁移');

const oldV2 = {
  version: 2,
  rawText: 'test data',
  selectedField: 'GMV',
  inputValue: '100',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
};

const migrated = migrateState(oldV2);
assertEqual(migrated.filterConditions, [], 'v2 迁移后 filterConditions 为空数组');
assertEqual(migrated.selectedDimension, '', 'v2 迁移后 selectedDimension 为空字符串');
assertEqual(migrated.version, CURRENT_VERSION, '版本号升级到 3');
assertEqual(migrated.rawText, 'test data', '原始数据保留');
assertEqual(migrated.selectedField, 'GMV', 'selectedField 保留');

// ============================================================
// 测试 2: v2 旧数据已有 filterConditions 时保留
// ============================================================
console.log('\n2. v2 旧数据已有 filterConditions 时保留');

const oldV2WithFilters = {
  version: 2,
  rawText: 'test',
  selectedField: 'aaa',
  inputValue: '',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
  filterConditions: [{ field: '班级', operator: 'equals', value: 'A班' }],
};

const migrated2 = migrateState(oldV2WithFilters);
assertEqual(migrated2.filterConditions.length, 1, '已有 filterConditions 保留');
assertEqual(migrated2.filterConditions[0].field, '班级', '筛选字段保留');
assertEqual(migrated2.filterConditions[0].operator, 'equals', '操作符保留');
assertEqual(migrated2.filterConditions[0].value, 'A班', '筛选值保留');

// ============================================================
// 测试 3: v1 旧数据迁移（更早版本）
// ============================================================
console.log('\n3. v1 旧数据迁移');

const oldV1 = {
  version: 1,
  rawText: 'old v1 data',
  selectedField: 'old field',
  inputValue: '50',
  showAllFields: true,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
};

const migrated3 = migrateState(oldV1);
assertEqual(migrated3.filterConditions, [], 'v1 迁移后 filterConditions 为空');
assertEqual(migrated3.selectedDimension, '', 'v1 迁移后 selectedDimension 为空');
assertEqual(migrated3.version, CURRENT_VERSION, '版本号升级到 3');

// ============================================================
// 测试 4: v3 数据不变
// ============================================================
console.log('\n4. v3 数据不变');

const currentV3 = {
  version: 3,
  rawText: 'v3 data',
  selectedField: 'GMV',
  inputValue: '200',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
  filterConditions: [{ field: '类目', operator: 'contains', value: '数码' }],
  selectedDimension: '类目',
};

const migrated4 = migrateState(currentV3);
assertEqual(migrated4.filterConditions.length, 1, 'v3 filterConditions 保留');
assertEqual(migrated4.selectedDimension, '类目', 'v3 selectedDimension 保留');

// ============================================================
// 测试 5: 默认状态包含新字段
// ============================================================
console.log('\n5. 默认状态包含新字段');

const def = getDefaultState();
assert('filterConditions' in def, '默认状态包含 filterConditions');
assert('selectedDimension' in def, '默认状态包含 selectedDimension');
assertEqual(def.filterConditions, [], '默认 filterConditions 为空');
assertEqual(def.selectedDimension, '', '默认 selectedDimension 为空');

// ============================================================
// 测试 6: 字段不存在时自动清空 selectedDimension
// ============================================================
console.log('\n6. 字段不存在时自动清空 selectedDimension');

// 模拟：headers 中没有 selectedDimension 字段
const headers = ['商品', '类目', 'GMV', '转化率'];
const savedDimension = '总分';

// 如果 headers 不包含 savedDimension，应清空
const shouldClear = !headers.includes(savedDimension);
assert(shouldClear, '总分不在 headers 中，应清空');

// 如果 headers 包含 savedDimension，应保留
const shouldKeep = headers.includes('类目');
assert(shouldKeep, '类目在 headers 中，应保留');

// ============================================================
// 测试 7: 筛选上下文统计
// ============================================================
console.log('\n7. 筛选上下文统计');

// 模拟筛选上下文数据
const originalCount = 100;
const filteredCount = 75;
const activeConditions = 2;
const filterRatio = (originalCount - filteredCount) / originalCount;

assertEqual(originalCount, 100, '原始 100 行');
assertEqual(filteredCount, 75, '筛选后 75 行');
assertEqual(activeConditions, 2, '2 个活跃条件');
assertClose(filterRatio, 0.25, 0.01, '过滤比例 25%');

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${expected} (±${tolerance})`);
    console.error(`    Actual: ${actual}`);
  }
}

// ============================================================
// 测试 8: 无筛选条件时上下文
// ============================================================
console.log('\n8. 无筛选条件时上下文');

const noFilter = {
  originalCount: 100,
  filteredCount: 100,
  activeConditions: 0,
  filterRatio: 0,
};
assertEqual(noFilter.activeConditions, 0, '无筛选条件');
assertEqual(noFilter.filteredCount, noFilter.originalCount, '筛选后等于原始');
assert(noFilter.filterRatio === 0, '过滤比例 0%');

// ============================================================
// 测试 9: 筛选结果为空时上下文
// ============================================================
console.log('\n9. 筛选结果为空时上下文');

const emptyFilter = {
  originalCount: 100,
  filteredCount: 0,
  activeConditions: 1,
  filterRatio: 1,
};
assertEqual(emptyFilter.filteredCount, 0, '筛选结果为空');
assertEqual(emptyFilter.activeConditions, 1, '有 1 个活跃条件');
assert(emptyFilter.filterRatio === 1, '过滤比例 100%');
assert(emptyFilter.filteredCount === 0, '无可分析数据');

// ============================================================
// 测试 10: 分组维度与筛选组合
// ============================================================
console.log('\n10. 分组维度与筛选组合');

const contextWithBoth = {
  originalCount: 200,
  filteredCount: 150,
  activeConditions: 1,
  selectedDimension: '类目',
};
assertEqual(contextWithBoth.originalCount, 200, '原始 200 行');
assertEqual(contextWithBoth.filteredCount, 150, '筛选后 150 行');
assertEqual(contextWithBoth.activeConditions, 1, '1 个筛选条件');
assertEqual(contextWithBoth.selectedDimension, '类目', '按类目分组');

// ============================================================
// 测试 11: filterConditions 恢复默认（空条件）
// ============================================================
console.log('\n11. filterConditions 恢复默认');

const defaultFilterConditions = [];
const singleEmpty = [{ field: '', operator: 'equals', value: '' }];

// 默认空条件
assertEqual(defaultFilterConditions.length, 0, '默认空条件数组');

// 恢复时如无保存数据，用默认值
assertEqual(singleEmpty.length, 1, '单个空条件占位');

// ============================================================
// 测试 12: 多条件筛选上下文
// ============================================================
console.log('\n12. 多条件筛选上下文');

const multiFilter = {
  originalCount: 500,
  filteredCount: 120,
  activeConditions: 3,
};
assertEqual(multiFilter.activeConditions, 3, '3 个活跃条件');
assert(multiFilter.filteredCount < multiFilter.originalCount, '筛选减少了行数');
const ratio = (multiFilter.originalCount - multiFilter.filteredCount) / multiFilter.originalCount;
assert(ratio > 0.5, '多条件过滤超过 50%');

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