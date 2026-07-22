/**
 * 通用 Schema 检测器
 * 职责：判断字段类型（numerical/categorical/temporal/text/identifier/invalid）
 * 不绑定任何领域语义，只做通用特征识别
 */
const DEFAULT_DETECTION_CONFIG = {
    minNumericRatio: 0.7,
    minUniqueRatio: 0.9,
    minIdentifierLength: 6,
    maxTemporalParseFail: 3,
    maxCategoryRatio: 0.5,
    maxCategoryCount: 50,
    minTextLength: 50,
};
/**
 * 检测单个字段的类型
 */
export function detectFeatureType(fieldName, values, config = {}) {
    const cfg = { ...DEFAULT_DETECTION_CONFIG, ...config };
    // 1. 检查是否为空列
    const nonEmptyValues = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmptyValues.length === 0) {
        return {
            featureType: 'invalid',
            confidence: 1.0,
            reason: '字段全为空值',
        };
    }
    // 2. 检查是否为标识符（高唯一性的长数字）
    const identifierResult = checkIdentifier(fieldName, nonEmptyValues, cfg);
    if (identifierResult) {
        return identifierResult;
    }
    // 3. 检查是否为数值型
    const numericResult = checkNumerical(nonEmptyValues, cfg);
    if (numericResult) {
        return numericResult;
    }
    // 4. 检查是否为时间型
    const temporalResult = checkTemporal(nonEmptyValues, cfg);
    if (temporalResult) {
        return temporalResult;
    }
    // 5. 检查是否为文本型（长文本）
    const textResult = checkText(nonEmptyValues, cfg);
    if (textResult) {
        return textResult;
    }
    // 6. 检查是否为类别型
    const categoricalResult = checkCategorical(nonEmptyValues, cfg);
    if (categoricalResult) {
        return categoricalResult;
    }
    // 7. 默认为无效
    return {
        featureType: 'invalid',
        confidence: 0.5,
        reason: '无法识别字段类型',
    };
}
/**
 * 检查是否为标识符字段
 */
function checkIdentifier(fieldName, values, cfg) {
    const uniqueValues = new Set(values);
    const uniqueRatio = uniqueValues.size / values.length;
    // 高唯一性
    if (uniqueRatio < cfg.minUniqueRatio) {
        return null;
    }
    // 检查是否为长数字
    const numericPattern = /^\d+$/;
    const numericValues = values.filter(v => numericPattern.test(String(v).trim()));
    const numericRatio = numericValues.length / values.length;
    if (numericRatio >= 0.8) {
        // 检查平均长度
        const avgLength = numericValues.reduce((sum, v) => sum + v.length, 0) / numericValues.length;
        if (avgLength >= cfg.minIdentifierLength) {
            return {
                featureType: 'identifier',
                confidence: 0.95,
                reason: `高唯一性长数字字段（唯一率 ${(uniqueRatio * 100).toFixed(1)}%，平均长度 ${avgLength.toFixed(1)}）`,
            };
        }
    }
    // 检查字段名是否包含标识符关键词
    const identifierKeywords = ['id', 'code', 'no', 'num', '编号', '学号', '工号', '身份证号'];
    const fieldNameLower = fieldName.toLowerCase();
    if (identifierKeywords.some(kw => fieldNameLower.includes(kw))) {
        if (uniqueRatio >= 0.8) {
            return {
                featureType: 'identifier',
                confidence: 0.85,
                reason: `字段名包含标识符关键词，且唯一率较高（${(uniqueRatio * 100).toFixed(1)}%）`,
            };
        }
    }
    return null;
}
/**
 * 检查是否为数值型字段
 */
function checkNumerical(values, cfg) {
    let numericCount = 0;
    for (const v of values) {
        const str = String(v).trim();
        if (str === '')
            continue;
        // 去除千分位逗号和百分号后再用 Number() 严格解析
        // 避免 parseFloat('2024-01-15') = 2024 这种误匹配
        const cleaned = str.replace(/,/g, '').replace(/%$/, '');
        const num = Number(cleaned);
        if (!isNaN(num) && isFinite(num)) {
            numericCount++;
        }
    }
    const numericRatio = numericCount / values.length;
    if (numericRatio >= cfg.minNumericRatio) {
        return {
            featureType: 'numerical',
            confidence: Math.min(0.99, numericRatio),
            reason: `数值比例 ${(numericRatio * 100).toFixed(1)}%`,
        };
    }
    return null;
}
/**
 * 检查是否为时间型字段
 */
function checkTemporal(values, cfg) {
    // 常见日期格式
    const datePatterns = [
        /^\d{4}-\d{1,2}-\d{1,2}$/, // 2024-01-15
        /^\d{4}\/\d{1,2}\/\d{1,2}$/, // 2024/01/15
        /^\d{4}\.\d{1,2}\.\d{1,2}$/, // 2024.01.15
        /^\d{4}年\d{1,2}月\d{1,2}日$/, // 2024年01月15日
        /^\d{1,2}\/\d{1,2}\/\d{4}$/, // 01/15/2024
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
    ];
    let parseSuccessCount = 0;
    let parseFailCount = 0;
    for (const v of values) {
        const str = String(v).trim();
        if (str === '')
            continue;
        // 检查是否匹配日期格式
        const matchesPattern = datePatterns.some(pattern => pattern.test(str));
        if (matchesPattern) {
            // 尝试解析为 Date
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                parseSuccessCount++;
            }
            else {
                parseFailCount++;
            }
        }
        else {
            // 尝试直接解析
            const date = new Date(str);
            if (!isNaN(date.getTime()) && str.length >= 8) {
                parseSuccessCount++;
            }
            else {
                parseFailCount++;
            }
        }
        // 提前终止
        if (parseFailCount > cfg.maxTemporalParseFail) {
            return null;
        }
    }
    const totalValid = parseSuccessCount + parseFailCount;
    if (totalValid === 0)
        return null;
    const successRatio = parseSuccessCount / totalValid;
    if (successRatio >= 0.8 && parseSuccessCount >= 3) {
        return {
            featureType: 'temporal',
            confidence: Math.min(0.95, successRatio),
            reason: `时间格式匹配率 ${(successRatio * 100).toFixed(1)}%`,
        };
    }
    return null;
}
/**
 * 检查是否为文本型字段
 */
function checkText(values, cfg) {
    // 计算平均长度
    const avgLength = values.reduce((sum, v) => sum + String(v).length, 0) / values.length;
    // 检查是否有长文本
    const longTextCount = values.filter(v => String(v).length >= cfg.minTextLength).length;
    const longTextRatio = longTextCount / values.length;
    if (avgLength >= cfg.minTextLength && longTextRatio >= 0.5) {
        return {
            featureType: 'text',
            confidence: 0.85,
            reason: `平均长度 ${avgLength.toFixed(1)}，长文本比例 ${(longTextRatio * 100).toFixed(1)}%`,
        };
    }
    return null;
}
/**
 * 检查是否为类别型字段
 */
function checkCategorical(values, cfg) {
    const uniqueValues = new Set(values);
    const uniqueCount = uniqueValues.size;
    const uniqueRatio = uniqueCount / values.length;
    // 类别型特征：唯一值数量较少，且比例不高
    if (uniqueCount <= cfg.maxCategoryCount && uniqueRatio <= cfg.maxCategoryRatio) {
        return {
            featureType: 'categorical',
            confidence: Math.min(0.9, 1 - uniqueRatio),
            reason: `唯一值数量 ${uniqueCount}，唯一率 ${(uniqueRatio * 100).toFixed(1)}%`,
        };
    }
    return null;
}
/**
 * 批量检测所有字段的类型
 */
export function detectDatasetSchema(headers, rows, config = {}) {
    const features = [];
    for (const header of headers) {
        // 提取该列的所有值
        const values = rows.map(row => row[header] ?? '');
        // 检测字段类型
        const detection = detectFeatureType(header, values, config);
        features.push({
            fieldName: header,
            displayName: header,
            featureType: detection.featureType,
            confidence: detection.confidence,
            reason: detection.reason,
        });
    }
    return features;
}
