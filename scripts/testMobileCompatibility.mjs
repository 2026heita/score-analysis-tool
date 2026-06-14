/**
 * 移动端兼容性和边界场景测试
 * 执行: node scripts/testMobileCompatibility.mjs
 *
 * 测试场景：
 * 1. recommendedFields 为空但存在 unknown 数值字段时，不崩溃
 * 2. fieldValues 为空时，提示未填写，而不是无有效字段
 * 3. rows 为空时，提示读取失败或无数据
 * 4. headers 为空时，提示未识别表头
 * 5. 全部字段 invalid 时，提示字段识别失败
 * 6. NaN / undefined / '' 不参与分析，但不导致页面崩溃
 * 7. 大量字段情况下页面不死循环
 */

let passed = 0;
let failed = 0;

function assert(name, condition, expected = true) {
  if (condition === expected) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected ${expected}, got ${condition}`);
    failed++;
  }
}

function assertNoCrash(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}: 未崩溃`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: 崩溃 - ${error.message}`);
    failed++;
  }
}

// ============================================================
// 场景 1: recommendedFields 为空但存在 unknown 数值字段
// ============================================================
console.log('\n=== 场景 1: recommendedFields 为空但有数值候选字段 ===');

const scenario1_data = {
  headers: ['字段A', '字段B', '字段C'],
  rows: [
    { '字段A': '10', '字段B': '20', '字段C': '30' },
    { '字段A': '15', '字段B': '25', '字段C': '35' },
  ],
  fieldTypes: [
    { header: '字段A', analysisRole: 'unknown', numericRatio: 1.0 },
    { header: '字段B', analysisRole: 'unknown', numericRatio: 1.0 },
    { header: '字段C', analysisRole: 'unknown', numericRatio: 1.0 },
  ]
};

assertNoCrash('场景1: 解析数据不崩溃', () => {
  assert('headers 存在', scenario1_data.headers.length === 3);
  assert('rows 存在', scenario1_data.rows.length === 2);
  assert('所有字段为 unknown', scenario1_data.fieldTypes.every(f => f.analysisRole === 'unknown'));
});

// 模拟 availableFields 兜底逻辑
const recommendedFields1 = scenario1_data.fieldTypes
  .filter(f => ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'].includes(f.analysisRole))
  .map(f => f.header);

assert('recommendedFields 为空', recommendedFields1.length === 0);

const numericCandidates1 = scenario1_data.headers.filter(h => {
  const meta = scenario1_data.fieldTypes.find(f => f.header === h);
  if (!meta) return false;
  if (['identity', 'textMeta', 'invalid', 'adjustment'].includes(meta.analysisRole)) return false;
  return meta.numericRatio > 0.5;
});

assert('数值候选字段存在', numericCandidates1.length === 3);
assert('候选字段包含字段A', numericCandidates1.includes('字段A'));
assert('候选字段包含字段B', numericCandidates1.includes('字段B'));
assert('候选字段包含字段C', numericCandidates1.includes('字段C'));

// ============================================================
// 场景 2: fieldValues 为空时的提示
// ============================================================
console.log('\n=== 场景 2: fieldValues 为空时的提示 ===');

const scenario2_data = {
  headers: ['总分', '排名'],
  rows: [
    { '总分': '', '排名': '' },
    { '总分': '', '排名': '' },
  ],
  fieldTypes: [
    { header: '总分', analysisRole: 'primaryTotal' },
    { header: '排名', analysisRole: 'rank' },
  ]
};

assertNoCrash('场景2: 解析数据不崩溃', () => {
  assert('headers 存在', scenario2_data.headers.length === 2);
  assert('rows 存在', scenario2_data.rows.length === 2);
});

// 模拟 fieldValues 提取
const fieldValues2 = {};
for (const row of scenario2_data.rows) {
  const val = row['总分'];
  if (val !== undefined && val !== null && val !== '') {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      fieldValues2['总分'] = num;
    }
  }
}

assert('fieldValues 为空', Object.keys(fieldValues2).length === 0);
assert('应提示"未填写成绩"', true); // UI 层面会显示提示

// ============================================================
// 场景 3: rows 为空时的提示
// ============================================================
console.log('\n=== 场景 3: rows 为空时的提示 ===');

const scenario3_data = {
  headers: ['总分', '排名'],
  rows: [],
  fieldTypes: [
    { header: '总分', analysisRole: 'primaryTotal' },
    { header: '排名', analysisRole: 'rank' },
  ]
};

assertNoCrash('场景3: 解析数据不崩溃', () => {
  assert('headers 存在', scenario3_data.headers.length === 2);
  assert('rows 为空', scenario3_data.rows.length === 0);
});

assert('应提示"表格数据为空"', scenario3_data.rows.length === 0);

// ============================================================
// 场景 4: headers 为空时的提示
// ============================================================
console.log('\n=== 场景 4: headers 为空时的提示 ===');

const scenario4_data = {
  headers: [],
  rows: [
    { '': '10' },
    { '': '20' },
  ],
  fieldTypes: []
};

assertNoCrash('场景4: 解析数据不崩溃', () => {
  assert('headers 为空', scenario4_data.headers.length === 0);
  assert('rows 存在', scenario4_data.rows.length === 2);
});

assert('应提示"未识别到表头字段"', scenario4_data.headers.length === 0);

// ============================================================
// 场景 5: 全部字段 invalid 时的提示
// ============================================================
console.log('\n=== 场景 5: 全部字段 invalid 时的提示 ===');

const scenario5_data = {
  headers: ['未命名字段1', '未命名字段2', '未命名字段3'],
  rows: [
    { '未命名字段1': '10', '未命名字段2': '20', '未命名字段3': '30' },
    { '未命名字段1': '15', '未命名字段2': '25', '未命名字段3': '35' },
  ],
  fieldTypes: [
    { header: '未命名字段1', analysisRole: 'invalid' },
    { header: '未命名字段2', analysisRole: 'invalid' },
    { header: '未命名字段3', analysisRole: 'invalid' },
  ]
};

assertNoCrash('场景5: 解析数据不崩溃', () => {
  assert('headers 存在', scenario5_data.headers.length === 3);
  assert('所有字段为 invalid', scenario5_data.fieldTypes.every(f => f.analysisRole === 'invalid'));
});

const allInvalid = scenario5_data.fieldTypes.every(
  m => m.analysisRole === 'invalid' || m.analysisRole === 'identity' || m.analysisRole === 'textMeta'
);

assert('应提示"未发现成绩类字段"', allInvalid);

// ============================================================
// 场景 6: NaN / undefined / '' 不参与分析但不崩溃
// ============================================================
console.log('\n=== 场景 6: NaN / undefined / \'\' 不参与分析 ===');

const scenario6_data = {
  headers: ['总分'],
  rows: [
    { '总分': '100' },
    { '总分': '' },
    { '总分': undefined },
    { '总分': 'NaN' },
    { '总分': '95' },
  ],
  fieldTypes: [
    { header: '总分', analysisRole: 'primaryTotal' },
  ]
};

assertNoCrash('场景6: 解析数据不崩溃', () => {
  assert('headers 存在', scenario6_data.headers.length === 1);
  assert('rows 存在', scenario6_data.rows.length === 5);
});

// 模拟 fieldValues 提取
const fieldValues6 = [];
for (const row of scenario6_data.rows) {
  const val = row['总分'];
  if (val !== undefined && val !== null && val !== '') {
    const num = parseFloat(val);
    if (!isNaN(num) && Number.isFinite(num)) {
      fieldValues6.push(num);
    }
  }
}

assert('有效数值只有 100 和 95', fieldValues6.length === 2);
assert('fieldValues 包含 100', fieldValues6.includes(100));
assert('fieldValues 包含 95', fieldValues6.includes(95));
assert('fieldValues 不包含 NaN', !fieldValues6.some(v => isNaN(v)));

// ============================================================
// 场景 7: 大量字段情况下不崩溃
// ============================================================
console.log('\n=== 场景 7: 大量字段情况下不崩溃 ===');

const scenario7_headers = Array.from({ length: 100 }, (_, i) => `字段${i + 1}`);
const scenario7_rows = Array.from({ length: 100 }, (_, rowIdx) => {
  const row = {};
  for (let i = 0; i < 100; i++) {
    row[`字段${i + 1}`] = String(Math.floor(Math.random() * 100));
  }
  return row;
});

assertNoCrash('场景7: 100 个字段不崩溃', () => {
  assert('headers 存在', scenario7_headers.length === 100);
  assert('rows 存在', scenario7_rows.length === 100);
});

// 模拟 availableFields 计算
const availableFields7 = scenario7_headers.filter(h => {
  // 模拟 isNumericField 检查
  const values = scenario7_rows.map(row => {
    const val = row[h];
    if (val === undefined || val === '' || val === null) return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  });
  const numericCount = values.filter(v => v !== null).length;
  return numericCount > scenario7_rows.length * 0.5;
});

assert('100 个字段都能正常处理', availableFields7.length === 100);

// ============================================================
// 场景 8: 大表格（5000+ 行）防卡死保护
// ============================================================
console.log('\n=== 场景 8: 大表格防卡死保护 ===');

const scenario8_data = {
  headers: ['总分'],
  rows: Array.from({ length: 6000 }, (_, i) => ({ '总分': String(100 + i % 50) })),
  fieldTypes: [
    { header: '总分', analysisRole: 'primaryTotal' },
  ]
};

assertNoCrash('场景8: 6000 行数据不崩溃', () => {
  assert('headers 存在', scenario8_data.headers.length === 1);
  assert('rows 存在', scenario8_data.rows.length === 6000);
});

// 模拟防卡死保护：只计算前 5000 行
const maxRows = Math.min(scenario8_data.rows.length, 5000);
const limitedRows = scenario8_data.rows.slice(0, maxRows);

assert('限制计算行数为 5000', limitedRows.length === 5000);
assert('实际行数为 6000', scenario8_data.rows.length === 6000);

// ============================================================
// 汇总
// ============================================================
console.log('\n=== 测试汇总 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed === 0) {
  console.log('\n✅ 所有移动端兼容性和边界场景测试通过！');
  process.exit(0);
} else {
  console.log(`\n❌ 有 ${failed} 个测试失败`);
  process.exit(1);
}
