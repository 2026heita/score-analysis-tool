export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
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
  version: number;
  rawText: string;
  selectedField: string;
  inputValue: string;
  showAllFields: boolean;
  activeChartTab: string;
  originalFieldRadar: OriginalFieldRadarState;
  /** @deprecated 教育/高考功能已收敛至 legacy 区，仅保留旧数据兼容读取 */
  traditionalSubjectRadar?: TraditionalSubjectRadarState;
  analysisMode: AnalysisMode;
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
