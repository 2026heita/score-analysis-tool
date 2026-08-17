// ============================================================
// 成绩表智能解析器 - 引号感知 CSV 解析状态机
// ============================================================
// 职责：将逗号分隔文本（CSV / 粘贴文本）解析为二维数组。
// 支持标准 RFC4180 引号字段：
//   - 引号内逗号不作为分隔符  "优秀,稳定"
//   - 引号内双引号转义  ""  →  "
//   - 引号内换行保持为一个逻辑记录
//   - CRLF (\r\n) 不产生 \r 残留
//   - 未闭合引号检测并返回 warning
// 原则：本模块只负责"按是什么分隔符切分字段"，不做任何数值转换。
// ============================================================

export interface CsvParseResult {
  rows: string[][];
  warnings: string[];
  /**
   * 未闭合引号的逻辑记录下标（对应 rows 中的下标）。
   * 这类残缺记录不允许进入有效数据，由上层解析排除。
   */
  malformedRowIndices: number[];
}

/**
 * 统计一段文本中"引号外"的指定字符数量
 * 用于分隔符检测，忽略引号内部的逗号。
 */
export function countUnquotedChar(text: string, char: string): number {
  if (!text) return 0;
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      // 引号内连续两个引号是转义，跳过
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === char && !inQuotes) count++;
  }
  return count;
}

/**
 * 解析一整段 CSV 文本为二维数组（引号感知状态机）。
 *
 * @param text 完整文本
 * @param delimiter 字段分隔符（默认逗号）
 * @returns { rows, warnings }
 */
export function parseCsvText(text: string, delimiter: string = ','): CsvParseResult {
  const warnings: string[] = [];
  const rows: string[][] = [];
  const malformedRowIndices: number[] = [];
  if (!text) return { rows, warnings, malformedRowIndices };

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let lineNumber = 1;        // 当前物理行号（不含引号内换行的逻辑行）
  let recordStartLine = 1;   // 当前记录的起始物理行号（用于未闭合引号提示）
  let sawAnyContent = false; // 该记录是否已写入任何内容

  const closeRecord = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
    sawAnyContent = false;
  };

  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // 转义的双引号
          field += '"';
          i += 2;
          continue;
        }
        // 闭合引号
        inQuotes = false;
        i++;
        continue;
      }
      // 引号内内容原样保留（含逗号、换行）
      field += ch;
      if (ch === '\n') lineNumber++;
      i++;
      continue;
    }

    // 非引号状态
    if (ch === '"' && field === '') {
      // 字段起始引号
      inQuotes = true;
      sawAnyContent = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      sawAnyContent = true;
      i++;
      continue;
    }
    if (ch === '\n') {
      closeRecord();
      lineNumber++;
      recordStartLine = lineNumber;
      i++;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        // CRLF：跳过 \r，交由 \n 处理，避免残留
        i++;
        continue;
      }
      // 单独的 \r 视为换行（旧 Mac 格式）
      closeRecord();
      lineNumber++;
      recordStartLine = lineNumber;
      i++;
      continue;
    }
    field += ch;
    sawAnyContent = true;
    i++;
  }

  // 收尾：最后一个字段或记录
  if (field !== '' || row.length > 0 || sawAnyContent) {
    const rowIndex = rows.length;
    row.push(field);
    if (inQuotes) {
      // 未闭合引号：该逻辑记录残缺，标记为 malformed，不允许进入有效数据
      malformedRowIndices.push(rowIndex);
    }
    rows.push(row);
  }

  if (inQuotes) {
    warnings.push(`第 ${recordStartLine} 行检测到未闭合的引号，该记录可能不完整，请检查引号是否成对。`);
  }

  return { rows, warnings, malformedRowIndices };
}

/**
 * 解析单行 CSV（引号感知），返回字段数组。
 * 用于 splitLine('comma') 等单行场景。
 */
export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const { rows } = parseCsvText(line, delimiter);
  return rows[0] || [];
}