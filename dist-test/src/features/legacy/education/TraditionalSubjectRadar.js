import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @deprecated 教育/高考功能已收敛至 legacy 区。
 * 此组件为教育科目雷达图，不再被主链路引用。
 * 替代方案：使用通用的雷达图分析组件 OriginalFieldRadar。
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { normalizeScore } from '../../../utils/chartData';
import EChartsWrapper from '../../../components/charts/EChartsWrapper';
const SUBJECTS = [
    { key: 'chinese', label: '语文', defaultMax: 150 },
    { key: 'math', label: '数学', defaultMax: 150 },
    { key: 'foreign', label: '外语', defaultMax: 150 },
    { key: 'preferred', label: '首选科目', defaultMax: 100, options: [
            { label: '物理', value: '物理' },
            { label: '历史', value: '历史' },
        ], defaultOption: '物理' },
    { key: 'reselect1', label: '再选科目 1', defaultMax: 100, options: [
            { label: '化学', value: '化学' },
            { label: '生物', value: '生物' },
            { label: '政治', value: '政治' },
            { label: '地理', value: '地理' },
        ], defaultOption: '化学' },
    { key: 'reselect2', label: '再选科目 2', defaultMax: 100, options: [
            { label: '化学', value: '化学' },
            { label: '生物', value: '生物' },
            { label: '政治', value: '政治' },
            { label: '地理', value: '地理' },
        ], defaultOption: '生物' },
];
/** @deprecated 教育/高考功能已收敛至 legacy 区 */
export default function TraditionalSubjectRadar({ initialEntries, onStateChange }) {
    const defaultEntries = useMemo(() => SUBJECTS.map(s => ({ name: s.defaultOption || s.label, score: 0, maxScore: s.defaultMax })), []);
    const [entries, setEntries] = useState(() => (initialEntries && initialEntries.length > 0) ? initialEntries : defaultEntries);
    // 分析模式：得分率模式（当前默认），预留科目百分位模式（percentile）和标准分模式（zScore）
    const modeLabel = '得分率模式';
    // 当 initialEntries 有实际数据时同步
    useEffect(() => {
        if (initialEntries && initialEntries.length > 0) {
            setEntries(initialEntries);
        }
    }, [initialEntries]);
    // 状态变化时通知父组件
    useEffect(() => {
        if (onStateChange) {
            onStateChange(entries);
        }
    }, [entries, onStateChange]);
    const updateEntry = useCallback((index, key, value) => {
        setEntries(prev => {
            const updated = [...prev];
            if (key === 'name') {
                updated[index] = { ...updated[index], name: value };
            }
            else {
                updated[index] = { ...updated[index], [key]: value };
            }
            return updated;
        });
    }, []);
    const updateSubjectOption = useCallback((index, optionValue) => {
        setEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], name: optionValue };
            return updated;
        });
    }, []);
    const validEntries = useMemo(() => {
        return entries.filter(e => e.score > 0 && e.maxScore > 0);
    }, [entries]);
    const chartOption = useMemo(() => {
        if (validEntries.length < 2)
            return null;
        const indicator = validEntries.map(e => ({ name: e.name, max: 100 }));
        const normalizedData = validEntries.map(e => normalizeScore(e.score, e.maxScore));
        return {
            title: {
                text: '传统科目得分率雷达图',
                left: 'center',
                textStyle: { fontSize: 14, fontWeight: 600, color: '#334155' },
            },
            tooltip: {
                trigger: 'item',
                formatter: () => {
                    const lines = ['传统科目得分率雷达图'];
                    for (const e of entries) {
                        const norm = e.maxScore > 0 ? normalizeScore(e.score, e.maxScore) : 0;
                        const scoreStr = e.score > 0 ? e.score.toString() : '-';
                        const maxStr = e.maxScore > 0 ? e.maxScore.toString() : '-';
                        const normStr = e.score > 0 && e.maxScore > 0 ? `${norm.toFixed(1)}%` : '-';
                        lines.push(`${e.name}：${scoreStr} / ${maxStr}，${normStr}`);
                    }
                    return lines.join('<br/>');
                },
            },
            radar: {
                indicator,
                radius: '65%',
                axisName: { fontSize: 12 },
            },
            series: [
                {
                    type: 'radar',
                    data: [
                        {
                            value: normalizedData,
                            name: '标准化表现',
                            areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
                            lineStyle: { color: '#3b82f6', width: 2 },
                            itemStyle: { color: '#3b82f6' },
                        },
                    ],
                },
            ],
        };
    }, [validEntries, entries]);
    // 结论
    const conclusion = useMemo(() => {
        if (validEntries.length < 2)
            return null;
        const withNorm = validEntries.map(e => ({
            name: e.name,
            score: e.score,
            maxScore: e.maxScore,
            normalized: normalizeScore(e.score, e.maxScore),
        }));
        const sorted = [...withNorm].sort((a, b) => b.normalized - a.normalized);
        const advantages = sorted.slice(0, 2);
        const weaknesses = sorted.slice(-2).reverse();
        const avgNorm = withNorm.reduce((a, b) => a + b.normalized, 0) / withNorm.length;
        return { advantages, weaknesses, avgNorm };
    }, [validEntries]);
    return (_jsxs("div", { children: [_jsx("div", { style: styles.subjectList, children: entries.map((entry, index) => {
                    const subj = SUBJECTS[index];
                    return (_jsxs("div", { style: styles.subjectItem, children: [_jsx("div", { style: styles.subjectNameWrap, children: subj.options ? (_jsxs("div", { style: styles.subjectSelectWrap, children: [_jsx("span", { style: styles.subjectLabel, children: subj.label }), _jsx("select", { style: styles.subjectSelect, value: entry.name, onChange: e => updateSubjectOption(index, e.target.value), children: subj.options.map(opt => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] })) : (_jsx("span", { style: styles.subjectLabelStatic, children: entry.name })) }), _jsxs("div", { style: styles.scoreInputs, children: [_jsxs("label", { style: styles.scoreInputWrap, children: [_jsx("span", { style: styles.scoreInputLabel, children: "\u5B9E\u9645\u5206" }), _jsx("input", { type: "number", style: styles.scoreInput, value: entry.score || '', onChange: e => updateEntry(index, 'score', parseFloat(e.target.value) || 0), placeholder: "0" })] }), _jsxs("label", { style: styles.scoreInputWrap, children: [_jsx("span", { style: styles.scoreInputLabel, children: "\u6EE1\u5206" }), _jsx("input", { type: "number", style: styles.scoreInput, value: entry.maxScore, onChange: e => updateEntry(index, 'maxScore', parseFloat(e.target.value) || 100), placeholder: "100" })] })] })] }, index));
                }) }), chartOption && (_jsxs(_Fragment, { children: [_jsx(EChartsWrapper, { option: chartOption, chartTypes: ['radar'], style: { height: '400px', width: '100%' } }), conclusion && (_jsxs("div", { style: styles.conclusionBox, children: [_jsxs("div", { style: styles.conclusionItem, children: [_jsx("span", { style: styles.conclusionLabel, children: "\u5F97\u5206\u7387\u8F83\u9AD8\u79D1\u76EE\uFF1A" }), _jsx("span", { style: { ...styles.conclusionValue, color: '#10b981' }, children: conclusion.advantages.map(a => `${a.name}（${a.normalized.toFixed(1)}%）`).join('、') })] }), _jsxs("div", { style: styles.conclusionItem, children: [_jsx("span", { style: styles.conclusionLabel, children: "\u5F97\u5206\u7387\u8F83\u4F4E\u79D1\u76EE\uFF1A" }), _jsx("span", { style: { ...styles.conclusionValue, color: '#ef4444' }, children: conclusion.weaknesses.map(w => `${w.name}（${w.normalized.toFixed(1)}%）`).join('、') })] }), _jsxs("div", { style: styles.conclusionItem, children: [_jsx("span", { style: styles.conclusionLabel, children: "\u6574\u4F53\u5E73\u5747\u5F97\u5206\u7387\uFF1A" }), _jsxs("span", { style: { ...styles.conclusionValue, color: '#3b82f6' }, children: [conclusion.avgNorm.toFixed(1), "%"] })] })] })), _jsxs("div", { style: styles.modeNote, children: ["\u5F53\u524D\u6A21\u5F0F\uFF1A", modeLabel, "\u3002\u6309 \u5B9E\u9645\u5206 \u00F7 \u6EE1\u5206 \u00D7 100% \u8BA1\u7B97\uFF0C\u53EA\u53CD\u6620\u5404\u79D1\u5F97\u5206\u7387\uFF0C\u4E0D\u4EE3\u8868\u4E0D\u540C\u79D1\u76EE\u96BE\u5EA6\u5B8C\u5168\u4E00\u81F4\uFF0C\u4E5F\u4E0D\u7B49\u540C\u4E8E\u5168\u4F53\u6392\u540D\u3002"] }), _jsx("div", { style: styles.futureNote, children: "\u5982\u9700\u6309\u79D1\u76EE\u767E\u5206\u4F4D\u6216\u6807\u51C6\u5206\u5206\u6790\uFF0C\u9700\u8981\u63D0\u4F9B\u5404\u79D1\u5168\u4F53\u6210\u7EE9\u5206\u5E03\u6570\u636E\u3002" })] })), validEntries.length < 2 && (_jsx("div", { style: styles.emptyHint, children: "\u8BF7\u81F3\u5C11\u8F93\u5165\u4E24\u79D1\u6210\u7EE9\uFF0C\u5373\u53EF\u751F\u6210\u4F20\u7EDF\u79D1\u76EE\u5F97\u5206\u7387\u96F7\u8FBE\u56FE\u3002" }))] }));
}
const styles = {
    subjectList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginBottom: '12px',
    },
    subjectItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        background: '#f8fafc',
        borderRadius: '8px',
    },
    subjectNameWrap: {
        flex: '0 0 100px',
    },
    subjectSelectWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    subjectLabel: {
        fontSize: '11px',
        color: '#94a3b8',
    },
    subjectSelect: {
        padding: '4px 6px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '13px',
        outline: 'none',
        background: '#fff',
    },
    subjectLabelStatic: {
        fontSize: '14px',
        fontWeight: 500,
        color: '#334155',
    },
    scoreInputs: {
        flex: 1,
        display: 'flex',
        gap: '12px',
    },
    scoreInputWrap: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    scoreInputLabel: {
        fontSize: '11px',
        color: '#94a3b8',
    },
    scoreInput: {
        padding: '6px 8px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '14px',
        outline: 'none',
    },
    conclusionBox: {
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        padding: '12px 16px',
        marginTop: '12px',
    },
    conclusionItem: {
        fontSize: '13px',
        marginBottom: '4px',
    },
    conclusionLabel: {
        color: '#64748b',
    },
    conclusionValue: {
        fontWeight: 600,
    },
    emptyHint: {
        textAlign: 'center',
        padding: '20px',
        color: '#94a3b8',
        fontSize: '13px',
    },
    modeNote: {
        background: '#f0f7ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#1e40af',
        marginTop: '10px',
    },
    futureNote: {
        fontSize: '11px',
        color: '#94a3b8',
        marginTop: '6px',
        textAlign: 'center',
    },
};
