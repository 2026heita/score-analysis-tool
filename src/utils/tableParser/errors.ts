// ============================================================
// 成绩表智能解析器 - 错误定义
// ============================================================

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export function throwEmptyFile(): never {
  throw new ParseError('文件内容为空，无法解析。');
}

export function throwNoHeader(): never {
  throw new ParseError('未能识别有效表头。请确认表格中存在字段行，例如"名次、总分、成绩"等。');
}

export function throwNoData(): never {
  throw new ParseError('已识别到表头，但没有发现有效数据行。');
}

export function throwNoSheet(): never {
  throw new ParseError('文件中没有工作表。');
}

export function throwFileTooLarge(sizeMB: number, maxMB: number): never {
  throw new ParseError(`文件过大（${sizeMB.toFixed(1)}MB），最大支持 ${maxMB}MB。`);
}

export function throwInvalidFormat(): never {
  throw new ParseError('仅支持 .csv、.xlsx、.xls 格式的文件。');
}

export function throwNoDataInSheet(): never {
  throw new ParseError('文件中没有数据。');
}

export function throwRowLimitExceeded(maxRows: number): never {
  throw new ParseError(`数据超过 ${maxRows.toLocaleString()} 行，超出单次分析上限，无法完整解析。请精简数据后重新上传。`);
}
