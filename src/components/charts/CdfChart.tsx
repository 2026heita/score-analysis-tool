import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { generateCdf } from '../../utils/chartData';
import { computePercentile } from '../../engine/analysisEngine';
import EChartsWrapper from './EChartsWrapper';

interface CdfChartProps {
  values: number[];
  fieldName: string;
  userValue?: number;
}

export default function CdfChart({ values, fieldName, userValue }: CdfChartProps) {
  const cleanValues = values.filter(v => Number.isFinite(v));

  const option: EChartsOption = useMemo(() => {
    if (cleanValues.length === 0) {
      return {
        title: {
          text: '【' + fieldName + '】累积分布图',
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
        },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '暂无可视化数据',
            fill: '#94a3b8',
            fontSize: 14,
          },
        },
      } as EChartsOption;
    }

    const cdf = generateCdf(cleanValues);
    const xData = cdf.map(p => p.value);
    const yData = cdf.map(p => p.percentile);

    // 用户标记点：放在曲线上对应位置
    // 使用严格小于口径，与全站百分位一致
    const markPoint: any[] = [];

    if (userValue !== undefined) {
      // 使用统一分析引擎的百分位计算
      const percentile = computePercentile(cleanValues, userValue, false);

      markPoint.push({
        coord: [userValue, percentile],
        symbol: 'pin',
        symbolSize: 28,
        itemStyle: { color: '#ef4444' },
        label: {
          formatter: `你的数值：${Number.isInteger(userValue) ? userValue : userValue.toFixed(2)}\n约高于 ${percentile.toFixed(1)}% 的有效数据`,
          position: 'top',
          fontSize: 11,
          color: '#dc2626',
        },
      });
    }

    return {
      title: {
        text: '【' + fieldName + '】累积分布图',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          return `${p.value[0]}<br/>低于该值比例：${p.value[1].toFixed(1)}%`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        name: fieldName,
        nameTextStyle: { fontSize: 11, color: '#94a3b8', padding: [8, 0, 0, 0] },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '低于该值比例 (%)',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'line',
          data: xData.map((x, i) => [x, yData[i]]),
          smooth: true,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          symbol: 'none',
          markPoint: markPoint.length > 0 ? { data: markPoint } : undefined,
        },
      ],
    } as EChartsOption;
  }, [cleanValues, fieldName, userValue]);

  return <EChartsWrapper option={option} chartTypes={['line']} style={{ height: '350px', width: '100%' }} />;
}
