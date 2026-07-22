import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { formatNumber } from '../../utils/chartData';
import EChartsWrapper from './EChartsWrapper';
export default function BoxPlotChart({ values, fieldName, stats, userValue }) {
    const cleanValues = values.filter(v => Number.isFinite(v));
    const hasValidUser = stats && userValue !== undefined && Number.isFinite(userValue);
    // 箱线图结论文字
    const boxConclusion = useMemo(() => {
        if (!hasValidUser)
            return '';
        if (userValue >= stats.q75)
            return '你的数值高于 75% 分位，处于该字段较高区间。';
        if (userValue >= stats.median)
            return '你的数值高于中位数，处于中上区间。';
        if (userValue >= stats.q25)
            return '你的数值低于中位数，处于中下区间。';
        return '你的数值低于 25% 分位，处于较低区间。';
    }, [hasValidUser, userValue, stats]);
    const option = useMemo(() => {
        if (cleanValues.length === 0 || !stats) {
            return {
                title: {
                    text: '【' + fieldName + '】箱线图',
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
        const boxData = [stats.min, stats.q25, stats.median, stats.q75, stats.max];
        const dataMin = stats.min;
        const dataMax = stats.max;
        const series = [
            {
                type: 'boxplot',
                data: [boxData],
                itemStyle: { color: '#3b82f6', borderColor: '#2563eb' },
            },
        ];
        // 用户散点
        if (userValue !== undefined) {
            series.push({
                type: 'scatter',
                data: [
                    {
                        value: [0, userValue],
                        itemStyle: { color: '#ef4444' },
                        symbolSize: 12,
                        symbol: 'diamond',
                    },
                ],
                tooltip: { show: false },
            });
        }
        const yMin = userValue !== undefined
            ? Math.min(dataMin, userValue) - (dataMax - dataMin) * 0.1
            : dataMin - (dataMax - dataMin) * 0.1;
        const yMax = userValue !== undefined
            ? Math.max(dataMax, userValue) + (dataMax - dataMin) * 0.1
            : dataMax + (dataMax - dataMin) * 0.1;
        return {
            title: {
                text: '【' + fieldName + '】箱线图',
                left: 'center',
                textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
            },
            tooltip: {
                trigger: 'item',
                formatter: (param) => {
                    if (param.seriesType === 'boxplot') {
                        return `最小值：${formatNumber(stats.min)}<br/>Q1 (25%)：${formatNumber(stats.q25)}<br/>中位数：${formatNumber(stats.median)}<br/>Q3 (75%)：${formatNumber(stats.q75)}<br/>最大值：${formatNumber(stats.max)}`;
                    }
                    if (param.seriesType === 'scatter') {
                        return `你的数值：${formatNumber(userValue)}`;
                    }
                    return '';
                },
            },
            grid: { left: '5%', right: '15%', bottom: '20px', top: '15%' },
            xAxis: {
                type: 'category',
                data: [fieldName],
                axisLabel: { fontSize: 12 },
            },
            yAxis: {
                type: 'value',
                min: yMin,
                max: yMax,
                splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
            },
            series,
        };
    }, [cleanValues, fieldName, stats, userValue]);
    const isOutOfRange = stats && userValue !== undefined && (userValue < stats.min || userValue > stats.max);
    return (_jsxs("div", { children: [_jsx(EChartsWrapper, { option: option, chartTypes: ['boxplot', 'scatter'], style: { height: '350px', width: '100%' } }), stats && (_jsxs("div", { style: styles.summaryRow, children: [_jsxs("div", { style: styles.summaryItem, children: [_jsx("span", { style: styles.summaryLabel, children: "\u6700\u5C0F\u503C" }), _jsx("span", { style: styles.summaryValue, children: formatNumber(stats.min) })] }), _jsxs("div", { style: styles.summaryItem, children: [_jsx("span", { style: styles.summaryLabel, children: "Q1 (25%)" }), _jsx("span", { style: styles.summaryValue, children: formatNumber(stats.q25) })] }), _jsxs("div", { style: styles.summaryItem, children: [_jsx("span", { style: styles.summaryLabel, children: "\u4E2D\u4F4D\u6570" }), _jsx("span", { style: styles.summaryValue, children: formatNumber(stats.median) })] }), _jsxs("div", { style: styles.summaryItem, children: [_jsx("span", { style: styles.summaryLabel, children: "Q3 (75%)" }), _jsx("span", { style: styles.summaryValue, children: formatNumber(stats.q75) })] }), _jsxs("div", { style: styles.summaryItem, children: [_jsx("span", { style: styles.summaryLabel, children: "\u6700\u5927\u503C" }), _jsx("span", { style: styles.summaryValue, children: formatNumber(stats.max) })] }), userValue !== undefined && (_jsxs("div", { style: { ...styles.summaryItem, background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }, children: [_jsx("span", { style: styles.summaryLabel, children: "\u4F60\u7684\u6570\u503C" }), _jsx("span", { style: { ...styles.summaryValue, color: '#ef4444' }, children: formatNumber(userValue) })] }))] })), isOutOfRange && (_jsx("div", { style: styles.warningBox, children: "\u4F60\u7684\u6570\u503C\u8D85\u51FA\u5F53\u524D\u5B57\u6BB5\u6570\u636E\u8303\u56F4\u3002" })), boxConclusion && (_jsx("div", { style: styles.conclusionBox, children: boxConclusion }))] }));
}
const styles = {
    summaryRow: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginTop: '12px',
        justifyContent: 'center',
    },
    summaryItem: {
        background: '#f8fafc',
        borderRadius: '6px',
        padding: '8px 12px',
        textAlign: 'center',
        minWidth: '80px',
    },
    summaryLabel: {
        display: 'block',
        fontSize: '11px',
        color: '#94a3b8',
        marginBottom: '2px',
    },
    summaryValue: {
        display: 'block',
        fontSize: '15px',
        fontWeight: 700,
        color: '#1e293b',
        fontFamily: 'monospace',
    },
    warningBox: {
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#92400e',
        marginTop: '12px',
        textAlign: 'center',
    },
    conclusionBox: {
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        padding: '10px 14px',
        fontSize: '13px',
        color: '#1e40af',
        textAlign: 'center',
        marginTop: '10px',
        fontWeight: 500,
    },
};
