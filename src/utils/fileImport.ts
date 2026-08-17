import { parseWorkbook } from './tableParser/workbook';
import { parseTableText } from './parseTable';
import type { ParsedTableResult } from './tableParser/types';
import type { ParsedTable } from '../types';

export interface ParsedFileResult extends ParsedTable {
  summary?: ParsedTableResult['summary'];
  availableSheets?: string[];
  reparseSheet?: (sheetName: string) => Promise<ParsedFileResult>;
}

const UTF8_BOM = '\uFEFF';

function stripUtf8Bom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

/**
 * 解析 CSV 文本（上传 .csv 与粘贴共用同一入口）。
 * 先剔除 UTF-8 BOM，再走统一 parseTableText / parseCsvText / parseRawRows 链路，
 * 与"粘贴 CSV 文本"的结果完全一致。
 */
export function parseCsvFileText(text: string): ParsedFileResult {
  const parsed: ParsedTable = parseTableText(stripUtf8Bom(text));
  return {
    headers: parsed.headers,
    rows: parsed.rows,
    warnings: parsed.warnings,
    summary: parsed.summary as ParsedTableResult['summary'] | undefined,
    dataVolumeState: parsed.dataVolumeState,
  };
}

export function parseTableFile(file: File, targetSheetName?: string): Promise<ParsedFileResult> {
  const validationError = validateFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }

  // 扩展名优先判断（移动端 MIME 可能为空）；无扩展名时回退 MIME 判断
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isCsv = ext === 'csv'
    || (!ext && (file.type === 'text/csv' || file.type === 'application/csv'));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('文件读取失败，请尝试重新上传或使用粘贴表格文本方式。'));
    };

    reader.onabort = () => {
      reject(new Error('文件读取被中断，请重新上传。'));
    };

    reader.onload = async (e) => {
      const data = e.target?.result;
      if (!data) {
        reject(new Error('文件内容为空。'));
        return;
      }

      try {
        if (isCsv) {
          // CSV：读取为文本，走统一 parseCsvFileText / parseTableText 链路
          // 与"粘贴 CSV 文本"完全一致，支持 UTF-8 有无 BOM 的中文。
          const text = stripUtf8Bom(String(data));
          resolve(parseCsvFileText(text));
          return;
        }

        // Excel / 其他：保持原有 SheetJS 工作簿解析路径
        const result = await parseWorkbook(data as ArrayBuffer, file.name, targetSheetName);

        // 转换为 ParsedFileResult
        const parsedResult: ParsedFileResult = {
          headers: result.headers,
          rows: result.rows,
          warnings: result.warnings,
          summary: result.summary,
          availableSheets: result.availableSheets,
          dataVolumeState: result.dataVolumeState,
          reparseSheet: async (sheetName: string) => {
            return parseTableFile(file, sheetName);
          },
        };

        resolve(parsedResult);
      } catch (err: any) {
        if (err instanceof Error && err.message) {
          reject(err);
        } else {
          reject(new Error('文件解析失败，请确认文件格式正确或尝试粘贴表格文本方式。'));
        }
      }
    };

    if (isCsv) {
      // CSV 读取为文本，交由统一 CSV 解析链路
      reader.readAsText(file, 'utf-8');
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

// ============================================================
// 文件安全校验
// ============================================================
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `这个文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB，上限 ${MAX_FILE_SIZE / 1024 / 1024}MB），浏览器无法安全处理，请精简数据后重新上传。`;
  }
  
  // 优先通过扩展名判断（移动端 MIME 可能为空）
  const ext = file.name.split('.').pop()?.toLowerCase();
  const validExts = ['csv', 'xlsx', 'xls'];
  
  if (ext && validExts.includes(ext)) {
    return null; // 扩展名有效，通过
  }
  
  // 扩展名无效时，检查 MIME type（桌面端备用）
  const mimeType = file.type;
  const validMimes = [
    'application/vnd.ms-excel',           // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'text/csv',                           // .csv
    'application/csv',                    // .csv 备用
  ];
  
  if (mimeType && validMimes.includes(mimeType)) {
    return null; // MIME 有效，通过
  }
  
  // 如果扩展名和 MIME 都无效
  if (!ext) {
    return '无法识别文件类型，请确保文件扩展名为 .csv、.xlsx 或 .xls。';
  }
  
  return '仅支持 .csv、.xlsx、.xls 格式的文件。';
}
