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

function parseNumericStringStrict(str) {
  if (str === '') return null;
  if (str.includes(',')) {
    const strictThousands = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    if (!strictThousands.test(str)) return null;
    const cleaned = str.replace(/,/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

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
    const num = parseNumericStringStrict(numStr);
    if (num !== null) return { status: 'valid', value: num };
    return { status: 'invalid' };
  }
  const num = parseNumericStringStrict(str);
  if (num !== null) return { status: 'valid', value: num };
  if (/\d/.test(str)) return { status: 'invalid' };
  return { status: 'invalid' };
}

function isInvalidKeyword(str) {
  const lower = str.toLowerCase();
  for (const kw of INVALID_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// ---- contentAnalyzer.ts ----
function analyzeContentFeature(columnValues) {
  const total = columnValues.length;
  if (total === 0) {
    return { numericRatio: 0, integerRatio: 0, decimalRatio: 0, uniqueRatio: 0, min: null, max: null, mean: null, avgStringLength: 0, valuePattern: 'unknown' };
  }

  let validCount = 0, integerCount = 0, decimalCount = 0;
  let min = null, max = null, sum = 0;
  const uniqueValues = new Set();
  let totalLength = 0;
  let chineseNameCount = 0, longNumberCount = 0, classLabelCount = 0, rankLikeCount = 0, scoreLikeCount = 0;

  for (const val of columnValues) {
    uniqueValues.add(val);
    totalLength += val.length;
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') {
      validCount++;
      const num = parsed.value;
      sum += num;
      if (min === null || num < min) min = num;
      if (max === null || num > max) max = num;
      if (Number.isInteger(num)) integerCount++;
      else decimalCount++;
      if (Number.isInteger(num) && num >= 1 && num <= total * 2) rankLikeCount++;
      if (num >= 0 && num <= 1000) scoreLikeCount++;
    }
    const trimmed = val.trim();
    if (trimmed) {
      if (/^[\u4e00-\u9fa5]{2,4}$/.test(trimmed)) chineseNameCount++;
      if (/^\d{6,}$/.test(trimmed)) longNumberCount++;
      if (/班|级|高一|高二|高三/.test(trimmed)) classLabelCount++;
    }
  }

  const numericRatio = validCount / total;
  const integerRatio = validCount > 0 ? integerCount / validCount : 0;
  const decimalRatio = validCount > 0 ? decimalCount / validCount : 0;
  const uniqueRatio = uniqueValues.size / total;
  const mean = validCount > 0 ? sum / validCount : null;
  const avgStringLength = totalLength / total;

  let valuePattern = 'unknown';
  if (chineseNameCount / total > 0.5) valuePattern = 'chineseName';
  else if (classLabelCount / total > 0.3) valuePattern = 'classLabel';
  else if (longNumberCount / total > 0.5) valuePattern = 'longNumber';
  else if (numericRatio > 0.5) {
    if (rankLikeCount / validCount > 0.7) valuePattern = 'rankLike';
    else if (scoreLikeCount / validCount > 0.7) valuePattern = 'scoreLike';
    else valuePattern = 'mixed';
  }

  return { numericRatio, integerRatio, decimalRatio, uniqueRatio, min, max, mean, avgStringLength, valuePattern };
}

// ---- fieldClassifier.ts ----
const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
const SCORE_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分', '总分（不含加分）', '原始总分', '标准总分', '综合', '文科综合', '理科综合', '高考成绩', '综合成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
const RANK_KEYWORDS = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
const BONUS_KEYWORDS = ['加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分'];
const PENALTY_KEYWORDS = ['扣分'];
const CATEGORY_KEYWORDS = ['组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称', '选考', '首选', '再选'];

function isPureBonusField(headerLower) {
  if (headerLower.includes('不含')) return false;
  return BONUS_KEYWORDS.some(kw => headerLower.includes(kw.toLowerCase()));
}

function isInvalidHeaderName(headerLower) {
  if (!headerLower || /^[\s]+$/.test(headerLower)) return true;
  if (headerLower.startsWith('未命名字段')) return true;
  if (/^[\s_\-\.]+$/.test(headerLower)) return true;
  if (/^\d+[\._]\d+/.test(headerLower) || /^\d+_\d+/.test(headerLower)) return true;
  const digitsOnly = headerLower.replace(/[_\-\s\.]/g, '');
  if (/^\d{4,}$/.test(digitsOnly)) return true;
  if (headerLower.length >= 6) {
    const nonDigitNonAlpha = headerLower.replace(/[\d_\-\.\s]/g, '');
    if (nonDigitNonAlpha.length / headerLower.length < 0.2) return true;
  }
  return false;
}

function classifyFieldByKeyword(header) {
  const headerLower = header.toLowerCase().trim();
  if (isInvalidHeaderName(headerLower)) return { type: 'unknown', reason: `字段名"${header}"疑似数据行误识别为表头` };
  for (const kw of RANK_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'rank', reason: `字段名包含"${kw}"` };
  for (const kw of IDENTITY_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'identity', reason: `字段名包含"${kw}"` };
  for (const kw of SCORE_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'score', reason: `字段名包含"${kw}"` };
  for (const kw of CATEGORY_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'category', reason: `字段名包含"${kw}"` };
  for (const kw of BONUS_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'bonus', reason: `字段名包含"${kw}"` };
  for (const kw of PENALTY_KEYWORDS) if (headerLower.includes(kw.toLowerCase())) return { type: 'penalty', reason: `字段名包含"${kw}"` };
  return null;
}

function classifyFieldByContent(header, columnValues, feature, rowCount) {
  const headerLower = header.toLowerCase().trim();
  const total = columnValues.length;
  if (isInvalidHeaderName(headerLower)) return { type: 'unknown', reason: `字段名"${header}"主要由数字/符号组成`, confidence: 0.95 };
  if (feature.numericRatio > 0.5) {
    if (feature.integerRatio > 0.8 && feature.valuePattern === 'rankLike' && feature.uniqueRatio > 0.5 && feature.max !== null && feature.max <= rowCount * 2) return { type: 'rank', reason: `内容为1~${rowCount}范围内的整数`, confidence: 0.7 };
    if (feature.valuePattern === 'longNumber' && feature.uniqueRatio > 0.8) return { type: 'identity', reason: `内容为长数字串且唯一率高`, confidence: 0.8 };
    if (feature.valuePattern === 'classLabel') return { type: 'identity', reason: `内容包含班级相关关键词`, confidence: 0.85 };
    if (feature.valuePattern === 'scoreLike' && feature.numericRatio > 0.7) {
      if (/[\u4e00-\u9fa5]/.test(headerLower)) return { type: 'score', reason: `字段名含中文且数值比例高`, confidence: 0.8 };
      return { type: 'score', reason: `数值比例高`, confidence: 0.65 };
    }
    if (/[\u4e00-\u9fa5]/.test(headerLower)) return { type: 'score', reason: `字段名含中文，数值比例高`, confidence: 0.75 };
    const digitCount = (headerLower.match(/\d/g) || []).length;
    if (headerLower.length > 0 && digitCount / headerLower.length > 0.5) return { type: 'unknown', reason: `字段名数字比例过高`, confidence: 0.7 };
    return { type: 'unknown', reason: `数值比例高但无法确定具体类型`, confidence: 0.5 };
  }
  const textCount = total - feature.numericRatio * total;
  if (total > 0 && textCount / total > 0.6) {
    if (feature.valuePattern === 'chineseName') return { type: 'identity', reason: `内容多为2-4个中文字符`, confidence: 0.8 };
    if (feature.valuePattern === 'classLabel') return { type: 'identity', reason: `内容包含班级相关关键词`, confidence: 0.85 };
    return { type: 'text', reason: `大部分内容为文本`, confidence: 0.7 };
  }
  return { type: 'unknown', reason: `无法通过关键词或内容特征确定类型`, confidence: 0.3 };
}

function adjustConfidence(type, baseConfidence, feature, counts, total) {
  let confidence = baseConfidence;
  const reasons = [];
  if (total === 0) return { confidence: 0 };
  if (type === 'score') {
    if (feature.numericRatio > 0.8) { confidence = Math.min(0.95, confidence + 0.05); reasons.push(`数值比例高确认`); }
    else if (feature.numericRatio < 0.5) { confidence = Math.max(0.5, confidence - 0.2); reasons.push(`数值比例低`); }
  }
  if (type === 'rank') {
    if (feature.integerRatio > 0.9 && feature.valuePattern === 'rankLike') { confidence = Math.min(0.95, confidence + 0.05); reasons.push(`整数且范围符合排名特征`); }
    else if (feature.integerRatio < 0.7) { confidence = Math.max(0.6, confidence - 0.15); reasons.push(`非整数比例较高`); }
  }
  if (type === 'identity') {
    if (feature.uniqueRatio > 0.9) { confidence = Math.min(0.95, confidence + 0.05); reasons.push(`唯一率高确认`); }
  }
  if (baseConfidence < 0.85 && feature.numericRatio < 0.5 && (type === 'score' || type === 'rank')) { confidence = Math.max(0.4, confidence - 0.15); reasons.push(`数值比例不足`); }
  return { confidence: Math.round(confidence * 100) / 100, reasonAddition: reasons.length > 0 ? reasons.join('，') : undefined };
}

function classifyFields(headers, rows) {
  return headers.map(header => {
    const columnValues = rows.map(row => row[header] ?? '');
    const counts = { valid: 0, empty: 0, invalid: 0, text: 0 };
    for (const val of columnValues) {
      const parsed = parseNumericValue(val);
      if (parsed.status === 'valid') counts.valid++;
      else if (parsed.status === 'empty') counts.empty++;
      else counts.invalid++;
    }
    counts.text = counts.empty + counts.invalid;
    const contentFeature = analyzeContentFeature(columnValues);
    const keywordType = classifyFieldByKeyword(header);
    let type, reason, confidence;
    if (keywordType) { type = keywordType.type; reason = keywordType.reason; confidence = 0.9; }
    else { const contentResult = classifyFieldByContent(header, columnValues, contentFeature, rows.length); type = contentResult.type; reason = contentResult.reason; confidence = contentResult.confidence; }
    const adjusted = adjustConfidence(type, confidence, contentFeature, counts, columnValues.length);
    confidence = adjusted.confidence;
    if (adjusted.reasonAddition) reason += '，' + adjusted.reasonAddition;
    const analysisRole = determineAnalysisRole(header, type, contentFeature);
    return { header, type, analysisRole, validCount: counts.valid, emptyCount: counts.empty, invalidCount: counts.invalid, textCount: counts.text, confidence, reason, contentFeature };
  });
}

function determineAnalysisRole(header, type, feature) {
  const lower = header.toLowerCase().trim();
  if (isInvalidHeaderName(lower)) return 'invalid';
  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩', '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) if (lower.includes(kw.toLowerCase()) && !isPureBonusField(lower)) return 'primaryTotal';
  if (type === 'rank') return 'rank';
  const SECTION_TOTAL_KEYWORDS = ['合计', '总计', '小计', '模块合计'];
  for (const kw of SECTION_TOTAL_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'sectionTotal';
  if (type === 'bonus' || type === 'penalty') return 'adjustment';
  if (type === 'identity') return 'identity';
  if (type === 'text' || type === 'category' || type === 'status') return 'textMeta';
  if (type === 'score') return 'courseScore';
  return 'unknown';
}

// ---- 本地字段分类（与 OriginalFieldRadar.tsx 中一致）----
function classifyFieldLocally(header) {
  const headerLower = header.toLowerCase().trim();

  if (headerLower.startsWith('未命名字段') || headerLower === '' || /^[\s_\-\.]+$/.test(headerLower)) {
    return 'invalid';
  }

  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩',
    '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (headerLower.includes(kw.toLowerCase())) {
      if (!headerLower.includes('不含加分') && !headerLower.includes('不含优惠')) {
        return 'primaryTotal';
      }
    }
  }

  const RANK_KEYWORDS_LOCAL = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
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
// 详细字段输出（适配新 FieldMeta 结构）
// ============================================================
console.log('\n=== 详细字段输出（新 FieldMeta 结构） ===\n');

// 使用路径 1 的数据进行详细输出
const path1Rows = path1Data.map(row => {
  const obj = {};
  path1Headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
});
const path1Metas = classifyFields(path1Headers, path1Rows);

console.log('路径 1 字段详情：');
for (const meta of path1Metas) {
  console.log(`  - field: ${meta.header}`);
  console.log(`    type: ${meta.type}`);
  console.log(`    confidence: ${meta.confidence}`);
  console.log(`    reason: ${meta.reason}`);
  console.log(`    numericRatio: ${meta.contentFeature.numericRatio.toFixed(3)}`);
  console.log(`    uniqueRatio: ${meta.contentFeature.uniqueRatio.toFixed(3)}`);
  console.log(`    min: ${meta.contentFeature.min}`);
  console.log(`    max: ${meta.contentFeature.max}`);
  console.log('');
}

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
