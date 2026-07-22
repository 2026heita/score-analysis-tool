// ============================================================
// 成绩表智能解析器 - 错误定义
// ============================================================
export class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParseError';
    }
}
export function throwEmptyFile() {
    throw new ParseError('文件内容为空，无法解析。');
}
export function throwNoHeader() {
    throw new ParseError('未能识别有效表头。请确认表格中存在字段行，例如"名次、总分、成绩"等。');
}
export function throwNoData() {
    throw new ParseError('已识别到表头，但没有发现有效数据行。');
}
export function throwNoSheet() {
    throw new ParseError('文件中没有工作表。');
}
export function throwFileTooLarge(sizeMB, maxMB) {
    throw new ParseError(`文件过大（${sizeMB.toFixed(1)}MB），最大支持 ${maxMB}MB。`);
}
export function throwInvalidFormat() {
    throw new ParseError('仅支持 .csv、.xlsx、.xls 格式的文件。');
}
export function throwNoDataInSheet() {
    throw new ParseError('文件中没有数据。');
}
