/**
 * 示例数据集类型定义
 *
 * 独立成文件，避免 registry（sampleDatasets.ts）与各示例模块（samples/*）之间
 * 因互相引用类型而产生的循环依赖。
 */

/** 示例数据集结构 */
export interface SampleDataset {
  /** 唯一标识，用于 DataSourceState.sampleId 与 getSampleDatasetById 定位 */
  id: string;
  name: string;
  category: string;
  description: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
  /** 是否为重点推荐示例（如零售数仓样例），用于 UI 突出展示 */
  featured?: boolean;
  /** 简短能力标签，供选择器一行展示（如 ['时间序列','零售','多维分析','异常值']） */
  tags?: string[];
}