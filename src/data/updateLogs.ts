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
    date: '2026-06-14',
    version: APP_VERSION,
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
