/**
 * 真实源码测试：示例数据集成
 */
import { sampleDatasets } from '../../src/data/sampleDatasets.js';
import { parseTableText } from '../../src/utils/parseTable.js';

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
  
  // 验证至少存在一个可分析指标
  const analyzableFields = result.summary?.fieldTypes.filter(f => {
    const role = f.analysisRole;
    return role === 'primaryTotal' || role === 'rank' || role === 'sectionTotal' || role === 'courseScore';
  }) || [];
  
  assert(`${dataset.name}: 存在可分析指标`, analyzableFields.length > 0, `count=${analyzableFields.length}`);
  
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
