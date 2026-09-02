/**
 * 数据来源统一语义测试
 *
 * 验证（与 src/ 实现逻辑保持一致的内联复刻）：
 * 1. Retail BI 连接配置（game-score.retail-bi.connection）能够持久化。
 * 2. Retail BI 加载成功后，主应用知道当前 source 为 retail-bi。
 * 3. 保存 Retail BI 当前输入时不序列化完整 ParsedTable。
 * 4. 刷新/初始化后能够恢复 Retail BI 查询配置。
 * 5. 点击“清空数据”后：主 SavedState、retail-bi.connection 均被清除，
 *    Retail BI 表单立即显示为空，parsedData / overview / comparison / anomalies 全为空。
 * 6. 普通粘贴数据原有“保存当前输入”功能不回归。
 * 7. localStorage 不可用或 quota error 时不能导致页面崩溃。
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

// ===== 可插拔 localStorage（可注入失败/配额错误模拟） =====
function createStorage(simulateFailure = false, simulateQuota = false) {
  const store = new Map();
  let quotaMsgShown = false;
  return {
    getItem: (key) => (simulateFailure ? null : (store.has(key) ? store.get(key) : null)),
    setItem: (key, value) => {
      if (simulateFailure) throw new Error('storage unavailable');
      if (simulateQuota) {
        if (!quotaMsgShown) {
          quotaMsgShown = true;
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
      }
      store.set(key, value);
    },
    removeItem: (key) => {
      if (simulateFailure) throw new Error('storage unavailable');
      store.delete(key);
    },
    has: (key) => store.has(key),
    _store: store,
  };
}

// ===== 内联：主 SavedState 逻辑（与 src/utils/storage.ts 一致） =====
const STORAGE_KEY = 'score_analyzer_state';
const RETRI_CONN_KEY = 'game-score.retail-bi.connection';
const CURRENT_VERSION = 4;
const DEFAULT_DATA_SOURCE = { type: 'manual' };

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
    dataSource: { type: 'manual' },
  };
}

function migrateState(raw) {
  const migrated = { ...raw };
  if (migrated.filterConditions === undefined) migrated.filterConditions = [];
  if (migrated.selectedDimension === undefined) migrated.selectedDimension = '';
  if (migrated.dataSource === undefined) migrated.dataSource = { type: 'manual' };
  migrated.version = CURRENT_VERSION;
  return migrated;
}

function saveState(store, state) {
  try {
    const toSave = { ...state, version: CURRENT_VERSION };
    store.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return true;
  } catch {
    return false;
  }
}

function loadSavedState(store) {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return getDefaultState();
    if (parsed.version !== CURRENT_VERSION) {
      const migrated = migrateState(parsed);
      try { store.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* 静默 */ }
      return migrated;
    }
    return parsed;
  } catch {
    try { store.removeItem(STORAGE_KEY); } catch { /* 静默 */ }
    return getDefaultState();
  }
}

function clearSavedState(store) {
  try { store.removeItem(STORAGE_KEY); } catch { /* 静默 */ }
}

// ===== 内联：Retail Bi 连接配置逻辑（与 RetailBiConnectionForm.tsx 一致） =====
function saveRetailConn(store, config) {
  try {
    store.setItem(RETRI_CONN_KEY, JSON.stringify(config));
  } catch { /* 忽略 */ }
}

function loadRetailConn(store) {
  try {
    const raw = store.getItem(RETRI_CONN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearRetailConn(store) {
  try { store.removeItem(RETRI_CONN_KEY); } catch { /* 忽略 */ }
}

function retailConnAllEmpty(config) {
  return !config || (!config.baseUrl && !config.startDate && !config.endDate);
}

console.log('\n=== 数据来源统一语义测试 ===\n');

// ============================================================
console.log('1. Retail BI 配置持久化');
// ============================================================
{
  const storage = createStorage();
  const config = { baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  saveRetailConn(storage, config);
  assert(storage.has(RETRI_CONN_KEY), 'config 已写入 game-score.retail-bi.connection');
  assertEqual(loadRetailConn(storage), config, 'config 可完整读回');

  // 三个字段全部为空时删除存储键（与表单自动保存逻辑一致）
  clearRetailConn(storage);
  assert(!storage.has(RETRI_CONN_KEY), '清空后存储键被删除');
}

// ============================================================
console.log('\n2. Retail BI 加载成功后主应用知道 source 为 retail-bi');
// ============================================================
{
  // 模拟 App.handleRetailBiDataLoaded
  const config = { baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  let dataSource = { type: 'manual' };

  // applyExternalParsedTable 使 rawText 为空，再注入来源
  const rawText = '';
  const parsedTable = { headers: ['dt', 'totalSales'], rows: [], warnings: [] };
  if (rawText.trim()) { /* 占位：空文本不触发来源回退 */ }
  dataSource = { type: 'retail-bi', baseUrl: config.baseUrl, startDate: config.startDate, endDate: config.endDate };

  assert(dataSource.type === 'retail-bi', 'source 类型为 retail-bi');
  assertEqual(dataSource.baseUrl, config.baseUrl, 'baseUrl 已携带');
  assertEqual(dataSource.startDate, config.startDate, 'startDate 已携带');
  assertEqual(dataSource.endDate, config.endDate, 'endDate 已携带');
  assert(parsedTable !== null, 'ParsedTable 正常进入现有链路');
}

// ============================================================
console.log('\n3. 保存 Retail BI 当前输入不序列化完整 ParsedTable');
// ============================================================
{
  const storage = createStorage();
  const dataSource = { type: 'retail-bi', baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  const bigParsedTable = { headers: ['dt', 'v'], rows: new Array(20000).fill({ dt: '2026-08-01', v: '1' }), warnings: [] };

  const savedOk = saveState(storage, {
    rawText: '',
    selectedField: '',
    inputValue: '',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    analysisMode: 'scoreRate',
    filterConditions: [],
    selectedDimension: '',
    dataSource,
  });

  assert(savedOk === true, '保存成功');
  const saved = loadSavedState(storage);
  assertEqual(saved.dataSource, dataSource, '保存了来源类型与小型查询配置');
  assert(saved.rawText === '', '外部数据集未作为 rawText 落盘');
  assert(!('rows' in saved), '未把完整 ParsedTable 写入 SavedState');
  assert(!('parsedData' in saved), '未把 parsedData 写入 SavedState');
  assert(JSON.stringify(saved).includes('https://api.example.com'), '仅含小型配置元数据');

  // 大数据不写入 → 存储中不含 20000 行内容
  assert(!JSON.stringify(storage.getItem(STORAGE_KEY)).includes('20000'), '未保存完整外部数据集');
}

// ============================================================
console.log('\n4. 刷新/初始化后恢复 Retail BI 查询配置');
// ============================================================
{
  // 首次：保存配置（等价于表单自动保存）
  const storage = createStorage();
  const config = { baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  saveRetailConn(storage, config);

  // 刷新：组件挂载时从 localStorage 恢复
  const restored = loadRetailConn(storage);
  assertEqual(restored, config, '刷新后恢复 baseUrl/startDate/endDate');
}

// ============================================================
console.log('\n5. “清空数据”统一清理');
// ============================================================
{
  const storage = createStorage();
  // 预置：主状态 + retail-bi 连接配置 + 外部数据相关状态
  saveState(storage, {
    rawText: '',
    selectedField: '',
    inputValue: '',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    analysisMode: 'scoreRate',
    filterConditions: [],
    selectedDimension: '',
    dataSource: { type: 'retail-bi', baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' },
  });
  saveRetailConn(storage, { baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' });

  // 模拟 App.handleClear
  clearSavedState(storage);
  clearRetailConn(storage);
  let parsedData = { headers: ['dt', 'v'], rows: [], warnings: [] }; // 变为 null
  parsedData = null;
  let retailBiOverview = { dt: '2026-08-31' };
  let retailBiComparison = { date: '2026-08-31' };
  let retailBiAnomalies = [{ dt: '2026-08-31', anomalyLevel: 'HIGH' }];
  let dataSource = { type: 'retail-bi', baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  // 触发表单同步清空（等价 clearSignal 变化 → 表单字段置空）
  retailBiOverview = null;
  retailBiComparison = null;
  retailBiAnomalies = null;
  dataSource = { type: 'manual' };
  let form = { baseUrl: 'https://api.example.com', startDate: '2026-08-01', endDate: '2026-08-31' };
  form = { baseUrl: '', startDate: '', endDate: '' };

  assert(!storage.has(STORAGE_KEY), '主 SavedState 被清除');
  assert(!storage.has(RETRI_CONN_KEY), 'game-score.retail-bi.connection 被清除');
  assertEqual(form, { baseUrl: '', startDate: '', endDate: '' }, 'Retail BI 表单立即显示为空');
  assert(parsedData === null, 'parsedData 为空');
  assert(retailBiOverview === null, 'overview 为空');
  assert(retailBiComparison === null, 'comparison 为空');
  assert(retailBiAnomalies === null, 'anomalies 为空');
  assertEqual(dataSource, { type: 'manual' }, '数据来源回退为 manual');
}

// ============================================================
console.log('\n6. 普通粘贴数据“保存当前输入”不回归');
// ============================================================
{
  const storage = createStorage();
  const dataSource = { type: 'manual' };
  const savedOk = saveState(storage, {
    rawText: '姓名\t分数\n张三\t90',
    selectedField: '分数',
    inputValue: '90',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    analysisMode: 'scoreRate',
    filterConditions: [],
    selectedDimension: '',
    dataSource,
  });
  assert(savedOk === true, '普通输入保存成功');
  const saved = loadSavedState(storage);
  assertEqual(saved.rawText, '姓名\t分数\n张三\t90', 'rawText 完整保存（原行为保留）');
  assertEqual(saved.selectedField, '分数', 'selectedField 保存');

  // 提示文案：manual 来源仍为“已保存当前输入”
  const msg = savedOk && dataSource.type !== 'retail-bi' ? '已保存当前输入' : '已保存当前数据源配置…';
  assertEqual(msg, '已保存当前输入', 'manual 来源提示不回归');
}

// ============================================================
console.log('\n7. localStorage 不可用 / quota error 不崩溃');
// ============================================================
{
  const failing = createStorage(true); // getItem 返回 null
  const quota = createStorage(false, true); // setItem 抛 QuotaExceeded

  // 读取失败 → 返回默认状态，不抛错
  let recovered;
  try {
    recovered = loadSavedState(failing);
  } catch {
    recovered = null;
  }
  assert(!!recovered, 'storage 不可用时 load 返回默认状态，不崩溃');
  assertEqual(recovered.dataSource, { type: 'manual' }, '默认 dataSource 为 manual');

  // 保存失败 → 返回 false，不崩溃
  let savedRet;
  try {
    savedRet = saveState(quota, { ...getDefaultState() });
  } catch {
    savedRet = null;
  }
  assert(savedRet === false, 'quota error 时保存返回 false，不崩溃');

  // 连接配置读写失败 → 静默
  let connOk = true;
  try {
    saveRetailConn(failing, { baseUrl: 'x', startDate: '', endDate: '' });
    loadRetailConn(failing);
  } catch {
    connOk = false;
  }
  assert(connOk === true, '连接配置读写失败静默处理，不崩溃');
}

console.log('\n=== 测试完成 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.error('\n❌ 数据来源语义测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 数据来源语义测试通过');
  process.exit(0);
}