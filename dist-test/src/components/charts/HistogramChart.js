import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from 'react';
import { generateBins } from '../../utils/chartData';
import { safeFormatNumber } from '../../utils/safeFormat';
import EChartsWrapper from './EChartsWrapper';
export default function HistogramChart({ values, fieldName, userValue, binCount = 10 }) {
    const cleanValues = values.filter(v => Number.isFinite(v));
    const option = useMemo(() => {
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
            };
        }
        const bins = generateBins(cleanValues, binCount);
        const userBinIndex = userValue !== undefined
            ? bins.findIndex(b => userValue >= b.start && userValue < b.end)
            : -1;
        const colors = bins.map((_, i) => i === userBinIndex ? '#f59e0b' : '#3b82f6');
        const markLineData = [];
        if (userValue !== undefined) {
            markLineData.push({
                xAxis: userValue,
                label: {
                    formatter: `你的数值：${safeFormatNumber(userValue, 2)}`,
                    position: 'end',
                },
                lineStyle: { color: '#ef4444', type: 'dashed', width: 2 },
            });
        }
        const xLabels = bins.map(b => b.label);
        const counts = bins.map(b => b.count);
        return {
            title: {
                text: '【' + fieldName + '】分布图',
                left: 'center',
                textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
            },
            tooltip: {
                trigger: 'axis',
                formatter: (params) => {
                    const p = params[0];
                    const bin = bins[p.dataIndex];
                    return `${bin.label}<br/>人数：${bin.count} 人`;
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
                name: '数值区间',
                nameTextStyle: { fontSize: 11, color: '#94a3b8', padding: [8, 0, 0, 0] },
            },
            yAxis: {
                type: 'value',
                name: '人数',
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
        };
    }, [cleanValues, fieldName, userValue, binCount]);
    return _jsx(EChartsWrapper, { option: option, chartTypes: ['bar'], style: { height: '350px', width: '100%' } });
}
