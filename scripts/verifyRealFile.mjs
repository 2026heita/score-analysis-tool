/**
 * 真实文件验收脚本：25-26-1-数据Q243综测表.xlsx
 */
import { read, utils } from 'xlsx';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src', '25-26-1-数据Q243综测表.xlsx');

console.log('=== 真实文件验收：25-26-1-数据Q243综测表.xlsx ===\n');

// 读取文件
const buffer = readFileSync(filePath);
const workbook = read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });

console.log('Sheet 列表:', workbook.SheetNames);

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// 提取合并单元格信息
const merges = (sheet['!merges'] || []).map(m => ({
  s: { r: m.s.r, c: m.s.c },
  e: { r: m.e.r, c: m.e.c },
}));
console.log('合并单元格数量:', merges.length);

// 提取原始数据
const rawData = utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
console.log('总行数:', rawData.length);
console.log('前5行预览:');
for (let i = 0; i < Math.min(5, rawData.length); i++) {
  console.log(`  行${i + 1}:`, JSON.stringify(rawData[i].slice(0, 10)).slice(0, 200));
}

// 内联核心解析逻辑（与 src/utils/tableParser 一致）
const STANDALONE_FIELDS = [
  '班级', '学号', '姓名', '总分', '班级排名', '签名',
  '考号', '座号', '序号', '编号', '名次', '排名', '位次',
];

function removeWeightSuffix(name) {
  return name.replace(/（\d+%）/g, '').replace(/\(\d+%\)/g, '').trim();
}

function isStandalone(name) {
  const cleaned = removeWeightSuffix(name).trim();
  return STANDALONE_FIELDS.some(kw => cleaned === kw || cleaned.includes(kw));
}

function getMergedHeaders(rawRows, merges) {
  if (!merges || merges.length === 0) {
    return rawRows.map(row => row.map(v => String(v ?? '').trim()));
  }
  const rowCount = rawRows.length;
  const colCount = Math.max(...rawRows.map(r => r.length));
  const grid = [];
  for (let r = 0; r < rowCount; r++) {
    const row = rawRows[r] || [];
    grid[r] = [];
    for (let c = 0; c < colCount; c++) {
      grid[r][c] = String((row[c] ?? '')).trim();
    }
  }
  for (const merge of merges) {
    const parentValue = String((rawRows[merge.s.r]?.[merge.s.c] ?? '')).trim();
    if (!parentValue) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r < grid.length && c < (grid[r]?.length ?? 0)) {
          if (!grid[r][c]) grid[r][c] = parentValue;
        }
      }
    }
  }
  return grid;
}

function detectAndFlattenMultiRowHeaders(rawRows, merges) {
  const grid = getMergedHeaders(rawRows, merges);
  const scanLimit = Math.min(5, rawRows.length);
  const headerCandidates = [];
  for (let i = 0; i < scanLimit; i++) {
    const row = grid[i];
    if (!row) continue;
    const nonEmpty = row.filter(c => c !== '' && c !== '-').length;
    if (nonEmpty < 2) continue;
    let textCells = 0;
    let numericCells = 0;
    for (const c of row) {
      if (!c || c === '-') continue;
      const n = parseFloat(c);
      if (isNaN(n) || !Number.isFinite(n)) {
        textCells++;
      } else {
        numericCells++;
      }
    }
    if (textCells >= 2 && textCells >= numericCells) headerCandidates.push(i);
  }
  let bestGroup = null;
  for (let i = 0; i < headerCandidates.length; i++) {
    const group = [headerCandidates[i]];
    for (let j = i + 1; j < headerCandidates.length; j++) {
      if (headerCandidates[j] === headerCandidates[j - 1] + 1) group.push(headerCandidates[j]);
      else break;
    }
    if (group.length >= 2 && (!bestGroup || group.length > bestGroup.length)) bestGroup = group;
  }
  if (!bestGroup || bestGroup.length < 2) {
    return { isMultiRow: false, headerRows: [0, 0], headers: grid[0] ? grid[0].map(c => removeWeightSuffix(c)) : [] };
  }
  const colCount = Math.max(...bestGroup.map(r => grid[r]?.length ?? 0));
  const headers = [];
  for (let col = 0; col < colCount; col++) {
    const childValue = grid[bestGroup[bestGroup.length - 1]]?.[col] ?? '';
    const childCleaned = removeWeightSuffix(childValue);
    let parentValue = '';
    for (let rowIdx = 0; rowIdx < bestGroup.length - 1; rowIdx++) {
      const cellValue = grid[bestGroup[rowIdx]]?.[col] ?? '';
      const cleaned = removeWeightSuffix(cellValue);
      if (!cleaned) continue;
      const rowNonEmpty = (grid[bestGroup[rowIdx]] ?? []).filter(c => c && c !== '-').length;
      if (rowNonEmpty === 1 && colCount > 5) continue;
      parentValue = cleaned;
    }
    if (childCleaned) {
      if (isStandalone(childCleaned)) headers.push(childCleaned);
      else if (parentValue) headers.push(`${parentValue}_${childCleaned}`);
      else headers.push(childCleaned);
    } else if (parentValue) {
      headers.push(parentValue);
    } else {
      headers.push('');
    }
  }
  return { isMultiRow: true, headerRows: [bestGroup[0], bestGroup[bestGroup.length - 1]], headers };
}

// 执行解析
const result = detectAndFlattenMultiRowHeaders(rawData, merges);
console.log('\n=== 解析结果 ===');
console.log('是否多级表头:', result.isMultiRow);
console.log('表头行范围:', result.headerRows);
console.log('字段数量:', result.headers.length);

// 过滤空字段
const nonEmptyHeaders = result.headers.filter(h => h && h !== '');
console.log('\n=== 所有非空字段 ===');
nonEmptyHeaders.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

// 检查 2：字段列表中应出现的字段
console.log('\n=== 检查 2：应出现的字段 ===');
const requiredFields = [
  '德育_加分', '德育_扣分', '德育_合计',
  '智育_加分', '智育_扣分', '智育_合计',
  '体育_加分', '体育_扣分', '体育_合计',
  '美育_加分', '美育_扣分', '美育_合计',
  '劳育_加分', '劳育_扣分', '劳育_合计',
  '总分', '班级排名',
];
let allFound = true;
for (const field of requiredFields) {
  const found = result.headers.includes(field);
  console.log(`  ${found ? '✅' : '❌'} ${field}: ${found ? '存在' : '不存在'}`);
  if (!found) allFound = false;
}

// 检查 3：不应该只出现 加分、扣分、合计 等无意义字段
console.log('\n=== 检查 3：不应只出现无意义字段 ===');
const badFields = ['加分', '扣分', '合计', '加分_2', '扣分_2', '合计_2'];
let hasBadField = false;
for (const field of badFields) {
  const found = result.headers.includes(field);
  if (found) {
    console.log(`  ❌ 发现无意义字段: ${field}`);
    hasBadField = true;
  }
}
if (!hasBadField) console.log('  ✅ 未发现无意义字段');

// 构建数据行对象
const dataStartRow = result.headerRows[1] + 1;
const dataRows = rawData.slice(dataStartRow);
console.log(`\n=== 数据行（从第 ${dataStartRow + 1} 行开始）===`);
console.log('数据行数:', dataRows.length);

// 构建第一行学生数据
const firstRow = dataRows[0];
const studentObj = {};
for (let i = 0; i < result.headers.length; i++) {
  const header = result.headers[i];
  if (header) {
    studentObj[header] = i < firstRow.length ? String(firstRow[i] ?? '').trim() : '';
  }
}

console.log('\n=== 检查 7：第一行学生抽查 ===');
console.log('姓名:', studentObj['姓名']);
console.log('德育_合计:', studentObj['德育_合计']);
console.log('智育_合计:', studentObj['智育_合计']);
console.log('体育_合计:', studentObj['体育_合计']);
console.log('总分:', studentObj['总分']);
console.log('班级排名:', studentObj['班级排名']);

// 验证值
const checks = [
  ['姓名', studentObj['姓名'], '叶丹'],
  ['德育_合计', studentObj['德育_合计'], '105.40'],
  ['智育_合计', studentObj['智育_合计'], '95.43'],
  ['体育_合计', studentObj['体育_合计'], '98.50'],
  ['总分', studentObj['总分'], '98.87'],
  ['班级排名', studentObj['班级排名'], '1'],
];

console.log('\n=== 值对齐检查 ===');
let allAligned = true;
for (const [field, actual, expected] of checks) {
  const match = actual === expected;
  console.log(`  ${match ? '✅' : '❌'} ${field}: 期望 "${expected}", 实际 "${actual}"`);
  if (!match) allAligned = false;
}

// 检查 4：默认推荐字段
console.log('\n=== 检查 4：默认推荐字段 ===');
// 模拟推荐逻辑
const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
const SCORE_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分', '总分（不含加分）', '原始总分', '标准总分', '综合', '文科综合', '理科综合'];
const RANK_KEYWORDS = ['名次', '排名', '位次', '年级名次', '班级名次'];
const BONUS_KEYWORDS = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分'];
const PENALTY_KEYWORDS = ['扣分'];
const CATEGORY_KEYWORDS = ['组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称', '选考', '首选', '再选'];
const EXCLUDED_FROM_RECOMMENDATION = ['学校代码', '学校名称', '姓名', '考号', '座号', '学号', '考生号', '准考证', '班级', '组合简称', '科类', '类别', '性别', '民族', '身份证号', '签名'];

function classifyField(header) {
  const lower = header.toLowerCase().trim();
  for (const kw of RANK_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'rank';
  for (const kw of IDENTITY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'identity';
  for (const kw of SCORE_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'score';
  for (const kw of CATEGORY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'category';
  for (const kw of BONUS_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'bonus';
  for (const kw of PENALTY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'penalty';
  return 'unknown';
}

function isPureBonusField(headerLower) {
  if (headerLower.includes('不含')) return false;
  return BONUS_KEYWORDS.some(kw => headerLower.includes(kw.toLowerCase()));
}

function recommendAnalysisField(fieldMetas) {
  for (const meta of fieldMetas) {
    const lower = meta.header.toLowerCase();
    if ((lower.includes('总分') || lower.includes('总成绩')) && meta.validCount > 0) {
      if (isPureBonusField(lower)) continue;
      return { field: meta.header, priority: 1 };
    }
  }
  for (const meta of fieldMetas) {
    if (meta.type === 'rank' && meta.validCount > 0) return { field: meta.header, priority: 2 };
  }
  const compositeTotals = ['智育_合计', '德育_合计', '体育_合计', '美育_合计', '劳育_合计'];
  for (const kw of compositeTotals) {
    for (const meta of fieldMetas) {
      if (meta.header.includes(kw) && meta.validCount > 0) return { field: meta.header, priority: 3 };
    }
  }
  for (const subject of ['语文', '数学', '英语', '外语']) {
    for (const meta of fieldMetas) {
      if (meta.header.includes(subject) && meta.validCount > 0) return { field: meta.header, priority: 4 };
    }
  }
  for (const meta of fieldMetas) {
    if (meta.validCount > 0 && shouldIncludeInRecommendation(meta.header)) return { field: meta.header, priority: 7 };
  }
  return { field: null, priority: 99 };
}

function shouldIncludeInRecommendation(header) {
  const lower = header.toLowerCase();
  for (const kw of EXCLUDED_FROM_RECOMMENDATION) if (lower.includes(kw.toLowerCase())) return false;
  if (isPureBonusField(lower)) return false;
  if (lower.includes('扣分')) return false;
  return true;
}

// 构建 fieldMetas
const fieldMetas = nonEmptyHeaders.map(header => {
  const type = classifyField(header);
  // 简单统计有效数值数量
  let validCount = 0;
  for (const row of dataRows) {
    const idx = result.headers.indexOf(header);
    if (idx >= 0 && idx < row.length) {
      const val = String(row[idx] ?? '').trim();
      const num = parseFloat(val);
      if (!isNaN(num) && Number.isFinite(num)) validCount++;
    }
  }
  return { header, type, validCount };
});

const recommendation = recommendAnalysisField(fieldMetas);
console.log(`  推荐字段: ${recommendation.field}`);
console.log(`  优先级: ${recommendation.priority}`);
console.log(`  ${recommendation.field === '总分' ? '✅' : '❌'} 默认推荐字段应为"总分"`);

// 检查 5：学号不能作为推荐字段
console.log('\n=== 检查 5：学号分类 ===');
const 学号Meta = fieldMetas.find(m => m.header === '学号');
console.log(`  学号分类: ${学号Meta?.type}`);
console.log(`  ${学号Meta?.type === 'identity' ? '✅' : '❌'} 学号应为 identity`);

// 检查 6：班级排名应为 rank
console.log('\n=== 检查 6：班级排名分类 ===');
const 排名Meta = fieldMetas.find(m => m.header === '班级排名');
console.log(`  班级排名分类: ${排名Meta?.type}`);
console.log(`  ${排名Meta?.type === 'rank' ? '✅' : '❌'} 班级排名应为 rank`);

// 总结
console.log('\n========================================');
console.log('=== 验收总结 ===');
console.log('========================================');
console.log(`1. 解析成功: ${result.isMultiRow ? '✅ 是' : '❌ 否'}`);
console.log(`2. 字段语义化: ${allFound ? '✅ 是' : '❌ 否'}`);
console.log(`3. 无无意义字段: ${!hasBadField ? '✅ 是' : '❌ 否'}`);
console.log(`4. 默认推荐字段: ${recommendation.field} ${recommendation.field === '总分' ? '✅' : '❌'}`);
console.log(`5. 学号不为推荐字段: ${学号Meta?.type === 'identity' ? '✅' : '❌'}`);
console.log(`6. 班级排名为 rank: ${排名Meta?.type === 'rank' ? '✅' : '❌'}`);
console.log(`7. 第一行值对齐: ${allAligned ? '✅ 是' : '❌ 否'}`);

if (!allFound || hasBadField || recommendation.field !== '总分' || !allAligned) {
  console.log('\n❌ 验收未完全通过，需要修复。');
  process.exit(1);
} else {
  console.log('\n✅ 验收全部通过！');
  process.exit(0);
}
