/**
 * 客户满意度调研示例
 *
 * 扩至 24 行，强调"多指标评分 / 调研分析"。
 * NPS 为 0-10 离散评分，取值集中在 7-10，避免被通用异常检测当作连续异常 metric。
 */

import type { SampleDataset } from '../sampleTypes';
import { seededNoise } from './helpers';

/** 客户端渠道（维度） */
const CLIENT_TYPES = ['APP', '小程序', '网页', '门店'] as const;

/** 确定性生成 24 行满意度数据 */
function buildRows(): Record<string, string | number | null>[] {
  const rows: Record<string, string | number | null>[] = [];
  const baseScore = [82, 88, 74, 90, 69, 79, 85, 92, 71, 86, 77, 83, 76, 89, 72, 81, 93, 75, 84, 68, 87, 70, 91, 78];

  for (let i = 0; i < 24; i += 1) {
    const product = Math.round(baseScore[i] + seededNoise(i) * 6 - 3);
    const service = Math.round(baseScore[i] + seededNoise(i, 1) * 5 - 2);
    const price = Math.round(baseScore[i] + seededNoise(i, 2) * 6 - 6);
    const logistics = Math.round(baseScore[i] + seededNoise(i, 3) * 6 - 3);
    const overall = Math.round(0.35 * product + 0.3 * service + 0.2 * price + 0.15 * logistics);
    // NPS 集中 7-10，保持 0-10 离散语义，但低基数不触发连续异常判据
    const nps = 7 + Math.round(seededNoise(i, 4) * 3);

    rows.push({
      '客户': `客户${String.fromCharCode(65 + i)}`,
      '客户端': CLIENT_TYPES[i % CLIENT_TYPES.length],
      '产品评分': Math.max(1, Math.min(100, product)),
      '服务评分': Math.max(1, Math.min(100, service)),
      '价格评分': Math.max(1, Math.min(100, price)),
      '物流评分': Math.max(1, Math.min(100, logistics)),
      '总体满意度': Math.max(1, Math.min(100, overall)),
      'NPS': nps,
    });
  }
  return rows;
}

const surveySatisfaction: SampleDataset = {
  id: 'survey-satisfaction',
  name: '客户满意度调研',
  category: '通用',
  description: '客户满意度调查评分数据，含产品、服务、价格、物流等多维评分与 NPS。',
  tags: ['多指标', '调研'],
  headers: ['客户', '客户端', '产品评分', '服务评分', '价格评分', '物流评分', '总体满意度', 'NPS'],
  rows: buildRows(),
};

export default surveySatisfaction;