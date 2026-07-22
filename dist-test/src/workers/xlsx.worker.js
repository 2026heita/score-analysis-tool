/**
 * v1.9: xlsx Web Worker — 将 xlsx 二进制解析移至 Worker 线程，避免主线程阻塞。
 *
 * 仅处理 xlsx 库的 read() + sheet_to_json() 两步（最重的部分），
 * 表头检测、字段分类等轻量逻辑仍在主线程。
 */
import { read, utils } from 'xlsx';
self.onmessage = (e) => {
    const { id, arrayBuffer } = e.data;
    try {
        const workbook = read(arrayBuffer, { type: 'array', cellFormula: false, cellHTML: false });
        const sheetNames = workbook.SheetNames;
        const sheetsData = [];
        for (const name of sheetNames) {
            const sheet = workbook.Sheets[name];
            const data = utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
            const merges = (sheet['!merges'] || []).map((m) => ({
                s: { r: m.s.r, c: m.s.c },
                e: { r: m.e.r, c: m.e.c },
            }));
            sheetsData.push({ name, data, merges });
        }
        self.postMessage({ id, sheetsData });
    }
    catch (err) {
        self.postMessage({ id, error: err.message || '文件解析失败' });
    }
};
