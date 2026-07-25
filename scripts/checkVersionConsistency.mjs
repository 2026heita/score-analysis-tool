#!/usr/bin/env node

/**
 * 版本一致性检查脚本
 * 确保 APP_VERSION 与 package.json 版本一致
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

// 读取 APP_VERSION
const versionTsPath = join(rootDir, 'src', 'config', 'version.ts');
const versionTsContent = readFileSync(versionTsPath, 'utf-8');
const versionMatch = versionTsContent.match(/APP_VERSION\s*=\s*['"]v?(\d+\.\d+\.\d+)['"]/);

if (!versionMatch) {
  console.error('❌ 无法在 version.ts 中找到 APP_VERSION');
  process.exit(1);
}

const appVersion = versionMatch[1];
console.log(`🎯 APP_VERSION 版本: ${appVersion}`);

// 比较版本
if (packageVersion === appVersion) {
  console.log('\n✅ 版本一致！');
  process.exit(0);
} else {
  console.error(`\n❌ 版本不一致！`);
  console.error(`   package.json: ${packageVersion}`);
  console.error(`   APP_VERSION:  ${appVersion}`);
  console.error(`\n请确保两个版本号保持一致。`);
  process.exit(1);
}
