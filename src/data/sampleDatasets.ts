/**
 * 示例数据集注册表
 *
 * 维护示例数据集列表（registry），具体数据在各 samples 模块中定义：
 * - retailWarehouseSales  零售数仓销售数据（重点示例，featured）
 * - surveySatisfaction    客户满意度调研
 * - ecommerceOperations   电商运营样例
 * - salesPerformance      销售业绩样例
 * - userBehavior          用户行为样例
 * - regionEconomics       地区经济统计样例
 * - gameCharacter         游戏数值样例
 *
 * 所有示例均为 synthetic / 模拟数据，不涉及真实客户或品牌。
 */

export type { SampleDataset } from './sampleTypes';

import retailWarehouseSales from './samples/retailWarehouseSales';
import surveySatisfaction from './samples/surveySatisfaction';
import ecommerceOperations from './samples/ecommerceOperations';
import salesPerformance from './samples/salesPerformance';
import userBehavior from './samples/userBehavior';
import regionEconomics from './samples/regionEconomics';
import gameCharacter from './samples/gameCharacter';

import type { SampleDataset } from './sampleTypes';

export const sampleDatasets: SampleDataset[] = [
  retailWarehouseSales,
  surveySatisfaction,
  ecommerceOperations,
  salesPerformance,
  userBehavior,
  regionEconomics,
  gameCharacter,
];

/**
 * 根据 ID 获取示例数据集
 */
export function getSampleDatasetById(id: string): SampleDataset | undefined {
  return sampleDatasets.find((ds) => ds.id === id);
}

/**
 * 获取所有示例数据集的分类
 */
export function getSampleCategories(): string[] {
  const categories = new Set(sampleDatasets.map((ds) => ds.category));
  return Array.from(categories);
}