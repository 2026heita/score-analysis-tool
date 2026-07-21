/**
 * 相关性分析器
 * 职责：计算数值字段之间的 Pearson 相关系数
 * 轻量版本：仅做 Pearson，不做 Spearman / PCA / 聚类
 */

import type { FeatureSchema } from './types';
import type { FieldMeta, AnalysisRole } from '../utils/tableParser/types';
import type { DerivedDataContext } from './context';

// 一对字段的相关性结果
export interface CorrelationPair {
  fieldA: string;
  fieldB: string;
  pearson: number;        // Pearson 相关系数 -1 ~ 1
  validCount: number;     // 有效配对数量（两字段都有值的行）
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'positive' | 'negative' | 'none';
}

// 相关性分析总结果
export interface CorrelationResult {
  numericalFields: string[];               // 参与分析的数值字段
  totalPairs: number;                      // 可计算的关系对数量
  matrix: Record<string, Record<string, number>>; // 完整相关矩阵
  topPositive: CorrelationPair[];          // 最高正相关 Top N
  topNegative: CorrelationPair[];          // 最高负相关 Top N
  weakCorrelations: CorrelationPair[];     // 低相关字段对
  warnings: string[];
}

// 配置
interface CorrelationConfig {
  topN?: number;           // 展示前 N 对（默认 5）
  minValidCount?: number;  // 最少有效配对行数（默认 5）
  strongThreshold?: number;  // 强相关阈值（默认 0.7）
  moderateThreshold?: number; // 中等相关阈值（默认 0.3）
}

const DEFAULT_CONFIG: CorrelationConfig = {
  topN: 5,
  minValidCount: 5,
  strongThreshold: 0.7,
  moderateThreshold: 0.3,
};

// 必须排除的 AnalysisRole
const EXCLUDED_ROLES: AnalysisRole[] = [
  'identity',
  'adjustment',
  'textMeta',
  'invalid',
];

/**
 * 判断字段是否可参与相关性分析
 * 必须同时满足：
 * 1. featureType === 'numerical'
 * 2. analysisRole 不是 identity/adjustment/textMeta/invalid
 * 3. 不是高唯一性长数字 ID
 */
function isAnalyzableNumericField(
  feature: FeatureSchema,
  fieldMeta?: FieldMeta
): boolean {
  // 必须是数值型
  if (feature.featureType !== 'numerical') return false;

  // 如果有 FieldMeta，检查 analysisRole
  if (fieldMeta) {
    const role = fieldMeta.analysisRole;
    // 排除明确不允许的角色
    if (EXCLUDED_ROLES.includes(role)) return false;
    // unknown 角色不参与自动分析（只能手动选择）
    if (role === 'unknown') return false;
    // 允许的角色：primaryTotal/sectionTotal/courseScore/rank，或数值型但无明确角色
  }

  return true;
}

/**
 * 检测是否为高唯一性长数字 ID 字段
 * 例如：学号、订单号、用户ID、商品ID、地区编码
 */
function isHighUniqueLongNumberId(
  header: string,
  values: (number | null)[],
  fieldMeta?: FieldMeta
): boolean {
  // 检查字段名关键词
  const idKeywords = ['学号', '考号', '考生号', '准考证', '身份证号', '编号', 'ID', 'id', '订单', '用户', '商品', '编码'];
  const headerLower = header.toLowerCase();
  if (idKeywords.some(kw => headerLower.includes(kw.toLowerCase()))) {
    return true;
  }

  // 检查 contentFeature
  if (fieldMeta?.contentFeature) {
    const cf = fieldMeta.contentFeature;
    // 高唯一性（> 95%）且是长数字模式
    if (cf.uniqueRatio > 0.95 && cf.valuePattern === 'longNumber') {
      return true;
    }
  }

  // 检查实际数据：唯一值比例 > 95% 且数值范围很大
  const validValues = values.filter(v => v !== null) as number[];
  if (validValues.length >= 10) {
    const uniqueCount = new Set(validValues).size;
    const uniqueRatio = uniqueCount / validValues.length;
    const maxVal = Math.max(...validValues);
    // 唯一性 > 95% 且最大值 > 10000（可能是 ID）
    if (uniqueRatio > 0.95 && maxVal > 10000) {
      return true;
    }
  }

  return false;
}

/**
 * 检测是否为常量列（所有有效值相同）
 */
function isConstantColumn(values: (number | null)[]): boolean {
  const validValues = values.filter(v => v !== null) as number[];
  if (validValues.length < 2) return true;
  const first = validValues[0];
  return validValues.every(v => v === first);
}

/**
 * 计算两个等长数组的 Pearson 相关系数
 * 只使用两个数组都有有效值的配对行
 */
function pearsonCorrelation(x: (number | null)[], y: (number | null)[]): { r: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { r: 0, n };

  // 配对有效值
  const pairsX: number[] = [];
  const pairsY: number[] = [];
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (xi !== null && yi !== null && Number.isFinite(xi) && Number.isFinite(yi)) {
      pairsX.push(xi);
      pairsY.push(yi);
    }
  }

  const count = pairsX.length;
  if (count < 2) return { r: 0, n: count };

  // 计算均值
  let sumX = 0, sumY = 0;
  for (let i = 0; i < count; i++) {
    sumX += pairsX[i];
    sumY += pairsY[i];
  }
  const meanX = sumX / count;
  const meanY = sumY / count;

  // 计算 Pearson
  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < count; i++) {
    const dx = pairsX[i] - meanX;
    const dy = pairsY[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator === 0) return { r: 0, n: count };

  const r = sumXY / denominator;
  return { r: Math.max(-1, Math.min(1, r)), n: count };
}

/**
 * 从原始行数据中提取数值字段的列向量
 * 自动跳过非数值字段和空值
 */
function extractColumnVectors(
  _headers: string[],
  rows: Array<Record<string, string>>,
  numericalFields: string[]
): Record<string, (number | null)[]> {
  const columns: Record<string, (number | null)[]> = {};

  // Stage 0A-2: 不再截断，数据已在入口统一抽样

  for (const field of numericalFields) {
    columns[field] = rows.map(row => {
      const raw = row[field];
      if (raw === undefined || raw === null || raw.trim() === '') return null;
      const num = parseFloat(raw.replace(/,/g, ''));
      return isNaN(num) || !isFinite(num) ? null : num;
    });
  }

  return columns;
}

/**
 * 对字段强度分类
 */
function classifyStrength(
  absR: number,
  strongThreshold: number,
  moderateThreshold: number
): 'strong' | 'moderate' | 'weak' {
  if (absR >= strongThreshold) return 'strong';
  if (absR >= moderateThreshold) return 'moderate';
  return 'weak';
}

function classifyDirection(r: number): 'positive' | 'negative' | 'none' {
  if (r > 0.01) return 'positive';
  if (r < -0.01) return 'negative';
  return 'none';
}

/**
 * 主入口：分析所有数值字段之间的相关性
 * @param fieldMetas 可选的字段元数据，用于更精确的字段过滤
 */
export function analyzeCorrelations(
  headers: string[],
  rows: Array<Record<string, string>>,
  features: FeatureSchema[],
  config: CorrelationConfig = {},
  fieldMetas?: FieldMeta[]
): CorrelationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];

  // 构建 FieldMeta 查找表
  const fieldMetaMap = new Map<string, FieldMeta>();
  if (fieldMetas) {
    for (const meta of fieldMetas) {
      fieldMetaMap.set(meta.header, meta);
    }
  }

  // 1. 筛选可分析的数值字段（显式排除 identity/adjustment/textMeta/invalid/unknown）
  const candidateFields = features
    .filter(f => {
      const meta = fieldMetaMap.get(f.fieldName);
      return isAnalyzableNumericField(f, meta);
    })
    .map(f => f.fieldName);

  // 2. 提取列向量
  const columns = extractColumnVectors(headers, rows, candidateFields);

  // 3. 进一步过滤：排除高唯一性 ID 和常量列
  const numericalFields: string[] = [];
  const skippedFields: { field: string; reason: string }[] = [];

  for (const field of candidateFields) {
    const col = columns[field];
    const meta = fieldMetaMap.get(field);

    // 检查是否为高唯一性 ID
    if (isHighUniqueLongNumberId(field, col, meta)) {
      skippedFields.push({ field, reason: 'high-unique-id' });
      continue;
    }

    // 检查是否为常量列
    if (isConstantColumn(col)) {
      skippedFields.push({ field, reason: 'constant' });
      continue;
    }

    numericalFields.push(field);
  }

  if (numericalFields.length < 2) {
    return {
      numericalFields,
      totalPairs: 0,
      matrix: {},
      topPositive: [],
      topNegative: [],
      weakCorrelations: [],
      warnings: ['可分析的数值字段不足 2 个，无法计算相关性。'],
    };
  }

  // 3. 计算所有字段对的 Pearson
  const matrix: Record<string, Record<string, number>> = {};
  const allPairs: CorrelationPair[] = [];

  for (const field of numericalFields) {
    matrix[field] = {};
  }

  for (let i = 0; i < numericalFields.length; i++) {
    for (let j = i + 1; j < numericalFields.length; j++) {
      const fieldA = numericalFields[i];
      const fieldB = numericalFields[j];

      const colA = columns[fieldA];
      const colB = columns[fieldB];

      const { r, n } = pearsonCorrelation(colA, colB);

      // 写入矩阵（对称）
      matrix[fieldA][fieldB] = roundTo(r, 4);
      matrix[fieldB][fieldA] = roundTo(r, 4);

      if (n >= cfg.minValidCount!) {
        const absR = Math.abs(r);
        allPairs.push({
          fieldA,
          fieldB,
          pearson: roundTo(r, 4),
          validCount: n,
          strength: classifyStrength(absR, cfg.strongThreshold!, cfg.moderateThreshold!),
          direction: classifyDirection(r),
        });
      }
    }
  }

  // 对角线
  for (const field of numericalFields) {
    matrix[field][field] = 1;
  }

  // 4. 排序提取 Top N
  const sortedByCorr = [...allPairs].sort((a, b) => b.pearson - a.pearson);
  const topPositive = sortedByCorr
    .filter(p => p.pearson > 0)
    .slice(0, cfg.topN);

  const sortedByNeg = [...allPairs].sort((a, b) => a.pearson - b.pearson);
  const topNegative = sortedByNeg
    .filter(p => p.pearson < 0)
    .slice(0, cfg.topN);

  // 5. 低相关字段对
  const weakCorrelations = allPairs
    .filter(p => p.strength === 'weak')
    .sort((a, b) => Math.abs(a.pearson) - Math.abs(b.pearson))
    .slice(0, cfg.topN);

  // 6. 数据量警告
  if (rows.length < cfg.minValidCount!) {
    warnings.push(`数据行数较少（${rows.length} 行），相关性结果可能不稳定。`);
  }

  // 7. 跳过字段警告
  if (skippedFields.length > 0) {
    const idSkipped = skippedFields.filter(s => s.reason === 'high-unique-id');
    const constSkipped = skippedFields.filter(s => s.reason === 'constant');
    if (idSkipped.length > 0) {
      warnings.push(`已排除 ${idSkipped.length} 个标识符字段（如学号、ID等）。`);
    }
    if (constSkipped.length > 0) {
      warnings.push(`已排除 ${constSkipped.length} 个常量字段。`);
    }
  }

  return {
    numericalFields,
    totalPairs: allPairs.length,
    matrix,
    topPositive,
    topNegative,
    weakCorrelations,
    warnings,
  };
}

/**
 * 基于 DerivedDataContext 的相关性分析（统一入口）
 * 
 * v1.4 Phase 4：fields 和 metrics 不再由 DerivedDataContext 携带，
 * 由 View 层作为独立参数传入。
 * 
 * @param context 派生数据上下文（filteredRows）
 * @param fields 字段元数据数组
 * @param metrics 指标定义数组
 * @param config 配置
 * @returns 相关性分析结果
 */
export function analyzeCorrelationsFromContext(
  context: DerivedDataContext,
  fields: FieldMeta[],
  metrics: import('./metricLayer').MetricDefinition[],
  config: CorrelationConfig = {}
): CorrelationResult {
  // 1. 从 context 提取 headers 和 rows
  const headers = fields.map(f => f.header);
  const rows = context.filteredRows;
  
  // 2. 从 metrics 构建 FeatureSchema 数组
  // 只包含可分析的指标（排除 adjustment）
  const features: FeatureSchema[] = metrics
    .filter(m => m.isRecommended)
    .map(m => ({
      fieldName: m.sourceField,
      displayName: m.displayName,
      featureType: 'numerical' as const,
      confidence: 1.0,
      reason: `从 metricLayer 派生，direction=${m.direction}`,
    }));
  
  // 3. 调用原有的分析函数
  return analyzeCorrelations(headers, rows, features, config, fields);
}

/**
 * 简化版：直接从 headers + rows 分析（不需要预先计算 features）
 * 内部自动判断哪些字段是数值字段，并应用 ID 字段过滤
 */
export function analyzeCorrelationsSimple(
  headers: string[],
  rows: Array<Record<string, string>>,
  config: CorrelationConfig = {}
): CorrelationResult {
  // ID 字段关键词（用于简单版过滤）
  const idKeywords = ['学号', '考号', '考生号', '准考证', '身份证号', '编号', 'ID', 'id', '订单', '用户', '商品', '编码'];
  
  // 快速判断数值字段：数值比例 >= 70%，且排除 ID 字段
  const numericalFields: string[] = [];
  for (const header of headers) {
    // 先检查是否为 ID 字段关键词
    const headerLower = header.toLowerCase();
    if (idKeywords.some(kw => headerLower.includes(kw.toLowerCase()))) {
      continue; // 跳过 ID 字段
    }
    
    let numCount = 0;
    let total = 0;
    for (const row of rows) {
      const raw = row[header];
      if (raw === undefined || raw === null || raw.trim() === '') continue;
      total++;
      const num = parseFloat(raw.replace(/,/g, ''));
      if (!isNaN(num) && isFinite(num)) numCount++;
    }
    if (total > 0 && numCount / total >= 0.7) {
      numericalFields.push(header);
    }
  }

  // 构造最小 features
  const features: FeatureSchema[] = numericalFields.map(h => ({
    fieldName: h,
    displayName: h,
    featureType: 'numerical' as const,
    confidence: 0.9,
    reason: 'auto-detected',
  }));

  return analyzeCorrelations(headers, rows, features, config);
}

function roundTo(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}
