#!/usr/bin/env node

/**
 * 发布日志检查脚本
 * 检测功能代码变更时是否同步更新了 updateLogs.ts
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 需要检查的功能文件路径模式
const FUNCTION_PATTERNS = [
  'src/components/**',
  'src/engine/**',
  'src/App.tsx',
  'src/utils/**',
  'src/types.ts'
];

// 更新日志文件
const UPDATE_LOG_FILE = 'src/data/updateLogs.ts';

function getChangedFiles() {
  try {
    // 获取暂存区和工作区的变更文件
    const staged = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: rootDir,
      encoding: 'utf-8'
    }).trim().split('\n').filter(Boolean);

    const unstaged = execSync('git diff --name-only --diff-filter=ACM', {
      cwd: rootDir,
      encoding: 'utf-8'
    }).trim().split('\n').filter(Boolean);

    return [...new Set([...staged, ...unstaged])];
  } catch (error) {
    console.error('无法获取 git 变更文件列表:', error.message);
    return [];
  }
}

function isFunctionFile(filePath) {
  return FUNCTION_PATTERNS.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return regex.test(filePath);
  });
}

function checkReleaseNote() {
  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log('✓ 没有检测到文件变更');
    process.exit(0);
  }

  const functionFilesChanged = changedFiles.some(isFunctionFile);
  const updateLogChanged = changedFiles.includes(UPDATE_LOG_FILE);

  if (functionFilesChanged && !updateLogChanged) {
    console.warn('\n⚠️  检测到功能代码变更，但 updateLogs.ts 未更新');
    console.warn('   请确认是否需要补充更新公告。\n');
    console.warn('   变更的功能文件:');
    changedFiles.filter(isFunctionFile).forEach(f => console.warn(`     - ${f}`));
    console.warn('\n   如需更新，请修改: src/data/updateLogs.ts');
    console.warn('   参考文档: docs/release-checklist.md\n');
    // 非阻塞退出，仅提醒
    process.exit(0);
  } else if (functionFilesChanged && updateLogChanged) {
    console.log('✓ 检测到功能代码变更，updateLogs.ts 已同步更新');
  } else {
    console.log('✓ 未检测到功能代码变更，无需更新日志');
  }
}

checkReleaseNote();
