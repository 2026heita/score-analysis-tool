/**
 * AnalysisContextHint - 分析上下文提示组件
 * 
 * 职责：显示当前分析所基于的数据范围和筛选状态
 * 
 * 显示内容：
 * - 原始总行数
 * - 筛选后行数（如有筛选）
 * - 已应用筛选条件数量
 * - 当前分组维度（如有）
 * - 筛选结果为空时警告
 */

export interface AnalysisContextHintProps {
  /** 原始总行数 */
  originalCount: number;
  /** 筛选后行数 */
  filteredCount: number;
  /** 活跃筛选条件数 */
  activeConditions: number;
  /** 当前分组维度（空字符串表示未选择） */
  selectedDimension: string;
  /** 筛选结果是否为空 */
  isFilteredEmpty: boolean;
}

export default function AnalysisContextHint({
  originalCount,
  filteredCount,
  activeConditions,
  selectedDimension,
  isFilteredEmpty,
}: AnalysisContextHintProps) {
  const hasFilters = activeConditions > 0;
  const hasDimension = selectedDimension !== '';

  if (!hasFilters && !hasDimension) {
    return null; // 无筛选、无分组时不显示
  }

  if (isFilteredEmpty) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyHint}>
          当前筛选条件下无匹配记录（{originalCount} 行 → 0 行），已保留原始数据用于分析展示；可调整筛选条件后重新筛选。
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>数据范围</span>
        <span style={styles.value}>
          {hasFilters
            ? `${filteredCount} / ${originalCount} 行`
            : `${originalCount} 行`}
        </span>
      </div>
      {hasFilters && (
        <div style={styles.row}>
          <span style={styles.label}>筛选条件</span>
          <span style={styles.value}>{activeConditions} 个条件</span>
        </div>
      )}
      {hasDimension && (
        <div style={styles.row}>
          <span style={styles.label}>分组维度</span>
          <span style={styles.value}>{selectedDimension}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: '16px',
    padding: '8px 14px',
    background: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #bae6fd',
    marginBottom: '16px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
  },
  label: {
    color: '#64748b',
    fontWeight: 500,
  },
  value: {
    color: '#0c4a6e',
    fontWeight: 600,
  },
  emptyHint: {
    color: '#991b1b',
    fontSize: '13px',
    fontWeight: 500,
    width: '100%',
  },
};