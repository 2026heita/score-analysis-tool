/**
 * FilterPanel - 数据筛选面板组件
 * 
 * 职责：提供多条件 AND 筛选 UI
 * 
 * 设计原则：
 * 1. 文本字段：等于、包含、不包含、为空、非空
 * 2. 数值字段：大于、小于、大于等于、小于等于、介于、等于、为空、非空
 * 3. 支持添加/删除多个条件
 * 4. 显示筛选摘要
 */

import type { FilterCondition, TextOperator, NumericOperator, FilterSummary } from '../engine/filterRows';
import HelpPopover from './help/HelpPopover';
import { getHelp } from '../data/helpContent';

interface FilterPanelProps {
  /** 所有字段名 */
  headers: string[];
  /** 数值字段名集合 */
  numericFields: Set<string>;
  /** 当前筛选条件 */
  conditions: FilterCondition[];
  /** 条件变更回调 */
  onConditionsChange: (conditions: FilterCondition[]) => void;
  /** 筛选摘要（null 表示无活跃条件） */
  filterSummary: FilterSummary | null;
  /** 是否折叠 */
  collapsed: boolean;
  /** 折叠切换回调 */
  onToggleCollapse: () => void;
}

const TEXT_OPERATORS: { value: TextOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'isEmpty', label: '为空' },
  { value: 'isNotEmpty', label: '非空' },
];

const NUMERIC_OPERATORS: { value: NumericOperator; label: string }[] = [
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

function createEmptyCondition(): FilterCondition {
  return { field: '', operator: 'equals', value: '' };
}

export default function FilterPanel({
  headers,
  numericFields,
  conditions,
  onConditionsChange,
  filterSummary,
  collapsed,
  onToggleCollapse,
}: FilterPanelProps) {
  const hasActiveConditions = filterSummary && filterSummary.activeConditions > 0;

  const handleAdd = () => {
    onConditionsChange([...conditions, createEmptyCondition()]);
  };

  const handleRemove = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    onConditionsChange(next.length === 0 ? [createEmptyCondition()] : next);
  };

  const handleFieldChange = (index: number, field: string) => {
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

  const handleOperatorChange = (index: number, operator: string) => {
    const next = [...conditions];
    next[index] = {
      ...next[index],
      operator: operator as TextOperator | NumericOperator,
      value: '',
      betweenMin: undefined,
      betweenMax: undefined,
    };
    onConditionsChange(next);
  };

  const handleValueChange = (index: number, value: string) => {
    const next = [...conditions];
    next[index] = { ...next[index], value };
    onConditionsChange(next);
  };

  const handleBetweenMinChange = (index: number, value: string) => {
    const next = [...conditions];
    next[index] = { ...next[index], betweenMin: value };
    onConditionsChange(next);
  };

  const handleBetweenMaxChange = (index: number, value: string) => {
    const next = [...conditions];
    next[index] = { ...next[index], betweenMax: value };
    onConditionsChange(next);
  };

  const getOperators = (field: string) => {
    if (!field) return [];
    return numericFields.has(field) ? NUMERIC_OPERATORS : TEXT_OPERATORS;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={onToggleCollapse}>
        <span style={styles.arrow}>{collapsed ? '▶' : '▼'}</span>
        <span style={styles.headerTitle}>数据筛选</span>
        <HelpPopover content={getHelp('filter')} />
        {hasActiveConditions && (
          <span style={styles.badge}>
            {filterSummary.activeConditions} 个条件 · {filterSummary.filteredCount} / {filterSummary.originalCount} 行
            {filterSummary.filterRatio > 0 && ` (过滤 ${(filterSummary.filterRatio * 100).toFixed(1)}%)`}
          </span>
        )}
      </div>

      {!collapsed && (
        <div style={styles.body}>
          {conditions.map((cond, i) => {
            const operators = getOperators(cond.field);
            const needsValue = cond.operator && !VALULESS_OPERATORS.has(cond.operator);

            return (
              <div key={i} style={styles.row}>
                <span style={styles.selectWrap}>
                <select
                  style={styles.select}
                  value={cond.field}
                  onChange={e => handleFieldChange(i, e.target.value)}
                >
                  <option value="">选择字段</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <HelpPopover content={getHelp('filter_field')} />
                </span>

                <span style={styles.selectWrap}>
                <select
                  style={styles.select}
                  value={cond.operator}
                  onChange={e => handleOperatorChange(i, e.target.value)}
                  disabled={!cond.field}
                >
                  <option value="">选择条件</option>
                  {operators.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <HelpPopover content={getHelp('filter_condition')} />
                </span>

                {cond.operator === 'between' ? (
                  <span style={styles.selectWrap}>
                  <div style={styles.betweenGroup}>
                    <input
                      style={styles.betweenInput}
                      type="text"
                      value={cond.betweenMin ?? ''}
                      onChange={e => handleBetweenMinChange(i, e.target.value)}
                      placeholder="最小值"
                      aria-label="最小值"
                    />
                    <span style={styles.betweenSeparator}>~</span>
                    <input
                      style={styles.betweenInput}
                      type="text"
                      value={cond.betweenMax ?? ''}
                      onChange={e => handleBetweenMaxChange(i, e.target.value)}
                      placeholder="最大值"
                      aria-label="最大值"
                    />
                  </div>
                  <HelpPopover content={getHelp('filter_value')} />
                  </span>
                ) : needsValue && (
                  <span style={styles.selectWrap}>
                  <input
                    style={styles.input}
                    type="text"
                    value={cond.value}
                    onChange={e => handleValueChange(i, e.target.value)}
                    placeholder="输入筛选值"
                  />
                  <HelpPopover content={getHelp('filter_value')} />
                  </span>
                )}

                <button
                  style={styles.removeBtn}
                  onClick={() => handleRemove(i)}
                  title="删除条件"
                >
                  ✕
                </button>
              </div>
            );
          })}

          <button style={styles.addBtn} onClick={handleAdd}>
            + 添加条件
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  selectWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
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
  betweenGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: '120px',
  },
  betweenInput: {
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    background: '#fff',
    color: '#334155',
    minWidth: '0',
    flex: 1,
    outline: 'none',
  },
  betweenSeparator: {
    fontSize: '13px',
    color: '#94a3b8',
    flexShrink: 0,
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