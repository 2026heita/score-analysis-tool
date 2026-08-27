/**
 * 文本截断回归测试（针对本次 UI 可读性修复新增）
 * 执行: node --experimental-strip-types scripts/testTextTruncation.mjs
 *
 * 职责：验证长标签换行公共工具 chartLabel.ts 的核心不变量：
 * 1. 任何字段名都不得被截断（不允许 '…' 或丢失字符）
 * 2. 中/英/中英混合/无空格连续串都能换行
 * 3. 每行实际显示宽度不超过预算（近似）
 * 4. 换行行数正确、图表高度随之自适应且不过度预留
 */

import {
  wrapCategoryLabel,
  categoryLabelLines,
  estimateCategoryAxisHeight,
  categoryStringWidth,
} from '../src/utils/chartLabel.ts';

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

// 长标签不应被截断：去掉换行后必须恢复原字符串（针对无空格串）
function assertNoCharLoss(name, original, wrapped) {
  const restored = wrapped.replace(/\n/g, '');
  const ok = restored === original;
  assert(`${name} (无字符丢失)`, ok);
}

// 每一行的显示宽度不得超过预算（允许少量容差）
function assertLinesWithinBudget(name, wrapped, budget) {
  const lines = wrapped.split('\n');
  const over = lines.filter(l => categoryStringWidth(l) - budget > 0.8);
  assert(`${name} (每行不超预算)`, over.length === 0);
}

const BUDGET_MOBILE = 10;   // 手机约 110px
const BUDGET_DESKTOP = 20;  // 桌面约 230px

console.log('=== 中文长字段 ===');
{
  const s = '德育_马克思主义基本原理课程';
  const m = wrapCategoryLabel(s, BUDGET_MOBILE);
  assertNoCharLoss('中文长字段: mobile', s, m);
  assert(`中文长字段: mobile 换行 >= 2 行`, m.split('\n').length >= 2);
  assertLinesWithinBudget('中文长字段: mobile', m, BUDGET_MOBILE);
  const d = wrapCategoryLabel(s, BUDGET_DESKTOP);
  assertNoCharLoss('中文长字段: desktop', s, d);
}

console.log('=== 英文长字段（含空格单词） ===');
{
  const s = 'Maximum Score Point Average Grade';
  const m = wrapCategoryLabel(s, BUDGET_MOBILE);
  assert(`${'英文长字段: mobile 换行 >= 2 行'}`, m.split('\n').length >= 2);
  assertLinesWithinBudget('英文长字段: mobile', m, BUDGET_MOBILE);
  const restored = m.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  assert('英文长字段: mobile 单词保留', restored === s);
}

console.log('=== 中英文混合长字段 ===');
{
  const s = 'Module 数学与Physics百分位Score统计';
  const m = wrapCategoryLabel(s, BUDGET_MOBILE);
  assertContentPreserved('中英混合: mobile', s, m);
  assertLinesWithinBudget('中英混合: mobile', m, BUDGET_MOBILE);
  // 无空格混合串：必须逐字符保留
  const noSpace = '德育模块_数学与Physics百分位统计2026';
  const ms = wrapCategoryLabel(noSpace, BUDGET_MOBILE);
  assertNoCharLoss('中英混合(无空格): mobile', noSpace, ms);
  assertLinesWithinBudget('中英混合(无空格): mobile', ms, BUDGET_MOBILE);
}

function assertContentPreserved(name, original, wrapped) {
  const a = original.replace(/\s+/g, '');
  const b = wrapped.replace(/[\s\n]/g, '');
  assert(`${name} (字符保留)`, a === b);
}

console.log('=== 无空格连续英文/数字 ===');
{
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZStandardDeviation2026';
  const m = wrapCategoryLabel(s, BUDGET_MOBILE);
  assertNoCharLoss('连续串: mobile', s, m);
  assertLinesWithinBudget('连续串: mobile', m, BUDGET_MOBILE);
  assert(`连续串: mobile 换行 >= 2 行`, m.split('\n').length >= 2);
}

console.log('=== 短字段保持单行 ===');
{
  const short = '语文';
  assert('短字段: mobile 单行', wrapCategoryLabel(short, BUDGET_MOBILE) === short);
  const shortEn = 'Name';
  assert('短英文字段: mobile 单行', wrapCategoryLabel(shortEn, BUDGET_MOBILE) === shortEn);
}

console.log('=== 空值/边界 ===');
{
  assert('空字符串原样返回', wrapCategoryLabel('', 10) === '');
  assert('null 不崩溃', wrapCategoryLabel(null, 10) === null);
  assert('undefined 不崩溃', wrapCategoryLabel(undefined, 10) === undefined);
  assert('非法预算回退 15', wrapCategoryLabel('语文数学英语物理化学', 0).length > 0);
}

console.log('=== 换行行数与高度自适应 ===');
{
  const labels = ['语文', '德育_马克思主义基本原理课程', 'Module数学Physics统计', 'TapScoreAverageMeanValue'];
  const mobileLines = labels.reduce((n, l) => n + categoryLabelLines(l, BUDGET_MOBILE), 0);
  const desktopLines = labels.reduce((n, l) => n + categoryLabelLines(l, BUDGET_DESKTOP), 0);
  assert('手机行数 >= 桌面行数', mobileLines >= desktopLines);
  assert('桌面至少允许单行化长标签', desktopLines >= 4 && desktopLines <= mobileLines);

  const hMobile = estimateCategoryAxisHeight(labels, BUDGET_MOBILE, { base: 360, headerReserve: 120 });
  const hDesktop = estimateCategoryAxisHeight(labels, BUDGET_DESKTOP, { base: 360, headerReserve: 120 });
  assert('手机高度 >= 桌面高度', hMobile >= hDesktop);
  assert('高度不低于基础值', hDesktop >= 360);
  // 不应过度预留：同一组标签桌面高度与基础值的差额不能比手机大一档以上
  assert('桌面不会产生巨大空白', hDesktop - 360 <= (hMobile - 360));
}

console.log('');
console.log(`文本截断回归测试: 通过 ${passed} / ${passed + failed}`);
if (failed > 0) {
  console.log(` ❌ 存在 ${failed} 个失败`);
  process.exit(1);
} else {
  console.log('✅ 所有文本截断回归测试通过！');
}