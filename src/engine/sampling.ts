/**
 * 确定性抽样算法
 * 
 * 核心原则：
 * 1. 相同有序输入得到相同结果（确定性）
 * 2. sampleSize > 1 时包含首尾
 * 3. 不产生重复索引
 * 4. 保持原顺序
 * 5. 复杂度 O(sampleSize)
 */

/**
 * 等距确定性抽样 v1
 * 
 * 算法：index = Math.round(i * (rowCount - 1) / (sampleSize - 1))
 * 
 * @param rowCount 总行数
 * @param sampleSize 目标样本量
 * @returns 抽样索引数组（已排序，无重复）
 */
export function systematic_even_v1(
  rowCount: number,
  sampleSize: number
): number[] {
  // 边界情况处理
  if (sampleSize <= 0 || rowCount <= 0) {
    return [];
  }
  
  if (rowCount <= sampleSize) {
    // 返回完整数据副本
    return Array.from({ length: rowCount }, (_, i) => i);
  }
  
  if (sampleSize === 1) {
    // 返回首行（首尾保证的例外）
    return [0];
  }
  
  // 等距抽样
  const indices: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const index = Math.round(i * (rowCount - 1) / (sampleSize - 1));
    indices.push(index);
  }
  
  return indices;
}

/**
 * 根据索引数组提取行数据
 * 
 * @param rows 原始行数据
 * @param indices 索引数组
 * @returns 抽样后的行数据
 */
export function sampleRows<T>(rows: T[], indices: number[]): T[] {
  return indices.map(i => rows[i]);
}
