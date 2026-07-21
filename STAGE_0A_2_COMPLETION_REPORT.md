# Stage 0A-2 完成报告

## 1. 修改目标

建立统一的 `AnalysisDataset` 机制，解决以下问题：
- 消除各分析模块独立截断 5000 行的分散逻辑
- 提供确定性的等距抽样算法（systematic_even_v1）
- 实现用户确认机制，让大数据量分析透明可控
- 统一数据消费点，确保所有统计模块使用相同的数据源

## 2. 修改文件

### 新增文件
- `src/engine/sampling.ts` - 确定性抽样算法实现
- `src/hooks/useAnalysisDataset.ts` - 统一分析数据集管理 Hook
- `scripts/testStage0A2.mjs` - Stage 0A-2 自动化测试脚本

### 修改文件
- `src/App.tsx` - 集成 useAnalysisDataset，移除旧 5000 行警告
- `src/components/AnalysisSection.tsx` - 实现抽样确认 UI 和状态展示
- `src/components/GeneralDataOverview.tsx` - 使用 analysisDataset.rows，移除旧警告
- `src/engine/analysisEngine.ts` - 移除内部 5000 行截断逻辑
- `src/engine/correlationAnalyzer.ts` - 移除内部截断，依赖统一数据源
- `src/engine/groupByDimension.ts` - 移除内部截断，依赖统一数据源
- `src/engine/exportAnalysis.ts` - 导出时记录抽样信息
- `src/hooks/useAnalysisContext.ts` - 使用 analysisDataset.rows 构建派生数据
- `src/hooks/useAnalysisOrchestrator.ts` - 接收 analysisDataset 参数
- `src/hooks/useExportActions.ts` - 传递 samplingInfo 到导出函数
- `src/hooks/useParsedTable.ts` - 移除旧 5000 行警告

## 3. 六种状态的行为

| 状态 | 触发条件 | rows 内容 | 是否执行分析 | 是否允许导出 |
|------|----------|-----------|--------------|--------------|
| `no_data` | 无数据 | 空数组 | 否 | 否 |
| `parse_truncated` | 解析截断（>20000行） | 空数组 | 否 | 否 |
| `awaiting_confirmation` | 筛选后 >5000 行，未确认 | 空数组 | 否 | 否 |
| `cancelled` | 用户取消分析 | 空数组 | 否 | 否 |
| `ready_full` | 筛选后 ≤5000 行 | 完整筛选数据 | 是 | 是 |
| `ready_sampled` | 筛选后 >5000 行，已确认 | 抽样 5000 行 | 是 | 是 |

## 4. 抽样算法及边界

### 算法：systematic_even_v1
- **公式**：`index = Math.round(i * (rowCount - 1) / (sampleSize - 1))`
- **特性**：
  - 确定性：相同输入产生相同输出
  - 包含首尾：sampleSize > 1 时包含第 0 行和最后一行
  - 无重复索引
  - 保持原始顺序
  - 时间复杂度 O(sampleSize)

### 边界处理
- `rowCount <= 0` 或 `sampleSize <= 0` → 返回空数组
- `sampleSize === 1` → 返回 `[0]`（仅首行）
- `rowCount <= sampleSize` → 返回完整数据（0 到 rowCount-1）

## 5. 数据消费点审计结果

### 已迁移到 analysisDataset.rows 的模块
1. **单变量统计** - `useAnalysisContext.ts` 通过 `buildDerivedDataContext(analysisDataset.rows, ...)`
2. **相关性分析** - `correlationAnalyzer.ts` 使用 `context.filteredRows`（来自 analysisDataset.rows）
3. **分组统计** - `groupByDimension.ts` 使用 `derivedData.filteredRows`
4. **数据概览** - `GeneralDataOverview.tsx` 接收 `analysisDataset.rows`
5. **异常值检测** - `GeneralDataOverview.tsx` 内部使用传入的 rows
6. **分析解释** - `AnalysisSection.tsx` 使用 `analysisDataset.rows`
7. **指标计算** - `analysisEngine.ts` 使用 `context.filteredRows`

### 未迁移的模块（设计正确）
- **fieldScores** - 基于 `parseSummary.fieldTypes`（字段元数据），不依赖 rows
  - 理由：字段可分析性评分是字段结构识别，使用字段的统计特征（numericRatio、uniqueRatio 等），这些特征在解析阶段已计算完成

## 6. fieldScores 与 outliers 最终数据源

| 派生结果 | 当前数据源 | 最终数据源 | 是否修改 | 理由 |
|----------|------------|------------|----------|------|
| fieldScores | parseSummary.fieldTypes | parseSummary.fieldTypes | 否 | 字段可分析性评分基于字段元数据（numericRatio、uniqueRatio、contentFeature），这些特征在解析阶段已计算，不依赖具体行数据 |
| outliers | analysisDataset.rows | analysisDataset.rows | 是 | 异常值检测需要实际数值数据，必须使用统一的分析数据集 |

## 7. UI 交互流程

### 数据量 ≤5000 行
1. 用户导入/筛选数据
2. 系统自动进入 `ready_full` 状态
3. 直接显示分析结果，无需用户确认

### 数据量 >5000 行
1. 用户导入/筛选数据
2. 系统进入 `awaiting_confirmation` 状态
3. 显示抽样确认对话框：
   - 展示筛选后数据行数
   - 说明分析上限 5000 行
   - 介绍抽样算法（systematic_even_v1）
   - 提示确定性抽样和可能的偏差
4. 用户选择：
   - **确认分析** → 进入 `ready_sampled`，执行抽样并显示结果
   - **取消分析** → 进入 `cancelled`，不执行分析
5. `cancelled` 状态下可：
   - 修改筛选条件（减少数据量）
   - 重新确认抽样分析

### 抽样分析中
- 持续显示抽样信息面板：
  - 筛选后行数
  - 实际分析行数
  - 抽样算法
  - 提示"当前结果基于样本而非全部筛选数据"

## 8. 导出规则

### 分析结果导出
- **条件**：仅在 `ready_full` 或 `ready_sampled` 状态下允许
- **内容**：
  - 统计指标（均值、中位数、标准差等）
  - 排名位置分析
  - 抽样信息（如适用）：
    - 筛选后行数
    - 实际分析行数
    - 是否抽样
    - 算法版本
    - 样本说明和偏差提示

### 原始/筛选数据导出
- **条件**：任何时候都可导出筛选后的完整数据
- **标识**：文件名和说明中明确标注"数据导出"，与分析结果区分
- **内容**：筛选后的所有行（不抽样）

### 禁止导出的状态
- `no_data`
- `parse_truncated`
- `awaiting_confirmation`
- `cancelled`

## 9. 测试数量和结果

### 自动化测试（testStage0A2.mjs）
- **总测试数**：36 个测试场景
- **总断言数**：52 个断言
- **通过数**：52
- **失败数**：0
- **覆盖率**：
  - 抽样算法：12 项（边界条件、确定性、首尾包含、无重复、顺序保持）
  - 状态转换：11 项（6 种状态的进入/退出条件）
  - 数据一致性：8 项（各模块使用统一数据源）
  - UI 行为：5 项（状态展示、导出限制）

### 回归测试
- `npm run test:analysis-engine` - 64 通过，0 失败
- `node scripts/testSafeFormat.mjs` - 52 通过，0 失败
- `node scripts/testStage0A1.mjs` - 72 通过，0 失败
- `node scripts/testStage0A2.mjs` - 52 通过，0 失败
- `npx tsc --noEmit` - 通过
- `npm run build` - 通过

## 10. 已知限制

1. **抽样偏差**：对于具有明显周期性或规律性的数据，等距抽样可能引入系统性偏差
   - 缓解措施：UI 明确提示用户，建议用户根据数据特征判断

2. **fieldScores 不依赖行数据**：字段可分析性评分基于解析阶段的统计特征，不随抽样变化
   - 理由：这是设计决策，字段结构识别应在解析阶段完成，避免重复计算

3. **outliers 在 GeneralDataOverview 中计算**：异常值检测在组件内部执行，未提取到独立 Hook
   - 理由：当前仅在数据概览中使用，如后续需要可提取到 useAnalysisContext

4. **datasetKey 稳定性**：依赖 `dataRevision` 和 `filterRevision`，筛选条件变化会触发重新确认
   - 理由：确保数据一致性，避免旧确认用于新数据

## 11. 回滚方式

Stage 0A-2 为独立提交，可通过以下方式回滚：

```bash
# 查看提交历史，找到 Stage 0A-2 提交
git log --oneline

# 回滚到 Stage 0A-2 之前的提交
git revert <stage-0a-2-commit-hash>

# 或硬重置（谨慎使用）
git reset --hard HEAD~1
```

### 回滚影响
- 恢复各模块独立的 5000 行截断逻辑
- 移除抽样确认 UI
- 移除 useAnalysisDataset Hook
- 移除 sampling.ts 模块

## 12. 是否满足进入 Stage 1A 的条件

**✅ 满足**

### 完成标准核对
- [x] 统一分析数据集机制建立
- [x] 确定性抽样算法实现并测试
- [x] 用户确认机制实现
- [x] 所有分析模块迁移到统一数据源
- [x] 数据消费点审计完成
- [x] 自动化测试覆盖 36 个场景
- [x] 回归测试全部通过
- [x] TypeScript 编译通过
- [x] 生产构建通过
- [x] 完成报告编写

### Stage 1A 前置条件
Stage 0A-2 为 Stage 1A（字段分类通用化）奠定基础：
- 统一数据源确保字段分类基于一致的数据集
- 抽样机制保证大数据量下的性能
- 确认机制提供用户控制能力

**建议**：可以开始 Stage 1A 的规划和实施。
