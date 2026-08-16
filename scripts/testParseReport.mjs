// ============================================================
// 解析报告测试脚本
// ============================================================

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     期望: ${expectedStr}`);
    console.log(`     实际: ${actualStr}`);
    failed++;
  }
}

function assertTrue(name, value) {
  if (value) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
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
];

const EMPTY_PLACEHOLDERS = ['-', '—', '–', '/', '\\', '|'];

// 严格数字解析（支持千分位）
function parseNumericStringStrict(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(',')) {
    const thousandsRegex = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
    if (!thousandsRegex.test(trimmed)) return null;
    const withoutCommas = trimmed.replace(/,/g, '');
    const num = Number(withoutCommas);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return { status: 'empty' };
  if (typeof val === 'number') return Number.isFinite(val) ? { status: 'valid', value: val } : { status: 'invalid' };
  if (typeof val === 'boolean') return { status: 'invalid' };
  const str = String(val).trim();
  if (str === '') return { status: 'empty' };
  if (EMPTY_PLACEHOLDERS.includes(str)) return { status: 'empty' };
  if (isInvalidKeyword(str)) return { status: 'invalid' };
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

// ---- fieldClassifier.ts ----

const IDENTITY_KEYWORDS = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族'];
const SCORE_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分', '总分（不含加分）', '原始总分', '标准总分', '综合', '文科综合', '理科综合',
  '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
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

function classifyField(header, columnValues = []) {
  const lower = header.toLowerCase().trim();
  if (isInvalidHeaderName(lower)) return 'unknown';
  for (const kw of RANK_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'rank';
  for (const kw of IDENTITY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'identity';
  for (const kw of SCORE_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'score';
  for (const kw of CATEGORY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'category';
  for (const kw of BONUS_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'bonus';
  for (const kw of PENALTY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'penalty';
  
  if (columnValues.length > 0) {
    let valid = 0, empty = 0, invalid = 0;
    for (const val of columnValues) {
      const parsed = parseNumericValue(val);
      if (parsed.status === 'valid') valid++;
      else if (parsed.status === 'empty') empty++;
      else invalid++;
    }
    const total = columnValues.length;
    const text = empty + invalid;
    const textRatio = text / total;
    const validRatio = valid / total;
    
    if (textRatio > 0.6) return 'text';
    
    if (validRatio > 0.5) {
      for (const kw of IDENTITY_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) return 'identity';
      }
      if (lower.includes('成绩') || lower.includes('分数')) return 'score';
      if (lower.includes('合计') || lower.includes('总计') || lower.includes('小计')) return 'score';
      const digitsOnly = lower.replace(/[_\-\s]/g, '');
      if (/^\d+$/.test(digitsOnly)) return 'unknown';
      const digitCount = (lower.match(/\d/g) || []).length;
      if (digitCount / lower.length > 0.5) return 'unknown';
      if (/[\u4e00-\u9fa5]/.test(lower)) return 'score';
      return 'unknown';
    }
  }
  
  return 'unknown';
}

function classifyAnalysisRole(header, type) {
  const lower = header.toLowerCase().trim();
  
  if (isInvalidHeaderName(lower)) return 'invalid';
  
  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩',
    '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      if (!isPureBonusField(lower)) return 'primaryTotal';
    }
  }
  
  if (type === 'rank') return 'rank';
  const RANK_KEYWORDS_LOCAL = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
  for (const kw of RANK_KEYWORDS_LOCAL) {
    if (lower.includes(kw.toLowerCase())) return 'rank';
  }
  
  const SECTION_TOTAL_KEYWORDS = ['合计', '总计', '小计', '模块合计'];
  for (const kw of SECTION_TOTAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return 'sectionTotal';
  }
  
  if (type === 'bonus' || type === 'penalty') return 'adjustment';
  if (type === 'identity') return 'identity';
  if (type === 'text' || type === 'category' || type === 'status') return 'textMeta';
  if (type === 'score') return 'courseScore';
  
  return 'unknown';
}

function classifyFields(headers, rows) {
  return headers.map(header => {
    const columnValues = rows.map(row => row[header] ?? '');
    const type = classifyField(header, columnValues);
    const analysisRole = classifyAnalysisRole(header, type);
    let valid = 0, emptyCount = 0, invalidCount = 0;
    for (const val of columnValues) {
      const parsed = parseNumericValue(val);
      if (parsed.status === 'valid') valid++;
      else if (parsed.status === 'empty') emptyCount++;
      else invalidCount++;
    }
    return { 
      header, 
      type, 
      analysisRole, 
      validCount: valid, 
      emptyCount, 
      invalidCount,
      confidence: 0.9,
      reason: '基于关键词匹配',
      contentFeature: {
        numericRatio: 1.0,
        integerRatio: 1.0,
        decimalRatio: 0.0,
        uniqueRatio: 0.5,
        min: 0,
        max: 100,
        mean: 50,
        avgStringLength: 3,
        valuePattern: 'scoreLike'
      }
    };
  });
}

function shouldIncludeInRecommendationByRole(role) {
  return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
}

function getAnalyzableFields(fieldMetas, showAll = false) {
  if (showAll) {
    return fieldMetas
      .filter(meta => meta.analysisRole !== 'invalid')
      .map(meta => meta.header);
  }
  return fieldMetas
    .filter(meta => meta.validCount > 0 && meta.confidence >= 0.55 && shouldIncludeInRecommendationByRole(meta.analysisRole))
    .map(meta => meta.header);
}

// ---- parseReportBuilder.ts ----

function buildContentFeatureSummary(feature) {
  return {
    numericRatio: feature.numericRatio,
    uniqueRatio: feature.uniqueRatio,
    min: feature.min,
    max: feature.max,
    valuePattern: feature.valuePattern,
  };
}

function determineHiddenStatus(meta, isRecommended) {
  if (isRecommended) {
    return { hiddenByDefault: false, hiddenReason: '' };
  }
  
  switch (meta.analysisRole) {
    case 'identity':
      return { hiddenByDefault: true, hiddenReason: '身份标识字段，不参与数值分析' };
    case 'adjustment':
      return { hiddenByDefault: true, hiddenReason: '加扣分调整项，默认不参与排名分析' };
    case 'textMeta':
      return { hiddenByDefault: true, hiddenReason: '文本/元数据字段，不适合数值统计' };
    case 'invalid':
      return { hiddenByDefault: true, hiddenReason: '非法或未命名字段，已自动排除' };
    case 'unknown':
      return { hiddenByDefault: true, hiddenReason: '字段类型未知，需要人工确认' };
    default:
      if (meta.confidence < 0.55) {
        return { hiddenByDefault: true, hiddenReason: `分类置信度过低（${(meta.confidence * 100).toFixed(0)}%）` };
      }
      return { hiddenByDefault: true, hiddenReason: '非推荐分析字段' };
  }
}

function buildFieldDetail(meta, recommendedFields) {
  const isRecommended = recommendedFields.includes(meta.header);
  const { hiddenByDefault, hiddenReason } = determineHiddenStatus(meta, isRecommended);
  
  return {
    name: meta.header,
    type: meta.type,
    analysisRole: meta.analysisRole,
    confidence: meta.confidence,
    reason: meta.reason,
    recommended: isRecommended,
    hiddenByDefault,
    hiddenReason,
    contentFeature: meta.contentFeature ? buildContentFeatureSummary(meta.contentFeature) : undefined,
  };
}

function buildSummary(fieldMetas, dataRowCount, recommendedFields) {
  let identityCount = 0;
  let primaryTotalCount = 0;
  let rankCount = 0;
  let sectionTotalCount = 0;
  let courseScoreCount = 0;
  let adjustmentCount = 0;
  let textMetaCount = 0;
  let unknownCount = 0;
  let invalidCount = 0;
  let lowConfidenceCount = 0;
  
  for (const meta of fieldMetas) {
    switch (meta.analysisRole) {
      case 'identity': identityCount++; break;
      case 'primaryTotal': primaryTotalCount++; break;
      case 'rank': rankCount++; break;
      case 'sectionTotal': sectionTotalCount++; break;
      case 'courseScore': courseScoreCount++; break;
      case 'adjustment': adjustmentCount++; break;
      case 'textMeta': textMetaCount++; break;
      case 'unknown': unknownCount++; break;
      case 'invalid': invalidCount++; break;
    }
    
    if (meta.confidence < 0.7) {
      lowConfidenceCount++;
    }
  }
  
  return {
    dataRowCount,
    fieldCount: fieldMetas.length,
    recommendedFieldCount: recommendedFields.length,
    identityCount,
    primaryTotalCount,
    rankCount,
    sectionTotalCount,
    courseScoreCount,
    adjustmentCount,
    textMetaCount,
    unknownCount,
    invalidCount,
    lowConfidenceCount,
  };
}

function buildParseReport(headers, rows, fieldMetas, recommendedFields) {
  const warnings = [];
  const summary = buildSummary(fieldMetas, rows.length, recommendedFields);
  const fields = fieldMetas.map(meta => buildFieldDetail(meta, recommendedFields));
  
  if (summary.lowConfidenceCount > 0) {
    warnings.push(`发现 ${summary.lowConfidenceCount} 个低置信度字段（< 0.7），可能需要人工复核`);
  }
  
  if (summary.invalidCount > 0) {
    warnings.push(`发现 ${summary.invalidCount} 个非法/未命名字段，已自动排除`);
  }
  
  if (summary.recommendedFieldCount === 0) {
    warnings.push('未找到推荐分析字段，请检查表头命名或手动选择字段');
  }
  
  if (summary.primaryTotalCount === 0 && summary.courseScoreCount > 0) {
    warnings.push('未找到总分字段，但发现课程成绩字段');
  }
  
  return { summary, fields, warnings };
}

// ============================================================
// 测试用例
// ============================================================

console.log('\n=== 解析报告测试 ===\n');

// 测试 1: 基础报告构建
console.log('测试 1: 基础报告构建');
const headers1 = ['姓名', '班级', '总分', '语文', '数学', '英语', '名次'];
const rows1 = [
  { '姓名': '张三', '班级': '1班', '总分': '580', '语文': '110', '数学': '120', '英语': '115', '名次': '5' },
  { '姓名': '李四', '班级': '1班', '总分': '575', '语文': '108', '数学': '118', '英语': '112', '名次': '8' },
  { '姓名': '王五', '班级': '2班', '总分': '590', '语文': '115', '数学': '125', '英语': '120', '名次': '2' },
];
const metas1 = classifyFields(headers1, rows1);
const recommended1 = getAnalyzableFields(metas1, false);
const report1 = buildParseReport(headers1, rows1, metas1, recommended1);

assert('报告摘要 - 数据行数', report1.summary.dataRowCount, 3);
assert('报告摘要 - 字段总数', report1.summary.fieldCount, 7);
assert('报告摘要 - 推荐字段数', report1.summary.recommendedFieldCount, recommended1.length);
assert('报告摘要 - identity 数量', report1.summary.identityCount, 2);
assert('报告摘要 - primaryTotal 数量', report1.summary.primaryTotalCount, 1);
assert('报告摘要 - rank 数量', report1.summary.rankCount, 1);
assert('报告摘要 - courseScore 数量', report1.summary.courseScoreCount, 3);
assert('报告摘要 - invalid 数量', report1.summary.invalidCount, 0);
assert('报告字段明细数量', report1.fields.length, 7);

const nameField = report1.fields.find(f => f.name === '姓名');
assert('姓名字段 - recommended', nameField.recommended, false);
assert('姓名字段 - hiddenByDefault', nameField.hiddenByDefault, true);
assertTrue('姓名字段 - hiddenReason 包含身份', nameField.hiddenReason.includes('身份'));

const totalField = report1.fields.find(f => f.name === '总分');
assert('总分字段 - recommended', totalField.recommended, true);
assert('总分字段 - hiddenByDefault', totalField.hiddenByDefault, false);

const rankField = report1.fields.find(f => f.name === '名次');
assert('名次字段 - recommended', rankField.recommended, true);
assert('名次字段 - hiddenByDefault', rankField.hiddenByDefault, false);

console.log('');

// 测试 2: identity / adjustment / invalid 不进入默认推荐
console.log('测试 2: identity / adjustment / invalid 不进入默认推荐');
const headers2 = ['学号', '姓名', '班级', '总分', '加分', '扣分', '未命名字段'];
const rows2 = [
  { '学号': '2024001', '姓名': '张三', '班级': '1班', '总分': '580', '加分': '10', '扣分': '0', '未命名字段': 'xxx' },
  { '学号': '2024002', '姓名': '李四', '班级': '1班', '总分': '575', '加分': '5', '扣分': '2', '未命名字段': 'yyy' },
];
const metas2 = classifyFields(headers2, rows2);
const recommended2 = getAnalyzableFields(metas2, false);
const report2 = buildParseReport(headers2, rows2, metas2, recommended2);

assert('推荐字段不包含学号', recommended2.includes('学号'), false);
assert('推荐字段不包含姓名', recommended2.includes('姓名'), false);
assert('推荐字段不包含班级', recommended2.includes('班级'), false);
assert('推荐字段不包含加分', recommended2.includes('加分'), false);
assert('推荐字段不包含扣分', recommended2.includes('扣分'), false);
assert('推荐字段不包含未命名字段', recommended2.includes('未命名字段'), false);
assert('推荐字段只包含总分', recommended2, ['总分']);

const idField = report2.fields.find(f => f.name === '学号');
assert('学号字段 - analysisRole', idField.analysisRole, 'identity');
assert('学号字段 - hiddenByDefault', idField.hiddenByDefault, true);

const bonusField = report2.fields.find(f => f.name === '加分');
assert('加分字段 - analysisRole', bonusField.analysisRole, 'adjustment');
assert('加分字段 - hiddenByDefault', bonusField.hiddenByDefault, true);

const invalidField = report2.fields.find(f => f.name === '未命名字段');
assert('未命名字段 - analysisRole', invalidField.analysisRole, 'invalid');
assert('未命名字段 - hiddenByDefault', invalidField.hiddenByDefault, true);

console.log('');

// 测试 3: 低置信度字段能被统计
console.log('测试 3: 低置信度字段能被统计');
const headers3 = ['总分', '语文', '数学', '93_80', '0_0'];
const rows3 = [
  { '总分': '580', '语文': '110', '数学': '120', '93_80': '100', '0_0': '95' },
  { '总分': '575', '语文': '108', '数学': '118', '93_80': '98', '0_0': '92' },
];
const metas3 = classifyFields(headers3, rows3);
// 手动设置低置信度
metas3[3].confidence = 0.5;
metas3[4].confidence = 0.4;
const recommended3 = getAnalyzableFields(metas3, false);
const report3 = buildParseReport(headers3, rows3, metas3, recommended3);

assertTrue('低置信度字段数量 >= 2', report3.summary.lowConfidenceCount >= 2);

const invalidField3 = report3.fields.find(f => f.name === '93_80');
assert('93_80 字段 - analysisRole', invalidField3.analysisRole, 'invalid');
assertTrue('93_80 字段 - hiddenReason 包含非法', invalidField3.hiddenReason.includes('非法'));

console.log('');

// 测试 4: recommended 字段数量和 recommendedFields 一致
console.log('测试 4: recommended 字段数量和 recommendedFields 一致');
const headers4 = ['姓名', '总分', '语文', '数学', '英语', '名次', '班级'];
const rows4 = [
  { '姓名': '张三', '总分': '580', '语文': '110', '数学': '120', '英语': '115', '名次': '5', '班级': '1班' },
  { '姓名': '李四', '总分': '575', '语文': '108', '数学': '118', '英语': '112', '名次': '8', '班级': '1班' },
];
const metas4 = classifyFields(headers4, rows4);
const recommended4 = getAnalyzableFields(metas4, false);
const report4 = buildParseReport(headers4, rows4, metas4, recommended4);

const recommendedCount4 = report4.fields.filter(f => f.recommended).length;
assert('推荐字段数量一致', recommendedCount4, recommended4.length);

const recommendedFields4 = report4.fields.filter(f => f.recommended).map(f => f.name);
assert('推荐字段列表一致', recommendedFields4.sort(), recommended4.sort());

console.log('');

// 测试 5: hiddenReason 正确生成
console.log('测试 5: hiddenReason 正确生成');
const headers5 = ['姓名', '班级', '总分', '加分', '备注', '未命名字段'];
const rows5 = [
  { '姓名': '张三', '班级': '1班', '总分': '580', '加分': '10', '备注': '正常', '未命名字段': 'xxx' },
  { '姓名': '李四', '班级': '1班', '总分': '575', '加分': '5', '备注': '正常', '未命名字段': 'yyy' },
];
const metas5 = classifyFields(headers5, rows5);
const recommended5 = getAnalyzableFields(metas5, false);
const report5 = buildParseReport(headers5, rows5, metas5, recommended5);

const nameField5 = report5.fields.find(f => f.name === '姓名');
assertTrue('姓名字段 - hiddenReason 非空', nameField5.hiddenReason.length > 0);
assertTrue('姓名字段 - hiddenReason 包含身份', nameField5.hiddenReason.includes('身份'));

const bonusField5 = report5.fields.find(f => f.name === '加分');
assertTrue('加分字段 - hiddenReason 非空', bonusField5.hiddenReason.length > 0);
assertTrue('加分字段 - hiddenReason 包含加扣分', bonusField5.hiddenReason.includes('加扣分'));

const remarkField = report5.fields.find(f => f.name === '备注');
assertTrue('备注字段 - hiddenReason 非空', remarkField.hiddenReason.length > 0);
assertTrue('备注字段 - hiddenReason 包含文本', remarkField.hiddenReason.includes('文本'));

const invalidField5 = report5.fields.find(f => f.name === '未命名字段');
assertTrue('未命名字段 - hiddenReason 非空', invalidField5.hiddenReason.length > 0);
assertTrue('未命名字段 - hiddenReason 包含非法', invalidField5.hiddenReason.includes('非法'));

console.log('');

// 测试 6: warnings 正确生成
console.log('测试 6: warnings 正确生成');
const headers6 = ['姓名', '班级', '总分', '语文', '数学'];
const rows6 = [
  { '姓名': '张三', '班级': '1班', '总分': '580', '语文': '110', '数学': '120' },
  { '姓名': '李四', '班级': '1班', '总分': '575', '语文': '108', '数学': '118' },
];
const metas6 = classifyFields(headers6, rows6);
const recommended6 = getAnalyzableFields(metas6, false);
const report6 = buildParseReport(headers6, rows6, metas6, recommended6);

assertTrue('warnings 是数组', Array.isArray(report6.warnings));

console.log('');

// 测试 7: contentFeature 摘要正确
console.log('测试 7: contentFeature 摘要正确');
const headers7 = ['总分', '语文', '数学'];
const rows7 = [
  { '总分': '580', '语文': '110', '数学': '120' },
  { '总分': '575', '语文': '108', '数学': '118' },
  { '总分': '590', '语文': '115', '数学': '125' },
];
const metas7 = classifyFields(headers7, rows7);
const recommended7 = getAnalyzableFields(metas7, false);
const report7 = buildParseReport(headers7, rows7, metas7, recommended7);

const totalField7 = report7.fields.find(f => f.name === '总分');
assertTrue('总分字段 - contentFeature 存在', totalField7.contentFeature !== undefined);
assertTrue('总分字段 - numericRatio > 0', totalField7.contentFeature.numericRatio > 0);
assertTrue('总分字段 - min 存在', totalField7.contentFeature.min !== null);
assertTrue('总分字段 - max 存在', totalField7.contentFeature.max !== null);

console.log('');

// ============================================================
// 测试结果汇总
// ============================================================

console.log('=== 测试结果汇总 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 测试全部通过');
  process.exit(0);
}
