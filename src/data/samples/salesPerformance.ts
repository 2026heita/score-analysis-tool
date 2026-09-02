/**
 * 销售业绩示例
 *
 * 扩至 12 行并增加"团队 / 产品线"维度，代表"人员维度绩效分析"。
 * 保持：销售员、区域、客户数、成交额、客单价、回款率。
 * 业务一致性：客单价 ≈ 成交额 / 客户数（允许取整误差）。
 */

import type { SampleDataset } from '../sampleTypes';

interface Salesperson {
  name: string;
  team: string;
  region: string;
  productLine: string;
  customers: number;
  deal: number;
  refundRate: number;
}

const PEOPLE: Salesperson[] = [
  { name: '张晨', team: '团队A', region: '华东', productLine: '数码设备', customers: 52, deal: 1560000, refundRate: 93.6 },
  { name: '李宁', team: '团队B', region: '华南', productLine: '办公用品', customers: 46, deal: 1380000, refundRate: 91.2 },
  { name: '王博', team: '团队A', region: '华北', productLine: '数码设备', customers: 58, deal: 1740000, refundRate: 95.4 },
  { name: '赵青', team: '团队C', region: '西南', productLine: '日用百货', customers: 31, deal: 780000, refundRate: 86.5 },
  { name: '钱进', team: '团队B', region: '华中', productLine: '办公用品', customers: 44, deal: 1210000, refundRate: 90.8 },
  { name: '孙琦', team: '团队C', region: '东北', productLine: '日用百货', customers: 35, deal: 900000, refundRate: 88.1 },
  { name: '周鹏', team: '团队C', region: '西北', productLine: '快消品', customers: 27, deal: 660000, refundRate: 83.2 },
  { name: '吴刚', team: '团队A', region: '华东', productLine: '数码设备', customers: 55, deal: 1650000, refundRate: 94.2 },
  { name: '郑雪', team: '团队B', region: '华北', productLine: '办公用品', customers: 40, deal: 1040000, refundRate: 89.6 },
  { name: '冯杰', team: '团队A', region: '华南', productLine: '快消品', customers: 61, deal: 1525000, refundRate: 92.4 },
  { name: '陈晨', team: '团队C', region: '华东', productLine: '快消品', customers: 33, deal: 830000, refundRate: 87.3 },
  { name: '朱霞', team: '团队B', region: '西南', productLine: '日用百货', customers: 37, deal: 960000, refundRate: 88.9 },
];

function buildRows(): Record<string, string | number | null>[] {
  return PEOPLE.map((p) => {
    const avgOrder = Math.round(p.deal / p.customers / 100) * 100;
    return {
      '销售员': p.name,
      '团队': p.team,
      '区域': p.region,
      '产品线': p.productLine,
      '客户数': p.customers,
      '成交额': p.deal,
      '客单价': avgOrder,
      '回款率': p.refundRate,
    };
  });
}

const salesPerformance: SampleDataset = {
  id: 'sales-performance',
  name: '销售业绩样例',
  category: '销售',
  description: '销售员业绩、客户与回款数据，涵盖团队与产品线维度。',
  tags: ['人员', '绩效'],
  headers: ['销售员', '团队', '区域', '产品线', '客户数', '成交额', '客单价', '回款率'],
  rows: buildRows(),
};

export default salesPerformance;