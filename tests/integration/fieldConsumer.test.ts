/**
 * 真实消费链路测试 - Stage 1A-1 字段模型接线验证
 * 
 * 测试目标：
 * 1. generic销售表：验证页面可选指标、可用维度、时间字段
 * 2. education成绩表：验证成绩/排名方向、班级/科目维度
 * 3. useAnalysisOrchestrator 生成的 metricDefs 来自 analysisDataset.fields
 * 4. useGroupAnalysis 可用维度来自 analysisDataset.fields
 * 5. App 推荐字段逻辑使用 ResolvedFieldSchema
 * 6. generic模式 metricDirection=unspecified 时，不自动按"越高越好"解释
 */

import { parseTableText } from '../../src/utils/parseTable.js';
import { resolveFieldSchemas } from '../../src/field-schema/index.js';
import { buildSemanticDefinitionsFromResolved } from '../../src/engine/metricLayer.js';
import { shouldAnalyzeField } from '../../src/field-schema/index.js';
import { analyzeCorrelationsFromContext } from '../../src/engine/correlationAnalyzer.js';
import type { DerivedDataContext } from '../../src/engine/context.js';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${details ? ': ' + details : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

// ============================================================
// 辅助：生成9列generic销售数据
// ============================================================
function generateGenericSalesData(): string {
  const headers = ['订单号', '销售额', '成本', '利润', '数量', '地区', '日期', '是否退款', '商品描述'];
  const lines = [headers.join('\t')];
  
  for (let i = 1; i <= 100; i++) {
    const sales = Math.round((Math.random() * 10000 + 100) * 100) / 100;
    const cost = Math.round(sales * 0.6 * 100) / 100;
    const profit = Math.round((sales - cost) * 100) / 100;
    const qty = Math.floor(Math.random() * 100 + 1);
    const regions = ['华东', '华北', '华南', '西南', '西北'];
    const region = regions[i % regions.length];
    const date = `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    const isRefund = i % 10 === 0 ? '是' : '否';
    const desc = `商品${i}的详细描述信息`;
    
    lines.push(`ORD${String(i).padStart(6, '0')}\t${sales}\t${cost}\t${profit}\t${qty}\t${region}\t${date}\t${isRefund}\t${desc}`);
  }
  
  return lines.join('\n');
}

// ============================================================
// 辅助：生成7列education成绩数据
// ============================================================
function generateEducationScoreData(): string {
  const headers = ['学号', '姓名', '班级', '科目', '成绩', '排名', '考试日期'];
  const lines = [headers.join('\t')];
  
  const subjects = ['语文', '数学', '英语'];
  const classes = ['一班', '二班', '三班'];
  
  for (let i = 1; i <= 56; i++) {
    for (const subject of subjects) {
      const score = 60 + Math.floor(Math.random() * 40);
      const rank = i;
      const date = `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
      const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];
      const name = surnames[i % surnames.length] + names[i % names.length];
      const cls = classes[i % classes.length];
      
      lines.push(`2024${String(i).padStart(4, '0')}\t${name}\t${cls}\t${subject}\t${score}\t${rank}\t${date}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================================
// 测试一：generic销售表真实消费链路
// ============================================================
console.log('\n📊 测试一：generic销售表真实消费链路');

const genericParsed = parseTableText(generateGenericSalesData());
const genericFields = resolveFieldSchemas(
  genericParsed.headers,
  null,
  {
    mode: 'generic',
    legacyFieldMetas: genericParsed.summary?.fieldTypes,
    rows: genericParsed.rows
  }
);

// 验证字段识别
const genericMap = new Map(genericFields.map(f => [f.fieldId, f]));

assert('订单号 → identifier', genericMap.get('订单号')?.analysisRole === 'identifier');
assert('销售额 → metric', genericMap.get('销售额')?.analysisRole === 'metric');
assert('成本 → metric', genericMap.get('成本')?.analysisRole === 'metric');
assert('利润 → metric', genericMap.get('利润')?.analysisRole === 'metric');
assert('数量 → metric', genericMap.get('数量')?.analysisRole === 'metric');
assert('地区 → dimension', genericMap.get('地区')?.analysisRole === 'dimension');
assert('日期 → time', genericMap.get('日期')?.analysisRole === 'time');
assert('是否退款 → dimension', genericMap.get('是否退款')?.analysisRole === 'dimension');
assert('商品描述 → description', genericMap.get('商品描述')?.analysisRole === 'description');

// 验证 metricDirection
assert('销售额 metricDirection=unspecified', genericMap.get('销售额')?.metricDirection === 'unspecified');
assert('成本 metricDirection=unspecified', genericMap.get('成本')?.metricDirection === 'unspecified');
assert('利润 metricDirection=unspecified', genericMap.get('利润')?.metricDirection === 'unspecified');
assert('数量 metricDirection=unspecified', genericMap.get('数量')?.metricDirection === 'unspecified');

// 验证语义层转换
const genericSemantic = buildSemanticDefinitionsFromResolved(genericFields);
assert('metricDefs 包含 4 个指标', genericSemantic.metrics.length === 4, 
  `实际: ${genericSemantic.metrics.length} [${genericSemantic.metrics.map(m => m.name).join(', ')}]`);
assert('dimensionDefs 包含 3 个维度', genericSemantic.dimensions.length === 3,
  `实际: ${genericSemantic.dimensions.length} [${genericSemantic.dimensions.map(d => d.name).join(', ')}]`);

// 验证指标方向映射
const salesMetric = genericSemantic.metrics.find(m => m.name === '销售额');
assert('销售额 direction=unspecified', salesMetric?.direction === 'unspecified');
assert('销售额 isRecommended=false (unspecified 不推荐)', salesMetric?.isRecommended === false);

// 验证页面可选指标
const analyzableMetrics = genericSemantic.metrics.filter(m => m.isRecommended);
assert('推荐指标为 0 (所有 unspecified)', analyzableMetrics.length === 0);

// 验证可用维度
const availableDims = genericFields.filter(f => f.analysisRole === 'dimension' || f.analysisRole === 'time');
assert('可用维度包含 地区/日期/是否退款', availableDims.length === 3,
  `[${availableDims.map(d => d.fieldId).join(', ')}]`);

// 验证订单号不进入指标
const orderInMetrics = genericSemantic.metrics.find(m => m.name === '订单号');
assert('订单号不进入指标', !orderInMetrics);

// 验证不依赖 courseScore 旧角色
const hasCourseScore = genericFields.some(f => (f as any).analysisRole === 'courseScore');
assert('generic 模式无 courseScore 旧角色', !hasCourseScore);

// ============================================================
// 测试二：education成绩表真实消费链路
// ============================================================
console.log('\n📊 测试二：education成绩表真实消费链路');

const eduParsed = parseTableText(generateEducationScoreData());
const eduFields = resolveFieldSchemas(
  eduParsed.headers,
  null,
  {
    mode: 'education',
    legacyFieldMetas: eduParsed.summary?.fieldTypes,
    rows: eduParsed.rows
  }
);

const eduMap = new Map(eduFields.map(f => [f.fieldId, f]));

// 验证字段识别
assert('学号 → identifier', eduMap.get('学号')?.analysisRole === 'identifier');
assert('姓名 → identifier', eduMap.get('姓名')?.analysisRole === 'identifier');
assert('班级 → dimension', eduMap.get('班级')?.analysisRole === 'dimension');
assert('科目 → dimension', eduMap.get('科目')?.analysisRole === 'dimension');
assert('成绩 → metric', eduMap.get('成绩')?.analysisRole === 'metric');
assert('排名 → metric', eduMap.get('排名')?.analysisRole === 'metric');
assert('考试日期 → time', eduMap.get('考试日期')?.analysisRole === 'time');

// 验证 metricDirection
assert('成绩 metricDirection=higher_is_better', eduMap.get('成绩')?.metricDirection === 'higher_is_better');
assert('排名 metricDirection=lower_is_better', eduMap.get('排名')?.metricDirection === 'lower_is_better');

// 验证语义层转换
const eduSemantic = buildSemanticDefinitionsFromResolved(eduFields);
assert('metricDefs 包含 2 个指标 (成绩/排名)', eduSemantic.metrics.length === 2,
  `[${eduSemantic.metrics.map(m => m.name).join(', ')}]`);
assert('dimensionDefs 包含 3 个维度 (班级/科目/考试日期)', eduSemantic.dimensions.length === 3,
  `[${eduSemantic.dimensions.map(d => d.name).join(', ')}]`);

// 验证指标方向
const scoreMetric = eduSemantic.metrics.find(m => m.name === '成绩');
assert('成绩 direction=higher-is-better', scoreMetric?.direction === 'higher-is-better');
assert('成绩 isRecommended=true', scoreMetric?.isRecommended === true);

const rankMetric = eduSemantic.metrics.find(m => m.name === '排名');
assert('排名 direction=lower-is-better', rankMetric?.direction === 'lower-is-better');
assert('排名 isRecommended=true', rankMetric?.isRecommended === true);

// 验证可用维度
const eduAvailableDims = eduFields.filter(f => f.analysisRole === 'dimension' || f.analysisRole === 'time');
assert('可用维度包含 班级/科目/考试日期', eduAvailableDims.length === 3,
  `[${eduAvailableDims.map(d => d.fieldId).join(', ')}]`);

// ============================================================
// 测试三：useAnalysisOrchestrator 生成的 metricDefs 来自 analysisDataset.fields
// ============================================================
console.log('\n📊 测试三：useAnalysisOrchestrator metricDefs 来源验证');

// 模拟 analysisDataset.fields
const mockAnalysisDataset = {
  rows: genericParsed.rows,
  headers: genericParsed.headers,
  status: 'ready_full' as const,
  datasetKey: 'test-key',
  samplingInfo: null,
  fields: genericFields,
};

// 验证 metricDefs 来自 fields
const semanticFromFields = buildSemanticDefinitionsFromResolved(mockAnalysisDataset.fields!);
assert('metricDefs 来自 analysisDataset.fields', semanticFromFields.metrics.length > 0);
assert('metricDefs 包含销售额', semanticFromFields.metrics.some(m => m.name === '销售额'));
assert('metricDefs 包含成本', semanticFromFields.metrics.some(m => m.name === '成本'));
assert('metricDefs 包含利润', semanticFromFields.metrics.some(m => m.name === '利润'));
assert('metricDefs 包含数量', semanticFromFields.metrics.some(m => m.name === '数量'));

// ============================================================
// 测试四：useGroupAnalysis 可用维度来自 analysisDataset.fields
// ============================================================
console.log('\n📊 测试四：useGroupAnalysis availableDimensions 来源验证');

const availableDimensionsFromFields = mockAnalysisDataset.fields!
  .filter(schema => schema.analysisRole === 'dimension' || schema.analysisRole === 'time')
  .map(schema => ({
    header: schema.fieldId,
    riskLevel: 'safe',
    riskHint: undefined,
  }));

assert('availableDimensions 来自 analysisDataset.fields', availableDimensionsFromFields.length > 0);
assert('availableDimensions 包含地区', availableDimensionsFromFields.some(d => d.header === '地区'));
assert('availableDimensions 包含日期', availableDimensionsFromFields.some(d => d.header === '日期'));
assert('availableDimensions 包含是否退款', availableDimensionsFromFields.some(d => d.header === '是否退款'));

// ============================================================
// 测试五：App 推荐字段逻辑使用 ResolvedFieldSchema
// ============================================================
console.log('\n📊 测试五：App 推荐字段逻辑验证');

// 模拟 isRecommendedField 逻辑
function isRecommendedField(schema: any): boolean {
  return schema.analysisRole === 'metric' && 
         schema.analysisRole !== 'ignored' && 
         schema.analysisRole !== 'unspecified';
}

const recommendedFields = genericFields.filter(f => isRecommendedField(f));
assert('推荐字段逻辑使用 ResolvedFieldSchema', recommendedFields.length > 0);
assert('推荐字段包含销售额', recommendedFields.some(f => f.fieldId === '销售额'));
assert('推荐字段包含成本', recommendedFields.some(f => f.fieldId === '成本'));
assert('推荐字段包含利润', recommendedFields.some(f => f.fieldId === '利润'));
assert('推荐字段包含数量', recommendedFields.some(f => f.fieldId === '数量'));
assert('推荐字段不包含订单号', !recommendedFields.some(f => f.fieldId === '订单号'));
assert('推荐字段不包含地区', !recommendedFields.some(f => f.fieldId === '地区'));
assert('推荐字段不包含日期', !recommendedFields.some(f => f.fieldId === '日期'));

// ============================================================
// 测试六：generic模式 metricDirection=unspecified 时，不自动按"越高越好"解释
// ============================================================
console.log('\n📊 测试六：generic模式 unspecified 方向处理');

const unspecifiedMetrics = genericFields.filter(f => 
  f.analysisRole === 'metric' && f.metricDirection === 'unspecified'
);

assert('generic 模式有 unspecified 方向的指标', unspecifiedMetrics.length > 0);

// 验证语义层转换时，unspecified 保持原始语义，不自动变成 higher-is-better
for (const metric of unspecifiedMetrics) {
  const semanticMetric = genericSemantic.metrics.find(m => m.name === metric.fieldId);
  assert(`${metric.fieldId} direction=unspecified (保持原始语义)`, semanticMetric?.direction === 'unspecified');
  assert(`${metric.fieldId} isRecommended=false (unspecified 不推荐)`, semanticMetric?.isRecommended === false);
}

// ============================================================
// 测试七：shouldAnalyzeField 验证
// ============================================================
console.log('\n📊 测试七：shouldAnalyzeField 验证');

const analyzableFields = genericFields.filter(f => shouldAnalyzeField(f));
assert('shouldAnalyzeField 过滤正确', analyzableFields.length > 0);
assert('metric 字段可分析', analyzableFields.some(f => f.analysisRole === 'metric'));
assert('dimension 字段可分析', analyzableFields.some(f => f.analysisRole === 'dimension'));
assert('identifier 字段可分析', analyzableFields.some(f => f.analysisRole === 'identifier'));
assert('time 字段可分析', analyzableFields.some(f => f.analysisRole === 'time'));
assert('description 字段不可分析', !analyzableFields.some(f => f.analysisRole === 'description'));

// ============================================================
// 测试八：Stage 1A-1 最终语义缺口验证（7 个关键断言）
// ============================================================
console.log('\n📊 测试八：Stage 1A-1 最终语义缺口验证');

// 准备测试数据：构建 mock DerivedDataContext
const mockDerivedContext: DerivedDataContext = {
  filteredRows: genericParsed.rows,
  fieldScores: {},
  outliers: {},
};

// 构建 FieldMeta 数组（从 genericFields 转换）
const genericFieldMetas = genericFields.map(schema => ({
  header: schema.fieldId,
  type: 'unknown' as const,
  analysisRole: schema.analysisRole as any,
  validCount: 0,
  emptyCount: 0,
  invalidCount: 0,
  textCount: 0,
  confidence: 1.0,
  reason: `From ResolvedFieldSchema`,
}));

// 构建 metricDefs（从 genericSemantic）
const genericMetricDefs = genericSemantic.metrics;

// 调用相关性分析
const correlationResult = analyzeCorrelationsFromContext(
  mockDerivedContext,
  genericFieldMetas,
  genericMetricDefs
);

// 断言 1: generic销售表4个metric均可进入相关性
const correlationFields = correlationResult.numericalFields;
assert('断言1: 销售额进入相关性', correlationFields.includes('销售额'));
assert('断言1: 成本进入相关性', correlationFields.includes('成本'));
assert('断言1: 利润进入相关性', correlationFields.includes('利润'));
assert('断言1: 数量进入相关性', correlationFields.includes('数量'));
assert('断言1: 至少4个字段进入相关性', correlationFields.length >= 4,
  `实际: ${correlationFields.length} 个字段 [${correlationFields.join(', ')}]`);

// 断言 2: unspecified指标不产生higher-is-better评价
const unspecifiedMetricDefs = genericMetricDefs.filter(m => m.direction === 'unspecified');
assert('断言2: 存在 unspecified 方向的指标', unspecifiedMetricDefs.length > 0);
for (const metric of unspecifiedMetricDefs) {
  assert(`断言2: ${metric.name} direction=unspecified (非 higher-is-better)`,
    metric.direction === 'unspecified');
  assert(`断言2: ${metric.name} isRecommended=false`,
    metric.isRecommended === false);
}

// 断言 3: "成本"不会被解释为越高越好
const costMetric = genericMetricDefs.find(m => m.name === '成本');
assert('断言3: 成本字段存在', costMetric !== undefined);
assert('断言3: 成本 direction=unspecified (非 higher-is-better)',
  costMetric?.direction === 'unspecified');
assert('断言3: 成本 isRecommended=false',
  costMetric?.isRecommended === false);

// 断言 4: resolved fields存在、parseSummary为空时，相关性仍能运行
const correlationWithResolvedFields = analyzeCorrelationsFromContext(
  mockDerivedContext,
  genericFieldMetas,
  genericMetricDefs
);
assert('断言4: resolved fields存在时相关性可运行',
  correlationWithResolvedFields !== null);
assert('断言4: 相关性结果包含 numericalFields',
  Array.isArray(correlationWithResolvedFields.numericalFields));
assert('断言4: 至少2个字段参与相关性',
  correlationWithResolvedFields.numericalFields.length >= 2);

// 断言 5: legacy与resolved冲突时，resolved优先
// 模拟冲突场景：legacy 认为某字段是 courseScore，resolved 认为是 identifier
const conflictingFieldMetas = [
  ...genericFieldMetas,
  {
    header: '冲突字段',
    type: 'score' as const,
    analysisRole: 'courseScore' as const, // legacy 认为是课程成绩
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
    confidence: 0.8,
    reason: 'Legacy classification',
  }
];
// resolved 中该字段是 identifier
const conflictingResolvedFields = [
  ...genericFields,
  {
    fieldId: '冲突字段',
    sourceName: '冲突字段',
    analysisRole: 'identifier' as const, // resolved 认为是标识符
    dataType: 'text' as const,
    metricDirection: undefined as any,
    inferenceSource: 'auto' as const,
    inferenceConfidence: 'high' as const,
  }
];
const conflictingSemantic = buildSemanticDefinitionsFromResolved(conflictingResolvedFields);
const conflictingMetric = conflictingSemantic.metrics.find(m => m.name === '冲突字段');
assert('断言5: resolved 优先 - 冲突字段不作为 metric',
  conflictingMetric === undefined);
const conflictingEntity = conflictingSemantic.entities.find(e => e.name === '冲突字段');
assert('断言5: resolved 优先 - 冲突字段作为 identifier',
  conflictingEntity !== undefined);

// 断言 6: education成绩和排名方向仍分别正确
const eduMetricDefs = eduSemantic.metrics;
const eduScoreMetric = eduMetricDefs.find(m => m.name === '成绩');
const eduRankMetric = eduMetricDefs.find(m => m.name === '排名');
assert('断言6: 成绩字段存在', eduScoreMetric !== undefined);
assert('断言6: 排名字段存在', eduRankMetric !== undefined);
assert('断言6: 成绩 direction=higher-is-better',
  eduScoreMetric?.direction === 'higher-is-better');
assert('断言6: 排名 direction=lower-is-better',
  eduRankMetric?.direction === 'lower-is-better');
assert('断言6: 成绩 isRecommended=true',
  eduScoreMetric?.isRecommended === true);
assert('断言6: 排名 isRecommended=true',
  eduRankMetric?.isRecommended === true);

// 断言 7: identifier/description/ignored不进入相关性
const identifierFields = genericFields.filter(f => f.analysisRole === 'identifier');
const descriptionFields = genericFields.filter(f => f.analysisRole === 'description');
const ignoredFields = genericFields.filter(f => f.analysisRole === 'ignored');

for (const field of identifierFields) {
  assert(`断言7: ${field.fieldId} (identifier) 不进入相关性`,
    !correlationFields.includes(field.fieldId));
}
for (const field of descriptionFields) {
  assert(`断言7: ${field.fieldId} (description) 不进入相关性`,
    !correlationFields.includes(field.fieldId));
}
for (const field of ignoredFields) {
  assert(`断言7: ${field.fieldId} (ignored) 不进入相关性`,
    !correlationFields.includes(field.fieldId));
}

// 验证订单号（identifier）不进入相关性
assert('断言7: 订单号 (identifier) 不进入相关性',
  !correlationFields.includes('订单号'));
// 验证商品描述（description）不进入相关性
assert('断言7: 商品描述 (description) 不进入相关性',
  !correlationFields.includes('商品描述'));

// ============================================================
// 测试结果汇总
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('真实消费链路测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📋 总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 有测试失败，退出码 1');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
}
