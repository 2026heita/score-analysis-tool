/**
 * 更新日志（不可变版本结构）
 * 
 * ⚠️ ⚠️ ⚠️ 强约束规则（必须遵守）⚠️ ⚠️ ⚠️
 * 
 * ❗ updateLogs 是不可变数据结构，默认禁止任何修改
 * ❗ 禁止任何直接数组修改行为：push/unshift/索引修改/splice
 * ❗ 禁止修改已有 entry 的任何属性
 * ❗ 禁止修改 entry.items 数组
 * ❗ 新增版本必须使用 createUpdateLogEntry() 函数
 * 
 * 设计原则：
 * 1. 每个 entry 一旦创建就不可修改
 * 2. 版本号必须唯一，不能重复
 * 3. 不允许 mutate / append 到旧版本
 * 4. 每次更新生成新的 release entry
 * 
 * 版本号规范：
 * - 格式：v{major}.{minor}.{patch}
 * - major：重大重构或不兼容变更
 * - minor：新功能或重要改进
 * - patch：修复或小优化
 * 
 * 正确用法示例：
 * ```ts
 * // ✅ 正确：使用 createUpdateLogEntry 创建新版本
 * const newLogs = createUpdateLogEntry(updateLogs, {
 *   date: '2026-06-16',
 *   version: 'v1.2.0',
 *   title: '新增功能',
 *   items: ['功能1', '功能2'],
 *   type: 'feature'
 * });
 * 
 * // ❌ 错误：直接修改数组（运行时会抛出错误或被静默忽略）
 * updateLogs.push(newEntry);           // TypeError in strict mode
 * (updateLogs as any)[0] = newEntry;   // TypeError in strict mode
 * updateLogs[0].items.push('新内容');   // TypeError in strict mode
 * updateLogs[0].title = '新标题';       // TypeError in strict mode
 * ```
 */

export interface UpdateLogItem {
  readonly date: string;
  readonly version: string;
  readonly title: string;
  readonly items: readonly string[];
  readonly type?: 'feature' | 'fix' | 'improvement' | 'notice';
}

// ─── 内部数据（不可变） ─────────────────────────────────────────

const _updateLogsData: UpdateLogItem[] = [
  {
    date: '2026-06-18',
    version: 'v1.7.0',
    title: '多表切换、智能字段推荐与异常值处理',
    type: 'feature',
    items: [
      '支持 Excel 多表文件上传，可在不同表之间切换，数据、筛选、分组和图表随之更新',
      '字段推荐更准确，学号、序号、编号等标识字段不再被优先推荐为主要分析字段',
      '新增异常值查看与处理入口，可查看异常数据并选择排除或恢复',
      '筛选、分组、CSV 导出等分析流程更稳定，切换表后数据保持一致'
    ]
  },
  {
    date: '2026-06-18',
    version: 'v1.2.0',
    title: '新增筛选、分组分析与数据导出',
    type: 'feature',
    items: [
      '新增数据筛选功能，支持按数值字段设置条件筛选数据，筛选结果实时影响所有分析',
      '新增分组分析功能，可按维度对不同组数据进行统计对比，支持柱状图直观展示',
      '新增 CSV 导出功能，支持导出筛选后数据、分组统计结果和指标摘要',
      '筛选条件下无数据时自动提示，避免空白分析结果'
    ]
  },
  {
    date: '2026-06-17',
    version: 'v1.1.4',
    title: '传统科目雷达图入口下线',
    type: 'notice',
    items: [
      '传统科目得分率雷达图入口已下线，相关功能迁移为底层兼容保留',
      '分析引擎和图表功能不受影响，主分析链路更加通用'
    ]
  },
  {
    date: '2026-06-16',
    version: 'v1.1.3',
    title: '更通用的数据分析',
    type: 'improvement',
    items: [
      '页面表述逐步从成绩分析调整为更通用的表格数据分析',
      '系统现在能自动识别"数值越小越好"的字段（如排名），并单独处理'
    ]
  },
  {
    date: '2026-06-15',
    version: 'v1.1.2',
    title: '分析更稳定，结果更一致',
    type: 'improvement',
    items: [
      '表格解析更稳定，字段识别更准确',
      '统计计算口径统一，均值、中位数、百分位等结果全局一致',
      '新增变量关系分析，可查看字段之间的相关性',
      '示例数据选择器优化，支持快速切换不同数据场景',
      '移动端兼容性进一步增强，大表格加载更流畅'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.1.1',
    title: '新增通用数据概览',
    type: 'feature',
    items: [
      '新增通用数据概览面板，可查看数据行数、字段类型数量和基础结构信息',
      '新增数值字段基础统计表，支持查看有效值、缺失值、均值、中位数、标准差和异常值数量',
      '通用分析引擎开始在页面中可视化展示，为后续支持更多类型表格打基础'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.1.0',
    title: '平台方向升级',
    type: 'notice',
    items: [
      '平台将逐步从成绩分析工具升级为通用表格分析平台',
      '当前版本已增强移动端兼容性、失败兜底和大表格保护',
      '后续将支持更多类型表格的通用统计、关系分析和异常识别'
    ]
  },
  {
    date: '2026-06-14',
    version: 'v1.0.0',
    title: '上线稳定版',
    type: 'improvement',
    items: [
      '新增解析结果报告，可查看字段识别类型、置信度和判断依据',
      '新增分析解释功能，支持查看百分位、超过人数和相对位置',
      '优化移动端兼容性，增加分析失败提示和大表格防卡死保护',
      '修复未填写字段被当作 0 分的问题',
      '修复排名字段百分位方向错误问题'
    ]
  }
];

// ─── 深度冻结 ───────────────────────────────────────────────────

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj as Readonly<T>;
}

// 深度冻结所有 entry 及其 items 数组
for (const entry of _updateLogsData) {
  deepFreeze(entry);
}

// ─── 导出（只读 + 冻结） ────────────────────────────────────────

/**
 * 更新日志（只读）
 * 
 * 此数组已被 Object.freeze 深度冻结：
 * - 数组本身不可修改（push/pop/splice/unshift/索引赋值 均会 TypeError）
 * - 每个 entry 的属性不可修改
 * - 每个 entry.items 数组不可修改
 */
export const updateLogs: readonly UpdateLogItem[] = Object.freeze(_updateLogsData);

// ─── DEV 环境防误用检测 ─────────────────────────────────────────

if (import.meta.env.DEV) {
  // 1. 验证冻结状态
  if (!Object.isFrozen(updateLogs)) {
    console.error('[updateLogs] CRITICAL: updateLogs array is NOT frozen!');
  }
  for (let i = 0; i < updateLogs.length; i++) {
    if (!Object.isFrozen(updateLogs[i])) {
      console.error(`[updateLogs] CRITICAL: entry [${i}] is NOT frozen!`);
    }
    if (!Object.isFrozen(updateLogs[i].items)) {
      console.error(`[updateLogs] CRITICAL: entry [${i}].items is NOT frozen!`);
    }
  }

  // 2. 原型方法调用检测（捕获 attempted mutations）
  const mutationMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'] as const;
  for (const method of mutationMethods) {
    const original = Array.prototype[method] as (...args: unknown[]) => unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Array.prototype as any)[method] = function (this: unknown, ...args: unknown[]) {
      if (this === updateLogs) {
        console.error(
          `[updateLogs] ❌ IMMUTABLE VIOLATION: Array.prototype.${method}() called on frozen updateLogs. ` +
          `Use createUpdateLogEntry() to create a new version instead.`
        );
        throw new TypeError(
          `updateLogs is immutable. Cannot call ${method}(). Use createUpdateLogEntry() instead.`
        );
      }
      // 对 entry.items 也做检测
      for (const entry of updateLogs) {
        if (this === entry.items) {
          console.error(
            `[updateLogs] ❌ IMMUTABLE VIOLATION: Array.prototype.${method}() called on frozen entry.items ` +
            `("${entry.version}"). Entries are immutable.`
          );
          throw new TypeError(
            `updateLogs entry items are immutable. Cannot call ${method}() on "${entry.version}" items.`
          );
        }
      }
      return original.apply(this, args);
    };
  }
}

// ─── 校验函数 ───────────────────────────────────────────────────

/**
 * 校验 updateLogs 一致性
 * 用于开发时检查数据结构是否正确
 */
export function validateUpdateLogs(logs: readonly UpdateLogItem[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const versions = new Set<string>();
  const dateVersionCombos = new Set<string>();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const prefix = `[${i}] ${log.date}`;

    // 检查必填字段
    if (!log.date) errors.push(`${prefix}: date 不能为空`);
    if (!log.version) errors.push(`${prefix}: version 不能为空`);
    if (!log.title) errors.push(`${prefix}: title 不能为空`);
    if (!log.items || log.items.length === 0) errors.push(`${prefix}: items 不能为空`);

    // 检查 version 唯一性
    if (versions.has(log.version)) {
      errors.push(`${prefix}: version "${log.version}" 重复`);
    }
    versions.add(log.version);

    // 检查 date+version 组合唯一性
    const combo = `${log.date}|${log.version}`;
    if (dateVersionCombos.has(combo)) {
      errors.push(`${prefix}: date+version 组合 "${combo}" 重复`);
    }
    dateVersionCombos.add(combo);
  }

  return { valid: errors.length === 0, errors };
}

// ─── 写入函数（唯一合法写入路径） ────────────────────────────────

/**
 * 创建新的更新日志 entry（不可变方式）
 * 
 * 此函数返回新的冻结数组，不修改原数组。
 * 新 entry 会被插入到数组开头（最新版本在前）。
 * 
 * @param logs - 现有的日志数组
 * @param newEntry - 新的日志 entry
 * @returns 包含新 entry 的冻结日志数组
 * @throws 如果 version 已存在，抛出错误
 * 
 * @example
 * const newLogs = createUpdateLogEntry(updateLogs, {
 *   date: '2026-06-16',
 *   version: 'v1.2.0',
 *   title: '新增功能',
 *   items: ['功能1', '功能2'],
 *   type: 'feature'
 * });
 */
export function createUpdateLogEntry(
  logs: readonly UpdateLogItem[],
  newEntry: UpdateLogItem
): readonly UpdateLogItem[] {
  // 检查 version 是否已存在
  const existingVersion = logs.find(log => log.version === newEntry.version);
  if (existingVersion) {
    throw new Error(
      `Version "${newEntry.version}" already exists in updateLogs. ` +
      `Cannot append to existing entry. Create a new version instead.`
    );
  }

  // 冻结新 entry
  deepFreeze(newEntry);

  // 返回新的冻结数组，不修改原数组
  return Object.freeze([newEntry, ...logs]);
}
