/**
 * 真实源码回归测试：通用 vs legacy 教育边界
 *
 * 目标：
 * 1. 非教育数据（零售/库存/网站/中文业务数据/小整数）在 generic 模式下，
 *    不得被解释为 课程成绩(courseScore) / 总分(primaryTotal) / 排名(rank)。
 * 2. 中文 + 数值 的字段名，不再因"中文字段名 + 数值"而自动判为成绩。
 * 3. lower_is_better 不等于 rank（responseTimeMs 是 metric，不是 rank）。
 * 4. 教育 legacy 数据在明确 education 语义下仍可识别（兼容未被破坏）。
 *
 * 运行：npm --prefix . run test:integration（或见 run-integration-tests.ps1）
 */
import { inferGenericFieldSchema } from '../../src/field-schema/inferGenericSchema.js';
import { resolveFieldSchemas } from '../../src/field-schema/resolveFieldSchema.js';
import { classifyFields } from '../../src/utils/tableParser/fieldClassifier.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${details ? ': ' + details : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

function col(rows: Record<string, string>[], h: string): string[] {
  return rows.map(r => r[h] ?? '');
}

// ============================================================
// A. 零售数据：date,totalSales,totalOrders,totalCustomers,avgOrderValue
//    通用 schema 推断：date->time，其余业务数值->metric
// ============================================================
console.log('=== A. 零售数据（generic schema 推断）===');
const retailRows = [
  { date: '2026-01-01', totalSales: '1200', totalOrders: '80', totalCustomers: '70', avgOrderValue: '15' },
  { date: '2026-01-02', totalSales: '1350', totalOrders: '85', totalCustomers: '76', avgOrderValue: '15.9' },
  { date: '2026-01-03', totalSales: '980', totalOrders: '60', totalCustomers: '55', avgOrderValue: '16.3' },
];
const retailHeaders = ['date', 'totalSales', 'totalOrders', 'totalCustomers', 'avgOrderValue'];
const retailSchema = resolveFieldSchemas(retailHeaders, null, { mode: 'generic', rows: retailRows });
const retailById: Record<string, typeof retailSchema[number]> = {};
retailHeaders.forEach((h, i) => { retailById[h] = retailSchema[i]; });

assert('A1: date -> time', retailById.date.analysisRole === 'time', `actual=${retailById.date.analysisRole}`);
assert('A2: totalSales -> metric', retailById.totalSales.analysisRole === 'metric', `actual=${retailById.totalSales.analysisRole}`);
assert('A3: totalOrders -> metric', retailById.totalOrders.analysisRole === 'metric', `actual=${retailById.totalOrders.analysisRole}`);
assert('A4: totalCustomers -> metric', retailById.totalCustomers.analysisRole === 'metric', `actual=${retailById.totalCustomers.analysisRole}`);
assert('A5: avgOrderValue -> metric', retailById.avgOrderValue.analysisRole === 'metric', `actual=${retailById.avgOrderValue.analysisRole}`);
assert('A6: 绝不出现 courseScore', retailSchema.every(s => s.analysisRole !== 'courseScore'));
assert('A7: 绝不出现 primaryTotal', retailSchema.every(s => s.analysisRole !== 'primaryTotal'));
assert('A8: 绝不出现 rank', retailSchema.every(s => s.analysisRole !== 'rank'));

// ============================================================
// B. 库存数据：sku,productName,stockQuantity,reorderLevel,unitCost
// ============================================================
console.log('\n=== B. 库存数据 ===');
const invRows = [
  { sku: 'SKU-001', productName: '无线鼠标', stockQuantity: '120', reorderLevel: '20', unitCost: '45.5' },
  { sku: 'SKU-002', productName: '机械键盘', stockQuantity: '40', reorderLevel: '10', unitCost: '150.0' },
  { sku: 'SKU-003', productName: '显示器', stockQuantity: '15', reorderLevel: '5', unitCost: '899.0' },
];
const invHeaders = ['sku', 'productName', 'stockQuantity', 'reorderLevel', 'unitCost'];
const invSchema = resolveFieldSchemas(invHeaders, null, { mode: 'generic', rows: invRows });
const invById: Record<string, typeof invSchema[number]> = {};
invHeaders.forEach((h, i) => { invById[h] = invSchema[i]; });

assert('B1: sku -> identifier', invById.sku.analysisRole === 'identifier', `actual=${invById.sku.analysisRole}`);
assert('B2: stockQuantity -> metric', invById.stockQuantity.analysisRole === 'metric', `actual=${invById.stockQuantity.analysisRole}`);
assert('B3: reorderLevel -> metric', invById.reorderLevel.analysisRole === 'metric', `actual=${invById.reorderLevel.analysisRole}`);
assert('B4: unitCost -> metric', invById.unitCost.analysisRole === 'metric', `actual=${invById.unitCost.analysisRole}`);
assert('B5: 无 courseScore/primaryTotal/rank', invSchema.every(s => !['courseScore', 'primaryTotal', 'rank'].includes(s.analysisRole)));

// ============================================================
// C. 网站访问：timestamp,path,statusCode,responseTimeMs,requests
//    responseTimeMs: metric，允许人工设置 lower_is_better，但绝不因方向变 rank
// ============================================================
console.log('\n=== C. 网站访问数据 ===');
const webRows = [
  { timestamp: '2026-08-01 10:00', path: '/home', statusCode: '200', responseTimeMs: '120', requests: '5000' },
  { timestamp: '2026-08-01 10:01', path: '/cart', statusCode: '200', responseTimeMs: '240', requests: '1200' },
  { timestamp: '2026-08-01 10:02', path: '/checkout', statusCode: '500', responseTimeMs: '980', requests: '300' },
];
const webHeaders = ['timestamp', 'path', 'statusCode', 'responseTimeMs', 'requests'];
const webSchema = resolveFieldSchemas(webHeaders, null, { mode: 'generic', rows: webRows });
const webById: Record<string, typeof webSchema[number]> = {};
webHeaders.forEach((h, i) => { webById[h] = webSchema[i]; });

assert('C1: responseTimeMs -> metric', webById.responseTimeMs.analysisRole === 'metric', `actual=${webById.responseTimeMs.analysisRole}`);
assert('C2: requests -> metric', webById.requests.analysisRole === 'metric', `actual=${webById.requests.analysisRole}`);
assert('C3: responseTimeMs 不是 rank', webById.responseTimeMs.analysisRole !== 'rank');
// C4: 人工把 direction 设为 lower_is_better 后，字段角色仍是 metric（不是 rank）
const manualDirection = resolveFieldSchemas(
  webHeaders,
  null,
  {
    mode: 'generic',
    rows: webRows,
    legacyFieldMetas: undefined,
  }
);
assert('C4: 默认方向为 unspecified', manualDirection.find(s => s.fieldId === 'responseTimeMs')?.metricDirection === 'unspecified',
  `actual=${manualDirection.find(s => s.fieldId === 'responseTimeMs')?.metricDirection}`);

// ============================================================
// D. 中文业务数据：门店,销售额,订单数,客单价,库存量
//    重点：中文 + 数值 不得判为成绩
// ============================================================
console.log('\n=== D. 中文业务数据（parse 层 + generic schema）===');
const zhRows = [
  { 门店: '上海店', 销售额: '12000', 订单数: '800', 客单价: '150', 库存量: '300' },
  { 门店: '北京店', 销售额: '9800', 订单数: '700', 客单价: '140', 库存量: '250' },
  { 门店: '广州店', 销售额: '15000', 订单数: '1000', 客单价: '150', 库存量: '420' },
];
const zhHeaders = ['门店', '销售额', '订单数', '客单价', '库存量'];
const zhFieldMetas = classifyFields(zhHeaders, zhRows);
const zhMetaById: Record<string, { type: string; analysisRole: string }> = {};
zhFieldMetas.forEach(m => { zhMetaById[m.header] = { type: m.type, analysisRole: m.analysisRole }; });

assert('D1: 销售额 不是 score', zhMetaById['销售额'].type !== 'score', `type=${zhMetaById['销售额'].type}`);
assert('D2: 销售额 不是 courseScore', zhMetaById['销售额'].analysisRole !== 'courseScore', `role=${zhMetaById['销售额'].analysisRole}`);
assert('D3: 订单数 不是 score', zhMetaById['订单数'].type !== 'score', `type=${zhMetaById['订单数'].type}`);
assert('D4: 客单价 不是 score', zhMetaById['客单价'].type !== 'score', `type=${zhMetaById['客单价'].type}`);
assert('D5: 库存量 不是 score', zhMetaById['库存量'].type !== 'score', `type=${zhMetaById['库存量'].type}`);

const zhSchema = resolveFieldSchemas(zhHeaders, null, { mode: 'generic', rows: zhRows });
const zhById: Record<string, typeof zhSchema[number]> = {};
zhHeaders.forEach((h, i) => { zhById[h] = zhSchema[i]; });
assert('D6: 销售额 -> metric', zhById['销售额'].analysisRole === 'metric', `actual=${zhById['销售额'].analysisRole}`);
assert('D7: 门店 -> dimension', zhById['门店'].analysisRole === 'dimension', `actual=${zhById['门店'].analysisRole}`);
assert('D8: generic 绝不出现 courseScore/primaryTotal', zhSchema.every(s => !['courseScore', 'primaryTotal'].includes(s.analysisRole)));

// ============================================================
// E. 1..N 小整数：优先级/等级/编号 不得自动解释为"排名"
// ============================================================
console.log('\n=== E. 小整数列（优先级/等级/编号）===');
const seqRows = [
  { 优先级: '1', 库存等级: '1', 门店编号: '1' },
  { 优先级: '2', 库存等级: '2', 门店编号: '2' },
  { 优先级: '3', 库存等级: '3', 门店编号: '3' },
  { 优先级: '4', 库存等级: '4', 门店编号: '4' },
];
const seqHeaders = ['优先级', '库存等级', '门店编号'];
const seqMetas = classifyFields(seqHeaders, seqRows);
const seqMetaById: Record<string, { type: string; analysisRole: string }> = {};
seqMetas.forEach(m => { seqMetaById[m.header] = { type: m.type, analysisRole: m.analysisRole }; });

assert('E1: 优先级 不是 rank', seqMetaById['优先级'].type !== 'rank', `type=${seqMetaById['优先级'].type}`);
assert('E2: 库存等级 不是 rank', seqMetaById['库存等级'].type !== 'rank', `type=${seqMetaById['库存等级'].type}`);
assert('E3: 门店编号 不是 rank', seqMetaById['门店编号'].type !== 'rank', `type=${seqMetaById['门店编号'].type}`);
assert('E4: 优先级(内容结构) 不是 rank', inferGenericFieldSchema('优先级', col(seqRows, '优先级')).analysisRole !== 'rank');

// ============================================================
// F. 教育 legacy 数据：姓名,班级,语文,数学,总分,班级排名
//    明确 education 语义下仍可识别，证明兼容未破坏
// ============================================================
console.log('\n=== F. 教育 legacy 数据（明确 education 兼容）===');
const eduRows = [
  { 姓名: '张三', 班级: '1班', 语文: '90', 数学: '85', 总分: '500', 班级排名: '1' },
  { 姓名: '李四', 班级: '1班', 语文: '80', 数学: '90', 总分: '480', 班级排名: '2' },
  { 姓名: '王五', 班级: '2班', 语文: '88', 数学: '95', 总分: '520', 班级排名: '3' },
];
const eduHeaders = ['姓名', '班级', '语文', '数学', '总分', '班级排名'];
const eduMetas = classifyFields(eduHeaders, eduRows);
const eduMetaById: Record<string, { type: string; analysisRole: string }> = {};
eduMetas.forEach(m => { eduMetaById[m.header] = { type: m.type, analysisRole: m.analysisRole }; });

assert('F1: 姓名 -> identity', eduMetaById['姓名'].type === 'identity', `type=${eduMetaById['姓名'].type}`);
assert('F2: 语文 -> courseScore', eduMetaById['语文'].analysisRole === 'courseScore', `role=${eduMetaById['语文'].analysisRole}`);
assert('F3: 数学 -> courseScore', eduMetaById['数学'].analysisRole === 'courseScore', `role=${eduMetaById['数学'].analysisRole}`);
assert('F4: 总分 -> primaryTotal', eduMetaById['总分'].analysisRole === 'primaryTotal', `role=${eduMetaById['总分'].analysisRole}`);
assert('F5: 班级排名 -> rank', eduMetaById['班级排名'].analysisRole === 'rank', `role=${eduMetaById['班级排名'].analysisRole}`);

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}