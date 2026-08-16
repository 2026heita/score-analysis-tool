import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { generateCdf } from '../../utils/chartData';
import { minMax } from '../../utils/stats';
import { computePercentile } from '../../engine/analysisEngine';
import { safeFormatNumber, safeFormatPercent, extractNumericFromEChartsParam } from '../../utils/safeFormat';
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

    // 数据范围
    const dataMM = minMax(xData);
    const dataMin = dataMM ? dataMM.min : 0;
    const dataMax = dataMM ? dataMM.max : 0;

    // 计算有效范围（考虑用户值）
    let effectiveMin = dataMin;
    let effectiveMax = dataMax;
    if (userValue !== undefined && Number.isFinite(userValue)) {
      effectiveMin = Math.min(dataMin, userValue);
      effectiveMax = Math.max(dataMax, userValue);
    }

    // 计算 padding
    const effectiveRange = effectiveMax - effectiveMin;
    const xPadding = effectiveRange > 0 ? effectiveRange * 0.1 : Math.abs(effectiveMin) * 0.1 || 1;
    const xAxisMin = effectiveMin - xPadding;
    const xAxisMax = effectiveMax + xPadding;

    // 构建完整的可视化 CDF 数据，覆盖 xAxisMin 到 xAxisMax
    // step='end': 两点之间保持前一点的 y 值，到后一点的 x 处跳跃
    // 因此序列 [xAxisMin,0] → [x1,y1] → [x2,y2] → ... → [xAxisMax,100]
    // 即可正确表达右连续经验 CDF：
    //   x < x1 → 0%,  x1 ≤ x < x2 → y1,  x2 ≤ x < x3 → y2,  ...  x ≥ xMax → 100%
    const cdfData: [number, number][] = [];
    cdfData.push([xAxisMin, 0]);
    for (let i = 0; i < xData.length; i++) {
      cdfData.push([xData[i], yData[i]]);
    }
    cdfData.push([xAxisMax, 100]);

    // 用户标记点：CDF 曲线上的累计占比（与 higher/lower-is-better 无关）
    const markPoint: any[] = [];

    if (userValue !== undefined && Number.isFinite(userValue)) {
      // CDF 的 Y 坐标始终是 P(X <= x)，即不高于用户值的累计占比
      const cdfPercentile = computePercentile(cleanValues, userValue, false);

      markPoint.push({
        coord: [userValue, cdfPercentile],
        symbol: 'pin',
        symbolSize: 28,
        itemStyle: { color: '#ef4444' },
        label: {
          formatter: `你的数值：${safeFormatNumber(userValue, 2)}\n累计占比：${safeFormatPercent(cdfPercentile)}`,
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
        confine: true,
        formatter: (params: any) => {
          const p = params[0];
          const value = extractNumericFromEChartsParam(p.value[0]);
          const percentile = extractNumericFromEChartsParam(p.value[1]);
          return `${safeFormatNumber(value)}<br/>累积分布：${safeFormatPercent(percentile)}`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        min: xAxisMin,
        max: xAxisMax,
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '累计占比（≤该值）(%)',
        nameTextStyle: { fontSize: 11, color: '#94a3b8' },
        axisLabel: { formatter: '{value}%', hideOverlap: true },
        splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
      },
      series: [
        {
          type: 'line',
          data: cdfData,
          smooth: false,
          step: 'end',
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
