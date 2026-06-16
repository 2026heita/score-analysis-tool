import { APP_VERSION } from '../config/version';

export interface UpdateLogItem {
  date: string;
  version?: string;
  title: string;
  items: string[];
  type?: 'feature' | 'fix' | 'improvement' | 'notice';
}

export const updateLogs: UpdateLogItem[] = [
  {
    date: '2026-06-15',
    version: APP_VERSION,
    title: '分析更稳定，结果更一致',
    type: 'improvement',
    items: [
      '表格解析更稳定，字段识别更准确',
      '统计计算口径统一，均值、中位数、百分位等结果全局一致',
      '新增变量关系分析，可查看字段之间的相关性',
      '示例数据选择器优化，支持快速切换不同数据场景',
      '移动端兼容性进一步增强，大表格加载更流畅',
      '页面表述逐步从成绩分析调整为更通用的表格数据分析',
      '系统现在能自动识别"数值越小越好"的字段（如排名），并单独处理'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.1.0',
    title: '新增通用数据概览',
    type: 'feature',
    items: [
      '新增通用数据概览面板，可查看数据行数、字段类型数量和基础结构信息',
      '新增数值字段基础统计表，支持查看有效值、缺失值、均值、中位数、标准差和异常值数量',
      '通用分析引擎开始在页面中可视化展示，为后续支持更多类型表格打基础'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.1.0',
    title: '平台方向升级',
    type: 'notice',
    items: [
      '平台将逐步从成绩分析工具升级为通用表格分析平台',
      '当前版本已增强移动端兼容性、失败兜底和大表格保护',
      '后续将支持更多类型表格的通用统计、关系分析和异常识别'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.0.0',
    title: '上线稳定版',
    type: 'improvement',
    items: [
      '新增解析结果报告，可查看字段识别类型、置信度和判断依据',
      '新增分析解释功能，支持查看百分位、超过人数和相对位置',
      '优化移动端兼容性，增加分析失败提示和大表格防卡死保护',
      '修复未填写字段被当作 0 分的问题',
      '修复排名字段百分位方向错误问题'
    ]
  }
];
