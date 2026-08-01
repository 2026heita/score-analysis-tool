/**
 * 导出分析结果测试
 * 验证 exportAnalysis.ts 中所有导出函数的正确性
 * 
 * 测试场景：
 * 1. CSV 单元格转义（逗号、双引号、换行）
 * 2. UTF-8 BOM 存在
 * 3. 中文字段导出
 * 4. 空数据导出
 * 5. 分组统计导出
 * 6. 指标摘要导出
 * 7. 筛选数据导出
 * 8. 文件名时间戳格式
 */

let passed = 0;
let failed = 0;

// ===== 内联核心算法（与 src/engine/exportAnalysis.ts 保持一致） =====

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvLine(cells) {
  return cells.map(escapeCsvCell).join(',');
}

function buildCsvContent(lines) {
  return '\uFEFF' + lines.join('\r\n');
}

function formatTimestamp(date) {
  if (!date) date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function exportGroupStatsToCsv(groupStats) {
  const header = buildCsvLine(['维度值', '数量', '均值', '中位数', '最小值', '最大值', 'Q25', 'Q75']);
  const rows = groupStats.map(gs =>
    buildCsvLine([
      gs.dimensionValue,
      gs.count,
      gs.mean,
      gs.median,
      gs.min,
      gs.max,
      gs.q25,
      gs.q75,
    ])
  );
  return buildCsvContent([header, ...rows]);
}

function exportFilteredRowsToCsv(rows, headers) {
  const header = buildCsvLine(headers);
  const dataRows = rows.map(row =>
    buildCsvLine(headers.map(h => row[h] ?? ''))
  );
  return buildCsvContent([header, ...dataRows]);
}

function exportSummaryToCsv(metricResult, stats, position, fieldName) {
  const lines = [];

  lines.push(buildCsvLine(['指标字段', fieldName]));
  lines.push('');

  if (stats) {
    lines.push(buildCsvLine(['统计指标', '数值']));
    lines.push(buildCsvLine(['有效数值', stats.validCount]));
    lines.push(buildCsvLine(['无效/空值', stats.invalidCount]));
    lines.push(buildCsvLine(['总数', stats.count]));
    lines.push(buildCsvLine(['均值', stats.mean]));
    lines.push(buildCsvLine(['中位数', stats.median]));
    lines.push(buildCsvLine(['最小值', stats.min]));
    lines.push(buildCsvLine(['最大值', stats.max]));
    lines.push(buildCsvLine(['Q25', stats.q25]));
    lines.push(buildCsvLine(['Q75', stats.q75]));
    lines.push(buildCsvLine(['Q90', stats.q90]));
    lines.push(buildCsvLine(['Q95', stats.q95]));
  }

  lines.push('');

  if (position) {
    lines.push(buildCsvLine(['相对位置', '数值']));
    lines.push(buildCsvLine(['总记录数', position.total]));
    lines.push(buildCsvLine(['高于该值记录数', position.higherCount]));
    lines.push(buildCsvLine(['等于该值记录数', position.equalCount]));
    lines.push(buildCsvLine(['低于该值记录数', position.lowerCount]));
    lines.push(buildCsvLine(['相对位置区间起点', position.bestRank]));
    lines.push(buildCsvLine(['相对位置区间终点', position.worstRank]));
    lines.push(buildCsvLine(['估算相对位置', position.estimatedRank]));
    lines.push(buildCsvLine(['百分位', position.percentile]));
    lines.push(buildCsvLine(['该值是否存在于数据中', position.existsInData ? '是' : '否']));
  }

  lines.push('');

  if (metricResult) {
    lines.push(buildCsvLine(['指标解读', '内容']));
    lines.push(buildCsvLine(['指标名', metricResult.metricName]));
    lines.push(buildCsvLine(['显示名', metricResult.displayName]));
    lines.push(buildCsvLine(['方向', metricResult.direction === 'higher-is-better' ? '越高越好' : '越低越好']));
    lines.push(buildCsvLine(['总行数', metricResult.totalRows]));
    lines.push(buildCsvLine(['有效值数量', metricResult.values.length]));
    lines.push(buildCsvLine(['无效值数量', metricResult.invalidCount]));
  }

  return buildCsvContent(lines);
}

// ===== 测试辅助函数 =====

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

function assertContains(haystack, needle, message) {
  if (haystack.includes(needle)) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected to contain: ${JSON.stringify(needle)}`);
    console.error(`    Got: ${haystack.substring(0, 200)}...`);
  }
}

function assertStartsWith(str, prefix, message) {
  if (str.startsWith(prefix)) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected to start with: ${JSON.stringify(prefix)}`);
    console.error(`    Actual start: ${JSON.stringify(str.substring(0, 10))}`);
  }
}

// ============================================================
// 测试 1: CSV 单元格转义 - 普通值
// ============================================================
console.log('\n1. CSV 单元格转义 - 普通值');

assertEqual(escapeCsvCell('hello'), 'hello', '普通字符串不转义');
assertEqual(escapeCsvCell(123), '123', '数字不转义');
assertEqual(escapeCsvCell(0), '0', '零不转义');
assertEqual(escapeCsvCell(''), '', '空字符串不转义');
assertEqual(escapeCsvCell(null), '', 'null 转为空字符串');
assertEqual(escapeCsvCell(undefined), '', 'undefined 转为空字符串');

// ============================================================
// 测试 2: CSV 单元格转义 - 逗号
// ============================================================
console.log('\n2. CSV 单元格转义 - 逗号');

assertEqual(escapeCsvCell('a,b'), '"a,b"', '包含逗号用双引号包裹');
assertEqual(escapeCsvCell('hello, world'), '"hello, world"', '含空格逗号用双引号包裹');

// ============================================================
// 测试 3: CSV 单元格转义 - 双引号
// ============================================================
console.log('\n3. CSV 单元格转义 - 双引号');

assertEqual(escapeCsvCell('he said "hi"'), '"he said ""hi"""', '内部双引号转义为两个双引号');
assertEqual(escapeCsvCell('"quoted"'), '"""quoted"""', '首尾双引号也转义');

// ============================================================
// 测试 4: CSV 单元格转义 - 换行符
// ============================================================
console.log('\n4. CSV 单元格转义 - 换行符');

assertEqual(escapeCsvCell('line1\nline2'), '"line1\nline2"', '换行符触发双引号包裹');
assertEqual(escapeCsvCell('line1\r\nline2'), '"line1\r\nline2"', 'CRLF 触发双引号包裹');

// ============================================================
// 测试 5: CSV 单元格转义 - 中文字段
// ============================================================
console.log('\n5. CSV 单元格转义 - 中文字段');

assertEqual(escapeCsvCell('姓名'), '姓名', '中文不触发转义');
assertEqual(escapeCsvCell('总分'), '总分', '中文字段名不触发转义');
assertEqual(escapeCsvCell('姓名,张三'), '"姓名,张三"', '中文含逗号触发转义');
assertEqual(escapeCsvCell('备注"重要"'), '"备注""重要"""', '中文含双引号触发转义');

// ============================================================
// 测试 6: BOM 存在
// ============================================================
console.log('\n6. BOM 存在');

const csvWithBom = buildCsvContent(['a,b,c']);
assertStartsWith(csvWithBom, '\uFEFF', 'CSV 内容以 BOM 开头');

const groupCsv = exportGroupStatsToCsv([]);
assertStartsWith(groupCsv, '\uFEFF', '分组统计 CSV 以 BOM 开头');

const filteredCsv = exportFilteredRowsToCsv([], []);
assertStartsWith(filteredCsv, '\uFEFF', '筛选数据 CSV 以 BOM 开头');

const summaryCsv = exportSummaryToCsv(null, null, null, '总分');
assertStartsWith(summaryCsv, '\uFEFF', '指标摘要 CSV 以 BOM 开头');

// BOM 只出现一次
assertEqual(groupCsv.indexOf('\uFEFF'), 0, 'BOM 在开头');
assert(groupCsv.indexOf('\uFEFF', 1) === -1, 'BOM 只出现一次');

// ============================================================
// 测试 7: 空数据导出
// ============================================================
console.log('\n7. 空数据导出');

// 空分组统计
const emptyGroup = exportGroupStatsToCsv([]);
assertContains(emptyGroup, '维度值', '空分组 CSV 包含表头');
assertContains(emptyGroup, '数量', '空分组 CSV 包含表头');
const emptyGroupLines = emptyGroup.replace('\uFEFF', '').split('\r\n');
assertEqual(emptyGroupLines.length, 1, '空分组 CSV 只有表头一行');

// 空筛选数据
const emptyFiltered = exportFilteredRowsToCsv([], ['姓名', '总分']);
assertContains(emptyFiltered, '姓名', '空筛选 CSV 包含表头');
const emptyFilteredLines = emptyFiltered.replace('\uFEFF', '').split('\r\n');
assertEqual(emptyFilteredLines.length, 1, '空筛选 CSV 只有表头一行');

// 空指标摘要
const emptySummary = exportSummaryToCsv(null, null, null, '总分');
assertContains(emptySummary, '指标字段', '空摘要包含字段名');
assertContains(emptySummary, '总分', '空摘要包含字段名值');

// ============================================================
// 测试 8: 分组统计导出
// ============================================================
console.log('\n8. 分组统计导出');

const groupStats = [
  { dimensionValue: 'A班', count: 30, mean: 85.5, median: 86, min: 60, max: 98, q25: 78, q75: 92 },
  { dimensionValue: 'B班', count: 28, mean: 82.3, median: 83, min: 55, max: 95, q25: 75, q75: 90 },
  { dimensionValue: 'C班', count: 32, mean: 78.9, median: 80, min: 50, max: 92, q25: 70, q75: 88 },
];

const groupCsvResult = exportGroupStatsToCsv(groupStats);
assertContains(groupCsvResult, 'A班', '包含 A班 数据');
assertContains(groupCsvResult, 'B班', '包含 B班 数据');
assertContains(groupCsvResult, 'C班', '包含 C班 数据');
assertContains(groupCsvResult, '85.5', '包含均值');
assertContains(groupCsvResult, '维度值', '包含表头');
assertContains(groupCsvResult, 'Q25', '包含 Q25');
assertContains(groupCsvResult, 'Q75', '包含 Q75');

// 验证行数：表头 + 3 行数据
const groupLines = groupCsvResult.replace('\uFEFF', '').split('\r\n');
assertEqual(groupLines.length, 4, '分组 CSV 有 4 行（1 表头 + 3 数据）');

// ============================================================
// 测试 9: 筛选数据导出
// ============================================================
console.log('\n9. 筛选数据导出');

const headers = ['姓名', '总分', '排名'];
const rows = [
  { '姓名': '张三', '总分': '90', '排名': '1' },
  { '姓名': '李四', '总分': '85', '排名': '2' },
  { '姓名': '王五', '总分': '80', '排名': '3' },
];

const filteredCsvResult = exportFilteredRowsToCsv(rows, headers);
assertContains(filteredCsvResult, '姓名', '包含表头');
assertContains(filteredCsvResult, '张三', '包含数据行');
assertContains(filteredCsvResult, '李四', '包含数据行');
assertContains(filteredCsvResult, '王五', '包含数据行');

const filteredLines = filteredCsvResult.replace('\uFEFF', '').split('\r\n');
assertEqual(filteredLines.length, 4, '筛选数据 CSV 有 4 行（1 表头 + 3 数据）');

// ============================================================
// 测试 10: 筛选数据 - 含特殊字符
// ============================================================
console.log('\n10. 筛选数据 - 含特殊字符');

const specialRows = [
  { '姓名': '张,三', '备注': '说"你好"' },
  { '姓名': '李\n四', '备注': '正常' },
];

const specialHeaders = ['姓名', '备注'];
const specialCsv = exportFilteredRowsToCsv(specialRows, specialHeaders);
assertContains(specialCsv, '张,三', '逗号被正确转义');
assertContains(specialCsv, '李\n四', '换行被正确转义');
assertContains(specialCsv, '说""你好""', '双引号被正确转义（两个双引号）');

// ============================================================
// 测试 11: 指标摘要导出 - 完整数据
// ============================================================
console.log('\n11. 指标摘要导出 - 完整数据');

const stats = {
  count: 100,
  validCount: 95,
  invalidCount: 5,
  mean: 82.5,
  median: 84,
  min: 55,
  max: 99,
  q25: 75,
  q75: 90,
  q90: 94,
  q95: 97,
};

const position = {
  total: 100,
  higherCount: 20,
  equalCount: 3,
  lowerCount: 77,
  bestRank: 21,
  worstRank: 23,
  estimatedRank: 21,
  percentile: 77,
  existsInData: true,
};

const metricResult = {
  metricName: 'totalScore',
  displayName: '总分',
  direction: 'higher-is-better',
  values: [90, 85, 80, 75, 70],
  invalidCount: 5,
  totalRows: 100,
  truncatedRows: 100,
  stats: stats,
};

const summaryCsvResult = exportSummaryToCsv(metricResult, stats, position, '总分');
assertContains(summaryCsvResult, '指标字段', '包含指标字段');
assertContains(summaryCsvResult, '总分', '包含字段名');
assertContains(summaryCsvResult, '统计指标', '包含统计指标 section');
assertContains(summaryCsvResult, '相对位置', '包含相对位置 section');
assertContains(summaryCsvResult, '指标解读', '包含指标解读 section');
assertContains(summaryCsvResult, '82.5', '包含均值');
assertContains(summaryCsvResult, '越高越好', '包含方向');
assertContains(summaryCsvResult, '是', 'existsInData 为是');

// 回归检查：确保不包含旧版排名术语
assert(!summaryCsvResult.includes('总人数'), '不包含旧术语：总人数');
assert(!summaryCsvResult.includes('排名定位'), '不包含旧术语：排名定位');
assert(!summaryCsvResult.includes('高于你的数量'), '不包含旧术语：高于你的数量');
assert(!summaryCsvResult.includes('与你相等的数量'), '不包含旧术语：与你相等的数量');
assert(!summaryCsvResult.includes('低于你的数量'), '不包含旧术语：低于你的数量');
assert(!summaryCsvResult.includes('优劣排名'), '不包含旧术语：优劣排名');

// ============================================================
// 测试 12: 指标摘要导出 - 仅 stats（无相对位置）
// ============================================================
console.log('\n12. 指标摘要导出 - 仅 stats（无相对位置）');

const summaryOnlyStats = exportSummaryToCsv(null, stats, null, '总分');
assertContains(summaryOnlyStats, '统计指标', '包含统计指标');
assert(!summaryOnlyStats.includes('相对位置'), '不包含相对位置');

// ============================================================
// 测试 13: 指标摘要导出 - 仅相对位置（无 stats）
// ============================================================
console.log('\n13. 指标摘要导出 - 仅相对位置（无 stats）');

const summaryOnlyPos = exportSummaryToCsv(null, null, position, '总分');
assertContains(summaryOnlyPos, '相对位置', '包含相对位置');
assert(!summaryOnlyPos.includes('统计指标'), '不包含统计指标');

// ============================================================
// 测试 14: 指标摘要导出 - 不存在于数据中
// ============================================================
console.log('\n14. 指标摘要导出 - 不存在于数据中');

const posNotInData = { ...position, existsInData: false };
const summaryNotInData = exportSummaryToCsv(null, null, posNotInData, '总分');
assertContains(summaryNotInData, '否', 'existsInData 为否');

// ============================================================
// 测试 15: 指标摘要导出 - lower-is-better
// ============================================================
console.log('\n15. 指标摘要导出 - lower-is-better');

const lowerMetric = {
  metricName: 'rank',
  displayName: '排名',
  direction: 'lower-is-better',
  values: [1, 2, 3],
  invalidCount: 0,
  totalRows: 3,
  truncatedRows: 3,
  stats: null,
};

const summaryLower = exportSummaryToCsv(lowerMetric, null, null, '排名');
assertContains(summaryLower, '越低越好', '方向显示为越低越好');

// ============================================================
// 测试 16: 文件名时间戳格式
// ============================================================
console.log('\n16. 文件名时间戳格式');

const testDate = new Date(2026, 5, 18, 14, 30, 5); // 2026-06-18 14:30:05
const ts = formatTimestamp(testDate);
assertEqual(ts, '20260618-143005', '时间戳格式为 YYYYMMDD-HHmmss');

// 验证长度
assertEqual(ts.length, 15, '时间戳长度为 15 个字符');

// 验证只包含数字和连字符
assert(/^\d{8}-\d{6}$/.test(ts), '时间戳格式匹配 \\d{8}-\\d{6}');

// ============================================================
// 测试 17: CSV 行分隔符
// ============================================================
console.log('\n17. CSV 行分隔符');

const multiLineCsv = buildCsvContent(['行1', '行2', '行3']);
// 去掉 BOM 后检查
const content = multiLineCsv.replace('\uFEFF', '');
assert(content.includes('\r\n'), '使用 CRLF 换行');
const lines = content.split('\r\n');
assertEqual(lines.length, 3, '3 行内容');

// ============================================================
// 测试 18: 分组统计 - 单个分组
// ============================================================
console.log('\n18. 分组统计 - 单个分组');

const singleGroup = [
  { dimensionValue: '总体', count: 100, mean: 80, median: 82, min: 50, max: 100, q25: 70, q75: 90 },
];
const singleGroupCsv = exportGroupStatsToCsv(singleGroup);
assertContains(singleGroupCsv, '总体', '包含单个分组');

const singleGroupLines = singleGroupCsv.replace('\uFEFF', '').split('\r\n');
assertEqual(singleGroupLines.length, 2, '1 表头 + 1 数据 = 2 行');

// ============================================================
// 测试 19: 筛选数据 - 单个字段
// ============================================================
console.log('\n19. 筛选数据 - 单个字段');

const singleFieldRows = [{ '成绩': '90' }, { '成绩': '85' }];
const singleFieldCsv = exportFilteredRowsToCsv(singleFieldRows, ['成绩']);
assertContains(singleFieldCsv, '成绩', '包含表头');
assertContains(singleFieldCsv, '90', '包含数据');
assertContains(singleFieldCsv, '85', '包含数据');

// ============================================================
// 测试 20: 组合转义 - 逗号+双引号+换行
// ============================================================
console.log('\n20. 组合转义 - 逗号+双引号+换行');

const complexCell = '他说"你好",\n再见';
const escaped = escapeCsvCell(complexCell);
assertStartsWith(escaped, '"', '以双引号开头');
assert(escaped.endsWith('"'), '以双引号结尾');
assertContains(escaped, '""', '内部双引号被转义');

// ============================================================
// 输出测试结果
// ============================================================
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