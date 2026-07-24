/**
 * 诊断704行数据文件 - 可能是56人×18场长表
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

console.log('=== 诊断704行数据文件 ===\n');

const targetFile = path.join(__dirname, '../src/您查看的是物理 总分：510.xlsx');
const XLSX = require('xlsx');

// 第1步：读取原始Excel数据
console.log('【第1步】读取原始Excel数据');
const workbook = XLSX.readFile(targetFile);
console.log(`  工作表数量: ${workbook.SheetNames.length}`);
console.log(`  工作表列表: ${workbook.SheetNames.join(', ')}\n`);

const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// 检查合并单元格
const merges = worksheet['!merges'] || [];
console.log(`  合并单元格数量: ${merges.length}`);
if (merges.length > 0) {
  console.log(`  合并单元格详情:`);
  for (let i = 0; i < Math.min(20, merges.length); i++) {
    const merge = merges[i];
    console.log(`    - ${XLSX.utils.encode_range(merge)}`);
  }
  if (merges.length > 20) {
    console.log(`    - ... 还有 ${merges.length - 20} 个合并单元格`);
  }
}

// 读取数据
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
console.log(`\n  原始行数: ${rawData.length}`);
console.log(`  列数: ${rawData[0]?.length || 0}`);

if (rawData.length === 0) {
  console.log('文件为空');
  process.exit(1);
}

// 查找表头行（可能不在第一行）
console.log(`\n【第2步】查找表头行`);
let headerRowIndex = -1;
let headers = [];

for (let i = 0; i < Math.min(10, rawData.length); i++) {
  const row = rawData[i];
  if (!row || row.length === 0) continue;
  
  // 检查是否包含常见的表头关键词
  const rowText = row.join(' ');
  if (rowText.includes('学号') || rowText.includes('姓名') || rowText.includes('班级') || 
      rowText.includes('场次') || rowText.includes('科目') || rowText.includes('成绩')) {
    headerRowIndex = i;
    headers = row.map(h => String(h ?? '').trim());
    console.log(`  找到表头在第 ${i} 行`);
    console.log(`  表头: ${headers.join(', ')}`);
    break;
  }
}

if (headerRowIndex === -1) {
  console.log(`  未找到明确的表头行，使用第一行`);
  headerRowIndex = 0;
  headers = rawData[0].map(h => String(h ?? '').trim());
  console.log(`  表头: ${headers.join(', ')}`);
}

// 检查表头是否有重复
const headerCounts = {};
for (const h of headers) {
  if (h) headerCounts[h] = (headerCounts[h] || 0) + 1;
}
const duplicateHeaders = Object.entries(headerCounts).filter(([_, count]) => count > 1);
if (duplicateHeaders.length > 0) {
  console.log(`\n  ⚠️ 发现重复表头:`);
  for (const [header, count] of duplicateHeaders) {
    console.log(`    - "${header}" 出现 ${count} 次`);
  }
}

// 显示前10行数据
console.log(`\n【第3步】显示前10行数据`);
for (let i = headerRowIndex + 1; i <= Math.min(headerRowIndex + 10, rawData.length - 1); i++) {
  const row = rawData[i];
  if (!row) continue;
  console.log(`  行${i}: ${row.slice(0, 8).join(' | ')}...`);
}

// 显示后10行数据
console.log(`\n【第4步】显示后10行数据`);
for (let i = Math.max(headerRowIndex + 11, rawData.length - 10); i < rawData.length; i++) {
  const row = rawData[i];
  if (!row) continue;
  console.log(`  行${i}: ${row.slice(0, 8).join(' | ')}...`);
}

// 检查特殊值
console.log(`\n【第5步】特殊值检查`);
const specialValues = {
  '缺考': 0,
  '弃考': 0,
  '转班': 0,
  '转到': 0,
  '转至': 0,
  '无成绩': 0,
  '-': 0,
  '': 0
};

for (let i = headerRowIndex + 1; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row) continue;
  for (const val of row) {
    const strVal = String(val ?? '').trim();
    if (strVal in specialValues) {
      specialValues[strVal]++;
    }
  }
}

for (const [value, count] of Object.entries(specialValues)) {
  if (count > 0) {
    console.log(`  - "${value}": ${count} 次`);
  }
}

// 检查每列的非空值数量
console.log(`\n【第6步】每列非空值统计`);
const colStats = headers.map((h, idx) => {
  if (!h) return { header: `(空列${idx})`, nonEmpty: 0, numeric: 0, special: 0 };
  
  let nonEmpty = 0;
  let numeric = 0;
  let special = 0;
  
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    const val = row[idx];
    const strVal = String(val ?? '').trim();
    
    if (strVal !== '' && strVal !== '-') {
      nonEmpty++;
      const num = parseFloat(strVal);
      if (!isNaN(num) && isFinite(num)) {
        numeric++;
      } else if (['缺考', '弃考', '转班', '转到', '转至', '无成绩'].some(kw => strVal.includes(kw))) {
        special++;
      }
    }
  }
  
  return { header: h, nonEmpty, numeric, special };
});

for (const stat of colStats) {
  console.log(`  ${stat.header}: 非空=${stat.nonEmpty}, 数值=${stat.numeric}, 特殊值=${stat.special}`);
}

// 检查是否有"场次"或"考试"字段
console.log(`\n【第7步】检查场次字段`);
const examFieldIndex = headers.findIndex(h => 
  h.includes('场次') || h.includes('考试') || h.includes('次') || h.includes('场')
);

if (examFieldIndex >= 0) {
  console.log(`  找到场次字段: ${headers[examFieldIndex]} (第${examFieldIndex}列)`);
  
  // 统计场次数
  const examValues = new Set();
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    const val = row[examFieldIndex];
    if (val !== '' && val !== null && val !== undefined) {
      examValues.add(String(val));
    }
  }
  
  console.log(`  场次数量: ${examValues.size}`);
  console.log(`  场次值: ${Array.from(examValues).slice(0, 20).join(', ')}`);
} else {
  console.log(`  未找到明确的场次字段`);
}

// 检查是否有"科目"字段
console.log(`\n【第8步】检查科目字段`);
const subjectFieldIndex = headers.findIndex(h => 
  h.includes('科目') || h.includes('课程') || h.includes('学科')
);

if (subjectFieldIndex >= 0) {
  console.log(`  找到科目字段: ${headers[subjectFieldIndex]} (第${subjectFieldIndex}列)`);
  
  // 统计科目数
  const subjectValues = new Set();
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    const val = row[subjectFieldIndex];
    if (val !== '' && val !== null && val !== undefined) {
      subjectValues.add(String(val));
    }
  }
  
  console.log(`  科目数量: ${subjectValues.size}`);
  console.log(`  科目值: ${Array.from(subjectValues).join(', ')}`);
} else {
  console.log(`  未找到明确的科目字段`);
}

// 检查学生数量
console.log(`\n【第9步】检查学生数量`);
const studentFieldIndex = headers.findIndex(h => 
  h.includes('学号') || h.includes('姓名')
);

if (studentFieldIndex >= 0) {
  console.log(`  找到学生标识字段: ${headers[studentFieldIndex]} (第${studentFieldIndex}列)`);
  
  // 统计学生数
  const studentValues = new Set();
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    const val = row[studentFieldIndex];
    if (val !== '' && val !== null && val !== undefined) {
      studentValues.add(String(val));
    }
  }
  
  console.log(`  学生数量: ${studentValues.size}`);
} else {
  console.log(`  未找到明确的学生标识字段`);
}

// 计算期望的数据结构
console.log(`\n【第10步】数据结构分析`);
const dataRowCount = rawData.length - headerRowIndex - 1;
console.log(`  数据行数: ${dataRowCount}`);
console.log(`  列数: ${headers.length}`);

// 检查是否是长表格式
if (examFieldIndex >= 0 || subjectFieldIndex >= 0) {
  console.log(`  ✓ 可能是长表格式（包含场次或科目字段）`);
  
  // 尝试计算：学生数 × 场次数 × 科目数
  const studentCount = studentFieldIndex >= 0 ? new Set(
    rawData.slice(headerRowIndex + 1).map(r => r[studentFieldIndex]).filter(v => v)
  ).size : 0;
  
  const examCount = examFieldIndex >= 0 ? new Set(
    rawData.slice(headerRowIndex + 1).map(r => r[examFieldIndex]).filter(v => v)
  ).size : 1;
  
  const subjectCount = subjectFieldIndex >= 0 ? new Set(
    rawData.slice(headerRowIndex + 1).map(r => r[subjectFieldIndex]).filter(v => v)
  ).size : 1;
  
  console.log(`  学生数: ${studentCount}`);
  console.log(`  场次数: ${examCount}`);
  console.log(`  科目数: ${subjectCount}`);
  console.log(`  期望行数: ${studentCount} × ${examCount} × ${subjectCount} = ${studentCount * examCount * subjectCount}`);
  console.log(`  实际行数: ${dataRowCount}`);
} else {
  console.log(`  ✗ 可能是宽表格式（没有场次或科目字段）`);
}

console.log('\n\n=== 诊断完成 ===');
