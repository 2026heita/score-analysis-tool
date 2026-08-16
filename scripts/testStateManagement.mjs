/**
 * 状态管理回归测试
 * 验证字段选择状态在用户输入时不会被重置
 */

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

function assertMinCount(name, actual, min) {
  if (actual >= min) {
    console.log(`  ✅ ${name}: ${actual} >= ${min}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected >= ${min}, got ${actual}`);
    failed++;
  }
}

// ============================================================
// 模拟状态管理逻辑
// ============================================================

// 严格数字解析（支持千分位）
function parseNumericStringStrict(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(',')) {
    const thousandsRegex = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
    if (!thousandsRegex.test(trimmed)) return null;
    const withoutCommas = trimmed.replace(/,/g, '');
    const num = Number(withoutCommas);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// 模拟 FieldSelection
class FieldSelection {
  constructor(field, userValue = 0) {
    this.field = field;
    this.userValue = userValue;
  }
}

// 模拟状态管理
class StateManager {
  constructor() {
    this.selections = [];
    this.viewMode = 'bar';
  }

  // 初始化（只在挂载时调用）
  initialize(initialSelections) {
    if (initialSelections !== undefined && this.selections.length === 0) {
      this.selections = initialSelections.map(s => new FieldSelection(s.field, s.userValue));
    }
  }

  // 更新字段值（用户输入时调用）
  updateField(index, key, value) {
    if (index >= 0 && index < this.selections.length) {
      // 创建新数组和新对象，不修改原对象
      this.selections = this.selections.map((sel, i) => {
        if (i === index) {
          return { ...sel, [key]: value };
        }
        return sel;
      });
    }
  }

  // 添加字段
  addField(field) {
    this.selections = [...this.selections, new FieldSelection(field, 0)];
  }

  // 删除字段
  removeField(index) {
    this.selections = this.selections.filter((_, i) => i !== index);
  }

  // 清空所有字段
  clearAll() {
    this.selections = [];
  }

  // 填充学生数据（不可变方式）
  fillStudentData(studentRow) {
    let filledCount = 0;
    
    this.selections = this.selections.map(sel => {
      const rawValue = studentRow[sel.field];
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        const numValue = parseNumericStringStrict(String(rawValue));
        if (numValue !== null) {
          filledCount++;
          return { ...sel, userValue: numValue };
        }
      }
      return sel;
    });

    return filledCount;
  }

  getSelectionsCount() {
    return this.selections.length;
  }

  getFieldValue(index) {
    if (index >= 0 && index < this.selections.length) {
      return this.selections[index].userValue;
    }
    return null;
  }
}

// ============================================================
// 测试场景 1: 选择字段后输入数值，字段选择状态不会被重置
// ============================================================
console.log('\n=== 测试 1: 输入数值时字段选择状态保持不变 ===\n');

const state1 = new StateManager();
state1.initialize([]);

// 选择 5 个字段
state1.addField('总分');
state1.addField('班级排名');
state1.addField('德育_合计');
state1.addField('智育_合计');
state1.addField('体育_合计');

assert('初始字段数量', state1.getSelectionsCount(), 5);

// 给第 1 个字段输入数值
state1.updateField(0, 'userValue', 537);
assert('输入第1个字段后字段数量', state1.getSelectionsCount(), 5);
assert('第1个字段值正确', state1.getFieldValue(0), 537);

// 给第 2 个字段输入数值
state1.updateField(1, 'userValue', 5);
assert('输入第2个字段后字段数量', state1.getSelectionsCount(), 5);
assert('第2个字段值正确', state1.getFieldValue(1), 5);

// 给第 3 个字段输入数值
state1.updateField(2, 'userValue', 95);
assert('输入第3个字段后字段数量', state1.getSelectionsCount(), 5);
assert('第3个字段值正确', state1.getFieldValue(2), 95);

// 验证所有字段仍然存在
assert('字段1名称', state1.selections[0].field, '总分');
assert('字段2名称', state1.selections[1].field, '班级排名');
assert('字段3名称', state1.selections[2].field, '德育_合计');
assert('字段4名称', state1.selections[3].field, '智育_合计');
assert('字段5名称', state1.selections[4].field, '体育_合计');

// ============================================================
// 测试场景 2: 粘贴整行成绩后字段选择状态不变
// ============================================================
console.log('\n=== 测试 2: 粘贴整行成绩后字段选择状态不变 ===\n');

const state2 = new StateManager();
state2.initialize([]);

// 选择 3 个字段
state2.addField('语文');
state2.addField('数学');
state2.addField('英语');

assert('初始字段数量', state2.getSelectionsCount(), 3);

// 模拟粘贴整行成绩
const studentData = {
  '语文': '90',
  '数学': '95',
  '英语': '88',
};

const filledCount = state2.fillStudentData(studentData);
assert('填充字段数量', filledCount, 3);
assert('填充后字段数量', state2.getSelectionsCount(), 3);
assert('语文值正确', state2.getFieldValue(0), 90);
assert('数学值正确', state2.getFieldValue(1), 95);
assert('英语值正确', state2.getFieldValue(2), 88);

// 验证字段名称未改变
assert('字段1名称未变', state2.selections[0].field, '语文');
assert('字段2名称未变', state2.selections[1].field, '数学');
assert('字段3名称未变', state2.selections[2].field, '英语');

// ============================================================
// 测试场景 3: 查找学生后字段选择状态不变
// ============================================================
console.log('\n=== 测试 3: 查找学生后字段选择状态不变 ===\n');

const state3 = new StateManager();
state3.initialize([]);

// 选择 4 个字段
state3.addField('总分');
state3.addField('德育_合计');
state3.addField('智育_合计');
state3.addField('体育_合计');

assert('初始字段数量', state3.getSelectionsCount(), 4);

// 模拟查找学生并填充数据
const studentRow = {
  '总分': '537',
  '德育_合计': '95',
  '智育_合计': '450',
  '体育_合计': '80',
};

const filled = state3.fillStudentData(studentRow);
assert('填充字段数量', filled, 4);
assert('填充后字段数量', state3.getSelectionsCount(), 4);

// 验证所有字段仍然存在
assert('字段1名称', state3.selections[0].field, '总分');
assert('字段2名称', state3.selections[1].field, '德育_合计');
assert('字段3名称', state3.selections[2].field, '智育_合计');
assert('字段4名称', state3.selections[3].field, '体育_合计');

// 验证值已填充
assert('总分值', state3.getFieldValue(0), 537);
assert('德育_合计值', state3.getFieldValue(1), 95);
assert('智育_合计值', state3.getFieldValue(2), 450);
assert('体育_合计值', state3.getFieldValue(3), 80);

// ============================================================
// 测试场景 4: 删除字段不影响其他字段
// ============================================================
console.log('\n=== 测试 4: 删除字段不影响其他字段 ===\n');

const state4 = new StateManager();
state4.initialize([]);

state4.addField('字段1');
state4.addField('字段2');
state4.addField('字段3');

state4.updateField(0, 'userValue', 10);
state4.updateField(1, 'userValue', 20);
state4.updateField(2, 'userValue', 30);

assert('删除前字段数量', state4.getSelectionsCount(), 3);

// 删除第 2 个字段
state4.removeField(1);

assert('删除后字段数量', state4.getSelectionsCount(), 2);
assert('第1个字段值不变', state4.getFieldValue(0), 10);
assert('第2个字段（原第3个）值不变', state4.getFieldValue(1), 30);

// ============================================================
// 测试场景 5: 清空字段后状态正确
// ============================================================
console.log('\n=== 测试 5: 清空字段后状态正确 ===\n');

const state5 = new StateManager();
state5.initialize([]);

state5.addField('字段1');
state5.addField('字段2');

state5.updateField(0, 'userValue', 100);
state5.updateField(1, 'userValue', 200);

assert('清空前字段数量', state5.getSelectionsCount(), 2);

state5.clearAll();

assert('清空后字段数量', state5.getSelectionsCount(), 0);

// ============================================================
// 总结
// ============================================================
console.log('\n=== 测试结果 ===\n');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed === 0) {
  console.log('\n✅ 所有状态管理测试通过！');
  process.exit(0);
} else {
  console.log('\n❌ 部分测试失败！');
  process.exit(1);
}
