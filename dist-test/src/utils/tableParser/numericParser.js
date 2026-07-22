// ============================================================
// 成绩表智能解析器 - 数值解析
// ============================================================
// 明确的非数值关键词
const INVALID_KEYWORDS = [
    '缺考', '弃考', '转班', '转到', '无', '无成绩',
    '休学', '退学', '请假', '缓考',
    '—', '–', '/', '\\', '|',
];
/**
 * 解析单个单元格的数值
 *
 * 支持：
 * 1. 数字类型
 * 2. 字符串数字： "550"、"550.5"
 * 3. 带空格数字： " 550 "
 * 4. 百分号："85%" → 85（成绩场景）
 *
 * 返回 invalid 的情况：
 * - 缺考、弃考、转到7班、转班、无、无成绩、-、/
 *
 * 返回 empty 的情况：
 * - 空值、null、undefined、空字符串
 */
export function parseNumericValue(val) {
    // 1. 空值处理
    if (val === null || val === undefined || val === '') {
        return { status: 'empty' };
    }
    // 2. 数字类型
    if (typeof val === 'number') {
        return Number.isFinite(val) ? { status: 'valid', value: val } : { status: 'invalid' };
    }
    // 3. 布尔类型（谨慎处理）
    if (typeof val === 'boolean') {
        return { status: 'invalid' };
    }
    // 4. 字符串处理
    const str = String(val).trim();
    // 4.1 空字符串
    if (str === '') {
        return { status: 'empty' };
    }
    // 4.2 检查是否为明确的无效关键词
    if (isInvalidKeyword(str)) {
        return { status: 'invalid' };
    }
    // 4.3 特殊符号
    if (str === '-' || str === '—' || str === '–' || str === '/' || str === '\\' || str === '|') {
        return { status: 'empty' };
    }
    // 4.4 处理百分号：成绩场景解析为数值部分
    if (str.endsWith('%')) {
        const numStr = str.slice(0, -1).trim();
        const num = parseFloat(numStr);
        if (!isNaN(num) && Number.isFinite(num)) {
            return { status: 'valid', value: num };
        }
        return { status: 'invalid' };
    }
    // 4.5 去除千分位逗号后解析
    const cleaned = str.replace(/,/g, '');
    // 4.6 检查清洗后是否为无效关键词
    if (isInvalidKeyword(cleaned)) {
        return { status: 'invalid' };
    }
    const num = parseFloat(cleaned);
    if (!isNaN(num) && Number.isFinite(num)) {
        return { status: 'valid', value: num };
    }
    // 4.7 包含数字但解析失败的情况（如 "转到7班"）
    if (/\d/.test(cleaned)) {
        // 包含数字但整体不是有效数字 → 无效
        return { status: 'invalid' };
    }
    return { status: 'invalid' };
}
/**
 * 检查是否为明确的无效关键词
 */
function isInvalidKeyword(str) {
    const lower = str.toLowerCase();
    for (const kw of INVALID_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) {
            return true;
        }
    }
    return false;
}
/**
 * 便捷函数：兼容旧的 parseNumericValue 接口（返回 number | null）
 */
export function parseNumericValueLegacy(val) {
    const result = parseNumericValue(val);
    return result.status === 'valid' ? result.value : null;
}
