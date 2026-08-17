/**
 * 第二十五阶段：导出 CSV 公式注入防护回归测试
 * 直接导入真实生产函数，验证最终 CSV 字节内容符合防护约定。
 *
 * 覆盖：
 *  1. 正常数字（number 形态 100 / -10 / -100.5 / 0）
 *  2. 正常文本（张三 / hello@example.com / 统计学教材）
 *  3. CSV 特殊字符（优秀,稳定 / 他说"很好" / 多行文本）
 *  4. 公式样文本（=1+1 / +SUM / -CMD / @SUM / =HYPERLINK）
 *  5. 前导空白 / Tab 公式（"   =1+1" / "\t=1+1"）
 *  6. 用户控制表头（=SUM(A1:A2)）受保护
 *  7. 合法负数不被破坏（-10 / -100.5 / -0.25 / -1e3 字符串形态）
 *  8. 完整导出函数（exportFilteredRowsToCsv / exportSummaryToCsv）输出
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testCsvInjection.ts
 */
import {
  sanitizeSpreadsheetCell,
  exportFilteredRowsToCsv,
  exportSummaryToCsv,
} from '../src/engine/exportAnalysis.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name + (detail ? ` :: ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`); }
}

console.log('=== 第二十五阶段：导出 CSV 公式注入防护回归测试 ===\n');

// ===== 1. 正常数字（number 形态不受影响） =====
console.log('1. 正常数字（number 形态）');
{
  assert(sanitizeSpreadsheetCell(100) === 100, 'number 100 原样');
  assert(sanitizeSpreadsheetCell(-10) === -10, 'number -10 原样');
  assert(sanitizeSpreadsheetCell(-100.5) === -100.5, 'number -100.5 原样');
  assert(sanitizeSpreadsheetCell(0) === 0, 'number 0 原样');
}

// ===== 2. 正常文本不受影响 =====
console.log('\n2. 正常文本');
{
  assert(sanitizeSpreadsheetCell('张三') === '张三', '张三');
  assert(sanitizeSpreadsheetCell('hello@example.com') === 'hello@example.com', 'email（@在中间不算开头）');
  assert(sanitizeSpreadsheetCell('统计学教材') === '统计学教材', '统计学教材');
  assert(sanitizeSpreadsheetCell('https://example.com') === 'https://example.com', 'URL 文本');
}

// ===== 3. 合法负数（字符串形态）不被破坏 =====
console.log('\n3. 合法负数字符串不被破坏');
{
  assert(sanitizeSpreadsheetCell('-10') === '-10', '-10 字符串保持数字文本');
  assert(sanitizeSpreadsheetCell('-100.5') === '-100.5', '-100.5');
  assert(sanitizeSpreadsheetCell('-0.25') === '-0.25', '-0.25');
  assert(sanitizeSpreadsheetCell('-1e3') === '-1e3', '-1e3');
}

// ===== 4. 公式样文本加 ' 前缀 =====
console.log('\n4. 公式样文本防护');
{
  const hyperlink = '=HYPERLINK("https://example.com","click")';
  assert(sanitizeSpreadsheetCell('=1+1') === "'=1+1", '=1+1 → 单引号前缀');
  assert(sanitizeSpreadsheetCell('=SUM(A1:A2)') === "'=SUM(A1:A2)", '=SUM → 单引号前缀');
  assert(sanitizeSpreadsheetCell(hyperlink) === "'" + hyperlink, '=HYPERLINK → 单引号前缀');
  assert(sanitizeSpreadsheetCell('+SUM(A1:A2)') === "'+SUM(A1:A2)", '+SUM → 单引号前缀');
  assert(sanitizeSpreadsheetCell('@SUM(A1:A2)') === "'@SUM(A1:A2)", '@SUM → 单引号前缀');
  assert(sanitizeSpreadsheetCell('-CMD') === "'-CMD", '-CMD（非数字）→ 单引号前缀');
}

// ===== 5. 前导空白 / Tab 公式 =====
console.log('\n5. 前导空白/Tab 公式');
{
  assert(sanitizeSpreadsheetCell('   =1+1') === "'   =1+1", '前导空格后 = 也加前缀');
  assert(sanitizeSpreadsheetCell('\t=1+1') === "'\t=1+1", 'Tab 后 = 也加前缀');
  assert(sanitizeSpreadsheetCell('   -CMD') === "'   -CMD", '前导空格后 -CMD 加前缀');
}

// ===== 6. 用户控制表头受保护 =====
console.log('\n6. 用户控制表头（字段名）保护');
{
  // 表头即字段名，走同一 escapeCsvCell / sanitize
  const csv = exportFilteredRowsToCsv(
    [{ '=SUM(A1:A2)': '100' }],
    ['=SUM(A1:A2)']
  );
  const headerLine = csv.split('\r\n')[0];
  assert(headerLine.includes("'=SUM(A1:A2)"), '表头 =SUM 受保护', `header=${headerLine}`);
}

// ===== 7. 完整导出：exportFilteredRowsToCsv =====
console.log('\n7. exportFilteredRowsToCsv 输出');
{
  const rows = [
    { '姓名': '张三', '备注': '=1+1', '分数': '-10', '标签': '优秀,稳定', '语录': '他说"很好"' },
    { '姓名': '李四', '备注': '+SUM(A1:A2)', '分数': '-100.5', '标签': 'hello@example.com', '语录': '第一行\n第二行' },
  ];
  const csv = exportFilteredRowsToCsv(rows, ['姓名', '备注', '分数', '标签', '语录']);
  // UTF-8 BOM 开头
  assert(csv.startsWith('\uFEFF'), 'BOM 保留');
  // 每行正确：公式文本加前缀，负数保持，quoted comma/quote/newline 正常
  const lines = csv.split('\r\n');
  assert(lines[0] === '\uFEFF姓名,备注,分数,标签,语录', '表头正常', `=${lines[0]}`);
  assert(lines[1].includes("'=1+1"), '=1+1 加前缀', `=${lines[1]}`);
  assert(lines[1].includes(',-10,'), '-10 保持数字', `=${lines[1]}`);
  assert(lines[1].includes('"优秀,稳定"'), 'quoted comma 仍正常', `=${lines[1]}`);
  assert(lines[1].includes('"他说""很好"""'), 'escaped quote 仍正常', `=${lines[1]}`);
  assert(lines[2].includes("'+SUM(A1:A2)"), '+SUM 加前缀', `=${lines[2]}`);
  assert(lines[2].includes(',-100.5,'), '-100.5 保持', `=${lines[2]}`);
  assert(lines[2].includes('"第一行\n第二行"'), '多行文本仍同一单元格', `=${JSON.stringify(lines[2])}`);
}

// ===== 8. 完整导出：exportSummaryToCsv（程序生成的值不受影响） =====
console.log('\n8. exportSummaryToCsv 程序生成值');
{
  const csv = exportSummaryToCsv(null, {
    count: 3, validCount: 3, invalidCount: 0, max: 100, min: -10, mean: -10,
    median: 0, q25: -5, q75: 5, q90: 50, q95: 80,
  } as any, null, '分数', null);
  assert(csv.startsWith('\uFEFF'), 'BOM 保留');
  assert(csv.includes('均值') && csv.includes('-10'), '均值保持（-10 不加前缀）');
  assert(csv.includes('最小值') && csv.includes('-10'), '最小值保持');
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