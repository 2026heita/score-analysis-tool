import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { buildQuartilePieData, formatNumber } from '../../utils/chartData';
import { safeFormatPercent } from '../../utils/safeFormat';
import EChartsWrapper from './EChartsWrapper';
// 颜色语义：低分橙红 → 黄 → 蓝 → 高分绿
const COLORS = ['#f97316', '#fbbf24', '#60a5fa', '#34d399'];
export default function QuartilePieChart({ values, fieldName, userValue }) {
    const pieData = buildQuartilePieData(values);
    const chartOption = (() => {
        if (!pieData || pieData.segments.length === 0)
            return null;
        const isSingle = pieData.isAllSame;
        const data = pieData.segments.map((seg, i) => ({
            name: seg.name,
            value: seg.value,
            percentage: seg.percentage,
            rangeText: seg.rangeText,
            itemStyle: { color: isSingle ? '#60a5fa' : COLORS[i] },
        }));
        return {
            title: {
                text: `【${fieldName}】四分位占比图`,
                left: 'center',
                textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
            },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const d = params.data;
                    if (pieData.isAllSame) {
                        return `${d.name}<br/>人数：${d.value}<br/>占比：100%<br/>数值：${d.rangeText}`;
                    }
                    return `${d.name}<br/>人数：${d.value}<br/>占比：${safeFormatPercent(d.percentage)}<br/>范围：${d.rangeText}`;
                },
            },
            series: [
                {
                    type: 'pie',
                    radius: ['40%', '70%'],
                    center: ['50%', '55%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    label: {
                        formatter: '{b}\n{d}%',
                        fontSize: 12,
                    },
                    labelLine: { length: 15, length2: 20 },
                    data,
                },
            ],
        };
    })();
    // 用户数值区间提示（含阈值）
    let userHintText = '';
    if (pieData && Number.isFinite(userValue)) {
        if (pieData.isAllSame) {
            userHintText = '当前字段所有有效值相同，无法划分四分位区间。';
        }
        else {
            const v = userValue;
            const q1Str = formatNumber(pieData.q1);
            const medStr = formatNumber(pieData.median);
            const q3Str = formatNumber(pieData.q3);
            if (v < pieData.q1) {
                userHintText = `你的数值 ${formatNumber(v)} 位于：低于 Q1 区间（Q1 = ${q1Str}）。`;
            }
            else if (v < pieData.median) {
                userHintText = `你的数值 ${formatNumber(v)} 位于：Q1 至中位数区间（Q1 = ${q1Str}，中位数 = ${medStr}）。`;
            }
            else if (v < pieData.q3) {
                userHintText = `你的数值 ${formatNumber(v)} 位于：中位数至 Q3 区间（中位数 = ${medStr}，Q3 = ${q3Str}）。`;
            }
            else {
                userHintText = `你的数值 ${formatNumber(v)} 位于：Q3 及以上区间（Q3 = ${q3Str}）。`;
            }
        }
    }
    return (_jsx("div", { children: chartOption ? (_jsxs(_Fragment, { children: [_jsx(EChartsWrapper, { option: chartOption, chartTypes: ['pie'], style: { height: '360px', width: '100%' } }), userHintText && (_jsx("p", { style: styles.userHint, children: userHintText })), _jsx("p", { style: styles.note, children: "\u56DB\u5206\u4F4D\u5360\u6BD4\u56FE\u6309 Q1\u3001\u4E2D\u4F4D\u6570\u3001Q3 \u5C06\u6570\u636E\u5212\u5206\u4E3A\u56DB\u4E2A\u533A\u95F4\uFF0C\u7528\u4E8E\u89C2\u5BDF\u5F53\u524D\u5B57\u6BB5\u7684\u6570\u636E\u96C6\u4E2D\u60C5\u51B5\u3002\u7531\u4E8E\u540C\u5206\u548C\u8FB9\u754C\u5F52\u7C7B\uFF0C\u5404\u533A\u95F4\u4EBA\u6570\u4E0D\u4E00\u5B9A\u521A\u597D\u7B49\u4E8E 25%\u3002\u8BE5\u56FE\u4E0D\u4EE3\u8868\u6392\u540D\u540D\u6B21\u3002" })] })) : (_jsx("div", { style: styles.emptyHint, children: "\u6682\u65E0\u53EF\u89C6\u5316\u6570\u636E" })) }));
}
const styles = {
    userHint: {
        textAlign: 'center',
        padding: '8px 12px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#1e40af',
        marginTop: '8px',
    },
    note: {
        textAlign: 'center',
        fontSize: '11px',
        color: '#94a3b8',
        marginTop: '10px',
    },
    emptyHint: {
        textAlign: 'center',
        padding: '20px',
        color: '#94a3b8',
        fontSize: '13px',
    },
};
