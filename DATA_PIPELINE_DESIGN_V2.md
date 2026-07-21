# 数据管道架构设计 v2

**设计日期**: 2026-07-21  
**设计版本**: v2.2（设计纠偏终版）  
**设计目标**: 建立独立的数据管道层，统一管理数据量状态和分析数据集

---

## 一、设计原则

### 1.1 核心原则

1. **职责分离**: 数据抽样和分析数据集管理属于数据管道职责，不属于筛选状态职责
2. **统一入口**: 所有统计分析模块必须依赖统一的数据入口（`AnalysisDataset.rows`），禁止自行截断
3. **状态透明**: 用户始终知道原始数据量、已解析数据量、已分析数据量
4. **确定性**: 相同有序输入产生完全相同的分析数据集
5. **纯计算约束**: `useMemo` 必须保持纯计算，禁止调用任何 state setter

### 1.2 禁止事项

- ❌ 分析模块自行执行 `rows.slice()`
- ❌ 分析模块自行执行 `MAX_ROWS` 截断
- ❌ 分析模块自己生成分析样本
- ❌ 筛选状态管理分析数据集
- ❌ `useMemo` 中调用 `setState`/`useEffect` 触发器
- ❌ 将"前 20000 行的分析"包装成完整数据抽样分析

---

## 二、数据流架构

### 2.1 整体数据流（六层）

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: 数据输入层                                             │
│  ├─ Excel 上传 → parseWorkbook() → ParsedFileResult             │
│  ├─ CSV 上传   → parseWorkbook() → ParsedFileResult             │
│  ├─ 文本粘贴   → parseTableText() → ParsedTable                 │
│  └─ 示例数据   → loadExampleData() → ParsedTable                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: 解析状态管理层 (useParsedTable)                        │
│  ├─ parsedData: ParsedTable                                     │
│  ├─ parseWarnings: string[]                                     │
│  ├─ parseSummary: ParseSummary                                  │
│  └─ dataVolumeState: DataVolumeState                            │
│     ├─ physicalRowCount                                         │
│     ├─ headerRowCount                                           │
│     ├─ rawRowCount                                              │
│     ├─ parsedRowCount                                           │
│     ├─ validRowCount                                            │
│     ├─ emptyRowCount                                            │
│     ├─ summaryRowCount                                          │
│     ├─ invalidRowCount                                          │
│     ├─ isParseTruncated                                         │
│     └─ parseTruncationWarning                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: 筛选层 (useFilterState)                               │
│  ├─ filterConditions: FilterCondition[]                         │
│  ├─ filterResult.filteredRows: Record<string, string>[]         │
│  ├─ filterResult.filterSummary.filteredRowCount                 │
│  └─ filteredParsedData: ParsedTable                             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3.5: 数据集身份层 (generateDatasetKey)                    │
│  └─ datasetKey: string = dataRevision + '_' + filterRevision    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: 分析数据集层 (useAnalysisDataset) [新增]              │
│  ├─ datasetState: AnalysisDatasetState (显式状态联合)           │
│  │   ├─ 'no_data'                                              │
│  │   ├─ 'parse_truncated'                                      │
│  │   ├─ 'awaiting_confirmation'                                │
│  │   ├─ 'cancelled'                                            │
│  │   ├─ 'ready_full'                                           │
│  │   └─ 'ready_sampled'                                        │
│  ├─ confirmSampling() / cancelSampling()                        │
│  └─ datasetKey 变化时自动重置确认状态 (useEffect)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5: 分析上下文层 (DerivedDataContext) [修改]              │
│  ├─ analysisRows: Record<string, string>[] [替代 filteredRows]  │
│  ├─ fieldScores: Record<string, AnalyticScore>                  │
│  └─ outliers: Record<string, Array<...>>                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 6: 分析消费层                                            │
│  ├─ analysisEngine.computeMetric → context.analysisRows         │
│  ├─ correlationAnalyzer → context.analysisRows                  │
│  ├─ groupByDimension → analysisRows (由 orchestrator 传入)      │
│  └─ GeneralDataOverview → analysisRows (由 AnalysisSection 传入)│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流说明

1. **数据输入层**: 负责解析文件/文本，生成 ParsedTable
2. **解析状态管理层**: 保存解析结果、数据量状态（DataVolumeState）和解析警告
3. **筛选层**: 基于筛选条件生成 filteredRows，仅负责筛选逻辑
4. **数据集身份层**: 生成 `datasetKey`，标识当前数据集的唯一身份
5. **分析数据集层**: 基于 filteredRows 和 datasetKey 生成 AnalysisDatasetState
6. **分析上下文层**: 将 `AnalysisDataset.rows` 传递给分析引擎
7. **分析消费层**: 各分析模块统一使用 `analysisRows`

---

## 三、核心数据结构

### 3.1 DataVolumeState - 数据量状态

**职责**: 记录解析阶段的全部数据量信息

**定义位置**: `src/types.ts`

```typescript
/**
 * 数据量状态 - 记录解析阶段的数据量信息
 * 
 * 行数口径定义（七类）：
 * 1. physicalRowCount  - 工作表物理总行数（原始二维数组长度）
 * 2. headerRowCount    - 表头占用行数（1 或更多，支持多级表头）
 * 3. rawRowCount       - 原始数据行数 = physicalRowCount - headerRowCount
 * 4. parsedRowCount    - 解析器实际处理的数据行数（≤ 20000，受解析上限截断）
 * 5. validRowCount     - 解析后有效数据行数（排除空行、汇总行、无效行）
 * 6. filteredRowCount  - 筛选后数据行数（由筛选层产生，不属于本结构）
 * 7. analysisRowCount  - 实际参与分析的数据行数（≤ 5000，由分析数据集层产生）
 */
export interface DataVolumeState {
  /** 1. 工作表物理总行数（rawData.length，截断前） */
  physicalRowCount: number;

  /** 2. 表头占用行数（detection.headerRowIndex + 1） */
  headerRowCount: number;

  /** 3. 原始数据行数 = physicalRowCount - headerRowCount */
  rawRowCount: number;

  /** 4. 解析器实际处理的数据行数 = min(rawRowCount, 20000) 截断后 */
  parsedRowCount: number;

  /** 5. 解析后有效数据行数（排除空行、汇总行、无效行） */
  validRowCount: number;

  /** 空行数（由行分类器统计） */
  emptyRowCount: number;

  /** 汇总行数（由行分类器统计） */
  summaryRowCount: number;

  /** 无效行数（由行分类器统计） */
  invalidRowCount: number;

  /** 是否发生解析阶段截断（rawRowCount > 20000） */
  isParseTruncated: boolean;

  /** 解析截断警告（如果发生截断） */
  parseTruncationWarning?: string;
}
```

**各数量的产生位置和计算公式**:

| 数量 | 产生位置 | 计算公式 |
|------|---------|---------|
| `physicalRowCount` | `workbook.ts:parseSheetData` | `rawData.length`（截断前） |
| `headerRowCount` | `workbook.ts:parseSheetData` | `detection.headerRowIndex + 1` |
| `rawRowCount` | `workbook.ts:parseSheetData` | `physicalRowCount - headerRowCount` |
| `parsedRowCount` | `workbook.ts:parseSheetData` | `min(rawRowCount, MAX_ROWS)` 截断后的数据行数 |
| `validRowCount` | `workbook.ts:parseSheetData` | `rowClassification.validData.length` |
| `emptyRowCount` | `workbook.ts:parseSheetData` | `rowClassification.empty.length` |
| `summaryRowCount` | `workbook.ts:parseSheetData` | `rowClassification.summary.length` |
| `invalidRowCount` | `workbook.ts:parseSheetData` | `rowClassification.invalid.length` |
| `filteredRowCount` | `useFilterState` / `filterRows.ts` | `filterResult.filteredRows.length` |
| `analysisRowCount` | `useAnalysisDataset` | `dataset.rows.length`（≤ 5000） |

**验证公式**:
```
physicalRowCount = headerRowCount + rawRowCount
rawRowCount >= parsedRowCount  （当 rawRowCount > 20000 时取等号不成立）
parsedRowCount = validRowCount + emptyRowCount + summaryRowCount + invalidRowCount
```

**生成时机**: 解析完成后（parseWorkbook / parseTableText / parseWorkbookSheet）

**保存位置**: `useParsedTable` hook

---

### 3.2 datasetKey - 数据集身份标识

**职责**: 稳定标识当前数据集的唯一身份，任何数据变化都产生新的 datasetKey

**定义位置**: `src/utils/datasetKey.ts`（新增）

**设计原则**:
1. **dataRevision**: 成功解析后递增，解析失败不覆盖有效版本
2. **filterRevision**: 筛选条件变化时稳定序列化生成
3. **防碰撞**: 使用分隔符和编码，避免字段值包含 `_` `|` `:` 时产生相同 key
4. **异步安全**: 配合 parseVersionRef 防止旧解析结果覆盖新数据

```typescript
/**
 * 生成数据集身份标识
 * 
 * 组成：
 * - dataRevision: 成功解析后自增（文件上传/Sheet切换/文本重新解析/表头变化）
 * - filterRevision: 筛选条件稳定序列化后的版本号
 * 
 * 能够区分以下变化：
 * ✅ 新文件上传（dataRevision 递增）
 * ✅ 文本数据重新解析（dataRevision 递增）
 * ✅ 工作表切换（dataRevision 递增）
 * ✅ 表头识别结果变化（dataRevision 递增）
 * ✅ 筛选条件变化（filterRevision 递增）
 * ✅ 数据清洗结果变化（dataRevision 递增）
 * ✅ 数据顺序变化（dataRevision 递增）
 * 
 * 防碰撞机制：
 * - dataRevision 和 filterRevision 均为数字，使用 '_' 分隔
 * - 不使用字段值直接拼接，避免特殊字符导致碰撞
 */
export function generateDatasetKey(
  dataRevision: number,
  filterRevision: number
): string {
  return `${dataRevision}_${filterRevision}`;
}

/**
 * 生成筛选条件的稳定版本号
 * 
 * 规则：
 * - 基于筛选条件的稳定序列化生成哈希
 * - 使用 JSON.stringify + 简单哈希算法
 * - 相同条件产生相同版本号，不同条件产生不同版本号
 * - 避免直接使用字段值拼接（防止特殊字符碰撞）
 */
export function generateFilterRevision(conditions: FilterCondition[]): number {
  const activeConditions = conditions
    .filter(c => c.field && c.operator)
    .map(c => ({
      field: c.field,
      operator: c.operator,
      value: c.value,
    }));
  
  const serialized = JSON.stringify(activeConditions);
  return simpleHash(serialized);
}

/**
 * 简单哈希算法（djb2）
 * 将字符串转换为 32 位正整数
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
```

**dataRevision 更新规则**:
- ✅ 成功解析后递增（文件上传/Sheet切换/文本重新解析）
- ❌ 解析失败不递增（保留当前有效版本）
- ❌ 不用于异步解析版本控制（由 parseVersionRef 负责）

**filterRevision 更新规则**:
- ✅ 筛选条件变化时重新计算
- ✅ 稳定序列化（相同条件产生相同版本号）
- ✅ 使用哈希算法避免特殊字符碰撞

**生成位置**: `App.tsx` 或 `useAnalysisDataset` 调用处

**状态失效规则**:
- `dataRevision` 变化 → datasetKey 变化 → 旧确认失效 → 旧分析数据集失效
- `filterRevision` 变化 → datasetKey 变化 → 旧确认失效 → 旧分析数据集失效
- 使用 `confirmedDatasetKey` / `cancelledDatasetKey` 绑定 datasetKey，自动失效旧状态

---

### 3.3 AnalysisDataset - 分析数据集

**职责**: 描述已可供分析的数据，只包含分析消费所需的信息

**定义位置**: `src/types.ts`

```typescript
/**
 * 抽样信息 - 仅当发生抽样时存在
 */
export interface SamplingInfo {
  /** 算法版本标识 */
  algorithmVersion: 'systematic_even_v1';

  /** 抽样前总数（筛选后、抽样前的有效数据行数） */
  inputRowCount: number;

  /** 抽样后总数 */
  outputRowCount: number;
}

/**
 * 分析数据集 - 统一的分析数据入口
 * 
 * 职责：只描述已可供分析的数据
 * 不负责表达等待确认状态（由 AnalysisDatasetState 表达）
 */
export interface AnalysisDataset {
  /** 实际用于分析的行（可能已抽样） */
  rows: Record<string, string>[];

  /** 数据集身份标识 */
  datasetKey: string;

  /** 来自 DataVolumeState 的数据量信息（供 UI 展示） */
  volume: {
    physicalRowCount: number;
    parsedRowCount: number;
    validRowCount: number;
    filteredRowCount: number;
  };

  /** 实际参与分析的行数 = rows.length */
  analysisRowCount: number;

  /** 抽样信息（仅当发生抽样时存在） */
  samplingInfo?: SamplingInfo;

  /** 字段元数据（来自 parseSummary.fieldTypes） */
  fields: FieldMeta[];
}
```

**消除重复字段说明**:

| 旧字段 | 处理方式 | 理由 |
|--------|---------|------|
| `isSampled` | 删除 | 可推导：`samplingInfo != null` |
| `samplingMethod` | 删除 | 与 `samplingInfo.algorithmVersion` 重复 |
| `userConfirmedSampling` | 移出 | 属于 Hook 内部控制状态，不属于数据集描述 |
| `originalTotalRows` | 删除 | 由 `physicalRowCount` 替代 |
| `filteredRows` | 移入 `volume.filteredRowCount` | 避免与数组类型混淆 |
| `analysisRows` | 改为 `analysisRowCount` | 统一 `...RowCount` 命名 |

---

### 3.4 AnalysisDatasetState - 显式状态联合类型

**职责**: 可辨别的数据集就绪状态，UI 可根据 status 精确分支

**定义位置**: `src/types.ts`

```typescript
/**
 * 分析数据集状态 - 显式状态联合类型
 * 
 * UI 可根据 status 精确区分以下情况：
 * - 没有数据
 * - 解析阶段被截断（超过 20000 行）
 * - 等待用户确认抽样
 * - 用户取消分析
 * - 完整数据分析（无抽样）
 * - 抽样数据分析
 */
export type AnalysisDatasetState =
  | { status: 'no_data' }
  | { status: 'parse_truncated'; volume: DataVolumeState }
  | { status: 'awaiting_confirmation'; filteredRowCount: number; volume: DataVolumeState }
  | { status: 'cancelled'; filteredRowCount: number; volume: DataVolumeState }
  | { status: 'ready_full'; dataset: AnalysisDataset }
  | { status: 'ready_sampled'; dataset: AnalysisDataset };
```

**状态转换图**:

```
                    数据到达
                       │
          ┌────────────┼────────────────┐
          │            │                │
     无数据       解析被截断        数据可用
          │        (>20000)            │
          ↓            ↓               ↓
      no_data   parse_truncated   ┌───┴───┐
                                  │       │
                            ≤5000行   >5000行
                                  │       │
                                  ↓       ↓
                            ready_full  awaiting_confirmation
                                              │
                                    ┌─────────┼─────────┐
                                    │                   │
                                  确认                 取消
                                    │                   │
                                    ↓                   ↓
                              ready_sampled         cancelled
```

**状态失效规则**:
- `datasetKey` 变化 → 任何状态都回到初始判断
- 旧的抽样确认不得继续生效
- 旧的分析数据集不得继续使用

---

### 3.5 DerivedDataContext - 分析上下文（修改）

**职责**: 传递分析数据给分析引擎

**定义位置**: `src/engine/context.ts`

```typescript
/** 派生数据上下文，由引擎（engine）计算得出 */
export interface DerivedDataContext {
  /** 实际参与分析的数据行（替代 filteredRows） */
  analysisRows: Record<string, string>[];

  /** 字段可分析性评分，key 为字段名 */
  fieldScores: Record<string, AnalyticScore>;

  /** 各字段异常值列表，key 为字段名 */
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>>;
}
```

**修改说明**:
- `filteredRows` 重命名为 `analysisRows`
- 数据来源从"筛选后全部数据"变为"AnalysisDataset.rows"
- `fieldScores` 仍基于 `filteredParsedData.rows` 计算（描述字段特征，非统计消费）
- 统计消费（`computeMetric`、`analyzeCorrelations`、`groupByDimension`、`computeOverview`）统一使用 `analysisRows`

---

## 四、三种数据量场景

### 4.1 场景定义

#### 场景 A: 不超过 5000 个有效数据行

**条件**: `validRowCount ≤ 5000` 且 `isParseTruncated === false`

**处理**: 直接进行完整分析，无需用户确认

**UI 展示**: 无特殊提示

**datasetState**: `ready_full`

#### 场景 B: 5001 至 20000 个有效数据行

**条件**: `5000 < validRowCount ≤ 20000` 且 `isParseTruncated === false`

**处理**: 用户明确确认后，从完整的已解析有效数据中确定性抽取 5000 行进行分析

**UI 展示**: 抽样确认对话框

**datasetState**: `awaiting_confirmation` → 确认后 → `ready_sampled`

#### 场景 C: 超过 20000 个原始数据行

**条件**: `isParseTruncated === true`（`rawRowCount > 20000`）

**处理**: 默认阻止正式分析

**UI 展示**:
```
原始文件包含 {physicalRowCount} 行数据。
当前解析上限为 20,000 行，尚有 {rawRowCount - parsedRowCount} 行未解析。
由于当前解析器无法处理完整数据，无法从完整数据中生成可靠样本。
您可以：
- 取消操作
- 在外部缩减数据后重新上传
```

**datasetState**: `parse_truncated`

**禁止**: 不得把"前 20000 行的分析"包装成完整数据抽样分析

### 4.2 判断流程

```
输入: DataVolumeState, filteredRows

1. if (DataVolumeState == null || filteredRows == null)
   → no_data

2. if (isParseTruncated === true)
   → parse_truncated（阻止分析）

3. if (filteredRowCount === 0)
   → no_data

4. if (filteredRowCount ≤ 5000)
   → ready_full（完整分析）

5. if (filteredRowCount > 5000 && cancelledDatasetKey === datasetKey)
   → cancelled（用户取消）

6. if (filteredRowCount > 5000 && confirmedDatasetKey !== datasetKey)
   → awaiting_confirmation（等待确认）

7. if (filteredRowCount > 5000 && confirmedDatasetKey === datasetKey)
   → ready_sampled（抽样分析）
```

---

## 五、确定性抽样算法

### 5.1 算法定义

**算法名称**: `systematic_even_v1`（等距确定性抽样）

**公式**:
```typescript
index(i) = Math.round(i * (rowCount - 1) / (sampleSize - 1))
```
其中 `i = 0, 1, ..., sampleSize - 1`

**实现**:
```typescript
/**
 * 等距确定性抽样
 * 
 * 保证：
 * 1. 相同有序输入产生完全相同的样本
 * 2. sampleSize >= 2 时：包含第一行（i=0 → index=0）和最后一行（i=sampleSize-1 → index=rowCount-1）
 * 3. sampleSize = 1 时：仅返回第一行（不保证包含最后一行）
 * 4. 不得产生重复索引（严格递增，已数学证明）
 * 5. 输出顺序与原始数据一致
 * 6. 输入行数 ≤ 样本数时返回完整数据
 * 7. sampleSize <= 0 时返回空数组
 * 8. 不生成或导出抽样种子
 * 
 * 时间复杂度：O(sampleSize)
 */
export function systematicSample<T>(
  rows: T[],
  sampleSize: number
): T[] {
  const rowCount = rows.length;

  // 边界条件
  if (sampleSize <= 0) return [];
  if (rowCount === 0) return [];
  if (rowCount <= sampleSize) return [...rows];
  if (sampleSize === 1) return [rows[0]]; // 仅返回第一行

  const sample: T[] = new Array(sampleSize);
  for (let i = 0; i < sampleSize; i++) {
    const index = Math.round(i * (rowCount - 1) / (sampleSize - 1));
    sample[i] = rows[index];
  }
  return sample;
}
```

### 5.2 数学证明

**首行包含**: `i=0` → `Math.round(0) = 0` → `rows[0]` ✓

**末行包含**: `i=sampleSize-1` → `Math.round((sampleSize-1) * (rowCount-1) / (sampleSize-1))` = `Math.round(rowCount-1)` = `rowCount-1` → `rows[rowCount-1]` ✓

**无重复索引**: 设 `f(i) = i * (rowCount-1) / (sampleSize-1)`，则 `f(i+1) - f(i) = (rowCount-1)/(sampleSize-1)`。当 `rowCount > sampleSize` 时，此差值 > 1。由于 `Math.round` 的误差 < 0.5，当间距 > 1 时，`Math.round(f(i+1)) > Math.round(f(i))`，即索引严格递增。 ✓

**输出顺序**: 由于 `i` 递增且 `index(i)` 严格递增，输出顺序与原始数据一致 ✓

### 5.3 偏差警告

**有序数据偏差**: 如果数据具有周期性或强有序模式（如按时间排序、按分数排序），等距抽样可能引入系统性偏差。

**文档要求**: 在抽样确认对话框和分析结果中注明：
> 当前采用等距确定性抽样（algorithm: systematic_even_v1）。如果数据具有周期性或强有序模式，抽样结果可能存在偏差。

### 5.4 不使用种子的理由

- 旧方案使用 `rows.length * 1000 + fields.length * 100 + firstRowHash` 作为种子，碰撞概率过高
- 等距确定性抽样本身已保证可复现性，无需额外种子
- 删除 `samplingSeed` 状态和 `generateDeterministicSeed` 函数

---

## 六、核心 Hook 设计

### 6.1 useParsedTable（修改）

**职责**: 管理解析状态和数据量状态

**关键修改**:
1. 新增 `dataVolumeState` 状态
2. 修复自动重解析导致的重复解析问题（使用 ref 守卫）
3. 修复 `handleSheetChange` 命名冲突

```typescript
export function useParsedTable() {
  // 现有状态
  const [parsedData, setParsedData] = useState<ParsedTable | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);

  // 新增状态
  const [dataVolumeState, setDataVolumeState] = useState<DataVolumeState | null>(null);

  // 新增：内部更新守卫（防止 file upload / sheet switch 触发二次解析）
  // 记录内部更新的目标文本，effect 中检查是否匹配
  const pendingInternalRawTextRef = useRef<string | null>(null);
  
  // 新增：异步解析版本控制（防止旧解析结果覆盖新数据）
  const parseVersionRef = useRef(0);

  // 修改：自动重解析（仅响应用户文本编辑/粘贴，不响应内部更新）
  useEffect(() => {
    if (!rawText.trim()) return;
    
    // 检查是否为内部同步更新
    if (pendingInternalRawTextRef.current === rawText) {
      // 消费内部更新标记，不重新解析
      pendingInternalRawTextRef.current = null;
      return;
    }
    
    // 用户输入处理：执行解析
    try {
      const result = parseTableText(rawText);
      setParsedData(result);
      setParseWarnings(result.warnings || []);
      setParseError(null);
      // 同步更新 dataVolumeState（文本粘贴无 20000 行截断）
      setDataVolumeState(buildDataVolumeStateFromTextResult(result));
    } catch { /* 忽略 */ }
  }, [rawText]);

  // 修改：文件上传时保存数据量状态
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // ...
    const currentVersion = ++parseVersionRef.current;
    
    parseTableFile(file)
      .then(result => {
        // 异步解析版本检查：丢弃旧结果
        if (parseVersionRef.current !== currentVersion) return;
        
        setParsedData(result);
        setParseError(null);
        setIsParsing(false);

        // 保存数据量状态
        const volume = buildDataVolumeStateFromFileResult(result);
        setDataVolumeState(volume);

        // 合并警告
        const warnings = [...(result.warnings || [])];
        if (volume.isParseTruncated && volume.parseTruncationWarning) {
          warnings.push(volume.parseTruncationWarning);
        }
        setParseWarnings(warnings);

        if (result.summary) setParseSummary(result.summary);
        if (result.availableSheets && result.availableSheets.length > 1) {
          setAvailableSheets(result.availableSheets);
        }

        // 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
        const text = buildTextFromResult(result);
        pendingInternalRawTextRef.current = text;
        setRawText(text);
      })
      .catch(err => { /* ... */ });
  }, []);

  // 修改：Sheet 切换（修复命名冲突）
  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
      // 底层解析函数名为 reparseSheet（来自 ParsedFileResult）
      // 处理函数名为 handleSheetChange（避免同名）
      const currentVersion = ++parseVersionRef.current;
      
      (parsedData as ParsedFileResult).reparseSheet!(sheetName)
        .then(result => {
          // 异步解析版本检查：丢弃旧结果
          if (parseVersionRef.current !== currentVersion) return;
          
          setParsedData(result);
          setParseError(null);

          // 更新数据量状态
          const volume = buildDataVolumeStateFromFileResult(result);
          setDataVolumeState(volume);

          // 合并警告
          const warnings = [...(result.warnings || [])];
          if (volume.isParseTruncated && volume.parseTruncationWarning) {
            warnings.push(volume.parseTruncationWarning);
          }
          setParseWarnings(warnings);

          if (result.summary) setParseSummary(result.summary);

          // 设置内部更新目标文本
          const text = buildTextFromResult(result);
          pendingInternalRawTextRef.current = text;
          setRawText(text);
        })
        .catch(err => { /* ... */ });
    }
  }, [parsedData]);

  return {
    parsedData, parseWarnings, parseSummary,
    dataVolumeState,  // 新增
    handleParse, handleFileUpload, handleSheetChange,
    activeTableId,
    // ...
  };
}
```

**自动重解析功能审计**:

| 场景 | 是否依赖 `useEffect([rawText])` | 说明 |
|------|------|------|
| 文本粘贴 | ✅ 是 | 用户粘贴数据后自动解析 |
| 示例数据加载 | ✅ 是 | 加载示例文本后自动解析 |
| 文件上传 | ❌ 否 | `handleFileUpload` 已直接调用 `setParsedData` |
| Sheet 切换 | ❌ 否 | `handleSheetChange` 已直接调用 `setParsedData` |
| 用户编辑原始文本 | ✅ 是 | 用户修改文本后自动重新解析 |

**修复策略**: 保留 `useEffect([rawText])`（文本粘贴必需），使用 `pendingInternalRawTextRef` 防止文件上传和 Sheet 切换触发的 `setRawText` 导致二次解析。使用 `parseVersionRef` 防止异步解析结果乱序覆盖。

---

### 6.2 useFilterState（保持不变）

**职责**: 管理筛选条件和筛选结果

**说明**:
- 不涉及 analysisRows
- 仅负责筛选逻辑
- 返回 `filteredParsedData` 供下一层使用

---

### 6.3 useAnalysisDataset（新增）

**职责**: 基于 filteredRows 和 datasetKey 生成 AnalysisDatasetState

**定义位置**: `src/hooks/useAnalysisDataset.ts`

```typescript
import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  AnalysisDataset, AnalysisDatasetState, DataVolumeState,
  SamplingInfo,
} from '../types';
import type { FieldMeta } from '../utils/tableParser/types';
import { systematicSample } from '../utils/sampling';

const MAX_ANALYSIS_ROWS = 5000;

export interface UseAnalysisDatasetReturn {
  /** 当前数据集状态（显式联合类型） */
  datasetState: AnalysisDatasetState;
  /** 确认使用抽样分析 */
  confirmSampling: () => void;
  /** 取消分析 */
  cancelSampling: () => void;
}

export function useAnalysisDataset(
  filteredRows: Record<string, string>[] | null,
  dataVolumeState: DataVolumeState | null,
  fields: FieldMeta[] | null,
  datasetKey: string,
): UseAnalysisDatasetReturn {
  // 用户确认状态（绑定到 datasetKey，自动失效旧状态）
  const [confirmedDatasetKey, setConfirmedDatasetKey] = useState<string | null>(null);
  const [cancelledDatasetKey, setCancelledDatasetKey] = useState<string | null>(null);

  // ✅ 使用 useEffect 清理旧状态（不在 useMemo 中调用 setState）
  // 注意：这里不清除 confirmedDatasetKey/cancelledDatasetKey，因为判断逻辑基于 datasetKey 匹配
  useEffect(() => {
    // datasetKey 变化时，旧的 confirmedDatasetKey/cancelledDatasetKey 自动失效
    // 无需显式清除，判断时使用 === datasetKey 即可
  }, [datasetKey]);

  // ✅ 纯计算：推导当前状态（不调用任何 setState）
  const datasetState = useMemo((): AnalysisDatasetState => {
    // 1. 无数据
    if (!dataVolumeState || !filteredRows || !fields) {
      return { status: 'no_data' };
    }

    // 2. 解析截断（超过 20000 行）
    if (dataVolumeState.isParseTruncated) {
      return { status: 'parse_truncated', volume: dataVolumeState };
    }

    const filteredRowCount = filteredRows.length;

    // 3. 筛选后无数据
    if (filteredRowCount === 0) {
      return { status: 'no_data' };
    }

    // 4. 不超过 5000 行 → 完整分析
    if (filteredRowCount <= MAX_ANALYSIS_ROWS) {
      const dataset: AnalysisDataset = {
        rows: filteredRows,
        datasetKey,
        volume: {
          physicalRowCount: dataVolumeState.physicalRowCount,
          parsedRowCount: dataVolumeState.parsedRowCount,
          validRowCount: dataVolumeState.validRowCount,
          filteredRowCount,
        },
        analysisRowCount: filteredRowCount,
        fields,
      };
      return { status: 'ready_full', dataset };
    }

    // 5. 超过 5000 行，用户取消（检查 cancelledDatasetKey 是否匹配当前 datasetKey）
    if (cancelledDatasetKey === datasetKey) {
      return { status: 'cancelled', filteredRowCount, volume: dataVolumeState };
    }

    // 6. 超过 5000 行，等待确认（检查 confirmedDatasetKey 是否匹配当前 datasetKey）
    if (confirmedDatasetKey !== datasetKey) {
      return { status: 'awaiting_confirmation', filteredRowCount, volume: dataVolumeState };
    }

    // 7. 超过 5000 行，已确认 → 抽样
    const sampledRows = systematicSample(filteredRows, MAX_ANALYSIS_ROWS);
    const samplingInfo: SamplingInfo = {
      algorithmVersion: 'systematic_even_v1',
      inputRowCount: filteredRowCount,
      outputRowCount: sampledRows.length,
    };
    const dataset: AnalysisDataset = {
      rows: sampledRows,
      datasetKey,
      volume: {
        physicalRowCount: dataVolumeState.physicalRowCount,
        parsedRowCount: dataVolumeState.parsedRowCount,
        validRowCount: dataVolumeState.validRowCount,
        filteredRowCount,
      },
      analysisRowCount: sampledRows.length,
      samplingInfo,
      fields,
    };
    return { status: 'ready_sampled', dataset };

  }, [filteredRows, dataVolumeState, fields, datasetKey, confirmedDatasetKey, cancelledDatasetKey]);

  // 确认抽样（绑定到当前 datasetKey）
  const confirmSampling = useCallback(() => {
    setConfirmedDatasetKey(datasetKey);
    setCancelledDatasetKey(null);
  }, [datasetKey]);

  // 取消分析（绑定到当前 datasetKey）
  const cancelSampling = useCallback(() => {
    setConfirmedDatasetKey(null);
    setCancelledDatasetKey(datasetKey);
  }, [datasetKey]);

  return {
    datasetState,
    confirmSampling,
    cancelSampling,
  };
}
```

**状态转换保证**:
1. `useMemo` 纯计算，不调用任何 setState ✓
2. `useEffect` 负责 datasetKey 变化时的状态重置 ✓
3. 无 `samplingSeed` 状态（确定性抽样无需种子） ✓
4. `cancelSampling` 有真实状态行为（`cancelled`），非空实现 ✓

---

## 七、数据消费点完整审计

### 7.1 独立截断点（4 处，Stage 0A-2 迁移后移除）

| # | 文件 | 行号 | 截断代码 | 迁移后行为 |
|---|------|------|---------|-----------|
| 1 | `src/engine/analysisEngine.ts` | 48 | `rows.slice(0, truncatedRows)` | 移除，使用 `context.analysisRows` |
| 2 | `src/engine/correlationAnalyzer.ts` | 194 | `rows.slice(0, MAX_ROWS)` | 移除，使用 `context.analysisRows` |
| 3 | `src/engine/groupByDimension.ts` | 139 | `rows.slice(0, MAX_ROWS)` | 移除，使用传入的 `analysisRows` |
| 4 | `src/components/GeneralDataOverview.tsx` | 35 | `rows.slice(0, MAX_ROWS)` | 移除，使用传入的 `analysisRows` |

### 7.2 解析层截断点（1 处，Stage 0A-1 补充警告）

| 文件 | 行号 | 截断代码 | 处理方式 |
|------|------|---------|---------|
| `src/utils/tableParser/workbook.ts` | 100 | `rawData.slice(0, MAX_ROWS)` (MAX_ROWS=20000) | 保存 `physicalRowCount`，生成截断警告 |

### 7.3 全部数据消费点审计（实际代码审计结果）

**审计方法**: 使用 Grep 检索 `rows.slice(`, `MAX_ROWS`, `filteredRows`, `filteredParsedData.rows`, `parsedData.rows`, `computeMetric`, `analyzeCorrelations`, `groupByDimension`, `computeOverview`, `buildDerivedDataContext`

**独立截断点（4 处，Stage 0A-2 迁移后移除）**:

| # | 文件 | 行号 | 截断代码 | 迁移后行为 |
|---|------|------|---------|-----------|
| 1 | `src/engine/analysisEngine.ts` | 48 | `rows.slice(0, truncatedRows)` | 移除，使用 `context.analysisRows` |
| 2 | `src/engine/correlationAnalyzer.ts` | 194 | `rows.slice(0, MAX_ROWS)` | 移除，使用 `context.analysisRows` |
| 3 | `src/engine/groupByDimension.ts` | 139 | `rows.slice(0, MAX_ROWS)` | 移除，使用传入的 `analysisRows` |
| 4 | `src/components/GeneralDataOverview.tsx` | 35 | `rows.slice(0, MAX_ROWS)` | 移除，使用传入的 `analysisRows` |

**全部数据消费点审计**:

| # | 消费位置 | 当前数据源 | 迁移后数据源 | 消费类型 |
|---|---------|-----------|------------|---------|
| 1 | `useAnalysisContext.ts:38` (`buildDerivedDataContext` 调用) | `filteredParsedData.rows` | `filteredParsedData.rows`（不变，用于 fieldScores 计算） | 字段评分 |
| 2 | `context.ts:169-173` (`buildDerivedDataContext` 定义) | `filteredRows` 参数 | `analysisRows` 参数 | 上下文构建 |
| 3 | `analysisEngine.ts:368` (`computeMetric` 内部) | `context.filteredRows` | `context.analysisRows` | 指标统计 |
| 4 | `correlationAnalyzer.ts:401` (`analyzeCorrelationsFromContext` 内部) | `context.filteredRows` | `context.analysisRows` | 相关性分析 |
| 5 | `useAnalysisOrchestrator.ts:128` (`groupByDimension` 调用) | `derivedData.filteredRows` | `derivedData.analysisRows` | 分组分析 |
| 6 | `useAnalysisOrchestrator.ts:121` (`computeMetric` 调用) | `derivedData` (DerivedDataContext) | `derivedData` (含 `analysisRows`) | 指标计算 |
| 7 | `useAnalysisOrchestrator.ts:135` (`analyzeCorrelationsFromContext` 调用) | `derivedData` (DerivedDataContext) | `derivedData` (含 `analysisRows`) | 相关性计算 |
| 8 | `GeneralDataOverview.tsx:33,124` (`computeOverview` 定义和调用) | `props.rows`（来自 AnalysisSection） | `props.rows`（来自 AnalysisDataset.rows） | 数据概览 |
| 9 | `AnalysisSection.tsx:343` (GeneralDataOverview 调用) | `parsedData.rows` | `analysisDataset.rows` | 组件传参 |
| 10 | `AnalysisSection.tsx:292,378,404,405,616` (UI 展示) | `parsedData.rows` | 部分改为 `analysisDataset.rows`（统计展示），部分保持 `parsedData.rows`（原始数据展示） | UI 展示 |
| 11 | `useExportActions.ts:43` (`exportFilteredRowsToCsv` 调用) | `filteredParsedData.rows` | `filteredParsedData.rows`（不变，CSV 导出全量筛选数据） | 数据导出 |
| 12 | `useFilterState.ts:62` (`filterRows` 调用) | `parsedData.rows` | `parsedData.rows`（不变，筛选层在分析数据集层之前） | 数据筛选 |
| 13 | `useFilterState.ts:68` (构建 `filteredParsedData`) | `filterResult.filteredRows` | `filterResult.filteredRows`（不变） | 筛选结果构建 |
| 14 | `useParsedTable.ts:84` (`buildParseReport` 调用) | `parsedData.rows` | `parsedData.rows`（不变，解析报告层） | 解析报告 |
| 15 | `App.tsx:141` (`checkIsNumericField` 调用) | `parsedData.rows` | `parsedData.rows`（不变） | 字段检测 |
| 16 | `engine/filterRows.ts:144-178` (`filterRows` 定义) | `rows` 参数（来自 `parsedData.rows`） | `rows` 参数（不变） | 筛选逻辑 |

**审计结论**:
- 共发现 **16 个数据消费点**
- 其中 **3 处独立截断**（analysisEngine, correlationAnalyzer, groupByDimension）需在 Stage 0A-2 移除
- **7 处统计消费**（computeMetric, analyzeCorrelations, groupByDimension, computeOverview）需迁移到 `analysisRows`
- **6 处非统计消费**（字段评分、筛选、导出、解析报告、字段检测）保持不变

### 7.4 数据一致性保证

**规则**: 所有统计结果必须基于同一个 `AnalysisDataset.rows`

| 统计项 | 数据源 | 说明 |
|--------|--------|------|
| `fieldScores` | `filteredParsedData.rows`（筛选后全量） | 字段特征描述，非统计消费 |
| `outliers` | 同 `fieldScores` | 字段特征描述 |
| `computeMetric`（均值、中位数等） | `AnalysisDataset.rows` | 统计消费 |
| `analyzeCorrelations` | `AnalysisDataset.rows` | 统计消费 |
| `groupByDimension` | `AnalysisDataset.rows` | 统计消费 |
| `computeOverview`（数据概览） | `AnalysisDataset.rows` | 统计消费 |
| CSV 导出（筛选数据） | `filteredParsedData.rows` | 用户数据导出，非统计分析 |
| 分析结果导出 | `AnalysisDataset.rows` | 统计结果导出 |

---

## 八、分析模块迁移

### 8.1 analysisEngine.ts

**修改前**:
```typescript
export function computeMetric(
  context: DerivedDataContext,
  metricDef: MetricDefinition,
  userValue?: number,
): MetricResult | null {
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(
    context.filteredRows,  // ← 使用 filteredRows
    metricDef.sourceField
  );
}

export function extractFieldValues(rows, fieldName, config) {
  const limitedRows = rows.slice(0, truncatedRows);  // ← 自行截断
}
```

**修改后**:
```typescript
export function computeMetric(
  context: DerivedDataContext,
  metricDef: MetricDefinition,
  userValue?: number,
): MetricResult | null {
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(
    context.analysisRows,  // ← 使用 analysisRows
    metricDef.sourceField
  );
}

export function extractFieldValues(rows, fieldName, config) {
  // 移除自行截断，rows 已经是 AnalysisDataset.rows（≤ 5000）
  const totalRows = rows.length;
  const truncatedRows = totalRows;
  const limitedRows = rows;
}
```

### 8.2 correlationAnalyzer.ts

**修改前**:
```typescript
function extractColumnVectors(_headers, rows, numericalFields) {
  const limitedRows = rows.slice(0, MAX_ROWS);  // ← 自行截断
}

export function analyzeCorrelationsFromContext(context, fields, metrics, config) {
  const rows = context.filteredRows;  // ← 使用 filteredRows
}
```

**修改后**:
```typescript
function extractColumnVectors(_headers, rows, numericalFields) {
  // 移除自行截断
  const limitedRows = rows;
}

export function analyzeCorrelationsFromContext(context, fields, metrics, config) {
  const rows = context.analysisRows;  // ← 使用 analysisRows
}
```

### 8.3 groupByDimension.ts

**修改前**:
```typescript
export function groupByDimension(rows, metricField, dimensionField) {
  const limitedRows = rows.slice(0, MAX_ROWS);  // ← 自行截断
}
```

**修改后**:
```typescript
export function groupByDimension(rows, metricField, dimensionField) {
  // 移除自行截断，rows 已经是 AnalysisDataset.rows
  const limitedRows = rows;
}
```

### 8.4 GeneralDataOverview.tsx

**修改前**:
```typescript
function computeOverview(headers, rows) {
  const limitedRows = rows.slice(0, MAX_ROWS);  // ← 自行截断
}
```

**修改后**:
```typescript
function computeOverview(headers, rows) {
  // 移除自行截断，rows 已经是 AnalysisDataset.rows
  const limitedRows = rows;
}
```

### 8.5 context.ts

**修改前**:
```typescript
export interface DerivedDataContext {
  filteredRows: Record<string, string>[];
  fieldScores: Record<string, AnalyticScore>;
  outliers: Record<string, Array<...>>;
}

export function buildDerivedDataContext(
  filteredRows: Record<string, string>[],
  fieldScores, outliers
): DerivedDataContext {
  return { filteredRows, fieldScores, outliers };
}
```

**修改后**:
```typescript
export interface DerivedDataContext {
  analysisRows: Record<string, string>[];  // 重命名
  fieldScores: Record<string, AnalyticScore>;
  outliers: Record<string, Array<...>>;
}

export function buildDerivedDataContext(
  analysisRows: Record<string, string>[],
  fieldScores, outliers
): DerivedDataContext {
  return { analysisRows, fieldScores, outliers };
}
```

### 8.6 useAnalysisContext.ts (useDerivedData)

**修改前**:
```typescript
return buildDerivedDataContext(
  filteredParsedData.rows,  // ← 传入筛选后全量数据
  fieldScores,
);
```

**修改后**:
```typescript
// useDerivedData 需要接收 analysisRows 作为参数
// 由 useAnalysisOrchestrator 或 App.tsx 传入
return buildDerivedDataContext(
  analysisRows,  // ← 传入 AnalysisDataset.rows
  fieldScores,
);
```

**注意**: `fieldScores` 仍基于 `filteredParsedData.rows` 计算（字段特征描述），但 `analysisRows` 来自 `AnalysisDataset.rows`。

### 8.7 useAnalysisOrchestrator.ts

**修改前**:
```typescript
export function useAnalysisOrchestrator(
  filteredParsedData, parseSummary, selectedField, inputValue, selectedDimension
) {
  const derivedData = useDerivedData(filteredParsedData, parseSummary);
  // ...
  const groupStats = useMemo(() => {
    return groupByDimension(derivedData.filteredRows, ...);
  }, [derivedData, ...]);
}
```

**修改后**:
```typescript
export function useAnalysisOrchestrator(
  filteredParsedData, parseSummary,
  analysisDataset,  // ← 新增参数
  selectedField, inputValue, selectedDimension
) {
  const derivedData = useDerivedData(filteredParsedData, parseSummary, analysisDataset);
  // ...
  const groupStats = useMemo(() => {
    return groupByDimension(derivedData.analysisRows, ...);
  }, [derivedData, ...]);
}
```

---

## 九、UI 层集成

### 9.1 App.tsx 集成

```typescript
export default function App() {
  // Layer 2: 解析状态
  const {
    parsedData, parseWarnings, dataVolumeState, parseSummary,
    handleSheetChange, activeTableId,
    // ...
  } = useParsedTable();

  // Layer 3: 筛选状态
  const {
    filterConditions, filteredParsedData, filterResult,
    // ...
  } = useFilterState(parsedData, parseSummary, activeTableId);

  // Layer 3.5: 数据集身份
  const datasetKey = useMemo(
    () => generateDatasetKey(activeTableId, filterConditions),
    [activeTableId, filterConditions]
  );

  // Layer 4: 分析数据集
  const {
    datasetState,
    confirmSampling,
    cancelSampling,
  } = useAnalysisDataset(
    filteredParsedData?.rows ?? null,
    dataVolumeState,
    parseSummary?.fieldTypes ?? null,
    datasetKey,
  );

  // 提取 AnalysisDataset（如果就绪）
  const analysisDataset = useMemo(() => {
    if (datasetState.status === 'ready_full' || datasetState.status === 'ready_sampled') {
      return datasetState.dataset;
    }
    return null;
  }, [datasetState]);

  // Layer 5+6: 分析调度
  const orchestrator = useAnalysisOrchestrator(
    filteredParsedData, parseSummary,
    analysisDataset,  // ← 传入 analysisDataset
    selectedField, inputValue, selectedDimension,
  );

  return (
    <div>
      {/* 数据导入区 */}
      <DataImportSection
        dataVolumeState={dataVolumeState}
        parseWarnings={parseWarnings}
      />

      {/* 状态分支 */}
      {datasetState.status === 'parse_truncated' && (
        <ParseTruncatedWarning volume={datasetState.volume} />
      )}

      {datasetState.status === 'awaiting_confirmation' && (
        <SamplingConfirmation
          filteredRowCount={datasetState.filteredRowCount}
          maxRows={5000}
          onConfirm={confirmSampling}
          onCancel={cancelSampling}  // ← 真实行为：进入 cancelled 状态
        />
      )}

      {datasetState.status === 'cancelled' && (
        <SamplingCancelledNotice
          filteredRowCount={datasetState.filteredRowCount}
          onRetry={confirmSampling}
        />
      )}

      {/* 分析区域（仅当 dataset 就绪时展示） */}
      {analysisDataset && (
        <AnalysisSection
          context={orchestrator.derived.derivedData}
          analysisDataset={analysisDataset}
          // ...
        />
      )}

      {/* 导出按钮 */}
      <ExportButton
        analysisDataset={analysisDataset}
        filteredParsedData={filteredParsedData}
      />
    </div>
  );
}
```

### 9.2 抽样确认组件

```typescript
interface SamplingConfirmationProps {
  filteredRowCount: number;
  maxRows: number;
  onConfirm: () => void;
  onCancel: () => void;  // 必须定义真实状态行为
}

function SamplingConfirmation({
  filteredRowCount, maxRows, onConfirm, onCancel,
}: SamplingConfirmationProps) {
  return (
    <div>
      <p>
        当前筛选后有 {filteredRowCount} 行数据，为避免卡顿，
        分析结果将基于等距确定性抽样产生的 {maxRows} 行样本计算。
      </p>
      <p>
        注意：如果数据具有周期性或强有序模式，抽样结果可能存在偏差。
      </p>
      <button onClick={onConfirm}>确认使用抽样分析</button>
      <button onClick={onCancel}>取消分析</button>
    </div>
  );
}
```

### 9.3 抽样状态持久展示

```typescript
// 数据导入区：解析截断警告
{dataVolumeState?.isParseTruncated && (
  <div>
    原始文件包含 {dataVolumeState.physicalRowCount} 行数据，
    当前解析上限为 20,000 行，
    尚有 {dataVolumeState.rawRowCount - dataVolumeState.parsedRowCount} 行未解析。
  </div>
)}

// 分析区域：抽样信息
{analysisDataset?.samplingInfo && (
  <div>
    当前结果基于 {analysisDataset.analysisRowCount} 行样本
    （从 {analysisDataset.samplingInfo.inputRowCount} 行中抽取，
    算法: {analysisDataset.samplingInfo.algorithmVersion}）。
  </div>
)}
```

---

## 十、导出集成

### 10.1 CSV 导出（筛选数据）

**数据源**: `filteredParsedData.rows`（不变）

**说明**: 用户导出筛选后的数据，应导出全部筛选数据，不受分析抽样影响

### 10.2 分析结果导出

**数据源**: `AnalysisDataset.rows`

```typescript
function exportAnalysisResults(analysisDataset: AnalysisDataset, ...) {
  const lines: string[] = [];

  // 数据量说明
  lines.push('# 数据量说明');
  lines.push(`# 工作表物理总行数: ${analysisDataset.volume.physicalRowCount}`);
  lines.push(`# 解析后有效数据行数: ${analysisDataset.volume.validRowCount}`);
  lines.push(`# 筛选后数据行数: ${analysisDataset.volume.filteredRowCount}`);
  lines.push(`# 实际参与分析的行数: ${analysisDataset.analysisRowCount}`);

  if (analysisDataset.samplingInfo) {
    lines.push(`# 抽样算法: ${analysisDataset.samplingInfo.algorithmVersion}`);
    lines.push(`# 抽样前输入行数: ${analysisDataset.samplingInfo.inputRowCount}`);
    lines.push(`# 抽样后输出行数: ${analysisDataset.samplingInfo.outputRowCount}`);
    lines.push('# 注意: 如果数据具有周期性或强有序模式，抽样结果可能存在偏差');
  } else {
    lines.push('# 未发生抽样（完整数据分析）');
  }

  lines.push('');
  // ... 后续导出逻辑
}
```

---

## 十一、实施阶段拆分

### 11.1 Stage 0A-1: 数据状态和警告可靠性

**目标**: 解决数据状态和警告可靠性问题

**范围**:
- ✅ 建立 DataVolumeState（七类行数口径）
- ✅ 保存物理总行数，生成 20000 行截断警告
- ✅ 修复自动重解析导致的重复解析（pendingInternalRawTextRef + parseVersionRef）
- ✅ 修复 Sheet 切换状态问题
- ✅ 去除隐藏的数据丢失

**禁止**:
- ❌ 修改分析算法
- ❌ 修改抽样算法
- ❌ 修改所有分析模块接口
- ❌ 修改 UI 风格

### 11.2 Stage 0A-2: 统一 AnalysisDataset

**目标**: 建立统一 AnalysisDataset，所有统计消费使用同一批数据

**范围**:
- ✅ 实现无种子等距确定性抽样（`systematic_even_v1`）
- ✅ 创建 AnalysisDataset、AnalysisDatasetState 类型
- ✅ 创建 datasetKey 生成函数
- ✅ 创建 useAnalysisDataset hook
- ✅ 修改 DerivedDataContext（`filteredRows` → `analysisRows`）
- ✅ 迁移所有分析模块（4 处独立截断移除）
- ✅ UI 层集成（状态分支、确认/取消）
- ✅ 导出集成

**依赖**: Stage 0A-1 完成

---

## 十二、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| `pendingInternalRawTextRef` 导致文本粘贴不解析 | 低 | 高 | 仅在 file upload / sheet switch 路径设置 ref，文本粘贴路径不设置 |
| 等距抽样导致有序数据偏差 | 中 | 中 | UI 中明确标注算法和偏差警告 |
| `DerivedDataContext` 类型变更导致类型错误 | 中 | 中 | 分步迁移，先添加 `analysisRows`，后移除 `filteredRows` |
| 修改分析模块导致现有功能异常 | 中 | 高 | 分批次修改，每批次单独测试 |

---

## 十三、验收测试矩阵

### 13.1 数据量边界测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 0 行 | `no_data` 状态 | 无分析结果，UI 提示"无数据" |
| 1 行 | `ready_full` 状态 | 完整分析，`analysisRowCount = 1` |
| 4999 行 | `ready_full` 状态 | 完整分析，`analysisRowCount = 4999` |
| 5000 行 | `ready_full` 状态 | 完整分析，`analysisRowCount = 5000` |
| 5001 行 | `awaiting_confirmation` 状态 | 等待用户确认，无分析结果 |
| 19999 行 | `awaiting_confirmation` 状态 | 等待用户确认 |
| 20000 行 | `awaiting_confirmation` 状态 | 等待用户确认 |
| 20001 行 | `parse_truncated` 状态 | 阻止分析，显示截断警告 |

### 13.2 输入路径测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| Excel 文件上传 | 正常解析，生成 `DataVolumeState` | `physicalRowCount` 正确 |
| CSV 文件上传 | 正常解析，生成 `DataVolumeState` | `physicalRowCount` 正确 |
| 文本粘贴 | 自动解析（`useEffect([rawText])`） | `parseWarnings` 正确 |
| 示例数据 | 自动解析 | `parseWarnings` 正确 |
| 多 Sheet 文件 | 自动选择主表 | `availableSheets` 正确 |
| 连续切换 Sheet | `handleSheetChange` 调用 `reparseSheet` | `dataVolumeState` 更新，警告不丢失 |
| 上传新文件替换旧文件 | `activeTableId` 变化 → `datasetKey` 变化 | 旧确认失效，旧分析数据集失效 |

### 13.3 抽样测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 相同数据产生相同索引 | 确定性抽样 | `systematicSample(data, 5000)` 两次调用结果一致 |
| 包含第一行和最后一行 | 数学保证 | `index(0) = 0`, `index(sampleSize-1) = rowCount-1` |
| 无重复行索引 | 严格递增 | `index(i+1) > index(i)` 对所有 `i` 成立 |
| 保持原顺序 | 输出顺序 | 抽样结果的行顺序与原始数据一致 |
| 用户确认前不执行分析 | 状态控制 | `datasetState.status === 'awaiting_confirmation'` 时 `analysisDataset === null` |
| 用户取消后不执行分析 | 状态控制 | `datasetState.status === 'cancelled'` 时 `analysisDataset === null` |
| 筛选变化后旧确认失效 | `datasetKey` 变化 | `filterHash` 变化 → `datasetKey` 变化 → `useEffect` 重置确认 |
| 新文件上传后旧确认失效 | `datasetKey` 变化 | `activeTableId` 变化 → `datasetKey` 变化 → `useEffect` 重置确认 |
| Sheet 切换后旧确认失效 | `datasetKey` 变化 | `activeTableId` 变化 → `datasetKey` 变化 → `useEffect` 重置确认 |
| 筛选后不足 5000 行时恢复完整分析 | 状态推导 | `filteredRowCount <= 5000` → `ready_full` |

### 13.4 数据一致性测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 所有分析模块获得相同的行标识集合 | 统一入口 | `computeMetric`, `analyzeCorrelations`, `groupByDimension`, `computeOverview` 均使用 `AnalysisDataset.rows` |
| 页面切换后抽样状态不丢失 | 状态持久化 | `confirmedDatasetKey` 和 `cancelledDatasetKey` 状态在页面切换后保持 |
| 导出内容与页面当前分析数据集一致 | 数据源一致 | 分析结果导出使用 `AnalysisDataset.rows`，CSV 导出使用 `filteredParsedData.rows` |
| 解析截断时不得生成"完整数据抽样"声明 | 状态区分 | `parse_truncated` 状态下不显示抽样信息，显示截断警告 |

### 13.5 回归测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 现有 64 个分析引擎测试全部通过 | 功能不变 | `npm test` 全部通过 |
| TypeScript 检查通过 | 类型安全 | `tsc --noEmit` 无错误 |
| Vite 生产构建通过 | 构建成功 | `vite build` 无错误 |

**注意**: 项目当前未配置 ESLint，不得把"无 ESLint 错误"列为强制验收项。

---

## 十四、回滚方案

### 14.1 回滚策略

1. **回滚 Stage 0A-2**: 恢复 `DerivedDataContext.filteredRows`，恢复分析模块独立截断
2. **回滚 Stage 0A-1**: 恢复 `useEffect([rawText])` 无守卫版本

### 14.2 回滚方法

- 使用 Git 标签标记每个阶段
- 每个阶段完成后提交独立 commit
- 回滚时使用 `git revert` 而非 `git reset`

---

**设计完成时间**: 2026-07-21  
**设计版本**: v2.2（验收测试矩阵补充版）  
**设计状态**: 待实施
