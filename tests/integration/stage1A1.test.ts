/**
 * 真实源码测试：Stage 1A-1 字段推断
 */
import { inferGenericFieldSchema } from '../../src/field-schema/inferGenericSchema.js';
import { resolveFieldSchema } from '../../src/field-schema/resolveFieldSchema.js';
import { mapLegacyFieldTypeToDataType } from '../../src/field-schema/legacyAdapter.js';

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

console.log('=== 真实源码测试：Stage 1A-1 字段推断 ===\n');

// ============================================================
// 测试 1：年龄字段（通用模式，基于内容推断）
// ============================================================
console.log('测试 1：年龄字段（通用模式）');
const ageHeader = '年龄';
const ageValues = ['18', '19', '20'];
const ageSchema = inferGenericFieldSchema(ageHeader, ageValues);

// "年龄" 不在关键词列表中，走内容推断
// ['18', '19', '20'] 都是数值，numericRatio = 1.0 > 0.8
// 应该推断为 number + metric + unspecified
assert('年龄：dataType 为 number', ageSchema.dataType === 'number', `actual=${ageSchema.dataType}`);
assert('年龄：analysisRole 为 metric', ageSchema.analysisRole === 'metric', `actual=${ageSchema.analysisRole}`);
assert('年龄：metricDirection 为 unspecified', ageSchema.metricDirection === 'unspecified', `actual=${ageSchema.metricDirection}`);
assert('年龄：inference.source 为 structure', ageSchema.inference.source === 'structure', `actual=${ageSchema.inference.source}`);

// ============================================================
// 测试 2：成绩字段（generic 模式）
// ============================================================
console.log('\n测试 2：成绩字段（generic 模式）');
const scoreHeader = '成绩';
const scoreValues = ['85.5', '92.0', '78.5'];
const scoreSchemaGeneric = inferGenericFieldSchema(scoreHeader, scoreValues);

// "成绩" 不在关键词列表中，走内容推断
// ['85.5', '92.0', '78.5'] 都是数值
// generic 模式不应自动套用教育模板
assert('成绩(generic)：dataType 为 number', scoreSchemaGeneric.dataType === 'number', `actual=${scoreSchemaGeneric.dataType}`);
assert('成绩(generic)：analysisRole 为 metric', scoreSchemaGeneric.analysisRole === 'metric', `actual=${scoreSchemaGeneric.analysisRole}`);
assert('成绩(generic)：metricDirection 为 unspecified', scoreSchemaGeneric.metricDirection === 'unspecified', `actual=${scoreSchemaGeneric.metricDirection}`);
assert('成绩(generic)：不自动生成 higher_is_better', scoreSchemaGeneric.metricDirection !== 'higher_is_better');

// ============================================================
// 测试 3：成绩字段（education 模式，通过 resolveFieldSchema）
// ============================================================
console.log('\n测试 3：成绩字段（education 模式）');
const scoreSchemaEducation = resolveFieldSchema(
  scoreHeader,
  scoreSchemaGeneric,
  { mode: 'education', columnValues: scoreValues }
);

// education 模式应该通过模板推荐
// 模板可能推荐 metric + higher_is_better
assert('成绩(education)：dataType 为 number', scoreSchemaEducation.dataType === 'number', `actual=${scoreSchemaEducation.dataType}`);
assert('成绩(education)：analysisRole 为 metric', scoreSchemaEducation.analysisRole === 'metric', `actual=${scoreSchemaEducation.analysisRole}`);
// 教育模板可能推荐 higher_is_better 或保持 unspecified
// 这里不强制要求，但 inferenceSource 应该反映来源
console.log(`  ℹ️  成绩(education)：metricDirection=${scoreSchemaEducation.metricDirection}, inferenceSource=${scoreSchemaEducation.inferenceSource}`);

// ============================================================
// 测试 4：优先级规则
// ============================================================
console.log('\n测试 4：优先级规则');

// 优先级 1：用户覆盖
const userOverrideSchema = {
  fieldId: 'test_field',
  sourceName: '测试字段',
  dataType: 'number' as const,
  analysisRole: 'metric' as const,
  metricDirection: 'higher_is_better' as const,
  userOverride: {
    dataType: 'number' as const,
    analysisRole: 'dimension' as const,
    metricDirection: 'lower_is_better' as const,
    reason: '用户明确指定',
  },
  inference: { source: 'structure' as const, confidence: 'high' as const, reasons: ['测试'] },
};
const resolvedUser = resolveFieldSchema('test_field', userOverrideSchema, { mode: 'generic' });
assert('优先级 1：用户覆盖 dataType', resolvedUser.dataType === 'number', `actual=${resolvedUser.dataType}`);
assert('优先级 1：用户覆盖 analysisRole', resolvedUser.analysisRole === 'dimension', `actual=${resolvedUser.analysisRole}`);
assert('优先级 1：用户覆盖 metricDirection', resolvedUser.metricDirection === 'lower_is_better', `actual=${resolvedUser.metricDirection}`);
assert('优先级 1：inferenceSource 为 user', resolvedUser.inferenceSource === 'user', `actual=${resolvedUser.inferenceSource}`);

// 优先级 2：模板推荐（education 模式）
const templateSchema = {
  fieldId: 'score',
  sourceName: '成绩',
  dataType: 'number' as const,
  analysisRole: 'metric' as const,
  metricDirection: 'unspecified' as const,
  inference: { source: 'structure' as const, confidence: 'high' as const, reasons: ['测试'] },
};
const resolvedTemplate = resolveFieldSchema('score', templateSchema, { mode: 'education' });
assert('优先级 2：模板推荐 dataType', resolvedTemplate.dataType === 'number', `actual=${resolvedTemplate.dataType}`);
assert('优先级 2：模板推荐 analysisRole', resolvedTemplate.analysisRole === 'metric', `actual=${resolvedTemplate.analysisRole}`);
// inferenceSource 可能是 name_rule 或 structure，取决于模板是否修改
console.log(`  ℹ️  模板推荐：inferenceSource=${resolvedTemplate.inferenceSource}`);

// 优先级 3：通用推断（无用户覆盖，generic 模式）
const genericSchema = {
  fieldId: 'value',
  sourceName: '数值',
  dataType: 'number' as const,
  analysisRole: 'metric' as const,
  metricDirection: 'unspecified' as const,
  inference: { source: 'structure' as const, confidence: 'high' as const, reasons: ['测试'] },
};
const resolvedGeneric = resolveFieldSchema('value', genericSchema, { mode: 'generic' });
assert('优先级 3：通用推断 dataType', resolvedGeneric.dataType === 'number', `actual=${resolvedGeneric.dataType}`);
assert('优先级 3：通用推断 inferenceSource', resolvedGeneric.inferenceSource === 'structure', `actual=${resolvedGeneric.inferenceSource}`);

// ============================================================
// 测试 5：旧类型兼容
// ============================================================
console.log('\n测试 5：旧类型兼容');
// 旧 FieldType 实际存在的类型：score, rank, bonus, penalty, category, status, identity, text, unknown
assert('score → number', mapLegacyFieldTypeToDataType('score') === 'number');
assert('rank → number', mapLegacyFieldTypeToDataType('rank') === 'number');
assert('bonus → number', mapLegacyFieldTypeToDataType('bonus') === 'number');
assert('penalty → number', mapLegacyFieldTypeToDataType('penalty') === 'number');
assert('category → category', mapLegacyFieldTypeToDataType('category') === 'category');
assert('status → category', mapLegacyFieldTypeToDataType('status') === 'category');
assert('text → text', mapLegacyFieldTypeToDataType('text') === 'text');
assert('identity → unknown（需上下文判断）', mapLegacyFieldTypeToDataType('identity') === 'unknown');
assert('unknown → unknown', mapLegacyFieldTypeToDataType('unknown') === 'unknown');

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
