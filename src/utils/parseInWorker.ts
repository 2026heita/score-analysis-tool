/**
 * v1.9: xlsx Worker 通信封装 — 与 xlsx.worker.ts 通信，返回原始 sheet 数据。
 *
 * 健壮性（第二十六阶段）：
 * - 覆盖 message / error / messageerror / timeout 全部出口；
 * - 任何出口都必须 resolve/reject + clearTimeout + worker.terminate()；
 * - 每次调用创建独立 Worker，任务结束后 terminate，不残留运行期 Worker；
 * - 支持传入 sheetRows（SheetJS 解析行数上限）作为内存保护的资源限制。
 */

interface SheetRawData {
  name: string;
  data: unknown[][];
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

export interface ParseXlsxInWorkerOptions {
  /** SheetJS read 的 sheetRows：仅解析每个 sheet 的前 N 行，避免为大表构造完整 cell 对象 */
  sheetRows?: number;
  /** Worker 超时（毫秒）。默认 30s，手机/低性能设备解析大表需要更久 */
  timeoutMs?: number;
}

/**
 * Worker 超时（生产默认 30 秒）。
 * 真实 10,000～20,000 行 Excel 在手机或低性能电脑上可能耗时数秒，
 * 需预留充足余量，不能设太短造成误杀。
 */
export const XLSX_WORKER_TIMEOUT_MS = 30 * 1000;

/** 在 Worker 线程解析 xlsx ArrayBuffer，返回各 sheet 的原始数据 */
export function parseXlsxInWorker(
  arrayBuffer: ArrayBuffer,
  options: ParseXlsxInWorkerOptions = {},
): Promise<SheetRawData[]> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? XLSX_WORKER_TIMEOUT_MS;
    let settled = false;

    const worker = new Worker(
      new URL('../workers/xlsx.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const id = Math.random().toString(36).slice(2);

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.removeEventListener('messageerror', onMessageError);
      // 任务结束（成功/失败/超时）必定 terminate，不残留 Worker
      worker.terminate();
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      cleanup();
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      settle(() => {
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.sheetsData as SheetRawData[]);
        }
      });
    };

    const onError = (ev: ErrorEvent) => {
      settle(() => {
        reject(new Error(ev.message || 'Excel 解析进程异常，请尝试减少数据量后重新上传。'));
      });
    };

    const onMessageError = () => {
      settle(() => {
        reject(new Error('Excel 解析消息异常，请尝试重新上传。'));
      });
    };

    const timer = setTimeout(() => {
      settle(() => {
        reject(new Error('Excel 解析时间过长，已停止处理。请尝试减少文件大小或数据量后重新上传。'));
      });
    }, timeoutMs);

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);

    // 传递 ArrayBuffer 所有权，避免主线程保留完整副本
    worker.postMessage({ id, arrayBuffer, sheetRows: options.sheetRows }, [arrayBuffer]);
  });
}