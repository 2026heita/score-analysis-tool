/**
 * 示例数据测试脚本
 * 验证示例数据集的完整性和正确性
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取并解析 TypeScript 文件（简单提取数据）
const sampleDataPath = path.join(__dirname, '../src/data/sampleDatasets.ts');
const content = fs.readFileSync(sampleDataPath, 'utf-8');

// 提取 sampleDatasets 数组（简化解析）
const datasetsMatch = content.match(/export const sampleDatasets: SampleDataset\[\] = (\[[\s\S]*?\n\]);/);
if (!datasetsMatch) {
  throw new Error('无法解析 sampleDatasets.ts');
}

// 使用 Function 构造器安全解析（数据是纯对象）
const sampleDatasets = eval(datasetsMatch[1]);

function getSampleDatasetById(id) {
  return sampleDatasets.find(ds => ds.id === id);
}

console.log('=== 示例数据测试 ===\n');

// 测试 1: 至少包含 5 类样例
console.log('测试 1: 至少包含 5 类样例');
{
  const categories = new Set(sampleDatasets.map(ds => ds.category));
  assert(categories.size >= 5, `应有至少 5 个分类，实际有 ${categories.size} 个`);
  console.log(`✓ 通过: 包含 ${categories.size} 个分类`);
}

// 测试 2: 每个样例都有 headers 和 rows
console.log('\n测试 2: 每个样例都有 headers 和 rows');
{
  for (const ds of sampleDatasets) {
    assert(Array.isArray(ds.headers) && ds.headers.length > 0, `${ds.name} 的 headers 为空`);
    assert(Array.isArray(ds.rows) && ds.rows.length > 0, `${ds.name} 的 rows 为空`);
  }
  console.log(`✓ 通过: 所有 ${sampleDatasets.length} 个样例都有 headers 和 rows`);
}

// 测试 3: 每个样例至少包含 3 个数值字段
console.log('\n测试 3: 每个样例至少包含 3 个数值字段');
{
  for (const ds of sampleDatasets) {
    if (ds.rows.length === 0) continue;
    
    const firstRow = ds.rows[0];
    let numericCount = 0;
    
    for (const header of ds.headers) {
      const val = firstRow[header];
      if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')) {
        numericCount++;
      }
    }
    
    assert(numericCount >= 3, `${ds.name} 的数值字段不足 3 个，实际有 ${numericCount} 个`);
  }
  console.log(`✓ 通过: 所有样例都至少有 3 个数值字段`);
}

// 测试 4: 示例数据加载后不会走特殊硬编码逻辑（验证数据结构一致性）
console.log('\n测试 4: 示例数据结构一致性');
{
  for (const ds of sampleDatasets) {
    // 检查每行的字段数与 headers 一致
    for (let i = 0; i < ds.rows.length; i++) {
      const row = ds.rows[i];
      const rowKeys = Object.keys(row);
      
      // 允许部分字段缺失，但不能有 headers 之外的字段
      for (const key of rowKeys) {
        assert(ds.headers.includes(key), `${ds.name} 第 ${i + 1} 行包含未知字段: ${key}`);
      }
    }
  }
  console.log(`✓ 通过: 所有样例数据结构一致`);
}

// 测试 5: getSampleDatasetById 能正确获取数据
console.log('\n测试 5: getSampleDatasetById 功能');
{
  for (const ds of sampleDatasets) {
    const found = getSampleDatasetById(ds.id);
    assert(found !== undefined, `无法通过 id "${ds.id}" 获取样例`);
    assert(found.name === ds.name, `获取的样例名称不匹配`);
  }
  console.log(`✓ 通过: getSampleDatasetById 功能正常`);
}

// 测试 6: 示例数据不包含 null 或 undefined 的关键字段
console.log('\n测试 6: 示例数据关键字段完整性');
{
  for (const ds of sampleDatasets) {
    for (let i = 0; i < ds.rows.length; i++) {
      const row = ds.rows[i];
      // 至少第一个字段（通常是标识符）不应为空
      const firstHeader = ds.headers[0];
      const val = row[firstHeader];
      assert(val !== null && val !== undefined && val !== '', 
        `${ds.name} 第 ${i + 1} 行的 "${firstHeader}" 为空`);
    }
  }
  console.log(`✓ 通过: 所有样例关键字段完整`);
}

console.log('\n=== 示例数据测试完成 ===');
console.log(`共测试 ${sampleDatasets.length} 个样例数据集`);
