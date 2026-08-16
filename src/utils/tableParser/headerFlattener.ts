// ============================================================
// 成绩表智能解析器 - 多级表头扁平化
// ============================================================

import { parseNumericValueLegacy } from './numericParser';
import { minMax } from '../stats';

// ============================================================
// 不需要前缀的完整字段（这些字段本身已完整，不要拼接父级）
// ============================================================
const STANDALONE_FIELDS = [
  '班级', '学号', '姓名', '总分', '班级排名', '签名',
  '考号', '座号', '姓名', '序号', '编号',
  '名次', '排名', '位次',
];

// ============================================================
// 去除权重括号：德育（20%） → 德育
// ============================================================
function removeWeightSuffix(name: string): string {
  return name.replace(/（\d+%）/g, '').replace(/\(\d+%\)/g, '').trim();
}

// ============================================================
// 判断字段是否为完整独立字段（不需要拼接父级）
// ============================================================
function isStandalone(name: string): boolean {
  const cleaned = removeWeightSuffix(name).trim();
  return STANDALONE_FIELDS.some(kw => cleaned === kw || cleaned.includes(kw));
}

// ============================================================
// 合并单元格信息
// ============================================================
export interface MergeRange {
  s: { r: number; c: number }; // start row, col
  e: { r: number; c: number }; // end row, col
}

// ============================================================
// 从 Excel worksheet 中提取合并单元格信息
// ============================================================
export function getMergedHeaders(rawRows: unknown[][], merges?: MergeRange[]): string[][] {
  if (!merges || merges.length === 0) {
    return rawRows.map(row => row.map(v => String(v ?? '').trim()));
  }

  const rowCount = rawRows.length;
  const mm = minMax(rawRows.map(r => r.length));
  const colCount = mm ? mm.max : 0;
  const grid: string[][] = [];

  for (let r = 0; r < rowCount; r++) {
    const row = rawRows[r] || [];
    grid[r] = [];
    for (let c = 0; c < colCount; c++) {
      grid[r][c] = String((row[c] ?? '')).trim();
    }
  }

  // 填充合并区域
  for (const merge of merges) {
    const parentValue = String((rawRows[merge.s.r]?.[merge.s.c] ?? '')).trim();
    if (!parentValue) continue;

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r < grid.length && c < (grid[r]?.length ?? 0)) {
          // 如果当前单元格为空，填充父级值
          if (!grid[r][c]) {
            grid[r][c] = parentValue;
          }
        }
      }
    }
  }

  return grid;
}

// ============================================================
// 检测多级表头并扁平化
// ============================================================
export interface MultiRowHeaderDetection {
  /** 是否是多级表头 */
  isMultiRow: boolean;
  /** 表头行范围 [start, end] */
  headerRows: [number, number];
  /** 扁平化后的字段名 */
  headers: string[];
}

/**
 * 检测多级表头并扁平化
 * 
 * 算法：
 * 1. 扫描前 5 行，寻找连续 2~3 行都像表头的情况
 * 2. 如果找到，将多行合并为最终字段名
 * 3. 父级 + 子级 用 _ 拼接
 * 4. 如果子字段本身已完整（如班级、姓名），不拼接
 */
export function detectAndFlattenMultiRowHeaders(
  rawRows: unknown[][],
  merges?: MergeRange[],
): MultiRowHeaderDetection {
  // 先处理合并单元格
  const grid = getMergedHeaders(rawRows, merges);

  // 扫描前 5 行，寻找可能的多级表头
  const scanLimit = Math.min(5, rawRows.length);
  const headerCandidates: number[] = [];

  for (let i = 0; i < scanLimit; i++) {
    const row = grid[i];
    if (!row) continue;

    const nonEmpty = row.filter(c => c !== '' && c !== '-').length;
    if (nonEmpty < 2) continue;

    // 统计文本单元格和数值单元格
    let textCells = 0;
    let numericCells = 0;
    for (const c of row) {
      if (!c || c === '-') continue;
      if (parseNumericValueLegacy(c) === null) {
        textCells++;
      } else {
        numericCells++;
      }
    }

    // 表头行应该以文本为主，数值单元格不应超过文本单元格
    if (textCells >= 2 && textCells >= numericCells) {
      headerCandidates.push(i);
    }
  }

  // 寻找连续的表头行
  let bestGroup: number[] | null = null;

  for (let i = 0; i < headerCandidates.length; i++) {
    const group = [headerCandidates[i]];
    for (let j = i + 1; j < headerCandidates.length; j++) {
      if (headerCandidates[j] === headerCandidates[j - 1] + 1) {
        group.push(headerCandidates[j]);
      } else {
        break;
      }
    }
    // 至少 2 行连续表头
    if (group.length >= 2 && (!bestGroup || group.length > bestGroup.length)) {
      bestGroup = group;
    }
  }

  if (!bestGroup || bestGroup.length < 2) {
    // 不是多级表头，返回单行表头
    return {
      isMultiRow: false,
      headerRows: [0, 0],
      headers: grid[0] ? grid[0].map(c => removeWeightSuffix(c)) : [],
    };
  }

  // 扁平化多级表头
  const mm = minMax(bestGroup.map(r => grid[r]?.length ?? 0));
  const colCount = mm ? mm.max : 0;
  const headers: string[] = [];

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

// ============================================================
// 简单的单行表头提取（用于非多级表头场景）
// ============================================================
export function extractSingleRowHeader(rawRows: unknown[][], merges?: MergeRange[]): {
  headers: string[];
  headerRowIndex: number;
} {
  const grid = getMergedHeaders(rawRows, merges);
  const row = grid[0] ?? [];
  return {
    headers: row.map(c => removeWeightSuffix(String(c ?? '').trim())),
    headerRowIndex: 0,
  };
}
