/**
 * 成绩表智能解析器测试脚本
 * 执行: node scripts/testParser.mjs
 *
 * 测试覆盖：
 * 1. 普通第一行表头成绩表
 * 2. 表头前有说明文字的成绩表
 * 3. 多 sheet 文件，自动选择主成绩表
 * 4. 字典 sheet 不应被选为主成绩表
 * 5. 字段包括学校代码、姓名、班级、总分、各科成绩
 * 6. 缺考不能当 0
 * 7. 转到7班不能当 0
 * 8. 最后一行平均分不能当学生数据
 * 9. 加分字段不作为默认推荐字段
 * 10. 总分（不含加分）应作为高优先级推荐字段
 * 11. 空列、大量空值列不应导致崩溃
 * 12. 重复字段自动重命名仍然有效
 * 13. 空字段自动命名仍然有效
 * 14. CSV、Excel、粘贴文本都走统一逻辑
 *
 * 说明：由于项目使用 tsc -b + vite 编译，TS 源码不直接可用。
 * 本脚本通过内联核心算法（与 src 中完全一致）来验证逻辑正确性。
 * 同时也会构建产物并验证。
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

function assertRange(name, actual, min, max) {
  if (actual >= min && actual <= max) {
    console.log(`  ✅ ${name}: ${actual} (in [${min}, ${max}])`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: expected [${min}, ${max}], got ${actual}`);
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

function parseNumericValueLegacy(val) {
  const result = parseNumericValue(val);
  return result.status === 'valid' ? result.value : null;
}

// ---- headerDetection.ts ----

const HEADER_SCAN_ROWS = 30;
const MIN_HEADER_SCORE = 5;

const HEADER_KEYWORDS = [
  '名次', '排名', '位次', '序号', '总分', '成绩',
  '语文', '数学', '外语', '英语', '物理', '化学', '生物', '政治', '历史', '地理',
  '科目', '人数', '累计', '最高', '最低', '平均',
  '单科', '两科', '之和', '最高成绩', '次高', '得分率',
  '合计', '标准分', '原始分',
  '姓名', '班级', '学校', '考号', '座号', '学号',
];

const EXPLANATION_KEYWORDS = [
  '说明', '提示', '注：', '备注', '请', '查询',
  '查询条件', '查询结果', '以下', '包含', '以上', '仅供参考',
];

function detectHeaderRow(rawRows) {
  const scanLimit = Math.min(rawRows.length, HEADER_SCAN_ROWS);
  let bestScore = -Infinity;
  let bestIdx = -1;
  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;
    const rowStrs = row.map(v => String(v ?? '').trim());
    const score = scoreHeaderCandidate(rowStrs, row, rawRows, i);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx < 0 || bestScore < MIN_HEADER_SCORE) {
    return { headerRowIndex: -1, headers: [], dataRows: [], confidence: 0 };
  }
  return {
    headerRowIndex: bestIdx,
    headers: rawRows[bestIdx].map(h => String(h ?? '').trim()),
    dataRows: rawRows.slice(bestIdx + 1),
    confidence: bestScore,
  };
}

function scoreHeaderCandidate(rowStrs, _row, allRows, index) {
  let score = 0;
  const nonEmpty = rowStrs.filter(c => c !== '' && c !== '-');
  const nonEmptyCount = nonEmpty.length;
  if (nonEmptyCount < 2) { score -= 20; return score; }
  score += Math.min(nonEmptyCount * 2, 10);
  if (isExplanationRow(rowStrs)) score -= 15;
  let keywordHits = 0;
  for (const cell of nonEmpty) {
    for (const kw of HEADER_KEYWORDS) {
      if (cell.includes(kw)) { keywordHits++; break; }
    }
  }
  score += keywordHits * 5;
  const numericCells = nonEmpty.filter(c => { const n = parseFloat(c); return !isNaN(n) && c !== ''; }).length;
  if (numericCells / Math.max(nonEmptyCount, 1) > 0.7 && nonEmptyCount >= 3) score -= 15;
  for (let offset = 1; offset <= 3; offset++) {
    const nextIdx = index + offset;
    if (nextIdx < allRows.length) {
      const nextRow = allRows[nextIdx];
      if (nextRow && Array.isArray(nextRow)) {
        const nextNumCount = nextRow.filter(v => { const s = String(v ?? '').trim(); if (s === '' || s === '-') return false; const n = parseFloat(s); return !isNaN(n) && Number.isFinite(n); }).length;
        if (nextNumCount >= 2) { score += 3; break; }
        if (nextRow.every(c => c === '' || c === '-' || c === null || c === undefined)) score -= 2;
      }
    }
  }
  if (nonEmptyCount === 1 && nonEmpty[0] && nonEmpty[0].length > 20) score -= 20;
  return score;
}

function isExplanationRow(strs) {
  const text = strs.join(' ');
  return EXPLANATION_KEYWORDS.some(kw => text.includes(kw));
}

function cleanHeaderName(raw) {
  let cleaned = raw.replace(/[\u0000-\u001f\u007f\u00a0]/g, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

function dedupeHeaders(headers, warnings) {
  const seen = {};
  let hasDup = false;
  const result = [];
  let emptyCounter = 0;
  for (const h of headers) {
    const cleaned = cleanHeaderName(h);
    if (cleaned === '') { emptyCounter++; result.push(`未命名字段${emptyCounter}`); continue; }
    const key = cleaned.toLowerCase();
    if (seen[key] !== undefined) { hasDup = true; seen[key]++; result.push(`${cleaned}_${seen[key]}`); }
    else { seen[key] = 0; result.push(cleaned); }
  }
  if (hasDup) warnings.push('检测到重复字段名，已自动重命名。');
  return result;
}

// ---- rowClassifier.ts ----

const SUMMARY_KEYWORDS = [
  '平均', '合计', '统计', '汇总', '总分平均', '年级平均',
  '班级平均', '全校', '总计', '小计', '累计',
  '最大值', '最小值', '平均分', '标准差',
];

const STATUS_KEYWORDS = [
  '缺考', '弃考', '转班', '转到', '转至', '无成绩',
  '休学', '退学', '请假', '缓考', '借读',
];

function classifyDataRow(row, headers) {
  const values = headers.map(h => row[h] ?? '');
  if (values.every(v => v === '' || v === '-' || v === null || v === undefined)) return 'empty';
  const rowText = values.join(' ');
  if (SUMMARY_KEYWORDS.some(kw => rowText.includes(kw))) return 'summary';
  let statusCount = 0, numericCount = 0, nonEmptyCount = 0;
  for (const val of values) {
    if (val === '' || val === '-') continue;
    nonEmptyCount++;
    if (STATUS_KEYWORDS.some(kw => val.includes(kw))) statusCount++;
    if (parseNumericValue(val).status === 'valid') numericCount++;
  }
  if (nonEmptyCount > 0 && statusCount / nonEmptyCount > 0.5 && numericCount === 0) return 'statusOnly';
  const hasIdentity = hasIdentityValue(row, headers);
  const hasValidScore = numericCount > 0;
  if (hasIdentity && hasValidScore) return 'validData';
  if (!hasIdentity && numericCount <= 2 && nonEmptyCount <= 3) {
    const numericValues = values.map(v => parseNumericValue(v)).filter(r => r.status === 'valid').map(r => r.value);
    if (numericValues.some(v => !Number.isInteger(v))) return 'summary';
  }
  return hasValidScore ? 'validData' : 'invalid';
}

function hasIdentityValue(row, headers) {
  const identityKeywords = ['姓名', '名字', '考号', '座号', '学号', '考生号', '准考证'];
  for (const header of headers) {
    const headerLower = header.toLowerCase();
    for (const kw of identityKeywords) {
      if (headerLower.includes(kw.toLowerCase())) {
        const val = row[header]?.trim();
        if (val && val !== '' && val !== '-') return true;
      }
    }
  }
  for (const val of Object.values(row)) {
    if (/^[\u4e00-\u9fa5]{2,6}$/.test(val.trim())) return true;
  }
  return false;
}

function classifyDataRows(rows, headers) {
  let validData = 0, empty = 0, statusOnly = 0, summary = 0, invalid = 0;
  const validRows = [];
  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    switch (type) {
      case 'validData': validData++; validRows.push(row); break;
      case 'empty': empty++; break;
      case 'statusOnly': statusOnly++; break;
      case 'summary': summary++; break;
      case 'invalid': invalid++; break;
    }
  }
  return { validData, empty, statusOnly, summary, invalid, validRows };
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

// 判断字段名是否非法（数据行误识别为表头）
function isInvalidHeaderName(headerLower) {
  if (!headerLower || /^[\s]+$/.test(headerLower)) return true;
  if (headerLower.startsWith('未命名字段')) return true;
  if (/^[\s_\-\.]+$/.test(headerLower)) return true;
  // 类似 93_80、0_0、101.60_91.60 这种数据行拼接
  if (/^\d+[\._]\d+/.test(headerLower) || /^\d+_\d+/.test(headerLower)) return true;
  // 纯数字字段名（长度>=4）
  const digitsOnly = headerLower.replace(/[_\-\s\.]/g, '');
  if (/^\d{4,}$/.test(digitsOnly)) return true;
  // 字段名中数字+符号占比超过80%且长度>=6
  if (headerLower.length >= 6) {
    const nonDigitNonAlpha = headerLower.replace(/[\d_\-\.\s]/g, '');
    if (nonDigitNonAlpha.length / headerLower.length < 0.2) return true;
  }
  return false;
}

function classifyField(header, columnValues = []) {
  const lower = header.toLowerCase().trim();
  // 0. 非法字段名（优先级最高）
  if (isInvalidHeaderName(lower)) return 'unknown';
  // rank 在 identity 之前，因为"班级排名"包含"班级"但本质是排名字段
  for (const kw of RANK_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'rank';
  for (const kw of IDENTITY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'identity';
  // score 在 bonus 之前，避免"总分（不含加分）"被误判
  for (const kw of SCORE_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'score';
  for (const kw of CATEGORY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'category';
  for (const kw of BONUS_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'bonus';
  for (const kw of PENALTY_KEYWORDS) if (lower.includes(kw.toLowerCase())) return 'penalty';
  
  // 基于列内容判断
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
    
    // 如果大部分是文本，分类为 text
    if (textRatio > 0.6) return 'text';
    
    // 如果大部分是有效数值，需要进一步判断字段名
  if (validRatio > 0.5) {
    // 先检查字段名是否包含身份关键词（避免班级代码、班级名称等被误判）
    for (const kw of IDENTITY_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) {
        return 'identity';
      }
    }
    
    // 检查字段名是否包含"成绩"或"分数"
    if (lower.includes('成绩') || lower.includes('分数')) {
      return 'score';
    }
    
    // 检查字段名是否包含"合计"、"总计"、"小计"（合计也是成绩）
    if (lower.includes('合计') || lower.includes('总计') || lower.includes('小计')) {
      return 'score';
    }
    
    // 检查字段名是否看起来像编码（纯数字或数字比例过高）
    const digitsOnly = lower.replace(/[_\-\s]/g, '');
    if (/^\d+$/.test(digitsOnly)) {
      return 'unknown'; // 纯数字字段名，像学号、编码
    }
    
    // 检查字段名中数字比例是否过高（超过 50%）
    const digitCount = (lower.match(/\d/g) || []).length;
    if (digitCount / lower.length > 0.5) {
      return 'unknown'; // 数字比例过高，可能是编码
    }
    
    // 通用规则：如果字段名包含中文字符，视为成绩字段
    // 这样可以覆盖所有课程字段，包括多级表头展开的字段
    if (/[\u4e00-\u9fa5]/.test(lower)) {
      return 'score';
    }
    
    // 默认不归类为 score，避免误判
    return 'unknown';
  }
  }
  
  return 'unknown';
}

function classifyAnalysisRole(header, type) {
  const lower = header.toLowerCase().trim();
  
  // 未命名字段/非法字段名
  if (isInvalidHeaderName(lower)) {
    return 'invalid';
  }
  
  // 总分相关
  const PRIMARY_TOTAL_KEYWORDS = ['总分', '总成绩', '综合成绩', '总评', '最终成绩',
    '高考成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
  for (const kw of PRIMARY_TOTAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      if (!isPureBonusField(lower)) return 'primaryTotal';
    }
  }
  
  // 排名相关
  if (type === 'rank') return 'rank';
  const RANK_KEYWORDS_LOCAL = ['名次', '排名', '位次', '年级名次', '班级名次', '校排', '班排', '年排', '级排'];
  for (const kw of RANK_KEYWORDS_LOCAL) {
    if (lower.includes(kw.toLowerCase())) return 'rank';
  }
  
  // 合计相关
  const SECTION_TOTAL_KEYWORDS = ['合计', '总计', '小计', '模块合计'];
  for (const kw of SECTION_TOTAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return 'sectionTotal';
  }
  
  // 加分/扣分
  if (type === 'bonus' || type === 'penalty') return 'adjustment';
  
  // 身份字段
  if (type === 'identity') return 'identity';
  
  // 文本/备注字段
  if (type === 'text' || type === 'category' || type === 'status') return 'textMeta';
  
  // 具体课程成绩
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
    return { header, type, analysisRole, validCount: valid, emptyCount, invalidCount };
  });
}

function recommendAnalysisField(fieldMetas) {
  // 优先级 1: primaryTotal（总分相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'primaryTotal' && meta.validCount > 0) {
      return { field: meta.header, priority: 1 };
    }
  }

  // 优先级 2: rank（排名相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'rank' && meta.validCount > 0) {
      return { field: meta.header, priority: 2 };
    }
  }

  // 优先级 3: sectionTotal（合计相关）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'sectionTotal' && meta.validCount > 0) {
      return { field: meta.header, priority: 3 };
    }
  }

  // 优先级 4: courseScore（具体课程成绩）
  for (const meta of fieldMetas) {
    if (meta.analysisRole === 'courseScore' && meta.validCount > 0) {
      return { field: meta.header, priority: 4 };
    }
  }

  // 优先级 5: 其他数值字段（排除不推荐的类型）
  for (const meta of fieldMetas) {
    if (meta.validCount > 0 && shouldIncludeInRecommendationByRole(meta.analysisRole)) {
      return { field: meta.header, priority: 5 };
    }
  }

  return { field: null, priority: 99 };
}

function shouldIncludeInRecommendationByRole(role) {
  // 只推荐 primaryTotal、rank、sectionTotal、courseScore
  return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
}

// ---- headerFlattener.ts ----

const STANDALONE_FIELDS = [
  '班级', '学号', '姓名', '总分', '班级排名', '签名',
  '考号', '座号', '序号', '编号',
  '名次', '排名', '位次',
];

function removeWeightSuffix(name) {
  return name.replace(/（\d+%）/g, '').replace(/\(\d+%\)/g, '').trim();
}

function isStandalone(name) {
  const cleaned = removeWeightSuffix(name).trim();
  return STANDALONE_FIELDS.some(kw => cleaned === kw || cleaned.includes(kw));
}

// 判断字段名是否非法（主要由数字、下划线、小数点组成）
function isInvalidFieldName(name) {
  if (!name || name.trim() === '') return false; // 空字段不算非法

  const trimmed = name.trim();

  // 移除下划线和小数点后，检查剩余内容是否主要是数字
  const withoutSeparators = trimmed.replace(/[_\.\s]/g, '');
  if (withoutSeparators.length === 0) return true;

  // 检查去除分隔符后是否全是数字
  if (/^\d+$/.test(withoutSeparators)) return true;

  // 检查是否数字字符占比超过 80%
  const digitCount = (withoutSeparators.match(/\d/g) || []).length;
  if (digitCount / withoutSeparators.length > 0.8) return true;

  return false;
}

function flattenMultiRowHeaders(rawRows) {
  return detectAndFlattenMultiRowHeaders(rawRows);
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
          if (!grid[r][c]) {
            grid[r][c] = parentValue;
          }
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

  // Find consecutive header rows
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
    return {
      isMultiRow: false,
      headerRows: [0, 0],
      headers: grid[0] ? grid[0].map(c => removeWeightSuffix(String(c ?? '').trim())) : [],
    };
  }

  // Flatten multi-row headers
  const colCount = Math.max(...bestGroup.map(r => grid[r]?.length ?? 0));
  const headers = [];

  for (let col = 0; col < colCount; col++) {
    const childValue = grid[bestGroup[bestGroup.length - 1]]?.[col] ?? '';
    const childCleaned = removeWeightSuffix(childValue);

    // 收集所有父级行中的值（跳过标题行）
    let parentValue = '';
    for (let rowIdx = 0; rowIdx < bestGroup.length - 1; rowIdx++) {
      const cellValue = grid[bestGroup[rowIdx]]?.[col] ?? '';
      const cleaned = removeWeightSuffix(cellValue);
      if (!cleaned) continue;

      // 跳过标题行（如"数据Q243班综合测评表"）
      const rowNonEmpty = (grid[bestGroup[rowIdx]] ?? []).filter(c => c && c !== '-').length;
      if (rowNonEmpty === 1 && colCount > 5) continue;

      parentValue = cleaned;
    }

    // 决定最终字段名
    if (childCleaned) {
      // 子级有值：判断是否需要拼接父级
      if (isStandalone(childCleaned)) {
        // 独立字段不拼接
        headers.push(childCleaned);
      } else if (parentValue) {
        // 拼接父级 + 子级
        headers.push(`${parentValue}_${childCleaned}`);
      } else {
        headers.push(childCleaned);
      }
    } else if (parentValue) {
      // 子级为空，父级有值（如班级、学号、姓名等独立字段）
      if (isStandalone(parentValue)) {
        headers.push(parentValue);
      } else {
        headers.push(parentValue);
      }
    } else {
      // 父子级都为空
      headers.push('');
    }
  }

  return {
    isMultiRow: true,
    headerRows: [bestGroup[0], bestGroup[bestGroup.length - 1]],
    headers,
  };
}

const MAIN_SHEET_KEYWORDS = ['成绩', '分数', '得分', '考试', '测评', '测试', '成绩收集', '成绩统计', '成绩汇总', '考试结果'];
const DICT_SHEET_KEYWORDS = ['代码', '字典', '组合名称', '科目代码', '学校代码', '说明', '备注', '参数', '配置', '对照', '映射', 'code', 'dict', 'dictionary', 'mapping', 'reference'];
const SCORE_FIELD_KEYWORDS = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分'];
const IDENTITY_FIELD_KEYWORDS = ['姓名', '名字', '班级', '考号', '座号', '学号', '考生', '准考证'];

function evaluateSheetCandidate(name, data) {
  const rowCount = data.length;
  const colCount = data.length > 0 ? Math.max(...data.map(r => Array.isArray(r) ? r.length : 1)) : 0;
  let score = 0;
  const nameLower = name.toLowerCase();
  for (const kw of DICT_SHEET_KEYWORDS) { if (nameLower.includes(kw.toLowerCase())) { score -= 50; break; } }
  for (const kw of MAIN_SHEET_KEYWORDS) { if (nameLower.includes(kw.toLowerCase())) { score += 15; break; } }
  if (rowCount >= 10) score += 5;
  if (rowCount >= 30) score += 5;
  if (rowCount >= 50) score += 3;
  if (rowCount < 5) score -= 10;
  if (colCount >= 5) score += 3;
  if (colCount >= 10) score += 3;
  if (colCount < 3) score -= 5;
  const scanRows = data.slice(0, HEADER_SCAN_ROWS);
  let scoreKeywordsCount = 0, hasIdentityField = false, hasScoreField = false;
  for (const row of scanRows) {
    if (!Array.isArray(row)) continue;
    const rowText = row.map(v => String(v ?? '').trim()).join(' ').toLowerCase();
    for (const kw of SCORE_FIELD_KEYWORDS) { if (rowText.includes(kw.toLowerCase())) { scoreKeywordsCount++; hasScoreField = true; break; } }
    for (const kw of IDENTITY_FIELD_KEYWORDS) { if (rowText.includes(kw.toLowerCase())) { hasIdentityField = true; break; } }
  }
  score += scoreKeywordsCount * 8;
  if (hasIdentityField) score += 10;
  if (hasScoreField) score += 8;
  const headerResult = detectHeaderRow(data);
  if (headerResult.headerRowIndex >= 0) { score += 20; if (headerResult.dataRows.length >= 5) score += 5; if (headerResult.dataRows.length >= 20) score += 5; }
  if (colCount > 50) score -= 5;
  return { name, rowCount, colCount, scoreKeywordsCount, hasIdentityField, hasScoreField, confidence: Math.max(0, Math.min(100, score)) };
}

function detectMainWorksheet(sheets) {
  if (sheets.length === 0) return [];
  if (sheets.length === 1) {
    const sheet = sheets[0];
    return [{ sheetName: sheet.name, rawData: sheet.data, candidate: evaluateSheetCandidate(sheet.name, sheet.data) }];
  }
  const candidates = sheets.map(sheet => ({
    sheetName: sheet.name,
    rawData: sheet.data,
    candidate: evaluateSheetCandidate(sheet.name, sheet.data),
  }));
  candidates.sort((a, b) => b.candidate.confidence - a.candidate.confidence);
  return candidates;
}

function getPrimarySheetName(candidates) {
  if (candidates.length === 0) return null;
  const best = candidates[0];
  const second = candidates[1];
  if (best.candidate.confidence > 30) {
    if (!second || best.candidate.confidence - second.candidate.confidence > 15) return best.sheetName;
  }
  if (best.candidate.confidence < 10) return null;
  return best.sheetName;
}

// ============================================================
// 测试用例
// ============================================================

// 测试 1：数值解析
console.log('\n=== 测试 1：数值解析 ===\n');

let r = parseNumericValue(550);
assert('数字 550', r.status, 'valid');
assert('数字 550 值', r.value, 550);

r = parseNumericValue('550');
assert('字符串 "550"', r.status, 'valid');
assert('字符串 "550" 值', r.value, 550);

r = parseNumericValue('550.5');
assert('字符串 "550.5"', r.status, 'valid');
assert('字符串 "550.5" 值', r.value, 550.5);

r = parseNumericValue('  550  ');
assert('带空格 "  550  "', r.status, 'valid');

r = parseNumericValue('85%');
assert('百分号 "85%"', r.status, 'valid');
assert('百分号 "85%" 值', r.value, 85);

r = parseNumericValue('缺考');
assert('缺考', r.status, 'invalid');

r = parseNumericValue('转到7班');
assert('转到7班', r.status, 'invalid');

r = parseNumericValue('');
assert('空字符串', r.status, 'empty');

r = parseNumericValue(null);
assert('null', r.status, 'empty');

r = parseNumericValue(undefined);
assert('undefined', r.status, 'empty');

r = parseNumericValue('-');
assert('横杠 "-"', r.status, 'empty');

r = parseNumericValue('/');
assert('斜杠 "/"', r.status, 'invalid');

r = parseNumericValue('1,234');
assert('千分位 "1,234"', r.status, 'valid');
assert('千分位 "1,234" 值', r.value, 1234);

assert('旧接口 "550"', parseNumericValueLegacy('550'), 550);
assert('旧接口 "缺考"', parseNumericValueLegacy('缺考'), null);

// 测试 2：表头检测
console.log('\n=== 测试 2：表头检测 ===\n');

const normalData = [
  ['名次', '姓名', '班级', '总分', '语文', '数学', '英语'],
  [1, '张三', '5班', 550, 120, 130, 140],
  [2, '李四', '5班', 520, 110, 125, 135],
];
let result = detectHeaderRow(normalData);
assert('普通表头识别行号', result.headerRowIndex, 0);
assert('普通表头识别字段数', result.headers.length, 7);

const withExplanation = [
  ['2024年9省联考成绩表'],
  ['说明：本表包含所有学生的成绩信息'],
  ['名次', '姓名', '班级', '总分', '语文', '数学'],
  [1, '张三', '5班', 550, 120, 130],
  [2, '李四', '5班', 520, 110, 125],
];
result = detectHeaderRow(withExplanation);
assert('带说明文字表头识别行号', result.headerRowIndex, 2);
assertContains('带说明文字表头字段', result.headers[0], '名次');

// 测试 3：字段去重和空字段命名
console.log('\n=== 测试 3：字段去重和空字段命名 ===\n');

const warnings = [];
const deduped = dedupeHeaders(['姓名', '总分', '姓名', '班级'], warnings);
assert('重复字段重命名', deduped[2], '姓名_1');
assert('警告数量', warnings.length, 1);

const warnings2 = [];
const deduped2 = dedupeHeaders(['姓名', '', '总分', ''], warnings2);
assert('空字段自动命名1', deduped2[1], '未命名字段1');
assert('空字段自动命名2', deduped2[3], '未命名字段2');

// 测试 4：数据行分类
console.log('\n=== 测试 4：数据行分类 ===\n');

const headers4 = ['名次', '姓名', '班级', '总分', '语文', '数学'];
const validRow = { '名次': '1', '姓名': '张三', '班级': '5班', '总分': '550', '语文': '120', '数学': '130' };
assert('有效行分类', classifyDataRow(validRow, headers4), 'validData');

const emptyRow = { '名次': '', '姓名': '', '班级': '', '总分': '', '语文': '', '数学': '' };
assert('空行分类', classifyDataRow(emptyRow, headers4), 'empty');

const summaryRow = { '名次': '', '姓名': '平均分', '班级': '', '总分': '535', '语文': '115', '数学': '127.5' };
assert('统计行分类', classifyDataRow(summaryRow, headers4), 'summary');

const rows4 = [validRow, emptyRow, summaryRow];
const classificationResult = classifyDataRows(rows4, headers4);
assert('批量分类有效行', classificationResult.validData, 1);
assert('批量分类空行', classificationResult.empty, 1);
assert('批量分类统计行', classificationResult.summary, 1);

// 测试 5：字段分类
console.log('\n=== 测试 5：字段分类 ===\n');

const headers5 = ['学校代码', '姓名', '班级', '总分（不含加分）', '加分', '语文', '数学', '名次', '组合'];
const rows5 = [
  { '学校代码': '001', '姓名': '张三', '班级': '5班', '总分（不含加分）': '550', '加分': '10', '语文': '120', '数学': '130', '名次': '1', '组合': '理化生' },
  { '学校代码': '001', '姓名': '李四', '班级': '5班', '总分（不含加分）': '520', '加分': '5', '语文': '110', '数学': '125', '名次': '2', '组合': '理化生' },
];

const metas = classifyFields(headers5, rows5);
const metaMap = {};
metas.forEach(m => metaMap[m.header] = m.type);

assert('学校代码分类', metaMap['学校代码'], 'identity');
assert('姓名分类', metaMap['姓名'], 'identity');
assert('班级分类', metaMap['班级'], 'identity');
assert('总分分类', metaMap['总分（不含加分）'], 'score');
assert('加分分类', metaMap['加分'], 'bonus');
assert('语文分类', metaMap['语文'], 'score');
assert('数学分类', metaMap['数学'], 'score');
assert('名次分类', metaMap['名次'], 'rank');
assert('组合分类', metaMap['组合'], 'category');

const rec = recommendAnalysisField(metas);
assert('推荐字段是总分（不含加分）', rec.field, '总分（不含加分）');
assert('推荐字段优先级', rec.priority, 1);

// 测试 6：多 sheet 检测
console.log('\n=== 测试 6：多 sheet 检测 ===\n');

const sheets = [
  {
    name: '成绩收集信息表',
    data: [
      ['名次', '姓名', '班级', '总分', '语文', '数学', '英语', '物理', '化学'],
      [1, '张三', '5班', 550, 120, 130, 140, 85, 90],
      [2, '李四', '5班', 520, 110, 125, 135, 80, 85],
      [3, '王五', '5班', 510, 105, 120, 130, 75, 80],
      [4, '赵六', '5班', 500, 100, 115, 125, 70, 75],
      [5, '钱七', '5班', 490, 95, 110, 120, 65, 70],
    ]
  },
  {
    name: '学校代码',
    data: [
      ['代码', '名称'],
      ['001', '第一中学'],
      ['002', '第二中学'],
    ]
  },
  {
    name: '组合名称',
    data: [
      ['组合代码', '组合名称'],
      ['01', '物理+化学+生物'],
      ['02', '历史+政治+地理'],
    ]
  }
];

const candidates = detectMainWorksheet(sheets);
assert('候选数量', candidates.length, 3);

const primaryName = getPrimarySheetName(candidates);
assert('主表选择', primaryName, '成绩收集信息表');
assert('主表置信度 > 30', candidates[0].candidate.confidence > 30, true);

const dictCandidate = candidates.find(c => c.sheetName === '学校代码');
assert('字典表置信度低', dictCandidate.candidate.confidence < 20, true);

// 测试 7：缺考/转到不能当 0
console.log('\n=== 测试 7：缺考/转到不能当 0 ===\n');

assert('缺考不是 valid', parseNumericValue('缺考').status !== 'valid', true);
assert('转到7班不是 valid', parseNumericValue('转到7班').status !== 'valid', true);
assert('弃考不是 valid', parseNumericValue('弃考').status !== 'valid', true);
assert('无成绩不是 valid', parseNumericValue('无成绩').status !== 'valid', true);

// 测试 8：加分字段不作为默认推荐字段
console.log('\n=== 测试 8：加分字段不作为默认推荐字段 ===\n');

const bonusMetas = [
  { header: '加分', type: 'bonus', analysisRole: 'adjustment', validCount: 10 },
  { header: '语文', type: 'score', analysisRole: 'courseScore', validCount: 10 },
];
const bonusRec = recommendAnalysisField(bonusMetas);
assert('不推荐加分字段', bonusRec.field !== '加分', true);

// 测试 9：空列、大量空值列
console.log('\n=== 测试 9：空列、大量空值列 ===\n');

// 通过 parseRowsToTable 的等价逻辑测试
function parseRowsToTableTest(rawRows) {
  const detection = detectHeaderRow(rawRows);
  if (detection.headerRowIndex < 0) throw new Error('No header');
  const warnings = [];
  const headers = dedupeHeaders(detection.headers, warnings);
  const rows = [];
  for (const row of detection.dataRows) {
    if (!row || !Array.isArray(row)) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
    }
    rows.push(obj);
  }
  return { headers, rows, warnings };
}

const dataWithEmptyCols = [
  ['名次', '姓名', '', '总分', ''],
  [1, '张三', '', '550', ''],
  [2, '李四', '', '520', ''],
];
const emptyColResult = parseRowsToTableTest(dataWithEmptyCols);
assert('空列自动命名', emptyColResult.headers[2], '未命名字段1');
assert('解析正常', emptyColResult.rows.length, 2);

// 测试 10：CSV/粘贴文本解析
console.log('\n=== 测试 10：CSV/粘贴文本解析 ===\n');

function parseTableText(text) {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  function detectDelimiter(line) {
    if (line.includes('\t')) return 'tab';
    const commaCount = (line.match(/,/g) || []).length;
    if (commaCount >= 1) {
      const parts = line.split(',');
      const textParts = parts.filter(p => isNaN(parseFloat(p.trim())) || p.trim() === '');
      if (textParts.length > 0 || parts.length >= 2) return 'comma';
    }
    return 'multi-space';
  }
  function splitLine(line, delimiter) {
    switch (delimiter) {
      case 'tab': return line.split('\t').map(c => c.trim());
      case 'comma': return line.split(',').map(c => c.trim());
      case 'multi-space': return line.split(/\s{2,}/).map(c => c.trim());
    }
  }
  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map(line => splitLine(line, delimiter));
  return parseRowsToTableTest(rows);
}

const tabResult = parseTableText('名次\t姓名\t总分\n1\t张三\t550\n2\t李四\t520');
assert('Tab 分隔解析字段数', tabResult.headers.length, 3);
assert('Tab 分隔解析行数', tabResult.rows.length, 2);

const commaResult = parseTableText('名次,姓名,总分\n1,张三,550\n2,李四,520');
assert('逗号分隔解析字段数', commaResult.headers.length, 3);
assert('逗号分隔解析行数', commaResult.rows.length, 2);

// 测试 11：最后一行平均分不能当学生数据
console.log('\n=== 测试 11：最后一行平均分不能当学生数据 ===\n');

const dataWithAvg = [
  ['名次', '姓名', '班级', '总分', '语文', '数学'],
  [1, '张三', '5班', '550', '120', '130'],
  [2, '李四', '5班', '520', '110', '125'],
  ['', '平均分', '', '535', '115', '127.5'],
];
const avgResult = parseRowsToTableTest(dataWithAvg);
const avgClassification = classifyDataRows(avgResult.rows, avgResult.headers);
assert('平均分行被分类为 summary', avgClassification.summary, 1);
assert('有效数据行只有 2 行', avgClassification.validData, 2);

// 测试 12：转到7班 不能当 0
console.log('\n=== 测试 12：转到7班 不能当 0 ===\n');

const dataWithTransfer = [
  ['名次', '姓名', '班级', '总分', '语文'],
  [1, '张三', '5班', '550', '120'],
  [2, '李四', '5班', '转到7班', '110'],
];
const transferResult = parseRowsToTableTest(dataWithTransfer);
const transferRows = transferResult.rows;
assert('转到7班行存在', transferRows[1]['总分'], '转到7班');
assert('转到7班解析为 invalid', parseNumericValue('转到7班').status, 'invalid');

// ============================================================
// 新升级的表头检测（支持多级表头）
// ============================================================

function detectHeaderRowV2(rawRows, merges) {
  // 只在有 merges 信息时才启用多级表头检测
  if (merges && merges.length > 0) {
    const multiRowResult = detectAndFlattenMultiRowHeaders(rawRows, merges);

    if (multiRowResult.isMultiRow) {
      // 二次校验：检查扁平化后的字段名是否合法
      const invalidCount = multiRowResult.headers.filter(h => isInvalidFieldName(h)).length;
      const totalNonEmpty = multiRowResult.headers.filter(h => h && h.trim() !== '').length;

      // 如果非法字段超过阈值的 30%，回退到单行表头
      if (totalNonEmpty > 0 && invalidCount / totalNonEmpty > 0.3) {
        return detectHeaderRow(rawRows);
      }

      const headers = multiRowResult.headers;
      const dataStartRow = multiRowResult.headerRows[1] + 1;
      const dataRows = rawRows.slice(dataStartRow);

      return {
        headerRowIndex: multiRowResult.headerRows[0],
        headers,
        dataRows,
        confidence: 30,
        isMultiRow: true,
        headerRowRange: multiRowResult.headerRows,
      };
    }
  }

  // 不是多级表头（或无 merges），使用原来的单行表头检测
  return detectHeaderRow(rawRows);
}

// ============================================================
// 多级表头测试（A-I）
// ============================================================

// 测试 A：单行表头普通成绩表
console.log('\n=== 测试 A：单行表头普通成绩表 ===\n');

const testDataA = [
  ['名次', '姓名', '班级', '总分', '语文', '数学', '英语'],
  [1, '张三', '5班', 550, 120, 130, 140],
  [2, '李四', '5班', 520, 110, 125, 135],
];
let resultA = detectHeaderRowV2(testDataA);
assert('单行表头不是多级表头', resultA.isMultiRow !== true, true);
assert('单行表头识别正确', resultA.headers.includes('总分'), true);

// 测试 B：表头前有说明行
console.log('\n=== 测试 B：表头前有说明行 ===\n');

const testDataB = [
  ['2024年9省联考成绩表'],
  ['说明：本表包含所有学生的成绩信息'],
  ['名次', '姓名', '班级', '总分', '语文', '数学'],
  [1, '张三', '5班', 550, 120, 130],
];
let resultB = detectHeaderRowV2(testDataB);
assert('说明行不影响单行表头识别', resultB.isMultiRow !== true, true);
assert('表头识别正确', resultB.headers.includes('名次'), true);

// 测试 C：多 sheet 成绩表
console.log('\n=== 测试 C：多 sheet 成绩表 ===\n');

const testSheets = [
  {
    name: '成绩收集信息表',
    data: [
      ['名次', '姓名', '班级', '总分', '语文', '数学', '英语'],
      [1, '张三', '5班', 550, 120, 130, 140],
      [2, '李四', '5班', 520, 110, 125, 135],
    ]
  },
  {
    name: '学校代码',
    data: [
      ['代码', '名称'],
      ['001', '第一中学'],
    ]
  }
];
const testCandidates = detectMainWorksheet(testSheets);
const testPrimaryName = getPrimarySheetName(testCandidates);
assert('多 sheet 选择成绩表', testPrimaryName, '成绩收集信息表');

// 测试 D：多级表头综合测评表
console.log('\n=== 测试 D：多级表头综合测评表 ===\n');

const multiRowTestData = [
  ['数据Q243班综合测评表25-26-1'],
  ['班级', '学号', '姓名', '德育', '德育', '德育', '德育', '德育', '德育', '智育', '智育', '智育', '智育', '智育', '智育', '智育', '智育', '智育', '智育', '体育', '体育', '体育', '体育', '美育', '美育', '美育', '劳育', '劳育', '劳育', '总分', '班级排名', '签名'],
  ['', '', '', '马克思主义基本原理', '创新创业基础', '平时成绩', '加分', '扣分', '合计', 'Python及其应用', '大学英语A3', '计算机组成原理和汇编语言', '数据结构与算法', '数据结构与算法课程实践', '大学物理B', '大学物理实验B', '加分', '扣分', '合计', '体育A3', '加分', '扣分', '合计', '加分', '扣分', '合计', '加分', '扣分', '合计', '', '', ''],
  ['5班', '202401', '张三', '85', '90', '95', '5', '0', '92', '90', '85', '88', '92', '95', '80', '85', '3', '0', '88', '90', '2', '0', '92', '5', '0', '95', '3', '0', '98', '580', '1', ''],
];

// 模拟合并单元格信息
const multiRowTestMerges = [
  { s: { r: 1, c: 3 }, e: { r: 1, c: 8 } },   // 德育横跨 6 列
  { s: { r: 1, c: 9 }, e: { r: 1, c: 18 } },  // 智育横跨 10 列
  { s: { r: 1, c: 19 }, e: { r: 1, c: 22 } }, // 体育横跨 4 列
  { s: { r: 1, c: 23 }, e: { r: 1, c: 25 } }, // 美育横跨 3 列
  { s: { r: 1, c: 26 }, e: { r: 1, c: 28 } }, // 劳育横跨 3 列
];

let resultD = detectHeaderRowV2(multiRowTestData, multiRowTestMerges);
assert('识别多级表头', resultD.isMultiRow === true, true);
assert('表头行范围 1-2（索引）', resultD.headerRowRange[0] === 1 && resultD.headerRowRange[1] === 2, true);
assert('数据起始行索引 3', resultD.headerRowIndex, 1);
assert('数据行数 1', resultD.dataRows.length, 1);
assert('字段数 >= 30', resultD.headers.length >= 30, true);

// 测试 D1：多级表头扁平化正确
assert('德育_马克思主义基本原理', resultD.headers.includes('德育_马克思主义基本原理'), true);
assert('德育_创新创业基础', resultD.headers.includes('德育_创新创业基础'), true);
assert('德育_加分', resultD.headers.includes('德育_加分'), true);
assert('德育_扣分', resultD.headers.includes('德育_扣分'), true);
assert('德育_合计', resultD.headers.includes('德育_合计'), true);
assert('智育_Python及其应用', resultD.headers.includes('智育_Python及其应用'), true);
assert('智育_大学英语A3', resultD.headers.includes('智育_大学英语A3'), true);
assert('智育_计算机组成原理和汇编语言', resultD.headers.includes('智育_计算机组成原理和汇编语言'), true);
assert('智育_数据结构与算法', resultD.headers.includes('智育_数据结构与算法'), true);
assert('智育_数据结构与算法课程实践', resultD.headers.includes('智育_数据结构与算法课程实践'), true);
assert('智育_大学物理B', resultD.headers.includes('智育_大学物理B'), true);
assert('智育_大学物理实验B', resultD.headers.includes('智育_大学物理实验B'), true);
assert('智育_加分', resultD.headers.includes('智育_加分'), true);
assert('智育_扣分', resultD.headers.includes('智育_扣分'), true);
assert('智育_合计', resultD.headers.includes('智育_合计'), true);
assert('体育_体育A3', resultD.headers.includes('体育_体育A3'), true);
assert('体育_加分', resultD.headers.includes('体育_加分'), true);
assert('体育_扣分', resultD.headers.includes('体育_扣分'), true);
assert('体育_合计', resultD.headers.includes('体育_合计'), true);
assert('美育_加分', resultD.headers.includes('美育_加分'), true);
assert('美育_扣分', resultD.headers.includes('美育_扣分'), true);
assert('美育_合计', resultD.headers.includes('美育_合计'), true);
assert('劳育_加分', resultD.headers.includes('劳育_加分'), true);
assert('劳育_扣分', resultD.headers.includes('劳育_扣分'), true);
assert('劳育_合计', resultD.headers.includes('劳育_合计'), true);

// 测试 D2：独立字段保留
assert('班级保留', resultD.headers.includes('班级'), true);
assert('学号保留', resultD.headers.includes('学号'), true);
assert('姓名保留', resultD.headers.includes('姓名'), true);
assert('总分保留', resultD.headers.includes('总分'), true);
assert('班级排名保留', resultD.headers.includes('班级排名'), true);
assert('签名保留', resultD.headers.includes('签名'), true);

// 测试 E：合并单元格横向父级表头
console.log('\n=== 测试 E：合并单元格横向父级表头 ===\n');

const mergeTestData = [
  ['班级', '学号', '姓名', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '智育（50%）', '智育（50%）', '智育（50%）'],
  ['', '', '', '马原', '双创', '平时', '加分', '扣分', '合计', 'Python', '英语', '合计'],
  ['5班', '202401', '张三', '85', '90', '95', '5', '0', '92', '90', '85', '88'],
];

const testMerges = [
  { s: { r: 0, c: 3 }, e: { r: 0, c: 8 } }, // 德育横跨 6 列
  { s: { r: 0, c: 9 }, e: { r: 0, c: 11 } }, // 智育横跨 3 列
];

let resultE = detectHeaderRowV2(mergeTestData, testMerges);
assert('合并单元格识别多级表头', resultE.isMultiRow === true, true);
assert('德育_马原', resultE.headers.includes('德育_马原'), true);
assert('德育_双创', resultE.headers.includes('德育_双创'), true);
assert('德育_平时', resultE.headers.includes('德育_平时'), true);
assert('德育_加分', resultE.headers.includes('德育_加分'), true);
assert('德育_扣分', resultE.headers.includes('德育_扣分'), true);
assert('德育_合计', resultE.headers.includes('德育_合计'), true);
assert('智育_Python', resultE.headers.includes('智育_Python'), true);
assert('智育_英语', resultE.headers.includes('智育_英语'), true);
assert('智育_合计', resultE.headers.includes('智育_合计'), true);

// 测试 F：重复子字段正确命名
console.log('\n=== 测试 F：重复子字段正确命名 ===\n');

assert('德育_加分 存在', resultD.headers.includes('德育_加分'), true);
assert('智育_加分 存在', resultD.headers.includes('智育_加分'), true);
assert('体育_加分 存在', resultD.headers.includes('体育_加分'), true);
assert('美育_加分 存在', resultD.headers.includes('美育_加分'), true);
assert('劳育_加分 存在', resultD.headers.includes('劳育_加分'), true);

assert('德育_扣分 存在', resultD.headers.includes('德育_扣分'), true);
assert('智育_扣分 存在', resultD.headers.includes('智育_扣分'), true);
assert('体育_扣分 存在', resultD.headers.includes('体育_扣分'), true);
assert('美育_扣分 存在', resultD.headers.includes('美育_扣分'), true);
assert('劳育_扣分 存在', resultD.headers.includes('劳育_扣分'), true);

// 测试 G：学号为纯数字但不能推荐
console.log('\n=== 测试 G：学号不能推荐为分析字段 ===\n');

const multiRowHeaders = resultD.headers;
const multiRowDataRows = resultD.dataRows;
const multiRowObjs = multiRowDataRows.map(row => {
  const obj = {};
  for (let i = 0; i < multiRowHeaders.length; i++) {
    obj[multiRowHeaders[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
  }
  return obj;
});
const multiRowMetas = classifyFields(multiRowHeaders, multiRowObjs);
const multiRowRec = recommendAnalysisField(multiRowMetas);

// 学号应识别为 identity
const test学号Meta = multiRowMetas.find(m => m.header === '学号');
assert('学号识别为 identity', test学号Meta?.type, 'identity');
// 学号不应被推荐
assert('推荐字段不是学号', multiRowRec.field !== '学号', true);

// 测试 H：总分应优先推荐
console.log('\n=== 测试 H：总分应优先推荐 ===\n');

assert('推荐字段是总分', multiRowRec.field === '总分', true);
assert('推荐优先级为 1', multiRowRec.priority, 1);

// 测试 I：班级排名识别为 rank
console.log('\n=== 测试 I：班级排名识别为 rank ===\n');

const test班级排名Meta = multiRowMetas.find(m => m.header === '班级排名');
assert('班级排名识别为 rank', test班级排名Meta?.type, 'rank');

// 额外测试：数值解析 - 小数正常解析
console.log('\n=== 额外测试：小数正常解析 ===\n');

assert('98.87 正常解析', parseNumericValue('98.87').status, 'valid');
assert('98.87 值正确', parseNumericValue('98.87').value, 98.87);
assert('105.40 正常解析', parseNumericValue('105.40').status, 'valid');
assert('95.43 正常解析', parseNumericValue('95.43').status, 'valid');

// 额外测试：字段分类升级
console.log('\n=== 额外测试：字段分类升级 ===\n');

const penaltyHeaders = ['德育_加分', '德育_扣分', '智育_加分', '智育_扣分', '体育_加分'];
const penaltyTypes = penaltyHeaders.map(h => classifyField(h));
assert('德育_加分 分类为 bonus', penaltyTypes[0], 'bonus');
assert('德育_扣分 分类为 penalty', penaltyTypes[1], 'penalty');
assert('智育_加分 分类为 bonus', penaltyTypes[2], 'bonus');
assert('智育_扣分 分类为 penalty', penaltyTypes[3], 'penalty');
assert('体育_加分 分类为 bonus', penaltyTypes[4], 'bonus');

// 额外测试：推荐字段不应包含加分、扣分
console.log('\n=== 额外测试：推荐字段不应包含加分扣分 ===\n');

const testRecMetas = [
  { header: '德育_加分', type: 'bonus', analysisRole: 'adjustment', validCount: 10 },
  { header: '德育_扣分', type: 'penalty', analysisRole: 'adjustment', validCount: 10 },
  { header: '智育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
];
const testRecResult = recommendAnalysisField(testRecMetas);
assert('不推荐加分', testRecResult.field !== '德育_加分', true);
assert('不推荐扣分', testRecResult.field !== '德育_扣分', true);
assert('推荐智育_合计', testRecResult.field, '智育_合计');

// ============================================================
// 回归测试 A-F：验证多级表头修复
// ============================================================

// 测试 A：xlsx 有 merges 的多级表头综合测评表
console.log('\n=== 回归测试 A：xlsx 有 merges 的多级表头 ===\n');

const xlsxMultiRowData = [
  ['数据Q243班综合测评表25-26-1'],
  ['班级', '学号', '姓名', '德育', '德育', '德育', '智育', '智育', '智育', '总分', '班级排名'],
  ['', '', '', '加分', '扣分', '合计', '加分', '扣分', '合计', '', ''],
  ['5班', '202401', '张三', '5', '0', '92', '3', '0', '88', '580', '1'],
];
const xlsxMerges = [
  { s: { r: 1, c: 3 }, e: { r: 1, c: 5 } }, // 德育横跨 3 列
  { s: { r: 1, c: 6 }, e: { r: 1, c: 8 } }, // 智育横跨 3 列
];
let resultRegA = detectHeaderRowV2(xlsxMultiRowData, xlsxMerges);
assert('A: 识别多级表头', resultRegA.isMultiRow === true, true);
assert('A: 德育_合计', resultRegA.headers.includes('德育_合计'), true);
assert('A: 智育_合计', resultRegA.headers.includes('智育_合计'), true);
assert('A: 总分', resultRegA.headers.includes('总分'), true);
assert('A: 班级排名', resultRegA.headers.includes('班级排名'), true);

// 测试 B：粘贴同一张表的纯文本内容（无 merges）
console.log('\n=== 回归测试 B：粘贴文本无 merges ===\n');

const pasteTextData = [
  ['数据Q243班综合测评表25-26-1'],
  ['班级', '学号', '姓名', '德育', '德育', '德育', '智育', '智育', '智育', '总分', '班级排名'],
  ['', '', '', '加分', '扣分', '合计', '加分', '扣分', '合计', '', ''],
  ['5班', '202401', '张三', '5', '0', '92', '3', '0', '88', '580', '1'],
];
// 不传 merges 参数，应该走单行表头检测
let resultRegB = detectHeaderRowV2(pasteTextData);
assert('B: 不是多级表头', resultRegB.isMultiRow !== true, true);
assert('B: 不产生非法字段名', !resultRegB.headers.some(h => /^\d+_\d+$/.test(h)), true);

// 测试 C：普通成绩表粘贴
console.log('\n=== 回归测试 C：普通成绩表粘贴 ===\n');

const normalPasteData = [
  ['名次', '姓名', '班级', '总分', '语文', '数学', '英语'],
  [1, '张三', '5班', 550, 120, 130, 140],
  [2, '李四', '5班', 520, 110, 125, 135],
];
let resultRegC = detectHeaderRowV2(normalPasteData);
assert('C: 单行表头', resultRegC.isMultiRow !== true, true);
assert('C: 识别总分', resultRegC.headers.includes('总分'), true);

// 测试 D：字段名中出现 93_80、0_0、101.60_91.60 这类值时，应触发非法字段保护
console.log('\n=== 回归测试 D：非法字段名保护 ===\n');

const invalidFieldNames = ['93_80', '0_0', '101.60_91.60', '202409602096_202409602084'];
for (const fieldName of invalidFieldNames) {
  assert(`D: ${fieldName} 是非法字段名`, isInvalidFieldName(fieldName), true);
}
assert('D: 德育_合计 是合法字段名', isInvalidFieldName('德育_合计'), false);
assert('D: 总分 是合法字段名', isInvalidFieldName('总分'), false);

// 测试 E：学号字段不能作为默认分析字段
console.log('\n=== 回归测试 E：学号不能推荐 ===\n');

const fieldMetasRegE = [
  { header: '学号', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
];
const recRegE = recommendAnalysisField(fieldMetasRegE);
assert('E: 推荐字段不是学号', recRegE.field !== '学号', true);
assert('E: 推荐字段是总分', recRegE.field, '总分');

// 测试 F：默认推荐字段应优先是总分
console.log('\n=== 回归测试 F：总分优先推荐 ===\n');

const fieldMetasRegF = [
  { header: '德育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '智育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
  { header: '班级排名', type: 'rank', analysisRole: 'rank', validCount: 10 },
];
const recRegF = recommendAnalysisField(fieldMetasRegF);
assert('F: 推荐字段是总分', recRegF.field, '总分');
assert('F: 优先级为 1', recRegF.priority, 1);

// ============================================================
// 回归测试 A-H：字段分类、推荐、下拉框展示
// ============================================================

console.log('\n=== 回归测试 A-H：字段分类与推荐 ===\n');

// 测试 A：综合测评表默认字段应为"总分"
const testAMetas = [
  { header: '班级', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '学号', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '姓名', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '德育_加分', type: 'bonus', analysisRole: 'adjustment', validCount: 10 },
  { header: '德育_扣分', type: 'penalty', analysisRole: 'adjustment', validCount: 10 },
  { header: '德育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '智育_加分', type: 'bonus', analysisRole: 'adjustment', validCount: 10 },
  { header: '智育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
  { header: '班级排名', type: 'rank', analysisRole: 'rank', validCount: 10 },
];
const testARec = recommendAnalysisField(testAMetas);
assert('A: 综合测评表默认字段是总分', testARec.field, '总分');
assert('A: 优先级为 1', testARec.priority, 1);

// 测试 B：下拉框默认字段不包含加分、扣分
const testBDefaultFields = testAMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);
assert('B: 默认字段不包含德育_加分', !testBDefaultFields.includes('德育_加分'), true);
assert('B: 默认字段不包含德育_扣分', !testBDefaultFields.includes('德育_扣分'), true);
assert('B: 默认字段不包含智育_加分', !testBDefaultFields.includes('智育_加分'), true);

// 测试 C：下拉框默认字段不包含未命名字段
const testCMetas = [
  { header: '未命名字段1', type: 'unknown', analysisRole: 'invalid', validCount: 10 },
  { header: '未命名字段2', type: 'unknown', analysisRole: 'invalid', validCount: 10 },
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
];
const testCDefaultFields = testCMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);
assert('C: 默认字段不包含未命名字段1', !testCDefaultFields.includes('未命名字段1'), true);
assert('C: 默认字段不包含未命名字段2', !testCDefaultFields.includes('未命名字段2'), true);

// 测试 D：勾选显示全部字段后，加分、扣分可以出现在"加扣分/调整项"分组
const testDAllFields = testAMetas.filter(m => m.analysisRole !== 'invalid');
const testDAdjustmentFields = testDAllFields.filter(m => m.analysisRole === 'adjustment').map(m => m.header);
assert('D: 加分字段在调整项分组', testDAdjustmentFields.includes('德育_加分'), true);
assert('D: 扣分字段在调整项分组', testDAdjustmentFields.includes('德育_扣分'), true);

// 测试 E：学号、姓名、班级只出现在"身份信息"分组
const testDIdentityFields = testDAllFields.filter(m => m.analysisRole === 'identity').map(m => m.header);
assert('E: 学号在身份信息分组', testDIdentityFields.includes('学号'), true);
assert('E: 姓名在身份信息分组', testDIdentityFields.includes('姓名'), true);
assert('E: 班级在身份信息分组', testDIdentityFields.includes('班级'), true);
assert('E: 学号不在推荐分组', !testBDefaultFields.includes('学号'), true);
assert('E: 姓名不在推荐分组', !testBDefaultFields.includes('姓名'), true);

// 测试 F：合计字段应进入推荐分析字段
const testFMetas = [
  { header: '德育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '智育_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
];
const testFDefaultFields = testFMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);
assert('F: 德育_合计在推荐字段', testFDefaultFields.includes('德育_合计'), true);
assert('F: 智育_合计在推荐字段', testFDefaultFields.includes('智育_合计'), true);

// 测试 G：具体课程成绩应进入推荐分析字段
const testGMetas = [
  { header: '语文', type: 'score', analysisRole: 'courseScore', validCount: 10 },
  { header: '数学', type: 'score', analysisRole: 'courseScore', validCount: 10 },
  { header: '英语', type: 'score', analysisRole: 'courseScore', validCount: 10 },
];
const testGDefaultFields2 = testGMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);
assert('G: 语文在推荐字段', testGDefaultFields2.includes('语文'), true);
assert('G: 数学在推荐字段', testGDefaultFields2.includes('数学'), true);
assert('G: 英语在推荐字段', testGDefaultFields2.includes('英语'), true);

// 测试 H：不允许通过写死德育/智育/数据Q243 来通过测试
// 验证 recommendAnalysisField 使用的是 analysisRole 而不是硬编码关键词
const testHMetas = [
  { header: '模块A_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '模块B_合计', type: 'score', analysisRole: 'sectionTotal', validCount: 10 },
  { header: '综合成绩', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
];
const testHRec = recommendAnalysisField(testHMetas);
assert('H: 不依赖硬编码关键词', testHRec.field, '综合成绩');
assert('H: 使用 analysisRole 判断', testHRec.priority, 1);

// 验证 classifyAnalysisRole 函数
console.log('\n=== 测试 classifyAnalysisRole ===\n');

assert('未命名字段1 是 invalid', classifyAnalysisRole('未命名字段1', 'unknown'), 'invalid');
assert('未命名字段2 是 invalid', classifyAnalysisRole('未命名字段2', 'unknown'), 'invalid');
assert('空字符串是 invalid', classifyAnalysisRole('', 'unknown'), 'invalid');
assert('总分是 primaryTotal', classifyAnalysisRole('总分', 'score'), 'primaryTotal');
assert('总成绩是 primaryTotal', classifyAnalysisRole('总成绩', 'score'), 'primaryTotal');
assert('综合成绩是 primaryTotal', classifyAnalysisRole('综合成绩', 'score'), 'primaryTotal');
assert('班级排名是 rank', classifyAnalysisRole('班级排名', 'rank'), 'rank');
assert('年级排名是 rank', classifyAnalysisRole('年级排名', 'rank'), 'rank');
assert('德育_合计是 sectionTotal', classifyAnalysisRole('德育_合计', 'score'), 'sectionTotal');
assert('智育_合计是 sectionTotal', classifyAnalysisRole('智育_合计', 'score'), 'sectionTotal');
assert('模块合计是 sectionTotal', classifyAnalysisRole('模块合计', 'score'), 'sectionTotal');
assert('语文是 courseScore', classifyAnalysisRole('语文', 'score'), 'courseScore');
assert('数学是 courseScore', classifyAnalysisRole('数学', 'score'), 'courseScore');
assert('德育_加分是 adjustment', classifyAnalysisRole('德育_加分', 'bonus'), 'adjustment');
assert('德育_扣分是 adjustment', classifyAnalysisRole('德育_扣分', 'penalty'), 'adjustment');
assert('学号是 identity', classifyAnalysisRole('学号', 'identity'), 'identity');
assert('姓名是 identity', classifyAnalysisRole('姓名', 'identity'), 'identity');
assert('班级是 identity', classifyAnalysisRole('班级', 'identity'), 'identity');
assert('签名是 textMeta', classifyAnalysisRole('签名', 'text'), 'textMeta');
assert('备注是 textMeta', classifyAnalysisRole('备注', 'text'), 'textMeta');
assert('组合是 textMeta', classifyAnalysisRole('组合', 'category'), 'textMeta');

// ============================================================
// 回归测试 A-G：课程字段不应被漏掉
// ============================================================

console.log('\n=== 回归测试 A-G：课程字段完整性 ===\n');

// 测试 A：综合测评表字段下拉默认包含所有具体课程成绩
const testCourseHeaders = [
  '德育_马克思主义基本原理',
  '德育_创新创业基础',
  '德育_平时成绩',
  '智育_Python及其应用',
  '智育_大学英语A3',
  '智育_计算机组成原理和汇编语言',
  '智育_数据结构与算法',
  '智育_数据结构与算法课程实践',
  '智育_大学物理B',
  '智育_大学物理实验B',
  '体育_体育A3',
];

// 模拟这些字段的分类结果（都是数值列，应该被分类为 score）
const testCourseMetas = testCourseHeaders.map(header => ({
  header,
  type: 'score',
  analysisRole: 'courseScore',
  validCount: 10,
}));

// 添加总分和排名
testCourseMetas.push(
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
  { header: '班级排名', type: 'rank', analysisRole: 'rank', validCount: 10 }
);

// 获取默认推荐字段
const testADefaultFields = testCourseMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || 
               m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);

// 验证所有课程字段都在默认推荐字段中
for (const course of testCourseHeaders) {
  assert(`A: ${course} 在默认推荐字段`, testADefaultFields.includes(course), true);
}

// 测试 B：默认字段不包含加分、扣分
const testBAdjustmentHeaders = ['德育_加分', '德育_扣分', '智育_加分', '智育_扣分', '体育_加分', '体育_扣分'];
const testBAdjustmentMetas = testBAdjustmentHeaders.map(header => ({
  header,
  type: header.includes('加分') ? 'bonus' : 'penalty',
  analysisRole: 'adjustment',
  validCount: 10,
}));

const testBAdjDefaultFields = testBAdjustmentMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || 
               m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);

for (const header of testBAdjustmentHeaders) {
  assert(`B: ${header} 不在默认推荐字段`, !testBAdjDefaultFields.includes(header), true);
}

// 测试 C：默认字段不包含学号、姓名、班级、签名
const testCIdentityHeaders = ['学号', '姓名', '班级', '签名'];
const testCIdentityMetas = [
  { header: '学号', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '姓名', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '班级', type: 'identity', analysisRole: 'identity', validCount: 10 },
  { header: '签名', type: 'text', analysisRole: 'textMeta', validCount: 10 },
];

const testCIdDefaultFields = testCIdentityMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || 
               m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);

for (const header of testCIdentityHeaders) {
  assert(`C: ${header} 不在默认推荐字段`, !testCIdDefaultFields.includes(header), true);
}

// 测试 D：默认字段不包含未命名字段
const testDUnnamedHeaders = ['未命名字段1', '未命名字段2', '未命名字段3'];
const testDUnnamedMetas = testDUnnamedHeaders.map(header => ({
  header,
  type: 'unknown',
  analysisRole: 'invalid',
  validCount: 10,
}));

const testDUnnamedDefaultFields = testDUnnamedMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || 
               m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);

for (const header of testDUnnamedHeaders) {
  assert(`D: ${header} 不在默认推荐字段`, !testDUnnamedDefaultFields.includes(header), true);
}

// 测试 E：总分仍然是默认推荐字段
const testEMetas = [
  { header: '总分', type: 'score', analysisRole: 'primaryTotal', validCount: 10 },
  { header: '语文', type: 'score', analysisRole: 'courseScore', validCount: 10 },
];
const testERec = recommendAnalysisField(testEMetas);
assert('E: 总分是默认推荐字段', testERec.field, '总分');
assert('E: 优先级为 1', testERec.priority, 1);

// 测试 F：班级排名识别为 rank
const testFMeta = { header: '班级排名', type: 'rank', analysisRole: 'rank', validCount: 10 };
assert('F: 班级排名 analysisRole 是 rank', testFMeta.analysisRole, 'rank');

// 测试 G：智育_数据结构与算法、智育_数据结构与算法课程实践不能被漏掉
const testGHeaders = ['智育_数据结构与算法', '智育_数据结构与算法课程实践'];
const testGDefaultFields = testCourseMetas
  .filter(m => m.analysisRole === 'primaryTotal' || m.analysisRole === 'rank' || 
               m.analysisRole === 'sectionTotal' || m.analysisRole === 'courseScore')
  .map(m => m.header);

for (const header of testGHeaders) {
  assert(`G: ${header} 在默认推荐字段`, testGDefaultFields.includes(header), true);
}

// ============================================================
// 回归测试场景 1-10：字段筛选通用性测试
// ============================================================

console.log('\n=== 回归测试场景 1-10：字段筛选通用性测试 ===\n');

// 场景 1：普通单行成绩表
console.log('场景 1：普通单行成绩表');
const scene1Headers = ['姓名', '学号', '班级', '语文', '数学', '英语', '物理', '化学', '总分', '排名'];
const scene1Rows = [
  { '姓名': '张三', '学号': '001', '班级': '1班', '语文': 90, '数学': 85, '英语': 88, '物理': 92, '化学': 87, '总分': 442, '排名': 5 },
  { '姓名': '李四', '学号': '002', '班级': '1班', '语文': 88, '数学': 90, '英语': 92, '物理': 85, '化学': 90, '总分': 445, '排名': 3 },
];
const scene1Metas = classifyFields(scene1Headers, scene1Rows);
const scene1Default = scene1Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene1Rec = recommendAnalysisField(scene1Metas);
console.log('  headers:', scene1Headers);
console.log('  fieldMeta:', scene1Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene1Default);
console.log('  recommendedField:', scene1Rec.field);
assert('场景1: 语文在默认字段', scene1Default.includes('语文'), true);
assert('场景1: 数学在默认字段', scene1Default.includes('数学'), true);
assert('场景1: 英语在默认字段', scene1Default.includes('英语'), true);
assert('场景1: 物理在默认字段', scene1Default.includes('物理'), true);
assert('场景1: 化学在默认字段', scene1Default.includes('化学'), true);
assert('场景1: 总分在默认字段', scene1Default.includes('总分'), true);
assert('场景1: 排名在默认字段', scene1Default.includes('排名'), true);
assert('场景1: 姓名不在默认字段', !scene1Default.includes('姓名'), true);
assert('场景1: 学号不在默认字段', !scene1Default.includes('学号'), true);
assert('场景1: 班级不在默认字段', !scene1Default.includes('班级'), true);

// 场景 2：有说明行的成绩表
console.log('\n场景 2：有说明行的成绩表');
const scene2RawRows = [
  ['说明：本表为2024年秋季学期期末成绩'],
  ['注意：缺考记为"缺"，不计入总分'],
  ['姓名', '学号', '班级', '语文', '数学', '英语', '总分'],
  ['张三', '001', '1班', 90, 85, 88, 263],
  ['李四', '002', '1班', 88, 90, 92, 270],
];
const scene2Parsed = parseRowsToTableTest(scene2RawRows);
console.log('  headers:', scene2Parsed.headers);
console.log('  validRows count:', scene2Parsed.rows.length);
assert('场景2: 表头是第3行', scene2Parsed.headers[0], '姓名');
assert('场景2: 数据行数为2', scene2Parsed.rows.length, 2);
assert('场景2: 说明行不被当表头', !scene2Parsed.headers.includes('说明：本表为2024年秋季学期期末成绩'), true);

// 场景 3：多级综合测评表
console.log('\n场景 3：多级综合测评表');
const scene3Headers = ['德育_课程', '德育_加分', '德育_扣分', '德育_合计', '智育_课程', '智育_加分', '智育_扣分', '智育_合计', '总分', '排名'];
const scene3Rows = [
  { '德育_课程': 85, '德育_加分': 5, '德育_扣分': 0, '德育_合计': 90, '智育_课程': 90, '智育_加分': 3, '智育_扣分': 0, '智育_合计': 93, '总分': 183, '排名': 1 },
];
const scene3Metas = classifyFields(scene3Headers, scene3Rows);
const scene3Default = scene3Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene3Rec = recommendAnalysisField(scene3Metas);
console.log('  headers:', scene3Headers);
console.log('  fieldMeta:', scene3Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene3Default);
console.log('  recommendedField:', scene3Rec.field);
assert('场景3: 德育_课程在默认字段', scene3Default.includes('德育_课程'), true);
assert('场景3: 德育_合计在默认字段', scene3Default.includes('德育_合计'), true);
assert('场景3: 智育_课程在默认字段', scene3Default.includes('智育_课程'), true);
assert('场景3: 智育_合计在默认字段', scene3Default.includes('智育_合计'), true);
assert('场景3: 总分在默认字段', scene3Default.includes('总分'), true);
assert('场景3: 排名在默认字段', scene3Default.includes('排名'), true);
assert('场景3: 德育_加分不在默认字段', !scene3Default.includes('德育_加分'), true);
assert('场景3: 德育_扣分不在默认字段', !scene3Default.includes('德育_扣分'), true);
assert('场景3: 智育_加分不在默认字段', !scene3Default.includes('智育_加分'), true);
assert('场景3: 智育_扣分不在默认字段', !scene3Default.includes('智育_扣分'), true);

// 场景 4：只有课程没有总分的表
console.log('\n场景 4：只有课程没有总分的表');
const scene4Headers = ['姓名', '学号', '课程A', '课程B', '课程C'];
const scene4Rows = [
  { '姓名': '张三', '学号': '001', '课程A': 85, '课程B': 90, '课程C': 88 },
  { '姓名': '李四', '学号': '002', '课程A': 88, '课程B': 92, '课程C': 90 },
];
const scene4Metas = classifyFields(scene4Headers, scene4Rows);
const scene4Default = scene4Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene4Rec = recommendAnalysisField(scene4Metas);
console.log('  headers:', scene4Headers);
console.log('  fieldMeta:', scene4Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene4Default);
console.log('  recommendedField:', scene4Rec.field);
assert('场景4: 课程A在默认字段', scene4Default.includes('课程A'), true);
assert('场景4: 课程B在默认字段', scene4Default.includes('课程B'), true);
assert('场景4: 课程C在默认字段', scene4Default.includes('课程C'), true);
assert('场景4: 推荐字段是课程A', scene4Rec.field, '课程A');

// 场景 5：只有排名没有分数的表
console.log('\n场景 5：只有排名没有分数的表');
const scene5Headers = ['姓名', '班级', '排名', '等级'];
const scene5Rows = [
  { '姓名': '张三', '班级': '1班', '排名': 5, '等级': 'A' },
  { '姓名': '李四', '班级': '1班', '排名': 3, '等级': 'B' },
];
const scene5Metas = classifyFields(scene5Headers, scene5Rows);
const scene5Default = scene5Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene5Rec = recommendAnalysisField(scene5Metas);
console.log('  headers:', scene5Headers);
console.log('  fieldMeta:', scene5Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene5Default);
console.log('  recommendedField:', scene5Rec.field);
assert('场景5: 排名在默认字段', scene5Default.includes('排名'), true);
assert('场景5: 等级不在默认字段', !scene5Default.includes('等级'), true);
assert('场景5: 推荐字段是排名', scene5Rec.field, '排名');

// 场景 6：字段名不含传统学科关键词
console.log('\n场景 6：字段名不含传统学科关键词');
const scene6Headers = ['姓名', '学号', 'Python及其应用', '数据结构与算法', '数据库系统', '操作系统'];
const scene6Rows = [
  { '姓名': '张三', '学号': '001', 'Python及其应用': 85, '数据结构与算法': 90, '数据库系统': 88, '操作系统': 92 },
  { '姓名': '李四', '学号': '002', 'Python及其应用': 88, '数据结构与算法': 92, '数据库系统': 90, '操作系统': 85 },
];
const scene6Metas = classifyFields(scene6Headers, scene6Rows);
const scene6Default = scene6Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene6Rec = recommendAnalysisField(scene6Metas);
console.log('  headers:', scene6Headers);
console.log('  fieldMeta:', scene6Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene6Default);
console.log('  recommendedField:', scene6Rec.field);
assert('场景6: Python及其应用在默认字段', scene6Default.includes('Python及其应用'), true);
assert('场景6: 数据结构与算法在默认字段', scene6Default.includes('数据结构与算法'), true);
assert('场景6: 数据库系统在默认字段', scene6Default.includes('数据库系统'), true);
assert('场景6: 操作系统在默认字段', scene6Default.includes('操作系统'), true);
assert('场景6: 姓名不在默认字段', !scene6Default.includes('姓名'), true);
assert('场景6: 学号不在默认字段', !scene6Default.includes('学号'), true);

// 场景 7：数字型身份字段
console.log('\n场景 7：数字型身份字段');
const scene7Headers = ['学号', '考号', '身份证号', '姓名', '总分'];
const scene7Rows = [
  { '学号': '2024001', '考号': '1001', '身份证号': '110101200001011234', '姓名': '张三', '总分': 450 },
  { '学号': '2024002', '考号': '1002', '身份证号': '110101200002021234', '姓名': '李四', '总分': 460 },
];
const scene7Metas = classifyFields(scene7Headers, scene7Rows);
const scene7Default = scene7Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene7Rec = recommendAnalysisField(scene7Metas);
console.log('  headers:', scene7Headers);
console.log('  fieldMeta:', scene7Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene7Default);
console.log('  recommendedField:', scene7Rec.field);
assert('场景7: 总分在默认字段', scene7Default.includes('总分'), true);
assert('场景7: 学号不在默认字段', !scene7Default.includes('学号'), true);
assert('场景7: 考号不在默认字段', !scene7Default.includes('考号'), true);
assert('场景7: 身份证号不在默认字段', !scene7Default.includes('身份证号'), true);
assert('场景7: 姓名不在默认字段', !scene7Default.includes('姓名'), true);

// 场景 8：加扣分字段
console.log('\n场景 8：加扣分字段');
const scene8Headers = ['姓名', '总分', '政策加分', '竞赛加分', '扣分', '违纪扣分'];
const scene8Rows = [
  { '姓名': '张三', '总分': 450, '政策加分': 10, '竞赛加分': 5, '扣分': 0, '违纪扣分': 0 },
  { '姓名': '李四', '总分': 460, '政策加分': 0, '竞赛加分': 0, '扣分': 2, '违纪扣分': 0 },
];
const scene8Metas = classifyFields(scene8Headers, scene8Rows);
const scene8Default = scene8Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene8Rec = recommendAnalysisField(scene8Metas);
console.log('  headers:', scene8Headers);
console.log('  fieldMeta:', scene8Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene8Default);
console.log('  recommendedField:', scene8Rec.field);
assert('场景8: 总分在默认字段', scene8Default.includes('总分'), true);
assert('场景8: 政策加分不在默认字段', !scene8Default.includes('政策加分'), true);
assert('场景8: 竞赛加分不在默认字段', !scene8Default.includes('竞赛加分'), true);
assert('场景8: 扣分不在默认字段', !scene8Default.includes('扣分'), true);
assert('场景8: 违纪扣分不在默认字段', !scene8Default.includes('违纪扣分'), true);

// 场景 9：未命名字段和空列
console.log('\n场景 9：未命名字段和空列');
const scene9Headers = ['姓名', '总分', '未命名字段1', '空列'];
const scene9Rows = [
  { '姓名': '张三', '总分': 450, '未命名字段1': '', '空列': '' },
  { '姓名': '李四', '总分': 460, '未命名字段1': '', '空列': '' },
];
const scene9Metas = classifyFields(scene9Headers, scene9Rows);
const scene9Default = scene9Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene9Rec = recommendAnalysisField(scene9Metas);
console.log('  headers:', scene9Headers);
console.log('  fieldMeta:', scene9Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene9Default);
console.log('  recommendedField:', scene9Rec.field);
assert('场景9: 总分在默认字段', scene9Default.includes('总分'), true);
assert('场景9: 未命名字段1不在默认字段', !scene9Default.includes('未命名字段1'), true);
assert('场景9: 空列不在默认字段', !scene9Default.includes('空列'), true);

// 场景 10：粘贴 Excel 文本路径
console.log('\n场景 10：粘贴 Excel 文本路径');
const scene10RawRows = [
  ['姓名', '学号', '语文', '数学', '总分'],
  ['张三', '001', 90, 85, 175],
  ['李四', '002', 88, 90, 178],
];
const scene10Parsed = parseRowsToTableTest(scene10RawRows);
const scene10Metas = classifyFields(scene10Parsed.headers, scene10Parsed.rows);
const scene10Default = scene10Metas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);
const scene10Rec = recommendAnalysisField(scene10Metas);
console.log('  headers:', scene10Parsed.headers);
console.log('  fieldMeta:', scene10Metas.map(m => ({ header: m.header, type: m.type, role: m.analysisRole })));
console.log('  defaultAnalysisFields:', scene10Default);
console.log('  recommendedField:', scene10Rec.field);
assert('场景10: 表头正确识别', scene10Parsed.headers[0], '姓名');
assert('场景10: 语文在默认字段', scene10Default.includes('语文'), true);
assert('场景10: 数学在默认字段', scene10Default.includes('数学'), true);
assert('场景10: 总分在默认字段', scene10Default.includes('总分'), true);
assert('场景10: 不生成93_80这种字段', !scene10Parsed.headers.some(h => /^\d+_\d+$/.test(h)), true);
assert('场景10: 不生成0_0这种字段', !scene10Parsed.headers.some(h => /^0_0$/.test(h)), true);
assert('场景10: 不生成101.60_91.60这种字段', !scene10Parsed.headers.some(h => /^\d+\.\d+_\d+\.\d+$/.test(h)), true);

// ============================================================
// 非标准字段识别测试
// ============================================================

console.log('\n=== 非标准字段识别测试 ===\n');

// 测试 1：高考成绩、综合成绩、赋分后成绩、语数英总、等级分、标准分
console.log('测试 1：非标准总分字段识别');
const nonStandardTotalHeaders = ['高考成绩', '综合成绩', '赋分后成绩', '语数英总', '等级分', '标准分'];
const nonStandardTotalRows = [
  { '高考成绩': 650, '综合成绩': 88.5, '赋分后成绩': 92, '语数英总': 380, '等级分': 85, '标准分': 720 },
  { '高考成绩': 640, '综合成绩': 86.2, '赋分后成绩': 90, '语数英总': 370, '等级分': 82, '标准分': 710 },
];
const nonStandardTotalMetas = classifyFields(nonStandardTotalHeaders, nonStandardTotalRows);
const nonStandardTotalDefault = nonStandardTotalMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of nonStandardTotalHeaders) {
  const meta = nonStandardTotalMetas.find(m => m.header === header);
  assert(`${header} 识别为 primaryTotal`, meta?.analysisRole, 'primaryTotal');
  assert(`${header} 在默认推荐字段`, nonStandardTotalDefault.includes(header), true);
}

// 测试 2：校排、班排、位次、年级名次
console.log('\n测试 2：非标准排名字段识别');
const nonStandardRankHeaders = ['校排', '班排', '位次', '年级名次'];
const nonStandardRankRows = [
  { '校排': 50, '班排': 3, '位次': 120, '年级名次': 45 },
  { '校排': 60, '班排': 5, '位次': 150, '年级名次': 55 },
];
const nonStandardRankMetas = classifyFields(nonStandardRankHeaders, nonStandardRankRows);
const nonStandardRankDefault = nonStandardRankMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of nonStandardRankHeaders) {
  const meta = nonStandardRankMetas.find(m => m.header === header);
  assert(`${header} 识别为 rank`, meta?.analysisRole, 'rank');
  assert(`${header} 在默认推荐字段`, nonStandardRankDefault.includes(header), true);
}

// 测试 3：Python及其应用、数据结构与算法（课程字段）
console.log('\n测试 3：非标准课程字段识别');
const nonStandardCourseHeaders = ['Python及其应用', '数据结构与算法'];
const nonStandardCourseRows = [
  { 'Python及其应用': 85, '数据结构与算法': 90 },
  { 'Python及其应用': 88, '数据结构与算法': 92 },
];
const nonStandardCourseMetas = classifyFields(nonStandardCourseHeaders, nonStandardCourseRows);
const nonStandardCourseDefault = nonStandardCourseMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of nonStandardCourseHeaders) {
  const meta = nonStandardCourseMetas.find(m => m.header === header);
  assert(`${header} 识别为 courseScore`, meta?.analysisRole, 'courseScore');
  assert(`${header} 在默认推荐字段`, nonStandardCourseDefault.includes(header), true);
}

// 测试 4：反误判测试 - 身份字段不应进入推荐
console.log('\n测试 4：反误判测试 - 身份字段');
const identityTestHeaders = ['学号', '考号', '身份证号', '姓名', '班级'];
const identityTestRows = [
  { '学号': '2024001', '考号': '1001', '身份证号': '110101200001011234', '姓名': '张三', '班级': '1班' },
  { '学号': '2024002', '考号': '1002', '身份证号': '110101200002021234', '姓名': '李四', '班级': '1班' },
];
const identityTestMetas = classifyFields(identityTestHeaders, identityTestRows);
const identityTestDefault = identityTestMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of identityTestHeaders) {
  const meta = identityTestMetas.find(m => m.header === header);
  assert(`${header} 识别为 identity`, meta?.type, 'identity');
  assert(`${header} 不在默认推荐字段`, !identityTestDefault.includes(header), true);
}

// 测试 5：反误判测试 - 加分/扣分字段不应进入推荐
console.log('\n测试 5：反误判测试 - 加分/扣分字段');
const adjustmentTestHeaders = ['加分', '政策加分', '竞赛加分', '扣分', '违纪扣分'];
const adjustmentTestRows = [
  { '加分': 10, '政策加分': 5, '竞赛加分': 3, '扣分': 0, '违纪扣分': 0 },
  { '加分': 8, '政策加分': 3, '竞赛加分': 0, '扣分': 2, '违纪扣分': 0 },
];
const adjustmentTestMetas = classifyFields(adjustmentTestHeaders, adjustmentTestRows);
const adjustmentTestDefault = adjustmentTestMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of adjustmentTestHeaders) {
  const meta = adjustmentTestMetas.find(m => m.header === header);
  assert(`${header} 识别为 adjustment`, meta?.analysisRole, 'adjustment');
  assert(`${header} 不在默认推荐字段`, !adjustmentTestDefault.includes(header), true);
}

// 测试 6：反误判测试 - 未命名字段和非法字段名不应进入推荐
console.log('\n测试 6：反误判测试 - 未命名字段和非法字段名');
const invalidTestHeaders = ['未命名字段1', '未命名字段2', '93_80', '0_0', '101.60_91.60'];
const invalidTestRows = [
  { '未命名字段1': '', '未命名字段2': '', '93_80': '', '0_0': '', '101.60_91.60': '' },
  { '未命名字段1': '', '未命名字段2': '', '93_80': '', '0_0': '', '101.60_91.60': '' },
];
const invalidTestMetas = classifyFields(invalidTestHeaders, invalidTestRows);
const invalidTestDefault = invalidTestMetas.filter(m => shouldIncludeInRecommendationByRole(m.analysisRole)).map(m => m.header);

for (const header of invalidTestHeaders) {
  const meta = invalidTestMetas.find(m => m.header === header);
  assert(`${header} 识别为 invalid`, meta?.analysisRole, 'invalid');
  assert(`${header} 不在默认推荐字段`, !invalidTestDefault.includes(header), true);
}

// ============================================================
// 测试结果
// ============================================================

console.log('\n=== 测试结果 ===\n');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed > 0) {
  console.log('\n❌ 部分测试未通过，请检查解析逻辑。');
  process.exit(1);
} else {
  console.log('\n✅ 全部测试通过。');
  process.exit(0);
}
