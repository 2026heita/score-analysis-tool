# Stage 0A 实施提案

**提案日期**: 2026-07-21  
**提案版本**: v4.0（设计纠偏对齐版）  
**实施阶段**: Stage 0A - 统一数据量状态、阻止静默截断及保证分析样本一致性  
**对齐文档**: DATA_PIPELINE_DESIGN_V2.md v2.2

---

## 一、提案目标

### 1.1 核心目标

解决数据量管理中的三大核心问题：
1. **静默截断**: 20000行解析截断和5000行分析截断无明确警告
2. **状态覆盖**: 文件上传后自动重解析导致警告丢失
3. **样本不一致**: 多个模块独立截断，无法保证分析使用同一批数据

### 1.2 架构原则

**数据管道职责分离**:
- ✅ 数据抽样和分析数据集管理属于**数据管道职责**
- ✅ 筛选状态仅负责筛选逻辑
- ✅ 所有分析模块必须依赖**统一的数据入口**

**禁止事项**:
- ❌ 分析模块自行执行 `rows.slice()`
- ❌ 分析模块自行执行 `MAX_ROWS` 截断
- ❌ 分析模块自己生成分析样本
- ❌ 筛选状态管理分析数据集

### 1.3 非目标（本阶段禁止）

- ❌ 删除废弃引擎（analyticsEngine.ts）
- ❌ 清理中风险 .toFixed()
- ❌ 删除或移动测试Excel文件
- ❌ 字段分类通用化
- ❌ 指标方向改造
- ❌ UI风格重构
- ❌ 新增统计功能
- ❌ 提升全量处理上限

---

## 二、问题清单

### 2.1 20000行解析截断问题

**问题描述**:
- `workbook.ts` 第100行执行 `rawData.slice(0, MAX_ROWS)`
- 未保存原始总行数 `rawData.length`
- 未生成任何警告提示用户数据被截断

**影响**:
- 用户无法区分"原始20000行"和"实际20000行"
- 数据丢失无感知

**修复优先级**: 🔴 高

### 2.2 5000行警告被覆盖问题

**问题描述**:
- 文件上传后，`setRawText(text)` 触发 `useEffect([rawText])`
- `useEffect` 调用 `parseTableText(rawText)` 重新解析
- 重新解析覆盖 `parseWarnings`，导致5000行警告丢失

**影响**:
- 文件上传超过5000行时，警告不显示
- Sheet切换超过5000行时，警告不显示

**修复优先级**: 🔴 高

### 2.3 分析样本不一致问题

**问题描述**:
- 4个模块独立执行5000行截断:
  - analysisEngine.ts (extractFieldValues)
  - correlationAnalyzer.ts
  - groupByDimension.ts
  - GeneralDataOverview.tsx

**影响**:
- 无法保证所有分析使用同一批数据
- 可能导致统计结果不一致

**修复优先级**: 🟡 中

### 2.4 reparseSheet 丢失风险

**问题描述**:
- 文件上传后，`parsedData` 包含 `reparseSheet` 方法
- `setRawText(text)` 触发二次解析
- 二次解析返回 `ParsedTable` 类型，不包含 `reparseSheet`

**影响**:
- 连续切换Sheet时，`reparseSheet` 可能不存在

**修复优先级**: 🟡 中

---

## 三、实施阶段拆分

根据架构设计（详见 [DATA_PIPELINE_DESIGN_V2.md](./DATA_PIPELINE_DESIGN_V2.md)），Stage 0A 拆分为两个实施阶段：

### 3.0 阶段拆分说明

**Stage 0A-1**: 数据状态和警告可靠性
- 目标：解决数据状态和警告可靠性问题
- 范围：保存原始行数、保存解析状态、修复警告覆盖、修复 Sheet 切换状态问题、去除隐藏的数据丢失
- 禁止：修改分析算法、修改抽样算法、修改所有分析模块接口

**Stage 0A-2**: 统一 AnalysisDataset
- 目标：建立统一 AnalysisDataset
- 范围：确定性抽样、analysisRows 统一入口、所有分析模块迁移
- 依赖：Stage 0A-1 完成

---

## 四、Stage 0A-1：数据状态和警告可靠性

### 4.1 目标

解决数据状态和警告可靠性问题，确保用户始终知道数据量变化，消除静默截断和警告丢失。

### 4.2 禁止事项

- ❌ 修改分析算法
- ❌ 修改抽样算法
- ❌ 修改所有分析模块接口

### 4.3 任务1: 建立 DataVolumeState 数据量状态模型

**目标**: 建立统一的数据量状态模型（七类行数口径）

**实施内容**:

1. 在 `src/types.ts` 定义 `DataVolumeState` 接口:
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

2. 在 `useParsedTable` 中新增 `dataVolumeState` 状态
3. 在解析完成后设置 `dataVolumeState`

**涉及文件**:
- src/types.ts（新增 DataVolumeState 类型）
- src/hooks/useParsedTable.ts（新增 dataVolumeState 状态）

**验收标准**:
- ✅ DataVolumeState 类型定义完整（包含七类行数口径）
- ✅ useParsedTable 返回 dataVolumeState
- ✅ TypeScript 编译通过

### 4.4 任务2: 解决20000行解析截断问题

**目标**: 保存原始总行数，生成截断警告

**实施内容**:

1. 修改 `src/utils/tableParser/workbook.ts` 的 `parseSheetData` 函数:
```typescript
function parseSheetData(
  sheetName: string,
  rawData: unknown[][],
  merges: MergeRange[],
  allCandidates?: WorkbookCandidate[],
): ParsedTableResult {
  // 保存物理总行数（截断前）
  const physicalRowCount = rawData.length;
  
  // 表头识别
  const detection = detectHeaderRow(rawData, merges);
  const headerRowCount = detection.headerRowIndex + 1;
  
  // 计算原始数据行数
  const rawRowCount = physicalRowCount - headerRowCount;
  
  // 限制解析行数（20000）
  const parsedRowCount = Math.min(rawRowCount, MAX_ROWS);
  const isParseTruncated = rawRowCount > MAX_ROWS;
  
  // 如果发生截断，生成警告
  let parseTruncationWarning: string | undefined;
  if (isParseTruncated) {
    const unparsedRows = rawRowCount - parsedRowCount;
    parseTruncationWarning = `原始文件包含 ${physicalRowCount} 行数据，当前解析上限为 20,000 行，尚有 ${unparsedRows} 行未解析。`;
  }
  
  // ... 后续逻辑（使用 parsedRowCount 进行截断）
  
  return {
    // ... 现有返回值
    dataVolumeState: {
      physicalRowCount,
      headerRowCount,
      rawRowCount,
      parsedRowCount,
      validRowCount: rowClassification.validData.length,
      emptyRowCount: rowClassification.empty.length,
      summaryRowCount: rowClassification.summary.length,
      invalidRowCount: rowClassification.invalid.length,
      isParseTruncated,
      parseTruncationWarning,
    },
  };
}
```

2. 在 `src/utils/tableParser/types.ts` 中更新类型:
```typescript
export interface ParsedTableResult {
  // ... 现有字段
  dataVolumeState?: DataVolumeState;  // 新增
}
```

3. 在 `useParsedTable` 中保存数据量状态:
```typescript
const handleFileUpload = useCallback(async (file: File) => {
  const result = await parseTableFile(file);
  setParsedData(result);
  
  // 保存数据量状态
  if (result.dataVolumeState) {
    setDataVolumeState(result.dataVolumeState);
  }
  
  // 合并警告
  const warnings = [...(result.warnings || [])];
  if (result.dataVolumeState?.parseTruncationWarning) {
    warnings.push(result.dataVolumeState.parseTruncationWarning);
  }
  setParseWarnings(warnings);
}, []);
```

**涉及文件**:
- src/utils/tableParser/workbook.ts
- src/utils/tableParser/types.ts
- src/hooks/useParsedTable.ts

**验收标准**:
- ✅ 20000行截断时生成明确警告
- ✅ DataVolumeState 正确保存
- ✅ 警告文案清晰，说明原始行数和截断行数

### 4.5 任务3: 解决5000行警告被覆盖问题

**目标**: 防止文件上传/Sheet切换触发的内部文本同步导致二次解析覆盖警告

**最终方案**: 保留自动重解析功能，使用 `pendingInternalRawTextRef` 防止内部更新触发重复解析

**自动解析功能审计**:

| 场景 | 是否依赖 `useEffect([rawText])` | 说明 |
|------|------|------|
| 文本粘贴 | ✅ 是 | 用户粘贴数据后自动解析 |
| 示例数据加载 | ✅ 是 | 加载示例文本后自动解析 |
| 文件上传 | ❌ 否 | `handleFileUpload` 已直接调用解析 |
| Sheet 切换 | ❌ 否 | `handleSheetChange` 已直接调用解析 |
| 用户编辑原始文本 | ✅ 是 | 用户修改文本后自动重新解析 |

**实现方式**:

1. 修改 `useParsedTable.ts`:
```typescript
// 内部更新守卫：记录内部更新的目标文本
const pendingInternalRawTextRef = useRef<string | null>(null);

// 异步解析版本控制：防止旧解析结果覆盖新数据
const parseVersionRef = useRef(0);

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
  } catch { /* 忽略 */ }
}, [rawText]);
```

2. 文件上传/Sheet切换时设置内部更新标记:
```typescript
// 在 handleFileUpload / handleSheetChange 的 .then() 中：
const text = buildTextFromResult(result);
pendingInternalRawTextRef.current = text;  // 记录目标文本
setRawText(text);  // effect 中检测到匹配，消费 ref 不重新解析
```

**理由**:
- 保留文本粘贴/示例数据/用户编辑的自动解析功能
- 防止文件上传/Sheet切换触发的 setRawText 导致二次解析
- 使用精确文本匹配而非简单 boolean，避免残留导致下一次用户输入被跳过
- 配合 parseVersionRef 防止异步解析结果乱序覆盖

**涉及文件**:
- src/hooks/useParsedTable.ts

**验收标准**:
- ✅ 文件上传后，警告不丢失
- ✅ Sheet切换后，警告不丢失
- ✅ 用户粘贴数据后，自动解析功能正常
- ✅ 示例数据加载后，自动解析功能正常
- ✅ 用户编辑文本后，自动重新解析功能正常

### 4.6 任务4: 修复 Sheet 切换状态问题

**目标**: 确保 Sheet 切换后警告状态正确

**实施内容**:

1. 在 `useParsedTable` 的 `handleSheetChange` 中确保正确更新 `dataVolumeState` 并使用异步版本控制:
```typescript
const handleSheetChange = useCallback((sheetName: string) => {
  setSelectedSheet(sheetName);
  if (parsedData && (parsedData as ParsedFileResult).reparseSheet) {
    const currentVersion = ++parseVersionRef.current;
    
    (parsedData as ParsedFileResult).reparseSheet!(sheetName)
      .then(result => {
        // 异步解析版本检查：丢弃旧结果
        if (parseVersionRef.current !== currentVersion) return;
        
        setParsedData(result);
        setParseError(null);

        // 更新数据量状态
        if (result.dataVolumeState) {
          setDataVolumeState(result.dataVolumeState);
        }

        // 合并警告
        const warnings = [...(result.warnings || [])];
        if (result.dataVolumeState?.isParseTruncated && result.dataVolumeState.parseTruncationWarning) {
          warnings.push(result.dataVolumeState.parseTruncationWarning);
        }
        setParseWarnings(warnings);

        if (result.summary) setParseSummary(result.summary);

        // 设置内部更新目标文本，防止 useEffect([rawText]) 二次解析
        const text = buildTextFromResult(result);
        pendingInternalRawTextRef.current = text;
        setRawText(text);
      })
      .catch(err => {
        setFileError(err instanceof Error ? err.message : '切换工作表失败');
      });
  }
}, [parsedData]);
```

**涉及文件**:
- src/hooks/useParsedTable.ts

**验收标准**:
- ✅ Sheet 切换后，dataVolumeState 正确更新
- ✅ Sheet 切换后，警告不丢失
- ✅ reparseSheet 方法始终可用
- ✅ 异步解析版本控制防止旧结果覆盖

### 4.7 Stage 0A-1 验收标准

**功能验收**:
- ✅ DataVolumeState 正确保存原始行数
- ✅ 20000行截断时生成明确警告
- ✅ 文件上传后，5000行警告不丢失
- ✅ Sheet切换后，5000行警告不丢失
- ✅ 去除隐藏的数据丢失（20000行截断有警告）

**技术验收**:
- ✅ TypeScript 编译通过（`tsc --noEmit`）
- ✅ Vite 构建通过（`vite build`）
- ✅ 无 ESLint 错误

---

## 五、Stage 0A-2：统一 AnalysisDataset

### 5.1 目标

建立统一的 AnalysisDataset，所有分析模块使用同一批数据，确保分析结果一致性。

### 5.2 前置条件

- ✅ Stage 0A-1 完成

### 5.3 任务1: 实现确定性抽样算法

**目标**: 提供可复现的等距确定性抽样实现

**推荐算法**: 等距确定性抽样（Systematic Even Sampling）

**算法版本**: `systematic_even_v1`

**公式**:
```typescript
index(i) = Math.round(i * (rowCount - 1) / (sampleSize - 1))
```
其中 `i = 0, 1, ..., sampleSize - 1`

**理由**:
1. **确定性强**: 相同有序输入产生完全相同的样本
2. **首尾包含**: sampleSize >= 2 时数学保证包含第一行和最后一行
3. **sampleSize=1**: 仅返回第一行（不保证包含最后一行）
4. **无重复索引**: 严格递增，已数学证明
5. **无需种子**: 不依赖随机数生成器，无种子碰撞问题
6. **性能优秀**: O(sampleSize) 时间复杂度
7. **可解释**: 算法简单，易于理解和验证

**偏差警告**: 如果数据具有周期性或强有序模式，等距抽样可能引入系统性偏差。需在 UI 中明确标注。

**实施内容**:

1. 创建 `src/utils/sampling.ts`:
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
 * 7. sampleSize ≤ 0 时返回空数组
 * 8. 不生成或导出抽样种子
 * 
 * 时间复杂度：O(sampleSize)
 * 
 * @param rows 原始数据行
 * @param sampleSize 样本大小（默认5000）
 * @returns 抽样后的数据行
 */
export function systematicSample<T>(
  rows: T[],
  sampleSize: number = 5000
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

/**
 * 获取抽样信息
 */
export function getSamplingInfo(
  inputRowCount: number,
  outputRowCount: number
): {
  algorithmVersion: 'systematic_even_v1';
  inputRowCount: number;
  outputRowCount: number;
} {
  return {
    algorithmVersion: 'systematic_even_v1',
    inputRowCount,
    outputRowCount,
  };
}
```

**涉及文件**:
- src/utils/sampling.ts（新增）

**验收标准**:
- ✅ 相同输入产生相同输出
- ✅ 包含第一行和最后一行
- ✅ 无重复行索引
- ✅ 保持原顺序
- ✅ 性能优秀（10000行数据抽样 < 10ms）

### 5.4 任务2: 创建 AnalysisDataset 类型和 Hook

**目标**: 建立统一的分析数据集管理（显式状态联合类型）

**实施内容**:

1. 在 `src/types.ts` 定义 `AnalysisDataset`、`SamplingInfo` 和 `AnalysisDatasetState`:
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

2. 创建 `src/hooks/useAnalysisDataset.ts`:
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
  // 确认状态绑定 datasetKey（新数据自动失效旧确认）
  const [confirmedDatasetKey, setConfirmedDatasetKey] = useState<string | null>(null);
  const [cancelledDatasetKey, setCancelledDatasetKey] = useState<string | null>(null);

  // ✅ useEffect 负责清理（不在 useMemo 中调用 setState）
  // 注意：不清除 confirmedDatasetKey/cancelledDatasetKey，判断时基于 === datasetKey 匹配
  useEffect(() => {
    // datasetKey 变化时，旧状态自动失效（判断时使用 === datasetKey 即可）
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

  // 取消分析（绑定到当前 datasetKey，真实状态行为）
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

**涉及文件**:
- src/types.ts（新增 AnalysisDataset、SamplingInfo、AnalysisDatasetState 类型）
- src/hooks/useAnalysisDataset.ts（新增）

**验收标准**:
- ✅ AnalysisDataset 类型定义完整（消除重复字段）
- ✅ AnalysisDatasetState 显式状态联合类型定义完整
- ✅ useAnalysisDataset Hook 正确生成分析数据集状态
- ✅ useMemo 保持纯计算，不调用任何 setState
- ✅ 确认状态绑定 datasetKey（confirmedDatasetKey/cancelledDatasetKey），新数据自动失效旧确认
- ✅ 无 samplingSeed 状态（确定性抽样无需种子）
- ✅ cancelSampling 有真实状态行为（cancelled），非空实现
- ✅ 超过5000行时要求用户确认
- ✅ 抽样结果可复现

### 5.5 任务3: 修改 DerivedDataContext 使用 analysisRows

**目标**: 将 DerivedDataContext 的 `filteredRows` 重命名为 `analysisRows`

**实施内容**:

1. 修改 `src/engine/context.ts`:
```typescript
export interface DerivedDataContext {
  /** 实际参与分析的数据行（替代 filteredRows） */
  analysisRows: Record<string, string>[];

  /** 字段可分析性评分，key 为字段名 */
  fieldScores: Record<string, AnalyticScore>;

  /** 各字段异常值列表，key 为字段名 */
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>>;
}

export function buildDerivedDataContext(
  analysisRows: Record<string, string>[],
  fieldScores: Record<string, AnalyticScore> = {},
  outliers: Record<string, Array<{ rowIndex: number; value: number; zScore: number }>> = {}
): DerivedDataContext {
  return { analysisRows, fieldScores, outliers };
}
```

**涉及文件**:
- src/engine/context.ts

**验收标准**:
- ✅ DerivedDataContext 使用 `analysisRows`（替代 `filteredRows`）
- ✅ buildDerivedDataContext 接受 `analysisRows` 参数
- ✅ TypeScript 编译通过

### 5.6 任务4: 迁移所有分析模块使用 analysisRows

**目标**: 所有分析模块使用统一的数据入口（`context.analysisRows`）

**实施内容**:

1. 修改 `src/engine/analysisEngine.ts`:
```typescript
export function computeMetric(
  context: DerivedDataContext,
  metricDef: MetricDefinition,
  userValue?: number,
): MetricResult | null {
  const { values, invalidCount, totalRows, truncatedRows } = extractFieldValues(
    context.analysisRows,  // 使用 analysisRows
    metricDef.sourceField
  );
  // ...
}

export function extractFieldValues(
  rows: Record<string, string>[],
  fieldName: string,
  config: AnalysisConfig = {}
) {
  const totalRows = rows.length;
  // 移除自行截断逻辑，rows 已经是 AnalysisDataset.rows（≤ 5000）
  const truncatedRows = totalRows;
  const limitedRows = rows;
  // ...
}
```

2. 修改 `src/engine/correlationAnalyzer.ts`:
```typescript
function extractColumnVectors(
  _headers: string[],
  rows: Array<Record<string, string>>,
  numericalFields: string[]
): Record<string, (number | null)[]> {
  const columns: Record<string, (number | null)[]> = {};
  
  // 移除自行截断逻辑，rows 已经是 AnalysisDataset.rows
  const limitedRows = rows;
  // ...
}

export function analyzeCorrelationsFromContext(context, fields, metrics, config) {
  const rows = context.analysisRows;  // 使用 analysisRows
  // ...
}
```

3. 修改 `src/engine/groupByDimension.ts`:
```typescript
export function groupByDimension(
  rows: Record<string, string>[],
  metricField: string,
  dimensionField: string
): GroupStats[] {
  // 移除自行截断逻辑，rows 已经是 AnalysisDataset.rows
  const limitedRows = rows;
  // ...
}
```

4. 修改 `src/components/GeneralDataOverview.tsx`:
```typescript
function computeOverview(headers: string[], rows: Record<string, string>[]): OverviewSummary {
  const totalRows = rows.length;
  // 移除自行截断逻辑，rows 已经是 AnalysisDataset.rows
  const limitedRows = rows;
  // ...
}
```

**涉及文件**:
- src/engine/analysisEngine.ts
- src/engine/correlationAnalyzer.ts
- src/engine/groupByDimension.ts
- src/components/GeneralDataOverview.tsx

**验收标准**:
- ✅ 所有分析模块使用 `context.analysisRows`
- ✅ 移除分析模块内部的独立截断逻辑（4 处）
- ✅ TypeScript 编译通过
- ✅ 功能测试通过

### 5.7 任务5: UI 层集成抽样确认

**目标**: 在 App.tsx 中集成 useAnalysisDataset（使用 datasetKey 和显式状态）

**实施内容**:

1. 修改 `src/App.tsx`:
```typescript
export default function App() {
  // Layer 2: 解析状态
  const {
    parsedData,
    parseWarnings,
    dataVolumeState,  // 新增
    // ...
  } = useParsedTable();
  
  // Layer 3: 筛选状态
  const {
    filterConditions,
    filteredParsedData,
    filterResult,
    // ...
  } = useFilterState(parsedData, parseSummary, activeTableId);
  
  // Layer 3.5: 数据集身份
  const datasetKey = useMemo(
    () => generateDatasetKey(activeTableId, filterConditions),
    [activeTableId, filterConditions]
  );
  
  // Layer 4: 分析数据集（新增）
  const {
    datasetState,  // 显式状态联合类型
    confirmSampling,
    cancelSampling,  // 真实状态行为
  } = useAnalysisDataset(
    filteredParsedData?.rows ?? null,
    dataVolumeState,
    parseSummary?.fieldTypes ?? null,
    datasetKey  // 使用 datasetKey 而非 activeTableId
  );
  
  // 提取 AnalysisDataset（如果就绪）
  const analysisDataset = useMemo(() => {
    if (datasetState.status === 'ready_full' || datasetState.status === 'ready_sampled') {
      return datasetState.dataset;
    }
    return null;
  }, [datasetState]);
  
  // Layer 5: 构建分析上下文
  const derivedContext = useMemo(() => {
    if (!analysisDataset) return null;
    return buildDerivedDataContext(
      analysisDataset.rows,  // 传入 analysisRows
      fieldScores,
      outliers
    );
  }, [analysisDataset, fieldScores, outliers]);
  
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
          onCancel={cancelSampling}  // 真实行为：进入 cancelled 状态
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
          context={derivedContext}
          analysisDataset={analysisDataset}
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

2. 创建抽样确认组件 `src/components/SamplingConfirmation.tsx`:
```typescript
interface SamplingConfirmationProps {
  filteredRowCount: number;
  maxRows: number;
  onConfirm: () => void;
  onCancel: () => void;  // 必须定义真实状态行为
}

export function SamplingConfirmation({
  filteredRowCount,
  maxRows,
  onConfirm,
  onCancel,
}: SamplingConfirmationProps) {
  return (
    <div style={styles.warning}>
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

3. 创建抽样取消提示组件 `src/components/SamplingCancelledNotice.tsx`:
```typescript
interface SamplingCancelledNoticeProps {
  filteredRowCount: number;
  onRetry: () => void;
}

export function SamplingCancelledNotice({
  filteredRowCount,
  onRetry,
}: SamplingCancelledNoticeProps) {
  return (
    <div style={styles.info}>
      <p>已取消分析。当前筛选后有 {filteredRowCount} 行数据，未执行分析。</p>
      <button onClick={onRetry}>重新确认抽样</button>
    </div>
  );
}
```

**涉及文件**:
- src/App.tsx
- src/components/SamplingConfirmation.tsx（新增）
- src/components/SamplingCancelledNotice.tsx（新增）

**验收标准**:
- ✅ 超过5000行时显示确认提示（`awaiting_confirmation` 状态）
- ✅ 用户确认前不产生分析结果
- ✅ 用户取消后进入 `cancelled` 状态，显示取消提示
- ✅ 用户可重新确认抽样
- ✅ 解析截断时显示 `parse_truncated` 警告
- ✅ `datasetKey` 变化时自动重置确认状态

### 5.8 任务6: 持久展示抽样状态

**目标**: 在多个位置显示抽样信息（使用新的字段命名）

**实施内容**:

1. 在数据导入区显示解析截断警告:
```typescript
{dataVolumeState?.isParseTruncated && (
  <div className="warning">
    原始文件包含 {dataVolumeState.physicalRowCount} 行数据，
    当前解析上限为 20,000 行，
    尚有 {dataVolumeState.rawRowCount - dataVolumeState.parsedRowCount} 行未解析。
    由于当前解析器无法处理完整数据，无法从完整数据中生成可靠样本。
  </div>
)}
```

2. 在分析区域显示抽样信息:
```typescript
{analysisDataset?.samplingInfo && (
  <div className="info">
    当前结果基于 {analysisDataset.analysisRowCount} 行样本
    （从 {analysisDataset.samplingInfo.inputRowCount} 行中抽取，
    算法: {analysisDataset.samplingInfo.algorithmVersion}）。
    <br />
    注意：如果数据具有周期性或强有序模式，抽样结果可能存在偏差。
  </div>
)}
```

3. 在解析报告显示数据量信息
4. 在数据概览显示抽样信息
5. 在导出结果中包含抽样信息

**涉及文件**:
- src/App.tsx
- src/components/ParseReportPanel.tsx
- src/components/GeneralDataOverview.tsx
- src/utils/exportAnalysis.ts

**验收标准**:
- ✅ 数据导入区显示解析截断警告（使用 `physicalRowCount`）
- ✅ 分析区域显示抽样信息（使用 `analysisRowCount` 和 `samplingInfo`）
- ✅ 解析报告显示数据量信息
- ✅ 数据概览显示抽样信息
- ✅ 导出结果包含抽样信息

### 5.9 任务7: 导出集成抽样信息

**目标**: 导出结果包含抽样信息（使用新的字段命名）

**实施内容**:

修改 `src/utils/exportAnalysis.ts`:
```typescript
export function exportAnalysis(
  analysisDataset: AnalysisDataset,
  // ... 其他参数
) {
  const lines: string[] = [];
  
  // 添加数据量说明
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

**涉及文件**:
- src/utils/exportAnalysis.ts

**验收标准**:
- ✅ 导出结果包含数据量说明（使用 `volume` 字段）
- ✅ 导出结果包含抽样信息（使用 `samplingInfo`，如果发生抽样）
- ✅ 不包含抽样种子（无种子设计）

### 5.10 Stage 0A-2 验收标准

**功能验收**:
- ✅ AnalysisDataset 正确生成（使用 `datasetKey` 标识）
- ✅ 所有分析模块使用 `context.analysisRows`（替代 `filteredRows`）
- ✅ 移除分析模块内部的独立截断（4 处）
- ✅ 超过5000行时，要求用户确认（`awaiting_confirmation` 状态）
- ✅ 用户取消后进入 `cancelled` 状态，可重新确认
- ✅ 抽样结果可复现（等距确定性抽样，无种子）
- ✅ UI 展示抽样状态（使用 `samplingInfo`）
- ✅ 导出结果包含抽样信息（使用 `volume` 和 `samplingInfo`）
- ✅ `datasetKey` 变化时自动重置确认状态

**技术验收**:
- ✅ TypeScript 编译通过（`tsc --noEmit`）
- ✅ Vite 构建通过（`vite build`）
- ✅ 现有 64 个分析引擎测试全部通过

**注意**: 项目当前未配置 ESLint，不得把"无 ESLint 错误"列为强制验收项。

---

## 六、实施顺序

### 6.1 Stage 0A-1 实施顺序

1. **任务1**: 建立 DataVolumeState 数据量状态模型（七类行数口径）
2. **任务2**: 解决20000行解析截断问题（保存 `physicalRowCount`，生成截断警告）
3. **任务3**: 解决5000行警告被覆盖问题（使用 `pendingInternalRawTextRef` + `parseVersionRef` 守卫）
4. **任务4**: 修复 Sheet 切换状态问题（`handleSheetChange` 命名冲突）

### 6.2 Stage 0A-2 实施顺序

1. **任务1**: 实现等距确定性抽样算法（`systematic_even_v1`，无种子）
2. **任务2**: 创建 AnalysisDataset、AnalysisDatasetState 类型和 datasetKey 生成函数
3. **任务3**: 创建 useAnalysisDataset Hook（使用 `useEffect` 重置状态，`useMemo` 纯计算）
4. **任务4**: 修改 DerivedDataContext（`filteredRows` → `analysisRows`）
5. **任务5**: 迁移所有分析模块使用 `context.analysisRows`（4 处独立截断移除）
6. **任务6**: UI 层集成抽样确认（显式状态分支，`cancelSampling` 真实行为）
7. **任务7**: 持久展示抽样状态（使用 `volume` 和 `samplingInfo` 字段）
8. **任务8**: 导出集成抽样信息（使用新的字段命名）

---

## 七、风险评估

### 7.1 Stage 0A-1 风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| `pendingInternalRawTextRef` 导致文本粘贴不解析 | 低 | 高 | 仅在 file upload / sheet switch 路径设置 ref，文本粘贴路径不设置 |
| DataVolumeState 类型变更导致现有代码异常 | 低 | 中 | 分步迁移，先添加类型定义，后修改使用处 |

### 7.2 Stage 0A-2 风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| 等距抽样导致有序数据偏差 | 中 | 中 | UI 中明确标注算法和偏差警告 |
| 修改分析模块导致现有功能异常 | 中 | 高 | 分批次修改，每批次单独测试 |
| DerivedDataContext 类型变更导致类型错误 | 中 | 中 | 分步迁移，先添加 `analysisRows`，后移除 `filteredRows` |

---

## 八、回滚方案

### 8.1 回滚策略

如果实施过程中出现严重问题，可以按阶段回滚:

1. **回滚 Stage 0A-2**: 恢复 `DerivedDataContext.filteredRows`，恢复分析模块独立截断
2. **回滚 Stage 0A-1**: 恢复 `useEffect([rawText])` 无守卫版本

### 8.2 回滚方法

- 使用 Git 标签标记每个阶段
- 每个阶段完成后提交独立 commit
- 回滚时使用 `git revert` 而非 `git reset`

---

## 九、验收测试矩阵

### 9.1 数据量边界测试

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

### 9.2 输入路径测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| Excel 文件上传 | 正常解析，生成 `DataVolumeState` | `physicalRowCount` 正确 |
| CSV 文件上传 | 正常解析，生成 `DataVolumeState` | `physicalRowCount` 正确 |
| 文本粘贴 | 自动解析（`useEffect([rawText])`） | `parseWarnings` 正确 |
| 示例数据 | 自动解析 | `parseWarnings` 正确 |
| 多 Sheet 文件 | 自动选择主表 | `availableSheets` 正确 |
| 连续切换 Sheet | `handleSheetChange` 调用 `reparseSheet` | `dataVolumeState` 更新，警告不丢失 |
| 上传新文件替换旧文件 | `activeTableId` 变化 → `datasetKey` 变化 | 旧确认失效，旧分析数据集失效 |

### 9.3 抽样测试

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

### 9.4 数据一致性测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 所有分析模块获得相同的行标识集合 | 统一入口 | `computeMetric`, `analyzeCorrelations`, `groupByDimension`, `computeOverview` 均使用 `AnalysisDataset.rows` |
| 页面切换后抽样状态不丢失 | 状态持久化 | `confirmedDatasetKey` 和 `cancelledDatasetKey` 状态在页面切换后保持 |
| 导出内容与页面当前分析数据集一致 | 数据源一致 | 分析结果导出使用 `AnalysisDataset.rows`，CSV 导出使用 `filteredParsedData.rows` |
| 解析截断时不得生成"完整数据抽样"声明 | 状态区分 | `parse_truncated` 状态下不显示抽样信息，显示截断警告 |

### 9.5 回归测试

| 场景 | 预期行为 | 验证点 |
|------|---------|--------|
| 现有 64 个分析引擎测试全部通过 | 功能不变 | `npm test` 全部通过 |
| TypeScript 检查通过 | 类型安全 | `tsc --noEmit` 无错误 |
| Vite 生产构建通过 | 构建成功 | `vite build` 无错误 |

**注意**: 项目当前未配置 ESLint，不得把"无 ESLint 错误"列为强制验收项。

---

## 十、附录

### 10.1 相关文档

- [DATA_PIPELINE_DESIGN_V2.md](./DATA_PIPELINE_DESIGN_V2.md) - 数据管道架构设计 v2.2
- [DATA_VOLUME_PIPELINE_AUDIT.md](./DATA_VOLUME_PIPELINE_AUDIT.md) - 数据量管道审计报告
- [PLATFORM_UPGRADE_ROADMAP.md](./PLATFORM_UPGRADE_ROADMAP.md) - 平台升级路线图
- [PLATFORM_UPGRADE_GAP_ANALYSIS.md](./PLATFORM_UPGRADE_GAP_ANALYSIS.md) - 平台升级差距分析

### 10.2 相关代码

**Stage 0A-1**:
- src/types.ts（新增 DataVolumeState 类型）
- src/hooks/useParsedTable.ts（新增 dataVolumeState 状态，pendingInternalRawTextRef + parseVersionRef 守卫）
- src/utils/tableParser/workbook.ts（保存 physicalRowCount，生成截断警告）
- src/utils/tableParser/types.ts（更新 ParsedTableResult 类型）

**Stage 0A-2**:
- src/types.ts（新增 AnalysisDataset、SamplingInfo、AnalysisDatasetState 类型）
- src/utils/datasetKey.ts（新增 datasetKey 生成函数）
- src/utils/sampling.ts（新增等距确定性抽样算法）
- src/hooks/useAnalysisDataset.ts（新增 Hook）
- src/engine/context.ts（filteredRows → analysisRows）
- src/engine/analysisEngine.ts（移除独立截断）
- src/engine/correlationAnalyzer.ts（移除独立截断）
- src/engine/groupByDimension.ts（移除独立截断）
- src/components/GeneralDataOverview.tsx（移除独立截断）
- src/App.tsx（集成 useAnalysisDataset，datasetKey 生成）
- src/components/SamplingConfirmation.tsx（新增）
- src/components/SamplingCancelledNotice.tsx（新增）
- src/utils/exportAnalysis.ts（使用新的字段命名）

---

**提案完成时间**: 2026-07-21  
**提案版本**: v4.0（设计纠偏对齐版）  
**对齐文档**: DATA_PIPELINE_DESIGN_V2.md v2.2  
**提案状态**: 待审批
