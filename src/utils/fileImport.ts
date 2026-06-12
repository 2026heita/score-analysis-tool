import { read, utils } from 'xlsx';
import type { ParsedTable } from '../types';

export function parseTableFile(file: File): Promise<ParsedTable> {
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

        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error('文件中没有工作表。'));
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const sheetData = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

        if (!sheetData || sheetData.length === 0) {
          reject(new Error('文件中没有数据。'));
          return;
        }

        // 第一行是表头
        const rawHeaders = sheetData[0].map(h => String(h ?? '').trim());
        if (rawHeaders.length === 0 || rawHeaders.every(h => h === '')) {
          reject(new Error('文件第一行没有有效字段名。'));
          return;
        }

        // 后续行是数据
        const dataRows = sheetData.slice(1);
        if (dataRows.length === 0 || dataRows.every(row => !row || row.length === 0 || row.every((v: any) => v === '' || v == null))) {
          reject(new Error('文件中只有表头，没有数据行。'));
          return;
        }

        // 直接返回 ParsedTable，手动处理避免循环依赖
        const headers = deduplicateHeaders(rawHeaders);
        const rows: Record<string, string>[] = [];
        for (const row of dataRows) {
          const rowArr = row as any[];
          if (!rowArr || rowArr.every(v => v === '' || v == null)) continue;
          const obj: Record<string, string> = {};
          for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = i < rowArr.length ? String(rowArr[i] ?? '') : '';
          }
          rows.push(obj);
        }

        if (rows.length === 0) {
          reject(new Error('文件中没有有效数据行。'));
          return;
        }

        const warnings: string[] = [];
        const hasDups = hasDuplicate(rawHeaders);
        if (hasDups) warnings.push('检测到重复字段名，已自动重命名。');

        resolve({ headers, rows, warnings });
      } catch (err: any) {
        reject(new Error(err?.message || '文件解析失败，请确认文件格式正确。'));
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

function deduplicateHeaders(headers: string[]): string[] {
  const seen: Record<string, number> = {};
  return headers.map(h => {
    const key = h.toLowerCase();
    if (seen[key] !== undefined) {
      seen[key]++;
      return `${h}_${seen[key]}`;
    }
    seen[key] = 0;
    return h;
  });
}

function hasDuplicate(headers: string[]): boolean {
  const seen = new Set<string>();
  for (const h of headers) {
    const key = h.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
