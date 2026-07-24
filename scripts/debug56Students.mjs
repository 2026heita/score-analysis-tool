/**
 * 调试脚本：诊断56人×18场数据丢失问题
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取源文件
const filePath = path.join(__dirname, '../56人18场考试.xlsx');

if (!fs.existsSync(filePath)) {
  console.error('❌ 文件不存在:', filePath);
  process.exit(1);
}

console.log('=== 诊断 56人×18场 数据丢失问题 ===\n');

// 使用 xlsx 库读取原始数据
import * as XLSX from 'xlsx';

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log('Sheet名称:', sheetName);
console.log('Sheet数量:', workbook.SheetNames.length);

// 转换为二维数组
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('\n=== 原始数据统计 ===');
console.log('总行数:', rawData.length);
console.log('列数:', rawData[0]?.length || 0);
console.log('表头:', rawData[0]);

// 显示前10行
console.log('\n=== 前10行数据 ===');
for (let i = 0; i < Math.min(10, rawData.length); i++) {
  console.log(`行${i}:`, rawData[i]);
}

// 显示后10行
console.log('\n=== 后10行数据 ===');
for (let i = Math.max(0, rawData.length - 10); i < rawData.length; i++) {
  console.log(`行${i}:`, rawData[i]);
}

// 现在使用项目的解析器
console.log('\n=== 使用项目解析器 ===');

// 动态导入 TypeScript 编译后的模块
const { parseWorkbook } = await import('../dist/utils/tableParser/workbook.js');

const buffer = fs.readFileSync(filePath);
const result = await parseWorkbook(buffer.buffer, filePath);

console.log('\n=== 解析结果统计 ===');
console.log('headers:', result.headers);
console.log('rows.length:', result.rows.length);
console.log('warnings:', result.warnings);
console.log('dataVolumeState:', result.dataVolumeState);
console.log('summary:', result.summary);

// 分析行分类
console.log('\n=== 行分类详情 ===');
console.log('validData:', result.summary.validDataRows);
console.log('empty:', result.summary.emptyRows);
console.log('statusOnly:', result.summary.statusRows);
console.log('summary:', result.summary.summaryRows);
console.log('invalid:', result.summary.invalidRows);

// 检查前10行解析结果
console.log('\n=== 前10行解析结果 ===');
for (let i = 0; i < Math.min(10, result.rows.length); i++) {
  console.log(`行${i}:`, result.rows[i]);
}

// 检查是否有重复行
console.log('\n=== 重复行检测 ===');
const rowStrings = result.rows.map(r => JSON.stringify(r));
const uniqueRows = new Set(rowStrings);
console.log('总行数:', result.rows.length);
console.log('唯一行数:', uniqueRows.size);
console.log('重复行数:', result.rows.length - uniqueRows.size);

// 检查原始数据中的重复
console.log('\n=== 原始数据重复检测 ===');
const rawRowStrings = rawData.slice(1).map(r => JSON.stringify(r));
const uniqueRawRows = new Set(rawRowStrings);
console.log('原始数据行数:', rawData.length - 1);
console.log('唯一原始行数:', uniqueRawRows.size);
console.log('重复原始行数:', rawData.length - 1 - uniqueRawRows.size);

console.log('\n=== 诊断完成 ===');
