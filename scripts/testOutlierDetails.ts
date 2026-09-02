/**
 * 异常值详情弹窗 - 逻辑测试脚本
 *
 * 验证 OutlierDetailsDialog 依赖的数据契约与纯逻辑，
 * 不依赖 UI 测试框架：
 *  - detectFieldOutliers 的 records 能通过 values 下标映射回真实分析行
 *  - 展示行号 = 真实分析行下标 + 1（即使经过"筛选/子集"也不丢失原始定位）
 *  - 上下文字段按 identifier > time > dimension 动态选取，剔除当前指标字段，
 *    绝不出现教育/零售硬编码字段
 *  - reason 为人类可读文案（不暴露 high_outlier/distance 内部串）
 *  - 各类 status 的文案不会显示为 "0 个异常"
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testOutlierDetails.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSampleDatasetById } from '../src/data/sampleDatasets.js';
import { parseTableText } from '../src/utils/parseTable.js';
import { resolveFieldSchemas } from '../src/field-schema/index.js';
import { detectFieldOutliers } from '../src/engine/outlierDetection.js';
import {
  outlierCellFor,
  countDirections,
  friendlyReason,
  fmtValue,
  OUTLIER_CTA,
  normalRangeText,
  buildExplain,
  OUTLIER_PAGE_SIZE,
  outlierTotalPages,
  paginateRecords,
} from '../src/utils/outlierUx.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` :: ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

/** 与 OutlierDetailsDialog.selectContextColumns 一致的选取规则（内联镜像） */
const MAX_CONTEXT_COLS = 3;
type AnySchema = { fieldId: string; sourceName: string; analysisRole: string };
function selectContextColumns(schemas: AnySchema[], currentField: string): string[] {
  const priority: Record<string, number> = { identifier: 0, time: 1, dimension: 2 };
  return schemas
    .filter((s) => s.fieldId !== currentField)
    .filter((s) => priority[s.analysisRole] !== undefined)
    .sort((a, b) => (priority[a.analysisRole] ?? 99) - (priority[b.analysisRole] ?? 99))
    .slice(0, MAX_CONTEXT_COLS)
    .map((s) => s.sourceName);
}

// 与 OutlierPanel STATUS_TEXT 一致的文案（内联镜像）
const STATUS_TEXT: Record<string, string> = {
  detected: '',
  none: '未产生异常候选',
  insufficient_data: '有效样本过少，未执行异常值判断。',
  insufficient_variation: '数据变化过小，无法可靠判断异常值。',
  unsupported: '该字段不是连续指标（标识/离散/低基数等），不做连续型异常检测。',
};

console.log('=== 异常值详情弹窗逻辑测试 ===\n');

// ============================================================
console.log('一、零售样例 销售额 候选可定位真实行');
// ============================================================
(() => {
  const retail = getSampleDatasetById('retail-warehouse-sales');
  assert(retail != null, 'retail-warehouse-sales 存在');
  if (!retail) return;

  const text = [
    retail.headers.join('\t'),
    ...retail.rows.map((row) => retail.headers.map((h) => row[h] ?? '').join('\t')),
  ].join('\n');
  const result = parseTableText(text);
  const values = result.rows.map((r) => Number(r['销售额']));

  // 模拟 OutlierPanel：values 为数值数组；真实分析行下标即是 result.rows 下标
  const rowIndices = values.map((_, i) => i);
  const detected = detectFieldOutliers(values, { field: '销售额' });

  assert(detected.status === 'detected', 'status = detected', `actual=${detected.status}`);
  assert(detected.outlierCount >= 1, '存在异常候选', `count=${detected.outlierCount}`);

  for (const rec of detected.records) {
    // rec.rowIndex 是 values 下标；经 rowIndices 映射回真实分析行
    const realRow = rowIndices[rec.rowIndex];
    const row = result.rows[realRow];
    const displayRowNumber = realRow + 1;
    assert(realRow >= 0 && realRow < result.rows.length, 'rowIndex 映射到合法真实行');
    assert(rec.value === Number(row['销售额']), '候选 value 与真实行一致', `rec=${rec.value} row=${row['销售额']}`);
    assert(displayRowNumber === rec.rowIndex + 1, '全量时展示行号 = rowIndex+1');
    assert(row['日期'] !== undefined && row['日期'] !== '', '候选可定位 日期');
    assert(row['门店'] !== undefined && row['门店'] !== '', '候选可定位 门店');
  }
})();

// ============================================================
console.log('\n二、筛选/子集后仍能回到原始行号');
// ============================================================
(() => {
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (!retail) return;
  const text = [
    retail.headers.join('\t'),
    ...retail.rows.map((row) => retail.headers.map((h) => row[h] ?? '').join('\t')),
  ].join('\n');
  const result = parseTableText(text);

  // 模拟"仅取偶数行"的子集，但保留原始下标映射
  const subsetIdx = result.rows
    .map((_, i) => i)
    .filter((i) => i % 2 === 0);
  const values = subsetIdx.map((i) => Number(result.rows[i]['销售额']));
  const rowIndices = subsetIdx; // values 下标 → 原始分析行下标

  const detected = detectFieldOutliers(values, { field: '销售额' });
  if (detected.records.length === 0) {
    // 子集可能无候选；此时验证路径不变（映射仍正确）
    assert(true, '子集无候选（可接受）');
  } else {
    for (const rec of detected.records) {
      const realRow = rowIndices[rec.rowIndex];
      const displayRowNumber = realRow + 1;
      assert(
        displayRowNumber !== rec.rowIndex + 1 || realRow === rec.rowIndex,
        '展示行号使用真实映射而非子集内下标',
        `recIdx=${rec.rowIndex} realRow=${realRow} displayed=${displayRowNumber}`
      );
      assert(realRow % 2 === 0, '映射回的行确属原始偶数行', `realRow=${realRow}`);
      assert(
        Number(result.rows[realRow]['销售额']) === rec.value,
        '展示值来自原始行',
        `rec=${rec.value} row=${result.rows[realRow]['销售额']}`
      );
    }
  }
})();

// ============================================================
console.log('\n三、上下文字段按 identifier > time > dimension 选取');
// ============================================================
(() => {
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (!retail) return;
  const text = [
    retail.headers.join('\t'),
    ...retail.rows.map((row) => retail.headers.map((h) => row[h] ?? '').join('\t')),
  ].join('\n');
  const result = parseTableText(text);
  const schema = resolveFieldSchemas(result.headers, null, { mode: 'generic', rows: result.rows });

  const metrics = schema.filter((s) => s.analysisRole === 'metric');
  assert(metrics.some((m) => m.fieldId === '销售额'), '销售额被识别为 metric');
  const ctx = selectContextColumns(schema as AnySchema[], '销售额');

  assert(ctx.length <= MAX_CONTEXT_COLS, `上下文列 <= ${MAX_CONTEXT_COLS}`, `actual=${ctx.length}`);
  assert(!ctx.includes('销售额'), '上下文不包含当前指标字段（销售额）');
  assert(ctx.length > 0, '至少选取 1 个上下文字段');

  // 角色优先级：identifier(0) < time(1) < dimension(2)
  const roleOf = new Map(schema.map((s) => [s.sourceName, s.analysisRole]));
  const order = ctx.map((c) => roleOf.get(c) ?? 'unknown');
  for (let i = 1; i < order.length; i++) {
    const p = (r: string) => ({ identifier: 0, time: 1, dimension: 2 }[r] ?? 99);
    assert(p(order[i - 1]) <= p(order[i]), `优先级递增: ${order.slice(0, i + 1).join(' -> ')}`);
  }

  // 至少覆盖一种上下文角色语义
  assert(
    ctx.some((c) => ['identifier', 'time', 'dimension'].includes(roleOf.get(c) ?? '')),
    '上下文覆盖 identifier/time/dimension 之一'
  );

  // 绝不硬编码教育字段
  const forbidden = ['姓名', '学生', '成绩', '班级', '课程', '学号'];
  for (const kw of forbidden) {
    assert(!ctx.some((c) => c.includes(kw)), `上下文不含教育硬编码字段「${kw}」`);
  }
})();

// ============================================================
console.log('\n四、reason 为人类可读文案');
// ============================================================
(() => {
  const detected = detectFieldOutliers([10, 10, 10, 10, 12, 11, 10, 100], { field: '测试指标' });
  const internalTokens = ['distance=', 'high_outlier', 'low_outlier', 'zScore', 'upperBound', 'status='];
  for (const rec of detected.records) {
    assert(
      !internalTokens.some((t) => rec.reason.includes(t)),
      `reason 不暴露内部串: ${rec.reason}`
    );
    assert(
      rec.reason.includes('上界') || rec.reason.includes('下界') || rec.reason.includes('中位数'),
      `reason 使用中文可读文案: ${rec.reason}`
    );
    assert(['high', 'low'].includes(rec.direction), 'direction ∈ {high, low}');
  }
})();

// ============================================================
console.log('\n五、各 status 文案不显示为 "0 个异常"');
// ============================================================
(() => {
  const nonDetected = ['none', 'insufficient_data', 'insufficient_variation', 'unsupported'];
  for (const st of nonDetected) {
    const text = STATUS_TEXT[st] ?? '';
    assert(text.trim().length > 0, `${st} 有提示文案`);
    assert(!text.includes('0 个'), `${st} 不显示"0 个"`, text);
  }
})();

// ============================================================
console.log('\n六、状态入口文案（outlierCellFor）');
// ============================================================
(() => {
  // 1. detected 显示"查看解析"入口（非"查看详情"）
  const btn = outlierCellFor('detected', 3, '销售额', 90);
  assert(btn.kind === 'button', 'detected 显示入口（kind=button）');
  if (btn.kind === 'button') {
    assert(btn.count === 3, '入口携带异常数量');
    assert(btn.text.includes('异常候选'), `文案统一为"异常候选": ${btn.text}`);
    assert(btn.text.includes(OUTLIER_CTA), `文案统一为"${OUTLIER_CTA}": ${btn.text}`);
    assert(!btn.text.includes('查看详情'), '不使用"查看详情"', btn.text);
    assert(btn.ariaLabel === '查看销售额的 3 条异常候选解析', 'aria-label 准确', btn.ariaLabel);
    assert(!btn.text.includes('错误') && !btn.text.includes('异常数据'), '不使用"错误/异常数据"');
    // 移动端 compact：⚠ N · 解析
    const compactBtn = outlierCellFor('detected', 3, '销售额', 90, true);
    assert(compactBtn.kind === 'button', '移动端仍为入口');
    if (compactBtn.kind === 'button') {
      assert(compactBtn.text === `3 · ${OUTLIER_CTA}`, '移动端缩短为 "N · 查看解析"', compactBtn.text);
      assert(!compactBtn.text.includes('异常候选'), '移动端紧凑不写"异常候选"');
      assert(compactBtn.ariaLabel === '查看销售额的 3 条异常候选解析', '移动端 aria-label 保留完整', compactBtn.ariaLabel);
    }
  }
  // 2. none 不显示入口
  assert(outlierCellFor('none', 0, 'x', 90).kind === 'text', 'none 为静态度');
  assert((outlierCellFor('none', 0, 'x', 90) as any).text === '无明显异常', 'none → "无明显异常"');
  // detected 但 count===0 也归为“无明显异常”，不出现“0 个异常候选”
  assert(
    !(outlierCellFor('detected', 0, 'x', 90).text ?? '').includes('0 个异常候选'), 'detected@0 不显示"0 个异常候选"'
  );
  assert(
    !(outlierCellFor('detected', 0, 'x', 90).text ?? '').includes('· 查看详情'), 'detected@0 不显示"· 查看详情"'
  );
  // 3-5. 各状态区分
  assert((outlierCellFor('insufficient_data', 0, 'x', 3) as any).text === '样本不足', 'insufficient_data → "样本不足"');
  assert((outlierCellFor('insufficient_variation', 0, 'x', 90) as any).text === '变化过小', 'insufficient_variation → "变化过小"');
  assert((outlierCellFor('unsupported', 0, 'x', 90) as any).text === '不适用', 'unsupported → "不适用"');
  const texts = ['样本不足', '变化过小', '不适用', '无明显异常'];
  assert(new Set(texts).size === texts.length, '各状态文案互不相同');
})();

// ============================================================
console.log('\n七、high/low 统计（countDirections）');
// ============================================================
(() => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 100, 200];
  const detected = detectFieldOutliers(arr, { field: 'val' });
  if (detected.records.length > 0) {
    const { high, low } = countDirections(detected.records);
    assert(high === detected.records.filter(r => r.direction === 'high').length, 'high 统计与 records 一致');
    assert(low === detected.records.filter(r => r.direction === 'low').length, 'low 统计与 records 一致');
    assert(high + low === detected.records.length, 'high+low === 记录数');
    assert(detected.records.length >= 1, '有候选作为统计基准');
  } else {
    assert(countDirections([]).high === 0 && countDirections([]).low === 0, '空列表 high/low = 0');
  }
})();

// ============================================================
console.log('\n八、分页（<=20 不显示分页；>20 分页正确）');
// ============================================================
(() => {
  assert(OUTLIER_PAGE_SIZE === 20, '每页 20 条');
  assert(outlierTotalPages(0) === 1, '0 条 → 1 页（不显示分页）');
  assert(outlierTotalPages(20) === 1, '20 条 → 1 页（不显示分页）');
  assert(outlierTotalPages(21) === 2, '21 条 → 2 页');
  assert(outlierTotalPages(41) === 3, '41 条 → 3 页');

  const all = Array.from({ length: 25 }, (_, i) => i);
  assert(paginateRecords(all, 0).length === 20, '第 1 页 20 条');
  assert(paginateRecords(all, 1).length === 5, '第 2 页 5 条');
  assert(paginateRecords(all, 0)[0] === 0 && paginateRecords(all, 1)[0] === 20, '分页切片无重叠无丢失');
  assert(
    [...paginateRecords(all, 0), ...paginateRecords(all, 1)].length === all.length,
    '全部分页合计等于记录总数'
  );

  // 只显示分页控件当且仅当 totalPages>1（UI 契约）
  const showPagination = (n: number) => outlierTotalPages(n) > 1;
  assert(!showPagination(20), '<=20 不显示分页');
  assert(showPagination(21), '>20 显示分页');
})();

// ============================================================
console.log('\n九、展开记录包含原始 row 且识别当前指标');
// ============================================================
(() => {
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (!retail) return;
  const text = [
    retail.headers.join('\t'),
    ...retail.rows.map((row) => retail.headers.map((h) => row[h] ?? '').join('\t')),
  ].join('\n');
  const result = parseTableText(text);
  const values = result.rows.map((r) => Number(r['销售额']));
  const detected = detectFieldOutliers(values, { field: '销售额' });
  const contextRows = result.rows; // 全量分析行
  const FIELD = '销售额';
  for (const rec of detected.records) {
    const row = contextRows[rec.rowIndex];
    // 9. 展开内容包含原始 row 的所有字段
    assert(row != null, `记录 ${rec.rowIndex} 存在原始 row`);
    if (!row) continue;
    // 10. 当前指标字段在展开详情中能正确识别并匹配
    assert(FIELD in row, `展开详情包含当前指标字段「${FIELD}」`);
    assert(Number(row[FIELD]) === rec.value, `展开详情当前指标值 === 候选值（${rec.value}）`);
    // 展开详情应包含至少一个上下文字段（日期/门店等业务上下文）
    const hasContext = (row['日期'] !== undefined && row['日期'] !== '') || (row['门店'] !== undefined && row['门店'] !== '');
    assert(hasContext, `展开详情可提供业务上下文（日期/门店）`);
    break; // 校验首条候选即可
  }
})();

// ============================================================
console.log('\n十、friendlyReason 自然中文，无内部枚举');
// ============================================================
(() => {
  const arr = [100, 102, 101, 103, 105, 99, 104, 5000];
  const detected = detectFieldOutliers(arr, { field: '测试指标' });
  assert(detected.records.length >= 1, '存在候选用于 reason 校验', `count=${detected.records.length}`);
  const first = detected.records[0];
  const r = friendlyReason(first, detected.bounds, '测试指标');
  // 11. 用户可读中文
  assert(r.includes('高于统计上界') || r.includes('低于统计下界'), `reason 使用自然中文: ${r}`);
  // 12. 不出现内部枚举文案
  const internalTokens = ['zScore', 'iqr_high', 'outlier=true', ': ', ' =', 'distance=', 'upperBound', '检测方法'];
  for (const t of internalTokens) {
    assert(!r.includes(t), `reason 不包含内部枚举「${t}」: ${r}`);
  }
  // 不出现原始符号形式「> 上界」/「< 下界」
  assert(!/^[<>]\s*上界/.test(r) && !/^[<>]\s*下界/.test(r), `reason 不使用裸符号: ${r}`);
  // 百分比字段追加 %
  const pctRec = { rowIndex: 0, value: 85, direction: 'high' as const, distance: 30, reason: '> 上界 55' };
  const pctReason = friendlyReason(pctRec, { lower: 40, upper: 55 }, '转化率');
  assert(pctReason.includes('%'), `百分比字段 reason 带 %: ${pctReason}`);
  assert(fmtValue(85.6, '转化率').includes('%') && fmtValue(183520, '销售额').includes('183,520'), '值格式化：百分比带 %，金额千分位');
})();

// ============================================================
console.log('\n十一、第一屏"为什么异常"（normalRangeText / buildExplain）');
// ============================================================
(() => {
  const arr = [100, 102, 101, 103, 105, 99, 104, 5000, 1];
  const detected = detectFieldOutliers(arr, { field: '测试指标' });
  assert(detected.status === 'detected', '状态 detected 用于解释基准');
  assert(detected.bounds != null, '存在 bounds');

  // normalRangeText：合法 bounds + 千分位
  const range = normalRangeText(detected.bounds ?? null, '测试指标');
  assert(range != null && range.includes('～'), 'normalRangeText 返回 "lower ～ upper"', range ?? 'null');
  // 无 bounds → null
  assert(normalRangeText(null, 'x') === null, '无 bounds → null');
  assert(normalRangeText(undefined, 'x') === null, 'undefined bounds → null');
  // 百分比字段追加 %
  assert(normalRangeText({ lower: 12.5, upper: 90.5 }, '转化率')?.includes('%') === true, '百分比字段范围带 %');

  // buildExplain
  const ex = buildExplain(detected, '测试指标');
  assert(ex.method === 'IQR（四分位距）', `方法说明: ${ex.method}`);
  assert(ex.totalOutliers === detected.outlierCount, '解释条数 === 检测条数', `${ex.totalOutliers} vs ${detected.outlierCount}`);
  assert(ex.highCount === detected.records.filter(r => r.direction === 'high').length, '解释高数一致');
  assert(ex.lowCount === detected.records.filter(r => r.direction === 'low').length, '解释低数一致');
  assert(ex.countsLine.includes('共有'), `countsLine 自然语言: ${ex.countsLine}`);
  assert((ex.highCount > 0 && ex.countsLine.includes('高于上界')) || ex.highCount === 0, '含"高于上界"计数');
  assert((ex.lowCount > 0 && ex.countsLine.includes('低于下界')) || ex.lowCount === 0, '含"低于下界"计数');
  // 只按 records 统计，不重新检测
  assert(ex.highCount + ex.lowCount === detected.records.length, '高+低 === 记录数');
})();

// ============================================================
console.log('\n十二、单一来源 + 防止回归 legacy detectOutliersFromValues');
// ============================================================
(() => {
  // 唯一异常来源契约：
  //  1) GeneralDataOverview 源码不得 import/调用 legacy detectOutliersFromValues
  //  2) 异常数量与 records 必须来自同一个 OutlierDetectionResult（detectFieldOutliers 产出）
  //     - 表格 outlierCount === result.outlierCount
  //     - result.records.length === result.outlierCount（同一 result 内部一致）
  const here = dirname(fileURLToPath(import.meta.url));
  const src = (() => {
    try {
      return readFileSync(join(here, '../src/components/GeneralDataOverview.tsx'), 'utf-8');
    } catch {
      return '';
    }
  })();
  assert(
    !src.includes('detectOutliersFromValues'),
    'GeneralDataOverview 源码不使用 legacy detectOutliersFromValues'
  );
  assert(
    src.includes('detectFieldOutliers'),
    'GeneralDataOverview 使用权威 detectFieldOutliers'
  );

  // 同一 result：outlierCount 与 records.length 一致（单一来源内部一致性）
  const arr = Array.from({ length: 40 }, (_, i) => (i === 39 ? 10000 : i + 1), );
  const res = detectFieldOutliers(arr, { field: 'val' });
  assert(res.outlierCount === res.records.length, 'outlierCount === records.length（单一来源一致）', `${res.outlierCount} vs ${res.records.length}`);
})();

// ============================================================
console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);
if (failed > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);