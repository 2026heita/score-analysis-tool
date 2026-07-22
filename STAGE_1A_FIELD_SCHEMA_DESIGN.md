# Stage 1A 字段模式确认与修正层 - 设计文档

**版本**: v1.0  
**制定日期**: 2026-07-22  
**前置条件**: Stage 0A-2 已完成  
**目标**: 建立用户可确认和修改的字段模式层，使自动推断仅作为建议

---

## 一、当前字段系统审计

### 1.1 FieldType 现状

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

**问题**:
- 包含教育特定类型：`score`, `rank`, `bonus`, `penalty`, `status`
- 缺乏通用数据类型：`number`, `datetime`, `boolean`
- `identity` 混合了标识符和分组字段

### 1.2 AnalysisRole 现状

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

**问题**:
- 包含教育特定角色：`primaryTotal`, `rank`, `sectionTotal`, `courseScore`, `adjustment`
- 缺乏通用分析角色：`metric`, `dimension`, `time`, `description`
- `identity` 混合了主键和分组维度

### 1.3 MetricDirection 现状

**文件**: `src/engine/metricLayer.ts`

```typescript
export type MetricDirection = 'higher-is-better' | 'lower-is-better';
```

**问题**:
- 只有两种方向，缺乏 `neutral` 和 `unspecified`
- 硬编码规则：`role === 'rank' ? 'lower-is-better' : 'higher-is-better'`
- 无法处理通用场景（如销售额越高越好、温度适中等）

### 1.4 教育专用关键词使用链

**文件**: `src/utils/tableParser/fieldClassifier.ts`

| 关键词类型 | 关键词列表 | 使用位置 |
|-----------|-----------|---------|
| IDENTITY_KEYWORDS | 学校代码、姓名、班级、学号等 | `classifyFieldByKeyword` |
| SCORE_KEYWORDS | 总分、语文、数学、英语等 | `classifyFieldByKeyword` |
| RANK_KEYWORDS | 名次、排名、位次等 | `classifyFieldByKeyword` |
| BONUS_KEYWORDS | 加分、政策加分等 | `classifyFieldByKeyword` |
| PENALTY_KEYWORDS | 扣分、违纪扣分等 | `classifyFieldByKeyword` |
| CATEGORY_KEYWORDS | 组合、科类、选科等 | `classifyFieldByKeyword` |
| PRIMARY_TOTAL_KEYWORDS | 总分、总成绩等 | `classifyAnalysisRole` |
| SECTION_TOTAL_KEYWORDS | 合计、总计等 | `classifyAnalysisRole` |

**影响范围**:
- `classifyFields()` - 字段分类主函数
- `recommendAnalysisField()` - 推荐分析字段
- `getAnalyzableFields()` - 获取可分析字段
- `calculateFieldAnalyticScore()` - 字段可分析性评分

---

## 二、新字段模式设计

### 2.1 通用 FieldType

```typescript
export type FieldType =
  | 'number'       // 数值类型（连续数值）
  | 'category'     // 类别类型（离散分类）
  | 'datetime'     // 日期时间类型
  | 'boolean'      // 布尔类型
  | 'text'         // 文本类型（长文本、描述）
  | 'identifier'   // 标识符类型（主键、ID）
  | 'unknown';     // 未知类型
```

**映射关系**（旧 → 新）:
| 旧 FieldType | 新 FieldType | 说明 |
|-------------|-------------|------|
| `identity` | `identifier` | 学号、考号等主键 |
| `identity` | `category` | 班级、学校等分组字段 |
| `score` | `number` | 成绩、分数等数值 |
| `rank` | `number` | 排名等数值 |
| `bonus` | `number` | 加分等数值 |
| `penalty` | `number` | 扣分等数值 |
| `category` | `category` | 科类、组合等分类 |
| `status` | `category` | 缺考、弃考等状态 |
| `text` | `text` | 保持不变 |
| `unknown` | `unknown` | 保持不变 |

### 2.2 通用 AnalysisRole

```typescript
export type AnalysisRole =
  | 'metric'       // 指标字段（参与统计计算）
  | 'dimension'    // 维度字段（用于分组）
  | 'identifier'   // 标识符字段（主键、ID）
  | 'time'         // 时间字段（日期、时间戳）
  | 'description'  // 描述字段（备注、说明）
  | 'ignored'      // 忽略字段（不参与分析）
  | 'unspecified'; // 未指定（需要用户确认）
```

**映射关系**（旧 → 新）:
| 旧 AnalysisRole | 新 AnalysisRole | 说明 |
|----------------|----------------|------|
| `primaryTotal` | `metric` | 总分等主指标 |
| `rank` | `metric` | 排名等指标 |
| `sectionTotal` | `metric` | 合计等指标 |
| `courseScore` | `metric` | 课程成绩等指标 |
| `adjustment` | `metric` | 加扣分等指标 |
| `identity` | `identifier` | 学号、姓名等主键 |
| `identity` | `dimension` | 班级、学校等分组 |
| `textMeta` | `description` | 备注、说明等 |
| `textMeta` | `dimension` | 类别、组合等分组 |
| `unknown` | `unspecified` | 需要用户确认 |
| `invalid` | `ignored` | 无效字段 |

### 2.3 通用 MetricDirection

```typescript
export type MetricDirection =
  | 'higher_is_better'  // 越高越好（如成绩、销售额）
  | 'lower_is_better'   // 越低越好（如排名、错误率）
  | 'neutral'           // 中性（如温度、年龄）
  | 'unspecified';      // 未指定（通用模式默认）
```

**规则**:
- 通用模式默认 `unspecified`
- `neutral` 和 `unspecified` 不生成优势/弱势/好坏评价
- 教育模板可预填 `higher_is_better` 或 `lower_is_better`
- 用户可以覆盖模板预填值

### 2.4 用户确认后的字段模式数据结构

```typescript
/** 用户确认的字段模式 */
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
  inferredFrom: 'keyword' | 'content' | 'user' | 'template';
  
  /** 推断置信度（0-1） */
  confidence: number;
  
  /** 用户修改原因（可选） */
  userReason?: string;
}

/** 字段模式集合 */
export interface FieldSchemaSet {
  /** 数据集标识 */
  datasetKey: string;
  
  /** 字段模式数组 */
  fields: ConfirmedFieldSchema[];
  
  /** 是否全部已确认 */
  allConfirmed: boolean;
  
  /** 使用的模板（可选） */
  template?: 'education' | 'generic';
}
```

---

## 三、自动推断与用户配置优先级

### 3.1 优先级规则

```
用户确认 > 模板预填 > 自动推断
```

**详细说明**:
1. **用户确认**（最高优先级）
   - 用户在字段确认界面手动修改的类型、角色、方向
   - 一旦确认，自动推断不得再次覆盖
   - 保存到 `FieldSchemaSet.fields[].inferredFrom = 'user'`

2. **模板预填**（中优先级）
   - 教育模板预填的类型、角色、方向
   - 用户可以覆盖
   - 保存到 `FieldSchemaSet.fields[].inferredFrom = 'template'`

3. **自动推断**（最低优先级）
   - 基于关键词和内容特征的自动分类
   - 仅作为建议展示
   - 保存到 `FieldSchemaSet.fields[].inferredFrom = 'keyword' | 'content'`

### 3.2 推断流程

```typescript
function inferFieldSchema(
  header: string,
  columnValues: string[],
  template?: 'education' | 'generic'
): ConfirmedFieldSchema {
  // 1. 自动推断
  const autoInferred = autoInferField(header, columnValues);
  
  // 2. 模板预填（如果启用）
  if (template === 'education') {
    const templateFilled = applyEducationTemplate(autoInferred);
    return {
      ...templateFilled,
      inferredFrom: 'template',
      confidence: 0.9,
    };
  }
  
  // 3. 返回自动推断结果
  return {
    ...autoInferred,
    inferredFrom: autoInferred.source,
    confidence: autoInferred.confidence,
  };
}
```

---

## 四、字段模式传入分析模块

### 4.1 数据流

```
用户确认字段模式
  ↓
FieldSchemaSet（存储在 useFieldSchema Hook）
  ↓
AnalysisDataset（包含 fieldSchema）
  ↓
各分析模块（使用 fieldSchema 而非 fieldMetas）
```

### 4.2 AnalysisDataset 扩展

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

### 4.3 分析模块迁移

**需要迁移的模块**:
- `useAnalysisOrchestrator` - 使用 `fieldSchema` 获取指标方向
- `useAnalysisContext` - 使用 `fieldSchema` 计算 `fieldScores`
- `analysisEngine` - 使用 `fieldSchema` 判断字段类型
- `correlationAnalyzer` - 使用 `fieldSchema` 过滤数值字段
- `groupByDimension` - 使用 `fieldSchema` 识别维度字段

**迁移示例**:
```typescript
// Before
const direction = getMetricDirection(meta.analysisRole);

// After
const schema = fieldSchema.fields.find(f => f.header === fieldName);
const direction = schema?.direction ?? 'unspecified';
```

---

## 五、教育模板边界

### 5.1 教育模板规则分类

**通用规则**（保留在核心代码）:
- 数值比例高 → `number`
- 唯一率高 → `identifier`
- 长文本 → `text`
- 日期格式 → `datetime`

**教育模板规则**（迁移到模板配置）:
- 关键词：`总分`, `语文`, `数学`, `英语` → `number` + `metric`
- 关键词：`名次`, `排名` → `number` + `metric` + `lower_is_better`
- 关键词：`班级`, `学校` → `category` + `dimension`
- 关键词：`学号`, `考号` → `identifier` + `identifier`

**无效或重复规则**（删除）:
- `primaryTotal` vs `sectionTotal` - 合并为 `metric`
- `courseScore` vs `score` - 合并为 `metric`
- `adjustment` - 合并为 `metric`

**必须参数化的规则**（提取到配置）:
- 指标方向硬编码：`role === 'rank' ? 'lower-is-better' : 'higher-is-better'`
- 推荐字段优先级：`primaryTotal > rank > sectionTotal > courseScore`

### 5.2 教育模板配置结构

```typescript
export interface EducationTemplate {
  name: 'education';
  displayName: '教育成绩模板';
  
  /** 字段类型推断规则 */
  fieldTypeRules: Array<{
    keywords: string[];
    fieldType: FieldType;
    confidence: number;
  }>;
  
  /** 分析角色推断规则 */
  analysisRoleRules: Array<{
    keywords: string[];
    analysisRole: AnalysisRole;
    confidence: number;
  }>;
  
  /** 指标方向推断规则 */
  directionRules: Array<{
    keywords: string[];
    direction: MetricDirection;
    confidence: number;
  }>;
  
  /** 推荐字段优先级 */
  recommendationPriority: Record<AnalysisRole, number>;
}
```

---

## 六、旧教育数据的兼容方案

### 6.1 兼容策略

**方案**: 渐进式迁移 + 运行时映射

**实现**:
1. **保留旧类型定义**（`FieldType`, `AnalysisRole`）
2. **新增映射函数**（旧 → 新）
3. **分析模块逐步迁移**到新类型
4. **旧数据加载时自动映射**

### 6.2 映射函数

```typescript
function mapLegacyFieldType(legacyType: LegacyFieldType): FieldType {
  const mapping: Record<LegacyFieldType, FieldType> = {
    identity: 'identifier', // 或 'category'，需根据内容判断
    score: 'number',
    rank: 'number',
    bonus: 'number',
    penalty: 'number',
    category: 'category',
    status: 'category',
    text: 'text',
    unknown: 'unknown',
  };
  return mapping[legacyType];
}

function mapLegacyAnalysisRole(legacyRole: LegacyAnalysisRole): AnalysisRole {
  const mapping: Record<LegacyAnalysisRole, AnalysisRole> = {
    primaryTotal: 'metric',
    rank: 'metric',
    sectionTotal: 'metric',
    courseScore: 'metric',
    adjustment: 'metric',
    identity: 'identifier', // 或 'dimension'，需根据内容判断
    textMeta: 'description', // 或 'dimension'，需根据内容判断
    unknown: 'unspecified',
    invalid: 'ignored',
  };
  return mapping[legacyRole];
}
```

### 6.3 迁移时间线

| 阶段 | 任务 | 风险 |
|------|------|------|
| Stage 1A-1 | 定义新类型 + 映射函数 | 低 |
| Stage 1A-2 | 实现字段确认 UI | 中 |
| Stage 1A-3 | 迁移 2-3 个核心分析模块 | 中 |
| Stage 1A-4 | 迁移剩余分析模块 | 中 |
| Stage 1A-5 | 删除旧类型定义 | 高 |

---

## 七、本地状态保存方式

### 7.1 存储策略

**存储位置**: `localStorage`

**Key 设计**:
```typescript
const FIELD_SCHEMA_KEY = `fieldSchema:${datasetKey}`;
```

**存储内容**:
```typescript
interface StoredFieldSchema {
  version: 1;
  datasetKey: string;
  fields: ConfirmedFieldSchema[];
  template?: 'education' | 'generic';
  savedAt: string; // ISO 8601
}
```

### 7.2 加载逻辑

```typescript
function loadFieldSchema(datasetKey: string): FieldSchemaSet | null {
  const stored = localStorage.getItem(`fieldSchema:${datasetKey}`);
  if (!stored) return null;
  
  const parsed: StoredFieldSchema = JSON.parse(stored);
  
  // 版本检查
  if (parsed.version !== 1) return null;
  
  return {
    datasetKey: parsed.datasetKey,
    fields: parsed.fields,
    allConfirmed: parsed.fields.every(f => f.inferredFrom === 'user'),
    template: parsed.template,
  };
}
```

### 7.3 保存逻辑

```typescript
function saveFieldSchema(schema: FieldSchemaSet): void {
  const stored: StoredFieldSchema = {
    version: 1,
    datasetKey: schema.datasetKey,
    fields: schema.fields,
    template: schema.template,
    savedAt: new Date().toISOString(),
  };
  
  localStorage.setItem(`fieldSchema:${schema.datasetKey}`, JSON.stringify(stored));
}
```

---

## 八、已知限制

### 8.1 技术限制

1. **localStorage 容量限制**
   - 约 5-10MB
   - 大型数据集的字段模式可能超限
   - 缓解：定期清理旧数据集

2. **跨设备同步**
   - localStorage 不跨设备
   - 用户在不同设备上需要重新确认
   - 缓解：未来可考虑导出/导入功能

3. **浏览器兼容性**
   - 需要支持 localStorage
   - IE8+ 支持

### 8.2 设计限制

1. **字段模式不跨数据集**
   - 每个数据集独立确认
   - 相同结构的表格需要重复确认
   - 缓解：未来可考虑模板匹配

2. **自动推断准确性**
   - 关键词匹配可能误判
   - 内容特征依赖数据质量
   - 缓解：提供用户确认机制

3. **教育模板覆盖范围**
   - 仅覆盖常见教育场景
   - 特殊场景需要用户手动配置
   - 缓解：提供通用模式作为备选

---

## 九、回滚方式

### 9.1 代码回滚

```bash
# 回滚到 Stage 0A-2
git revert <stage-1a-commit-hash>

# 或硬重置（危险操作）
git reset --hard <stage-0a-2-commit-hash>
```

### 9.2 数据回滚

**字段模式数据**:
- 存储在 localStorage
- 删除 Key: `fieldSchema:*`
- 不影响原始数据

**分析结果**:
- 基于新字段模式重新计算
- 旧分析结果自动失效

### 9.3 回滚验证

回滚后需验证:
1. `npm run test:analysis-engine` 通过
2. `node scripts/testStage0A2.mjs` 通过
3. `npx tsc --noEmit` 通过
4. `npm run build` 通过

---

## 十、附录

### 10.1 关键词列表（教育模板）

```typescript
// 身份标识
const IDENTITY_KEYWORDS = [
  '学校代码', '学校名称', '姓名', '班级', '考号', '座号', '学号',
  '考生号', '准考证', '考生姓名', '身份证号', '性别', '民族',
  '院系', '专业', '行政班', '教学班',
];

// 成绩字段
const SCORE_KEYWORDS = [
  '总分', '语文', '数学', '英语', '外语', '物理', '化学', '生物',
  '政治', '历史', '地理', '成绩', '分数', '得分',
  '总分（不含加分）', '原始总分', '标准总分',
  '综合', '文科综合', '理科综合',
  '高考成绩', '综合成绩', '赋分后成绩', '赋分前成绩', '语数英总',
  '等级分', '标准分', '原始分', '转换分',
];

// 排名字段
const RANK_KEYWORDS = [
  '名次', '排名', '位次', '年级名次', '班级名次',
  '校排', '班排', '年排', '级排',
];

// 加分字段
const BONUS_KEYWORDS = [
  '加分', '区内加分', '区外加分', '政策加分', '优惠加分', '特长加分',
  '奖励分', '奖励',
];

// 扣分字段
const PENALTY_KEYWORDS = [
  '扣分', '违纪扣分', '惩罚',
];

// 分类字段
const CATEGORY_KEYWORDS = [
  '组合', '组合简称', '科类', '选科', '类别', '文理', '科类名称',
  '选考', '首选', '再选',
];
```

### 10.2 测试场景

**字段推断测试**:
1. 关键词命中 → 高置信度
2. 内容特征命中 → 中置信度
3. 未命中 → 低置信度 + `unspecified`

**用户确认测试**:
1. 修改类型 → 保存成功
2. 修改角色 → 保存成功
3. 修改方向 → 保存成功
4. 忽略字段 → 不参与分析

**模板测试**:
1. 教育模板 → 预填成功
2. 通用模板 → 默认 `unspecified`
3. 用户覆盖 → 优先级正确

**兼容性测试**:
1. 旧数据加载 → 自动映射
2. 旧 localStorage → 忽略或迁移
3. 新旧混用 → 不冲突

---

**文档版本**: v1.0  
**制定日期**: 2026-07-22  
**状态**: 待实施
