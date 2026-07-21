# Stage 0A-2 实施计划

**制定日期**: 2026-07-21  
**前置条件**: Stage 0A-1 已完成  
**目标**: 建立统一的 AnalysisDataset，使所有统计模块使用同一批完整数据或同一批抽样数据

---

## 一、Stage 0A-1 元数据收尾

### 1.1 报告实际路径

```
g:\Game—Score\STAGE_0A_1_COMPLETION_REPORT.md
```

### 1.2 三个提交的完整 40 位 hash

| 短 hash | 完整 hash | 提交信息 |
|---------|-----------|---------|
| `786436f` | `786436f6f6673271be384fd2e50a2265890b0bda` | docs: finalize Stage 0A data pipeline design |
| `4580853` | `458085337e1491096f213e42fa0c3194aac10f57` | fix: make parse volume and truncation state explicit |
| `956865e` | `956865efa4cb6cad0e6b6401a5f330ca3e6c121f` | fix: enforce analysis blocking for parse truncation |

### 1.3 `git status --short` 完整原始输出

```
 M STAGE_0A_1_COMPLETION_REPORT.md
 M src/App.tsx
 M src/components/AnalysisSection.tsx
 M src/components/GeneralDataOverview.tsx
 M src/engine/analysisEngine.ts
 M src/engine/correlationAnalyzer.ts
 M src/engine/exportAnalysis.ts
 M src/engine/groupByDimension.ts
 M src/hooks/useAnalysisContext.ts
 M src/hooks/useAnalysisOrchestrator.ts
?? DATA_VOLUME_PIPELINE_AUDIT.md
?? PLATFORM_UPGRADE_GAP_ANALYSIS.md
?? PLATFORM_UPGRADE_ROADMAP.md
?? src/engine/sampling.ts
?? src/hooks/useAnalysisDataset.ts
```

**说明**: 
- 10 个文件已修改但未提交（Stage 0A-2 初步实现）
- 5 个未跟踪文件（3 个规划文档 + 2 个 Stage 0A-2 新文件）

### 1.4 当前未跟踪的 3 个规划文档

| 文件名 | 说明 | 处理建议 |
|-------|------|---------|
| `DATA_VOLUME_PIPELINE_AUDIT.md` | 数据管线审计报告 | 保留未跟踪（规划文档，不属于代码变更） |
| `PLATFORM_UPGRADE_GAP_ANALYSIS.md` | 平台升级差距分析 | 保留未跟踪（规划文档，不属于代码变更） |
| `PLATFORM_UPGRADE_ROADMAP.md` | 平台升级路线图 | 保留未跟踪（规划文档，不属于代码变更） |

**结论**: 这三个文档属于平台升级规划，不属于 Stage 0A-1 或 Stage 0A-2 代码变更，应保留未跟踪状态。

### 1.5 工作区状态描述

**准确描述**: 
> Stage 0A-1 代码已全部提交，但仍存在未跟踪规划文档。Stage 0A-2 初步实现已完成，但尚未提交。

**禁止描述**: 
- ❌ "工作区干净"（存在未跟踪文件）
- ❌ "所有变更已提交"（Stage 0A-2 代码未提交）

### 1.6 修正测试覆盖表述

**当前问题**: STAGE_0A_1_COMPLETION_REPORT.md 中的测试覆盖矩阵表述不准确。

**修正方案**:

| 输入路径 | 单元测试 | 集成测试 | 仅代码审计 |
|---------|:-------:|:-------:|:---------:|
| Excel上传 | - | - | ✅ |
| CSV上传 | - | - | ✅ |
| 文本粘贴 | - | - | ✅ |
| 文本编辑 | - | - | ✅ |
| 示例数据 | - | - | ✅ |
| Sheet切换 | - | - | ✅ |

**说明**: 
- ✅ 单元测试验证了解析函数和 `DataVolumeState` 计算逻辑
- ✅ 人工代码审计确认了六种输入路径的调用链
- ❌ 未进行集成测试模拟真实用户行为（如上传文件、切换Sheet）
- ❌ 不得写成"六种路径均有自动化覆盖"

---

## 二、Stage 0A-2 当前实现状态

### 2.1 已完成的工作

**新增文件**:
- ✅ `src/engine/sampling.ts` - 实现 `systematic_even_v1` 抽样算法
- ✅ `src/hooks/useAnalysisDataset.ts` - 实现统一分析数据集管理

**修改文件** (10 个):
- ✅ `src/App.tsx` - 集成 `useAnalysisDataset`
- ✅ `src/components/AnalysisSection.tsx` - 接收 `analysisDataset` props
- ✅ `src/components/GeneralDataOverview.tsx` - 移除内部 5000 行截断
- ✅ `src/engine/analysisEngine.ts` - 移除内部 5000 行截断
- ✅ `src/engine/correlationAnalyzer.ts` - 移除内部 5000 行截断
- ✅ `src/engine/exportAnalysis.ts` - 添加抽样信息记录
- ✅ `src/engine/groupByDimension.ts` - 移除内部 5000 行截断
- ✅ `src/hooks/useAnalysisContext.ts` - 接收 `AnalysisDataset`
- ✅ `src/hooks/useAnalysisOrchestrator.ts` - 使用 `AnalysisDataset`

### 2.2 待完成的工作

**核心任务**:
1. ✅ 实现 `systematic_even_v1` 等距确定性抽样（已完成）
2. ✅ 定义 `AnalysisDataset`、`SamplingInfo` 和显式状态类型（已完成）
3. ✅ 实现稳定的 `datasetKey`（已完成）
4. ✅ 实现 `useAnalysisDataset`（已完成）
5. ⏳ 增加超过5000行时的确认、取消和状态展示（**待实现 UI**）
6. ✅ 将统计消费统一迁移到 `AnalysisDataset.rows`（已完成）
7. ✅ 移除4处模块内部的独立5000行截断（已完成）
8. ✅ 确保分析结果导出记录抽样信息（已完成）

**关键缺失**:
- ❌ UI 层未实现确认/取消对话框
- ❌ 未验证 `fieldScores` 和 `outliers` 是否使用 `AnalysisDataset.rows`
- ❌ 未编写测试脚本验证抽样算法和统一数据源
- ❌ 未运行全部测试并验证
- ❌ 未提交 Stage 0A-2 代码

---

## 三、Stage 0A-2 实施计划

### 3.1 实施步骤

#### 步骤 1: 实现确认/取消 UI（优先级：高）

**目标**: 当 `analysisDataset.status === 'awaiting_confirmation'` 时，显示确认对话框。

**实现位置**: `src/components/AnalysisSection.tsx`

**UI 设计**:
```tsx
{analysisDataset?.status === 'awaiting_confirmation' && (
  <div style={styles.confirmationDialog}>
    <div style={styles.dialogTitle}>数据量较大，是否启用抽样分析？</div>
    <div style={styles.dialogContent}>
      <p>当前数据包含 <strong>{analysisDataset.samplingInfo?.originalRowCount}</strong> 行，</p>
      <p>将抽取 <strong>{analysisDataset.samplingInfo?.sampledRowCount}</strong> 行进行分析。</p>
      <p style={styles.hint}>抽样算法：systematic_even_v1（等距确定性抽样）</p>
    </div>
    <div style={styles.dialogActions}>
      <button 
        onClick={() => confirmDataset(analysisDataset.datasetKey)}
        style={styles.confirmBtn}
      >
        确认抽样
      </button>
      <button 
        onClick={() => cancelDataset(analysisDataset.datasetKey)}
        style={styles.cancelBtn}
      >
        取消分析
      </button>
    </div>
  </div>
)}
```

**状态展示**:
- `no_data`: 不显示任何分析内容
- `parse_truncated`: 显示截断警告（Stage 0A-1 已实现）
- `awaiting_confirmation`: 显示确认对话框
- `cancelled`: 显示"已取消分析"提示
- `ready_full`: 正常显示分析结果（全量）
- `ready_sampled`: 正常显示分析结果（抽样），并在顶部显示抽样信息

#### 步骤 2: 验证 fieldScores 和 outliers 数据源（优先级：高）

**目标**: 确认 `fieldScores` 和 `outliers` 是否使用 `AnalysisDataset.rows`。

**检查位置**:
- `src/hooks/useAnalysisOrchestrator.ts` - 查看 `fieldScores` 计算逻辑
- `src/engine/context.ts` - 查看 `DerivedDataContext` 定义
- `src/utils/tableParser/fieldClassifier.ts` - 查看 `calculateFieldAnalyticScore` 实现

**验证标准**:
- ✅ 如果 `fieldScores` 使用分布、缺失率、唯一值率、均值等数据统计，必须基于 `AnalysisDataset.rows`
- ✅ 如果 `outliers` 使用分布、均值、标准差等统计，必须基于 `AnalysisDataset.rows`
- ❌ 不能仅因为名称是"字段评分"就继续使用筛选后全量数据

**预期修改**:
- 如果 `fieldScores` 和 `outliers` 未使用 `AnalysisDataset.rows`，需要修改 `useDerivedData` 或相关计算函数，使其依赖 `analysisDataset.rows` 而非 `filteredRows`。

#### 步骤 3: 编写测试脚本（优先级：高）

**目标**: 验证抽样算法和统一数据源的正确性。

**测试文件**: `scripts/testStage0A2.mjs`

**测试用例**（至少覆盖以下 13 项）:

1. **边界测试**:
   - 4999 行（全量分析）
   - 5000 行（全量分析）
   - 5001 行（抽样分析）
   - 19999 行（抽样分析）
   - 20000 行（抽样分析）

2. **确认机制测试**:
   - 5001 行时确认前不分析（status = 'awaiting_confirmation'）
   - 确认后恰好分析 5000 行（status = 'ready_sampled'）
   - 取消后不分析（status = 'cancelled'）

3. **筛选恢复测试**:
   - 筛选后从 5001 行降到 5000 行时恢复完整分析（status = 'ready_full'）

4. **确认失效测试**:
   - 新文件后旧确认失效
   - Sheet 切换后旧确认失效
   - 文本重解析后旧确认失效
   - 筛选变化后旧确认失效

5. **抽样算法测试**:
   - 相同输入抽样结果一致（确定性）
   - 首尾包含（sampleSize > 1 时）
   - 无重复索引
   - 顺序不变

6. **统一数据源测试**:
   - 所有统计消费点获得相同的行标识集合
   - 页面分析结果与导出使用同一数据集

7. **截断阻断测试**:
   - 20001 行以上仍进入 `parse_truncated`，不得进入抽样

8. **回归测试**:
   - 现有 64 项验证全部继续通过（`npm run test:analysis-engine`）
   - 现有 52 项验证全部继续通过（`node scripts/testSafeFormat.mjs`）
   - 现有 72 项验证全部继续通过（`node scripts/testStage0A1.mjs`）

9. **编译测试**:
   - TypeScript 检查通过（`npx tsc --noEmit`）
   - Vite 构建通过（`npm run build`）

**测试统计目标**:
- 测试场景: 13 个
- 测试用例: 30+ 个
- 断言数量: 100+ 个

#### 步骤 4: 运行全部测试并验证（优先级：高）

**验证命令**:
```bash
# 1. 运行现有测试
npm run test:analysis-engine
node scripts/testSafeFormat.mjs
node scripts/testStage0A1.mjs

# 2. 运行新增测试
node scripts/testStage0A2.mjs

# 3. TypeScript 检查
npx tsc --noEmit

# 4. Vite 构建
npm run build
```

**验收标准**:
- ✅ 所有测试通过（exit code 0）
- ✅ 无 TypeScript 编译错误
- ✅ 无 Vite 构建错误

#### 步骤 5: 提交 Stage 0A-2 代码（优先级：高）

**提交信息**:
```
feat: implement unified AnalysisDataset with systematic sampling

- Implement systematic_even_v1 deterministic sampling algorithm
- Create AnalysisDataset, SamplingInfo, and explicit status types
- Implement stable datasetKey mechanism
- Implement useAnalysisDataset hook with confirmation/cancellation
- Add UI for dataset confirmation when >5000 rows
- Migrate all statistical consumption to AnalysisDataset.rows
- Remove 4 internal 5000-row truncations
- Ensure analysis export records sampling information
- Add comprehensive tests for sampling and unified data source
```

**提交边界**:
- ✅ 仅包含 Stage 0A-2 相关变更
- ❌ 不混入字段分类通用化
- ❌ 不混入指标方向改造
- ❌ 不混入数据清洗
- ❌ 不混入中低风险 `.toFixed()`
- ❌ 不混入废弃文件删除
- ❌ 不混入依赖升级
- ❌ 不混入无关 UI 重构

---

## 四、关键设计决策

### 4.1 抽样算法选择

**算法**: `systematic_even_v1`

**公式**: 
```typescript
index = Math.round(i * (rowCount - 1) / (sampleSize - 1))
```

**优势**:
- ✅ 确定性：相同输入得到相同结果
- ✅ 首尾包含：sampleSize > 1 时包含第一行和最后一行
- ✅ 无重复：不会产生重复索引
- ✅ 保序：保持原始顺序
- ✅ 高效：复杂度 O(sampleSize)

**边界情况**:
- `sampleSize <= 0`: 返回空数组
- `rowCount <= sampleSize`: 返回完整数据副本
- `sampleSize === 1`: 返回首行（首尾保证的例外）

### 4.2 确认机制设计

**核心原则**: 确认状态必须绑定当前 `datasetKey`，不得仅依赖 `useEffect` 重置布尔状态。

**实现方案**:
```typescript
const confirmedDatasetKey = ref<string | null>(null)
const cancelledDatasetKey = ref<string | null>(null)

// 判断逻辑
isConfirmed = confirmedDatasetKey.current === datasetKey
isCancelled = cancelledDatasetKey.current === datasetKey

// 新数据自动失效旧确认（通过 useEffect 清理）
useEffect(() => {
  if (confirmedDatasetKey && confirmedDatasetKey !== datasetKey) {
    setConfirmedDatasetKey(null);
  }
  if (cancelledDatasetKey && cancelledDatasetKey !== datasetKey) {
    setCancelledDatasetKey(null);
  }
}, [datasetKey, confirmedDatasetKey, cancelledDatasetKey]);
```

**优势**:
- ✅ 确认状态与 datasetKey 绑定，避免状态不一致
- ✅ 新数据自动失效旧确认，无需手动重置
- ✅ 显式状态管理，易于调试和测试

### 4.3 统一数据源要求

**必须基于 `AnalysisDataset.rows` 的内容**:
- ✅ 单变量统计（`computeMetric`）
- ✅ 百分位（`computePosition`）
- ✅ 相关性（`analyzeCorrelations`）
- ✅ 分组统计（`groupByDimension`）
- ✅ 异常值（`detectOutliers`）
- ✅ 数据概览（`GeneralDataOverview`）
- ✅ 雷达图（`RadarAnalysis`）
- ✅ 优势/弱势结论（`generateExplanation`）
- ✅ 自动解释（`AnalysisExplainer`）
- ✅ 分析结果导出（`exportSummaryToCsv`）

**特别审查**:
- ⚠️ `fieldScores`: 如果使用分布、缺失率、唯一值率、均值等数据统计，必须迁移
- ⚠️ `outliers`: 如果使用分布、均值、标准差等统计，必须迁移

---

## 五、风险评估

### 5.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 抽样算法实现错误 | 高 | 编写详细测试用例验证边界情况 |
| 确认机制状态不一致 | 高 | 使用 datasetKey 绑定，避免 useEffect 重置 |
| fieldScores/outliers 未迁移 | 中 | 代码审计 + 测试验证 |
| 旧确认未失效 | 中 | useEffect 清理 + datasetKey 比对 |
| 测试覆盖不足 | 中 | 编写 13 项测试用例，覆盖所有边界 |

### 5.2 回归风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 现有 64 项测试失败 | 高 | 运行 `npm run test:analysis-engine` 验证 |
| 现有 52 项测试失败 | 高 | 运行 `node scripts/testSafeFormat.mjs` 验证 |
| 现有 72 项测试失败 | 高 | 运行 `node scripts/testStage0A1.mjs` 验证 |
| TypeScript 编译错误 | 高 | 运行 `npx tsc --noEmit` 验证 |
| Vite 构建错误 | 高 | 运行 `npm run build` 验证 |

---

## 六、验收标准

### 6.1 功能验收

- ✅ 实现 `systematic_even_v1` 等距确定性抽样
- ✅ 定义 `AnalysisDataset`、`SamplingInfo` 和显式状态类型
- ✅ 实现稳定的 `datasetKey`
- ✅ 实现 `useAnalysisDataset`
- ✅ 增加超过5000行时的确认、取消和状态展示
- ✅ 将统计消费统一迁移到 `AnalysisDataset.rows`
- ✅ 移除4处模块内部的独立5000行截断
- ✅ 确保分析结果导出记录抽样信息

### 6.2 测试验收

- ✅ 新增测试覆盖 13 项要求
- ✅ 现有 64 项测试全部通过
- ✅ 现有 52 项测试全部通过
- ✅ 现有 72 项测试全部通过
- ✅ TypeScript 检查通过
- ✅ Vite 构建通过

### 6.3 提交验收

- ✅ Stage 0A-2 单独提交
- ✅ 不混入无关变更
- ✅ 提交信息清晰准确

---

## 七、最终交付物

### 7.1 代码变更

**新增文件**:
- `src/engine/sampling.ts`
- `src/hooks/useAnalysisDataset.ts`
- `scripts/testStage0A2.mjs`

**修改文件**:
- `src/App.tsx`
- `src/components/AnalysisSection.tsx`
- `src/components/GeneralDataOverview.tsx`
- `src/engine/analysisEngine.ts`
- `src/engine/correlationAnalyzer.ts`
- `src/engine/exportAnalysis.ts`
- `src/engine/groupByDimension.ts`
- `src/hooks/useAnalysisContext.ts`
- `src/hooks/useAnalysisOrchestrator.ts`

### 7.2 测试报告

**测试统计**:
- 测试场景: 13 个
- 测试用例: 30+ 个
- 断言数量: 100+ 个
- 通过数量: 100+ 个
- 失败数量: 0 个

### 7.3 提交信息

**Commit hash**: 待生成

**提交信息**:
```
feat: implement unified AnalysisDataset with systematic sampling
```

---

## 八、下一步行动

### 8.1 立即执行

1. **实现确认/取消 UI**（优先级：高）
   - 修改 `src/components/AnalysisSection.tsx`
   - 添加确认对话框和状态展示

2. **验证 fieldScores 和 outliers 数据源**（优先级：高）
   - 审计 `src/hooks/useAnalysisOrchestrator.ts`
   - 审计 `src/engine/context.ts`
   - 必要时修改 `useDerivedData`

3. **编写测试脚本**（优先级：高）
   - 创建 `scripts/testStage0A2.mjs`
   - 覆盖 13 项测试用例

4. **运行全部测试**（优先级：高）
   - 运行现有测试（64 + 52 + 72）
   - 运行新增测试（100+）
   - 运行 TypeScript 检查
   - 运行 Vite 构建

5. **提交代码**（优先级：高）
   - 生成提交
   - 记录 commit hash

### 8.2 后续优化

- 考虑添加抽样偏差提示（有序/周期数据）
- 考虑添加抽样详情展示（索引分布图）
- 考虑添加抽样性能监控（耗时统计）

---

**计划制定日期**: 2026-07-21  
**计划版本**: v1.0
