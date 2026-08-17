/**
 * v1.9: xlsx Web Worker — 将 xlsx 二进制解析移至 Worker 线程，避免主线程阻塞。
 * 
 * 仅处理 xlsx 库的 read() + sheet_to_json() 两步（最重的部分），
 * 表头检测、字段分类等轻量逻辑仍在主线程。
 */

import { read, utils } from 'xlsx';

self.onmessage = (e: MessageEvent) => {
  const { id, arrayBuffer, sheetRows } = e.data;

  try {
    const readOpts: any = {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
    };
    // 第二层资源保护：sheetRows 限制每个 sheet 解析到前 N 行（近主线程业务上限，
    // 并预留表头/说明/多级表头/检测余量），避免为大表构造完整 cell 对象。
    if (typeof sheetRows === 'number' && sheetRows > 0) {
      readOpts.sheetRows = sheetRows;
    }

    const workbook = read(arrayBuffer, readOpts);
    const sheetNames = workbook.SheetNames;

    const sheetsData: { name: string; data: unknown[][]; merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] }[] = [];

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const data = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
      const merges = ((sheet['!merges'] as any[]) || []).map((m: any) => ({
        s: { r: m.s.r, c: m.s.c },
        e: { r: m.e.r, c: m.e.c },
      }));
      sheetsData.push({ name, data, merges });
    }

    self.postMessage({ id, sheetsData });
  } catch (err: any) {
    self.postMessage({ id, error: err.message || '文件解析失败，请确认文件为有效的 Excel 文件。' });
  }
};