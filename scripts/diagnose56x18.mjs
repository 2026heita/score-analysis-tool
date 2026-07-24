/**
 * 56人×18场数据诊断脚本
 * 逐层检查数据处理流程，定位数据丢失位置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// 查找56人班级文件
const possibleFiles = [
  '../src/2024年9省联考成绩(5班).xlsx',
  '../src/25-26-1-数据Q243综测表.xlsx',
  '../src/您查看的是物理 总分：510.xlsx'
];

let targetFile = null;
for (const file of possibleFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    targetFile = fullPath;
    console.log(`找到测试文件: ${file}\n`);
    break;
  }
}

if (!targetFile) {
  console.log('未找到56人班级文件');
  process.exit(1);
}

const XLSX = require('xlsx');

// 第1步：读取原始Excel数据
console.log('【第1步】读取原始Excel数据');
const workbook = XLSX.readFile(targetFile);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log(`  工作表: ${sheetName}`);
console.log(`  原始行数: ${rawData.length}`);
console.log(`  列数: ${rawData[0]?.length || 0}`);
console.log(`  表头: ${rawData[0]?.join(', ')}`);

// 显示前5行和后5行
console.log('\n  前5行数据:');
for (let i = 1; i <= Math.min(5, rawData.length - 1); i++) {
  console.log(`    行${i}: ${rawData[i]?.slice(0, 5).join(' | ')}...`);
}

if (rawData.length > 6) {
  console.log('\n  后5行数据:');
  for (let i = Math.max(6, rawData.length - 5); i < rawData.length; i++) {
    console.log(`    行${i}: ${rawData[i]?.slice(0, 5).join(' | ')}...`);
  }
}

// 检查是否有"班级"字段
const headers = rawData[0].map(h => String(h ?? '').trim());
const classFieldIndex = headers.findIndex(h => h.includes('班级'));
console.log(`\n  班级字段位置: ${classFieldIndex >= 0 ? `第${classFieldIndex}列 (${headers[classFieldIndex]})` : '未找到'}`);

if (classFieldIndex >= 0) {
  // 统计班级字段的值
  const classValues = new Set();
  for (let i = 1; i < rawData.length; i++) {
    const val = rawData[i][classFieldIndex];
    if (val !== '' && val !== null && val !== undefined) {
      classValues.add(String(val));
    }
  }
  console.log(`  班级字段唯一值数量: ${classValues.size}`);
  console.log(`  班级字段值示例: ${Array.from(classValues).slice(0, 10).join(', ')}`);
}

// 第2步：模拟parseRawRows解析
console.log('\n\n【第2步】模拟parseRawRows解析');
const dataRows = rawData.slice(1).filter(row => row && row.length > 0);
console.log(`  过滤空行后: ${dataRows.length} 行`);

// 构建行对象
const rows = [];
for (const row of dataRows) {
  if (!row || !Array.isArray(row)) continue;
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
  }
  rows.push(obj);
}

console.log(`  构建行对象: ${rows.length} 行`);

// 第3步：检查行分类
console.log('\n\n【第3步】检查行分类逻辑');

// 手动实现classifyDataRow逻辑（避免导入问题）
function classifyDataRow(row, headers) {
  const values = headers.map(h => row[h] ?? '');

  // 1. 全空行
  if (values.every(v => v === '' || v === '-' || v === null || v === undefined)) {
    return 'empty';
  }

  // 2. 检查是否包含统计关键词
  const SUMMARY_KEYWORDS = ['平均', '合计', '统计', '汇总', '总分平均', '年级平均', '班级平均', '全校', '总计', '小计', '累计'];
  const rowText = values.join(' ');
  if (SUMMARY_KEYWORDS.some(kw => rowText.includes(kw))) {
    return 'summary';
  }

  // 3. 检查是否大量是状态值
  const STATUS_KEYWORDS = ['缺考', '弃考', '转班', '转到', '转至', '无成绩'];
  let statusCount = 0;
  let numericCount = 0;
  let nonEmptyCount = 0;

  for (const val of values) {
    if (val === '' || val === '-') continue;
    nonEmptyCount++;

    const isStatus = STATUS_KEYWORDS.some(kw => val.includes(kw));
    if (isStatus) {
      statusCount++;
    }

    const num = parseFloat(val);
    if (!isNaN(num) && isFinite(num)) {
      numericCount++;
    }
  }

  // 如果大量非空值是状态值 → statusOnly
  if (nonEmptyCount > 0 && statusCount / nonEmptyCount > 0.5 && numericCount === 0) {
    return 'statusOnly';
  }

  // 4. 检查是否为正常的学生数据行
  const hasIdentity = headers.some(h => {
    const lower = h.toLowerCase();
    return lower.includes('姓名') || lower.includes('名字');
  }) && row[headers.find(h => h.toLowerCase().includes('姓名'))];
  
  const hasValidScore = numericCount > 0;

  if (hasIdentity && hasValidScore) {
    return 'validData';
  }

  // 默认当作有效数据
  return hasValidScore ? 'validData' : 'invalid';
}

let validData = 0;
let empty = 0;
let statusOnly = 0;
let summary = 0;
let invalid = 0;

const validRows = [];
const invalidRows = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const type = classifyDataRow(row, headers);
  
  switch (type) {
    case 'validData':
      validData++;
      validRows.push({ index: i, row });
      break;
    case 'empty':
      empty++;
      break;
    case 'statusOnly':
      statusOnly++;
      break;
    case 'summary':
      summary++;
      break;
    case 'invalid':
      invalid++;
      invalidRows.push({ index: i, row, type });
      break;
  }
}

console.log(`  validData: ${validData}`);
console.log(`  empty: ${empty}`);
console.log(`  statusOnly: ${statusOnly}`);
console.log(`  summary: ${summary}`);
console.log(`  invalid: ${invalid}`);
console.log(`  总计: ${validData + empty + statusOnly + summary + invalid}`);

// 显示前10个有效行
console.log('\n  前10个有效行:');
for (let i = 0; i < Math.min(10, validRows.length); i++) {
  const { index, row } = validRows[i];
  console.log(`    行${index}: ${headers.slice(0, 3).map(h => `${h}=${row[h]}`).join(', ')}...`);
}

// 显示前10个无效行
if (invalidRows.length > 0) {
  console.log('\n  前10个无效行:');
  for (let i = 0; i < Math.min(10, invalidRows.length); i++) {
    const { index, row } = invalidRows[i];
    console.log(`    行${index}: ${headers.slice(0, 3).map(h => `${h}=${row[h]}`).join(', ')}...`);
  }
}

// 第4步：检查字段分类
console.log('\n\n【第4步】检查字段分类');

// 手动实现字段分类逻辑（简化版）
function classifyFields(headers, rows) {
  return headers.map(header => {
    const values = rows.map(r => r[header]).filter(v => v !== '' && v !== null && v !== undefined);
    const uniqueValues = new Set(values);
    
    // 检查是否为数值字段
    let numericCount = 0;
    for (const val of values) {
      const num = parseFloat(val);
      if (!isNaN(num) && isFinite(num)) {
        numericCount++;
      }
    }
    
    const numericRatio = values.length > 0 ? numericCount / values.length : 0;
    const uniqueRatio = values.length > 0 ? uniqueValues.size / values.length : 0;
    
    let type = 'unknown';
    let analysisRole = 'unknown';
    
    if (numericRatio > 0.8) {
      type = 'number';
      if (header.includes('总分') || header.includes('成绩')) {
        analysisRole = 'primaryTotal';
      } else if (header.includes('名次') || header.includes('排名')) {
        analysisRole = 'rank';
      } else if (['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'].some(s => header.includes(s))) {
        analysisRole = 'courseScore';
      } else {
        analysisRole = 'other';
      }
    } else if (uniqueRatio > 0.9) {
      type = 'identifier';
      analysisRole = 'identity';
    } else if (uniqueValues.size <= 10) {
      type = 'category';
      analysisRole = 'dimension';
    } else {
      type = 'text';
      analysisRole = 'textMeta';
    }
    
    return {
      header,
      type,
      analysisRole,
      numericRatio,
      uniqueRatio,
      sampleValues: values.slice(0, 5),
      nonEmptyCount: values.length,
      numericCount,
    };
  });
}

const fieldMetas = classifyFields(headers, rows);

for (const meta of fieldMetas) {
  console.log(`  ${meta.header}: ${meta.type} (${meta.analysisRole})`);
  if (meta.header.includes('班级')) {
    console.log(`    ⚠️ 班级字段详情:`);
    console.log(`      type: ${meta.type}`);
    console.log(`      analysisRole: ${meta.analysisRole}`);
    console.log(`      numericRatio: ${meta.numericRatio}`);
    console.log(`      uniqueRatio: ${meta.uniqueRatio}`);
    console.log(`      sampleValues: ${meta.sampleValues?.slice(0, 5).join(', ')}`);
  }
}

// 第5步：检查是否有重复行
console.log('\n\n【第5步】检查重复行');
const rowStrings = rows.map(r => JSON.stringify(r));
const uniqueRowStrings = new Set(rowStrings);
console.log(`  总行数: ${rows.length}`);
console.log(`  唯一行数: ${uniqueRowStrings.size}`);
console.log(`  重复行数: ${rows.length - uniqueRowStrings.size}`);

// 检查是否有完全相同的行
const rowCounts = {};
for (const rowStr of rowStrings) {
  rowCounts[rowStr] = (rowCounts[rowStr] || 0) + 1;
}

const duplicateRows = Object.entries(rowCounts).filter(([_, count]) => count > 1);
if (duplicateRows.length > 0) {
  console.log(`\n  发现 ${duplicateRows.length} 种重复行:`);
  for (let i = 0; i < Math.min(5, duplicateRows.length); i++) {
    const [rowStr, count] = duplicateRows[i];
    const row = JSON.parse(rowStr);
    console.log(`    出现${count}次: ${headers.slice(0, 3).map(h => `${h}=${row[h]}`).join(', ')}...`);
  }
}

// 第6步：检查班级字段是否导致分组
console.log('\n\n【第6步】检查班级字段是否导致分组');
if (classFieldIndex >= 0) {
  const classField = headers[classFieldIndex];
  const classGroups = {};
  
  for (const row of rows) {
    const classVal = row[classField] || '空值';
    if (!classGroups[classVal]) {
      classGroups[classVal] = [];
    }
    classGroups[classVal].push(row);
  }
  
  console.log(`  班级分组数量: ${Object.keys(classGroups).length}`);
  for (const [classVal, classRows] of Object.entries(classGroups)) {
    console.log(`    ${classVal}: ${classRows.length} 行`);
  }
}

// 第7步：使用完整解析流程
console.log('\n\n【第7步】使用完整解析流程');

// 将原始数据转换为文本
const textLines = [headers.join('\t')];
for (const row of dataRows) {
  textLines.push(row.map(v => String(v ?? '')).join('\t'));
}
const text = textLines.join('\n');

console.log(`  文本行数: ${textLines.length}`);

// 手动实现parseTableText逻辑（简化版）
function parseTableText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('请先粘贴表格数据。');
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 1) {
    throw new Error('至少需要字段行和一行数据');
  }

  // 检测分隔符（简化为Tab）
  const delimiter = '\t';

  // 转为二维数组
  const rows = lines.map(line => line.split(delimiter));

  // 使用简化版parseRawRows
  return parseRawRows(rows);
}

function parseRawRows(inputRows) {
  const physicalRowCount = inputRows.length;
  const detection = detectHeaderRow(inputRows);
  
  if (detection.headerRowIndex < 0) {
    throw new Error('未找到表头');
  }

  const headerRowCount = detection.headerRowIndex + 1;
  const rawRowCount = physicalRowCount - headerRowCount;
  const parsedRowCount = Math.min(rawRowCount, 20000);
  const isParseTruncated = rawRowCount > 20000;

  const trimmedDataRows = detection.dataRows.slice(0, parsedRowCount);
  const headers = dedupeHeaders(detection.headers);
  
  const rowObjects = [];
  for (const row of trimmedDataRows) {
    if (!row || !Array.isArray(row)) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < row.length ? String(row[i] ?? '').trim() : '';
    }
    rowObjects.push(obj);
  }

  const rowClassification = classifyDataRows(rowObjects, headers);
  
  const resultRows = rowClassification.validRows.length > 0
    ? rowClassification.validRows
    : rowObjects;

  return {
    headers,
    rows: resultRows,
    warnings: [],
    summary: {
      fieldCount: headers.length,
      validDataRows: rowClassification.validData,
      emptyRows: rowClassification.empty,
      statusRows: rowClassification.statusOnly,
      summaryRows: rowClassification.summary,
      invalidRows: rowClassification.invalid,
    },
    dataVolumeState: {
      physicalRowCount,
      headerRowCount,
      rawRowCount,
      parsedRowCount,
      validRowCount: rowClassification.validData,
      emptyRowCount: rowClassification.empty,
      statusRowCount: rowClassification.statusOnly,
      summaryRowCount: rowClassification.summary,
      invalidRowCount: rowClassification.invalid,
      isParseTruncated,
    },
  };
}

function detectHeaderRow(rawRows) {
  // 简化版：假设第一行是表头
  return {
    headerRowIndex: 0,
    headers: rawRows[0],
    dataRows: rawRows.slice(1),
  };
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map(h => {
    const clean = String(h ?? '').trim();
    if (!clean) return '';
    const count = seen.get(clean) || 0;
    seen.set(clean, count + 1);
    return count === 0 ? clean : `${clean}_${count}`;
  });
}

function classifyDataRows(rows, headers) {
  let validData = 0, empty = 0, statusOnly = 0, summary = 0, invalid = 0;
  const validRows = [];

  for (const row of rows) {
    const type = classifyDataRow(row, headers);
    switch (type) {
      case 'validData':
        validData++;
        validRows.push(row);
        break;
      case 'empty':
        empty++;
        break;
      case 'statusOnly':
        statusOnly++;
        break;
      case 'summary':
        summary++;
        break;
      case 'invalid':
        invalid++;
        break;
    }
  }

  return { validData, empty, statusOnly, summary, invalid, validRows };
}

try {
  const parseResult = parseTableText(text);
  console.log(`  解析后行数: ${parseResult.rows.length}`);
  console.log(`  解析后列数: ${parseResult.headers.length}`);
  console.log(`  警告数量: ${parseResult.warnings.length}`);
  console.log(`  dataVolumeState:`, parseResult.dataVolumeState);
  
  if (parseResult.warnings.length > 0) {
    console.log('\n  警告信息:');
    for (const warning of parseResult.warnings) {
      console.log(`    - ${warning}`);
    }
  }
  
  // 检查解析后的数据
  console.log(`\n  解析后前5行:`);
  for (let i = 0; i < Math.min(5, parseResult.rows.length); i++) {
    const row = parseResult.rows[i];
    console.log(`    行${i}: ${parseResult.headers.slice(0, 3).map(h => `${h}=${row[h]}`).join(', ')}...`);
  }
  
  // 检查每个字段的有效值数量
  console.log(`\n  每个字段的有效值统计:`);
  for (const header of parseResult.headers) {
    let nonEmpty = 0;
    let numeric = 0;
    let invalid = 0;
    
    for (const row of parseResult.rows) {
      const val = row[header];
      if (val !== '' && val !== null && val !== undefined) {
        nonEmpty++;
        const num = parseFloat(val);
        if (!isNaN(num) && isFinite(num)) {
          numeric++;
        } else {
          invalid++;
        }
      }
    }
    
    console.log(`    ${header}: 非空=${nonEmpty}, 数值=${numeric}, 无效=${invalid}`);
  }
} catch (error) {
  console.log(`  ❌ 解析失败: ${error.message}`);
  console.log(error.stack);
}

console.log('\n\n=== 诊断完成 ===');
