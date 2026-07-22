import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TEXT_OPERATORS = [
    { value: 'equals', label: '等于' },
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'isEmpty', label: '为空' },
    { value: 'isNotEmpty', label: '非空' },
];
const NUMERIC_OPERATORS = [
    { value: 'gt', label: '大于' },
    { value: 'lt', label: '小于' },
    { value: 'gte', label: '大于等于' },
    { value: 'lte', label: '小于等于' },
    { value: 'between', label: '介于' },
    { value: 'equals', label: '等于' },
    { value: 'isEmpty', label: '为空' },
    { value: 'isNotEmpty', label: '非空' },
];
/** 不需要输入值的操作符 */
const VALULESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty']);
function createEmptyCondition() {
    return { field: '', operator: 'equals', value: '' };
}
export default function FilterPanel({ headers, numericFields, conditions, onConditionsChange, filterSummary, collapsed, onToggleCollapse, }) {
    const hasActiveConditions = filterSummary && filterSummary.activeConditions > 0;
    const handleAdd = () => {
        onConditionsChange([...conditions, createEmptyCondition()]);
    };
    const handleRemove = (index) => {
        const next = conditions.filter((_, i) => i !== index);
        onConditionsChange(next.length === 0 ? [createEmptyCondition()] : next);
    };
    const handleFieldChange = (index, field) => {
        const next = [...conditions];
        next[index] = { ...next[index], field };
        // 切换字段时，如果是数值字段且当前操作符是文本操作符，切换到第一个数值操作符
        if (field && numericFields.has(field)) {
            const isTextOp = TEXT_OPERATORS.some(op => op.value === next[index].operator);
            if (isTextOp) {
                next[index] = { ...next[index], operator: 'gt' };
            }
        }
        onConditionsChange(next);
    };
    const handleOperatorChange = (index, operator) => {
        const next = [...conditions];
        next[index] = { ...next[index], operator: operator, value: '' };
        onConditionsChange(next);
    };
    const handleValueChange = (index, value) => {
        const next = [...conditions];
        next[index] = { ...next[index], value };
        onConditionsChange(next);
    };
    const getOperators = (field) => {
        if (!field)
            return [];
        return numericFields.has(field) ? NUMERIC_OPERATORS : TEXT_OPERATORS;
    };
    const getValuePlaceholder = (operator) => {
        if (operator === 'between')
            return '最小值,最大值';
        return '输入筛选值';
    };
    return (_jsxs("div", { style: styles.container, children: [_jsxs("div", { style: styles.header, onClick: onToggleCollapse, children: [_jsx("span", { style: styles.arrow, children: collapsed ? '▶' : '▼' }), _jsx("span", { style: styles.headerTitle, children: "\u6570\u636E\u7B5B\u9009" }), hasActiveConditions && (_jsxs("span", { style: styles.badge, children: [filterSummary.activeConditions, " \u4E2A\u6761\u4EF6 \u00B7 ", filterSummary.filteredCount, " / ", filterSummary.originalCount, " \u884C", filterSummary.filterRatio > 0 && ` (过滤 ${(filterSummary.filterRatio * 100).toFixed(1)}%)`] }))] }), !collapsed && (_jsxs("div", { style: styles.body, children: [conditions.map((cond, i) => {
                        const operators = getOperators(cond.field);
                        const needsValue = cond.operator && !VALULESS_OPERATORS.has(cond.operator);
                        return (_jsxs("div", { style: styles.row, children: [_jsxs("select", { style: styles.select, value: cond.field, onChange: e => handleFieldChange(i, e.target.value), children: [_jsx("option", { value: "", children: "\u9009\u62E9\u5B57\u6BB5" }), headers.map(h => (_jsx("option", { value: h, children: h }, h)))] }), _jsxs("select", { style: styles.select, value: cond.operator, onChange: e => handleOperatorChange(i, e.target.value), disabled: !cond.field, children: [_jsx("option", { value: "", children: "\u9009\u62E9\u6761\u4EF6" }), operators.map(op => (_jsx("option", { value: op.value, children: op.label }, op.value)))] }), needsValue && (_jsx("input", { style: styles.input, type: "text", value: cond.value, onChange: e => handleValueChange(i, e.target.value), placeholder: getValuePlaceholder(cond.operator) })), _jsx("button", { style: styles.removeBtn, onClick: () => handleRemove(i), title: "\u5220\u9664\u6761\u4EF6", children: "\u2715" })] }, i));
                    }), _jsx("button", { style: styles.addBtn, onClick: handleAdd, children: "+ \u6DFB\u52A0\u6761\u4EF6" })] }))] }));
}
const styles = {
    container: {
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        marginBottom: '16px',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        cursor: 'pointer',
        background: '#f8fafc',
        userSelect: 'none',
        borderBottom: '1px solid #e2e8f0',
    },
    arrow: {
        fontSize: '10px',
        color: '#94a3b8',
    },
    headerTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#334155',
    },
    badge: {
        marginLeft: 'auto',
        fontSize: '12px',
        color: '#6366f1',
        background: '#eef2ff',
        padding: '2px 8px',
        borderRadius: '10px',
    },
    body: {
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    select: {
        padding: '6px 8px',
        fontSize: '13px',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        background: '#fff',
        color: '#334155',
        minWidth: '120px',
        outline: 'none',
    },
    input: {
        padding: '6px 8px',
        fontSize: '13px',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        background: '#fff',
        color: '#334155',
        minWidth: '120px',
        flex: 1,
        outline: 'none',
    },
    removeBtn: {
        padding: '4px 8px',
        fontSize: '12px',
        border: 'none',
        borderRadius: '4px',
        background: 'transparent',
        color: '#ef4444',
        cursor: 'pointer',
        fontWeight: 600,
    },
    addBtn: {
        padding: '6px 12px',
        fontSize: '13px',
        border: '1px dashed #cbd5e1',
        borderRadius: '6px',
        background: 'transparent',
        color: '#6366f1',
        cursor: 'pointer',
        alignSelf: 'flex-start',
    },
};
