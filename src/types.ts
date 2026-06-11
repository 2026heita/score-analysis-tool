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

export interface TraditionalSubjectEntry {
  name: string;
  score: number;
  maxScore: number;
}

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
  traditionalSubjectRadar: TraditionalSubjectRadarState;
  analysisMode: AnalysisMode;
}
