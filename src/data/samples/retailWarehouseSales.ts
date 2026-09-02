/**
 * 零售数仓销售数据（事实表风格）示例
 *
 * 设计目标（对应"展示与验证通用数据分析能力"）：
 * - 覆盖 time / identifier / dimension / metric 四类角色；
 * - field 之间的关系符合基本业务事实（销售额≈销量×售价×(1-折扣)，毛利=销售额-成本等）；
 * - 数据确定性生成（不使用 Math.random，固定 seed 哈希），测试可断言固定值；
 * - 内嵌 1 个"业务上可能合理、统计上明显"的高销售异常候选（周年庆大促），
 *   用于展示 OutlierPanel 的候选能力。
 *
 * 数据均为 synthetic / 模拟数据，不涉及任何真实客户或品牌。
 */

import type { SampleDataset } from '../sampleTypes';
import { round1, round2, seededNoise } from './helpers';

/** 商品主数据：单位成本与挂牌价（元） */
interface Product {
  category: string;
  name: string;
  cost: number;
  price: number;
  /** 平均每笔订单含件数，用于派生订单数与平均客单价 */
  pack: number;
}

const PRODUCTS: Product[] = [
  { category: '服饰', name: '经典T恤', cost: 60, price: 199, pack: 3 },
  { category: '服饰', name: '轻量夹克', cost: 180, price: 499, pack: 1 },
  { category: '数码', name: '运动耳机', cost: 120, price: 299, pack: 2 },
  { category: '数码', name: '智能手表', cost: 320, price: 799, pack: 1 },
  { category: '居家', name: '通勤背包', cost: 110, price: 259, pack: 1 },
  { category: '居家', name: '保温杯', cost: 45, price: 129, pack: 4 },
  { category: '食品', name: '坚果礼盒', cost: 70, price: 169, pack: 2 },
];

/** 门店主数据：区域、城市与销量基数因子 */
interface Store {
  name: string;
  region: string;
  city: string;
  factor: number;
}

const STORES: Store[] = [
  { name: '华东一店', region: '华东', city: '上海', factor: 1.15 },
  { name: '华东二店', region: '华东', city: '杭州', factor: 1.0 },
  { name: '华南旗舰店', region: '华南', city: '广州', factor: 1.1 },
  { name: '华北中心店', region: '华北', city: '北京', factor: 0.9 },
];

/** 渠道：文本维度，避免使用渠道编号(1/2/3)这类低基数离散整数被异常算法误用 */
interface Channel {
  name: string;
  factor: number;
}

const CHANNELS: Channel[] = [
  { name: '线下', factor: 1.0 },
  { name: 'APP', factor: 1.15 },
  { name: '小程序', factor: 0.85 },
  { name: '电商平台', factor: 0.95 },
];

/** 批量销售基数（件） */
const QTY_BASE = 60;

/** 活动类型：用于模拟折扣差异，周年庆仅在异常大促记录出现 */
enum Activity {
  DAILY = '日常',
  WEEKEND = '周末促销',
  ANNIVERSARY = '周年庆',
}

/** 周年庆大促记录定位：2026-06-18、华南旗舰店、智能手表 */
const SPIKE = { day: 18, slot: 1, product: '智能手表' };

/** 周几（0=周日） */
function dayOfWeek(day: number): number {
  return new Date(2026, 5, day).getDay();
}

function isWeekend(day: number): boolean {
  const d = dayOfWeek(day);
  return d === 0 || d === 6;
}

/** 根据活动类型得到折扣区间起点与浮动幅度 */
function discountFor(activity: Activity, noise: number): number {
  switch (activity) {
    case Activity.DAILY:
      return round2(0.03 + noise * 0.05);
    case Activity.WEEKEND:
      return round2(0.1 + noise * 0.06);
    case Activity.ANNIVERSARY:
      return round2(0.5);
    default:
      return round2(0.05);
  }
}

/** 确定性生成 90 行零售数仓销售事实数据（2026-06-01 ~ 2026-06-30） */
function buildRows(): Record<string, string | number | null>[] {
  const rows: Record<string, string | number | null>[] = [];
  let seq = 1;

  for (let day = 1; day <= 30; day += 1) {
    const dateStr = `2026-06-${String(day).padStart(2, '0')}`;
    const weekend = isWeekend(day);
    const weekendFactor = weekend ? 1.35 : 1.0;

    for (let slot = 0; slot < 3; slot += 1) {
      const store = STORES[(day + slot) % STORES.length];
      const channel = CHANNELS[(day + slot) % CHANNELS.length];
      const product = PRODUCTS[(day + slot * 2) % PRODUCTS.length];
      const idx = (day - 1) * 3 + slot;

      // 活动类型：周末促销集中在周末，周年庆只在指定大促记录出现
      let activity = Activity.DAILY;
      if (weekend && idx % 3 === 2) {
        activity = Activity.WEEKEND;
      }
      const isSpike = day === SPIKE.day && slot === SPIKE.slot && product.name === SPIKE.product;
      if (isSpike) {
        activity = Activity.ANNIVERSARY;
      }

      // 销量：批量基数 × 门店/渠道/周末因子 × 确定性噪声，周年庆翻约 12 倍
      const noise = 0.75 + seededNoise(idx) * 0.7;
      const qtyNoise = 0.75 + seededNoise(idx, 11) * 0.7;
      let qty = QTY_BASE * store.factor * channel.factor * weekendFactor * noise * qtyNoise;
      if (isSpike) {
        qty = qty * 12;
      }
      const quantity = Math.round(qty);

      const discount = discountFor(activity, seededNoise(idx, 23));

      // 业务一致性派生：
      // 销售额 ≈ 销量 × 售价 × (1 - 折扣率)
      // 成本   = 销量 × 单位成本
      // 毛利   = 销售额 - 成本
      // 毛利率 = 毛利 / 销售额 × 100
      // 平均客单价 ≈ 售价 × (1 - 折扣率) × 每单件数
      // 订单数 ≈ 销量 / 每单件数
      const sales = round2(quantity * product.price * (1 - discount));
      const cost = round2(quantity * product.cost);
      const grossProfit = round2(sales - cost);
      const grossMargin = round1((grossProfit / sales) * 100);
      const avgOrderValue = round1(product.price * (1 - discount) * product.pack);
      const orders = Math.max(1, Math.round(quantity / product.pack));

      rows.push({
        '记录ID': `R${String(seq).padStart(4, '0')}`,
        '日期': dateStr,
        '区域': store.region,
        '城市': store.city,
        '门店': store.name,
        '渠道': channel.name,
        '品类': product.category,
        '商品': product.name,
        '活动类型': activity,
        '销量': quantity,
        '订单数': orders,
        '销售额': sales,
        '成本': cost,
        '毛利': grossProfit,
        '毛利率': grossMargin,
        '平均客单价': avgOrderValue,
        '折扣率': discount,
      });
      seq += 1;
    }
  }
  return rows;
}

const retailWarehouseSales: SampleDataset = {
  id: 'retail-warehouse-sales',
  name: '零售数仓销售数据',
  category: '零售',
  description:
    '模拟零售数仓销售事实数据，包含日期、门店、区域、商品、品类、渠道、销量、订单数、销售额、成本、毛利和折扣等字段，可用于趋势、分组、相关性与异常候选分析。',
  featured: true,
  tags: ['时间序列', '零售', '多维分析', '异常值'],
  headers: [
    '记录ID',
    '日期',
    '区域',
    '城市',
    '门店',
    '渠道',
    '品类',
    '商品',
    '活动类型',
    '销量',
    '订单数',
    '销售额',
    '成本',
    '毛利',
    '毛利率',
    '平均客单价',
    '折扣率',
  ],
  rows: buildRows(),
};

export default retailWarehouseSales;