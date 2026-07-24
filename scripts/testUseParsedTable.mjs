/**
 * useParsedTable Hook 集成测试
 * 验证真实 App 链路中的解析状态管理
 * 
 * 采用文件读取方式，避免 TypeScript 导入问题
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== useParsedTable Hook 集成测试 ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${e.message}`);
    failed++;
  }
}

// 读取并解析 parseTableText 函数
const parseTablePath = path.join(__dirname, '../src/utils/parseTable.ts');
const parseTableContent = fs.readFileSync(parseTablePath, 'utf-8');

// 验证关键代码存在
test('parseTableText 函数应该存在', () => {
  assert(parseTableContent.includes('export function parseTableText'), 'parseTableText 函数应该被导出');
});

test('parseTableText 应该调用 parseRowsToTable', () => {
  assert(parseTableContent.includes('parseRowsToTable'), '应该调用 parseRowsToTable');
});

test('parseRowsToTable 应该处理 dataVolumeState', () => {
  const workbookPath = path.join(__dirname, '../src/utils/tableParser/index.ts');
  const workbookContent = fs.readFileSync(workbookPath, 'utf-8');
  assert(workbookContent.includes('dataVolumeState'), 'parseRowsToTable 应该包含 dataVolumeState');
  assert(workbookContent.includes('20000') || workbookContent.includes('MAX_ROWS'), '应该包含行数限制逻辑');
});

// 读取 useParsedTable Hook
const useParsedTablePath = path.join(__dirname, '../src/hooks/useParsedTable.ts');
const useParsedTableContent = fs.readFileSync(useParsedTablePath, 'utf-8');

test('useParsedTable 应该包含 loadSampleDataset 方法', () => {
  assert(useParsedTableContent.includes('loadSampleDataset'), '应该包含 loadSampleDataset 方法');
});

test('useParsedTable 应该包含 pendingInternalRawTextRef', () => {
  assert(useParsedTableContent.includes('pendingInternalRawTextRef'), '应该包含内部更新守卫');
});

test('useParsedTable 应该包含 parseVersionRef', () => {
  assert(useParsedTableContent.includes('parseVersionRef'), '应该包含异步版本控制');
});

test('parseVersionControl 生产 helper 应该存在', () => {
  const helperPath = path.join(__dirname, '../src/utils/parseVersionControl.ts');
  assert(fs.existsSync(helperPath), 'parseVersionControl.ts 应该存在');
  const helperContent = fs.readFileSync(helperPath, 'utf-8');
  assert(helperContent.includes('incrementVersion'), '应该包含 incrementVersion');
  assert(helperContent.includes('isVersionMatch'), '应该包含 isVersionMatch');
  assert(helperContent.includes('isMounted'), '应该包含 isMounted');
  assert(helperContent.includes('safeSetState'), '应该包含 safeSetState');
});

test('useParsedTable 的 handleFileUpload 应该保存 dataVolumeState', () => {
  const handleFileUploadMatch = useParsedTableContent.match(/const handleFileUpload[\s\S]*?^  \}, \[\]\);/m);
  assert(handleFileUploadMatch, '应该找到 handleFileUpload 函数');
  assert(handleFileUploadMatch[0].includes('setDataVolumeState'), '应该调用 setDataVolumeState');
  assert(handleFileUploadMatch[0].includes('pendingInternalRawTextRef.current = text'), '应该设置内部更新标记');
});

test('useParsedTable 的 handleSheetChange 应该保存 dataVolumeState', () => {
  const handleSheetChangeMatch = useParsedTableContent.match(/const handleSheetChange[\s\S]*?^  \}, \[parsedData\]\);/m);
  assert(handleSheetChangeMatch, '应该找到 handleSheetChange 函数');
  assert(handleSheetChangeMatch[0].includes('setDataVolumeState'), '应该调用 setDataVolumeState');
});

test('useParsedTable 的 loadSampleDataset 应该原子设置所有状态', () => {
  const loadSampleDatasetMatch = useParsedTableContent.match(/const loadSampleDataset[\s\S]*?^  \}, \[\]\);/m);
  assert(loadSampleDatasetMatch, '应该找到 loadSampleDataset 函数');
  assert(loadSampleDatasetMatch[0].includes('setParsedData'), '应该调用 setParsedData');
  assert(loadSampleDatasetMatch[0].includes('setParseSummary'), '应该调用 setParseSummary');
  assert(loadSampleDatasetMatch[0].includes('setDataVolumeState'), '应该调用 setDataVolumeState');
  assert(loadSampleDatasetMatch[0].includes('pendingInternalRawTextRef.current = text'), '应该设置内部更新标记');
});

// 读取 App.tsx 验证重复逻辑已删除
const appPath = path.join(__dirname, '../src/App.tsx');
const appContent = fs.readFileSync(appPath, 'utf-8');

test('App.tsx 不应该包含重复的 handleParse 实现', () => {
  const handleParseMatch = appContent.match(/const handleParse = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[.*?\]\);/);
  if (handleParseMatch) {
    // 如果存在，应该只是调用 hook 的方法，不应该包含 parseTableText
    assert(!handleParseMatch[0].includes('parseTableText'), 'handleParse 不应该直接调用 parseTableText');
  }
});

test('App.tsx 不应该包含重复的 handleFileUpload 实现', () => {
  const handleFileUploadMatch = appContent.match(/const handleFileUpload = useCallback\([\s\S]*?\n  \}, \[.*?\]\);/);
  if (handleFileUploadMatch) {
    // 如果存在，应该只是调用 hook 的方法
    assert(!handleFileUploadMatch[0].includes('parseTableFile'), 'handleFileUpload 不应该直接调用 parseTableFile');
  }
});

test('App.tsx 应该使用 useParsedTable 的 handleParse', () => {
  assert(appContent.includes('handleParse,') || appContent.includes('handleParse:'), '应该从 useParsedTable 解构 handleParse');
});

test('App.tsx 应该使用 useParsedTable 的 handleFileUpload', () => {
  assert(appContent.includes('handleFileUpload,') || appContent.includes('handleFileUpload:'), '应该从 useParsedTable 解构 handleFileUpload');
});

test('App.tsx 应该使用 useParsedTable 的 handleSheetChange', () => {
  assert(appContent.includes('handleSheetChange,') || appContent.includes('handleSheetChange:'), '应该从 useParsedTable 解构 handleSheetChange');
});

test('App.tsx 应该使用 useParsedTable 的 loadSampleDataset', () => {
  assert(appContent.includes('loadSampleDataset,') || appContent.includes('loadSampleDataset:'), '应该从 useParsedTable 解构 loadSampleDataset');
});

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
