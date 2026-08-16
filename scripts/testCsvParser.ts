/**
 * 第十四阶段：CSV 引号感知解析回归测试
 * 直接导入真实生产 parser 验证，不复制算法。
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testCsvParser.ts
 */
import {
  parseCsvText,
  parseCsvLine,
  countUnquotedChar,
  detectDelimiter,
  splitLine,
  parseRawRows,
} from '../src/utils/tableParser/index.js';
import { parseTableText } from '../src/utils/parseTable.js';
import { parseNumericValueLegacy } from '../src/utils/tableParser/numericParser.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function assertDeepEqual(actual: any, expected: any, name: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, name, `actual=${a} expected=${e}`);
}

console.log('=== 第十四阶段：CSV 引号感知解析回归测试 ===\n');

// ===== 1. 普通 CSV =====
console.log('1. 普通 CSV');
{
  const r = parseTableText('姓名,数学,英语\n张三,90,95\n李四,88,92');
  assertDeepEqual(r.headers, ['姓名', '数学', '英语'], '表头识别正确');
  assert(r.rows.length === 2, '两行数据', `rows=${r.rows.length}`);
}

// ===== 2. quoted comma =====
console.log('\n2. quoted comma');
{
  const r = parseTableText('姓名,描述,总分\n张三,"优秀,稳定",100');
  assertDeepEqual(r.headers, ['姓名', '描述', '总分'], '表头 3 列');
  assert(r.rows.length === 1, '一行数据');
  const row = r.rows[0];
  assert(row['描述'] === '优秀,稳定', '描述含逗号保持为一个单元格', `描述=${row['描述']}`);
  assert(row['总分'] === '100', '总分=100');
  // 直接检查 splitLine 引号感知
  const parts = splitLine('张三,"优秀,稳定",100', 'comma');
  assertDeepEqual(parts, ['张三', '优秀,稳定', '100'], 'splitLine 引号感知 3 列');
}

// ===== 3. quoted 千分位 =====
console.log('\n3. quoted 千分位');
{
  const r = parseTableText('姓名,金额\n张三,"1,234"\n李四,"2,500.50"');
  assert(r.rows.length === 2, '两行数据');
  const v1 = parseNumericValueLegacy(r.rows[0]['金额']);
  const v2 = parseNumericValueLegacy(r.rows[1]['金额']);
  assert(v1 === 1234, '张三金额=1234', `got=${v1}`);
  assert(v2 === 2500.5, '李四金额=2500.5', `got=${v2}`);
  // 单元格保持字符串 "1,234"，由 numericParser 转换
  assert(r.rows[0]['金额'] === '1,234', '单元格保持为 "1,234" 字符串');
}

// ===== 4. escaped quote =====
console.log('\n4. escaped quote');
{
  const r = parseTableText('姓名,描述\n张三,"他说""优秀"""');
  assert(r.rows.length === 1, '一行数据');
  assert(r.rows[0]['描述'] === '他说"优秀"', '"" 转义为 "', `描述=${r.rows[0]['描述']}`);
}

// ===== 5. 无引号歧义 =====
console.log('\n5. 无引号歧义（不猜测、不静默错列）');
{
  // splitLine 层：不启发式合并，拆成 3 列
  const parts = splitLine('张三,1,234', 'comma');
  assertDeepEqual(parts, ['张三', '1', '234'], '无引号千分位拆为 3 列（不拼接）');
  // parseTableText 层：含一条合法 + 一条错列行，错列行被排除并给 warning
  const r = parseTableText('姓名,金额\n李四,500\n张三,1,234');
  assert(r.rows.length === 1, '仅保留合法行(李四)', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '李四', '保留的是李四');
  const hasColWarning = (r.warnings || []).some(w =>
    w.includes('列数与表头不一致') || w.includes('多于表头') || w.includes('已跳过该行')
  );
  assert(hasColWarning, '存在列数不一致的 warning', `warnings=${JSON.stringify(r.warnings)}`);
}

// ===== 6. 未闭合引号 =====
console.log('\n6. 未闭合引号');
{
  const raw = parseCsvText('姓名,描述\n张三,"优秀,稳定', ',');
  const hasWarn = raw.warnings.some(w => w.includes('未闭合'));
  assert(hasWarn, 'parseCsvText 返回未闭合引号 warning', `warnings=${JSON.stringify(raw.warnings)}`);
  // 整段 parseTableText 也应带出该 warning
  const r = parseTableText('姓名,描述\n张三,"优秀,稳定');
  const hasUnclosedWarn = (r.warnings || []).some(w => w.includes('未闭合'));
  assert(hasUnclosedWarn, 'parseTableText 透传未闭合引号 warning');
}

// ===== 7. CRLF =====
console.log('\n7. CRLF');
{
  const r = parseTableText('姓名,总分\r\n张三,90\r\n李四,85\r\n');
  assert(r.rows.length === 2, '两行数据');
  assert(r.rows[0]['总分'] === '90', '总分无 \\r 残留', `总分="[${r.rows[0]['总分']}]"`);
  assert(!r.rows[0]['总分'].includes('\r'), '无 \\r 残留');
  const raw = parseCsvText('姓名,总分\r\n张三,90\r\n', ',');
  assertDeepEqual(raw.rows, [['姓名', '总分'], ['张三', '90']], 'CRLF 解析为 2 行');
}

// ===== 8. Tab 回归 =====
console.log('\n8. Tab 回归');
{
  const r = parseTableText('姓名\t金额\n张三\t1,234');
  assert(r.rows.length === 1, '一行数据');
  const v = parseNumericValueLegacy(r.rows[0]['金额']);
  assert(v === 1234, 'Tab 下 1,234 解析为 1234', `got=${v}`);
}

// ===== 9. quoted newline =====
console.log('\n9. quoted newline');
{
  const raw = parseCsvText('姓名,描述,总分\n张三,"优秀\n稳定",100', ',');
  assert(raw.rows.length === 2, '保持一个逻辑记录（2 行：表头+1数据）', `rows=${raw.rows.length}`);
  assert(raw.rows[1][1] === '优秀\n稳定', '引号内换行保留', `描述=[${JSON.stringify(raw.rows[1][1])}]`);
  // 经 parseTableText 也应保持单条数据
  const r = parseTableText('姓名,描述,总分\n张三,"优秀\n稳定",100');
  assert(r.rows.length === 1, 'parseTableText 保持一个逻辑记录', `rows=${r.rows.length}`);
}

// ===== 10. detectDelimiter 引号感知 =====
console.log('\n10. detectDelimiter 引号感知');
{
  // "张三,\"优秀,稳定\",100" 引号内只有 2 个真正分隔符
  assert(countUnquotedChar('张三,"优秀,稳定",100', ',') === 2, '引号内逗号不计入分隔符');
  assert(detectDelimiter('张三,"优秀,稳定",100') === 'comma', '仍识别为 comma');
  assert(detectDelimiter('姓名,金额') === 'comma', '表头识别为 comma');
}

// ===== 11. 行宽校验：少列补空 + warning，多列排除 =====
console.log('\n11. 行宽校验');
{
  // 少列：补空 + warning
  const short = parseTableText('姓名,数学,英语\n张三,90');
  assert(short.rows.length === 1, '少列行保留');
  assert(short.rows[0]['英语'] === '', '缺失列补空', `英语=[${short.rows[0]['英语']}]`);
  const hasShortWarn = (short.warnings || []).some(w => w.includes('少于表头') || w.includes('补空'));
  assert(hasShortWarn, '少列存在补空 warning', `warnings=${JSON.stringify(short.warnings)}`);
  // 多列：排除 + warning
  const long = parseTableText('姓名,金额\n李四,500\n张三,1,234');
  const hasLongWarn = (long.warnings || []).some(w => w.includes('多于表头') || w.includes('已跳过该行'));
  assert(hasLongWarn, '多列存在排除 warning');
}

// ===== 第十三阶段 S18/S19 回归 =====
console.log('\n12. 第十三阶段 S18/S19 回归');
{
  // S18: quoted comma 不再错列
  const parts = splitLine('张三,"优秀,稳定",100', 'comma');
  assertDeepEqual(parts, ['张三', '优秀,稳定', '100'], 'S18 quoted comma 3 列正确');
  // S19: 无引号千分位拆 3 列，不静默拼接
  const p19 = splitLine('张三,1,234', 'comma');
  assertDeepEqual(p19, ['张三', '1', '234'], 'S19 无引号千分位拆 3 列');
  // 但经过 parseTableText 列宽校验后可识别并排除错列行
  const r19 = parseTableText('姓名,金额\n李四,500\n张三,1,234');
  assert(r19.rows.length === 1, 'S19 错列行被识别并排除');
}

console.log(`\n=== 结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
if (failed > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✅ 全部通过');
  process.exit(0);
}