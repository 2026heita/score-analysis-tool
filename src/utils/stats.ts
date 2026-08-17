/**
 * 格式化数字：null/undefined/NaN 显示 "-"；整数显示整数；小数保留 2 位
 */
export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return '-';
  if (!Number.isFinite(val)) return '-';
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(2);
}

/**
 * 线性插值分位数算法（全项目统一使用）
 * - 先过滤无效值
 * - 升序排序
 * - pos = (n - 1) * q
 * - base = Math.floor(pos)
 * - rest = pos - base
 * - 如果 base + 1 存在：value[base] + rest * (value[base + 1] - value[base])
 * - 否则返回 value[base]
 *
 * @param values 原始数值数组（包含无效值会被自动过滤）
 * @param q 分位数比例 0 ~ 1
 */
export function calculateQuantile(values: number[], q: number): number {
  const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return 0;
  const pos = (cleanValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (cleanValues[base + 1] !== undefined) {
    return cleanValues[base] + rest * (cleanValues[base + 1] - cleanValues[base]);
  }
  return cleanValues[base];
}

/**
 * 安全地求一组数值的最小值与最大值。
 *
 * 使用循环实现，不依赖 Math.min/max(...array) 展开，避免在大数组上触发
 * RangeError（Maximum call stack size exceeded）或引擎参数数量限制。
 *
 * 只处理非空数组：空数组返回 null，调用方需先明确处理空数组，
 * 不隐式依赖 Math.min(...[]) = Infinity / Math.max(...[]) = -Infinity。
 */
export function minMax(values: number[]): { min: number; max: number } | null {
  if (!values || values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * 数值稳定的算术平均值。
 *
 * 不能直接 `sum / n`：当数值极大（如 1e308+1e308 → Infinity）时中间求和会溢出，
 * 即使真实均值仍在有限范围内（1e308）。
 *
 * 采用「调和思路」：先对每个元素除以 n 再累加，避免一次性求和溢出；
 * 并叠加 kahan 补偿，减少大规模浮点累积误差。
 * 普通数据（10/20/30 等）的结果应与此前 `sum/n` 完全一致的口径保持一致。
 */
export function mean(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const n = values.length;
  if (n === 1) return values[0];

  // Kahan 补偿求和：累加 v/n，避免溢出且提升精度
  let sum = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const scaled = values[i] / n;
    const y = scaled - c;
    const t = sum + y;
    c = (t - sum) - y;
    sum = t;
  }
  return sum;
}

/**
 * 数值稳定的总体标准差（population standard deviation）。
 *
 * 不能直接 `sqrt(mean((v-mean)^2))`：当 v-mean 极大（如 1e308）且平方时中间值
 * 会溢出为 Infinity，即使真实标准差仍可用（此处 [1e308, -1e308] 的总体标准差为 1e308）。
 *
 * 策略：先以最大值把数据缩放到 [-1, 1]，在该范围内计算方差（避免平方溢出），
 * 再把结果按缩放系数还原。缩放不改变相对分布，因此方差/标准差与原始口径一致。
 *
 * 若最终标准差确实超出 Number 表示范围，返回 Infinity（由调用方按"不可表示"处理），
 * 而不是伪造一个有限值；这里修复的是"中间计算错误溢出"。
 */
export function stdDev(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const n = values.length;
  if (n === 1) return 0;

  const { min, max } = minMax(values)!;
  const spread = Math.max(Math.abs(min), Math.abs(max));

  if (spread === 0) return 0; // 全部相同 → 标准差 0
  if (!Number.isFinite(spread)) return NaN;

  // 缩放：normalized[i] ∈ [-1, 1]，平方不溢出
  const normalized = values.map(v => v / spread);
  const m = mean(normalized);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = normalized[i] - m;
    sumSq += d * d;
  }
  const varianceScaled = sumSq / n; // 总体方差
  const stdScaled = Math.sqrt(varianceScaled);

  // 还原缩放：std = stdScaled * |spread|
  const result = stdScaled * spread;
  return Number.isFinite(result) ? result : Infinity;
}
