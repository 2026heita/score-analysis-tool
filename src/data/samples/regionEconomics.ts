/**
 * 地区经济统计示例
 *
 * 原"国家/地区统计样例"命名不准确：数据实际是北京/上海/广东等省级地区数据。
 * 更名为"地区经济统计样例"，category 调整为"宏观"，description 修正为地区语义。
 * 扩至 10 行。
 */

import type { SampleDataset } from '../sampleTypes';

interface Region {
  name: string;
  population: number;
  gdp: number;
  gdpPerCapita: number;
  urbanRate: number;
  growthRate: number;
}

/** 人均GDP 取整，保持"人均GDP ≈ GDP / 人口 × 10000"（GDP为亿元，人口为万人）的近似关系 */
const REGIONS: Region[] = [
  { name: '北京', population: 2189, gdp: 41610, gdpPerCapita: 190100, urbanRate: 87.5, growthRate: 5.2 },
  { name: '上海', population: 2487, gdp: 44652, gdpPerCapita: 179500, urbanRate: 89.3, growthRate: 5.0 },
  { name: '广东', population: 12684, gdp: 129118, gdpPerCapita: 101800, urbanRate: 74.6, growthRate: 5.5 },
  { name: '江苏', population: 8505, gdp: 122875, gdpPerCapita: 144400, urbanRate: 73.9, growthRate: 5.8 },
  { name: '浙江', population: 6577, gdp: 77715, gdpPerCapita: 118200, urbanRate: 73.4, growthRate: 6.0 },
  { name: '山东', population: 10152, gdp: 87435, gdpPerCapita: 86100, urbanRate: 64.1, growthRate: 5.3 },
  { name: '河南', population: 9883, gdp: 61345, gdpPerCapita: 62100, urbanRate: 57.1, growthRate: 4.8 },
  { name: '四川', population: 8372, gdp: 56749, gdpPerCapita: 67800, urbanRate: 58.4, growthRate: 5.6 },
  { name: '湖北', population: 5844, gdp: 55804, gdpPerCapita: 95500, urbanRate: 64.5, growthRate: 5.4 },
  { name: '湖南', population: 6620, gdp: 50903, gdpPerCapita: 76900, urbanRate: 60.3, growthRate: 4.9 },
];

function buildRows(): Record<string, string | number | null>[] {
  return REGIONS.map((r) => ({
    '地区': r.name,
    '人口': r.population,
    'GDP': r.gdp,
    '人均GDP': r.gdpPerCapita,
    '城镇化率': r.urbanRate,
    '增长率': r.growthRate,
  }));
}

const regionEconomics: SampleDataset = {
  id: 'country-statistics',
  name: '地区经济统计样例',
  category: '宏观',
  description: '不同地区的人口、GDP、人均GDP、城镇化率和增长率数据。',
  tags: ['宏观'],
  headers: ['地区', '人口', 'GDP', '人均GDP', '城镇化率', '增长率'],
  rows: buildRows(),
};

export default regionEconomics;