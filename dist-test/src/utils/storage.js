const STORAGE_KEY = 'score_analyzer_state';
const CURRENT_VERSION = 3;
/** @deprecated 教育/高考功能已收敛至 legacy 区 */
export const DEFAULT_TRADITIONAL_ENTRIES = [
    { name: '语文', score: 110, maxScore: 150 },
    { name: '数学', score: 94, maxScore: 150 },
    { name: '外语', score: 117, maxScore: 150 },
    { name: '物理', score: 31, maxScore: 100 },
    { name: '化学', score: 78, maxScore: 100 },
    { name: '生物', score: 84, maxScore: 100 },
];
/** @deprecated 教育/高考功能已收敛至 legacy 区，默认示例数据已替换为通用电商数据 */
export const DEFAULT_SAMPLE_TEXT = `商品\t类目\t曝光量\t点击量\t转化率\tGMV\t退款率
手机壳A\t配件\t15000\t1200\t8.0\t36000\t2.5
耳机B\t数码\t25000\t2800\t11.2\t224000\t3.2
充电宝C\t数码\t18000\t1600\t8.9\t128000\t1.8
数据线D\t配件\t12000\t900\t7.5\t18000\t4.1
手机膜E\t配件\t20000\t1800\t9.0\t36000\t2.8
蓝牙音箱F\t数码\t8000\t650\t8.1\t97500\t3.5
键盘G\t外设\t10000\t850\t8.5\t127500\t2.2
鼠标H\t外设\t9500\t780\t8.2\t78000\t2.6`;
/** 系统默认状态：用于"恢复默认"和"填入示例数据" */
export function getSystemDefaultState() {
    return {
        version: CURRENT_VERSION,
        rawText: DEFAULT_SAMPLE_TEXT,
        selectedField: 'GMV',
        inputValue: '128000',
        showAllFields: false,
        activeChartTab: 'histogram',
        originalFieldRadar: { selections: [], viewMode: 'bar' },
        analysisMode: 'scoreRate',
        filterConditions: [],
        selectedDimension: '',
    };
}
/** 空白默认状态：用于首次加载或 localStorage 为空时 */
export function getDefaultState() {
    return {
        version: CURRENT_VERSION,
        rawText: '',
        selectedField: '',
        inputValue: '',
        showAllFields: false,
        activeChartTab: 'histogram',
        originalFieldRadar: { selections: [], viewMode: 'bar' },
        analysisMode: 'scoreRate',
        filterConditions: [],
        selectedDimension: '',
    };
}
/** 安全的 JSON 解析，失败时返回默认值 */
export function safeJsonParse(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export function saveState(state) {
    try {
        const toSave = { ...state, version: CURRENT_VERSION };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }
    catch {
        // localStorage 不可用时静默失败
    }
}
function migrateState(raw) {
    const migrated = { ...raw };
    // v2 → v3: 新增 filterConditions 和 selectedDimension
    if (migrated.filterConditions === undefined) {
        migrated.filterConditions = [];
    }
    if (migrated.selectedDimension === undefined) {
        migrated.selectedDimension = '';
    }
    migrated.version = CURRENT_VERSION;
    return migrated;
}
export function loadSavedState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return getDefaultState();
        const parsed = safeJsonParse(raw, {});
        if (typeof parsed !== 'object' || parsed === null) {
            localStorage.removeItem(STORAGE_KEY);
            return getDefaultState();
        }
        // 旧版本数据迁移，不丢弃
        if (parsed.version !== CURRENT_VERSION) {
            const migrated = migrateState(parsed);
            // 写回迁移后的数据
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            }
            catch { /* 静默失败 */ }
            return migrated;
        }
        return parsed;
    }
    catch {
        localStorage.removeItem(STORAGE_KEY);
        return getDefaultState();
    }
}
export function clearSavedState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // 静默失败
    }
}
