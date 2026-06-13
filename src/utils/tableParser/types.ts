// ============================================================
// 成绩表智能解析器 - 类型定义
// ============================================================

/**
 * parseNumericValue 的返回值
 */
export type ParsedNumber =
  | { status: 'valid'; value: number }
  | { status: 'empty' }
  | { status: 'invalid' };

/**
 * 字段分类类型
 */
export type FieldType =
  | 'identity'   // 学校代码、学校名称、姓名、班级、考号、座号
  | 'score'      // 总分、语文、数学、英语、外语、物理、化学、生物、政治、历史、地理
  | 'rank'       // 名次、排名、位次
  | 'bonus'      // 加分、区内加分、区外加分、政策加分
  | 'penalty'    // 扣分
  | 'category'   // 组合、组合简称、科类、选科、类别
  | 'status'     // 缺考、弃考、转班、转到、无成绩等
  | 'text'       // 大部分是文本且不适合统计
  | 'unknown';   // 无法识别

/**
 * 字段分析价值分层（比 FieldType 更精细，用于下拉框过滤和推荐）
 */
export type AnalysisRole =
  | 'primaryTotal'   // 总分、总成绩、综合成绩、总评、最终成绩
  | 'rank'           // 排名、名次、位次
  | 'sectionTotal'   // 合计、总计、小计、模块合计
  | 'courseScore'    // 具体课程成绩
  | 'adjustment'     // 加分、扣分、政策加分、奖励分、惩罚分
  | 'identity'       // 姓名、学号、班级、考号、学校代码
  | 'textMeta'       // 签名、备注、说明、状态、组合、类别
  | 'unknown'        // 未知字段
  | 'invalid';       // 未命名字段、非法字段名

/**
 * 字段内容特征（用于辅助分类）
 */
export interface ContentFeature {
  numericRatio: number;      // 数值比例 (0-1)
  integerRatio: number;      // 整数比例 (0-1)，基于有效数值
  decimalRatio: number;      // 小数比例 (0-1)，基于有效数值
  uniqueRatio: number;       // 唯一值比例 (0-1)
  min: number | null;        // 最小值
  max: number | null;        // 最大值
  mean: number | null;       // 平均值
  avgStringLength: number;   // 平均字符串长度
  valuePattern: 'chineseName' | 'longNumber' | 'classLabel' | 'rankLike' | 'scoreLike' | 'mixed' | 'unknown';
}

/**
 * 字段元数据
 */
export interface FieldMeta {
  header: string;
  type: FieldType;
  /** 分析价值分层（用于下拉框过滤和推荐优先级） */
  analysisRole: AnalysisRole;
  validCount: number;       // 有效数值数量
  emptyCount: number;       // 空值数量
  invalidCount: number;     // 无效值（缺考等）数量
  textCount: number;        // 纯文本数量
  confidence: number;       // 分类置信度 0-1
  reason: string;           // 分类原因说明
  contentFeature?: ContentFeature;  // 内容特征（可选）
}

/**
 * 数据行分类结果
 */
export type RowType = 'validData' | 'empty' | 'statusOnly' | 'summary' | 'invalid';

/**
 * 数据行元数据
 */
export interface RowMeta {
  index: number;           // 在原始数据中的索引
  type: RowType;
  reason?: string;         // 分类原因
}

/**
 * 工作表候选信息
 */
export interface SheetCandidate {
  name: string;
  rowCount: number;
  colCount: number;
  scoreKeywordsCount: number;   // 成绩相关关键词命中数
  hasIdentityField: boolean;    // 是否包含姓名等身份字段
  hasScoreField: boolean;       // 是否包含成绩字段
  numericColCount: number;      // 数值列数量
  confidence: number;           // 主表置信度
}

/**
 * 表头检测结果
 */
export interface HeaderDetectionResult {
  headerRowIndex: number;
  headers: string[];
  dataRows: unknown[][];
  confidence: number;
  /** 是否为多级表头 */
  isMultiRow?: boolean;
  /** 多级表头的行范围 [startRow, endRow] */
  headerRowRange?: [number, number];
}

/**
 * 解析摘要
 */
export interface ParseSummary {
  sheetName: string;
  fieldCount: number;
  validDataRows: number;
  emptyRows: number;
  statusRows: number;
  summaryRows: number;
  invalidRows: number;
  recommendedField: string | null;
  recommendedFieldPriority?: number;
  fieldTypes: FieldMeta[];
  /** 是否为多级表头 */
  isMultiRow?: boolean;
  /** 多级表头行范围描述，如 "第 2-3 行" */
  headerRowRangeText?: string;
  /** 数据起始行号（人类可读） */
  dataStartRowText?: string;
}

/**
 * 解析结果（增强版）
 */
export interface ParsedTableResult {
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
  summary: ParseSummary | null;
  fieldMetas: FieldMeta[];
  rowMetas: RowMeta[];
  /** 所有可用 sheet 名称（多 sheet 文件用） */
  availableSheets?: string[];
  /** 用于重新解析指定 sheet */
  reparseSheet?: (sheetName: string) => Promise<ParsedTableResult>;
}

/**
 * 工作簿候选信息
 */
export interface WorkbookCandidate {
  sheetName: string;
  rawData: unknown[][];
  merges: import('./headerFlattener').MergeRange[];
  candidate: SheetCandidate;
}
