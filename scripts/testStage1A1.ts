/**
 * Stage 1A-1 验收测试脚本
 * 执行: npx tsc -p tsconfig.test.json && node dist-test/scripts/testStage1A1.js
 *
 * 测试覆盖：
 * 1. 通用字段推断（12 项）
 * 2. 教育模板（7 项）
 * 3. 优先级（6 项）
 * 4. 方向规则（4 项）
 * 5. 旧模型兼容（4 项）
 * 6. 边界情况（4 项）
 * 
 * 总计：37 项测试
 */

import { strict as assert } from 'assert';
import {
  inferGenericFieldSchema,
  applyEducationTemplate,
  resolveFieldSchema,
  mapLegacyFieldMetaToSchema,
  shouldAnalyzeField,
  shouldGenerateDirectionEvaluation,
} from '../src/field-schema/index.js';
import type { FieldSchema, ResolvedFieldSchema } from '../src/field-schema/types.js';
import type { FieldMeta } from '../src/utils/tableParser/types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${error}`);
    failed++;
  }
}

console.log('=== Stage 1A-1 验收测试 ===\n');

// ============================================================
// 1. 通用字段推断测试
// ============================================================

console.log('【1】通用字段推断');

test('数值字段推断', () => {
  const schema = inferGenericFieldSchema('销售额', ['100', '200', '300', '400', '500']);
  assert.equal(schema.dataType, 'number');
  assert.equal(schema.analysisRole, 'metric');
  assert.equal(schema.metricDirection, 'unspecified');
});

test('类别字段推断', () => {
  const schema = inferGenericFieldSchema('地区', ['北京', '上海', '广州', '深圳', '杭州']);
  assert.equal(schema.dataType, 'category');
  assert.equal(schema.analysisRole, 'dimension');
  assert.equal(schema.metricDirection, 'neutral');
});

test('日期字段推断', () => {
  const schema = inferGenericFieldSchema('创建时间', ['2024-01-01', '2024-01-02', '2024-01-03']);
  assert.equal(schema.dataType, 'datetime');
  assert.equal(schema.analysisRole, 'time');
  assert.equal(schema.metricDirection, 'neutral');
});

test('布尔字段推断', () => {
  const schema = inferGenericFieldSchema('是否有效', ['是', '否', '是', '否', '是']);
  assert.equal(schema.dataType, 'boolean');
  assert.equal(schema.analysisRole, 'dimension');
  assert.equal(schema.metricDirection, 'neutral');
});

test('文本字段推断', () => {
  const schema = inferGenericFieldSchema('备注', [
    '这是一段很长的备注内容',
    '另一段备注',
    '还有更多文字',
    '继续添加',
    '最后一条'
  ]);
  assert.equal(schema.dataType, 'text');
  assert.equal(schema.analysisRole, 'description');
  assert.equal(schema.metricDirection, 'neutral');
});

test('标识符字段推断', () => {
  const schema = inferGenericFieldSchema('订单号', ['12345', '67890', '11111', '22222', '33333']);
  assert.equal(schema.dataType, 'identifier');
  assert.equal(schema.analysisRole, 'identifier');
  assert.equal(schema.metricDirection, 'neutral');
});

test('未知字段推断', () => {
  // 5个唯一短文本值 → numericRatio=0, uniqueRatio=1.0, avgStringLength=1
  // 走到"普通文本"分支，返回 text/description
  const schema = inferGenericFieldSchema('xxx', ['a', 'b', 'c', 'd', 'e']);
  assert.equal(schema.dataType, 'text');
  assert.equal(schema.analysisRole, 'description');
  assert.equal(schema.metricDirection, 'neutral');
});

test('成本字段推断', () => {
  const schema = inferGenericFieldSchema('成本', ['100', '200', '300', '400', '500']);
  assert.equal(schema.dataType, 'number');
  assert.equal(schema.analysisRole, 'metric');
});

test('日期时间字段推断', () => {
  const schema = inferGenericFieldSchema('timestamp', [
    '2024-01-01 10:00:00',
    '2024-01-02 11:00:00',
    '2024-01-03 12:00:00'
  ]);
  assert.equal(schema.dataType, 'datetime');
  assert.equal(schema.analysisRole, 'time');
});

test('销售额字段不被教育规则污染', () => {
  const schema = inferGenericFieldSchema('销售额', ['100', '200', '300', '400', '500']);
  const resolved = resolveFieldSchema('销售额', schema, { mode: 'generic' });
  assert.equal(resolved.metricDirection, 'unspecified');
  assert.notEqual(resolved.inferenceSource, 'template');
});

test('成本字段不被教育规则污染', () => {
  const schema = inferGenericFieldSchema('成本', ['100', '200', '300', '400', '500']);
  const resolved = resolveFieldSchema('成本', schema, { mode: 'generic' });
  assert.equal(resolved.metricDirection, 'unspecified');
  assert.notEqual(resolved.inferenceSource, 'template');
});

test('订单号字段不被教育规则污染', () => {
  const schema = inferGenericFieldSchema('订单号', ['12345', '67890', '11111', '22222']);
  const resolved = resolveFieldSchema('订单号', schema, { mode: 'generic' });
  assert.equal(resolved.analysisRole, 'identifier');
  assert.notEqual(resolved.inferenceSource, 'template');
});

// ============================================================
// 2. 教育模板测试
// ============================================================

console.log('\n【2】教育模板');

test('学号识别', () => {
  const baseSchema = inferGenericFieldSchema('学号', ['2024001', '2024002', '2024003']);
  const result = applyEducationTemplate('学号', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'identifier');
  assert.equal(result!.analysisRole, 'identifier');
  assert.equal(result!.inference.source, 'template');
});

test('班级识别', () => {
  const baseSchema = inferGenericFieldSchema('班级', ['一班', '二班', '三班']);
  const result = applyEducationTemplate('班级', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'category');
  assert.equal(result!.analysisRole, 'dimension');
});

test('科目成绩识别', () => {
  const baseSchema = inferGenericFieldSchema('数学', ['90', '85', '92', '88', '95']);
  const result = applyEducationTemplate('数学', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'number');
  assert.equal(result!.analysisRole, 'metric');
  assert.equal(result!.metricDirection, 'higher_is_better');
});

test('总分识别', () => {
  const baseSchema = inferGenericFieldSchema('总分', ['650', '680', '700', '720', '750']);
  const result = applyEducationTemplate('总分', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'number');
  assert.equal(result!.analysisRole, 'metric');
  assert.equal(result!.metricDirection, 'higher_is_better');
});

test('名次识别', () => {
  const baseSchema = inferGenericFieldSchema('名次', ['1', '2', '3', '4', '5']);
  const result = applyEducationTemplate('名次', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'number');
  assert.equal(result!.analysisRole, 'metric');
  assert.equal(result!.metricDirection, 'lower_is_better');
});

test('加分识别', () => {
  const baseSchema = inferGenericFieldSchema('加分', ['10', '5', '0', '15', '20']);
  const result = applyEducationTemplate('加分', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'number');
  assert.equal(result!.analysisRole, 'metric');
  assert.equal(result!.metricDirection, 'higher_is_better');
});

test('扣分识别', () => {
  const baseSchema = inferGenericFieldSchema('扣分', ['5', '10', '0', '3', '8']);
  const result = applyEducationTemplate('扣分', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.dataType, 'number');
  assert.equal(result!.analysisRole, 'metric');
  assert.equal(result!.metricDirection, 'lower_is_better');
});

// ============================================================
// 3. 优先级测试
// ============================================================

console.log('\n【3】优先级');

test('用户配置覆盖模板', () => {
  const schema: FieldSchema = {
    fieldId: '排名',
    sourceName: '排名',
    dataType: 'number',
    analysisRole: 'metric',
    metricDirection: 'higher_is_better',
    inference: { source: 'structure', confidence: 'high', reasons: [] },
    userOverride: {
      metricDirection: 'lower_is_better',
    },
  };
  const resolved = resolveFieldSchema('排名', schema, { mode: 'education' });
  assert.equal(resolved.metricDirection, 'lower_is_better');
  assert.equal(resolved.inferenceSource, 'user');
});

test('用户配置覆盖通用推断', () => {
  const schema: FieldSchema = {
    fieldId: '销售额',
    sourceName: '销售额',
    dataType: 'number',
    analysisRole: 'metric',
    metricDirection: 'unspecified',
    inference: { source: 'structure', confidence: 'high', reasons: [] },
    userOverride: {
      metricDirection: 'higher_is_better',
    },
  };
  const resolved = resolveFieldSchema('销售额', schema, { mode: 'generic' });
  assert.equal(resolved.metricDirection, 'higher_is_better');
  assert.equal(resolved.inferenceSource, 'user');
});

test('模板覆盖旧兼容结果', () => {
  const legacyMeta: FieldMeta = {
    header: '总分',
    type: 'score',
    analysisRole: 'primaryTotal',
    confidence: 0.9,
    reason: '关键词匹配',
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const resolved = resolveFieldSchema('总分', null, {
    mode: 'education',
    legacyFieldMeta: legacyMeta,
  });
  assert.equal(resolved.inferenceSource, 'template');
  assert.equal(resolved.metricDirection, 'higher_is_better');
});

test('unspecified 不被自动覆盖', () => {
  const schema: FieldSchema = {
    fieldId: '字段A',
    sourceName: '字段A',
    dataType: 'unknown',
    analysisRole: 'unspecified',
    metricDirection: 'unspecified',
    inference: { source: 'structure', confidence: 'low', reasons: [] },
    userOverride: {
      analysisRole: 'unspecified',
    },
  };
  const resolved = resolveFieldSchema('字段A', schema, { mode: 'generic' });
  assert.equal(resolved.analysisRole, 'unspecified');
  assert.equal(resolved.inferenceSource, 'user');
});

test('切换模式不覆盖用户配置', () => {
  const schema: FieldSchema = {
    fieldId: '排名',
    sourceName: '排名',
    dataType: 'number',
    analysisRole: 'metric',
    metricDirection: 'higher_is_better',
    inference: { source: 'template', confidence: 'high', reasons: [] },
    userOverride: {
      metricDirection: 'neutral',
    },
  };
  const resolvedGeneric = resolveFieldSchema('排名', schema, { mode: 'generic' });
  const resolvedEducation = resolveFieldSchema('排名', schema, { mode: 'education' });
  assert.equal(resolvedGeneric.metricDirection, 'neutral');
  assert.equal(resolvedEducation.metricDirection, 'neutral');
});

test('ignored 字段不进入分析', () => {
  const resolved: ResolvedFieldSchema = {
    fieldId: '备注',
    sourceName: '备注',
    dataType: 'text',
    analysisRole: 'description',
    metricDirection: 'neutral',
    ignored: true,
    inferenceSource: 'user',
    inferenceConfidence: 'high',
    inferenceReasons: [],
  };
  assert.equal(shouldAnalyzeField(resolved), false);
});

// ============================================================
// 4. 方向规则测试
// ============================================================

console.log('\n【4】方向规则');

test('通用模式的排名默认为 unspecified', () => {
  const schema = inferGenericFieldSchema('排名', ['1', '2', '3', '4', '5']);
  const resolved = resolveFieldSchema('排名', schema, { mode: 'generic' });
  assert.equal(resolved.metricDirection, 'unspecified');
});

test('教育模板的传统名次推荐 lower_is_better', () => {
  const baseSchema = inferGenericFieldSchema('名次', ['1', '2', '3', '4', '5']);
  const result = applyEducationTemplate('名次', baseSchema);
  assert.notEqual(result, null);
  assert.equal(result!.metricDirection, 'lower_is_better');
});

test('neutral 不生成优劣结论', () => {
  const resolved: ResolvedFieldSchema = {
    fieldId: '年龄',
    sourceName: '年龄',
    dataType: 'number',
    analysisRole: 'metric',
    metricDirection: 'neutral',
    ignored: false,
    inferenceSource: 'structure',
    inferenceConfidence: 'high',
    inferenceReasons: [],
  };
  assert.equal(shouldGenerateDirectionEvaluation(resolved), false);
});

test('unspecified 不生成优劣结论', () => {
  const resolved: ResolvedFieldSchema = {
    fieldId: '数值A',
    sourceName: '数值A',
    dataType: 'number',
    analysisRole: 'metric',
    metricDirection: 'unspecified',
    ignored: false,
    inferenceSource: 'structure',
    inferenceConfidence: 'high',
    inferenceReasons: [],
  };
  assert.equal(shouldGenerateDirectionEvaluation(resolved), false);
});

// ============================================================
// 5. 旧模型兼容测试
// ============================================================

console.log('\n【5】旧模型兼容');

test('旧 score 类型映射', () => {
  const legacyMeta: FieldMeta = {
    header: '数学',
    type: 'score',
    analysisRole: 'courseScore',
    confidence: 0.9,
    reason: '关键词匹配',
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const schema = mapLegacyFieldMetaToSchema(legacyMeta);
  assert.equal(schema.dataType, 'number');
  assert.equal(schema.analysisRole, 'metric');
  assert.equal(schema.metricDirection, 'higher_is_better');
  assert.equal(schema.inference.source, 'legacy');
});

test('旧 rank 类型映射', () => {
  const legacyMeta: FieldMeta = {
    header: '名次',
    type: 'rank',
    analysisRole: 'rank',
    confidence: 0.9,
    reason: '关键词匹配',
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const schema = mapLegacyFieldMetaToSchema(legacyMeta);
  assert.equal(schema.dataType, 'number');
  assert.equal(schema.analysisRole, 'metric');
  assert.equal(schema.metricDirection, 'lower_is_better');
});

test('旧 identity 类型映射（标识符）', () => {
  const legacyMeta: FieldMeta = {
    header: '学号',
    type: 'identity',
    analysisRole: 'identity',
    confidence: 0.9,
    reason: '关键词匹配',
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const schema = mapLegacyFieldMetaToSchema(legacyMeta);
  assert.equal(schema.dataType, 'identifier');
  assert.equal(schema.analysisRole, 'identifier');
});

test('旧 identity 类型映射（维度）', () => {
  const legacyMeta: FieldMeta = {
    header: '班级',
    type: 'identity',
    analysisRole: 'identity',
    confidence: 0.9,
    reason: '关键词匹配',
    validCount: 100,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const schema = mapLegacyFieldMetaToSchema(legacyMeta);
  assert.equal(schema.dataType, 'category');
  assert.equal(schema.analysisRole, 'dimension');
});

// ============================================================
// 6. 边界情况测试
// ============================================================

console.log('\n【6】边界情况');

test('空数据不产生 NaN', () => {
  const schema = inferGenericFieldSchema('空字段', []);
  // 空数组：numericRatio=0, uniqueRatio=0 → 走到低数值比例+低唯一率分支 → category/dimension
  assert.equal(schema.dataType, 'category');
  assert.equal(schema.analysisRole, 'dimension');
  assert.equal(schema.statistics?.missingCount, 0);
  // 验证没有 NaN
  assert.equal(Number.isNaN(schema.statistics?.uniqueCount), false);
});

test('全空列不产生除零错误', () => {
  const schema = inferGenericFieldSchema('全空', ['', '', '', '', '']);
  assert.equal(schema.statistics?.missingCount, 5);
  assert.equal(schema.statistics?.uniqueCount, 0);
});

test('单值列不产生除零错误', () => {
  const schema = inferGenericFieldSchema('单值', ['100']);
  assert.equal(schema.statistics?.uniqueCount, 1);
  assert.equal(schema.statistics?.missingCount, 0);
});

test('未知旧类型安全降级', () => {
  const legacyMeta: FieldMeta = {
    header: '未知字段',
    type: 'unknown',
    analysisRole: 'unknown',
    confidence: 0.5,
    reason: '无法识别',
    validCount: 0,
    emptyCount: 0,
    invalidCount: 0,
    textCount: 0,
  };
  const schema = mapLegacyFieldMetaToSchema(legacyMeta);
  assert.equal(schema.dataType, 'unknown');
  assert.equal(schema.analysisRole, 'unspecified');
  assert.equal(schema.metricDirection, 'unspecified');
});

// ============================================================
// 测试总结
// ============================================================

console.log('\n=== 测试总结 ===');
console.log(`通过：${passed}`);
console.log(`失败：${failed}`);
console.log(`总计：${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 存在失败测试');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
