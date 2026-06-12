import { read, utils } from 'xlsx';
import { parseRowsToTable, validateFile } from './tableParser';
import type { ParsedTable } from '../types';

export function parseTableFile(file: File): Promise<ParsedTable> {
  const validationError = validateFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('文件读取失败，请重试。'));

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('文件内容为空。'));
          return;
        }

        const workbook = read(data, { type: 'array', cellFormula: false, cellHTML: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error('文件中没有工作表。'));
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        // sheet_to_json with header:1 返回 [][] 格式，不执行公式
        const sheetData = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });

        if (!sheetData || sheetData.length === 0) {
          reject(new Error('文件中没有数据。'));
          return;
        }

        // 使用统一解析模块
        const result = parseRowsToTable(sheetData);
        resolve(result);
      } catch (err: any) {
        if (err instanceof Error && err.message) {
          reject(err);
        } else {
          reject(new Error('文件解析失败，请确认文件格式正确。'));
        }
      }
    };

    reader.readAsArrayBuffer(file);
  });
}
