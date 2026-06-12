import type { ParsedTable } from '../types';

// ============================================================
// 常量与安全限制
// ============================================================
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_ROWS = 20000;
const MAX_COLS = 200;
const HEADER_SCAN_ROWS = 30;
const MIN_HEADER_SCORE = 5;

// ============================================================
// 关键词
// ============================================================
const HEADER_KEYWORDS = [
  '名次', '排名', '位次', '序号', '总分', '成绩',
  '语文', '数学', '外语', '英语', '物理', '化学', '生物', '政治', '历史', '地理',
  '科目', '人数', '累计', '最高', '最低', '平均',
  '单科', '两科', '之和', '最高成绩', '次高', '得分率',
  '合计', '标准分', '原始分',
];

const EXPLANATION_KEYWORDS = [
  '说明', '提示', '注：', '备注', '请', '查询',
  '查询条件', '查询结果', '以下', '包含', '以上', '仅供参考',
];

// ============================================================
// 数值清洗
// ============================================================
export function parseNumericValue(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  const str = String(val).trim();
  if (str === '' || str === '-') return null;
  const cleaned = str.replace(/,/g, '').replace(/%$/, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function cleanHeaderName(raw: string): string {
  let cleaned = raw.replace(/[\u0000-\u001f\u007f\u00a0]/g, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ============================================================
// 字段去重
// ============================================================
export function dedupeHeaders(headers: string[], warnings: string[]): string[] {
  const seen: Record<string, number> = {};
  let hasDup = false;
  const result: string[] = [];
  let emptyCounter = 0;

  for (const h of headers) {
    if (result.length >= MAX_COLS) break;
    const cleaned = cleanHeaderName(h);
    if (cleaned === '') {
      emptyCounter++;
      result.push(`未命名字段${emptyCounter}`);
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen[key] !== undefined) {
      hasDup = true;
      seen[key]++;
      result.push(`${cleaned}_${seen[key]}`);
    } else {
      seen[key] = 0;
      result.push(cleaned);
    }
  }
  if (hasDup) warnings.push('检测到重复字段名，已自动重命名。');
  return result;
}

// ============================================================
// 表格行规范化
// ============================================================
export function normalizeRows(rawRows: unknown[][]): string[][] {
  return rawRows.map(row => {
    if (!row) return [];
    if (!Array.isArray(row)) return [String(row)];
    return row.slice(0, MAX_COLS).map(cell => String(cell ?? '').trim());
  });
}

// ============================================================
// 分隔符检测（文本模式）
// ============================================================
export function detectDelimiter(line: string): 'tab' | 'comma' | 'multi-space' {
  if (line.includes('\t')) return 'tab';
  const commaCount = (line.match(/,/g) || []).length;
  if (commaCount >= 1) {
    const parts = line.split(',');
    const textParts = parts.filter(p => isNaN(parseFloat(p.trim())) || p.trim() === '');
    if (textParts.length > 0 || parts.length >= 2) return 'comma';
  }
  return 'multi-space';
}

export function splitLine(line: string, delimiter: 'tab' | 'comma' | 'multi-space'): string[] {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').map(c => c.trim());
    case 'comma':
      return line.split(',').map(c => c.trim());
    case 'multi-space':
      return line.split(/\s{2,}/).map(c => c.trim());
  }
}

// ============================================================
// 行特征判断
// ============================================================
function isEmptyRow(row: unknown[]): boolean {
  if (!row || row.length === 0) return true;
  return row.every(c => c === '' || c === '-' || c === null || c === undefined);
}

function isExplanationRow(strs: string[]): boolean {
  const text = strs.join(' ');
  return EXPLANATION_KEYWORDS.some(kw => text.includes(kw));
}

function rowHasManyNumbers(row: unknown[]): number {
  if (!row || row.length === 0) return 0;
  return row.filter(v => {
    const n = parseNumericValue(v);
    return n !== null;
  }).length;
}

// ============================================================
// 表头识别（核心算法）
// ============================================================
interface HeaderDetectionResult {
  headerRowIndex: number;
  headers: string[];
  dataRows: unknown[][];
  confidence: number;
  warnings: string[];
}

export function detectHeaderRow(rawRows: unknown[][]): HeaderDetectionResult {
  const scanLimit = Math.min(rawRows.length, HEADER_SCAN_ROWS);
  const warnings: string[] = [];
  let bestScore = -Infinity;
  let bestIdx = -1;

  for (let i = 0; i < scanLimit; i++) {
    const row = rawRows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const rowStrs: string[] = row.map(v => String(v ?? '').trim());
    const score = scoreHeaderCandidate(rowStrs, row, rawRows, i);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestScore < MIN_HEADER_SCORE) {
    return {
      headerRowIndex: -1,
      headers: [],
      dataRows: [],
      confidence: 0,
      warnings,
    };
  }

  const headerRow = rawRows[bestIdx];
  const headers = headerRow.map(h => String(h ?? '').trim());
  const dataRows = rawRows.slice(bestIdx + 1);

  return {
    headerRowIndex: bestIdx,
    headers,
    dataRows,
    confidence: bestScore,
    warnings,
  };
}

function scoreHeaderCandidate(
  rowStrs: string[],
  _row: unknown[],
  allRows: unknown[][],
  index: number,
): number {
  let score = 0;

  const nonEmpty = rowStrs.filter(c => c !== '' && c !== '-');
  const nonEmptyCount = nonEmpty.length;

  if (nonEmptyCount < 2) {
    score -= 20;
    return score;
  }

  // 非空越多适当加分
  score += Math.min(nonEmptyCount * 2, 10);

  // 说明性文字扣分
  if (isExplanationRow(rowStrs)) {
    score -= 15;
  }

  // 关键词加分
  let keywordHits = 0;
  for (const cell of nonEmpty) {
    for (const kw of HEADER_KEYWORDS) {
      if (cell.includes(kw)) {
        keywordHits++;
        break;
      }
    }
  }
  score += keywordHits * 5;

  // 字段大部分是纯数字 → 像数据行不像表头
  const numericCells = nonEmpty.filter(c => {
    const n = parseFloat(c);
    return !isNaN(n) && c !== '';
  }).length;
  if (numericCells / Math.max(nonEmptyCount, 1) > 0.7 && nonEmptyCount >= 3) {
    score -= 15;
  }

  // 检查后续行是否有数值数据
  for (let offset = 1; offset <= 3; offset++) {
    const nextIdx = index + offset;
    if (nextIdx < allRows.length) {
      const nextRow = allRows[nextIdx];
      const nextNumCount = rowHasManyNumbers(nextRow || []);
      if (nextNumCount >= 2) {
        score += 3;
        break;
      }
      if (nextRow && isEmptyRow(nextRow as unknown[])) {
        score -= 2;
      }
    }
  }

  // 整行像标题（只有一个长文本）
  if (nonEmptyCount === 1 && nonEmpty[0] && nonEmpty[0].length > 20) {
    score -= 20;
  }

  return score;
}

// ============================================================
// 数据行过滤
// ============================================================
export function filterDataRows(rawRows: unknown[], headers: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let processed = 0;

  for (const row of rawRows) {
    if (processed >= MAX_ROWS) break;
    if (!row) continue;
    const arr: unknown[] = Array.isArray(row) ? row : [row];
    const strs = arr.map(v => String(v ?? '').trim());

    // 全空行跳过
    if (strs.every(c => c === '' || c === '-')) continue;

    const nonEmptyStrs = strs.filter(s => s !== '' && s !== '-');

    // 说明性文字行跳过
    if (nonEmptyStrs.length <= 1 && EXPLANATION_KEYWORDS.some(kw => nonEmptyStrs.some(s => s.includes(kw)))) continue;

    // 单个长文本说明行跳过
    if (nonEmptyStrs.length === 1 && nonEmptyStrs[0].length > 30) continue;

    // 至少 2 个有效单元格
    if (nonEmptyStrs.length < 2 && strs.length < 2) continue;

    // 构建行对象
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = i < strs.length ? strs[i] : '';
    }

    rows.push(obj);
    processed++;
  }

  return rows;
}

// ============================================================
// 统一解析入口
// ============================================================
export function parseRowsToTable(rawRows: unknown[][]): ParsedTable {
  if (!rawRows || rawRows.length === 0) {
    throw new Error('文件内容为空，无法解析。');
  }

  // 限制列数
  const trimmed = rawRows.map(row => {
    if (!Array.isArray(row)) return [String(row ?? '')];
    return row.slice(0, MAX_COLS);
  });

  // 表头识别
  const detection = detectHeaderRow(trimmed);

  if (detection.headerRowIndex < 0) {
    throw new Error('未能识别有效表头。请确认表格中存在字段行，例如"名次、总分、成绩"等。');
  }

  // 清洗表头
  const headers = dedupeHeaders(detection.headers, detection.warnings);

  // 过滤数据行
  const rows = filterDataRows(detection.dataRows, headers);

  if (rows.length === 0) {
    throw new Error('已识别到表头，但没有发现有效数据行。');
  }

  return {
    headers,
    rows,
    warnings: detection.warnings,
  };
}

// ============================================================
// 文件安全校验
// ============================================================
export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB。`;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
    return '仅支持 .csv、.xlsx、.xls 格式的文件。';
  }
  return null;
}

// 安全限制导出
export { MAX_FILE_SIZE, MAX_ROWS, MAX_COLS };
