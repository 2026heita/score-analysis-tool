/**
 * 第十八阶段：CSV 上传链路回归测试
 * 直接导入真实生产 parser 验证，不复制算法。
 *
 * 覆盖：
 *  1. 上传 UTF-8 无 BOM 中文 CSV
 *  2. 上传 UTF-8 BOM CSV
 *  3. quoted comma（引号内逗号）
 *  4. quoted 千分位（引号内 "1,234"）
 *  5. escaped quote（"" 转义）
 *  6. quoted newline（引号内换行）
 *  7. 标题行 + CSV 表头
 *  8. 说明行 + CSV 表头
 *  9. 未闭合 quote（残缺记录排除 + warning）
 * 10. 无引号 张三,1,234（列数不一致检测，错误行不入分析）
 * 11. 上传与粘贴得到一致结果
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testCsvUpload.ts
 */
import { parseTableText } from '../src/utils/parseTable.js';
import { parseCsvFileText } from '../src/utils/fileImport.js';

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

console.log('=== 第十八阶段：CSV 上传链路回归测试 ===\n');

// ===== 1. 上传 UTF-8 无 BOM 中文 CSV =====
console.log('1. 上传 UTF-8 无 BOM 中文 CSV');
{
  const text = '姓名,数学,英语\n张三,90,95\n李四,88,92';
  const r = parseCsvFileText(text);
  assertDeepEqual(r.headers, ['姓名', '数学', '英语'], '表头识别正确');
  assert(r.rows.length === 2, '两行数据', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '张三', '首行姓名正确', `姓名=${r.rows[0]['姓名']}`);
}

// ===== 2. 上传 UTF-8 BOM CSV =====
console.log('\n2. 上传 UTF-8 BOM CSV');
{
  const text = '\uFEFF姓名,数学,英语\n张三,90,95\n李四,88,92';
  const r = parseCsvFileText(text);
  assertDeepEqual(r.headers, ['姓名', '数学', '英语'], 'BOM 被剥离，表头无残留', `headers=${JSON.stringify(r.headers)}`);
  assert(r.rows.length === 2, 'BOM CSV 两行数据', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '张三', 'BOM CSV 首行姓名正确');
}

// ===== 3. quoted comma =====
console.log('\n3. quoted comma');
{
  const text = '姓名,描述,总分\n张三,"优秀,稳定",100';
  const r = parseTableText(text);
  assertDeepEqual(r.headers, ['姓名', '描述', '总分'], '表头 3 列');
  assert(r.rows.length === 1, '一行数据');
  assert(r.rows[0]['描述'] === '优秀,稳定', '引号内逗号保持为一个单元格', `描述=${r.rows[0]['描述']}`);
  assert(r.rows[0]['总分'] === '100', '总分=100');
}

// ===== 4. quoted 千分位 =====
console.log('\n4. quoted 千分位');
{
  const r = parseTableText('姓名,金额\n张三,"1,234"\n李四,"2,500.50"');
  assert(r.rows.length === 2, '两行数据');
  assert(r.rows[0]['金额'] === '1,234', '单元格保持 "1,234" 字符串');
  assert(r.rows[1]['金额'] === '2,500.50', '单元格保持 "2,500.50"');
  assert(r.rows.length === 2 && r.rows[0]['金额'] === '1,234', 'quoted 千分位未被错拆');
}

// ===== 5. escaped quote =====
console.log('\n5. escaped quote');
{
  const r = parseTableText('姓名,描述\n张三,"他说""很好"""');
  assert(r.rows.length === 1, '一行数据');
  assert(r.rows[0]['描述'] === '他说"很好"', '"" 转义为 "', `描述=${r.rows[0]['描述']}`);
}

// ===== 6. quoted newline =====
console.log('\n6. quoted newline');
{
  const r = parseTableText('姓名,描述,总分\n张三,"优秀\n稳定",100');
  assert(r.rows.length === 1, '保持一个逻辑记录', `rows=${r.rows.length}`);
  assert(r.rows[0]['描述'] === '优秀\n稳定', '引号内换行保留', `描述=${JSON.stringify(r.rows[0]['描述'])}`);
}

// ===== 7. 标题行 + CSV 表头 =====
console.log('\n7. 标题行 + CSV 表头');
{
  const r = parseTableText('2026年期末考试\n姓名,总分\n张三,100\n李四,90');
  assert(r.rows.length === 2, '两行数据', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '张三', '首行姓名正确', `rows=${JSON.stringify(r.rows)}`);
  const firstHeader = r.headers[0];
  assert(firstHeader === '姓名', '表头识别为 姓名 而非标题行', `header=${firstHeader}`);
}

// ===== 8. 说明行 + CSV 表头 =====
console.log('\n8. 说明行 + CSV 表头');
{
  const r = parseTableText('说明：以下为考试成绩\n姓名,总分\n张三,100\n李四,90');
  assert(r.rows.length === 2, '两行数据', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '张三', '首行姓名正确', `rows=${JSON.stringify(r.rows)}`);
  assert(r.headers[0] === '姓名', '表头识别为 姓名 而非说明行', `header=${r.headers[0]}`);
}

// ===== 9. 未闭合 quote =====
console.log('\n9. 未闭合 quote');
{
  // 存在其他合法记录时：合法记录保留，残缺记录排除，warning 透传
  const text = '姓名,备注,总分\n李四,正常,80\n张三,"优秀,\n稳定,100';
  const r = parseTableText(text);
  assert(r.rows.length === 1, '仅保留合法记录(李四)', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '李四', '保留的是李四', `rows=${JSON.stringify(r.rows)}`);
  const hasUnclosedWarn = (r.warnings || []).some(w => w.includes('未闭合'));
  assert(hasUnclosedWarn, '存在未闭合引号 warning', `warnings=${JSON.stringify(r.warnings || [])}`);
  const malformedLeaked = r.rows.some(row => String(row['备注'] ?? '').includes('优秀,'));
  assert(!malformedLeaked, '残缺记录（张三者）未进入有效数据');
}

// ===== 10. 无引号 张三,1,234 =====
console.log('\n10. 无引号 张三,1,234');
{
  const r = parseTableText('姓名,金额\n李四,500\n张三,1,234');
  assert(r.rows.length === 1, '仅保留合法行(李四)', `rows=${r.rows.length}`);
  assert(r.rows[0]['姓名'] === '李四', '保留的是李四', `rows=${JSON.stringify(r.rows)}`);
  const hasColWarning = (r.warnings || []).some(w =>
    w.includes('列数与表头不一致') || w.includes('多于表头') || w.includes('已跳过该行')
  );
  assert(hasColWarning, '存在列数不一致 warning', `warnings=${JSON.stringify(r.warnings || [])}`);
  const leaked = r.rows.some(row => row['金额'] === '234' || row['姓名'] === '张三');
  assert(!leaked, '错误行（张三者）未进入分析');
}

// ===== 11. 上传与粘贴一致 =====
console.log('\n11. 上传与粘贴一致');
{
  const csv = '姓名,备注,金额\n张三,"优秀,稳定","1,234"\n李四,"他说""很好""","2,500.50"';
  const upload = parseCsvFileText(csv);
  const paste = parseTableText(csv);
  assertDeepEqual(upload.headers, paste.headers, '表头一致');
  assertDeepEqual(upload.rows, paste.rows, '数据行一致');
  assertDeepEqual(upload.warnings, paste.warnings, 'warning 一致');
  assert(upload.rows.length === 2, '两行数据', `rows=${upload.rows.length}`);
  assert(upload.rows[0]['备注'] === '优秀,稳定', '上传 quoted comma 正确');
  assert(upload.rows[0]['金额'] === '1,234', '上传 quoted 千分位正确');
  assert(upload.rows[1]['备注'] === '他说"很好"', '上传 escaped quote 正确');
  assert(upload.rows[1]['金额'] === '2,500.50', '上传 escaped 千分位正确');

  // 上传带 BOM 与粘贴无 BOM 也应一致
  const uploadBom = parseCsvFileText('\uFEFF' + csv);
  assertDeepEqual(uploadBom.headers, paste.headers, 'BOM 上传表头与粘贴一致');
  assertDeepEqual(uploadBom.rows, paste.rows, 'BOM 上传数据行与粘贴一致');
}

// ===== 12. 无 BOM / 有 BOM 上传一致性 ====
console.log('\n12. 无 BOM / 有 BOM 上传一致性');
{
  const text = '姓名,总分\n张三,100\n李四,90';
  const noBom = parseCsvFileText(text);
  const bom = parseCsvFileText('\uFEFF' + text);
  assertDeepEqual(noBom.headers, bom.headers, '表头一致');
  assertDeepEqual(noBom.rows, bom.rows, '数据行一致');
  assertDeepEqual(noBom.warnings, bom.warnings, 'warning 一致');
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