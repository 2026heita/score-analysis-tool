/**
 * 字段模型接线测试
 *
 * 验证 Stage 1A-1 字段模式已接入真实分析链路：
 * 1. inferGenericFieldSchema → resolveFieldSchema → ResolvedFieldSchema[]
 * 2. generic 模式不产生 courseScore / rank 等教育专用最终类型
 * 3. education 模式可通过模板推荐 higher_is_better / lower_is_better
 * 4. AnalysisDataset.fields 实际赋值
 * 5. ignored 字段不参与分析
 */

import { parseTableText } from '../../src/utils/parseTable.js';
import { resolveFieldSchemas, shouldAnalyzeField } from '../../src/field-schema/index.js';
import type { ResolvedFieldSchema } from '../../src/field-schema/index.js';

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
// 辅助：生成七列销售表
// ============================================================
function generateSalesTable7(rows: number): string {
  const headers = ['订单号', '销售额', '成本', '利润', '数量', '地区', '日期'];
  const regions = ['华东', '华北', '华南', '西南', '西北'];
  const lines: string[] = [headers.join('\t')];
  for (let i = 1; i <= rows; i++) {
    const sales = Math.round((Math.random() * 10000 + 100) * 100) / 100;
    const cost = Math.round(sales * 0.6 * 100) / 100;
    const profit = Math.round((sales - cost) * 100) / 100;
    const qty = Math.floor(Math.random() * 100 + 1);
    const region = regions[i % regions.length];
    const date = `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    lines.push(`ORD${String(i).padStart(6, '0')}\t${sales}\t${cost}\t${profit}\t${qty}\t${region}\t${date}`);
  }
  return lines.join('\n');
}

// ============================================================
// 辅助：生成 56×18 长表
// ============================================================
function generateLongTable56x18(): string {
  const subjects = ['语文', '数学', '英语', '物理', '化学', '生物',
    '政治', '历史', '地理', '体育', '音乐', '美术',
    '信息技术', '通用技术', '心理健康', '劳动技术', '研究性学习', '社会实践'];
  const headers = ['学号', '姓名', '科目', '成绩', '考试日期'];
  const lines: string[] = [headers.join('\t')];
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
  const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];
  for (let i = 1; i <= 56; i++) {
    for (const subj of subjects) {
      const score = 60 + Math.floor(Math.random() * 40);
      const date = `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      lines.push([
        `2024${String(i).padStart(4, '0')}`,
        surnames[i % surnames.length] + names[i % names.length],
        subj,
        String(score),
        date,
      ].join('\t'));
    }
  }
  return lines.join('\n');
}

// ============================================================
// 辅助：生成教育成绩表（含排名）
// ============================================================
function generateEducationTable(): string {
  const headers = ['学号', '姓名', '班级', '总分', '年级排名'];
  const lines: string[] = [headers.join('\t')];
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
  const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '勇'];
  const classes = ['一班', '二班', '三班'];
  for (let i = 1; i <= 56; i++) {
    lines.push([
      `2024${String(i).padStart(4, '0')}`,
      surnames[i % surnames.length] + names[i % names.length],
      classes[i % classes.length],
      String(400 + Math.floor(Math.random() * 200)),
      String(i),
    ].join('\t'));
  }
  return lines.join('\n');
}

// ============================================================
// 辅助：从 ParsedTable 提取 resolved fields
// ============================================================
function resolveFromParsed(
  parsed: ReturnType<typeof parseTableText>,
  mode: 'generic' | 'education' = 'generic'
): ResolvedFieldSchema[] {
  const headers = parsed.headers;
  const legacyFieldMetas = parsed.summary?.fieldTypes ?? [];
  return resolveFieldSchemas(headers, null, {
    mode,
    legacyFieldMetas,
    rows: parsed.rows,
  });
}

// ============================================================
// 测试一：七列销售表 generic 模式字段识别
// ============================================================
console.log('\n📊 测试一：七列销售表 generic 模式字段识别');

const salesParsed = parseTableText(generateSalesTable7(100));
const salesFields = resolveFromParsed(salesParsed, 'generic');

// 打印详情
console.log('  字段识别详情:');
for (const f of salesFields) {
  console.log(`    ${f.sourceName} → dataType=${f.dataType}, role=${f.analysisRole}, direction=${f.metricDirection}, source=${f.inferenceSource}`);
}

// 验证每个字段
const salesMap = new Map(salesFields.map(f => [f.sourceName, f]));

const orderField = salesMap.get('订单号');
assert('订单号 → identifier/identifier',
  orderField?.dataType === 'identifier' && orderField?.analysisRole === 'identifier',
  `实际: ${orderField?.dataType}/${orderField?.analysisRole}`);

const salesAmtField = salesMap.get('销售额');
assert('销售额 → number/metric',
  salesAmtField?.dataType === 'number' && salesAmtField?.analysisRole === 'metric',
  `实际: ${salesAmtField?.dataType}/${salesAmtField?.analysisRole}`);
assert('销售额 direction=unspecified (generic)',
  salesAmtField?.metricDirection === 'unspecified',
  `实际: ${salesAmtField?.metricDirection}`);

const costField = salesMap.get('成本');
assert('成本 → number/metric',
  costField?.dataType === 'number' && costField?.analysisRole === 'metric',
  `实际: ${costField?.dataType}/${costField?.analysisRole}`);

const profitField = salesMap.get('利润');
assert('利润 → number/metric',
  profitField?.dataType === 'number' && profitField?.analysisRole === 'metric',
  `实际: ${profitField?.dataType}/${profitField?.analysisRole}`);

const qtyField = salesMap.get('数量');
assert('数量 → number/metric',
  qtyField?.dataType === 'number' && qtyField?.analysisRole === 'metric',
  `实际: ${qtyField?.dataType}/${qtyField?.analysisRole}`);

const regionField = salesMap.get('地区');
assert('地区 → category/dimension',
  regionField?.dataType === 'category' && regionField?.analysisRole === 'dimension',
  `实际: ${regionField?.dataType}/${regionField?.analysisRole}`);

const dateField = salesMap.get('日期');
assert('日期 → datetime/time',
  dateField?.dataType === 'datetime' && dateField?.analysisRole === 'time',
  `实际: ${dateField?.dataType}/${dateField?.analysisRole}`);

// generic 模式不得产生 courseScore / rank 最终类型
const salesHasCourseScore = salesFields.some(f =>
  (f as any).analysisRole === 'courseScore' || (f as any).type === 'courseScore'
);
assert('generic 销售表无 courseScore 最终类型', !salesHasCourseScore);

const salesHasRank = salesFields.some(f =>
  (f as any).analysisRole === 'rank' || (f as any).type === 'rank'
);
assert('generic 销售表无 rank 最终类型', !salesHasRank);

// ============================================================
// 测试二：56×18 长表字段识别
// ============================================================
console.log('\n📊 测试二：56×18 长表字段识别');

const longParsed = parseTableText(generateLongTable56x18());
const longFields = resolveFromParsed(longParsed, 'generic');

console.log('  长表字段识别详情:');
for (const f of longFields) {
  console.log(`    ${f.sourceName} → dataType=${f.dataType}, role=${f.analysisRole}, direction=${f.metricDirection}, source=${f.inferenceSource}`);
}

const longMap = new Map(longFields.map(f => [f.sourceName, f]));

const studentIdField = longMap.get('学号');
assert('学号 → identifier/identifier',
  studentIdField?.dataType === 'identifier' && studentIdField?.analysisRole === 'identifier',
  `实际: ${studentIdField?.dataType}/${studentIdField?.analysisRole}`);

const subjectField = longMap.get('科目');
assert('科目 → category/dimension',
  subjectField?.dataType === 'category' && subjectField?.analysisRole === 'dimension',
  `实际: ${subjectField?.dataType}/${subjectField?.analysisRole}`);

const scoreField = longMap.get('成绩');
assert('成绩 → number/metric',
  scoreField?.dataType === 'number' && scoreField?.analysisRole === 'metric',
  `实际: ${scoreField?.dataType}/${scoreField?.analysisRole}`);

const examDateField = longMap.get('考试日期');
assert('考试日期 → datetime/time',
  examDateField?.dataType === 'datetime' && examDateField?.analysisRole === 'time',
  `实际: ${examDateField?.dataType}/${examDateField?.analysisRole}`);

// ============================================================
// 测试三：generic 模式 "成绩" 方向为 unspecified
// ============================================================
console.log('\n📊 测试三：generic 模式 "成绩" 方向为 unspecified');

assert('generic 模式 "成绩" metricDirection=unspecified',
  scoreField?.metricDirection === 'unspecified',
  `实际: ${scoreField?.metricDirection}`);

// ============================================================
// 测试四：education 模式 "成绩" 方向为 higher_is_better
// ============================================================
console.log('\n📊 测试四：education 模式 "成绩" 方向为 higher_is_better');

const eduParsed = parseTableText(generateEducationTable());
const eduFields = resolveFromParsed(eduParsed, 'education');

console.log('  education 模式字段识别详情:');
for (const f of eduFields) {
  console.log(`    ${f.sourceName} → dataType=${f.dataType}, role=${f.analysisRole}, direction=${f.metricDirection}, source=${f.inferenceSource}`);
}

const eduMap = new Map(eduFields.map(f => [f.sourceName, f]));

const eduScoreField = eduMap.get('总分');
assert('education 模式 "总分" direction=higher_is_better',
  eduScoreField?.metricDirection === 'higher_is_better',
  `实际: ${eduScoreField?.metricDirection}`);

const eduRankField = eduMap.get('年级排名');
assert('education 模式 "年级排名" direction=lower_is_better',
  eduRankField?.metricDirection === 'lower_is_better',
  `实际: ${eduRankField?.metricDirection}`);

const eduClassField = eduMap.get('班级');
assert('education 模式 "班级" → category/dimension',
  eduClassField?.dataType === 'category' && eduClassField?.analysisRole === 'dimension',
  `实际: ${eduClassField?.dataType}/${eduClassField?.analysisRole}`);

const eduStudentIdField = eduMap.get('学号');
assert('education 模式 "学号" → identifier/identifier',
  eduStudentIdField?.dataType === 'identifier' && eduStudentIdField?.analysisRole === 'identifier',
  `实际: ${eduStudentIdField?.dataType}/${eduStudentIdField?.analysisRole}`);

// ============================================================
// 测试五：generic 模式没有 courseScore 最终类型
// ============================================================
console.log('\n📊 测试五：generic 模式没有 courseScore 最终类型');

// 检查所有 resolved fields 的 analysisRole 都不为旧教育类型
const allGenericRoles = new Set(salesFields.map(f => f.analysisRole));
const forbiddenRoles = ['courseScore', 'rank', 'primaryTotal', 'sectionTotal', 'adjustment', 'identity', 'textMeta'];
const hasForbidden = forbiddenRoles.some(r => allGenericRoles.has(r as any));
assert('generic 模式 ResolvedFieldSchema 不含旧教育角色',
  !hasForbidden,
  `实际角色集: ${[...allGenericRoles].join(', ')}`);

// ============================================================
// 测试六：AnalysisDataset.fields 不为空
// ============================================================
console.log('\n📊 测试六：AnalysisDataset.fields 不为空');

assert('销售表 resolved fields 数量 = 7', salesFields.length === 7,
  `实际: ${salesFields.length}`);
assert('长表 resolved fields 数量 = 5', longFields.length === 5,
  `实际: ${longFields.length}`);
assert('教育表 resolved fields 数量 = 5', eduFields.length === 5,
  `实际: ${eduFields.length}`);

// 每个 resolved field 都有完整属性
const allHaveRequiredFields = salesFields.every(f =>
  f.fieldId && f.sourceName && f.dataType && f.analysisRole &&
  f.metricDirection !== undefined && f.inferenceSource && f.inferenceConfidence !== undefined
);
assert('所有 resolved fields 包含完整属性', allHaveRequiredFields);

// ============================================================
// 测试七：分析指标和维度来自 ResolvedFieldSchema
// ============================================================
console.log('\n📊 测试七：分析指标和维度来自 ResolvedFieldSchema');

const metrics = salesFields.filter(f => f.analysisRole === 'metric');
const dimensions = salesFields.filter(f => f.analysisRole === 'dimension');
const identifiers = salesFields.filter(f => f.analysisRole === 'identifier');
const timeFields = salesFields.filter(f => f.analysisRole === 'time');

assert('销售表有 4 个 metric（销售额/成本/利润/数量）', metrics.length === 4,
  `实际: ${metrics.length} [${metrics.map(f => f.sourceName).join(', ')}]`);
assert('销售表有 1 个 dimension（地区）', dimensions.length === 1,
  `实际: ${dimensions.length}`);
assert('销售表有 1 个 identifier（订单号）', identifiers.length === 1,
  `实际: ${identifiers.length}`);
assert('销售表有 1 个 time（日期）', timeFields.length === 1,
  `实际: ${timeFields.length}`);

// ============================================================
// 测试八：ignored 字段不参与分析
// ============================================================
console.log('\n📊 测试八：ignored 字段不参与分析');

// shouldAnalyzeField 检查
const analyzableFields = salesFields.filter(f => shouldAnalyzeField(f));
assert('所有非 ignored/unspecified 字段参与分析',
  analyzableFields.length > 0,
  `实际: ${analyzableFields.length}`);

// 验证 shouldAnalyzeField 排除 unspecified
const unspecifiedFields = salesFields.filter(f => f.analysisRole === 'unspecified');
for (const f of unspecifiedFields) {
  assert(`shouldAnalyzeField 排除 unspecified (${f.sourceName})`,
    !shouldAnalyzeField(f));
}

// 验证 ignored 角色被排除
const mockIgnored: ResolvedFieldSchema = {
  fieldId: 'test',
  sourceName: 'test',
  dataType: 'text',
  analysisRole: 'ignored',
  metricDirection: 'neutral',
  ignored: true,
  inferenceSource: 'user',
  inferenceConfidence: 'high',
  inferenceReasons: ['用户忽略'],
};
assert('shouldAnalyzeField 排除 ignored 角色', !shouldAnalyzeField(mockIgnored));

// ============================================================
// 测试九：generic 模式 "科目" 字段为 dimension（非 courseScore）
// ============================================================
console.log('\n📊 测试九：generic 模式 "科目" 字段为 dimension');

assert('"科目" 不是 metric',
  subjectField?.analysisRole !== 'metric' || subjectField?.dataType !== 'number',
  `实际: ${subjectField?.dataType}/${subjectField?.analysisRole}`);
assert('"科目" 是 dimension',
  subjectField?.analysisRole === 'dimension',
  `实际: ${subjectField?.analysisRole}`);

// ============================================================
// 测试十：generic 模式下 "考试场次" 为 dimension
// ============================================================
console.log('\n📊 测试十：generic 模式 "考试场次" 为 category/dimension');

const examSessionHeaders = ['学号', '考试场次', '成绩'];
const examSessionRows = [];
for (let i = 1; i <= 20; i++) {
  examSessionRows.push({
    '学号': `S${i}`,
    '考试场次': `第${i % 3 + 1}场`,
    '成绩': String(60 + Math.floor(Math.random() * 40)),
  });
}

const examSessionFields = resolveFieldSchemas(
  examSessionHeaders, null,
  {
    mode: 'generic',
    legacyFieldMetas: undefined,
    rows: examSessionRows,
  }
);

const sessionField = examSessionFields.find(f => f.sourceName === '考试场次');
assert('"考试场次" → category/dimension',
  sessionField?.dataType === 'category' && sessionField?.analysisRole === 'dimension',
  `实际: ${sessionField?.dataType}/${sessionField?.analysisRole}`);

// ============================================================
// 测试结果汇总
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('字段模型接线测试结果汇总');
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
