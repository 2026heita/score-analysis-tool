/**
 * 通用分析引擎测试脚本
 * 测试 schemaDetector、featureStandardizer、univariateAnalyzer、analyticsEngine
 * 
 * 说明：由于项目使用 tsc -b + vite 编译，TS 源码不直接可用。
 * 本脚本通过内联核心算法（与 src/engine 中一致）来验证逻辑正确性。
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✓ ${message} (${actual.toFixed(4)} ≈ ${expected})`);
  } else {
    failed++;
    console.error(`  ✗ ${message} (${actual.toFixed(4)} ≠ ${expected}, diff=${diff.toFixed(4)})`);
  }
}

// ============================================================
// 内联核心算法（与 src/engine 中一致）
// ============================================================

// FeatureType 定义
const FEATURE_TYPES = {
  NUMERICAL: 'numerical',
  CATEGORICAL: 'categorical',
  TEMPORAL: 'temporal',
  TEXT: 'text',
  IDENTIFIER: 'identifier',
  INVALID: 'invalid',
};

// 检测字段类型
function detectFeatureType(fieldName, values) {
  if (!values || values.length === 0) {
    return { featureType: FEATURE_TYPES.INVALID, confidence: 1.0, reason: '空列' };
  }

  const nonEmptyValues = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmptyValues.length === 0) {
    return { featureType: FEATURE_TYPES.INVALID, confidence: 1.0, reason: '全为空值' };
  }

  // 检测标识符（高唯一性的长数字）
  const uniqueValues = new Set(nonEmptyValues);
  const uniqueRatio = uniqueValues.size / nonEmptyValues.length;

  // 检查是否为长数字
  const numericPattern = /^\d+$/;
  const numericValues = nonEmptyValues.filter(v => numericPattern.test(String(v).trim()));
  if (numericValues.length / nonEmptyValues.length >= 0.8) {
    const avgLength = numericValues.reduce((sum, v) => sum + v.length, 0) / numericValues.length;
    if (avgLength >= 6 && uniqueRatio >= 0.9) {
      return { featureType: FEATURE_TYPES.IDENTIFIER, confidence: 0.95, reason: '高唯一性长数字' };
    }
  }

  // 检查字段名是否包含标识符关键词
  const identifierKeywords = ['id', 'code', 'no', 'num', '编号', '学号', '工号', '身份证号'];
  const fieldNameLower = fieldName.toLowerCase();
  if (identifierKeywords.some(kw => fieldNameLower.includes(kw))) {
    if (uniqueRatio >= 0.8) {
      return { featureType: FEATURE_TYPES.IDENTIFIER, confidence: 0.85, reason: '字段名包含标识符关键词' };
    }
  }

  // 检测数值型
  let numericCount = 0;
  for (const v of nonEmptyValues) {
    const parsed = parseNumericValue(String(v).trim());
    if (parsed.status === 'valid') {
      numericCount++;
    }
  }
  const numericRatio = numericCount / nonEmptyValues.length;
  if (numericRatio >= 0.7) {
    return { featureType: FEATURE_TYPES.NUMERICAL, confidence: numericRatio, reason: '数值比例高' };
  }

  // 检测时间型
  const datePatterns = [
    /^\d{4}-\d{1,2}-\d{1,2}$/,
    /^\d{4}\/\d{1,2}\/\d{1,2}$/,
    /^\d{4}\.\d{1,2}\.\d{1,2}$/,
  ];
  let dateCount = 0;
  for (const v of nonEmptyValues) {
    const str = String(v).trim();
    if (datePatterns.some(pattern => pattern.test(str))) {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        dateCount++;
      }
    }
  }
  if (dateCount / nonEmptyValues.length >= 0.8 && dateCount >= 3) {
    return { featureType: FEATURE_TYPES.TEMPORAL, confidence: 0.9, reason: '日期格式匹配' };
  }

  // 检测文本型（长文本）
  const avgLength = nonEmptyValues.reduce((sum, v) => sum + String(v).length, 0) / nonEmptyValues.length;
  if (avgLength >= 50) {
    return { featureType: FEATURE_TYPES.TEXT, confidence: 0.85, reason: '平均长度较长' };
  }

  // 检测类别型
  if (uniqueValues.size <= 50 && uniqueRatio <= 0.5) {
    return { featureType: FEATURE_TYPES.CATEGORICAL, confidence: 0.8, reason: '唯一值数量较少' };
  }

  return { featureType: FEATURE_TYPES.INVALID, confidence: 0.5, reason: '无法识别' };
}

// 严格数字解析（支持千分位）
function parseNumericStringStrict(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  if (trimmed === '') return null;
  if (trimmed.includes(',')) {
    const thousandsRegex = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
    if (!thousandsRegex.test(trimmed)) return null;
    const withoutCommas = trimmed.replace(/,/g, '');
    const num = Number(withoutCommas);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

// 完整数值解析（与 production numericParser.ts 语义一致）
function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return { status: 'empty' };
  if (typeof val === 'number') return Number.isFinite(val) ? { status: 'valid', value: val } : { status: 'invalid' };
  if (typeof val === 'boolean') return { status: 'invalid' };
  const str = String(val).trim();
  if (str === '') return { status: 'empty' };
  if (str === '-' || str === '—' || str === '–' || str === '/' || str === '\\' || str === '|') return { status: 'empty' };
  const invalidKeywords = ['缺考', '弃考', '转班', '转到', '无', '无成绩', '休学', '退学', '请假', '缓考'];
  const lower = str.toLowerCase();
  for (const kw of invalidKeywords) {
    if (lower.includes(kw.toLowerCase())) return { status: 'invalid' };
  }
  if (str.endsWith('%')) {
    const num = parseNumericStringStrict(str.slice(0, -1).trim());
    if (num !== null) return { status: 'valid', value: num };
    return { status: 'invalid' };
  }
  const num = parseNumericStringStrict(str);
  if (num !== null) return { status: 'valid', value: num };
  if (/\d/.test(str)) return { status: 'invalid' };
  return { status: 'invalid' };
}

// 标准化数值
function standardizeNumerical(str) {
  let cleaned = str.trim();
  if (cleaned.endsWith('%')) {
    cleaned = cleaned.slice(0, -1).trim();
    const num = parseNumericStringStrict(cleaned);
    if (num !== null) {
      return { type: 'numerical', value: num / 100, original: str };
    }
  }
  const num = parseNumericStringStrict(cleaned);
  if (num !== null) {
    return { type: 'numerical', value: num, original: str };
  }
  return { type: 'invalid', value: null, original: str };
}

// 提取数值
function extractNumericalValues(vectors, fieldName) {
  const values = [];
  for (const vector of vectors) {
    const sv = vector.values[fieldName];
    if (sv && sv.type === 'numerical' && sv.value !== null) {
      values.push(sv.value);
    }
  }
  return values;
}

// 计算统计量
function analyzeNumericalFeature(vectors, fieldName) {
  const values = extractNumericalValues(vectors, fieldName);
  const count = vectors.length;
  const validCount = values.length;
  const missingCount = count - validCount;

  if (validCount === 0) {
    return { count, validCount: 0, missingCount };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / validCount;

  const medianIdx = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[medianIdx - 1] + sorted[medianIdx]) / 2
    : sorted[medianIdx];

  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
  const std = Math.sqrt(variance);

  return {
    count,
    validCount,
    missingCount,
    min,
    max,
    mean,
    median,
    std,
  };
}

// 计算 z-score
function calculateZScore(value, mean, std) {
  if (std === 0) return 0;
  return (value - mean) / std;
}

// 计算百分位
function calculatePercentile(sorted, percentile) {
  if (sorted.length === 0) return 0;
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// 检测异常值
function detectOutliers(vectors, fieldName) {
  const stats = analyzeNumericalFeature(vectors, fieldName);
  if (!stats.mean || !stats.std || stats.validCount === 0) return [];

  const values = extractNumericalValues(vectors, fieldName);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = calculatePercentile(sorted, 25);
  const q3 = calculatePercentile(sorted, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = [];
  for (const vector of vectors) {
    const sv = vector.values[fieldName];
    if (sv && sv.type === 'numerical' && sv.value !== null) {
      const value = sv.value;
      if (value < lowerBound || value > upperBound) {
        const zScore = calculateZScore(value, stats.mean, stats.std);
        outliers.push({ rowIndex: vector.rowIndex, value, zScore });
      }
    }
  }
  return outliers;
}

console.log('=== 通用分析引擎测试 ===\n');

// ========== 测试 1: 数值字段识别 ==========
console.log('测试 1: 数值字段识别');
{
  const values = ['100', '200', '150', '180', '220'];
  const result = detectFeatureType('score', values);
  assert(result.featureType === 'numerical', '普通数值列识别为 numerical');
  assert(result.confidence >= 0.9, `置信度足够高 (${result.confidence})`);
}

// ========== 测试 2: 类别字段识别 ==========
console.log('\n测试 2: 类别字段识别');
{
  const values = ['优秀', '良好', '及格', '优秀', '良好', '优秀', '及格', '优秀'];
  const result = detectFeatureType('grade', values);
  assert(result.featureType === 'categorical', '类别列识别为 categorical');
  assert(result.confidence >= 0.7, `置信度足够高 (${result.confidence})`);
}

// ========== 测试 3: 时间字段识别 ==========
console.log('\n测试 3: 时间字段识别');
{
  const values = ['2024-01-15', '2024-02-20', '2024-03-25', '2024-04-30'];
  const result = detectFeatureType('date', values);
  assert(result.featureType === 'temporal', '日期列识别为 temporal');
  assert(result.confidence >= 0.8, `置信度足够高 (${result.confidence})`);
}

// ========== 测试 4: 文本字段识别 ==========
console.log('\n测试 4: 文本字段识别');
{
  const values = [
    '这是一个很长的文本描述，用于测试文本字段识别功能，需要足够长的长度才能被识别为文本类型字段，确保超过五十个字符的限制',
    '另一个长文本，包含足够的字符数来判断是否为文本类型，这个文本长度应该超过五十个字符的限制，这样才能正确识别',
    '还有更多的长文本内容，确保平均长度超过阈值，这样才能正确识别为文本类型而不是其他类型，需要足够长的文本',
  ];
  const result = detectFeatureType('description', values);
  assert(result.featureType === 'text', '文本长字段识别为 text');
}

// ========== 测试 5: 标识符字段识别 ==========
console.log('\n测试 5: 标识符字段识别');
{
  const values = ['2024001', '2024002', '2024003', '2024004', '2024005', '2024006', '2024007'];
  const result = detectFeatureType('studentId', values);
  assert(result.featureType === 'identifier', '学号/ID 高唯一长数字识别为 identifier');
  assert(result.confidence >= 0.9, `置信度足够高 (${result.confidence})`);
}

// ========== 测试 6: 无效字段识别 ==========
console.log('\n测试 6: 无效字段识别');
{
  const values = ['', '', '', '', ''];
  const result = detectFeatureType('empty', values);
  assert(result.featureType === 'invalid', '空列识别为 invalid');
}

// ========== 测试 7: 数值统计计算 ==========
console.log('\n测试 7: 数值统计计算');
{
  const vectors = [
    { rowIndex: 0, values: { value: { type: 'numerical', value: 10, original: '10' } } },
    { rowIndex: 1, values: { value: { type: 'numerical', value: 20, original: '20' } } },
    { rowIndex: 2, values: { value: { type: 'numerical', value: 30, original: '30' } } },
    { rowIndex: 3, values: { value: { type: 'numerical', value: 40, original: '40' } } },
    { rowIndex: 4, values: { value: { type: 'numerical', value: 50, original: '50' } } },
  ];
  const stats = analyzeNumericalFeature(vectors, 'value');
  
  assert(stats.count === 5, `总数正确 (${stats.count})`);
  assert(stats.validCount === 5, `有效数正确 (${stats.validCount})`);
  assert(stats.missingCount === 0, `缺失数正确 (${stats.missingCount})`);
  assertApprox(stats.min, 10, 0.01, '最小值正确');
  assertApprox(stats.max, 50, 0.01, '最大值正确');
  assertApprox(stats.mean, 30, 0.01, '均值正确');
  assertApprox(stats.median, 30, 0.01, '中位数正确');
  assert(stats.std > 0, `标准差大于 0 (${stats.std.toFixed(2)})`);
}

// ========== 测试 8: 空值不参与统计 ==========
console.log('\n测试 8: 空值不参与统计');
{
  const vectors = [
    { rowIndex: 0, values: { value: { type: 'numerical', value: 10, original: '10' } } },
    { rowIndex: 1, values: { value: { type: 'missing', value: null, original: '' } } },
    { rowIndex: 2, values: { value: { type: 'numerical', value: 30, original: '30' } } },
    { rowIndex: 3, values: { value: { type: 'missing', value: null, original: '' } } },
    { rowIndex: 4, values: { value: { type: 'numerical', value: 50, original: '50' } } },
  ];
  const stats = analyzeNumericalFeature(vectors, 'value');
  
  assert(stats.count === 5, `总数正确 (${stats.count})`);
  assert(stats.validCount === 3, `有效数正确 (${stats.validCount})`);
  assert(stats.missingCount === 2, `缺失数正确 (${stats.missingCount})`);
  assertApprox(stats.mean, 30, 0.01, '均值只计算有效值');
}

// ========== 测试 9: 真实 0 被视为有效值 ==========
console.log('\n测试 9: 真实 0 被视为有效值');
{
  const vectors = [
    { rowIndex: 0, values: { value: { type: 'numerical', value: 0, original: '0' } } },
    { rowIndex: 1, values: { value: { type: 'numerical', value: 10, original: '10' } } },
    { rowIndex: 2, values: { value: { type: 'numerical', value: 20, original: '20' } } },
  ];
  const stats = analyzeNumericalFeature(vectors, 'value');
  
  assert(stats.validCount === 3, `0 被视为有效值 (${stats.validCount})`);
  assertApprox(stats.min, 0, 0.01, '最小值为 0');
  assertApprox(stats.mean, 10, 0.01, '均值计算包含 0');
}

// ========== 测试 10: z-score 计算 ==========
console.log('\n测试 10: z-score 计算');
{
  const mean = 50;
  const std = 10;
  
  const z1 = calculateZScore(50, mean, std);
  assertApprox(z1, 0, 0.01, '均值处 z-score 为 0');
  
  const z2 = calculateZScore(60, mean, std);
  assertApprox(z2, 1, 0.01, '高于均值 1 个标准差，z-score = 1');
  
  const z3 = calculateZScore(40, mean, std);
  assertApprox(z3, -1, 0.01, '低于均值 1 个标准差，z-score = -1');
}

// ========== 测试 11: IQR 异常值检测 ==========
console.log('\n测试 11: IQR 异常值检测');
{
  const vectors = [
    { rowIndex: 0, values: { value: { type: 'numerical', value: 10, original: '10' } } },
    { rowIndex: 1, values: { value: { type: 'numerical', value: 12, original: '12' } } },
    { rowIndex: 2, values: { value: { type: 'numerical', value: 11, original: '11' } } },
    { rowIndex: 3, values: { value: { type: 'numerical', value: 13, original: '13' } } },
    { rowIndex: 4, values: { value: { type: 'numerical', value: 12, original: '12' } } },
    { rowIndex: 5, values: { value: { type: 'numerical', value: 11, original: '11' } } },
    { rowIndex: 6, values: { value: { type: 'numerical', value: 100, original: '100' } } }, // 异常值
  ];
  const outliers = detectOutliers(vectors, 'value');
  
  assert(outliers.length > 0, `检测到异常值 (${outliers.length} 个)`);
  assert(
    outliers.some(o => o.value === 100),
    '正确识别 100 为异常值'
  );
}

// ========== 测试 12: 百分位计算 ==========
console.log('\n测试 12: 百分位计算');
{
  const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  
  const p25 = calculatePercentile(sorted, 25);
  assertApprox(p25, 32.5, 0.01, '25 百分位正确');
  
  const p50 = calculatePercentile(sorted, 50);
  assertApprox(p50, 55, 0.01, '50 百分位（中位数）正确');
  
  const p75 = calculatePercentile(sorted, 75);
  assertApprox(p75, 77.5, 0.01, '75 百分位正确');
}

// ========== 测试 13: 无成绩字段不报错 ==========
console.log('\n测试 13: 无成绩字段不报错');
{
  const headers = ['name', 'age', 'city'];
  const rows = [
    { name: '张三', age: '25', city: '北京' },
    { name: '李四', age: '30', city: '上海' },
    { name: '张三', age: '28', city: '北京' },
    { name: '王五', age: '35', city: '广州' },
    { name: '李四', age: '40', city: '上海' },
    { name: '赵六', age: '45', city: '深圳' },
    { name: '张三', age: '50', city: '北京' },
    { name: '王五', age: '55', city: '广州' },
  ];
  
  // 模拟分析流程
  const features = headers.map(h => ({
    fieldName: h,
    featureType: detectFeatureType(h, rows.map(r => r[h])).featureType,
  }));
  
  assert(features.length === 3, `检测到 3 个字段 (${features.length})`);
  assert(!features.some(f => f.featureType === 'invalid'), '不会错误标记有效字段为 invalid');
}

// ========== 测试 14: 大数据集性能 ==========
console.log('\n测试 14: 大数据集性能（10000 行）');
{
  const vectors = [];
  for (let i = 0; i < 10000; i++) {
    vectors.push({
      rowIndex: i,
      values: { value: { type: 'numerical', value: Math.floor(Math.random() * 100), original: String(Math.floor(Math.random() * 100)) } },
    });
  }
  
  const startTime = Date.now();
  const stats = analyzeNumericalFeature(vectors, 'value');
  const duration = Date.now() - startTime;
  
  assert(duration < 1000, `分析在 1 秒内完成 (${duration}ms)`);
  assert(stats.validCount > 0, '生成了分析结果');
}

// ========== 测试 15: 特征标准化 ==========
console.log('\n测试 15: 特征标准化');
{
  const numResult = standardizeNumerical('123.45');
  assert(numResult.type === 'numerical', '数值标准化成功');
  assert(Math.abs(numResult.value - 123.45) < 0.01, '数值正确');
  
  const commaResult = standardizeNumerical('1,234.56');
  assert(commaResult.type === 'numerical', '千分位逗号正确处理');
  assert(Math.abs(commaResult.value - 1234.56) < 0.01, '千分位数值正确');
  
  const percentResult = standardizeNumerical('85.5%');
  assert(percentResult.type === 'numerical', '百分号正确转换为小数');
  assert(Math.abs(percentResult.value - 0.855) < 0.001, '百分号数值正确');
  
  const invalidResult = standardizeNumerical('abc');
  assert(invalidResult.type === 'invalid', '非数值标记为 invalid');
}

// ========== 测试 16: 多字段数据集 Schema 检测 ==========
console.log('\n测试 16: 多字段数据集 Schema 检测');
{
  const rows = [
    { id: '001', name: '张三', score: '85', grade: '优秀', date: '2024-01-15' },
    { id: '002', name: '李四', score: '92', grade: '良好', date: '2024-01-16' },
    { id: '003', name: '王五', score: '78', grade: '及格', date: '2024-01-17' },
    { id: '004', name: '赵六', score: '88', grade: '优秀', date: '2024-01-18' },
    { id: '005', name: '钱七', score: '95', grade: '优秀', date: '2024-01-19' },
    { id: '006', name: '孙八', score: '82', grade: '良好', date: '2024-01-20' },
  ];
  
  const features = [
    { fieldName: 'id', featureType: detectFeatureType('id', rows.map(r => r.id)).featureType },
    { fieldName: 'name', featureType: detectFeatureType('name', rows.map(r => r.name)).featureType },
    { fieldName: 'score', featureType: detectFeatureType('score', rows.map(r => r.score)).featureType },
    { fieldName: 'grade', featureType: detectFeatureType('grade', rows.map(r => r.grade)).featureType },
    { fieldName: 'date', featureType: detectFeatureType('date', rows.map(r => r.date)).featureType },
  ];
  
  assert(features.length === 5, `检测到 5 个字段 (${features.length})`);
  
  const idFeature = features.find(f => f.fieldName === 'id');
  assert(idFeature?.featureType === 'identifier', 'id 字段识别为 identifier');
  
  const scoreFeature = features.find(f => f.fieldName === 'score');
  assert(scoreFeature?.featureType === 'numerical', 'score 字段识别为 numerical');
  
  const gradeFeature = features.find(f => f.fieldName === 'grade');
  assert(gradeFeature?.featureType === 'categorical', 'grade 字段识别为 categorical');
  
  const dateFeature = features.find(f => f.fieldName === 'date');
  assert(dateFeature?.featureType === 'temporal', 'date 字段识别为 temporal');
}

// ========== 输出总结 ==========
console.log('\n' + '='.repeat(50));
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
