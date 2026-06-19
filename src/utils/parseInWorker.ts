/**
 * v1.9: xlsx Worker 通信封装 — 与 xlsx.worker.ts 通信，返回原始 sheet 数据。
 */

interface SheetRawData {
  name: string;
  data: unknown[][];
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL('../workers/xlsx.worker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return _worker;
}

/** 在 Worker 线程解析 xlsx ArrayBuffer，返回各 sheet 的原始数据 */
export function parseXlsxInWorker(arrayBuffer: ArrayBuffer): Promise<SheetRawData[]> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = Math.random().toString(36).slice(2);

    const onMessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);

      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.sheetsData as SheetRawData[]);
      }
    };

    worker.addEventListener('message', onMessage);

    // 传递 ArrayBuffer 所有权，避免拷贝
    worker.postMessage({ id, arrayBuffer }, [arrayBuffer]);
  });
}