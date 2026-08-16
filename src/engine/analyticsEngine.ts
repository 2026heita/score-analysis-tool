/**
 * 通用分析引擎入口
 * 
 * @deprecated 此模块整合 schemaDetector、featureStandardizer、univariateAnalyzer，
 * 提供独立于主链路的通用分析能力。从未接入 App.tsx 主 UI，仅由 testGeneralEngine.mjs 引用。
 * 
 * 与主链路 analysisEngine 的关系：
 * - analysisEngine：主链路入口，基于 MetricRegistry + DerivedDataContext，供 UI 使用
 * - analyticsEngine：独立分析管线（schema 检测 → 特征标准化 → 单变量分析），架构完全不同
 * 
 * 未来不会并入 analysisEngine：两者分析范式不同（schema-driven vs metric-driven），
 * 强行合并会引入不必要的复杂度。此模块保留供参考，新功能应在 analysisEngine 上扩展。
 */

import type {
  FeatureSchema,
  FeatureVector,
  AnalyticsResult,
  FeatureStats,
  AnomalyResult,
  AnalyticsConfig,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { detectDatasetSchema } from './schemaDetector';
import { standardizeDataset } from './featureStandardizer';
import { analyzeNumericalFeature, detectOutliers } from './univariateAnalyzer';
import { minMax } from '../utils/stats';

/**
 * 分析数据集
 * @param headers - 表头数组
 * @param rows - 数据行数组
 * @param config - 分析配置
 * @returns 分析结果
 */
export function analyzeDataset(
  headers: string[],
  rows: Record<string, string>[],
  config: AnalyticsConfig = {}
): AnalyticsResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // 1. 检测字段类型
  const features = detectDatasetSchema(headers, rows);
  
  // 2. 标准化数据
  const vectors = standardizeDataset(rows, features);
  
  // 3. 限制分析行数（防卡死）
  const limitedVectors = cfg.maxRows 
    ? vectors.slice(0, cfg.maxRows)
    : vectors;
  
  // 4. 分析每个字段
  const profile: FeatureStats[] = [];
  const anomalies: AnomalyResult[] = [];
  const insights: string[] = [];
  
  for (const feature of features) {
    // 跳过标识符和无效字段
    if (feature.featureType === 'identifier' || feature.featureType === 'invalid') {
      continue;
    }
    
    // 数值字段分析
    if (feature.featureType === 'numerical') {
      const stats = analyzeNumericalFeature(limitedVectors, feature.fieldName);
      profile.push(stats);
      
      // 检测异常值
      const outliers = detectOutliers(limitedVectors, feature.fieldName);
      for (const outlier of outliers) {
        anomalies.push({
          fieldName: feature.fieldName,
          rowIndex: outlier.rowIndex,
          value: outlier.value,
          type: 'outlier',
          severity: Math.abs(outlier.zScore) > 3 ? 'high' : 'medium',
          description: `值 ${outlier.value} 的 z-score 为 ${outlier.zScore.toFixed(2)}`,
        });
      }
      
      // 生成洞察
      if (stats.validCount > 0) {
        insights.push(
          `字段 "${feature.fieldName}": ${stats.validCount} 个有效值, ` +
          `范围 [${stats.min}, ${stats.max}], ` +
          `均值 ${stats.mean}, 标准差 ${stats.std}`
        );
        
        if (outliers.length > 0) {
          insights.push(
            `字段 "${feature.fieldName}" 检测到 ${outliers.length} 个异常值`
          );
        }
      }
    }
    
    // 类别字段分析
    if (feature.featureType === 'categorical') {
      const valueCounts = new Map<string, number>();
      for (const vector of limitedVectors) {
        const sv = vector.values[feature.fieldName];
        if (sv && sv.type === 'categorical') {
          valueCounts.set(sv.value, (valueCounts.get(sv.value) || 0) + 1);
        }
      }
      
      const topCategories = Array.from(valueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, cfg.topCategories)
        .map(([value, count]) => ({ value, count }));
      
      profile.push({
        count: limitedVectors.length,
        validCount: Array.from(valueCounts.values()).reduce((a, b) => a + b, 0),
        missingCount: limitedVectors.length - Array.from(valueCounts.values()).reduce((a, b) => a + b, 0),
        uniqueCount: valueCounts.size,
        topCategories,
      });
      
      insights.push(
        `字段 "${feature.fieldName}": ${valueCounts.size} 个类别, ` +
        `最常见值 "${topCategories[0]?.value}" (${topCategories[0]?.count} 次)`
      );
    }
    
    // 时间字段分析
    if (feature.featureType === 'temporal') {
      const timestamps: number[] = [];
      for (const vector of limitedVectors) {
        const sv = vector.values[feature.fieldName];
        if (sv && sv.type === 'temporal') {
          timestamps.push(sv.value);
        }
      }
      
      if (timestamps.length > 0) {
        const mm = minMax(timestamps);
        if (mm) {
          const minTime = mm.min;
          const maxTime = mm.max;
          const minDate = new Date(minTime).toISOString().split('T')[0];
          const maxDate = new Date(maxTime).toISOString().split('T')[0];

          profile.push({
            count: limitedVectors.length,
            validCount: timestamps.length,
            missingCount: limitedVectors.length - timestamps.length,
            min: minTime,
            max: maxTime,
          });

          insights.push(
            `字段 "${feature.fieldName}": 时间范围 ${minDate} 到 ${maxDate}`
          );
        }
      }
    }
  }
  
  // 5. 生成警告
  const warnings: string[] = [];
  if (vectors.length > (cfg.maxRows || Infinity)) {
    warnings.push(`数据量过大，仅分析前 ${cfg.maxRows} 行`);
  }
  
  const invalidFeatures = features.filter(f => f.featureType === 'invalid');
  if (invalidFeatures.length > 0) {
    warnings.push(`${invalidFeatures.length} 个字段无法识别类型`);
  }
  
  return {
    profile,
    anomalies,
    insights,
    // 其他字段暂时留空，后续阶段实现
    rankings: [],
    distributions: [],
    relationships: [],
    clusters: [],
  };
}

/**
 * 获取数据集 Schema
 */
export function getDatasetSchema(
  headers: string[],
  rows: Record<string, string>[]
): FeatureSchema[] {
  return detectDatasetSchema(headers, rows);
}

/**
 * 标准化数据
 */
export function standardizeData(
  rows: Record<string, string>[],
  features: FeatureSchema[]
): FeatureVector[] {
  return standardizeDataset(rows, features);
}

// 导出类型和工具函数
export * from './types';
export { detectDatasetSchema } from './schemaDetector';
export { standardizeDataset, extractNumericalValues } from './featureStandardizer';
export {
  analyzeNumericalFeature,
  calculatePercentile,
  calculateZScore,
  detectOutliers,
} from './univariateAnalyzer';
