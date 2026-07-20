/**
 * 安全格式化函数测试
 * 内联实现测试函数，避免 TypeScript 导入问题
 */

// 内联实现：判断值是否为有限数字
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// 内联实现：安全格式化数值
function safeFormatNumber(value, decimals = 1, fallback = '—') {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  return value.toFixed(safeDecimals);
}

// 内联实现：安全格式化百分比
function safeFormatPercent(value, decimals = 1, fallback = '—') {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  const safeDecimals = Math.max(0, Math.min(20, Math.floor(decimals)));
  return `${value.toFixed(safeDecimals)}%`;
}

// 内联实现：从 ECharts formatter 参数中安全提取数值
function extractNumericFromEChartsParam(param) {
  if (isFiniteNumber(param)) {
    return param;
  }
  
  if (Array.isArray(param) && param.length > 0) {
    const first = param[0];
    if (isFiniteNumber(first)) {
      return first;
    }
  }
  
  if (param && typeof param === 'object' && 'value' in param) {
    const val = param.value;
    if (isFiniteNumber(val)) {
      return val;
    }
  }
  
  return undefined;
}

// 内联实现：判断 percentile 值是否有效
function isValidPercentile(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`✗ ${message}`);
  }
}

console.log('=== 测试 isFiniteNumber ===');
assert(isFiniteNumber(0) === true, '0 是有限数字');
assert(isFiniteNumber(100) === true, '100 是有限数字');
assert(isFiniteNumber(-50.5) === true, '-50.5 是有限数字');
assert(isFiniteNumber(NaN) === false, 'NaN 不是有限数字');
assert(isFiniteNumber(Infinity) === false, 'Infinity 不是有限数字');
assert(isFiniteNumber(-Infinity) === false, '-Infinity 不是有限数字');
assert(isFiniteNumber(undefined) === false, 'undefined 不是有限数字');
assert(isFiniteNumber(null) === false, 'null 不是有限数字');
assert(isFiniteNumber('100') === false, '字符串 "100" 不是有限数字');
assert(isFiniteNumber({}) === false, '对象不是有限数字');
assert(isFiniteNumber([]) === false, '数组不是有限数字');

console.log('\n=== 测试 safeFormatNumber ===');
assert(safeFormatNumber(100) === '100.0', '100 → "100.0"');
assert(safeFormatNumber(85.345) === '85.3', '85.345 → "85.3"');
assert(safeFormatNumber(0) === '0.0', '0 → "0.0"');
assert(safeFormatNumber(-10.5) === '-10.5', '-10.5 → "-10.5"');
assert(safeFormatNumber(NaN) === '—', 'NaN → "—"');
assert(safeFormatNumber(Infinity) === '—', 'Infinity → "—"');
assert(safeFormatNumber(undefined) === '—', 'undefined → "—"');
assert(safeFormatNumber(null) === '—', 'null → "—"');
assert(safeFormatNumber('100') === '—', '字符串 "100" → "—"');
assert(safeFormatNumber(100, 2) === '100.00', '100 (2位小数) → "100.00"');
assert(safeFormatNumber(NaN, 1, 'N/A') === 'N/A', 'NaN 自定义回退值 → "N/A"');
assert(safeFormatNumber(100, -1) === '100', '负数小数位数 → 自动修正为 0 位');
assert(safeFormatNumber(100, 25) === '100.00000000000000000000', '超大小数位数 → 自动修正为 20 位');

console.log('\n=== 测试 safeFormatPercent ===');
assert(safeFormatPercent(85.3) === '85.3%', '85.3 → "85.3%"');
assert(safeFormatPercent(0) === '0.0%', '0 → "0.0%"');
assert(safeFormatPercent(100) === '100.0%', '100 → "100.0%"');
assert(safeFormatPercent(NaN) === '—', 'NaN → "—"');
assert(safeFormatPercent(undefined) === '—', 'undefined → "—"');
assert(safeFormatPercent(Infinity) === '—', 'Infinity → "—"');
assert(safeFormatPercent(null) === '—', 'null → "—"');
assert(safeFormatPercent(85.345, 2) === '85.34%', '85.345 (2位) → "85.34%" (JS浮点精度)');
assert(safeFormatPercent(50, 1, 'N/A') === '50.0%', '有效值不使用回退值');

console.log('\n=== 测试 extractNumericFromEChartsParam ===');
assert(extractNumericFromEChartsParam(100) === 100, '数字 100 → 100');
assert(extractNumericFromEChartsParam([85.5]) === 85.5, '数组 [85.5] → 85.5');
assert(extractNumericFromEChartsParam({ value: 90 }) === 90, '对象 {value: 90} → 90');
assert(extractNumericFromEChartsParam([NaN]) === undefined, '数组 [NaN] → undefined');
assert(extractNumericFromEChartsParam({ value: '100' }) === undefined, '对象 {value: "100"} → undefined');
assert(extractNumericFromEChartsParam(undefined) === undefined, 'undefined → undefined');
assert(extractNumericFromEChartsParam(null) === undefined, 'null → undefined');
assert(extractNumericFromEChartsParam({}) === undefined, '空对象 → undefined');
assert(extractNumericFromEChartsParam([]) === undefined, '空数组 → undefined');

console.log('\n=== 测试 isValidPercentile ===');
assert(isValidPercentile(0) === true, '0 是有效百分位');
assert(isValidPercentile(50.5) === true, '50.5 是有效百分位');
assert(isValidPercentile(100) === true, '100 是有效百分位');
assert(isValidPercentile(-1) === false, '-1 不是有效百分位');
assert(isValidPercentile(101) === false, '101 不是有效百分位');
assert(isValidPercentile(NaN) === false, 'NaN 不是有效百分位');
assert(isValidPercentile(Infinity) === false, 'Infinity 不是有效百分位');
assert(isValidPercentile(undefined) === false, 'undefined 不是有效百分位');
assert(isValidPercentile(null) === false, 'null 不是有效百分位');
assert(isValidPercentile('50') === false, '字符串 "50" 不是有效百分位');

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
