/**
 * 游戏数值示例
 *
 * 扩至 10 个职业。游戏角色类目本身角色数有限，
 * 不作为复杂分析主示例，仅为展示角色属性与胜率/使用率的关系。
 */

import type { SampleDataset } from '../sampleTypes';

interface Role {
  name: string;
  level: number;
  attack: number;
  defense: number;
  health: number;
  winRate: number;
  usageRate: number;
}

const ROLES: Role[] = [
  { name: '战士', level: 50, attack: 850, defense: 620, health: 12500, winRate: 52.3, usageRate: 18.5 },
  { name: '法师', level: 48, attack: 1200, defense: 380, health: 8500, winRate: 48.7, usageRate: 22.3 },
  { name: '刺客', level: 52, attack: 1450, defense: 420, health: 9200, winRate: 55.1, usageRate: 15.8 },
  { name: '射手', level: 49, attack: 1100, defense: 350, health: 7800, winRate: 50.2, usageRate: 20.1 },
  { name: '辅助', level: 47, attack: 450, defense: 580, health: 10500, winRate: 46.8, usageRate: 12.4 },
  { name: '坦克', level: 51, attack: 680, defense: 950, health: 18500, winRate: 49.5, usageRate: 10.9 },
  { name: '牧师', level: 46, attack: 520, defense: 520, health: 9900, winRate: 45.6, usageRate: 8.7 },
  { name: '游侠', level: 50, attack: 1050, defense: 460, health: 8800, winRate: 51.4, usageRate: 14.2 },
  { name: '术士', level: 53, attack: 1350, defense: 400, health: 8900, winRate: 53.8, usageRate: 9.6 },
  { name: '守卫', level: 54, attack: 720, defense: 880, health: 17200, winRate: 50.9, usageRate: 6.8 },
];

function buildRows(): Record<string, string | number | null>[] {
  return ROLES.map((r) => ({
    '角色': r.name,
    '等级': r.level,
    '攻击力': r.attack,
    '防御力': r.defense,
    '生命值': r.health,
    '胜率': r.winRate,
    '使用率': r.usageRate,
  }));
}

const gameCharacter: SampleDataset = {
  id: 'game-character',
  name: '游戏数值样例',
  category: '游戏',
  description: '游戏角色属性、胜率与使用率数据。',
  tags: ['角色'],
  headers: ['角色', '等级', '攻击力', '防御力', '生命值', '胜率', '使用率'],
  rows: buildRows(),
};

export default gameCharacter;