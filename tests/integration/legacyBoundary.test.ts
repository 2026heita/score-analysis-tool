/**
 * legacyBoundary.test.ts — 通用主链路与 legacy 教育的架构边界回归测试
 *
 * 目的：确保"去教育领域硬编码"不回归。
 * 1. 通用目录（App / components / engine / hooks / metrics / utils/tableParser / field-schema generic）
 *    不得 import src/features/legacy/education。
 * 2. 通用 schema 推断层（inferGenericSchema.ts）不得包含教育专用关键词表。
 * 3. 通用字段角色模型（field-schema/types.ts）以通用角色定义为准，不得把 primaryTotal /
 *    courseScore / sectionTotal 等教育角色作为核心类型。
 *
 * 设计约束：
 * - 只对源码做静态文本守护，不校验用户上传的数据（用户数据本就可能合法包含
 *   "成绩/学校/排名" 等字段，不能对这些字符串做全局禁用）。
 * - 明确标记为 legacy（features/legacy、legacyAdapter、deprecated 注释、legacy 测试）
 *   的位置允许包含教育概念，本测试不禁止它们。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '../../src');

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

/** 递归收集 src 下的所有 .ts / .tsx 源文件 */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/** 移除 JS/TS 注释：去掉块注释（block comment）与行注释（line comment），仅保留代码文本 */
function stripComments(src: string): string {
  // 去掉块注释（含跨行）
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // 去掉行注释（避免误删 url 中的 //，此处较为保守，因为我们是逐行检查代码 token）
  s = s.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
  return s;
}

console.log('=== legacyBoundary：通用主链路 vs 教育 legacy 边界 ===');
console.log('');

const files = collectSourceFiles(srcRoot);

// ------------------------------------------------------------
// 1) import 边界：features/legacy/education 只能被 features/legacy 内部 import
// ------------------------------------------------------------
console.log('[1] import 边界：src 不得从通用目录 import features/legacy/education');
{
  const offenders: string[] = [];
  const legacyDir = toPosix(resolve(srcRoot, 'features/legacy'));
  // 仅匹配真正的 import / require 语句，不匹配注释中的路径引用
  const importRe = /(from\s*['"][^'"]*features\/legacy\/education|import\s*\(['"][^'"]*features\/legacy\/education|require\s*\(\s*['"][^'"]*features\/legacy\/education)/;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!importRe.test(content)) continue;
    const posix = toPosix(file);
    // 允许 features/legacy 内部（及 features/legacy/education 本身）引用
    if (posix.startsWith(legacyDir + '/')) continue;
    offenders.push(relative(srcRoot, file));
  }
  assert(
    '通用目录不 import features/legacy/education',
    offenders.length === 0,
    offenders.length ? `违规: ${offenders.join(', ')}` : '无违规'
  );
}

// ------------------------------------------------------------
// 2) inferGenericSchema 的【规则代码】不得含教育专用关键词
//    只检查代码部分；注释中说明"该词不放入通用规则"是合法文档，不算违规。
// ------------------------------------------------------------
console.log('');
console.log('[2] 通用 schema 推断层规则代码不含教育专用关键词（注释除外）');
{
  const inferPath = resolve(srcRoot, 'field-schema/inferGenericSchema.ts');
  const codeOnly = stripComments(readFileSync(inferPath, 'utf8'));
  for (const kw of ['学号', '考号', '准考证', '班级', '专业']) {
    assert(
      `inferGenericSchema 规则代码不含 "${kw}"`,
      !codeOnly.includes(kw),
      `代码包含 "${kw}"`
    );
  }
}

// ------------------------------------------------------------
// 3) 通用字段角色模型：核心 AnalysisRole 定义为通用 7 类，而非教育角色
//    （注释中出现的 primaryTotal/courseScore 等说明文字不属于角色定义）
// ------------------------------------------------------------
console.log('');
console.log('[3] 通用字段角色模型核心类型不含教育角色（注释除外）');
{
  const typesPath = resolve(srcRoot, 'field-schema/types.ts');
  const codeOnly = stripComments(readFileSync(typesPath, 'utf8'));
  const eduRolesFound = ['primaryTotal', 'courseScore', 'sectionTotal', 'scoreLike', 'classLabel']
    .filter(r => codeOnly.includes(r));
  assert(
    '通用 schema 代码不含 primaryTotal/courseScore/sectionTotal/scoreLike/classLabel',
    eduRolesFound.length === 0,
    eduRolesFound.length ? `发现: ${eduRolesFound.join(', ')}` : '未发现'
  );
}

console.log('');
console.log('=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);
if (failed > 0) {
  process.exitCode = 1;
}