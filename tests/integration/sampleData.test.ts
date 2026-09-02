/**
 * 真实源码测试：示例数据集成
 */
import { sampleDatasets } from '../../src/data/sampleDatasets.js';
import { parseTableText } from '../../src/utils/parseTable.js';
import { resolveFieldSchemas } from '../../src/field-schema/index.js';

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

console.log('=== 真实源码测试：示例数据集成 ===\n');

for (const dataset of sampleDatasets) {
  console.log(`测试: ${dataset.name} (${dataset.id})`);
  
  // 构建文本数据
  const headers = dataset.headers;
  const rows = dataset.rows;
  const text = [
    headers.join('\t'),
    ...rows.map(row => headers.map(h => row[h] ?? '').join('\t'))
  ].join('\n');
  
  // 解析数据
  const result = parseTableText(text);
  
  assert(`${dataset.name}: parseSummary 存在`, result.summary !== null && result.summary !== undefined);
  assert(`${dataset.name}: fieldTypes 不为空`, result.summary?.fieldTypes !== undefined && result.summary.fieldTypes.length > 0);
  
  // 通用模型验证：每个（业务/通用）示例数据集都应至少有一个可分析数值指标（metric）。
  // 这些业务数据（满意度/电商/销售/用户行为/地区/游戏）不再是 courseScore/primaryTotal
  // 等教育旧角色，而是通用 metric 角色。
  const schemaFields = resolveFieldSchemas(result.headers, null, {
    mode: 'generic',
    rows: result.rows,
  });
  const metricCount = schemaFields.filter(f => f.analysisRole === 'metric').length;
  assert(`${dataset.name}: 存在可分析指标(metric)`, metricCount > 0, `count=${metricCount}`);
  
  // 验证数据行数
  assert(`${dataset.name}: 数据行数正确`, result.rows.length === rows.length, `expected=${rows.length}, actual=${result.rows.length}`);
  
  console.log();
}

console.log(`=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
