/**
 * 更新日志（不可变版本结构） — 用户公告（release changelog）
 * 
 * ⚠️ ⚠️ ⚠️ 发布规则（v1.7 强化）⚠️ ⚠️ ⚠️
 * 
 * 公告必须满足以下全部条件才能写入：
 * 1. tsc --noEmit 通过
 * 2. vite build 通过
 * 3. 全部测试通过
 * 4. 人工验收通过（如存在）
 * 5. 该版本为 release candidate（非开发阶段）
 * 
 * 禁止：
 * ❌ 每完成一个开发阶段就发布公告
 * ❌ 按时间（按天）发布公告
 * ❌ 包含 hook / context / orchestrator / cache / trace / slice 等技术术语
 * ❌ 包含测试新增与调整
 * ❌ 包含文件拆分 / 重构说明
 * 
 * 公告结构：
 * - version（语义版本号）
 * - date（发布日期）
 * - title（用户可理解的一句话）
 * - 3~6 条 items（用户可感知变化）
 * 
 * 与 internalChangelog 的关系：
 * - internalChangelog：开发日志，可频繁更新，包含技术细节
 * - updateLogs：用户公告，仅 release 时生成，禁止技术术语
 * 
 * 设计原则：
 * 1. 每个 entry 一旦创建就不可修改
 * 2. 版本号必须唯一，不能重复
 * 3. 一个版本 = 一次清晰认知，不碎片化
 * 4. 公告 ≠ 开发过程记录
 * 
 * 版本号规范：
 * - 格式：v{major}.{minor}.{patch}
 * - major：重大不兼容变更
 * - minor：新功能或重要改进
 * - patch：修复或小优化
 * 
 * 正确用法示例：
 * ```ts
 * // ✅ 正确：release 时使用 createUpdateLogEntry 创建新版本
 * const newLogs = createUpdateLogEntry(updateLogs, {
 *   date: '2026-06-18',
 *   version: 'v1.8.0',
 *   title: '新增数据导出功能',
 *   items: ['支持导出为 PDF 格式', '导出时保留筛选条件'],
 *   type: 'feature'
 * });
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
    date: '2026-08-31',
    version: 'v2.2.3',
    title: '数据来源更统一、分析角色更一致、异常值解析更可解释',
    type: 'improvement',
    items: [
      '通用数据来源体验优化：粘贴、文件、示例数据与外部数据源，从加载数据、保存当前输入到清空数据，数据来源状态清晰、操作逻辑与提示一致，切换更可靠',
      '字段识别与分析角色统一：业务数据会自动识别"时间、门店、渠道、品类"等维度与"金额、数量"等指标字段，并正确归位编号等标识字段；各分析页面统一按"指标、维度、标识、时间"理解字段，口径一致、跨页面结果稳定',
      '"数值字段基础统计"新增异常值解析：可直接查看哪些记录属于统计异常候选，并定位到对应原始行',
      '可查看对应记录的业务上下文与为什么被判为可能异常、以及 IQR 判断依据，并支持排除或恢复',
      '新增并强化"零售数仓销售数据"示例：覆盖日期、门店、区域、渠道、品类、商品与销量、销售额、毛利、折扣等字段，可体验时间趋势、分组、相关性与异常值解析；各内置示例整体质量同步提升',
      '兼容性与稳定性改进：通用场景与既有"科目"等场景边界更清晰、切换不冲突；较大数据量与各类异常数据场景下提示更明确、整体更可靠'
    ]
  },
  {
    date: '2026-08-17',
    version: 'v2.2.2',
    title: '数据来源统一、通用分析更自然、异常更可解释',
    type: 'improvement',
    items: [
      '数据量较大的表格会得到更明确的提示：超过分析上限（20,000 行）时不再静默截取前一部分继续分析，而是明确提示需要精简数据',
      '数据来源体验统一：粘贴、文件、示例数据与外部数据源，从加载数据、保存当前输入到清空数据，操作逻辑与提示完全一致，更可靠',
      '通用数据分析更自然：销售额、订单数、库存、耗时等普通业务数据会自动识别"时间、门店、渠道、品类"等维度与"金额、数量"等指标字段，不再依赖"成绩、课程、班级、排名"等教育概念',
      '异常值更具可解释性：查看"统计异常候选"时能定位到具体哪一行、哪个字段、值是多少、为什么被判为异常，并支持排除或恢复',
      '新增"零售数仓销售数据"示例：约 90 行、覆盖 30 天，含日期、门店、区域、渠道、品类、商品与销量、销售额、毛利、折扣等字段，可体验时间趋势、分组、相关性与异常分析',
      '内置示例更丰富合理：各示例数据的字段关系符合业务逻辑，示例选择界面标明分类、行数、字段数与适用场景，更易理解'
    ]
  },
  {
    date: '2026-08-16',
    version: 'v2.2.1',
    title: '分析更准确、表格更兼容',
    type: 'improvement',
    items: [
      '分析结果更准确：数值达到最大值时百分位可正常显示为 100%，分布图中用户数值定位更准确，累计分布图和箱线图在极端值、完全相同数据等情况下显示更合理',
      '相对位置判断更合理：当前数据范围内不存在的数值不再被误判为“超出数据范围”，排名等“数值越低越好”字段的分析与说明更准确',
      '表格解析兼容性提升：支持带引号的逗号、千分位、内容换行等 CSV 和粘贴表格场景，异常列不再静默错位；单列、空列、备注列、多级表头等识别更准确',
      '筛选功能增强：范围筛选的最小值和最大值可分别填写，并兼容旧版筛选条件；无效或矛盾的范围条件会被提示，不再误导结果',
      '数字解析加强：支持规范千分位、避免错误格式被误识别',
      '稳定性提升：针对大量数据和各类异常数据场景优化，整体更可靠'
    ]
  },
  {
    date: '2026-08-13',
    version: 'v2.2.0',
    title: '零售经营分析能力升级',
    type: 'feature',
    items: [
      '新增经营异常分析，可查看高、中等级别的经营异常，了解异常销售损失和主要驱动因素，并展开查看订单数、客单价、客户数、销售数量等详细指标变化',
      '零售经营数据的日期选择新增快捷调整按钮，可对开始日期和结束日期快速执行 -7天、-1天、+1天、+7天 操作，日期调整更方便',
      '经营异常分析支持对比上一可用业务日，清晰区分主要驱动指标和辅助经营信号，帮助快速定位经营问题'
    ]
  },
  {
    date: '2026-08-01',
    version: 'v2.1.0',
    title: '通用分析能力增强',
    type: 'feature',
    items: [
      '新增时间趋势分析，自动识别数据中的时间字段，支持按时间查看指标变化趋势',
      '新增相对位置计算方向选择，可指定"数值越高"或"数值越低"时位置越靠前，适配更多通用分析场景',
      '新增可选的外部数据源接入能力，可从配置的业务服务加载结构化数据进行分析',
      '优化多个图表的显示效果，减少标签遮挡，改善窄屏设备下的阅读体验',
      '优化数据加载说明，更准确地描述粘贴、CSV、Excel、示例数据和外部数据源等多种数据入口',
      '优化分析页面和摘要导出文案，采用"记录数""相对位置"等更通用的描述，适配销售额、订单数等非成绩数据'
    ]
  },
  {
    date: '2026-07-28',
    version: 'v2.0.1',
    title: '首页视觉体验优化',
    type: 'improvement',
    items: [
      '首页背景数据流展示更丰富的专业内容，涵盖数学、统计、算法、机器学习等多个领域的经典公式和概念',
      '每次打开页面时，背景公式会随机变化，带来不同的视觉体验',
      '操作过程中背景内容保持稳定，不会因数据输入或按钮点击而改变'
    ]
  },
  {
    date: '2026-07-25',
    version: 'v2.0.0',
    title: '智能分析升级，体验更友好',
    type: 'improvement',
    items: [
      '优化数据分析体验：提升了表格数据识别能力，对不同类型的数据提供更准确的分析方式',
      '提升数据兼容性：支持更多常见表格格式，改善复杂表格和大数据量情况下的使用体验',
      '优化分析结果展示：调整部分指标展示方式，对无法判断方向的数据不再进行误导性的排名评价',
      '优化稳定性：修复部分情况下数据加载、切换和清空异常问题，提升整体使用稳定性'
    ]
  },
  {
    date: '2026-06-19',
    version: 'v1.9.2',
    title: '性能与稳定性全面提升',
    type: 'improvement',
    items: [
      '图表加载速度明显提升，首次打开图表几乎无等待',
      '图表切换体验更顺滑，不同图表之间切换响应更快',
      'Excel 文件解析不再卡顿，大文件上传时页面保持流畅',
      '数据分析整体响应速度优化，字段切换和筛选结果即时反馈',
      '系统整体稳定性提升，长时间使用更加可靠'
    ]
  },
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

// ─── 最新公告导出 ───────────────────────────────────────────────

const latestEntry = updateLogs[0];

if (!latestEntry) {
  throw new Error('updateLogs 至少需要包含一条发布公告');
}

export const latestUpdateLog = latestEntry;
export const latestAppVersion = latestEntry.version;

// ─── DEV 环境防误用检测 + 内容边界校验 ─────────────────────────

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

  // 2. 内容边界校验：禁止技术术语出现在用户公告中
  const forbiddenTerms = [
    'hook', 'context', 'orchestrator', 'orchestrator',
    'cache', 'trace', 'slice', 'dependency',
    'useMemo', 'useCallback', 'useRef',
    'DerivedData', 'ViewContext', 'RawData',
    'engine', 'pipeline', 'memoization',
    '重构', '架构', '拆分', '抽象',
    '测试', 'test', 'coverage',
  ];

  for (let i = 0; i < updateLogs.length; i++) {
    const entry = updateLogs[i];
    const prefix = `[updateLogs] ${entry.version}`;

    // 检查 title
    for (const term of forbiddenTerms) {
      if (entry.title.toLowerCase().includes(term.toLowerCase())) {
        console.warn(
          `${prefix}: title 包含禁止术语 "${term}"。` +
          `用户公告应使用用户可理解的语言。`
        );
      }
    }

    // 检查 items
    for (let j = 0; j < entry.items.length; j++) {
      for (const term of forbiddenTerms) {
        if (entry.items[j].toLowerCase().includes(term.toLowerCase())) {
          console.warn(
            `${prefix}: items[${j}] 包含禁止术语 "${term}"。` +
            `用户公告应使用用户可理解的语言。`
          );
        }
      }
    }
  }

  // 3. 结构校验：3~6 条 items
  for (let i = 0; i < updateLogs.length; i++) {
    const entry = updateLogs[i];
    const prefix = `[updateLogs] ${entry.version}`;
    if (entry.items.length < 3) {
      console.warn(`${prefix}: items 数量 ${entry.items.length} < 3，公告过于碎片化`);
    }
    if (entry.items.length > 6) {
      console.warn(`${prefix}: items 数量 ${entry.items.length} > 6，公告过度膨胀`);
    }
  }

  // 4. 原型方法调用检测（捕获 attempted mutations）
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
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 校验单条 release 公告是否合规（v1.7 新增）
 * 
 * 检查项：
 * - 公告结构完整性
 * - items 数量 3~6
 * - 禁止技术术语
 * - type 字段合法性
 */
export function validateReleaseAnnouncement(
  entry: UpdateLogItem
): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 结构检查
  if (!entry.version) errors.push('version 不能为空');
  if (!entry.date) errors.push('date 不能为空');
  if (!entry.title) errors.push('title 不能为空');
  if (!entry.items || entry.items.length === 0) {
    errors.push('items 不能为空');
  } else {
    if (entry.items.length < 3) warnings.push(`items 数量 ${entry.items.length} < 3，公告过于碎片化`);
    if (entry.items.length > 6) warnings.push(`items 数量 ${entry.items.length} > 6，公告过度膨胀`);
  }

  // type 合法性检查
  const validTypes = ['feature', 'fix', 'improvement', 'notice'];
  if (entry.type && !validTypes.includes(entry.type)) {
    errors.push(`type "${entry.type}" 不合法，必须是: ${validTypes.join(', ')}`);
  }

  // 内容边界检查：禁止技术术语
  const forbiddenTerms = [
    'hook', 'context', 'orchestrator',
    'cache', 'trace', 'slice', 'dependency',
    'useMemo', 'useCallback', 'useRef',
    'DerivedData', 'ViewContext', 'RawData',
    'engine', 'pipeline', 'memoization',
    '重构', '架构优化', '执行引擎',
  ];

  const checkText = (text: string, label: string) => {
    for (const term of forbiddenTerms) {
      if (text.toLowerCase().includes(term.toLowerCase())) {
        warnings.push(`${label} 包含禁止术语 "${term}"，应使用用户可理解的语言`);
        break; // 每个文本只报告一次
      }
    }
  };

  checkText(entry.title, 'title');
  for (let i = 0; i < entry.items.length; i++) {
    checkText(entry.items[i], `items[${i}]`);
  }

  return { valid: errors.length === 0, warnings, errors };
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
