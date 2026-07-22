// ============================================================
// 成绩表智能解析器 - 内容特征分析
// ============================================================
import { parseNumericValue } from './numericParser';
/**
 * 分析一列数据的内容特征
 *
 * @param columnValues - 该列所有单元格的字符串值
 * @returns ContentFeature 内容特征对象
 */
export function analyzeContentFeature(columnValues) {
    const total = columnValues.length;
    if (total === 0) {
        return {
            numericRatio: 0,
            integerRatio: 0,
            decimalRatio: 0,
            uniqueRatio: 0,
            min: null,
            max: null,
            mean: null,
            avgStringLength: 0,
            valuePattern: 'unknown',
        };
    }
    // 1. 统计数值比例、整数/小数比例、min/max/mean
    let validCount = 0;
    let integerCount = 0;
    let decimalCount = 0;
    let min = null;
    let max = null;
    let sum = 0;
    const uniqueValues = new Set();
    let totalLength = 0;
    // 用于判断 valuePattern
    let chineseNameCount = 0; // 2-4个中文字符
    let longNumberCount = 0; // 长数字串(>=6位)
    let classLabelCount = 0; // 包含"班""级""高一"等
    let rankLikeCount = 0; // 小整数(1-总行数*2)
    let scoreLikeCount = 0; // 0-1000范围内的数值
    for (const val of columnValues) {
        uniqueValues.add(val);
        totalLength += val.length;
        const parsed = parseNumericValue(val);
        if (parsed.status === 'valid') {
            validCount++;
            const num = parsed.value;
            sum += num;
            if (min === null || num < min)
                min = num;
            if (max === null || num > max)
                max = num;
            if (Number.isInteger(num)) {
                integerCount++;
            }
            else {
                decimalCount++;
            }
            // 判断是否为排名类数值（小整数）
            if (Number.isInteger(num) && num >= 1 && num <= total * 2) {
                rankLikeCount++;
            }
            // 判断是否为分数类数值（0-1000范围）
            if (num >= 0 && num <= 1000) {
                scoreLikeCount++;
            }
        }
        // 判断文本模式
        const trimmed = val.trim();
        if (trimmed) {
            // 中文姓名模式：2-4个中文字符
            if (/^[\u4e00-\u9fa5]{2,4}$/.test(trimmed)) {
                chineseNameCount++;
            }
            // 长数字串模式：>=6位纯数字
            if (/^\d{6,}$/.test(trimmed)) {
                longNumberCount++;
            }
            // 班级标签模式
            if (/班|级|高一|高二|高三/.test(trimmed)) {
                classLabelCount++;
            }
        }
    }
    const numericRatio = validCount / total;
    const integerRatio = validCount > 0 ? integerCount / validCount : 0;
    const decimalRatio = validCount > 0 ? decimalCount / validCount : 0;
    const uniqueRatio = uniqueValues.size / total;
    const mean = validCount > 0 ? sum / validCount : null;
    const avgStringLength = totalLength / total;
    // 2. 判断 valuePattern
    const valuePattern = determineValuePattern({
        total,
        validCount,
        chineseNameCount,
        longNumberCount,
        classLabelCount,
        rankLikeCount,
        scoreLikeCount,
        numericRatio,
    });
    return {
        numericRatio,
        integerRatio,
        decimalRatio,
        uniqueRatio,
        min,
        max,
        mean,
        avgStringLength,
        valuePattern,
    };
}
/**
 * 判断值模式
 */
function determineValuePattern(stats) {
    const { total, validCount, chineseNameCount, longNumberCount, classLabelCount, rankLikeCount, scoreLikeCount, numericRatio } = stats;
    if (total === 0)
        return 'unknown';
    // 中文姓名模式：超过50%是2-4个中文字符
    if (chineseNameCount / total > 0.5) {
        return 'chineseName';
    }
    // 班级标签模式：超过30%包含班级关键词
    if (classLabelCount / total > 0.3) {
        return 'classLabel';
    }
    // 长数字串模式：超过50%是>=6位纯数字
    if (longNumberCount / total > 0.5) {
        return 'longNumber';
    }
    // 数值列需要进一步判断
    if (numericRatio > 0.5) {
        // 排名类模式：大部分是小整数
        if (rankLikeCount / validCount > 0.7) {
            return 'rankLike';
        }
        // 分数类模式：大部分在0-1000范围
        if (scoreLikeCount / validCount > 0.7) {
            return 'scoreLike';
        }
        return 'mixed';
    }
    return 'unknown';
}
