/**
 * 使用真实数据样本验证解析器逻辑
 * 基于 2024年9省联考成绩(5班).xlsx 的实际数据
 */

// ============================================================
// 1. 直接实现核心解析函数（与src/utils/tableParser/同步）
// ============================================================

// --- numericParser ---
function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, status: 'empty' };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { valid: true, value } : { valid: false, status: 'invalid' };
  }
  if (typeof value !== 'string') {
    return { valid: false, status: 'invalid' };
  }
  const trimmed = value.trim();
  if (trimmed === '') return { valid: false, status: 'empty' };
  // 特殊值判断
  const statusValues = ['缺考', '弃考', '转班', '转到', '无', '无成绩', '-', '/'];
  for (const sv of statusValues) {
    if (trimmed.includes(sv)) {
      return { valid: false, status: 'invalid' };
    }
  }
  // 百分号
  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(num) ? { valid: true, value: num } : { valid: false, status: 'invalid' };
  }
  // 逗号数字
  const noComma = trimmed.replace(/,/g, '');
  const num = parseFloat(noComma);
  return Number.isFinite(num) ? { valid: true, value: num } : { valid: false, status: 'invalid' };
}

// --- fieldClassifier ---
const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证'];
const SCORE_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '历史', '化学', '生物', '政治', '地理', '成绩', '分数'];
const RANK_KEYWORDS = ['名次', '排名', '位次'];
const BONUS_KEYWORDS = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分'];
const CATEGORY_KEYWORDS = ['组合', '组合简称', '科类', '选科', '类别'];

function isPureBonusField(headerLower) {
  if (headerLower.includes('不含')) return false;
  return BONUS_KEYWORDS.some(kw => headerLower.includes(kw.toLowerCase()));
}

function classifyField(header, columnValues) {
  const lower = header.toLowerCase().trim();
  for (const kw of IDENTITY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'identity';
  for (const kw of SCORE_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'score';
  for (const kw of RANK_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'rank';
  for (const kw of CATEGORY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'category';
  for (const kw of BONUS_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'bonus';
  return 'unknown';
}

// --- rowClassifier ---
const SUMMARY_KEYWORDS = ['平均', '合计', '统计', '汇总', '总计'];
const STATUS_KEYWORDS = ['缺考', '弃考', '转到', '转班', '无成绩'];

function classifyDataRow(row, headers) {
  const nameIdx = headers.findIndex(h => h.includes('姓名'));
  const nameVal = nameIdx >= 0 ? row[nameIdx] : null;
  
  // 空行检查
  const nonEmpty = row.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'empty';
  
  // 统计行检查
  const textValues = row.filter(v => v !== null && v !== undefined).map(String);
  for (const kw of SUMMARY_KEYWORDS) {
    if (textValues.some(v => v.includes(kw))) return 'summary';
  }
  
  // 姓名为空但只有数值 → 统计行
  if ((!nameVal || String(nameVal).trim() === '') && nonEmpty.length > 0) {
    const numericCount = nonEmpty.filter(v => parseNumericValue(v).valid).length;
    if (numericCount > 0 && numericCount >= nonEmpty.length * 0.6) return 'summary';
  }
  
  // 状态行检查
  const statusCount = textValues.filter(v => STATUS_KEYWORDS.some(kw => v.includes(kw))).length;
  if (statusCount >= 3) return 'statusOnly';
  
  // 有效数据行
  const validScores = row.filter(v => parseNumericValue(v).valid).length;
  if ((nameVal && String(nameVal).trim() !== '') && validScores > 0) return 'validData';
  
  return 'invalid';
}

// ============================================================
// 2. 真实数据样本（从Excel提取）
// ============================================================
const sampleHeaders = [
  '学校代码', '学校名称', '姓名', '班级', 
  '总分（不含加分）', '语文', '数学', '英语', 
  '物理', '历史', '化学', '生物', '政治', '地理',
  '区内加分', '区外加分', '组合简称'
];

const sampleRows = [
  // 黄冠谦 - 转到7班
  ['01361', '南宁市第三十六中学（衡阳校区）', '黄冠谦', '7',
   '转到7班', '转到7班', '转到7班', '转到7班', '转到7班', '转到7班', '转到7班', '转到7班', '转到7班', '转到7班',
   null, null, '物化地'],
  // 吴东旭 - 缺考
  ['01361', '南宁市第三十六中学（衡阳校区）', '吴东旭', '5',
   '缺考', '缺考', '缺考', '缺考', '缺考', '缺考', '缺考', null, null, null, null, null, '物化地'],
  // 谭蓝浩 - 正常数据
  ['01361', '南宁市第三十六中学（衡阳校区）', '谭蓝浩', '5',
   550, 111, 79, 120, null, null, 64, 86, 90, 3, 3, null, '物化地'],
  // 蒙新翔 - 正常数据
  ['01361', '南宁市第三十六中学（衡阳校区）', '蒙新翔', '5',
   547, 110, 98, 88, null, null, 83, 82, 86, 3, 3, null, '物化地'],
  // 李桂康 - 正常数据
  ['01361', '南宁市第三十六中学（衡阳校区）', '李桂康', '5',
   546, 117, 84, 97, null, null, 70, 87, 91, 3, 3, null, '物化地'],
  // 陆信宇 - 正常学生（最后一名学生）
  ['01361', '南宁市第三十六中学（衡阳校区）', '陆信宇', '5',
   412, 100, 49, 59, null, null, 43, 72, 89, 3, 3, null, '物化地'],
  // 平均分/统计行
  [null, null, '平均', null,
   492.5, 107.3, 68.2, 104.8, null, null, 53.1, 74.8, 85.6, 2.8, 2.9, null, '物化地'],
];

console.log('=== 真实数据样本验证 ===\n');
console.log(`数据样本: ${sampleRows.length} 行, ${sampleHeaders.length} 列\n`);

// ============================================================
// 3. 字段分类验证
// ============================================================
console.log('【字段分类】');
const fieldResults = sampleHeaders.map(header => ({
  header,
  type: classifyField(header, [])
}));

fieldResults.forEach(f => {
  console.log(`  ${f.header} → ${f.type}`);
});

// ============================================================
// 4. 推荐字段验证
// ============================================================
console.log('\n【推荐字段分析】');

function recommendField(fields) {
  const EXCLUDED_KEYWORDS = [
    '学校代码', '学校名称', '姓名', '考号', '座号', '学号', '考生号', '准考证',
    '班级', '组合简称', '科类', '类别', '性别', '民族', '身份证号'
  ];
  
  // 优先级1: 总分
  for (const f of fields) {
    if (f.type === 'score') {
      const lower = f.header.toLowerCase();
      if ((lower.includes('总分') || lower.includes('总成绩')) && !isPureBonusField(lower)) {
        return f.header;
      }
    }
  }
  
  // 优先级2: 主科
  const mainSubjects = ['语文', '数学', '英语', '外语'];
  for (const subj of mainSubjects) {
    const f = fields.find(f => f.header.includes(subj) && f.type === 'score');
    if (f) return f.header;
  }
  
  // 优先级3: 其他科目
  const subjects = ['物理', '历史', '化学', '生物', '政治', '地理'];
  for (const subj of subjects) {
    const f = fields.find(f => f.header.includes(subj) && f.type === 'score');
    if (f) return f.header;
  }
  
  // 优先级4: rank
  const f = fields.find(f => f.type === 'rank');
  if (f) return f.header;
  
  // 优先级5: 其他数值字段
  for (const f of fields) {
    if (f.type === 'score' || f.type === 'unknown') {
      const lower = f.header.toLowerCase();
      const isExcluded = EXCLUDED_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
      if (!isExcluded && !isPureBonusField(lower)) {
        return f.header;
      }
    }
  }
  
  return null;
}

const recommended = recommendField(fieldResults);
console.log(`  推荐分析字段: ${recommended}`);

// ============================================================
// 5. 数据行分类验证
// ============================================================
console.log('\n【数据行分类】');

let validCount = 0, emptyCount = 0, summaryCount = 0, statusOnlyCount = 0, invalidCount = 0;

sampleRows.forEach((row, idx) => {
  const result = classifyDataRow(row, sampleHeaders);
  const name = row[2] || '(无名)';
  console.log(`  行${idx + 1} (${name}) → ${result}`);
  
  if (result === 'validData') validCount++;
  else if (result === 'empty') emptyCount++;
  else if (result === 'summary') summaryCount++;
  else if (result === 'statusOnly') statusOnlyCount++;
  else if (result === 'invalid') invalidCount++;
});

// ============================================================
// 6. 特殊值验证
// ============================================================
console.log('\n【特殊值解析】');

const testValues = [
  '缺考', '转到7班', '转班', '无', '无成绩', '-', '/', '',
  '550', '550.5', '  550  ', '85%'
];

testValues.forEach(value => {
  const parsed = parseNumericValue(value);
  if (parsed.valid) {
    console.log(`  "${value}" → ${parsed.value} (valid)`);
  } else {
    console.log(`  "${value}" → ${parsed.status} (not valid)`);
  }
});

// ============================================================
// 7. 综合验证结果
// ============================================================
console.log('\n=== 验证结果汇总 ===\n');

const checks = [];

// 1. 字段检测
checks.push({
  name: '1. 能成功解析，不报"第一行没有有效字段名"',
  pass: fieldResults.filter(f => f.type !== 'unknown').length > 0
});

// 2. 推荐字段
checks.push({
  name: '2. 默认推荐字段是"总分（不含加分）"',
  pass: recommended === '总分（不含加分）'
});

// 3. 排除字段
const excludedTypes = ['identity', 'bonus', 'category'];
const recommendedFieldObj = fieldResults.find(f => f.header === recommended);
checks.push({
  name: '3. 学校代码、班级、姓名、组合简称、加分字段不作为默认推荐',
  pass: recommendedFieldObj && !excludedTypes.includes(recommendedFieldObj.type)
});

// 4. 缺考不当0
const quekaoResult = parseNumericValue('缺考');
checks.push({
  name: '4. "缺考"不被解析成 0',
  pass: !quekaoResult.valid
});

// 5. 转到7班不当0或7
const zhuandaoResult = parseNumericValue('转到7班');
checks.push({
  name: '5. "转到7班"不被解析成 0 或 7',
  pass: !zhuandaoResult.valid
});

// 6. 统计行不当学生数据
const summaryRow = sampleRows[sampleRows.length - 1];
const summaryResult = classifyDataRow(summaryRow, sampleHeaders);
checks.push({
  name: '6. 最后一行平均分/统计行不当成学生数据',
  pass: summaryResult === 'summary'
});

// 7. 黄冠谦行（转到7班）被正确分类
const huangRow = sampleRows.find(r => r[2] === '黄冠谦');
const huangResult = classifyDataRow(huangRow, sampleHeaders);
checks.push({
  name: '7. 黄冠谦行（全部"转到7班"）被正确分类为 statusOnly',
  pass: huangResult === 'statusOnly'
});

// 8. 吴东旭行（缺考）被正确分类
const wuRow = sampleRows.find(r => r[2] === '吴东旭');
const wuResult = classifyDataRow(wuRow, sampleHeaders);
checks.push({
  name: '8. 吴东旭行（全部"缺考"）被正确分类为 statusOnly',
  pass: wuResult === 'statusOnly'
});

// 9. 正常学生行被正确分类
const tanRow = sampleRows.find(r => r[2] === '谭蓝浩');
const tanResult = classifyDataRow(tanRow, sampleHeaders);
checks.push({
  name: '9. 正常学生行（谭蓝浩）被正确分类为 validData',
  pass: tanResult === 'validData'
});

// 10. 字段分类正确
checks.push({
  name: '10. 字段分类正确（学校代码=identity, 总分=score, 加分=bonus）',
  pass: fieldResults.find(f => f.header === '学校代码')?.type === 'identity' &&
        fieldResults.find(f => f.header === '总分（不含加分）')?.type === 'score' &&
        fieldResults.find(f => f.header === '区内加分')?.type === 'bonus'
});

// 打印结果
checks.forEach(c => {
  console.log(`${c.pass ? '✅' : '❌'} ${c.name}`);
});

const passCount = checks.filter(c => c.pass).length;
const totalCount = checks.length;

console.log(`\n总计: ${passCount}/${totalCount} 项通过`);

if (passCount === totalCount) {
  console.log('\n🎉 全部验证通过！');
} else {
  console.log('\n⚠️  有未通过的验证项，需要修复');
  process.exit(1);
}
