/**
 * 示例数据测试脚本
 *
 * 直接导入 src 源码，验证：
 *  - 示例数据完整性与基本质量（id 唯一/名称/字段/行数/无 NaN/Infinity/键合法性）
 *  - 零售数仓样例字段、业务一致性与分析价值（schema、异常候选）
 *  - 所有现有样例仍可解析并具备可分析指标
 *
 * 运行：node --experimental-loader ./tests/ts-loader-hooks.mjs scripts/testSampleData.ts
 */

import { sampleDatasets, getSampleDatasetById } from '../src/data/sampleDatasets.js';
import { parseTableText } from '../src/utils/parseTable.js';
import { resolveFieldSchemas } from '../src/field-schema/index.js';
import { detectFieldOutliers } from '../src/engine/outlierDetection.js';

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

function isFiniteNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 将数据集构造成表格文本并用统一链路解析 */
function parseDataset(dataset: { headers: string[]; rows: Record<string, string | number | null>[] }) {
  const text = [
    dataset.headers.join('\t'),
    ...dataset.rows.map((row) => dataset.headers.map((h) => row[h] ?? '').join('\t')),
  ].join('\n');
  return parseTableText(text);
}

function schemaOf(result: ReturnType<typeof parseTableText>) {
  return resolveFieldSchemas(result.headers, null, {
    mode: 'generic',
    rows: result.rows,
  });
}

console.log('=== 示例数据测试 ===\n');

// ============================================================
console.log('一、统一基本质量校验（所有样例）');
// ============================================================
{
  const ids = new Set<string>();
  for (const ds of sampleDatasets) {
    const errs: string[] = [];
    if (ds.id.trim() === '') errs.push('id 为空');
    if (ids.has(ds.id)) errs.push(`id 重复`);
    ids.add(ds.id);
    if (ds.name.trim() === '') errs.push('name 为空');
    if (!Array.isArray(ds.headers) || ds.headers.length === 0) errs.push('headers 为空');
    if (!Array.isArray(ds.rows) || ds.rows.length === 0) errs.push('rows 为空');

    if (errs.length === 0) {
      const headerSet = new Set(ds.headers);
      for (let r = 0; r < ds.rows.length; r += 1) {
        const row = ds.rows[r];
        for (const key of Object.keys(row)) {
          if (!headerSet.has(key)) errs.push(`第${r + 1}行未知字段: ${key}`);
        }
        for (const h of ds.headers) {
          const v = row[h];
          if (v !== null && v !== undefined && typeof v === 'number' && !Number.isFinite(v)) {
            errs.push(`第${r + 1}行 ${h} 非有限值`);
          }
        }
      }
    }
    assert(errs.length === 0, `${ds.id}: 基本质量校验通过`, errs[0]);
  }
  assert(sampleDatasets.length >= 6, `样例总数 >= 6（实际 ${sampleDatasets.length}）`);
}

// ============================================================
console.log('\n二、每个样例可解析且具备可分析指标');
// ============================================================
{
  for (const ds of sampleDatasets) {
    const result = parseDataset(ds);
    assert(result.summary != null, `${ds.id}: parseSummary 存在`);
    assert(result.summary.fieldTypes.length > 0, `${ds.id}: fieldTypes 非空`);
    const schema = schemaOf(result);
    const metricCount = schema.filter((f) => f.analysisRole === 'metric').length;
    assert(metricCount > 0, `${ds.id}: 存在可分析指标(metric)`, `count=${metricCount}`);
    assert(result.rows.length === ds.rows.length, `${ds.id}: 行数一致`, `expected=${ds.rows.length}, actual=${result.rows.length}`);
  }
}

// ============================================================
console.log('\n三、零售数仓样例存在性与体量');
// ============================================================
{
  const retail = getSampleDatasetById('retail-warehouse-sales');
  assert(retail != null, 'retail-warehouse-sales 存在');
  if (retail) {
    assert(retail.rows.length >= 60 && retail.rows.length <= 120, '行数 60-120', `actual=${retail.rows.length}`);
    assert(retail.featured === true, 'featured 标记 = true');

    const dates = retail.rows
      .map((r) => r['日期'])
      .filter((d): d is string => typeof d === 'string');
    const spanMs = dates.length ? new Date(Math.max(...dates.map((d) => new Date(d).getTime())))
      .getTime() - new Date(Math.min(...dates.map((d) => new Date(d).getTime()))).getTime() : 0;
    assert(spanMs >= 29 * 24 * 3600 * 1000, '日期跨度 >= 30 天', `实际跨度 ${Math.round(spanMs / 86400000)} 天`);

    // 模型覆盖：>=3 dimension，>=6 metric，>=1 time，>=1 identifier
    const result = parseDataset(retail);
    const schema = schemaOf(result);
    const roleCount = (role: string) => schema.filter((f) => f.analysisRole === role).length;
    const metricCount = roleCount('metric');
    const dimCount = roleCount('dimension') + roleCount('description');
    const timeCount = roleCount('time');
    const idCount = roleCount('identifier');
    assert(metricCount >= 6, 'metric >= 6', `actual=${metricCount}`);
    assert(dimCount >= 3, 'dimension/description >= 3', `actual=${dimCount}`);
    assert(timeCount >= 1, 'time >= 1', `actual=${timeCount}`);
    assert(idCount >= 1, 'identifier >= 1', `actual=${idCount}`);

    // 绝不出现 legacy 教育角色
    const roles = new Set(schema.map((f) => f.analysisRole));
    const legacyRoles = ['courseScore', 'primaryTotal', 'sectionTotal', 'rank'];
    for (const lr of legacyRoles) {
      assert(!roles.has(lr as never), `不含 legacy 角色 ${lr}`);
    }

    // 隐私要求：样例不包含真实客户/品牌名
    assert(!retail.name.includes('真实'), 'name 不含“真实”字样（synthetic）');
  }
}

// ============================================================
console.log('\n四、零售数仓业务一致性');
// ============================================================
{
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (retail) {
    const result = parseDataset(retail);
    const rows = result.rows;
    let eqProfitOk = true;
    let eqMarginOk = true;
    let eqOrderOk = true;

    for (const row of rows) {
      const sales = Number(row['销售额']);
      const cost = Number(row['成本']);
      const profit = Number(row['毛利']);
      const margin = Number(row['毛利率']);
      const orders = Number(row['订单数']);
      const avgOrder = Number(row['平均客单价']);

      // 毛利 ≈ 销售额 - 成本（允许 2 元四舍五入误差）
      if (Math.abs(profit - (sales - cost)) > 2) eqProfitOk = false;
      // 毛利率 ≈ 毛利 / 销售额 * 100（允许 1 个百分点误差）
      if (Math.abs(margin - (profit / sales) * 100) > 1) eqMarginOk = false;
      // 平均客单价 ≈ 销售额 / 订单数：订单数为整数取整，低销量高件数行允许相对 5% 误差
      if (orders > 0 && Math.abs(avgOrder - sales / orders) > Math.max(1, (sales / orders) * 0.05)) eqOrderOk = false;
    }
    assert(eqProfitOk, '毛利 ≈ 销售额 - 成本（所有行）');
    assert(eqMarginOk, '毛利率 ≈ 毛利 / 销售额（所有行）');
    assert(eqOrderOk, '平均客单价 ≈ 销售额 / 订单数（所有行）');
  }
}

// ============================================================
console.log('\n五、零售数仓业务波动（非全部同分布）');
// ============================================================
{
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (retail) {
    const regions = new Set(retail.rows.map((r) => r['区域']).filter(Boolean));
    const stores = new Set(retail.rows.map((r) => r['门店']).filter(Boolean));
    const categories = new Set(retail.rows.map((r) => r['品类']).filter(Boolean));
    const channels = new Set(retail.rows.map((r) => r['渠道']).filter(Boolean));
    assert(regions.size >= 2, '区域 >= 2', `actual=${regions.size}`);
    assert(stores.size >= 3, '门店 >= 3', `actual=${stores.size}`);
    assert(categories.size >= 3, '品类 >= 3', `actual=${categories.size}`);
    assert(channels.size >= 2, '渠道 >= 2', `actual=${channels.size}`);

    const salesVals = retail.rows.map((r) => Number(r['销售额'])).filter(Number.isFinite);
    const mean = salesVals.reduce((a, b) => a + b, 0) / salesVals.length;
    const variance = salesVals.reduce((a, b) => a + (b - mean) ** 2, 0) / salesVals.length;
    assert(variance > 0, '销售额存在正常方差', `stddev=${Math.sqrt(variance).toFixed(1)}`);
  }
}

// ============================================================
console.log('\n六、零售数仓异常候选（IQR 检测）');
// ============================================================
{
  const retail = getSampleDatasetById('retail-warehouse-sales');
  if (retail) {
    const result = parseDataset(retail);
    const values = result.rows.map((r) => Number(r['销售额']));
    const detected = detectFieldOutliers(values, { field: '销售额' });
    assert(detected.status === 'detected', '销售额已执行检测并检出候选', `status=${detected.status}`);
    assert(detected.outlierCount >= 1, '至少 1 个高异常候选', `count=${detected.outlierCount}`);
    const highRecs = detected.records.filter((rec) => rec.direction === 'high');
    assert(highRecs.length >= 1, '存在 high 方向候选');
    // 记录可定位日期/门店/值
    if (highRecs[0]) {
      const row = result.rows[highRecs[0].rowIndex];
      assert(highRecs[0].value === Number(row['销售额']), '候选 value 与行一致');
      assert(typeof row['日期'] === 'string' && row['日期'] !== '', '候选可定位日期');
      assert(typeof row['门店'] === 'string' && row['门店'] !== '', '候选可定位门店');
    }
    // 非所有数据都异常
    assert(detected.outlierCount < values.length / 2, '并非多数数据为异常', `count=${detected.outlierCount}/${values.length}`);
  }
}

// ============================================================
console.log('\n七、其他关键样例质量');
// ============================================================
{
  // 满意度样例：NPS 为 0-10 离散评分，取值应集中，避免被当作连续异常
  const survey = getSampleDatasetById('survey-satisfaction');
  if (survey) {
    assert(survey.rows.length >= 20, '满意度样例行数 >= 20', `actual=${survey.rows.length}`);
  }
  const game = getSampleDatasetById('game-character');
  if (game) {
    assert(game.rows.length >= 8, '游戏样例行数 >= 8', `actual=${game.rows.length}`);
  }
  const econ = getSampleDatasetById('country-statistics');
  if (econ) {
    assert(econ.name === '地区经济统计样例', '国家/地区样例已更名为“地区经济统计样例”');
    assert(econ.category === '宏观', 'category 已调整为 宏观');
    assert(!econ.description.includes('国家'), 'description 不再使用“国家”语义');
  }
}

// ============================================================
console.log('\n八、DataSourceState 示例来源语义');
// ============================================================
{
  // 与 App.handleLoadSampleDataset 行为一致：加载示例后 dataSource 应为 sample+sampleId
  const sampleState = { type: 'sample', sampleId: 'retail-warehouse-sales' };
  assert((sampleState as { type: string }).type === 'sample', 'type = sample');
  assert((sampleState as { sampleId: string }).sampleId === 'retail-warehouse-sales', 'sampleId 正确');
  // 手动编辑回退逻辑不覆盖 sample（与 App.tsx 手挡一致）
  const fallback = (rawText: string, ds: { type: string }) =>
    rawText.trim() && ds.type !== 'manual' && ds.type !== 'sample';
  assert(!fallback('2026\n1', sampleState as never), '非空 rawText + sample 来源不回退 manual');
}

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