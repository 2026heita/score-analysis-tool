/**
 * 保存版本逻辑回归测试
 * 
 * 验证：
 * 1. 手动保存后数据能被 loadSavedState 正常读取
 * 2. version 不匹配时旧数据被清除
 * 3. saveState 统一注入 CURRENT_VERSION
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

// ===== 内联核心逻辑（与 src/utils/storage.ts 一致） =====

const CURRENT_VERSION = 2;
const STORAGE_KEY = 'test_score_analyzer_state';

// 模拟 localStorage（Node.js 环境无 localStorage）
const store = new Map();

function saveState(state) {
  const toSave = { ...state, version: CURRENT_VERSION };
  store.set(STORAGE_KEY, JSON.stringify(toSave));
}

function loadSavedState() {
  const raw = store.get(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      store.delete(STORAGE_KEY);
      return null;
    }
    if (parsed.version !== CURRENT_VERSION) {
      store.delete(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    store.delete(STORAGE_KEY);
    return null;
  }
}

function clearSavedState() {
  store.delete(STORAGE_KEY);
}

// ===== 测试用例 =====

console.log('=== 测试 1: 手动保存后能正常读取 ===');
clearSavedState();

// 模拟 handleSave 调用（不传 version，由 saveState 统一注入）
saveState({
  rawText: '姓名\t分数\n张三\t90\n李四\t85',
  selectedField: '分数',
  inputValue: '90',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
});

const saved = loadSavedState();
assert(saved !== null, '保存后数据不为 null');
assert(saved.version === CURRENT_VERSION, 'version 被 saveState 统一注入为 CURRENT_VERSION');
assert(saved.rawText === '姓名\t分数\n张三\t90\n李四\t85', 'rawText 正确保存');
assert(saved.selectedField === '分数', 'selectedField 正确保存');
assert(saved.inputValue === '90', 'inputValue 正确保存');
assert(saved.activeChartTab === 'histogram', 'activeChartTab 正确保存');
assert(saved.showAllFields === false, 'showAllFields 正确保存');
assert(saved.analysisMode === 'scoreRate', 'analysisMode 正确保存');
assert(saved.originalFieldRadar.selections.length === 0, 'originalFieldRadar 正确保存');

console.log('=== 测试 2: 即使调用方传入 version: 1，saveState 仍覆盖为 CURRENT_VERSION ===');
clearSavedState();

saveState({
  version: 1,  // 模拟旧 handleSave 传入错误版本号
  rawText: 'test',
  selectedField: '',
  inputValue: '',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
});

const saved2 = loadSavedState();
assert(saved2 !== null, '即使传入 version:1，数据仍能被读取');
assert(saved2.version === CURRENT_VERSION, 'saveState 覆盖 version 为 CURRENT_VERSION');

console.log('=== 测试 3: version 不匹配时旧数据被清除 ===');
clearSavedState();

// 先存入正确版本的数据
saveState({
  rawText: 'current',
  selectedField: '',
  inputValue: '',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
});

// 直接写入旧版本数据（绕过 saveState）
store.set(STORAGE_KEY, JSON.stringify({
  version: 1,  // 旧版本
  rawText: 'old',
  selectedField: '',
  inputValue: '',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
}));

const cleared = loadSavedState();
assert(cleared === null, 'version=1 的旧数据被清除');
assert(!store.has(STORAGE_KEY), 'localStorage 中的旧数据被删除');

console.log('=== 测试 4: 空 localStorage 返回 null ===');
clearSavedState();
const empty = loadSavedState();
assert(empty === null, '空 localStorage 返回 null');

console.log('=== 测试 5: 损坏的 JSON 返回 null ===');
clearSavedState();
store.set(STORAGE_KEY, '{invalid json');
const corrupt = loadSavedState();
assert(corrupt === null, '损坏的 JSON 返回 null');
assert(!store.has(STORAGE_KEY), '损坏的 JSON 被清除');

console.log('=== 测试 6: 非对象 JSON 返回 null ===');
clearSavedState();
store.set(STORAGE_KEY, '"just a string"');
const nonObj = loadSavedState();
assert(nonObj === null, '非对象 JSON 返回 null');

// ===== 结果 =====

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed} / ${passed + failed}`);
if (failed > 0) {
  console.log(`失败: ${failed}`);
  process.exit(1);
} else {
  console.log('全部通过!');
}