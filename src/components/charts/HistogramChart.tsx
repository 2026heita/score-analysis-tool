import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { generateBins } from '../../utils/chartData';
import { safeFormatNumber } from '../../utils/safeFormat';
import EChartsWrapper from './EChartsWrapper';

interface HistogramChartProps {
  values: number[];
  fieldName: string;
  userValue?: number;
  binCount?: number;
}

export default function HistogramChart({ values, fieldName, userValue, binCount = 10 }: HistogramChartProps) {
  const cleanValues = values.filter(v => Number.isFinite(v));

  const option: EChartsOption = useMemo(() => {
    if (cleanValues.length === 0) {
      return {
        title: {
          text: '【' + fieldName + '】分布图',
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

    const bins = generateBins(cleanValues, binCount);
    const dataMin = bins.length > 0 ? bins[0].start : 0;
    const dataMax = bins.length > 0 ? bins[bins.length - 1].end : 0;

    // 查找用户值所属 bin：普通 bin 为 [start, end)，最后一个 bin 为 [start, end]
    // 确保最大值能正确落入最后一组
    const userBinIndex = userValue !== undefined
      ? bins.findIndex((b, i) => {
          if (i < bins.length - 1) {
            return userValue >= b.start && userValue < b.end;
          }
          // 最后一个 bin：包含上界
          return userValue >= b.start && userValue <= b.end;
        })
      : -1;

    // 判断用户值是否超出数据范围
    const isBelowRange = userValue !== undefined && userValue < dataMin;
    const isAboveRange = userValue !== undefined && userValue > dataMax;
    const isOutOfRange = isBelowRange || isAboveRange;

    const colors = bins.map((_, i) => i === userBinIndex ? '#f59e0b' : '#3b82f6');

    const markLineData: any[] = [];
    if (userValue !== undefined && userBinIndex >= 0) {
      // 用户在范围内：高亮对应 bin 并标记红线
      markLineData.push({
        xAxis: bins[userBinIndex].label,
        label: {
          formatter: `你的数值：${safeFormatNumber(userValue, 2)}`,
          position: 'end',
        },
        lineStyle: { color: '#ef4444', type: 'dashed', width: 2 },
      });
    }

    const xLabels = bins.map(b => b.label);
    const counts = bins.map(b => b.count);

    // 超范围时使用 graphic 组件在图表边缘显示标记
    const graphicElements: any[] = [];
    if (userValue !== undefined && isOutOfRange) {
      const rangeText = isBelowRange ? '← 低于数据范围' : '高于数据范围 →';
      const xPos = isBelowRange ? '8%' : '92%';
      graphicElements.push({
        type: 'text',
        style: {
          text: `你的数值：${safeFormatNumber(userValue, 2)}`,
          fill: '#dc2626',
          fontSize: 12,
          fontWeight: 'bold',
          textAlign: 'center',
        },
        left: xPos,
        top: 55,
      }, {
        type: 'text',
        style: {
          text: rangeText,
          fill: '#ef4444',
          fontSize: 11,
          textAlign: 'center',
        },
        left: xPos,
        top: 75,
      });
    }

    return {
      title: {
        text: '【' + fieldName + '】分布图',
        left: 'center',
        textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: any) => {
          const p = params[0];
          const bin = bins[p.dataIndex];
          return `${bin.label}<br/>频数：${bin.count}`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: {
          interval: 'auto',
          rotate: bins.length > 8 ? 30 : 0,
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        name: '频数',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'bar',
          data: counts.map((c, i) => ({
            value: c,
            itemStyle: { color: colors[i] },
          })),
          markLine: markLineData.length > 0 ? { data: markLineData, silent: true } : undefined,
          barGap: '5%',
        },
      ],
      graphic: graphicElements.length > 0 ? graphicElements : undefined,
    } as EChartsOption;
  }, [cleanValues, fieldName, userValue, binCount]);

  return <EChartsWrapper option={option} chartTypes={['bar']} style={{ height: '350px', width: '100%' }} />;
}
