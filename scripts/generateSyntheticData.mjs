/**
 * 生成合成测试数据
 * 1. 宽表：56人×18科目
 * 2. 长表：56人×18场=1008行
 * 3. 含异常值的长表
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, '../test-data');

// 创建输出目录
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ===== 1. 宽表：56人×18科目 =====
console.log('生成宽表数据：56人×18科目...');

const subjects = [
  '语文', '数学', '英语', '物理', '化学', '生物',
  '历史', '政治', '地理', '体育', '音乐', '美术',
  '信息技术', '通用技术', '心理', '劳动', '综合实践', '研究性学习'
];

const wideTableHeaders = ['学号', '姓名', '班级', ...subjects];
const wideTableRows = [];

for (let i = 1; i <= 56; i++) {
  const row = {
    '学号': `2024${String(i).padStart(4, '0')}`,
    '姓名': `学生${i}`,
    '班级': `${Math.ceil(i / 20)}班`,
  };
  
  for (const subject of subjects) {
    // 90%正常成绩，5%缺考，5%空值
    const rand = Math.random();
    if (rand < 0.90) {
      row[subject] = String(Math.floor(60 + Math.random() * 40)); // 60-100分
    } else if (rand < 0.95) {
      row[subject] = '缺考';
    } else {
      row[subject] = '';
    }
  }
  
  wideTableRows.push(row);
}

// 转换为TSV格式
const wideTableTSV = [
  wideTableHeaders.join('\t'),
  ...wideTableRows.map(row => wideTableHeaders.map(h => row[h]).join('\t'))
].join('\n');

fs.writeFileSync(path.join(outputDir, 'wide_table_56x18.tsv'), wideTableTSV, 'utf-8');
console.log(`✓ 宽表生成完成：56行×${wideTableHeaders.length}列`);

// ===== 2. 长表：56人×18场=1008行 =====
console.log('\n生成长表数据：56人×18场=1008行...');

const examDates = [];
for (let i = 1; i <= 18; i++) {
  const month = Math.ceil(i / 2);
  const day = (i % 2) * 15 + 10;
  examDates.push(`2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

const longTableHeaders = ['学生ID', '姓名', '考试场次', '成绩', '日期', '班级'];
const longTableRows = [];

for (let i = 1; i <= 56; i++) {
  const studentId = `2024${String(i).padStart(4, '0')}`;
  const studentName = `学生${i}`;
  const studentClass = `${Math.ceil(i / 20)}班`;
  
  for (let exam = 1; exam <= 18; exam++) {
    longTableRows.push({
      '学生ID': studentId,
      '姓名': studentName,
      '考试场次': `第${exam}场`,
      '成绩': String(Math.floor(60 + Math.random() * 40)),
      '日期': examDates[exam - 1],
      '班级': studentClass,
    });
  }
}

const longTableTSV = [
  longTableHeaders.join('\t'),
  ...longTableRows.map(row => longTableHeaders.map(h => row[h]).join('\t'))
].join('\n');

fs.writeFileSync(path.join(outputDir, 'long_table_56x18.tsv'), longTableTSV, 'utf-8');
console.log(`✓ 长表生成完成：${longTableRows.length}行×${longTableHeaders.length}列`);

// ===== 3. 含异常值的长表 =====
console.log('\n生成含异常值的长表数据...');

const abnormalHeaders = ['学生ID', '姓名', '考试场次', '成绩', '日期', '班级'];
const abnormalRows = [];

for (let i = 1; i <= 56; i++) {
  const studentId = `2024${String(i).padStart(4, '0')}`;
  const studentName = `学生${i}`;
  const studentClass = `${Math.ceil(i / 20)}班`;
  
  for (let exam = 1; exam <= 18; exam++) {
    const rand = Math.random();
    let score;
    
    if (rand < 0.70) {
      // 70% 正常成绩
      score = String(Math.floor(60 + Math.random() * 40));
    } else if (rand < 0.80) {
      // 10% 缺考
      score = '缺考';
    } else if (rand < 0.85) {
      // 5% 空值
      score = '';
    } else if (rand < 0.90) {
      // 5% "--"
      score = '--';
    } else if (rand < 0.95) {
      // 5% "未参加"
      score = '未参加';
    } else {
      // 5% 文本数字
      score = `${Math.floor(60 + Math.random() * 40)}分`;
    }
    
    abnormalRows.push({
      '学生ID': studentId,
      '姓名': studentName,
      '考试场次': `第${exam}场`,
      '成绩': score,
      '日期': examDates[exam - 1],
      '班级': studentClass,
    });
  }
}

// 添加10条重复记录
for (let i = 0; i < 10; i++) {
  const originalRow = abnormalRows[Math.floor(Math.random() * abnormalRows.length)];
  abnormalRows.push({ ...originalRow });
}

const abnormalTSV = [
  abnormalHeaders.join('\t'),
  ...abnormalRows.map(row => abnormalHeaders.map(h => row[h]).join('\t'))
].join('\n');

fs.writeFileSync(path.join(outputDir, 'abnormal_long_table.tsv'), abnormalTSV, 'utf-8');
console.log(`✓ 异常值长表生成完成：${abnormalRows.length}行×${abnormalHeaders.length}列`);

console.log('\n=== 合成数据生成完成 ===');
console.log(`输出目录：${outputDir}`);
console.log('文件列表：');
console.log('  1. wide_table_56x18.tsv - 宽表（56人×18科目）');
console.log('  2. long_table_56x18.tsv - 长表（56人×18场=1008行）');
console.log('  3. abnormal_long_table.tsv - 含异常值的长表');
