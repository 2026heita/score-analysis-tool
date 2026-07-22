/**
 * 特征标准化器
 * 职责：将原始表格值转换成统一特征值
 * - 数值字段转 number
 * - 类别字段保留 category
 * - 时间字段尝试转 timestamp
 * - 文本字段只标记，不参与核心统计
 * - invalid / identifier 默认不参与统计
 */
const DEFAULT_STANDARDIZER_CONFIG = {
    allowCommaSeparator: true,
    strictTemporalParse: false,
};
/**
 * 标准化单个值
 */
export function standardizeValue(rawValue, featureType, config = {}) {
    const cfg = { ...DEFAULT_STANDARDIZER_CONFIG, ...config };
    // 处理空值
    if (rawValue === null || rawValue === undefined) {
        return { type: 'missing', value: null, original: '' };
    }
    const str = String(rawValue).trim();
    if (str === '') {
        return { type: 'missing', value: null, original: '' };
    }
    // 根据字段类型进行标准化
    switch (featureType) {
        case 'numerical':
            return standardizeNumerical(str, cfg);
        case 'categorical':
            return { type: 'categorical', value: str, original: str };
        case 'temporal':
            return standardizeTemporal(str, cfg);
        case 'text':
            return { type: 'text', value: str, original: str };
        case 'identifier':
            return { type: 'identifier', value: str, original: str };
        case 'invalid':
            return { type: 'invalid', value: null, original: str };
        default:
            return { type: 'invalid', value: null, original: str };
    }
}
/**
 * 标准化数值
 */
function standardizeNumerical(str, cfg) {
    let cleaned = str;
    // 移除千分位逗号
    if (cfg.allowCommaSeparator) {
        cleaned = cleaned.replace(/,/g, '');
    }
    // 移除百分号（转换为小数）
    if (cleaned.endsWith('%')) {
        cleaned = cleaned.slice(0, -1);
        const num = parseFloat(cleaned);
        if (!isNaN(num) && isFinite(num)) {
            return { type: 'numerical', value: num / 100, original: str };
        }
    }
    // 尝试解析
    const num = parseFloat(cleaned);
    if (!isNaN(num) && isFinite(num)) {
        return { type: 'numerical', value: num, original: str };
    }
    // 解析失败
    return { type: 'invalid', value: null, original: str };
}
/**
 * 标准化时间
 */
function standardizeTemporal(str, _cfg) {
    // 尝试解析为 Date
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        return { type: 'temporal', value: date.getTime(), original: str };
    }
    // 解析失败
    return { type: 'invalid', value: null, original: str };
}
/**
 * 标准化整行数据
 */
export function standardizeRow(rowIndex, row, features, config = {}) {
    const values = {};
    for (const feature of features) {
        const rawValue = row[feature.fieldName];
        values[feature.fieldName] = standardizeValue(rawValue, feature.featureType, config);
    }
    return {
        rowIndex,
        values,
    };
}
/**
 * 标准化整个数据集
 */
export function standardizeDataset(rows, features, config = {}) {
    return rows.map((row, index) => standardizeRow(index, row, features, config));
}
/**
 * 提取数值字段的标准化值（用于统计分析）
 */
export function extractNumericalValues(vectors, fieldName) {
    const values = [];
    for (const vector of vectors) {
        const sv = vector.values[fieldName];
        if (sv && sv.type === 'numerical' && sv.value !== null) {
            values.push(sv.value);
        }
    }
    return values;
}
/**
 * 提取类别字段的标准化值
 */
export function extractCategoricalValues(vectors, fieldName) {
    const values = [];
    for (const vector of vectors) {
        const sv = vector.values[fieldName];
        if (sv && sv.type === 'categorical') {
            values.push(sv.value);
        }
    }
    return values;
}
/**
 * 提取时间字段的标准化值（timestamp）
 */
export function extractTemporalValues(vectors, fieldName) {
    const values = [];
    for (const vector of vectors) {
        const sv = vector.values[fieldName];
        if (sv && sv.type === 'temporal' && sv.value !== null) {
            values.push(sv.value);
        }
    }
    return values;
}
/**
 * 判断值是否可参与统计分析
 */
export function isAnalyzable(sv) {
    return sv.type === 'numerical' || sv.type === 'temporal';
}
/**
 * 获取标准化值的原始字符串
 */
export function getOriginalValue(sv) {
    return sv.original;
}
