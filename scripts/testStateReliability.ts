/**
 * 阶段 27：状态可靠性专项测试
 *
 * 覆盖：
 * 1. 保存函数是否真实返回成功/失败（saveState → boolean）
 * 2. localStorage.setItem 抛 QuotaExceededError → saveState 必须返回 false（不能假成功）
 * 3. 恢复时的最低限度结构校验：
 *    - 非法 JSON
 *    - 合法 JSON 但明显错误结构（[] / "hello" / {} / {"rows":"abc"} / {"headers":123}）
 *    - 正常历史状态仍能恢复
 * 4. 解析层：错误输入 new 必须真实抛错（供 useParsedTable 清除旧分析的 catch 触发）
 *
 * 说明：useParsedTable 的 React 状态清除逻辑无法在本仓库（无 jsdom/testing-library）
 * 直接做 Hook 级单测，因此这里验证其依赖的两条纯链路：
 *   - 错误输入确实抛错（触发 hook 的 catch → clearParseState + setParseError）
 *   - 存储层真实返回成功/失败并做结构校验
 */

import {
  saveState,
  loadSavedState,
  isValidSavedState,
  getDefaultState,
} from '../src/utils/storage.js';
import { parseTableText } from '../src/utils/parseTable.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log('  ok ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

// ---- 内存版 localStorage mock ----
let failSet = false;
const memory = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (failSet) throw new DOMException('模拟容量不足', 'QuotaExceededError');
    memory.set(k, v);
  },
  removeItem: (k: string) => { memory.delete(k); },
};
(globalThis as any).localStorage = mockStorage;

const legalStateJSON = JSON.stringify({
  version: 3,
  rawText: '商品\tGMV\nA\t36000',
  selectedField: '',
  inputValue: '',
  showAllFields: false,
  activeChartTab: 'histogram',
  originalFieldRadar: { selections: [], viewMode: 'bar' },
  analysisMode: 'scoreRate',
  filterConditions: [],
  selectedDimension: '',
});

console.log('=== 阶段27 状态可靠性测试 ===');

console.log('1. saveState 真实返回成功/失败');
{
  failSet = false; memory.clear();
  ok(saveState({ rawText: 'x', selectedField: '', inputValue: '', showAllFields: false, activeChartTab: 'histogram', originalFieldRadar: { selections: [], viewMode: 'bar' }, analysisMode: 'scoreRate' } as any) === true, '正常写入返回 true');
}

console.log('2. QuotaExceededError → saveState 必须返回 false');
{
  failSet = true; memory.clear();
  ok(saveState({ rawText: 'x', selectedField: '', inputValue: '', showAllFields: false, activeChartTab: 'histogram', originalFieldRadar: { selections: [], viewMode: 'bar' }, analysisMode: 'scoreRate' } as any) === false, 'setItem 抛 QuotaExceeded → 返回 false（不假成功）');
  failSet = false; memory.clear();
}

console.log('3. 空 localStorage → 默认空白状态');
{
  memory.clear();
  const d = loadSavedState();
  ok(d.rawText === '' && d.version === 3, '空存储返回默认空白状态');
}

console.log('4. 非法 JSON → 安全回到默认');
{
  memory.set('score_analyzer_state', '{not valid json');
  const d = loadSavedState();
  ok(d.rawText === '' , '非法 JSON 返回默认');
}

console.log('5. 合法 JSON 但明显错误结构 → 忽略并回默认');
{
  const bad: Array<[string, string]> = [
    ['[]', '空数组'],
    ['"hello"', '字符串'],
    ['{}', '空对象'],
    ['{"rows":"abc"}', '缺关键字段 rows'],
    ['{"headers":123}', '缺关键字段 headers'],
    ['{"rawText":123,"selectedField":"","inputValue":"","showAllFields":false,"activeChartTab":"histogram"}', 'rawText 类型错误'],
  ];
  for (const [json, label] of bad) {
    memory.set('score_analyzer_state', json);
    const d = loadSavedState();
    ok(d.rawText === '', '错误结构「' + label + '」返回默认');
  }
  memory.clear();
}

console.log('6. 正常历史状态仍能恢复');
{
  memory.set('score_analyzer_state', legalStateJSON);
  const d = loadSavedState();
  ok(d.rawText === '商品\tGMV\nA\t36000', '历史状态 rawText 恢复');
  ok(Array.isArray(d.filterConditions), '迁移后 filterConditions 为数组');
  ok(d.originalFieldRadar && Array.isArray(d.originalFieldRadar.selections), 'originalFieldRadar 恢复');
}

console.log('7. isValidSavedState 单元校验');
{
  ok(isValidSavedState(JSON.parse(legalStateJSON)) === true, '合法状态通过校验');
  ok(isValidSavedState({}) === false, '{} 不通过');
  ok(isValidSavedState([]) === false, '[] 不通过');
  ok(isValidSavedState('hello') === false, '字符串不通过');
  ok(isValidSavedState({ rows: 'abc' }) === false, '缺关键字段不通过');
  ok(isValidSavedState({ ...JSON.parse(legalStateJSON), rawText: 123 }) === false, 'rawText 非字符串不通过');
  ok(isValidSavedState(null) === false, 'null 不通过');
}

console.log('8. 解析层：错误输入必须真实抛错（触发旧分析清除）');
{
  let threw = false;
  try { parseTableText('这是一个没有任何有效表头和数据结构的输入'); } catch { threw = true; }
  ok(threw, '错误输入 B 使 parseTableText 抛错（hook 的 catch 会清除旧分析）');
}

console.log('通过: ' + passed + ' 失败: ' + failed);
if (failed > 0) { console.log('失败: ' + failures.join('; ')); process.exit(1); }
else { console.log('ALL PASS'); process.exit(0); }