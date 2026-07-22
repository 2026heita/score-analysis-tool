/**
 * 图表数据整理工具函数
 */
import { calculateQuantile, formatNumber as _formatNumber } from './stats';
export function generateBins(values, binCount) {
    if (!values || values.length === 0)
        return [];
    const cleanValues = values.filter(v => Number.isFinite(v));
    if (cleanValues.length === 0)
        return [];
    const min = Math.min(...cleanValues);
    const max = Math.max(...cleanValues);
    if (min === max) {
        return [{ start: min, end: max, count: cleanValues.length, label: `${min}` }];
    }
    const binWidth = (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => {
        const start = min + i * binWidth;
        const end = start + binWidth;
        return { start, end, count: 0, label: `${formatValue(start)}~${formatValue(end)}` };
    });
    cleanValues.forEach(v => {
        let index = Math.floor((v - min) / binWidth);
        if (index >= binCount)
            index = binCount - 1;
        if (index < 0)
            index = 0;
        bins[index].count++;
    });
    return bins;
}
/**
 * CDF 累积分布：按严格小于口径生成阶梯数据
 * percentile = count(v < value) / total * 100
 */
export function generateCdf(values) {
    if (!values || values.length === 0)
        return [];
    const sorted = [...values.filter(v => Number.isFinite(v))].sort((a, b) => a - b);
    if (sorted.length === 0)
        return [];
    const total = sorted.length;
    // 使用严格小于口径：percentile = count(v < value) / total * 100
    // 对于重复值，取第一个出现的 index 确保一致性
    return sorted.map((v, i) => {
        // 找到第一个等于当前值的位置，确保所有相同值对应同一个 percentile
        let firstIdx = i;
        while (firstIdx > 0 && sorted[firstIdx - 1] === v)
            firstIdx--;
        // percentile = 严格小于该值的人数 / total * 100
        const percentile = (firstIdx / total) * 100;
        return { value: v, percentile };
    });
}
/**
 * 标准化分数：实际分 / 满分 * 100
 */
export function normalizeScore(score, maxScore) {
    if (maxScore <= 0 || !Number.isFinite(score) || !Number.isFinite(maxScore))
        return 0;
    return (score / maxScore) * 100;
}
/**
 * 根据字段名推断满分值，用于坐标轴范围优化
 */
export function inferFieldMax(fieldName, values) {
    const cleanValues = (values || []).filter(v => Number.isFinite(v));
    if (fieldName.includes('总分') || fieldName.includes('总分合计'))
        return 750;
    if (fieldName.includes('语文数学两科之和') || fieldName.includes('语数之和') || fieldName.includes('两科之和'))
        return 300;
    if (fieldName.includes('语文或数学单科最高') || fieldName.includes('单科最高'))
        return 150;
    if (fieldName.includes('外语') || fieldName.includes('英语'))
        return 150;
    if (fieldName.includes('首选') || fieldName.includes('再选'))
        return 100;
    if (cleanValues.length === 0)
        return 100;
    return Math.ceil(Math.max(...cleanValues) / 10) * 10;
}
export function buildQuartilePieData(values) {
    const cleanValues = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (cleanValues.length === 0)
        return null;
    // 使用统一的 calculateQuantile
    const q1 = calculateQuantile(cleanValues, 0.25);
    const median = calculateQuantile(cleanValues, 0.5);
    const q3 = calculateQuantile(cleanValues, 0.75);
    const isAllSame = cleanValues[0] === cleanValues[cleanValues.length - 1];
    if (isAllSame) {
        return {
            segments: [
                { name: '全部数据相同', value: cleanValues.length, percentage: 100, rangeText: `${formatValue(cleanValues[0])}` },
            ],
            q1, median, q3, isAllSame: true,
        };
    }
    const total = cleanValues.length;
    let belowQ1 = 0, q1ToMed = 0, medToQ3 = 0, aboveQ3 = 0;
    cleanValues.forEach(v => {
        if (v < q1)
            belowQ1++;
        else if (v < median)
            q1ToMed++;
        else if (v < q3)
            medToQ3++;
        else
            aboveQ3++;
    });
    return {
        segments: [
            { name: '低于 Q1', value: belowQ1, percentage: (belowQ1 / total) * 100, rangeText: `< ${formatValue(q1)}` },
            { name: 'Q1 至中位数', value: q1ToMed, percentage: (q1ToMed / total) * 100, rangeText: `>= ${formatValue(q1)} 且 < ${formatValue(median)}` },
            { name: '中位数至 Q3', value: medToQ3, percentage: (medToQ3 / total) * 100, rangeText: `>= ${formatValue(median)} 且 < ${formatValue(q3)}` },
            { name: 'Q3 及以上', value: aboveQ3, percentage: (aboveQ3 / total) * 100, rangeText: `>= ${formatValue(q3)}` },
        ],
        q1, median, q3, isAllSame: false,
    };
}
function formatValue(val) {
    if (!Number.isFinite(val))
        return '-';
    if (Number.isInteger(val))
        return val.toString();
    return val.toFixed(1);
}
// 导出 stats 中的 formatNumber，方便 chartData 模块统一使用
export const formatNumber = _formatNumber;
