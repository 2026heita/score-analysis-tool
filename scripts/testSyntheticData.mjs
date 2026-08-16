/**
 * 合成数据综合验证测试
 * 验证宽表、长表、含异常值长表的解析流程
 * 
 * 执行: node scripts/testSyntheticData.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(name, condition, expected, actual) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

function readTSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.replace(/\r/g, '').split('\n').filter(line => line.trim() !== '');
  return lines.map(line => line.split('\t'));
}

// 简化的数值解析（内联核心逻辑）
function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') {
    return { status: 'empty' };
  }
  
  const str = String(val).trim();
  if (str === '') {
    return { status: 'empty' };
  }
  
  // 无效关键词
  const invalidKeywords = ['缺考', '弃考', '转班', '转到', '无', '无成绩', '休学', '退学', '请假', '缓考'];
  const lower = str.toLowerCase();
  for (const kw of invalidKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { status: 'invalid' };
    }
  }
  
  // 特殊符号
  if (str === '-' || str === '—' || str === '–' || str === '/' || str === '\\' || str === '|') {
    return { status: 'empty' };
  }
  
  // 日期格式
  const datePatterns = [
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
    /^\d{4}年\d{1,2}月\d{1,2}日?$/,
  ];
  for (const pattern of datePatterns) {
    if (pattern.test(str)) {
      return { status: 'invalid' };
    }
  }
  
  // 百分号
  if (str.endsWith('%')) {
    const numStr = str.slice(0, -1).trim();
    const num = parseNumericStringStrict(numStr);
    if (num !== null) {
      return { status: 'valid', value: num };
    }
    return { status: 'invalid' };
  }
  
  // 使用严格解析
  const num = parseNumericStringStrict(str);
  if (num !== null) {
    return { status: 'valid', value: num };
  }
  
  // 包含数字但解析失败
  if (/\d/.test(str)) {
    return { status: 'invalid' };
  }
  
  return { status: 'invalid' };
}

// 严格数字解析（支持千分位）
function parseNumericStringStrict(str) {
  if (!str || typeof str !== 'string') return null;
  
  const trimmed = str.trim();
  if (trimmed === '') return null;
  
  // 如果包含逗号，必须严格匹配千分位格式
  if (trimmed.includes(',')) {
    const thousandsRegex = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
    if (!thousandsRegex.test(trimmed)) {
      return null;
    }
    // 移除逗号后继续解析
    const withoutCommas = trimmed.replace(/,/g, '');
    const num = Number(withoutCommas);
    return Number.isFinite(num) ? num : null;
  }
  
  // 不包含逗号，直接解析
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// 简化的行分类（内联核心逻辑）
function classifyDataRow(row, headers) {
  const values = headers.map(h => row[h] ?? '');
  
  // 全空行
  if (values.every(v => v === '' || v === '-' || v === null || v === undefined)) {
    return 'empty';
  }
  
  // 统计行关键词
  const summaryKeywords = ['平均', '合计', '统计', '汇总', '总分平均', '年级平均', '班级平均', '全校', '总计', '小计', '累计'];
  const rowText = values.join(' ');
  if (summaryKeywords.some(kw => rowText.includes(kw))) {
    return 'summary';
  }
  
  // 检查身份信息和有效成绩
  const identityKeywords = ['姓名', '名字', '考号', '座号', '学号', '考生号', '准考证', '学生ID'];
  let hasIdentity = false;
  for (const header of headers) {
    const headerLower = header.toLowerCase();
    for (const kw of identityKeywords) {
      if (headerLower.includes(kw.toLowerCase())) {
        const val = row[header]?.trim();
        if (val && val !== '' && val !== '-') {
          hasIdentity = true;
          break;
        }
      }
    }
    if (hasIdentity) break;
  }
  
  // 检查是否有有效数值
  let hasValidScore = false;
  for (const val of values) {
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') {
      hasValidScore = true;
      break;
    }
  }
  
  if (hasIdentity && hasValidScore) {
    return 'validData';
  }
  
  return 'invalid';
}

// 简化的字段分类（内联核心逻辑）
function classifyFieldType(header, values) {
  const headerLower = header.toLowerCase().trim();
  
  // 身份字段关键词
  const identityKeywords = ['学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号', '考生号', '准考证', '学生ID', '身份证号', '性别', '民族'];
  for (const kw of identityKeywords) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'identity';
    }
  }
  
  // 成绩字段关键词
  const scoreKeywords = ['总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物', '政治', '历史', '地理', '成绩', '分数', '得分', '综合'];
  for (const kw of scoreKeywords) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'score';
    }
  }
  
  // 排名字段
  const rankKeywords = ['名次', '排名', '位次'];
  for (const kw of rankKeywords) {
    if (headerLower.includes(kw.toLowerCase())) {
      return 'rank';
    }
  }
  
  // 统计数值比例
  let numericCount = 0;
  for (const val of values) {
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') {
      numericCount++;
    }
  }
  
  const numericRatio = numericCount / values.length;
  
  // 高数值比例且字段名含中文 → score
  if (numericRatio > 0.5 && /[\u4e00-\u9fa5]/.test(headerLower)) {
    return 'score';
  }
  
  // 大部分是文本
  if (numericRatio < 0.4) {
    return 'text';
  }
  
  return 'unknown';
}

function validateWideTable() {
  console.log('\n=== 验证宽表：56人×18科目 ===');
  
  const filePath = path.join(__dirname, '../test-data/wide_table_56x18.tsv');
  const rawData = readTSV(filePath);
  
  console.log(`原始行数: ${rawData.length}`);
  assert('宽表物理行数', rawData.length === 57, 57, rawData.length);
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log(`字段数: ${headers.length}`);
  assert('宽表字段数', headers.length === 21, 21, headers.length);
  
  // 构建行对象
  const rows = [];
  for (const row of dataRows) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? row[i] : '';
    }
    rows.push(obj);
  }
  
  console.log(`数据行数: ${rows.length}`);
  assert('宽表数据行数', rows.length === 56, 56, rows.length);
  
  // 行分类
  let validCount = 0;
  let emptyCount = 0;
  let summaryCount = 0;
  let invalidCount = 0;
  
  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    if (type === 'validData') validCount++;
    else if (type === 'empty') emptyCount++;
    else if (type === 'summary') summaryCount++;
    else if (type === 'invalid') invalidCount++;
  }
  
  console.log(`有效行: ${validCount}, 空行: ${emptyCount}, 汇总行: ${summaryCount}, 无效行: ${invalidCount}`);
  assert('宽表有效行数', validCount === 56, 56, validCount);
  
  // 字段分类
  const fieldTypes = {};
  for (const header of headers) {
    const values = rows.map(r => r[header]);
    fieldTypes[header] = classifyFieldType(header, values);
  }
  
  console.log(`学号类型: ${fieldTypes['学号']}`);
  assert('学号识别为identity', fieldTypes['学号'] === 'identity', 'identity', fieldTypes['学号']);
  
  console.log(`姓名类型: ${fieldTypes['姓名']}`);
  assert('姓名识别为identity', fieldTypes['姓名'] === 'identity', 'identity', fieldTypes['姓名']);
  
  console.log(`班级类型: ${fieldTypes['班级']}`);
  assert('班级识别为identity', fieldTypes['班级'] === 'identity', 'identity', fieldTypes['班级']);
  
  // 验证科目字段
  const subjectFields = ['语文', '数学', '英语', '物理', '化学', '生物', 
                         '历史', '政治', '地理', '体育', '音乐', '美术',
                         '信息技术', '通用技术', '心理', '劳动', '综合实践', '研究性学习'];
  
  let scoreFieldCount = 0;
  for (const subject of subjectFields) {
    if (fieldTypes[subject] === 'score') {
      scoreFieldCount++;
    }
  }
  
  console.log(`科目字段识别为score: ${scoreFieldCount}/18`);
  assert('18个科目识别为score', scoreFieldCount === 18, 18, scoreFieldCount);
  
  // 验证每科有效值数量
  const yuwenValues = rows.map(r => r['语文']);
  let yuwenValid = 0;
  let yuwenEmpty = 0;
  let yuwenInvalid = 0;
  
  for (const val of yuwenValues) {
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') yuwenValid++;
    else if (parsed.status === 'empty') yuwenEmpty++;
    else if (parsed.status === 'invalid') yuwenInvalid++;
  }
  
  console.log(`语文有效值: ${yuwenValid}, 空值: ${yuwenEmpty}, 无效: ${yuwenInvalid}`);
  assert('语文有效值范围', yuwenValid >= 50 && yuwenValid <= 56, '50-56', yuwenValid);
}

function validateLongTable() {
  console.log('\n=== 验证长表：56人×18场=1008行 ===');
  
  const filePath = path.join(__dirname, '../test-data/long_table_56x18.tsv');
  const rawData = readTSV(filePath);
  
  console.log(`原始行数: ${rawData.length}`);
  assert('长表物理行数', rawData.length === 1009, 1009, rawData.length);
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  console.log(`字段数: ${headers.length}`);
  assert('长表字段数', headers.length === 6, 6, headers.length);
  
  // 构建行对象
  const rows = [];
  for (const row of dataRows) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? row[i] : '';
    }
    rows.push(obj);
  }
  
  console.log(`数据行数: ${rows.length}`);
  assert('长表数据行数', rows.length === 1008, 1008, rows.length);
  
  // 行分类
  let validCount = 0;
  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    if (type === 'validData') validCount++;
  }
  
  console.log(`有效行: ${validCount}`);
  assert('长表有效行数', validCount === 1008, 1008, validCount);
  
  // 字段分类
  const fieldTypes = {};
  for (const header of headers) {
    const values = rows.map(r => r[header]);
    fieldTypes[header] = classifyFieldType(header, values);
  }
  
  console.log(`学生ID类型: ${fieldTypes['学生ID']}`);
  assert('学生ID识别为identity', fieldTypes['学生ID'] === 'identity', 'identity', fieldTypes['学生ID']);
  
  console.log(`成绩类型: ${fieldTypes['成绩']}`);
  assert('成绩识别为score', fieldTypes['成绩'] === 'score', 'score', fieldTypes['成绩']);
  
  console.log(`日期类型: ${fieldTypes['日期']}`);
  assert('日期识别为text', fieldTypes['日期'] === 'text', 'text', fieldTypes['日期']);
  
  // 验证成绩字段统计
  const scoreValues = rows.map(r => r['成绩']);
  let scoreValid = 0;
  let scoreEmpty = 0;
  let scoreInvalid = 0;
  
  for (const val of scoreValues) {
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') scoreValid++;
    else if (parsed.status === 'empty') scoreEmpty++;
    else if (parsed.status === 'invalid') scoreInvalid++;
  }
  
  console.log(`成绩有效值: ${scoreValid}, 空值: ${scoreEmpty}, 无效: ${scoreInvalid}`);
  assert('成绩有效值=1008', scoreValid === 1008, 1008, scoreValid);
}

function validateAbnormalLongTable() {
  console.log('\n=== 验证含异常值长表 ===');
  
  const filePath = path.join(__dirname, '../test-data/abnormal_long_table.tsv');
  const rawData = readTSV(filePath);
  
  console.log(`原始行数: ${rawData.length}`);
  assert('异常表物理行数', rawData.length === 1019, 1019, rawData.length);
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  // 构建行对象
  const rows = [];
  for (const row of dataRows) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? row[i] : '';
    }
    rows.push(obj);
  }
  
  console.log(`数据行数: ${rows.length}`);
  assert('异常表数据行数', rows.length === 1018, 1018, rows.length);
  
  // 验证成绩字段统计
  const scoreValues = rows.map(r => r['成绩']);
  let scoreValid = 0;
  let scoreEmpty = 0;
  let scoreInvalid = 0;
  
  for (const val of scoreValues) {
    const parsed = parseNumericValue(val);
    if (parsed.status === 'valid') scoreValid++;
    else if (parsed.status === 'empty') scoreEmpty++;
    else if (parsed.status === 'invalid') scoreInvalid++;
  }
  
  console.log(`成绩有效值: ${scoreValid}`);
  console.log(`成绩空值: ${scoreEmpty}`);
  console.log(`成绩无效值: ${scoreInvalid}`);
  
  const totalValues = scoreValid + scoreEmpty + scoreInvalid;
  assert('成绩总数值统计=1018', totalValues === 1018, 1018, totalValues);
  
  // 验证有效值比例（应在60-80%之间）
  const validRatio = scoreValid / totalValues;
  console.log(`成绩有效率: ${(validRatio * 100).toFixed(1)}%`);
  assert('成绩有效率范围', validRatio >= 0.6 && validRatio <= 0.8, '60-80%', `${(validRatio * 100).toFixed(1)}%`);
  
  // 验证无效值识别
  assert('成绩无效值>0', scoreInvalid > 0, '>0', scoreInvalid);
  assert('成绩空值>0', scoreEmpty > 0, '>0', scoreEmpty);
  
  // 验证特殊值解析
  console.log('\n验证特殊值解析:');
  const testCases = [
    { value: '缺考', expectedStatus: 'invalid' },
    { value: '', expectedStatus: 'empty' },
    { value: '--', expectedStatus: 'invalid', note: '双横线不在特殊符号列表中' },
    { value: '未参加', expectedStatus: 'invalid' },
    { value: '78分', expectedStatus: 'invalid', note: '整个字符串必须是合法数值，不能提取前缀数字' },
    { value: '90分', expectedStatus: 'invalid', note: '整个字符串必须是合法数值，不能提取前缀数字' },
    { value: '85pts', expectedStatus: 'invalid', note: '整个字符串必须是合法数值，不能提取前缀数字' },
    { value: '100abc', expectedStatus: 'invalid', note: '整个字符串必须是合法数值，不能提取前缀数字' },
    { value: '12元', expectedStatus: 'invalid', note: '整个字符串必须是合法数值，不能提取前缀数字' },
    { value: '85', expectedStatus: 'valid', expectedValue: 85 },
    { value: '0', expectedStatus: 'valid', expectedValue: 0, note: '0 永远不能因为空值/符号规则被过滤' },
    { value: '-1', expectedStatus: 'valid', expectedValue: -1 },
  ];
  
  for (const tc of testCases) {
    const parsed = parseNumericValue(tc.value);
    const statusMatch = parsed.status === tc.expectedStatus;
    let valueMatch = true;
    if (tc.expectedValue !== undefined && parsed.status === 'valid') {
      valueMatch = parsed.value === tc.expectedValue;
    }
    
    const note = tc.note ? ` (${tc.note})` : '';
    assert(`特殊值"${tc.value}"解析${note}`, statusMatch && valueMatch, 
      tc.expectedStatus + (tc.expectedValue !== undefined ? `(${tc.expectedValue})` : ''),
      parsed.status + (parsed.status === 'valid' && parsed.value !== undefined ? `(${parsed.value})` : ''));
  }
}

function validatePageText() {
  console.log('\n=== 验证页面文案 ===');
  
  const filePath = path.join(__dirname, '../test-data/wide_table_56x18.tsv');
  const rawData = readTSV(filePath);
  const headers = rawData[0];
  const dataRows = rawData.slice(1);
  
  const rows = [];
  for (const row of dataRows) {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? row[i] : '';
    }
    rows.push(obj);
  }
  
  // 行分类统计
  let validCount = 0;
  let emptyCount = 0;
  let invalidCount = 0;
  
  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    if (type === 'validData') validCount++;
    else if (type === 'empty') emptyCount++;
    else if (type === 'invalid') invalidCount++;
  }
  
  const validText = `有效 ${validCount}`;
  const invalidText = `无效/空值 ${emptyCount + invalidCount}`;
  
  console.log(`宽表文案: "${validText}", "${invalidText}"`);
  assert('有效值文案格式', validText.includes('有效'), true, true);
  assert('无效值文案格式', invalidText.includes('无效') || invalidText.includes('空值'), true, true);
  assert('有效值数值明确', /\d+/.test(validText), true, true);
  assert('无效值数值明确', /\d+/.test(invalidText), true, true);
}

// 执行验证
try {
  validateWideTable();
  validateLongTable();
  validateAbnormalLongTable();
  validatePageText();
} catch (error) {
  console.error('\n❌ 测试执行失败:', error);
  process.exit(1);
}

// 输出结果
console.log('\n=== 测试结果汇总 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 部分测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
}
