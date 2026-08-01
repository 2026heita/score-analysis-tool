#!/usr/bin/env node

/**
 * 版本一致性检查脚本
 * 确保 package.json 版本与 updateLogs 第一项版本一致
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 检查版本一致性...\n');

// 读取 package.json 版本
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const packageVersion = packageJson.version;

console.log(`📦 package.json 版本: ${packageVersion}`);

// 读取 updateLogs 第一项版本
// 只匹配 _updateLogsData 数组之后的内容，跳过 JSDoc 注释中的示例版本
const updateLogsPath = join(rootDir, 'src', 'data', 'updateLogs.ts');
const updateLogsContent = readFileSync(updateLogsPath, 'utf-8');
const dataStart = updateLogsContent.indexOf('_updateLogsData: UpdateLogItem[] = [');
const dataSection = dataStart >= 0
  ? updateLogsContent.slice(dataStart)
  : updateLogsContent;
const versionMatch = dataSection.match(/version:\s*['"]v?(\d+\.\d+\.\d+)['"]/);

if (!versionMatch) {
  console.error('❌ 无法在 updateLogs.ts 中找到版本');
  process.exit(1);
}

const logsVersion = versionMatch[1];
console.log(` updateLogs 版本: ${logsVersion}`);

// 比较版本
if (packageVersion === logsVersion) {
  console.log('\n✅ 版本一致！');
  process.exit(0);
} else {
  console.error(`\n❌ 版本不一致！`);
  console.error(`   package.json:  ${packageVersion}`);
  console.error(`   updateLogs:    ${logsVersion}`);
  console.error(`\n请确保两个版本号保持一致。`);
  process.exit(1);
}
