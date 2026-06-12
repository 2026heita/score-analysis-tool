import { parseWorkbook } from './tableParser/workbook';
import type { ParsedTableResult } from './tableParser/types';
import type { ParsedTable } from '../types';

export interface ParsedFileResult extends ParsedTable {
  summary?: ParsedTableResult['summary'];
  availableSheets?: string[];
  reparseSheet?: (sheetName: string) => Promise<ParsedFileResult>;
}

export function parseTableFile(file: File, targetSheetName?: string): Promise<ParsedFileResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('文件读取失败，请重试。'));

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('文件内容为空。'));
          return;
        }

        const result = await parseWorkbook(data as ArrayBuffer, file.name, targetSheetName);

        // 转换为 ParsedFileResult
        const parsedResult: ParsedFileResult = {
          headers: result.headers,
          rows: result.rows,
          warnings: result.warnings,
          summary: result.summary,
          availableSheets: result.availableSheets,
          reparseSheet: async (sheetName: string) => {
            return parseTableFile(file, sheetName);
          },
        };

        resolve(parsedResult);
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

// ============================================================
// 文件安全校验
// ============================================================
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

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
