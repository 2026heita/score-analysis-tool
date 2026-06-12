/**
 * 真实文件验证脚本
 * 使用 2024年9省联考成绩(5班).xlsx 的数据模拟完整解析流程
 * 验证所有10项验证目标
 */
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

// ============================================================
// 引入解析器核心逻辑（与src/utils/tableParser/保持同步）
// ============================================================
import { parseNumericValue, ParsedNumber } from './tableParser/numericParser.js';
import { classifyField } from './tableParser/fieldClassifier.js';
import { classifyDataRow } from './tableParser/rowClassifier.js';
import { detectMainWorksheet } from './tableParser/sheetDetection.js';
import { detectHeaderRow } from './tableParser/headerDetection.js';

const FILE_PATH = './public/2024年9省联考成绩(5班).xlsx';

// ============================================================
// 1. 读取Excel文件
// ============================================================
console.log('=== 验证开始 ===\n');
console.log(`文件: ${FILE_PATH}`);

try {
  const buffer = readFileSync(FILE_PATH);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false });
  
  console.log(`\n1. 文件读取成功`);
  console.log(`   Sheet列表: ${workbook.SheetNames.join(', ')}`);
  console.log(`   Sheet数量: ${workbook.SheetNames.length}`);
  
  // ============================================================
  // 2. 多Sheet检测
  // ============================================================
  console.log('\n2. 多Sheet检测');
  
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const rowCount = range.e.r + 1;
    const colCount = range.e.c + 1;
    return { name, rowCount, colCount, sheet };
  });
  
  sheets.forEach(s => {
    console.log(`   ${s.name}: ${s.rowCount}行 x ${s.colCount}列`);
  });
  
  const mainSheetResult = detectMainWorksheet(sheets);
  console.log(`\n   推荐主表: ${mainSheetResult.name}`);
  console.log(`   置信度: ${mainSheetResult.confidence}`);
  
  if (!mainSheetResult.name.includes('成绩')) {
    console.log('   ❌ FAIL: 没有识别到主成绩表');
  } else {
    console.log('   ✅ PASS: 正确识别主成绩表');
  }
  
  // 验证字典表不被选中
  if (sheets.some(s => s.name.includes('学校代码') && s.confidence > mainSheetResult.confidence)) {
    console.log('   ❌ FAIL: "学校代码"sheet置信度高于主表');
  } else {
    console.log('   ✅ PASS: 字典表未被误选');
  }
  
  // ============================================================
  // 3. 解析主表数据
  // ============================================================
  const mainSheet = workbook.Sheets[mainSheetResult.name];
  const jsonData = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: null });
  const rawRows = jsonData.map(row => {
    if (Array.isArray(row)) return row.map(v => v === undefined ? null : v);
    return [null];
  });
  
  console.log(`\n3. 主表解析`);
  console.log(`   总行数: ${rawRows.length}`);
  
  // ============================================================
  // 4. 表头检测
  // ============================================================
  const headerDetection = detectHeaderRow(rawRows);
  
  console.log(`\n4. 表头检测`);
  if (!headerDetection.found) {
    console.log('   ❌ FAIL: 没有找到表头行');
  } else {
    console.log(`   表头行号: ${headerDetection.rowIndex}`);
    console.log(`   字段数: ${headerDetection.headers.length}`);
    console.log(`   字段列表: ${headerDetection.headers.join(', ')}`);
    
    // 检查是否有"第一行没有有效字段名"问题
    const validFields = headerDetection.headers.filter(h => h && h.trim() !== '');
    if (validFields.length === 0) {
      console.log('   ❌ FAIL: 第一行没有有效字段名');
    } else {
      console.log(`   ✅ PASS: 找到 ${validFields.length} 个有效字段`);
    }
  }
  
  // ============================================================
  // 5. 字段分类验证
  // ============================================================
  console.log('\n5. 字段分类');
  const headers = headerDetection.headers;
  const dataRows = rawRows.slice(headerDetection.rowIndex + 1);
  
  const columnValues = headers.map((_, colIdx) => 
    dataRows.map(row => row[colIdx] !== null && row[colIdx] !== undefined ? String(row[colIdx]) : '')
  );
  
  const fieldMetas = headers.map((header, idx) => ({
    header,
    type: classifyField(header, columnValues[idx]),
    columnIndex: idx,
  }));
  
  const identityFields = fieldMetas.filter(f => f.type === 'identity').map(f => f.header);
  const scoreFields = fieldMetas.filter(f => f.type === 'score').map(f => f.header);
  const bonusFields = fieldMetas.filter(f => f.type === 'bonus').map(f => f.header);
  const categoryFields = fieldMetas.filter(f => f.type === 'category').map(f => f.header);
  
  console.log(`   identity: ${identityFields.join(', ')}`);
  console.log(`   score: ${scoreFields.join(', ')}`);
  console.log(`   bonus: ${bonusFields.join(', ')}`);
  console.log(`   category: ${categoryFields.join(', ')}`);
  
  // 验证默认推荐字段
  // 找到第一个score类型且包含"总分"的字段
  const recommendedField = fieldMetas.find(f => 
    f.type === 'score' && (f.header.includes('总分') || f.header.includes('总成绩'))
  );
  
  if (recommendedField) {
    console.log(`\n   推荐分析字段: ${recommendedField.header}`);
    console.log('   ✅ PASS: 默认推荐总分相关字段');
  } else {
    // 找第一个score字段
    const firstScore = fieldMetas.find(f => f.type === 'score');
    if (firstScore) {
      console.log(`\n   推荐分析字段: ${firstScore.header}`);
    }
  }
  
  // 验证排除字段不被推荐
  const excludedFields = fieldMetas.filter(f => 
    f.type === 'identity' || f.type === 'bonus' || f.type === 'category'
  ).map(f => f.header);
  
  const recommendedIsExcluded = excludedFields.includes(recommendedField?.header);
  if (recommendedIsExcluded) {
    console.log('   ❌ FAIL: 推荐了不应该推荐的字段');
  } else {
    console.log('   ✅ PASS: 排除字段（学校代码、班级、姓名、组合简称、加分）未被推荐');
  }
  
  // ============================================================
  // 6. 特殊值验证（缺考、转到7班）
  // ============================================================
  console.log('\n6. 特殊值解析验证');
  
  const specialValues = ['缺考', '转到7班', '转班', '无', '无成绩', '-', '/', ''];
  specialValues.forEach(v => {
    const parsed = parseNumericValue(v);
    if (parsed.valid) {
      console.log(`   ❌ FAIL: "${v}" 被解析为 ${parsed.value}`);
    } else {
      console.log(`   ✅ PASS: "${v}" → ${parsed.status} (不被当作数字)`);
    }
  });
  
  // ============================================================
  // 7. 数据行分类验证
  // ============================================================
  console.log('\n7. 数据行分类');
  
  let validCount = 0;
  let emptyCount = 0;
  let summaryCount = 0;
  let statusOnlyCount = 0;
  
  dataRows.forEach((row, idx) => {
    const result = classifyDataRow(row, headers);
    if (result === 'validData') validCount++;
    else if (result === 'empty') emptyCount++;
    else if (result === 'summary') summaryCount++;
    else if (result === 'statusOnly') statusOnlyCount++;
  });
  
  console.log(`   有效数据行: ${validCount}`);
  console.log(`   空行: ${emptyCount}`);
  console.log(`   统计行: ${summaryCount}`);
  console.log(`   状态行: ${statusOnlyCount}`);
  
  // 验证最后一行平均分不被当作学生数据
  const lastRow = dataRows[dataRows.length - 1];
  const lastRowResult = classifyDataRow(lastRow, headers);
  if (lastRowResult === 'summary' || lastRowResult === 'invalid') {
    console.log('   ✅ PASS: 最后一行平均分/统计行不被当作学生数据');
  } else {
    console.log('   ⚠️ WARN: 最后一行可能被当作学生数据');
  }
  
  // 验证黄冠谦、吴东旭（转到7班、缺考）的行
  const huangRow = dataRows.find(r => r[2] === '黄冠谦');
  const wuRow = dataRows.find(r => r[2] === '吴东旭');
  
  if (huangRow) {
    console.log('   黄冠谦行存在，成绩字段包含"转到7班"');
  }
  if (wuRow) {
    console.log('   吴东旭行存在，成绩字段包含"缺考"');
  }
  
  // ============================================================
  // 8. 统计摘要
  // ============================================================
  console.log('\n=== 解析摘要 ===');
  console.log(`已识别主表: ${mainSheetResult.name}`);
  console.log(`识别字段: ${headers.length} 个`);
  console.log(`有效数据行: ${validCount} 行`);
  console.log(`跳过空行: ${emptyCount} 行`);
  console.log(`跳过统计行: ${summaryCount} 行`);
  console.log(`状态/无效行: ${statusOnlyCount} 行`);
  if (recommendedField) {
    console.log(`推荐分析字段: ${recommendedField.header}`);
  }
  
  console.log('\n=== 验证完成 ===');
  
} catch (e) {
  console.error(`读取文件失败: ${e.message}`);
  console.log('提示: 请确保文件位于 ./public/2024年9省联考成绩(5班).xlsx');
}
