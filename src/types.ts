import type { FilterCondition } from './engine/filterRows';

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
  /** Stage 0A-1: 数据量状态（记录解析阶段的行数口径信息） */
  dataVolumeState?: DataVolumeState;
}

export interface StatsResult {
  count: number;
  validCount: number;
  invalidCount: number;
  max: number;
  min: number;
  mean: number;
  median: number;
  q25: number;
  q75: number;
  q90: number;
  q95: number;
}

export interface PositionResult {
  total: number;
  higherCount: number;
  equalCount: number;
  lowerCount: number;
  bestRank: number;
  worstRank: number;
  estimatedRank: number;
  percentile: number;
  existsInData: boolean;
}

export type ChartTab = 'histogram' | 'boxplot' | 'cdf' | 'quartile';

export type ViewMode = 'bar' | 'radar';

export type AnalysisMode = 'scoreRate' | 'percentile' | 'zScore';

export interface OriginalFieldRadarState {
  selections: { field: string; userValue: number }[];
  viewMode: ViewMode;
}

/** @deprecated 教育/高考功能已收敛至 legacy 区 */
export interface TraditionalSubjectEntry {
  name: string;
  score: number;
  maxScore: number;
}

/** @deprecated 教育/高考功能已收敛至 legacy 区 */
export interface TraditionalSubjectRadarState {
  entries: TraditionalSubjectEntry[];
}

export interface SavedState {
  /** 持久化版本号，由 saveState() 统一注入，调用方无需手动设置 */
  version?: number;
  rawText: string;
  selectedField: string;
  inputValue: string;
  showAllFields: boolean;
  activeChartTab: string;
  originalFieldRadar: OriginalFieldRadarState;
  /** @deprecated 教育/高考功能已收敛至 legacy 区，仅保留旧数据兼容读取 */
  traditionalSubjectRadar?: TraditionalSubjectRadarState;
  analysisMode: AnalysisMode;
  /** v1.3 新增：筛选条件 */
  filterConditions?: FilterCondition[];
  /** v1.3 新增：分组维度 */
  selectedDimension?: string;
}

// 分析解释类型定义
export type PerformanceTier = 'top10' | 'top25' | 'middle' | 'bottom25' | 'bottom10';

export interface FieldExplanation {
  field: string;
  userValue: number;
  mean: number;
  lowerCount: number;
  percentile: number;
  tier: PerformanceTier;
  tierLabel: string;
  diffFromMean: number;
  diffFromP75: number;
  diffFromP90: number;
  diffFromP95: number;
  validCount: number;
}

export interface MultiFieldSummary {
  top3Fields: { field: string; percentile: number }[];
  bottom3Fields: { field: string; percentile: number }[];
  averagePercentile: number;
  fieldCount: number;
  insufficientData: boolean;
}

export interface AnalysisExplanation {
  fieldExplanations: FieldExplanation[];
  multiFieldSummary: MultiFieldSummary;
}

/**
 * 数据量状态 - 记录解析阶段的数据量信息
 *
 * 行数口径定义（九类）：
 * 1. physicalRowCount  - 工作表物理总行数（原始二维数组长度）
 * 2. headerRowCount    - 表头占用行数（1 或更多，支持多级表头）
 * 3. rawRowCount       - 原始数据行数 = physicalRowCount - headerRowCount
 * 4. parsedRowCount    - 解析器实际处理的数据行数（≤ 20000，受解析上限截断）
 * 5. validRowCount     - 解析后有效数据行数（排除空行、状态行、汇总行、无效行）
 * 6. emptyRowCount     - 空行数（由行分类器统计）
 * 7. statusRowCount    - 仅状态行数（如"缺考"、"弃考"等，由行分类器统计）
 * 8. summaryRowCount   - 汇总行数（由行分类器统计）
 * 9. invalidRowCount   - 无效行数（由行分类器统计）
 * 
 * 数据量公式：
 * - physicalRowCount = headerRowCount + rawRowCount
 * - parsedRowCount = min(rawRowCount, 20000)
 * - parsedRowCount = validRowCount + emptyRowCount + statusRowCount + summaryRowCount + invalidRowCount
 */
export interface DataVolumeState {
  /** 1. 工作表物理总行数（rawData.length，截断前） */
  physicalRowCount: number;

  /** 2. 表头占用行数（detection.headerRowIndex + 1） */
  headerRowCount: number;

  /** 3. 原始数据行数 = physicalRowCount - headerRowCount */
  rawRowCount: number;

  /** 4. 解析器实际处理的数据行数 = min(rawRowCount, 20000) 截断后 */
  parsedRowCount: number;

  /** 5. 解析后有效数据行数（排除空行、状态行、汇总行、无效行） */
  validRowCount: number;

  /** 6. 空行数（由行分类器统计） */
  emptyRowCount: number;

  /** 7. 仅状态行数（如"缺考"、"弃考"等，由行分类器统计） */
  statusRowCount: number;

  /** 8. 汇总行数（由行分类器统计） */
  summaryRowCount: number;

  /** 9. 无效行数（由行分类器统计） */
  invalidRowCount: number;

  /** 是否发生解析阶段截断（rawRowCount > 20000） */
  isParseTruncated: boolean;

  /** 解析截断警告（如果发生截断） */
  parseTruncationWarning?: string;
}
