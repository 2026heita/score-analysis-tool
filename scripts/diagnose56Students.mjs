/**
 * 诊断56人×18场数据丢失问题 - 完整版
 * 重点检查：多Sheet、合并单元格、重复字段名、行分类误判
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

console.log('=== 诊断56人×18场数据丢失问题 - 完整版 ===\n');

const possibleFiles = [
  '../src/2024年9省联考成绩(5班).xlsx',
  '../src/25-26-1-数据Q243综测表.xlsx',
  '../src/您查看的是物理 总分：510.xlsx'
];

const XLSX = require('xlsx');

// 检查所有文件
console.log('=== 检查所有候选文件 ===\n');
for (const file of possibleFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ 找到文件: ${file}`);
    try {
      const wb = XLSX.readFile(fullPath);
      console.log(`  - 工作表数量: ${wb.SheetNames.length}`);
      console.log(`  - 工作表列表: ${wb.SheetNames.join(', ')}\n`);
      
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        console.log(`  工作表 "${sheetName}":`);
        console.log(`    - 行数: ${data.length}`);
        console.log(`    - 列数: ${data[0]?.length || 0}`);
        console.log(`    - 表头: ${data[0]?.slice(0, 10).join(', ')}...\n`);
      }
    } catch (e) {
      console.log(`  - 读取失败: ${e.message}\n`);
    }
  } else {
    console.log(`✗ 文件不存在: ${file}\n`);
  }
}

// 选择第一个文件进行详细诊断
console.log('=== 选择第一个文件进行详细诊断 ===\n');
let targetFile = null;
for (const file of possibleFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    targetFile = fullPath;
    console.log(`测试文件: ${file}\n`);
    break;
  }
}

if (!targetFile) {
  console.log('未找到测试文件');
  process.exit(1);
}

// 第1步：读取原始Excel数据（包含所有Sheet）
console.log('【第1步】读取原始Excel数据');
const workbook = XLSX.readFile(targetFile);
console.log(`  工作表数量: ${workbook.SheetNames.length}`);
console.log(`  工作表列表: ${workbook.SheetNames.join(', ')}\n`);

for (const sheetName of workbook.SheetNames) {
  console.log(`\n--- 工作表: ${sheetName} ---`);
  const worksheet = workbook.Sheets[sheetName];
  
  // 检查合并单元格
  const merges = worksheet['!merges'] || [];
  console.log(`  合并单元格数量: ${merges.length}`);
  if (merges.length > 0) {
    console.log(`  合并单元格详情:`);
    for (let i = 0; i < Math.min(10, merges.length); i++) {
      const merge = merges[i];
      console.log(`    - ${XLSX.utils.encode_range(merge)}`);
    }
    if (merges.length > 10) {
      console.log(`    - ... 还有 ${merges.length - 10} 个合并单元格`);
    }
  }
  
  // 读取数据
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  console.log(`  原始行数: ${rawData.length}`);
  console.log(`  列数: ${rawData[0]?.length || 0}`);
  
  if (rawData.length === 0) continue;
  
  console.log(`  表头: ${rawData[0]?.join(', ')}`);
  
  // 检查表头是否有重复
  const headers = rawData[0].map(h => String(h ?? '').trim());
  const headerCounts = {};
  for (const h of headers) {
    headerCounts[h] = (headerCounts[h] || 0) + 1;
  }
  const duplicateHeaders = Object.entries(headerCounts).filter(([_, count]) => count > 1);
  if (duplicateHeaders.length > 0) {
    console.log(`  ⚠️ 发现重复表头:`);
    for (const [header, count] of duplicateHeaders) {
      console.log(`    - "${header}" 出现 ${count} 次`);
    }
  }
  
  // 显示前5行和后5行
  console.log(`\n  前5行数据:`);
  for (let i = 1; i <= Math.min(5, rawData.length - 1); i++) {
    const row = rawData[i];
    console.log(`    行${i}: ${row?.slice(0, 8).join(' | ')}...`);
  }
  
  if (rawData.length > 6) {
    console.log(`\n  后5行数据:`);
    for (let i = Math.max(6, rawData.length - 5); i < rawData.length; i++) {
      const row = rawData[i];
      console.log(`    行${i}: ${row?.slice(0, 8).join(' | ')}...`);
    }
  }
  
  // 检查特殊值
  console.log(`\n  特殊值检查:`);
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
  
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    for (const val of row) {
      const strVal = String(val ?? '');
      if (strVal in specialValues) {
        specialValues[strVal]++;
      }
    }
  }
  
  for (const [value, count] of Object.entries(specialValues)) {
    if (count > 0) {
      console.log(`    - "${value}": ${count} 次`);
    }
  }
  
  // 检查每列的非空值数量
  console.log(`\n  每列非空值统计:`);
  const colStats = headers.map((h, idx) => {
    let nonEmpty = 0;
    let numeric = 0;
    let special = 0;
    
    for (let i = 1; i < rawData.length; i++) {
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
    console.log(`    ${stat.header}: 非空=${stat.nonEmpty}, 数值=${stat.numeric}, 特殊值=${stat.special}`);
  }
}

console.log('\n\n=== 诊断完成 ===');
