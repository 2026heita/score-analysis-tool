/**
 * 用户行为示例
 *
 * 扩至 24 行，增加设备类型、注册天数与是否付费，展示"用户级行为指标"分析。
 * bool 字段控制为单个（是否付费），避免字段泛滥。
 */

import type { SampleDataset } from '../sampleTypes';
import { seededNoise } from './helpers';

const CHANNELS = ['微信', '抖音', 'APP', '网页'] as const;
const DEVICES = ['iOS', 'Android', 'Web', 'WAP'] as const;

/** 确定性生成 24 用户行为记录 */
function buildRows(): Record<string, string | number | null>[] {
  const rows: Record<string, string | number | null>[] = [];

  for (let i = 0; i < 24; i += 1) {
    const visits = 12 + Math.round(seededNoise(i) * 70);
    const duration = Math.round(40 + seededNoise(i, 1) * 230);
    const activeDays = 8 + Math.round(seededNoise(i, 2) * 34);
    const regDays = 20 + Math.round(seededNoise(i, 3) * 280);
    // 访问越多、停留越久，付费概率与金额越高（弱相关）
    const payBase = Math.round(visits * duration / 30 + seededNoise(i, 4) * 300);
    const paid = payBase > 120;
    const payAmount = paid ? Math.max(9, payBase - 60) : 0;

    rows.push({
      '用户ID': `U${String(i + 1).padStart(3, '0')}`,
      '渠道': CHANNELS[i % CHANNELS.length],
      '设备类型': DEVICES[i % DEVICES.length],
      '注册天数': Math.max(1, regDays),
      '访问次数': visits,
      '停留时长': Math.max(1, duration),
      '活跃天数': Math.max(1, activeDays),
      '付费金额': payAmount,
      '是否付费': paid ? '是' : '否',
    });
  }
  return rows;
}

const userBehavior: SampleDataset = {
  id: 'user-behavior',
  name: '用户行为样例',
  category: '互联网',
  description: '用户访问、停留、活跃与付费行为数据，含渠道与设备维度。',
  tags: ['用户', '漏斗'],
  headers: ['用户ID', '渠道', '设备类型', '注册天数', '访问次数', '停留时长', '活跃天数', '付费金额', '是否付费'],
  rows: buildRows(),
};

export default userBehavior;