/**
 * 网站内帮助内容数据。
 *
 * 来源：docs/user_guide_content.md
 * 用途：为功能说明系统、提示与竞赛展示提供统一内容来源。
 *
 * 注意：仅作为展示解释，不参与任何分析逻辑。
 */

export type HelpType = 'short' | 'detail';

export interface HelpItem {
  /** 唯一键，用于在各模块中取用 */
  key: string;
  /** 功能名称 */
  title: string;
  /**
   * 内容分级：
   * - short  ：一句话可讲清，适合 tooltip（未来分级展示用）；
   * - detail ：内容较长，适合 HelpPanel（未来分级展示用）。
   * 当前展示逻辑仍统一为弹层，升级展示方式时才依据此字段分流。
   */
  type: HelpType;
  /** 作用 */
  purpose: string;
  /** 什么时候使用 */
  whenUse?: string;
  /** 示例 */
  example?: string;
  /** 注意事项 */
  note?: string;
}

export const HELP_ITEMS: HelpItem[] = [
  {
    key: 'field',
    type: 'detail',
    title: '字段识别',
    purpose: '系统自动判断每一列数据的角色，方便用正确的方式分析它。',
    whenUse: '数据加载完成后自动进行，无需手动开启。',
    example: '数字列（销售额、成本）被识别为指标；文本列（地区、渠道）被识别为分类；日期列被识别为时间字段；编号列被识别为标识字段。',
    note: '系统是自动判断的，结果需要结合实际数据来理解，不一定是绝对正确。',
  },
  {
    key: 'filter',
    type: 'detail',
    title: '数据筛选',
    purpose: '只查看符合条件的数据，缩小分析范围。',
    whenUse: '想只看一部分数据时，例如只分析销售额超过某个值，或只看某个地区的记录。',
    example: '只保留销售额大于 1 万的记录。',
    note: '筛选不会修改原始数据，只是临时换一个视角来看。',
  },
  {
    key: 'group',
    type: 'detail',
    title: '分组分析',
    purpose: '按照某个类别拆开数据，再比较不同类别的统计结果。',
    whenUse: '想对比不同类别之间的差异时，例如按地区比较销售额。',
    example: '按地区分组，分别统计各地区的销售额。',
    note: '分组维度决定了按什么分类来查看。',
  },
  {
    key: 'position',
    type: 'detail',
    title: '相对位置',
    purpose: '查看某个数值在整体数据中处于什么位置（偏高还是偏低）。',
    whenUse: '想知道“这个值算高还是低”，而不只是看绝对值时。',
    example: '某一天的销售额处于全部日期中的较高水平。',
    note: '如果该值不在当前数据范围内，结果是基于当前数据的估算。',
  },
  {
    key: 'outlier',
    type: 'detail',
    title: '离群值分析',
    purpose: '寻找与大多数数据明显不同的数据记录。',
    whenUse: '想找出可能的异常记录，并进一步判断它是否符合业务时。',
    example: '某日销售额远高于或远低于其他日期。',
    note: '异常值只是统计上的异常候选，不代表一定是错误数据。',
  },
  {
    key: 'relation',
    type: 'detail',
    title: '相关性分析',
    purpose: '查看两个指标是否存在同步变化的趋势。',
    whenUse: '想探究不同字段之间的联动关系时。',
    example: '订单数和销售额是否同时上升。',
    note: '相关关系不代表因果关系：两件事一起变动，不等于其中一件导致另一件。',
  },
  {
    key: 'timeseries',
    type: 'detail',
    title: '时间趋势',
    purpose: '查看数据随着时间变化的趋势。',
    whenUse: '数据中包含日期等时间字段，想观察数值随时间升跌时。',
    example: '每日销售额随日期的涨落曲线。',
    note: '个别日期缺数据时，折线可能在对应位置断开，属于正常现象。',
  },
  {
    key: 'record',
    type: 'detail',
    title: '记录定位',
    purpose: '通过唯一定位字段或时间字段，找到对应的某一条记录，并展示该记录的指标。',
    whenUse: '数据中包含明确的定位信息（如订单编号、设备编号）时。',
    example: '输入订单编号，定位到那一笔订单。',
    note: '如果数据不包含可定位的字段，系统不会强行匹配，而是会提示没有可定位字段。',
  },
  {
    key: 'external',
    type: 'short',
    title: '外部数据源',
    purpose: '连接外部业务系统，获取结构化数据进行分析。',
    whenUse: '数据不在本地文件里，而是由外部系统提供时。',
    note: '前端负责展示与分析，数据的来源和指标口径由外部系统提供。',
  },
  {
    key: 'ai',
    type: 'detail',
    title: 'AI 智能分析',
    purpose: '对已有的经营异常结果，给出原因性的解释说明，帮助理解“为什么会异常”。',
    whenUse: '经营异常列表已展示，想进一步了解异常产生的原因时。',
    example: '展示风险等级、关键影响因素、影响评估、优化建议。',
    note: 'AI 不会替代数据统计，也不会自动做业务决策；结果来自外部 AI 分析服务或规则兜底（FALLBACK）。',
  },
  {
    key: 'group_dimension',
    type: 'short',
    title: '分组维度',
    purpose: '决定按哪个类别对数据进行分组比较。',
    whenUse: '想查看不同类别（如地区、渠道）之间的差异时。',
    example: '选择“地区”后，各地区会被分别汇总统计。',
    note: '分组维度不同，分析视角不同；不选择表示不做分组。',
  },
  {
    key: 'filter_field',
    type: 'short',
    title: '筛选字段',
    purpose: '选择用哪个字段来设定筛选条件。',
    whenUse: '想只查看符合某个字段范围或条件的数据时。',
    example: '选择“销售额”字段，再设置范围进行筛选。',
    note: '筛选不会修改原始数据，只是临时换一个视角。',
  },
  {
    key: 'filter_condition',
    type: 'short',
    title: '筛选条件',
    purpose: '设置如何判断一行数据是否被保留。',
    whenUse: '想精确控制保留哪些数据时。',
    example: '“销售额 大于 10000”，只保留销售额超过 1 万的记录。',
    note: '多个条件之间为“同时满足”关系，全部成立才保留。',
  },
  {
    key: 'reference_value',
    type: 'short',
    title: '相对位置参考值',
    purpose: '输入一个数值，查看它在整体数据中所处的位置。',
    whenUse: '想知道某个具体值偏高还是偏低，而不仅是看绝对值时。',
    example: '输入 50000，查看它排在所有日期的什么位置。',
    note: '如果该值不在当前数据范围内，结果是基于当前数据的估算。',
  },
  {
    key: 'retail_date_range',
    type: 'short',
    title: '外部数据源日期范围',
    purpose: '设置要从外部系统加载哪一段日期的数据。',
    whenUse: '只想分析某一时间段内的业务数据时。',
    example: '选择开始与结束日期，拉取该时间段的数据。',
    note: '日期格式需要与外部系统约定保持一致。',
  },
  {
    key: 'filter_value',
    type: 'short',
    title: '筛选值',
    purpose: '填写筛选条件对应的目标值。',
    whenUse: '设置好筛选字段与条件后，需要给出比较的具体数值或文本时。',
    example: '条件为“销售额 大于”，则输入值填写 1000，表示保留销售额超过 1000 的记录。',
    note: '输入格式需与所选条件匹配（数值或文本）。',
  },
  {
    key: 'position_field',
    type: 'short',
    title: '相对位置分析字段',
    purpose: '选择需要计算相对位置的数值字段。',
    whenUse: '想查看某个数值在该字段整体分布中的位置时。',
    example: '选择“销售额”字段，查看某商品销售额在全部商品中的位置。',
    note: '仅数值字段可用于相对位置计算。',
  },
];

/** 按 key 获取帮助项；找不到时抛出错误，便于尽早发现接入错误 */
export function getHelp(key: string): HelpItem {
  const item = HELP_ITEMS.find(h => h.key === key);
  if (!item) {
    throw new Error(`未知帮助项：${key}`);
  }
  return item;
}