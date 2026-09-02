/**
 * 异常值检测 - 通用纯函数（无 React / 无统计分析库依赖）
 *
 * 设计目标：
 * - 结构化结果：不是只给一个计数，而是能回答
 *   "哪一行？哪个字段？值是多少？为什么被判异常？"
 * - 保守默认：异常值是"统计异常候选 / 可能异常值"，不是"错误数据"。
 * - 领域无关：identifier / dimension / time 等字段默认不做自动异常检测；
 *   低基数离散整数（如状态码、优先级、等级）也默认跳过连续型异常检测。
 *
 * 误判防护（针对历史 IQR 实现的缺陷）：
 * - 有效样本 < minSampleSize（默认 8）：返回 insufficient_data，绝不强行判异常。
 * - IQR === 0（数据变化过小）：不采用零宽区间；改用绝对偏差回退，
 *   仅在偏离主值区超过量级阈值时才判异常，否则返回 insufficient_variation。
 * - NaN / Infinity / null / 空：一律忽略，不污染 Q1/Q3。
 * - 重复值：不特殊当作 0，统一按上述规则处理。
 */

import { calculateQuantile } from '../utils/stats';

/** 异常检测方法（当前仅 IQR + 退化回退） */
export type OutlierMethod = 'iqr';

/** 检测状态：
 *  - detected            检测到异常候选
 *  - none                无异常
 *  - insufficient_data   有效样本过少，未执行判断
 *  - insufficient_variation 数据变化过小，无法可靠判断
 *  - unsupported         该字段不适合连续型异常检测（identifier/discrete 等）
 */
export type OutlierStatus =
  | 'detected'
  | 'none'
  | 'insufficient_data'
  | 'insufficient_variation'
  | 'unsupported';

/** 四分位统计量 */
export interface OutlierDetectionStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
}

/** 异常判定边界 */
export interface OutlierDetectionBounds {
  lower: number;
  upper: number;
}

/** 单条异常记录 */
export interface OutlierRecord {
  /** 指向传入 values 数组的 0 基下标；由调用方映射为真实数据行 */
  rowIndex: number;
  value: number;
  direction: 'low' | 'high';
  /** 偏离边界的绝对距离 */
  distance: number;
  /** 人类可读的判定依据，如 "> 上界 53200" */
  reason: string;
}

/** 结构化异常检测结果 */
export interface OutlierDetectionResult {
  field: string;
  method: OutlierMethod;
  status: OutlierStatus;
  /** 有效（非空、可解析）样本数 */
  sampleSize: number;
  /** 去重后的取值个数 */
  uniqueCount: number;
  /** 是否判定为"低基数离散型"（连续异常检测不适用） */
  discreteLowCardinality: boolean;
  outlierCount: number;
  bounds?: OutlierDetectionBounds;
  stats?: OutlierDetectionStats;
  records: OutlierRecord[];
}

/** 检测选项 */
export interface OutlierDetectOptions {
  /** 字段名（用于结果字段标识） */
  field?: string;
  /** 字段业务角色；identifier/time/description/ignored/dimension → 跳过自动检测 */
  fieldRole?:
    | 'metric'
    | 'dimension'
    | 'identifier'
    | 'time'
    | 'description'
    | 'ignored'
    | 'unspecified'
    | 'other';
  /** 最小有效样本数（默认 8）；低于则不判异常 */
  minSampleSize?: number;
  /** IQR 倍数阈值（默认 1.5） */
  iqrMultiplier?: number;
  /** 低基数离散判定：整数且去重取值数 ≤ 该值 → 跳过（默认 6） */
  discreteMaxUnique?: number;
  /**
   * 离散序数值判定：只有当整数取值 ≤ 该上限时才当作"序数编码"跳过
   * （默认 20）。用于区分真正的小序数编码（rating 1-5、星期 1-7、月份 1-12、
   * 优先级 1-3、等级 1-9、状态码 0-6）与"抽样得到的连续整数量"
   * （如 [85,87,100,86,88,90]，100 是真实离群值，不应被离散保护漏检）。
   */
  discreteMaxValue?: number;
}

const DEFAULT_OPTIONS = {
  minSampleSize: 8,
  iqrMultiplier: 1.5,
  discreteMaxUnique: 6,
  discreteMaxValue: 20,
};

/** 生存异常的角色白名单：只有这些角色才做连续型异常检测 */
const DETECTABLE_ROLES = new Set(['metric', 'unspecified', 'other']);

/** 显示用四舍五入（最多 4 位小数），避免 1e308 等溢出 */
function roundForDisplay(value: number): number {
  const scaled = value * 10000;
  if (!Number.isFinite(scaled)) return value;
  return Math.round(scaled) / 10000;
}

/**
 * 对一组数值进行结构化异常检测。
 *
 * @param values 数值数组（含 NaN / Infinity / null / 空字符串会自动过滤）
 * @param options 检测选项
 * @returns 结构化检测结果
 */
export function detectFieldOutliers(
  values: number[],
  options: OutlierDetectOptions = {}
): OutlierDetectionResult {
  const opts = {
    minSampleSize: options.minSampleSize ?? DEFAULT_OPTIONS.minSampleSize,
    iqrMultiplier: options.iqrMultiplier ?? DEFAULT_OPTIONS.iqrMultiplier,
    discreteMaxUnique:
      options.discreteMaxUnique ?? DEFAULT_OPTIONS.discreteMaxUnique,
    discreteMaxValue:
      options.discreteMaxValue ?? DEFAULT_OPTIONS.discreteMaxValue,
  };

  // 记录"值 + 原始下标"，同时过滤非有限值（NaN/Infinity）
  const clean: Array<{ value: number; idx: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number') continue;
    if (!Number.isFinite(v)) continue;
    clean.push({ value: v, idx: i });
  }

  const sampleSize = clean.length;
  const uniqueCount = new Set(clean.map(c => c.value)).size;

  const base: Omit<OutlierDetectionResult, 'status' | 'bounds' | 'stats'> = {
    field: options.field ?? '',
    method: 'iqr',
    sampleSize,
    uniqueCount,
    discreteLowCardinality: false,
    outlierCount: 0,
    records: [],
  };

  // 1. 角色不适配 → 跳过
  if (options.fieldRole && !DETECTABLE_ROLES.has(options.fieldRole)) {
    return { ...base, status: 'unsupported' };
  }

  // 2. 样本过少 → 不判异常
  if (sampleSize < opts.minSampleSize) {
    return { ...base, status: 'insufficient_data' };
  }

  // 3. 排序 + 统计
  const sorted = clean.map(c => c.value).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = calculateQuantile(clean.map(c => c.value), 0.25);
  const median = calculateQuantile(clean.map(c => c.value), 0.5);
  const q3 = calculateQuantile(clean.map(c => c.value), 0.75);
  const iqr = q3 - q1;

  const stats: OutlierDetectionStats = {
    min,
    q1,
    median,
    q3,
    max,
    iqr,
  };

  // 4. IQR === 0 退化处理（先于离散判断，确保 [0,...,0,1000] 这类
  //    "主值恒定 + 一个极端值" 场景的极端值仍能被检出）
  if (iqr === 0) {
    // 4a. 全相同 → 无变化，不算异常
    if (max === min) {
      return {
        ...base,
        status: 'none',
        discreteLowCardinality: false,
        bounds: { lower: q1, upper: q3 },
        stats,
      };
    }
    // 4b. 有变化但 IQR=0：绝对偏差回退
    return detectByAbsoluteDeviation(clean, median, base, stats);
  }

  // 5. 低基数离散型（整数 + 取值少 + 值落在小序数范围内）→ 不适合连续型异常检测。
  //    只有 iqr > 0 时才判为"低基数离散"跳过；若 iqr === 0（主值占优但有变化），
  //    已在上方走绝对偏差回退，避免把极端业务值误当成离散字段漏检。
  const allIntegers = clean.every(c => Number.isInteger(c.value));
  const maxValue = max;
  const isSmallOrdinalCode =
    allIntegers && uniqueCount <= opts.discreteMaxUnique && maxValue <= opts.discreteMaxValue;
  if (isSmallOrdinalCode) {
    return {
      ...base,
      status: 'unsupported',
      discreteLowCardinality: true,
      stats,
    };
  }

  // 6. 常规 IQR
  const lower = q1 - opts.iqrMultiplier * iqr;
  const upper = q3 + opts.iqrMultiplier * iqr;
  const records: OutlierRecord[] = [];
  for (const c of clean) {
    if (c.value < lower) {
      records.push({
        rowIndex: c.idx,
        value: c.value,
        direction: 'low',
        distance: lower - c.value,
        reason: `< 下界 ${roundForDisplay(lower)}`,
      });
    } else if (c.value > upper) {
      records.push({
        rowIndex: c.idx,
        value: c.value,
        direction: 'high',
        distance: c.value - upper,
        reason: `> 上界 ${roundForDisplay(upper)}`,
      });
    }
  }

  return {
    ...base,
    status: records.length > 0 ? 'detected' : 'none',
    discreteLowCardinality: false,
    bounds: { lower, upper },
    stats,
    outlierCount: records.length,
    records,
  };
}

/**
 * IQR=0 且存在变化时的绝对偏差回退。
 *
 * 场景：数据中主值大量重复（如 [0,0,0,0,1,0,0,0,1000]）导致四分位区间退化。
 * 此时用 MAD（中位数绝对偏差）作稳健尺度；若 MAD 仍为 0（主值完全占优），
 * 则用「相对主值区的量级阈值」：仅当某值偏离中位数超过
 *   k * max(|median|, 1)
 * 才判为异常候选（k 取较大值，保证保守，避免 [100,100,...,101] 被误判）。
 */
function detectByAbsoluteDeviation(
  clean: Array<{ value: number; idx: number }>,
  median: number,
  base: Omit<OutlierDetectionResult, 'status' | 'bounds' | 'stats'>,
  stats: OutlierDetectionStats
): OutlierDetectionResult {
  const deviations = clean.map(c => Math.abs(c.value - median));
  // MAD = 中位数绝对偏差
  const mad = calculateQuantile(deviations, 0.5);

  const records: OutlierRecord[] = [];

  if (mad > 0) {
    // 修改版 Z 分数（Iglewicz-Hoaglin）：flag 当 |z*| > 3.5
    const threshold = 3.5;
    for (const c of clean) {
      const modZ = (0.6745 * (c.value - median)) / mad;
      if (Math.abs(modZ) > threshold) {
        records.push({
          rowIndex: c.idx,
          value: c.value,
          direction: c.value > median ? 'high' : 'low',
          distance: Math.abs(c.value - median),
          reason: `偏离中位数（IQR=0，修正Z= ${roundForDisplay(Math.abs(modZ))}）`,
        });
      }
    }
  } else {
    // MAD=0：主值完全占优，仅当偏离超过主值量级的一个较大倍数才判异常
    const k = 3;
    const scale = Math.max(Math.abs(median), 1);
    for (const c of clean) {
      const delta = Math.abs(c.value - median);
      if (delta > k * scale) {
        records.push({
          rowIndex: c.idx,
          value: c.value,
          direction: c.value > median ? 'high' : 'low',
          distance: delta,
          reason: `显著偏离主值区（IQR=0，|Δ|=${roundForDisplay(delta)}）`,
        });
      }
    }
  }

  return {
    ...base,
    discreteLowCardinality: false,
    bounds: { lower: stats.q1, upper: stats.q3 },
    stats,
    status: records.length > 0 ? 'detected' : 'insufficient_variation',
    outlierCount: records.length,
    records,
  };
}