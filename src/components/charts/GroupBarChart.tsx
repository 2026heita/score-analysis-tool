/**
 * GroupBarChart - 分组柱状图组件
 * 
 * 职责：展示 Top N 分组按均值（或其他指标）的柱状图
 * 
 * 设计原则：
 * 1. 不改现有图表组件
 * 2. 复用 echarts-for-react 和项目图表风格
 * 3. X 轴为分组名，Y 轴为选中指标
 * 4. 展示 Top N 分组
 */

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { topN, DEFAULT_TOP_N } from '../../engine/groupByDimension';
import type { GroupStats } from '../../engine/groupByDimension';
import EChartsWrapper from './EChartsWrapper';

interface GroupBarChartProps {
  /** 分组统计结果 */
  groupStats: GroupStats[];
  /** 指标字段名 */
  metricField: string;
  /** 维度字段名 */
  dimensionField: string;
}

// 分类标签格式化：根据长度自动换行
function formatCategoryLabel(value: string): string {
  // 短文本直接显示
  if (value.length <= 15) return value;

  // 检查是否包含空格（英文等）
  const hasSpace = value.includes(' ');

  if (hasSpace) {
    // 按单词换行
    const words = value.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + word.length + 1 <= 15) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines.join('\n');
  } else {
    // 中文等连续文本按字符换行
    const maxLen = 15;
    const lines: string[] = [];
    for (let i = 0; i < value.length; i += maxLen) {
      lines.push(value.slice(i, i + maxLen));
    }
    return lines.join('\n');
  }
}

export default function GroupBarChart({ groupStats, metricField, dimensionField }: GroupBarChartProps) {
  const displayed = useMemo(() => topN(groupStats, DEFAULT_TOP_N), [groupStats]);

  const option: EChartsOption = useMemo(() => {
    if (displayed.length === 0) {
      return {
        title: {
          text: '暂无可视化数据',
          left: 'center',
          textStyle: { fontSize: 14, color: '#94a3b8' },
        },
      } as EChartsOption;
    }

    // 反转顺序：让最高的在最上面（ECharts 从下往上渲染）
    const reversed = [...displayed].reverse();
    const names = reversed.map(g => g.dimensionValue);
    const means = reversed.map(g => g.mean);

    return {
      title: {
        text: `按【${dimensionField}】分组 - 【${metricField}】均值`,
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const idx = reversed.length - 1 - p.dataIndex;
          const g = displayed[idx];
          if (!g) return `${p.name}<br/>均值：${p.value}`;
          return [
            `${g.dimensionValue}`,
            `均值：${g.mean.toFixed(2)}`,
            `中位数：${g.median.toFixed(2)}`,
            `数量：${g.count}`,
            `范围：${g.min} ~ ${g.max}`,
          ].join('<br/>');
        },
      },
      grid: {
        left: '3%',
        right: '8%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: '均值',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          fontSize: 11,
          formatter: formatCategoryLabel,
        },
        inverse: false,
      },
      series: [
        {
          type: 'bar',
          data: means.map((v, i) => ({
            value: v,
            itemStyle: {
              color: `hsl(${230 + i * 3}, 70%, ${55 + i * 0.5}%)`,
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barMaxWidth: 30,
        },
      ],
    } as EChartsOption;
  }, [displayed, dimensionField, metricField]);

  if (groupStats.length === 0) {
    return null;
  }

  return <EChartsWrapper option={option} chartTypes={['bar']} style={{ height: `${Math.max(300, displayed.length * 24)}px`, width: '100%' }} />;
}