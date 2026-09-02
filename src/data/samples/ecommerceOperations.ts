/**
 * 电商运营示例
 *
 * 扩至 24 行，并增加"渠道"维度，使数据具备分组/筛选价值。
 * 数值关系基本合理：
 *   点击率 ≈ 点击量 / 曝光量
 *   转化率与点击量弱相关
 *   GMV ≈ 点击量 × 转化率 × 客单价
 */

import type { SampleDataset } from '../sampleTypes';
import { round1, round2, seededNoise } from './helpers';

interface ProductBase {
  name: string;
  category: string;
  avgPrice: number;
  channel: string;
}

/** 24 个商品/渠道组合（主数据） */
const ITEMS: ProductBase[] = [
  { name: '手机壳A', category: '配件', avgPrice: 39, channel: '天猫' },
  { name: '耳机B', category: '数码', avgPrice: 259, channel: '天猫' },
  { name: '充电宝C', category: '数码', avgPrice: 129, channel: '京东' },
  { name: '数据线D', category: '配件', avgPrice: 25, channel: '天猫' },
  { name: '手机膜E', category: '配件', avgPrice: 19, channel: '拼多多' },
  { name: '蓝牙音箱F', category: '数码', avgPrice: 189, channel: '京东' },
  { name: '键盘G', category: '外设', avgPrice: 199, channel: '天猫' },
  { name: '鼠标H', category: '外设', avgPrice: 129, channel: '京东' },
  { name: '显示器I', category: '显示器', avgPrice: 1099, channel: '京东' },
  { name: '路由器J', category: '数码', avgPrice: 329, channel: '天猫' },
  { name: '摄像头K', category: '家电', avgPrice: 249, channel: '京东' },
  { name: '台灯L', category: '家电', avgPrice: 159, channel: '拼多多' },
  { name: '扫地机M', category: '家电', avgPrice: 1599, channel: '天猫' },
  { name: '冲牙器N', category: '家电', avgPrice: 299, channel: '抖音电商' },
  { name: '筋膜枪O', category: '外设', avgPrice: 349, channel: '抖音电商' },
  { name: '耳机P', category: '数码', avgPrice: 199, channel: '拼多多' },
  { name: '平板支架Q', category: '配件', avgPrice: 59, channel: '抖音电商' },
  { name: '扩展坞R', category: '外设', avgPrice: 169, channel: '天猫' },
  { name: '机械键盘S', category: '外设', avgPrice: 399, channel: '京东' },
  { name: '智能音箱T', category: '数码', avgPrice: 219, channel: '抖音电商' },
  { name: '行车记录仪U', category: '汽车', avgPrice: 399, channel: '京东' },
  { name: '车载支架V', category: '汽车', avgPrice: 69, channel: '拼多多' },
  { name: '空气净化器W', category: '家电', avgPrice: 999, channel: '天猫' },
  { name: '加湿器X', category: '家电', avgPrice: 129, channel: '拼多多' },
];

/** 确定性生成 24 电商运营记录 */
function buildRows(): Record<string, string | number | null>[] {
  const rows: Record<string, string | number | null>[] = [];

  for (let i = 0; i < ITEMS.length; i += 1) {
    const item = ITEMS[i];
    const exposures = Math.round(8000 + seededNoise(i) * 17000);
    // 点击率约 6%~14%，弱随机
    const clickRate = round1(0.06 + seededNoise(i, 1) * 0.08);
    const clicks = Math.round(exposures * clickRate);
    // 转化率与点击率弱相关（加一点相关噪声），保证有正相关但不完美
    const convRate = round2(Math.max(0.02, 0.03 + clickRate * 0.3 + seededNoise(i, 2) * 0.02));
    const unitPrice = item.avgPrice * (0.9 + seededNoise(i, 3) * 0.25);
    const gmv = round2(clicks * convRate * unitPrice);
    const refundRate = round2(Math.max(0.4, (1.2 + seededNoise(i, 4) * 3) * (1 - convRate * 4)));

    rows.push({
      '商品': item.name,
      '类目': item.category,
      '渠道': item.channel,
      '曝光量': exposures,
      '点击量': clicks,
      '点击率': round2(clickRate * 100),
      '转化率': round2(convRate * 100),
      '客单价': round1(unitPrice),
      'GMV': round1(gmv),
      '退款率': round2(refundRate),
    });
  }
  return rows;
}

const ecommerceOperations: SampleDataset = {
  id: 'ecommerce-operations',
  name: '电商运营样例',
  category: '电商',
  description: '商品曝光、点击、转化、GMV 与退款数据，覆盖多类目与多渠道。',
  tags: ['漏斗', '电商'],
  headers: ['商品', '类目', '渠道', '曝光量', '点击量', '点击率', '转化率', '客单价', 'GMV', '退款率'],
  rows: buildRows(),
};

export default ecommerceOperations;