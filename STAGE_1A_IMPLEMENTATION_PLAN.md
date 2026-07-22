# Stage 1A 字段模式确认与修正层 - 实施计划

**版本**: v1.0  
**制定日期**: 2026-07-22  
**前置条件**: Stage 0A-2 已完成（commit `214079f`）  
**设计文档**: `STAGE_1A_FIELD_SCHEMA_DESIGN.md`

---

## 一、当前字段系统定义

### 1.1 FieldType（当前）

**文件**: `src/utils/tableParser/types.ts`

```typescript
export type FieldType =
  | 'identity'   // 学校代码、学校名称、姓名、班级、考号、座号
  | 'score'      // 总分、语文、数学、英语、外语、物理、化学、生物、政治、历史、地理
  | 'rank'       // 名次、排名、位次
  | 'bonus'      // 加分、区内加分、区外加分、政策加分
  | 'penalty'    // 扣分
  | 'category'   // 组合、组合简称、科类、选科、类别
  | 'status'     // 缺考、弃考、转班、转到、无成绩等
  | 'text'       // 大部分是文本且不适合统计
  | 'unknown';   // 无法识别
```

### 1.2 AnalysisRole（当前）

**文件**: `src/utils/tableParser/types.ts`

```typescript
export type AnalysisRole =
  | 'primaryTotal'   // 总分、总成绩、综合成绩、总评、最终成绩
  | 'rank'           // 排名、名次、位次
  | 'sectionTotal'   // 合计、总计、小计、模块合计
  | 'courseScore'    // 具体课程成绩
  | 'adjustment'     // 加分、扣分、政策加分、奖励分、惩罚分
  | 'identity'       // 姓名、学号、班级、考号、学校代码
  | 'textMeta'       // 签名、备注、说明、状态、组合、类别
  | 'unknown'        // 未知字段
  | 'invalid';       // 未命名字段、非法字段名
```

### 1.3 MetricDirection（当前）

**文件**: `src/engine/metricLayer.ts`

```typescript
export type MetricDirection = 'higher-is-better' | 'lower-is-better';
```

**硬编码规则**（第 88-91 行）:
```typescript
function getMetricDirection(role: string): MetricDirection {
  return role === 'rank' ? 'lower-is-better' : 'higher-is-better';
}
```

---

## 二、教育专用类型的完整使用链

### 2.1 关键词定义与使用

**文件**: `src/utils/tableParser/fieldClassifier.ts`

| 关键词常量 | 关键词列表 | 使用函数 | 影响 |
|-----------|-----------|---------|------|
| `IDENTITY_KEYWORDS` | 学校代码、姓名、班级、学号等 17 个 | `classifyFieldByKeyword` | 分类为 `identity` |
| `SCORE_KEYWORDS` | 总分、语文、数学、英语等 27 个 | `classifyFieldByKeyword` | 分类为 `score` |
| `RANK_KEYWORDS` | 名次、排名、位次等 10 个 | `classifyFieldByKeyword` | 分类为 `rank` |
| `BONUS_KEYWORDS` | 加分、政策加分等 8 个 | `classifyFieldByKeyword` | 分类为 `bonus` |
| `PENALTY_KEYWORDS` | 扣分、违纪扣分等 3 个 | `classifyFieldByKeyword` | 分类为 `penalty` |
| `CATEGORY_KEYWORDS` | 组合、科类、选科等 10 个 | `classifyFieldByKeyword` | 分类为 `category` |
| `PRIMARY_TOTAL_KEYWORDS` | 总分、总成绩等 10 个 | `classifyAnalysisRole` | 角色为 `primaryTotal` |
| `SECTION_TOTAL_KEYWORDS` | 合计、总计等 6 个 | `classifyAnalysisRole` | 角色为 `sectionTotal` |

### 2.2 下游消费链

**文件**: `src/engine/metricLayer.ts`

| 函数 | 使用的类型 | 行为 |
|------|-----------|------|
| `isAnalyzableRole` | `primaryTotal`, `rank`, `sectionTotal`, `courseScore`, `adjustment` | 判断是否可分析 |
| `getMetricType` | `primaryTotal`, `rank`, `sectionTotal`, `courseScore`, `adjustment` | 映射为 MetricType |
| `getMetricDirection` | `rank` | 硬编码方向：rank → lower-is-better，其他 → higher-is-better |
| `getMetricRecommended` | `adjustment` | adjustment 不推荐 |
| `isEntityIdentity` | `identity` + DIMENSION_KEYWORDS | 区分 entity 和 dimension |
| `isPrimaryKeyIdentity` | `identity` + 学号/考号关键词 | 判断是否为主键 |

**文件**: `src/hooks/useAnalysisContext.ts`

| 函数 | 使用的类型 | 行为 |
|------|-----------|------|
| `calculateFieldAnalyticScore` | `FieldMeta`（包含 type 和 analysisRole） | 计算字段可分析性评分 |
| `fieldScores` 计算 | `parseSummary.fieldTypes` | 基于字段元数据，不依赖行数据 |

**文件**: `src/components/charts/OriginalFieldRadar.tsx`

| 常量/函数 | 使用的类型 | 行为 |
|----------|-----------|------|
| `FIELD_GROUP_CONFIG` | `primaryTotal`, `rank`, `sectionTotal`, `courseScore`, `adjustment`, `identity`, `textMeta`, `unknown`, `invalid` | 字段分组展示 |
| `ROLE_BADGE_MAP` | 同上 | 角色标签颜色 |
| `RECOMMENDED_ROLES` | `primaryTotal`, `rank`, `sectionTotal`, `courseScore` | 推荐字段集合 |

**文件**: `src/components/charts/TraditionalSubjectRadar.tsx`

| 使用 | 说明 |
|------|------|
| `FIXED_SUBJECT_ORDER` | 从 `config/education` 导入，教育特定科目顺序 |

### 2.3 使用链总结

```
fieldClassifier.ts（关键词 + 内容特征）
  ↓ 输出 FieldMeta[]（包含 type 和 analysisRole）
  ↓
types.ts（ParsedTableResult.fieldMetas, ParseSummary.fieldTypes）
  ↓
  ├─→ metricLayer.ts（语义层映射）
  │     ↓ 输出 SemanticDefinitions（metrics, entities, dimensions）
  │     ↓
  │     └─→ useAnalysisOrchestrator（指标方向、推荐字段）
  │
  ├─→ useAnalysisContext.ts（fieldScores 计算）
  │     ↓ 输出 AnalyticScore（字段可分析性评分）
  │
  └─→ OriginalFieldRadar.tsx（字段选择 UI）
        ↓ 按 analysisRole 分组展示
```

---

## 三、新旧字段模型映射

### 3.1 FieldType 映射

| 旧 FieldType | 新 FieldType | 映射条件 | 说明 |
|-------------|-------------|---------|------|
| `identity` | `identifier` | 唯一率高、长数字串 | 学号、考号等主键 |
| `identity` | `category` | 包含分组关键词（班级、学校等） | 班级、学校等分组字段 |
| `identity` | `text` | 其他情况 | 姓名等文本标识 |
| `score` | `number` | 始终 | 所有成绩字段 |
| `rank` | `number` | 始终 | 排名字段 |
| `bonus` | `number` | 始终 | 加分字段 |
| `penalty` | `number` | 始终 | 扣分字段 |
| `category` | `category` | 始终 | 分类字段 |
| `status` | `category` | 始终 | 状态字段 |
| `text` | `text` | 始终 | 文本字段 |
| `unknown` | `unknown` | 始终 | 未知字段 |

### 3.2 AnalysisRole 映射

| 旧 AnalysisRole | 新 AnalysisRole | 映射条件 | 说明 |
|----------------|----------------|---------|------|
| `primaryTotal` | `metric` | 始终 | 主指标 |
| `rank` | `metric` | 始终 | 排名指标 |
| `sectionTotal` | `metric` | 始终 | 合计指标 |
| `courseScore` | `metric` | 始终 | 课程指标 |
| `adjustment` | `metric` | 始终 | 调整项指标 |
| `identity` | `identifier` | 唯一率高、主键特征 | 学号、考号 |
| `identity` | `dimension` | 包含分组关键词 | 班级、学校 |
| `identity` | `text` | 其他情况 | 姓名 |
| `textMeta` | `description` | 长文本、低数值比 | 备注、说明 |
| `textMeta` | `dimension` | 低唯一率、分类特征 | 类别、组合 |
| `unknown` | `unspecified` | 始终 | 需要用户确认 |
| `invalid` | `ignored` | 始终 | 无效字段 |

### 3.3 MetricDirection 映射

| 旧方向 | 新方向 | 说明 |
|-------|-------|------|
| `higher-is-better` | `higher_is_better` | 命名风格统一（下划线） |
| `lower-is-better` | `lower_is_better` | 命名风格统一（下划线） |
| 无 | `neutral` | 新增：中性方向 |
| 无 | `unspecified` | 新增：未指定（通用模式默认） |

---

## 四、用户确认后的字段模式数据结构

### 4.1 核心类型定义

**文件**: `src/types/fieldSchema.ts`（新增）

```typescript
/** 通用字段类型 */
export type FieldType =
  | 'number'       // 数值类型（连续数值）
  | 'category'     // 类别类型（离散分类）
  | 'datetime'     // 日期时间类型
  | 'boolean'      // 布尔类型
  | 'text'         // 文本类型（长文本、描述）
  | 'identifier'   // 标识符类型（主键、ID）
  | 'unknown';     // 未知类型

/** 通用分析角色 */
export type AnalysisRole =
  | 'metric'       // 指标字段（参与统计计算）
  | 'dimension'    // 维度字段（用于分组）
  | 'identifier'   // 标识符字段（主键、ID）
  | 'time'         // 时间字段（日期、时间戳）
  | 'description'  // 描述字段（备注、说明）
  | 'ignored'      // 忽略字段（不参与分析）
  | 'unspecified'; // 未指定（需要用户确认）

/** 通用指标方向 */
export type MetricDirection =
  | 'higher_is_better'  // 越高越好（如成绩、销售额）
  | 'lower_is_better'   // 越低越好（如排名、错误率）
  | 'neutral'           // 中性（如温度、年龄）
  | 'unspecified';      // 未指定（通用模式默认）

/** 推断来源 */
export type InferredFrom = 'keyword' | 'content' | 'user' | 'template';

/** 用户确认的单个字段模式 */
export interface ConfirmedFieldSchema {
  /** 字段名 */
  header: string;
  
  /** 用户确认的数据类型 */
  fieldType: FieldType;
  
  /** 用户确认的分析角色 */
  analysisRole: AnalysisRole;
  
  /** 用户确认的指标方向（仅 metric 角色有效） */
  direction: MetricDirection;
  
  /** 是否忽略该字段 */
  ignored: boolean;
  
  /** 推断来源 */
  inferredFrom: InferredFrom;
  
  /** 推断置信度（0-1） */
  confidence: number;
  
  /** 用户修改原因（可选） */
  userReason?: string;
  
  /** 示例值（前 3 个非空值） */
  sampleValues: string[];
  
  /** 缺失值数量 */
  missingCount: number;
  
  /** 唯一值数量 */
  uniqueCount: number;
}

/** 字段模式集合 */
export interface FieldSchemaSet {
  /** 数据集标识（绑定 datasetKey） */
  datasetKey: string;
  
  /** 字段模式数组 */
  fields: ConfirmedFieldSchema[];
  
  /** 是否全部已用户确认 */
  allConfirmed: boolean;
  
  /** 使用的模板（可选） */
  template?: 'education' | 'generic';
  
  /** 创建时间 */
  createdAt: string;
  
  /** 最后修改时间 */
  updatedAt: string;
}
```

### 4.2 localStorage 存储格式

```typescript
interface StoredFieldSchema {
  version: 1;
  datasetKey: string;
  fields: ConfirmedFieldSchema[];
  template?: 'education' | 'generic';
  allConfirmed: boolean;
  savedAt: string; // ISO 8601
}
```

**Key**: `fieldSchema:${datasetKey}`

---

## 五、自动推断与用户配置的优先级

### 5.1 优先级规则

```
用户确认（最高） > 模板预填 > 自动推断（最低）
```

### 5.2 推断流程

```typescript
function inferFieldSchema(
  header: string,
  columnValues: string[],
  legacyMeta: FieldMeta,
  template?: 'education' | 'generic'
): ConfirmedFieldSchema {
  // 1. 自动推断（基于关键词和内容特征）
  const autoResult = autoInferField(header, columnValues, legacyMeta);
  
  // 2. 模板预填（如果启用）
  if (template === 'education') {
    const templateResult = applyEducationTemplate(autoResult);
    return {
      ...templateResult,
      inferredFrom: 'template',
      confidence: Math.max(autoResult.confidence, 0.9),
    };
  }
  
  // 3. 返回自动推断结果
  return {
    ...autoResult,
    inferredFrom: autoResult.source, // 'keyword' | 'content'
  };
}
```

### 5.3 用户确认后的锁定机制

```typescript
function confirmFieldSchema(
  current: ConfirmedFieldSchema,
  updates: Partial<ConfirmedFieldSchema>
): ConfirmedFieldSchema {
  return {
    ...current,
    ...updates,
    inferredFrom: 'user',  // 标记为用户修改
    confidence: 1.0,       // 用户确认 = 100% 置信
  };
}
```

**关键规则**:
- 一旦 `inferredFrom === 'user'`，自动推断不得再次覆盖
- 切换数据集时，旧字段模式自动失效（绑定 datasetKey）
- 用户可以随时重新打开字段确认界面修改

---

## 六、字段模式传入 AnalysisDataset 和分析模块

### 6.1 AnalysisDataset 扩展

**文件**: `src/hooks/useAnalysisDataset.ts`

```typescript
export interface AnalysisDataset {
  rows: Record<string, string>[];
  headers: string[];
  status: AnalysisDatasetStatus;
  datasetKey: string;
  samplingInfo: SamplingInfo | null;
  
  // Stage 1A 新增
  fieldSchema: FieldSchemaSet | null;
}
```

### 6.2 数据流

```
用户确认字段模式
  ↓
FieldSchemaSet（存储在 useFieldSchema Hook）
  ↓
useAnalysisDataset（合并 fieldSchema 到 AnalysisDataset）
  ↓
AnalysisDataset.fieldSchema
  ↓
各分析模块（使用 fieldSchema 替代 fieldMetas）
```

### 6.3 分析模块迁移

**需要迁移的模块**:

| 模块 | 当前使用 | 迁移后使用 | 优先级 |
|------|---------|-----------|-------|
| `useAnalysisOrchestrator` | `fieldMetas` + `getMetricDirection` | `fieldSchema.fields[].direction` | 高 |
| `useAnalysisContext` | `parseSummary.fieldTypes` | `fieldSchema.fields` | 高 |
| `metricLayer.ts` | `FieldMeta.analysisRole` | `ConfirmedFieldSchema.analysisRole` | 高 |
| `analysisEngine.ts` | `FieldMeta.type` | `ConfirmedFieldSchema.fieldType` | 中 |
| `correlationAnalyzer.ts` | `FieldMeta.type` 判断数值字段 | `ConfirmedFieldSchema.fieldType === 'number'` | 中 |
| `groupByDimension.ts` | `FieldMeta.analysisRole` 识别维度 | `ConfirmedFieldSchema.analysisRole === 'dimension'` | 中 |
| `OriginalFieldRadar.tsx` | `FIELD_GROUP_CONFIG` 使用旧角色 | 使用新角色分组 | 低 |

### 6.4 迁移示例

```typescript
// Before: metricLayer.ts
function getMetricDirection(role: string): MetricDirection {
  return role === 'rank' ? 'lower-is-better' : 'higher-is-better';
}

// After: 使用 fieldSchema
function getMetricDirection(schema: ConfirmedFieldSchema): MetricDirection {
  return schema.direction; // 直接使用用户确认的方向
}
```

---

## 七、旧教育数据的兼容方案

### 7.1 兼容策略

**方案**: 渐进式迁移 + 运行时映射

**原则**:
1. 保留旧类型定义（`LegacyFieldType`, `LegacyAnalysisRole`）
2. 新增映射函数（旧 → 新）
3. 分析模块逐步迁移到新类型
4. 旧数据加载时自动映射

### 7.2 映射函数实现

**文件**: `src/utils/fieldSchema/legacyMapper.ts`（新增）

```typescript
/** 旧 FieldType 到新 FieldType 的映射 */
export function mapLegacyFieldType(
  legacyType: LegacyFieldType,
  header: string,
  columnValues: string[]
): FieldType {
  switch (legacyType) {
    case 'identity':
      // 需要根据内容判断是 identifier 还是 category
      if (isGroupingIdentity(header, columnValues)) {
        return 'category';
      }
      if (isIdentifierIdentity(header, columnValues)) {
        return 'identifier';
      }
      return 'text';
    case 'score':
    case 'rank':
    case 'bonus':
    case 'penalty':
      return 'number';
    case 'category':
    case 'status':
      return 'category';
    case 'text':
      return 'text';
    case 'unknown':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/** 旧 AnalysisRole 到新 AnalysisRole 的映射 */
export function mapLegacyAnalysisRole(
  legacyRole: LegacyAnalysisRole,
  header: string,
  columnValues: string[]
): AnalysisRole {
  switch (legacyRole) {
    case 'primaryTotal':
    case 'rank':
    case 'sectionTotal':
    case 'courseScore':
    case 'adjustment':
      return 'metric';
    case 'identity':
      if (isGroupingIdentity(header, columnValues)) {
        return 'dimension';
      }
      return 'identifier';
    case 'textMeta':
      if (isGroupingTextMeta(header, columnValues)) {
        return 'dimension';
      }
      return 'description';
    case 'unknown':
      return 'unspecified';
    case 'invalid':
      return 'ignored';
    default:
      return 'unspecified';
  }
}
```

### 7.3 迁移时间线

| 阶段 | 任务 | 风险 | 回滚难度 |
|------|------|------|---------|
| Stage 1A-1 | 定义新类型 + 映射函数 | 低 | 容易 |
| Stage 1A-2 | 实现字段确认 UI | 中 | 容易 |
| Stage 1A-3 | 迁移 2-3 个核心分析模块 | 中 | 中等 |
| Stage 1A-4 | 迁移剩余分析模块 | 中 | 中等 |
| Stage 1A-5 | 删除旧类型定义 | 高 | 困难 |

---

## 八、本地状态保存方式

### 8.1 存储策略

**存储位置**: `localStorage`

**Key 设计**:
```typescript
const FIELD_SCHEMA_KEY_PREFIX = 'fieldSchema:';
const FIELD_SCHEMA_KEY = `${FIELD_SCHEMA_KEY_PREFIX}${datasetKey}`;
```

### 8.2 存储内容

```typescript
interface StoredFieldSchema {
  version: 1;
  datasetKey: string;
  fields: ConfirmedFieldSchema[];
  template?: 'education' | 'generic';
  allConfirmed: boolean;
  savedAt: string; // ISO 8601
}
```

### 8.3 加载与保存

**文件**: `src/utils/fieldSchema/storage.ts`（新增）

```typescript
export function loadFieldSchema(datasetKey: string): FieldSchemaSet | null {
  const stored = localStorage.getItem(`fieldSchema:${datasetKey}`);
  if (!stored) return null;
  
  try {
    const parsed: StoredFieldSchema = JSON.parse(stored);
    
    // 版本检查
    if (parsed.version !== 1) return null;
    
    return {
      datasetKey: parsed.datasetKey,
      fields: parsed.fields,
      allConfirmed: parsed.allConfirmed,
      template: parsed.template,
      createdAt: parsed.savedAt,
      updatedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveFieldSchema(schema: FieldSchemaSet): void {
  const stored: StoredFieldSchema = {
    version: 1,
    datasetKey: schema.datasetKey,
    fields: schema.fields,
    template: schema.template,
    allConfirmed: schema.allConfirmed,
    savedAt: new Date().toISOString(),
  };
  
  localStorage.setItem(`fieldSchema:${schema.datasetKey}`, JSON.stringify(stored));
}

export function clearFieldSchema(datasetKey: string): void {
  localStorage.removeItem(`fieldSchema:${datasetKey}`);
}
```

### 8.4 useFieldSchema Hook

**文件**: `src/hooks/useFieldSchema.ts`（新增）

```typescript
export function useFieldSchema(
  datasetKey: string,
  headers: string[],
  rows: Record<string, string>[],
  legacyFieldMetas: FieldMeta[],
): {
  fieldSchema: FieldSchemaSet | null;
  updateField: (header: string, updates: Partial<ConfirmedFieldSchema>) => void;
  confirmAll: () => void;
  resetToAutoInfer: () => void;
} {
  // 1. 加载已保存的字段模式
  // 2. 如果没有，基于 legacyFieldMetas 自动推断
  // 3. 提供更新接口
  // 4. 自动保存到 localStorage
}
```

---

## 九、UI 流程

### 9.1 字段确认界面入口

**位置**: 数据解析完成后、分析开始前

**触发条件**:
- 数据解析成功（`parsedData != null`）
- 数据未截断（`!dataVolumeState.isParseTruncated`）
- 字段模式未全部确认（`!fieldSchema.allConfirmed`）

### 9.2 字段确认界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ 字段模式确认                                                 │
│ 请确认系统对每个字段的理解，您可以修改任何推断结果。             │
├─────────────────────────────────────────────────────────────┤
│ 模板选择: [通用模式 ▼]  （可选：教育成绩模板）                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 字段名        类型      角色       方向        置信度  操作    │
│ ─────────────────────────────────────────────────────────── │
│ 学号          identifier identifier —          95%    [编辑] │
│ 姓名          text       identifier —          90%    [编辑] │
│ 班级          category   dimension  —          85%    [编辑] │
│ 总分          number     metric     higher_is_better 90% [编辑]│
│ 数学          number     metric     higher_is_better 85% [编辑]│
│ 排名          number     metric     lower_is_better  88% [编辑]│
│ 备注          text       description —          70%    [编辑] │
│ ...                                                        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ [全部确认并开始分析]  [跳过，使用自动推断]                      │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 编辑对话框

```
┌─────────────────────────────────────┐
│ 编辑字段：总分                       │
├─────────────────────────────────────┤
│ 原始字段名: 总分                     │
│ 示例值: 650, 720, 580               │
│ 缺失值: 0   唯一值: 150             │
│                                      │
│ 数据类型: [number ▼]                 │
│ 分析角色: [metric ▼]                 │
│ 指标方向: [higher_is_better ▼]       │
│ 忽略字段: [ ]                        │
│                                      │
│ 推断来源: 关键词（总分）              │
│ 置信度: 90%                         │
│                                      │
│ 修改原因: [可选，说明修改理由]        │
│                                      │
│ [保存]  [取消]                       │
└─────────────────────────────────────┘
```

### 9.4 状态流转

```
数据解析完成
  ↓
自动推断字段模式（inferredFrom: 'keyword' | 'content'）
  ↓
显示字段确认界面
  ↓
用户编辑字段 → inferredFrom 变为 'user'
  ↓
用户点击"全部确认" → allConfirmed = true
  ↓
保存到 localStorage
  ↓
进入分析流程
```

### 9.5 跳过确认

用户可以点击"跳过，使用自动推断"：
- `allConfirmed` 保持 `false`
- 字段模式使用自动推断结果
- 后续仍可重新打开确认界面修改
- 分析正常进行

---

## 十、测试方案

### 10.1 测试文件

**文件**: `scripts/testStage1A.mjs`（新增）

### 10.2 测试分类

#### 1. 类型映射测试（预计 15 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 1 | `identity` + 高唯一率 → `identifier` | 通过 |
| 2 | `identity` + 班级关键词 → `category` | 通过 |
| 3 | `score` → `number` | 通过 |
| 4 | `rank` → `number` | 通过 |
| 5 | `bonus` → `number` | 通过 |
| 6 | `penalty` → `number` | 通过 |
| 7 | `category` → `category` | 通过 |
| 8 | `status` → `category` | 通过 |
| 9 | `primaryTotal` → `metric` | 通过 |
| 10 | `rank` (role) → `metric` | 通过 |
| 11 | `identity` + 分组 → `dimension` | 通过 |
| 12 | `textMeta` + 长文本 → `description` | 通过 |
| 13 | `unknown` → `unspecified` | 通过 |
| 14 | `invalid` → `ignored` | 通过 |
| 15 | 方向映射：`higher-is-better` → `higher_is_better` | 通过 |

#### 2. 字段推断测试（预计 10 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 16 | 关键词命中 → 高置信度（≥0.9） | 通过 |
| 17 | 内容特征命中 → 中置信度（0.6-0.8） | 通过 |
| 18 | 未命中 → 低置信度（<0.5）+ `unspecified` | 通过 |
| 19 | 教育模板预填 → `inferredFrom: 'template'` | 通过 |
| 20 | 通用模式 → 默认 `unspecified` 方向 | 通过 |
| 21 | 示例值提取 → 前 3 个非空值 | 通过 |
| 22 | 缺失值计数 → 正确 | 通过 |
| 23 | 唯一值计数 → 正确 | 通过 |
| 24 | 推断结果包含所有字段 | 通过 |
| 25 | 推断结果顺序与 headers 一致 | 通过 |

#### 3. 用户确认测试（预计 12 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 26 | 修改类型 → `inferredFrom` 变为 `'user'` | 通过 |
| 27 | 修改角色 → `inferredFrom` 变为 `'user'` | 通过 |
| 28 | 修改方向 → `inferredFrom` 变为 `'user'` | 通过 |
| 29 | 忽略字段 → `ignored: true` | 通过 |
| 30 | 保存后 → localStorage 正确写入 | 通过 |
| 31 | 加载后 → 从 localStorage 正确读取 | 通过 |
| 32 | 版本不匹配 → 返回 null | 通过 |
| 33 | datasetKey 变化 → 旧模式不加载 | 通过 |
| 34 | 全部确认 → `allConfirmed: true` | 通过 |
| 35 | 部分确认 → `allConfirmed: false` | 通过 |
| 36 | 重置 → 恢复自动推断结果 | 通过 |
| 37 | 用户修改后自动推断不覆盖 | 通过 |

#### 4. 模板测试（预计 8 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 38 | 教育模板 → 成绩字段预填 `metric` | 通过 |
| 39 | 教育模板 → 排名字段预填 `lower_is_better` | 通过 |
| 40 | 教育模板 → 班级预填 `dimension` | 通过 |
| 41 | 教育模板 → 学号预填 `identifier` | 通过 |
| 42 | 通用模板 → 所有方向默认 `unspecified` | 通过 |
| 43 | 用户覆盖模板 → 用户优先 | 通过 |
| 44 | 切换模板 → 重新推断（未确认字段） | 通过 |
| 45 | 已确认字段不受模板切换影响 | 通过 |

#### 5. 兼容性测试（预计 8 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 46 | 旧数据加载 → 自动映射到新类型 | 通过 |
| 47 | 旧 localStorage → 忽略或迁移 | 通过 |
| 48 | 新旧类型混用 → 不冲突 | 通过 |
| 49 | 旧 fieldMetas → 正确转换为 fieldSchema | 通过 |
| 50 | 旧 metricLayer → 使用映射后的方向 | 通过 |
| 51 | 旧 OriginalFieldRadar → 使用映射后的角色 | 通过 |
| 52 | 旧教育数据 → 分析结果一致 | 通过 |
| 53 | 旧通用数据 → 分析结果正确 | 通过 |

#### 6. 集成测试（预计 7 项）

| 编号 | 测试内容 | 预期 |
|------|---------|------|
| 54 | 字段确认 → 分析使用新方向 | 通过 |
| 55 | 忽略字段 → 不参与分析 | 通过 |
| 56 | 修改维度 → 分组统计更新 | 通过 |
| 57 | 修改指标 → 单变量统计更新 | 通过 |
| 58 | 字段模式 → 传入 AnalysisDataset | 通过 |
| 59 | 字段模式 → 传入导出模块 | 通过 |
| 60 | 字段模式 → 持久化到 localStorage | 通过 |

### 10.3 测试汇总

- **总测试用例**: 60 项
- **预计断言数量**: ~85 个
- **回归测试**: 同 Stage 0A-2

---

## 十一、分阶段迁移方式

### 11.1 Stage 1A-1: 类型定义与映射（低风险）

**目标**: 定义新类型 + 映射函数，不改变现有行为

**文件**:
- `src/types/fieldSchema.ts`（新增）
- `src/utils/fieldSchema/legacyMapper.ts`（新增）
- `src/utils/fieldSchema/storage.ts`（新增）

**任务**:
1. 定义 `FieldType`, `AnalysisRole`, `MetricDirection` 新类型
2. 定义 `ConfirmedFieldSchema`, `FieldSchemaSet` 数据结构
3. 实现 `mapLegacyFieldType`, `mapLegacyAnalysisRole` 映射函数
4. 实现 `loadFieldSchema`, `saveFieldSchema` 存储函数
5. 编写映射函数测试

**验收标准**:
- 新类型定义完整
- 映射函数测试通过
- `npx tsc --noEmit` 通过
- 现有功能不受影响

### 11.2 Stage 1A-2: 字段确认 UI（中风险）

**目标**: 实现字段确认界面，允许用户查看和修改字段模式

**文件**:
- `src/hooks/useFieldSchema.ts`（新增）
- `src/components/FieldSchemaConfirmation.tsx`（新增）
- `src/components/FieldEditDialog.tsx`（新增）
- `src/App.tsx`（修改）

**任务**:
1. 实现 `useFieldSchema` Hook
2. 实现字段确认界面组件
3. 实现字段编辑对话框
4. 集成到 App.tsx（数据解析后、分析前）
5. 编写 UI 交互测试

**验收标准**:
- 字段确认界面正确展示所有字段
- 用户可以修改类型、角色、方向
- 修改后 `inferredFrom` 变为 `'user'`
- localStorage 正确保存和加载
- `npx tsc --noEmit` 通过

### 11.3 Stage 1A-3: 核心分析模块迁移（中风险）

**目标**: 迁移 2-3 个核心分析模块使用新字段模式

**文件**:
- `src/engine/metricLayer.ts`（修改）
- `src/hooks/useAnalysisContext.ts`（修改）
- `src/hooks/useAnalysisOrchestrator.ts`（修改）

**任务**:
1. 迁移 `metricLayer.ts` 使用 `fieldSchema.fields[].direction`
2. 迁移 `useAnalysisContext.ts` 使用 `fieldSchema.fields` 计算 `fieldScores`
3. 迁移 `useAnalysisOrchestrator.ts` 使用 `fieldSchema`
4. 编写集成测试

**验收标准**:
- 分析结果与迁移前一致（旧教育数据）
- 用户修改方向后，分析结果正确更新
- `npm run test:analysis-engine` 通过
- `npx tsc --noEmit` 通过

### 11.4 Stage 1A-4: 剩余分析模块迁移（中风险）

**目标**: 迁移剩余分析模块使用新字段模式

**文件**:
- `src/engine/analysisEngine.ts`（修改）
- `src/engine/correlationAnalyzer.ts`（修改）
- `src/engine/groupByDimension.ts`（修改）
- `src/components/charts/OriginalFieldRadar.tsx`（修改）

**任务**:
1. 迁移 `analysisEngine.ts` 使用 `fieldSchema.fieldType`
2. 迁移 `correlationAnalyzer.ts` 使用 `fieldSchema.fieldType === 'number'`
3. 迁移 `groupByDimension.ts` 使用 `fieldSchema.analysisRole === 'dimension'`
4. 迁移 `OriginalFieldRadar.tsx` 使用新角色分组
5. 编写集成测试

**验收标准**:
- 所有分析模块使用新字段模式
- 旧教育数据分析结果一致
- 通用数据分析正确
- `npm run test:analysis-engine` 通过
- `npx tsc --noEmit` 通过

### 11.5 Stage 1A-5: 旧类型清理（高风险）

**目标**: 删除旧类型定义，完成迁移

**文件**:
- `src/utils/tableParser/types.ts`（修改）
- `src/utils/tableParser/fieldClassifier.ts`（修改）
- `src/engine/metricLayer.ts`（修改）

**任务**:
1. 将旧类型重命名为 `LegacyFieldType`, `LegacyAnalysisRole`
2. 更新所有导入
3. 删除旧类型定义（如果所有模块已迁移）
4. 清理旧关键词（迁移到教育模板）
5. 编写回归测试

**验收标准**:
- 旧类型定义已删除
- 所有模块使用新类型
- 教育模板功能正常
- 通用模式功能正常
- `npm run test:analysis-engine` 通过
- `npx tsc --noEmit` 通过
- `npm run build` 通过

---

## 十二、回滚方式

### 12.1 代码回滚

```bash
# 查看 Stage 1A 提交
git log --oneline | grep "Stage 1A"

# 回滚到 Stage 0A-2
git revert <stage-1a-commit-hash>

# 或硬重置（危险操作）
git reset --hard 88ef55f  # Stage 0A-2 最终提交
```

### 12.2 数据回滚

**字段模式数据**:
- 存储在 localStorage
- 删除 Key: `fieldSchema:*`
- 不影响原始数据

**分析结果**:
- 基于新字段模式重新计算
- 旧分析结果自动失效

### 12.3 分阶段回滚

| 阶段 | 回滚影响 | 回滚难度 |
|------|---------|---------|
| Stage 1A-1 | 无影响（仅新增类型和函数） | 容易 |
| Stage 1A-2 | 移除字段确认 UI | 容易 |
| Stage 1A-3 | 恢复旧分析模块 | 中等 |
| Stage 1A-4 | 恢复旧分析模块 | 中等 |
| Stage 1A-5 | 恢复旧类型定义 | 困难 |

### 12.4 回滚验证

回滚后需验证:
1. `npm run test:analysis-engine` 通过
2. `node scripts/testStage0A2.mjs` 通过
3. `npx tsc --noEmit` 通过
4. `npm run build` 通过
5. 旧教育数据分析结果一致

---

## 十三、风险与缓解

### 13.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| localStorage 容量限制 | 大型数据集字段模式无法保存 | 定期清理旧数据集；压缩存储 |
| 映射函数不准确 | 旧数据分析结果变化 | 提供用户确认机制；充分测试 |
| 新旧类型混用 | 类型冲突或行为不一致 | 渐进式迁移；严格类型检查 |
| 教育模板覆盖不全 | 教育数据分析体验下降 | 保留旧关键词；逐步完善模板 |

### 13.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 用户不理解字段模式 | 用户困惑 | 提供默认值；清晰说明 |
| 字段确认流程过长 | 用户流失 | 允许跳过；批量操作 |
| 教育用户依赖旧行为 | 教育用户不满 | 保留教育模板；平滑迁移 |

---

## 十四、验收标准

### 14.1 功能验收

- [ ] 字段确认界面正确展示所有字段
- [ ] 用户可以修改类型、角色、方向
- [ ] 用户修改后自动推断不覆盖
- [ ] 字段模式正确保存到 localStorage
- [ ] 字段模式正确传入分析模块
- [ ] 旧教育数据分析结果一致
- [ ] 通用数据分析正确

### 14.2 技术验收

- [ ] `npm run test:analysis-engine` 通过
- [ ] `node scripts/testStage1A.mjs` 通过（60/60）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过

### 14.3 文档验收

- [ ] 修改文件清单完整
- [ ] 测试覆盖报告完整
- [ ] 已知限制说明
- [ ] 回滚方式说明

---

**文档版本**: v1.0  
**制定日期**: 2026-07-22  
**状态**: 待实施
