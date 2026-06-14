/**
 * 通用数据概览面板测试脚本
 * 验证 GeneralDataOverview 组件的核心功能
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

// ============================================================
// 内联核心算法（与 src/engine 中一致）
// ============================================================

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
    const str = String(v).trim();
    const cleaned = str.replace(/,/g, '').replace(/%$/, '');
    const num = Number(cleaned);
    if (!isNaN(num) && isFinite(num)) {
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

// 检测数据集 Schema
function detectDatasetSchema(headers, rows) {
  if (!headers || headers.length === 0) {
    return [];
  }

  const maxRows = Math.min(rows.length, 5000);
  const limitedRows = rows.slice(0, maxRows);

  return headers.map(fieldName => {
    const values = limitedRows.map(row => row[fieldName]);
    const detection = detectFeatureType(fieldName, values);
    return {
      fieldName,
      displayName: fieldName,
      featureType: detection.featureType,
      confidence: detection.confidence,
      reason: detection.reason,
    };
  });
}

// 标准化数值
function standardizeNumerical(str) {
  let cleaned = str.trim().replace(/,/g, '');
  if (cleaned.endsWith('%')) {
    cleaned = cleaned.slice(0, -1);
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num)) {
      return { type: 'numerical', value: num / 100, original: str };
    }
  }
  const num = parseFloat(cleaned);
  if (!isNaN(num) && isFinite(num)) {
    return { type: 'numerical', value: num, original: str };
  }
  return { type: 'invalid', value: null, original: str };
}

// 标准化数据集
function standardizeDataset(rows, features) {
  const maxRows = Math.min(rows.length, 5000);
  const limitedRows = rows.slice(0, maxRows);

  return limitedRows.map((row, rowIndex) => {
    const values = {};
    for (const feature of features) {
      const rawValue = row[feature.fieldName];
      if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
        values[feature.fieldName] = { type: 'missing', value: null, original: '' };
      } else if (feature.featureType === FEATURE_TYPES.NUMERICAL) {
        values[feature.fieldName] = standardizeNumerical(String(rawValue));
      } else if (feature.featureType === FEATURE_TYPES.CATEGORICAL) {
        values[feature.fieldName] = { type: 'categorical', value: String(rawValue), original: String(rawValue) };
      } else if (feature.featureType === FEATURE_TYPES.TEMPORAL) {
        const date = new Date(rawValue);
        if (!isNaN(date.getTime())) {
          values[feature.fieldName] = { type: 'temporal', value: date.getTime(), original: String(rawValue) };
        } else {
          values[feature.fieldName] = { type: 'invalid', value: null, original: String(rawValue) };
        }
      } else {
        values[feature.fieldName] = { type: feature.featureType, value: String(rawValue), original: String(rawValue) };
      }
    }
    return { rowIndex, values };
  });
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

console.log('=== 通用数据概览面板测试 ===\n');

// ========== 测试 1: 空数据不崩溃 ==========
console.log('测试 1: 空数据不崩溃');
{
  const headers = [];
  const rows = [];
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length === 0, '空数据返回空特征列表');
}

// ========== 测试 2: 无数值字段不崩溃 ==========
console.log('\n测试 2: 无数值字段不崩溃');
{
  const headers = ['name', 'city'];
  const rows = [
    { name: '张三', city: '北京' },
    { name: '李四', city: '上海' },
    { name: '王五', city: '广州' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length === 2, '检测到 2 个字段');
  
  const vectors = standardizeDataset(rows, features);
  assert(vectors.length === 3, '标准化后 3 行数据');
  
  const numericalFields = features.filter(f => f.featureType === FEATURE_TYPES.NUMERICAL);
  assert(numericalFields.length === 0, '没有数值字段');
}

// ========== 测试 3: 数值字段统计正确 ==========
console.log('\n测试 3: 数值字段统计正确');
{
  const headers = ['score'];
  const rows = [
    { score: '85' },
    { score: '90' },
    { score: '78' },
    { score: '92' },
    { score: '88' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length === 1, '检测到 1 个字段');
  assert(features[0].featureType === FEATURE_TYPES.NUMERICAL, '识别为数值字段');
  
  const vectors = standardizeDataset(rows, features);
  const stats = analyzeNumericalFeature(vectors, 'score');
  
  assert(stats.count === 5, '总行数 5');
  assert(stats.validCount === 5, '有效值 5');
  assert(stats.missingCount === 0, '缺失值 0');
  assert(stats.min === 78, '最小值 78');
  assert(stats.max === 92, '最大值 92');
  assert(Math.abs(stats.mean - 86.6) < 0.01, '平均值约 86.6');
  assert(stats.median === 88, '中位数 88');
}

// ========== 测试 4: 字段类型识别正确 ==========
console.log('\n测试 4: 字段类型识别正确');
{
  const headers = ['id', 'name', 'score', 'date', 'comment'];
  const rows = [
    { id: '2024010001', name: '张三', score: '85', date: '2024-01-15', comment: '这是一个很长的评论内容，用于测试文本字段识别功能，需要足够长的长度才能被识别为文本类型字段，确保超过五十个字符的限制' },
    { id: '2024010002', name: '张三', score: '90', date: '2024-01-16', comment: '另一个长文本，包含足够的字符数来判断是否为文本类型，这个文本长度应该超过五十个字符的限制，这样才能正确识别' },
    { id: '2024010003', name: '李四', score: '78', date: '2024-01-17', comment: '还有更多的长文本内容，确保平均长度超过阈值，这样才能正确识别为文本类型而不是其他类型，需要足够长的文本' },
    { id: '2024010004', name: '李四', score: '92', date: '2024-01-18', comment: '第四个长文本内容，同样需要满足长度要求，确保能够被正确识别为文本类型字段，而不是被误判为其他类型' },
    { id: '2024010005', name: '张三', score: '88', date: '2024-01-19', comment: '第五个长文本内容，继续验证文本字段的识别逻辑，确保所有文本都足够长，能够被正确分类为文本类型' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length === 5, '检测到 5 个字段');
  
  const typeCounts = {
    numerical: 0,
    categorical: 0,
    temporal: 0,
    text: 0,
    identifier: 0,
  };
  
  for (const f of features) {
    typeCounts[f.featureType]++;
  }
  
  assert(typeCounts.identifier === 1, '1 个 ID 字段');
  assert(typeCounts.categorical === 1, '1 个类别字段 (name)');
  assert(typeCounts.numerical === 1, '1 个数值字段 (score)');
  assert(typeCounts.temporal === 1, '1 个时间字段 (date)');
  assert(typeCounts.text === 1, '1 个文本字段 (comment)');
}

// ========== 测试 5: 缺失值统计正确 ==========
console.log('\n测试 5: 缺失值统计正确');
{
  const headers = ['score'];
  const rows = [
    { score: '85' },
    { score: '' },
    { score: '90' },
    { score: null },
    { score: '78' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  const vectors = standardizeDataset(rows, features);
  const stats = analyzeNumericalFeature(vectors, 'score');
  
  assert(stats.count === 5, '总行数 5');
  assert(stats.validCount === 3, '有效值 3');
  assert(stats.missingCount === 2, '缺失值 2');
}

// ========== 测试 6: 异常值统计正确 ==========
console.log('\n测试 6: 异常值统计正确');
{
  const headers = ['score'];
  const rows = [
    { score: '85' },
    { score: '87' },
    { score: '86' },
    { score: '88' },
    { score: '85' },
    { score: '87' },
    { score: '86' },
    { score: '100' },
    { score: '85' },
    { score: '87' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  const vectors = standardizeDataset(rows, features);
  const outliers = detectOutliers(vectors, 'score');
  
  assert(outliers.length > 0, '检测到异常值');
  assert(outliers.some(o => o.value === 100), '100 被识别为异常值');
}

// ========== 测试 7: 大表格保护（5000 行限制） ==========
console.log('\n测试 7: 大表格保护（5000 行限制）');
{
  const headers = ['score'];
  const rows = [];
  for (let i = 0; i < 6000; i++) {
    rows.push({ score: String(60 + (i % 40)) });
  }
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length > 0, '大表格仍能检测字段');
  
  const vectors = standardizeDataset(rows, features);
  assert(vectors.length <= 5000, `标准化后行数不超过 5000（实际 ${vectors.length}）`);
}

// ========== 测试 8: 多数值字段统计 ==========
console.log('\n测试 8: 多数值字段统计');
{
  const headers = ['math', 'english', 'physics'];
  const rows = [
    { math: '85', english: '90', physics: '88' },
    { math: '90', english: '85', physics: '92' },
    { math: '78', english: '88', physics: '80' },
  ];
  
  const features = detectDatasetSchema(headers, rows);
  assert(features.length === 3, '检测到 3 个字段');
  assert(features.filter(f => f.featureType === FEATURE_TYPES.NUMERICAL).length === 3, '3 个都是数值字段');
  
  const vectors = standardizeDataset(rows, features);
  
  const mathStats = analyzeNumericalFeature(vectors, 'math');
  assert(mathStats.validCount === 3, 'math 有效值 3');
  assert(Math.abs(mathStats.mean - 84.33) < 0.01, 'math 平均值约 84.33');
  
  const englishStats = analyzeNumericalFeature(vectors, 'english');
  assert(englishStats.validCount === 3, 'english 有效值 3');
  assert(Math.abs(englishStats.mean - 87.67) < 0.01, 'english 平均值约 87.67');
}

console.log('\n=== 测试完成 ===');
console.log(`通过: ${passed}, 失败: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
