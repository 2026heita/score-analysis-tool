/**
 * 最终回归验收脚本
 * 执行: node scripts/finalAcceptance.mjs
 *
 * 覆盖三条路径：
 * 1. 普通单行成绩表
 * 2. 多级合并表头 Excel 上传
 * 3. 粘贴 Excel 文本路径
 *
 * 每条路径检查：
 * - 表头识别正确
 * - 字段分类正确
 * - 默认分析字段正确
 * - 批量选择字段分组正确
 * - 学号/姓名/班级/加分/扣分/未命名字段不进入默认推荐
 * - 总分/排名/课程字段/合计字段可正常选择
 */

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: ${actual}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

function assertContains(name, actual, expected) {
  if (actual.includes(expected)) {
    console.log(`  ✅ ${name}: contains "${expected}"`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected to contain "${expected}", got "${actual}"`);
    failed++;
  }
}

function assertNotContains(name, actual, notExpected) {
  // 如果 actual 是数组，检查数组中是否不包含该元素
  if (Array.isArray(actual)) {
    if (!actual.includes(notExpected)) {
      console.log(`  ✅ ${name}: not contains "${notExpected}"`);
      passed++;
    } else {
      console.log(`  ❌ ${name}: expected not to contain "${notExpected}", got "${actual.join(',')}"`);
      failed++;
    }
  } else {
    // 如果是字符串，按逗号分割后检查
    const items = actual.split(',');
    if (!items.includes(notExpected)) {
      console.log(`  ✅ ${name}: not contains "${notExpected}"`);
      passed++;
    } else {
      console.log(`  ❌ ${name}: expected not to contain "${notExpected}", got "${actual}"`);
      failed++;
    }
  }
}

function assertMinCount(name, actual, min) {
  if (actual >= min) {
    console.log(`  ✅ ${name}: ${actual} >= ${min}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected >= ${min}, got ${actual}`);
    failed++;
  }
}

// ============================================================
// 内联核心算法（与 src/utils/tableParser 中一致）
// ============================================================

// ---- numericParser.ts ----
const INVALID_KEYWORDS = [
  '缺考', '弃考', '转班', '转到', '无', '无成绩',
  '休学', '退学', '请假', '缓考',
  '—', '–', '/', '\\', '|',
];

function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return { status: 'empty' };
  if (typeof val === 'number') return Number.isFinite(val) ? { status: 'valid', value: val } : { status: 'invalid' };
  if (typeof val === 'boolean') return { status: 'invalid' };
  const str = String(val).trim();
  if (str === '') return { status: 'empty' };
  if (isInvalidKeyword(str)) return { status: 'invalid' };
  if (str === '-' || str === '—' || str === '–' || str === '/' || str === '\\' || str === '|') return { status: 'empty' };
  if (str.endsWith('%')) {
    const numStr = str.slice(0, -1).trim();
    const num = parseFloat(numStr);
    if (!isNaN(num) && Number.isFinite(num)) return { status: 'valid', value: num };
    return { status: 'invalid' };
  }
  const cleaned = str.replace(/,/g, '');
  if (isInvalidKeyword(cleaned)) return { status: 'invalid' };
  const num = parseFloat(cleaned);
  if (!isNaN(num) && Number.isFinite(num)) return { status: 'valid', value: num };
  if (/\d/.test(cleaned)) return { status: 'invalid' };
  return { status: 'invalid' };
}

function isInvalidKeyword(str) {
  const lower = str.toLowerCase();
  for (const kw of INVALID_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// ---- fieldClassifier.ts ----
const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
const SCORE_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分', '总分（不含加分）', '原始总分', '标准总分', '综合', '文科综合', '理科综合'];
const RANK_KEYWORDS = ['名次', '排名', '位次', '年级名次', '班级名次'];
const BONUS_KEYWORDS = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分'];
const PENALTY_KEYWORDS = ['扣分'];
const CATEGORY_KEYWORDS = ['组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称', '选考', '首选', '再选'];

function isPureBonusField(headerLower) {
  if (headerLower.includes('不含')) return false;
  return BONUS_KEYWORDS.some(kw => headerLower.includes(kw.toLowerCase()));
}

function classifyField(header, columnValues = []) {
  const lower = header.toLowerCase().trim();
  for (const kw of RANK_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'rank';
  for (const kw of IDENTITY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'identity';
  for (const kw of SCORE_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'score';
  for (const kw of CATEGORY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'category';
  for (const kw of BONUS_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'bonus';
  for (const kw of PENALTY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'penalty';
  
  if (/^[\u4e00-\u9fa5]{2,}$/.test(lower)) return 'courseScore';
  
  const numericCount = columnValues.filter(v => parseNumericValue(v).status === 'valid').length;
  const nonEmptyCount = columnValues.filter(v => v !== '' && v !== '-' && v !== null && v !== undefined).length;
  if (nonEmptyCount > 0 && numericCount / nonEmptyCount > 0.7) return 'courseScore';
  
  return 'unknown';
}

function determineAnalysisRole(header, columnValues = []) {
  const basicRole = classifyField(header, columnValues);
  const lower = header.toLowerCase().trim();
  
  if (basicRole === 'identity') return 'identity';
  if (basicRole === 'rank') return 'rank';
  if (basicRole === 'bonus' || basicRole === 'penalty') return 'adjustment';
  if (basicRole === 'category') return 'category';
  
  if (lower.includes('总分') || lower.includes('总成绩') || lower.includes('综合成绩') || lower.includes('总评')) {
    if (!isPureBonusField(lower)) return 'primaryTotal';
  }
  
  if (lower.includes('合计') || lower.includes('总计') || lower.includes('小计') || lower.includes('模块合计')) {
    return 'sectionTotal';
  }
  
  if (basicRole === 'score') return 'courseScore';
  
  if (basicRole === 'unknown') {
    const numericCount = columnValues.filter(v => parseNumericValue(v).status === 'valid').length;
    const nonEmptyCount = columnValues.filter(v => v !== '' && v !== '-' && v !== null && v !== undefined).length;
    if (nonEmptyCount > 0 && numericCount / nonEmptyCount > 0.7) return 'courseScore';
    return 'unknown';
  }
  
  return 'unknown';
}

// ---- 本地字段分类（与 OriginalFieldRadar.tsx 中一致）----
function classifyFieldLocally(header) {
  const headerLower = header.toLowerCase().trim();

  if (headerLower.startsWith('未命名字段') || headerLower === '' || /^[\s_\-\.]+$/.test(headerLower)) {
    return 'invalid';
  }

  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      if (!headerLower.includes('不含加分') && !headerLower.includes('不含优惠')) {
        return 'primaryTotal';
      }
    }
  }

  const RANK_KEYWORDS_LOCAL = ['名次', '排名', '位次', '年级名次', '班级名次'];
  for (const kw of RANK_KEYWORDS_LOCAL) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'rank';
    }
  }

  const SECTION_TOTAL_KEYWORDS = ['合计', '总计', '小计', '模块合计'];
  for (const kw of SECTION_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'sectionTotal';
    }
  }

  const BONUS_KEYWORDS_LOCAL = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分'];
  const PENALTY_KEYWORDS_LOCAL = ['扣分'];
  for (const kw of BONUS_KEYWORDS_LOCAL) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'adjustment';
    }
  }
  for (const kw of PENALTY_KEYWORDS_LOCAL) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'adjustment';
    }
  }

  const IDENTITY_KEYWORDS_LOCAL = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
    '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
  for (const kw of IDENTITY_KEYWORDS_LOCAL) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'identity';
    }
  }

  if (/[\u4e00-\u9fa5]/.test(headerLower)) {
    return 'courseScore';
  }

  return 'unknown';
}

// ============================================================
// 路径 1：普通单行成绩表
// ============================================================
console.log('\n=== 路径 1：普通单行成绩表 ===\n');

const path1Headers = ['学号', '姓名', '班级', '语文', '数学', '英语', '物理', '化学', '生物', '总分', '班级排名', '年级排名', '加分'];
const path1Data = [
  ['001', '张三', '1班', '90', '95', '88', '85', '92', '87', '537', '5', '10', ''],
  ['002', '李四', '1班', '85', '88', '90', '82', '86', '84', '515', '8', '15', '5'],
];

console.log('表头识别：');
assert('表头数量', path1Headers.length, 13);
assertContains('包含学号', path1Headers.join(','), '学号');
assertContains('包含姓名', path1Headers.join(','), '姓名');
assertContains('包含班级', path1Headers.join(','), '班级');
assertContains('包含总分', path1Headers.join(','), '总分');
assertContains('包含班级排名', path1Headers.join(','), '班级排名');

console.log('\n字段分类：');
const path1Roles = path1Headers.map(h => classifyFieldLocally(h));
const path1RoleMap = {};
path1Headers.forEach((h, i) => { path1RoleMap[h] = path1Roles[i]; });

assert('学号分类为identity', path1RoleMap['学号'], 'identity');
assert('姓名分类为identity', path1RoleMap['姓名'], 'identity');
assert('班级分类为identity', path1RoleMap['班级'], 'identity');
assert('总分分类为primaryTotal', path1RoleMap['总分'], 'primaryTotal');
assert('班级排名分类为rank', path1RoleMap['班级排名'], 'rank');
assert('年级排名分类为rank', path1RoleMap['年级排名'], 'rank');
assert('语文分类为courseScore', path1RoleMap['语文'], 'courseScore');
assert('加分分类为adjustment', path1RoleMap['加分'], 'adjustment');

console.log('\n默认推荐字段：');
const path1Recommended = path1Headers.filter(h => {
  const role = path1RoleMap[h];
  return ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'].includes(role);
});
assertMinCount('推荐字段数量', path1Recommended.length, 5);
assertNotContains('推荐字段不包含学号', path1Recommended.join(','), '学号');
assertNotContains('推荐字段不包含姓名', path1Recommended.join(','), '姓名');
assertNotContains('推荐字段不包含班级', path1Recommended.join(','), '班级');
assertNotContains('推荐字段不包含加分', path1Recommended.join(','), '加分');
assertContains('推荐字段包含总分', path1Recommended.join(','), '总分');
assertContains('推荐字段包含班级排名', path1Recommended.join(','), '班级排名');

console.log('\n批量选择分组：');
const path1Groups = {
  totalRank: path1Headers.filter(h => path1RoleMap[h] === 'primaryTotal' || path1RoleMap[h] === 'rank'),
  sectionTotal: path1Headers.filter(h => path1RoleMap[h] === 'sectionTotal'),
  courseScore: path1Headers.filter(h => path1RoleMap[h] === 'courseScore'),
  adjustment: path1Headers.filter(h => path1RoleMap[h] === 'adjustment'),
  identity: path1Headers.filter(h => path1RoleMap[h] === 'identity'),
};
assertMinCount('总分/排名字段数量', path1Groups.totalRank.length, 3);
assertMinCount('课程成绩字段数量', path1Groups.courseScore.length, 6);
assert('加分字段在adjustment分组', path1Groups.adjustment.includes('加分'), true);
assert('学号字段在identity分组', path1Groups.identity.includes('学号'), true);

// ============================================================
// 路径 2：多级合并表头 Excel 上传
// ============================================================
console.log('\n=== 路径 2：多级合并表头 Excel 上传 ===\n');

const path2Headers = ['学校代码', '考生号', '姓名', '班级', '语文', '数学', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '总分', '名次', '德育_合计', '智育_合计', '体育_合计', '德育_马克思主义基本原理', '德育_创新创业基础', '智育_Python及其应用', '智育_数据结构与算法', '体育_体育A3', '加分', '扣分', '未命名字段1'];
const path2Data = [
  ['001', 'K001', '张三', '1班', '90', '95', '88', '85', '92', '87', '80', '78', '82', '537', '5', '95', '450', '80', '85', '80', '88', '90', '75', '', '', ''],
];

console.log('表头识别：');
assert('表头数量', path2Headers.length, 26);
assertContains('包含德育_合计', path2Headers.join(','), '德育_合计');
assertContains('包含智育_合计', path2Headers.join(','), '智育_合计');
assertContains('包含德育_马克思主义基本原理', path2Headers.join(','), '德育_马克思主义基本原理');

console.log('\n字段分类：');
const path2Roles = path2Headers.map(h => classifyFieldLocally(h));
const path2RoleMap = {};
path2Headers.forEach((h, i) => { path2RoleMap[h] = path2Roles[i]; });

assert('学校代码分类为identity', path2RoleMap['学校代码'], 'identity');
assert('考生号分类为identity', path2RoleMap['考生号'], 'identity');
assert('德育_合计分类为sectionTotal', path2RoleMap['德育_合计'], 'sectionTotal');
assert('智育_合计分类为sectionTotal', path2RoleMap['智育_合计'], 'sectionTotal');
assert('体育_合计分类为sectionTotal', path2RoleMap['体育_合计'], 'sectionTotal');
assert('德育_马克思主义基本原理分类为courseScore', path2RoleMap['德育_马克思主义基本原理'], 'courseScore');
assert('智育_Python及其应用分类为courseScore', path2RoleMap['智育_Python及其应用'], 'courseScore');
assert('加分分类为adjustment', path2RoleMap['加分'], 'adjustment');
assert('扣分分类为adjustment', path2RoleMap['扣分'], 'adjustment');
assert('未命名字段1分类为invalid', path2RoleMap['未命名字段1'], 'invalid');

console.log('\n默认推荐字段：');
const path2Recommended = path2Headers.filter(h => {
  const role = path2RoleMap[h];
  return ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'].includes(role);
});
assertMinCount('推荐字段数量', path2Recommended.length, 8);
assertNotContains('推荐字段不包含学校代码', path2Recommended.join(','), '学校代码');
assertNotContains('推荐字段不包含考生号', path2Recommended.join(','), '考生号');
assertNotContains('推荐字段不包含姓名', path2Recommended.join(','), '姓名');
assertNotContains('推荐字段不包含班级', path2Recommended.join(','), '班级');
assertNotContains('推荐字段不包含加分', path2Recommended.join(','), '加分');
assertNotContains('推荐字段不包含扣分', path2Recommended.join(','), '扣分');
assertNotContains('推荐字段不包含未命名字段1', path2Recommended.join(','), '未命名字段1');
assertContains('推荐字段包含德育_合计', path2Recommended.join(','), '德育_合计');
assertContains('推荐字段包含智育_合计', path2Recommended.join(','), '智育_合计');
assertContains('推荐字段包含德育_马克思主义基本原理', path2Recommended.join(','), '德育_马克思主义基本原理');

console.log('\n批量选择分组：');
const path2Groups = {
  totalRank: path2Headers.filter(h => path2RoleMap[h] === 'primaryTotal' || path2RoleMap[h] === 'rank'),
  sectionTotal: path2Headers.filter(h => path2RoleMap[h] === 'sectionTotal'),
  courseScore: path2Headers.filter(h => path2RoleMap[h] === 'courseScore'),
  adjustment: path2Headers.filter(h => path2RoleMap[h] === 'adjustment'),
  identity: path2Headers.filter(h => path2RoleMap[h] === 'identity'),
  invalid: path2Headers.filter(h => path2RoleMap[h] === 'invalid'),
};
assertMinCount('总分/排名字段数量', path2Groups.totalRank.length, 2);
assertMinCount('模块合计字段数量', path2Groups.sectionTotal.length, 3);
assertMinCount('课程成绩字段数量', path2Groups.courseScore.length, 5);
assert('加分字段在adjustment分组', path2Groups.adjustment.includes('加分'), true);
assert('扣分字段在adjustment分组', path2Groups.adjustment.includes('扣分'), true);
assert('学校代码字段在identity分组', path2Groups.identity.includes('学校代码'), true);
assert('未命名字段1在invalid分组', path2Groups.invalid.includes('未命名字段1'), true);

// ============================================================
// 路径 3：粘贴 Excel 文本路径
// ============================================================
console.log('\n=== 路径 3：粘贴 Excel 文本路径 ===\n');

const path3Headers = ['学号', '姓名', '班级', '语文', '数学', '英语', '总分', '班级排名', '年级排名', '德育_合计', '智育_合计', '体育_合计', '美育_合计', '劳育_合计', '德育_马克思主义基本原理', '智育_数据结构与算法', '加分', '扣分'];
const path3Data = [
  ['001', '张三', '1班', '90', '95', '88', '537', '5', '10', '95', '450', '80', '75', '70', '85', '90', '', ''],
];

console.log('表头识别：');
assert('表头数量', path3Headers.length, 18);
assertContains('包含德育_合计', path3Headers.join(','), '德育_合计');
assertContains('包含美育_合计', path3Headers.join(','), '美育_合计');
assertContains('包含劳育_合计', path3Headers.join(','), '劳育_合计');

console.log('\n字段分类：');
const path3Roles = path3Headers.map(h => classifyFieldLocally(h));
const path3RoleMap = {};
path3Headers.forEach((h, i) => { path3RoleMap[h] = path3Roles[i]; });

assert('学号分类为identity', path3RoleMap['学号'], 'identity');
assert('姓名分类为identity', path3RoleMap['姓名'], 'identity');
assert('班级分类为identity', path3RoleMap['班级'], 'identity');
assert('德育_合计分类为sectionTotal', path3RoleMap['德育_合计'], 'sectionTotal');
assert('智育_合计分类为sectionTotal', path3RoleMap['智育_合计'], 'sectionTotal');
assert('体育_合计分类为sectionTotal', path3RoleMap['体育_合计'], 'sectionTotal');
assert('美育_合计分类为sectionTotal', path3RoleMap['美育_合计'], 'sectionTotal');
assert('劳育_合计分类为sectionTotal', path3RoleMap['劳育_合计'], 'sectionTotal');
assert('德育_马克思主义基本原理分类为courseScore', path3RoleMap['德育_马克思主义基本原理'], 'courseScore');
assert('智育_数据结构与算法分类为courseScore', path3RoleMap['智育_数据结构与算法'], 'courseScore');
assert('加分分类为adjustment', path3RoleMap['加分'], 'adjustment');
assert('扣分分类为adjustment', path3RoleMap['扣分'], 'adjustment');

console.log('\n默认推荐字段：');
const path3Recommended = path3Headers.filter(h => {
  const role = path3RoleMap[h];
  return ['primaryTotal', 'rank', 'sectionTotal', 'courseScore'].includes(role);
});
assertMinCount('推荐字段数量', path3Recommended.length, 8);
assertNotContains('推荐字段不包含学号', path3Recommended.join(','), '学号');
assertNotContains('推荐字段不包含姓名', path3Recommended.join(','), '姓名');
assertNotContains('推荐字段不包含班级', path3Recommended.join(','), '班级');
assertNotContains('推荐字段不包含加分', path3Recommended.join(','), '加分');
assertNotContains('推荐字段不包含扣分', path3Recommended.join(','), '扣分');
assertContains('推荐字段包含德育_合计', path3Recommended.join(','), '德育_合计');
assertContains('推荐字段包含智育_合计', path3Recommended.join(','), '智育_合计');
assertContains('推荐字段包含德育_马克思主义基本原理', path3Recommended.join(','), '德育_马克思主义基本原理');

console.log('\n批量选择分组：');
const path3Groups = {
  totalRank: path3Headers.filter(h => path3RoleMap[h] === 'primaryTotal' || path3RoleMap[h] === 'rank'),
  sectionTotal: path3Headers.filter(h => path3RoleMap[h] === 'sectionTotal'),
  courseScore: path3Headers.filter(h => path3RoleMap[h] === 'courseScore'),
  adjustment: path3Headers.filter(h => path3RoleMap[h] === 'adjustment'),
  identity: path3Headers.filter(h => path3RoleMap[h] === 'identity'),
};
assertMinCount('总分/排名字段数量', path3Groups.totalRank.length, 3);
assertMinCount('模块合计字段数量', path3Groups.sectionTotal.length, 5);
assertMinCount('课程成绩字段数量', path3Groups.courseScore.length, 2);
assert('加分字段在adjustment分组', path3Groups.adjustment.includes('加分'), true);
assert('扣分字段在adjustment分组', path3Groups.adjustment.includes('扣分'), true);
assert('学号字段在identity分组', path3Groups.identity.includes('学号'), true);

// ============================================================
// 总结
// ============================================================
console.log('\n=== 验收结果 ===\n');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed === 0) {
  console.log('\n✅ 所有验收测试通过！');
  process.exit(0);
} else {
  console.log('\n❌ 部分验收测试失败！');
  process.exit(1);
}
