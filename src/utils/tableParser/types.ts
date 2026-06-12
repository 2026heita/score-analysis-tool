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
 * 字段元数据
 */
export interface FieldMeta {
  header: string;
  type: FieldType;
  validCount: number;       // 有效数值数量
  emptyCount: number;       // 空值数量
  invalidCount: number;     // 无效值（缺考等）数量
  textCount: number;        // 纯文本数量
  confidence: number;       // 分类置信度 0-1
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
  candidate: SheetCandidate;
}
