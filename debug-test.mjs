// Quick debug script to see actual header results

function removeWeightSuffix(name) {
  return name.replace(/（\d+%）/g, '').replace(/\(\d+%\)/g, '').trim();
}

const STANDALONE_FIELDS = ['班级', '学号', '姓名', '总分', '班级排名', '签名', '考号', '座号', '序号', '编号', '名次', '排名', '位次'];

function isStandalone(name) {
  const cleaned = removeWeightSuffix(name).trim();
  return STANDALONE_FIELDS.some(kw => cleaned === kw || cleaned.includes(kw));
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
          if (!grid[r][c]) { grid[r][c] = parentValue; }
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
    const textCells = row.filter(c => {
      if (!c || c === '-') return false;
      const n = parseFloat(c);
      return isNaN(n) || !Number.isFinite(n);
    }).length;
    if (textCells >= 2) headerCandidates.push(i);
  }
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
  const colCount = Math.max(...bestGroup.map(r => grid[r]?.length ?? 0));
  const headers = [];
  for (let col = 0; col < colCount; col++) {
    let parentValue = '';
    for (let rowIdx = 0; rowIdx < bestGroup.length; rowIdx++) {
      const cellValue = grid[bestGroup[rowIdx]]?.[col] ?? '';
      const cleaned = removeWeightSuffix(cellValue);
      if (!cleaned) continue;
      if (rowIdx < bestGroup.length - 1) {
        const rowNonEmpty = (grid[bestGroup[rowIdx]] ?? []).filter(c => c && c !== '-').length;
        if (rowNonEmpty === 1 && colCount > 5) continue;
        parentValue = cleaned;
        continue;
      }
      if (isStandalone(cleaned)) {
        headers.push(cleaned);
      } else if (parentValue) {
        headers.push(`${parentValue}_${cleaned}`);
      } else {
        headers.push(cleaned);
      }
    }
    if (headers.length <= col) {
      const lastRowVal = grid[bestGroup[bestGroup.length - 1]]?.[col] ?? '';
      headers.push(lastRowVal ? removeWeightSuffix(lastRowVal) : '');
    }
  }
  return {
    isMultiRow: true,
    headerRows: [bestGroup[0], bestGroup[bestGroup.length - 1]],
    headers,
  };
}

// Test data - row 1 has parent values filled in (simulating Excel merged cells after filling)
// Row 2 has child headers
// Row 1 has 33 elements but row 2 only has 32! Let me check...
const multiRowTestData = [
  ['数据Q243班综合测评表25-26-1'],
  ['班级', '学号', '姓名', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '德育（20%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '智育（50%）', '体育（10%）', '体育（10%）', '体育（10%）', '体育（10%）', '美育（10%）', '美育（10%）', '美育（10%）', '美育（10%）', '劳育（10%）', '劳育（10%）', '劳育（10%）', '劳育（10%）', '总分', '班级排名', '签名'],
  ['', '', '', '马克思主义基本原理', '创新创业基础', '平时成绩', '加分', '扣分', '合计', 'Python及其应用', '大学英语A3', '计算机组成原理和汇编语言', '数据结构与算法', '数据结构与算法课程实践', '大学物理B', '大学物理实验B', '加分', '扣分', '合计', '体育A3', '加分', '扣分', '合计', '加分', '扣分', '合计', '加分', '扣分', '合计', '', '', ''],
  ['5班', '202401', '张三', '85', '90', '95', '5', '0', '92', '90', '85', '88', '92', '95', '80', '85', '3', '0', '88', '90', '2', '0', '92', '5', '0', '95', '3', '0', '98', '580', '1', ''],
];

// Print lengths
console.log('Row 0 length:', multiRowTestData[0].length);
console.log('Row 1 length:', multiRowTestData[1].length);
console.log('Row 2 length:', multiRowTestData[2].length);
console.log('Row 3 length:', multiRowTestData[3].length);

const result = detectAndFlattenMultiRowHeaders(multiRowTestData);

const fs = require('fs');
const output = result.headers.map((h, i) => `${i}: "${h}"`).join('\n');
fs.writeFileSync('debug-headers.txt', 'Headers:\n' + output + '\n\nisMultiRow: ' + result.isMultiRow + '\nheaderRows: ' + JSON.stringify(result.headerRows), 'utf8');
console.log('Written to debug-headers.txt');
console.log('isMultiRow:', result.isMultiRow);
console.log('headerRows:', result.headerRows);
