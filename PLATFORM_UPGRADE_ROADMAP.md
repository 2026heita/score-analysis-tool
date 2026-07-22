# 通用表格数据分析平台 - 升级路线图

**制定日期**: 2026-07-20  
**最后更新**: 2026-07-21  
**基线版本**: v1.9.2 (最新提交: 8a8bd4b)  
**路线图目标**: 将平台从"教育偏向"升级为"真正通用的表格数据分析平台"

---

## 路线总览

| Stage | 名称 | 目标 | 工作量 | 前置条件 |
|-------|------|------|--------|---------|
| **Stage 0A** | **统一数据量状态** | **统一数据量状态、消除静默截断、统一分析样本，解决文件上传后重复解析导致的状态覆盖风险** | **中** | **无** |
| **Stage 1A** | **字段模式确认与修正层** | **建立用户可确认、可修正的字段推断系统，支持通用指标方向** | **大** | **Stage 0A** |
| Stage 0 | 可靠性基线 | 修复会导致崩溃、错误结果、数据被静默截断或状态污染的问题 | 小 | Stage 1A |
| Stage 1 | 真正通用化 | 消除教育成绩业务对通用模式的污染 | 中 | Stage 0 |
| Stage 2 | 基础数据处理能力 | 补齐类型修正、缺失值、重复值、日期、分类字段等能力 | 大 | Stage 1 |
| Stage 3 | 通用分析工作流 | 完善单变量、分组、关系、筛选、异常值和结果解释的统一流程 | 大 | Stage 2 |
| Stage 4 | 导出与复用 | Excel 导出、分析配置保存、模板、报告复用 | 中 | Stage 2 |
| Stage 5 | 高级能力 | 多文件合并、透视分析、统计推断、大数据性能 | 大 | Stage 3 + Stage 4 |

---

## Stage 0A：统一数据量状态、阻止静默截断及保证分析样本一致性

### 0A.1 目标

统一数据量状态、消除静默截断、统一分析样本，并解决文件上传后重复解析导致的状态覆盖风险。

### 0A.2 用户价值

- 用户始终知道原始数据量、已解析数据量、已分析数据量
- 不再出现数据被静默截断而用户不知情的情况
- 所有分析模块使用同一批数据，结果一致可信
- 超过5000行时，用户主动确认后才开始分析

### 0A.3 当前问题

1. **20000行解析截断无警告**：`workbook.ts` 第100行 `rawData.slice(0, MAX_ROWS)` 未保存原始总行数，未生成警告
2. **5000行警告被覆盖**：文件上传后 `setRawText(text)` 触发 `useEffect([rawText])` 二次解析，覆盖 `parseWarnings`
3. **分析样本不一致**：4个模块独立执行 `rows.slice(0, 5000)`，无法保证使用同一批数据
4. **reparseSheet 丢失风险**：二次解析后 `parsedData` 被覆盖为 `ParsedTable` 类型，`reparseSheet` 方法可能丢失
5. **数据量概念混淆**：仅使用 `rows.length` 表示所有数据量概念，无法区分原始总行数、已解析行数、已分析行数

### 0A.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 0A.4.1 建立 DataVolumeState 数据量状态模型 | `src/types.ts`, `src/hooks/useParsedTable.ts` | 中 | 低 |
| 0A.4.2 解决20000行解析截断问题（保存原始行数、生成警告） | `src/utils/tableParser/workbook.ts`, `src/utils/tableParser/types.ts` | 小 | 低 |
| 0A.4.3 解决5000行警告被覆盖问题（禁用自动重解析） | `src/hooks/useParsedTable.ts`, `src/App.tsx` | 小 | 中 |
| 0A.4.4 实现确定性抽样（系统抽样） | `src/utils/sampling.ts` (新增) | 小 | 低 |
| 0A.4.5 统一分析数据集（生成唯一 analysisRows） | `src/hooks/useFilterState.ts`, `src/engine/context.ts`, `src/engine/analysisEngine.ts`, `src/engine/correlationAnalyzer.ts`, `src/engine/groupByDimension.ts`, `src/components/GeneralDataOverview.tsx` | 中 | 中 |
| 0A.4.6 超过5000行时停止自动分析，要求用户确认 | `src/App.tsx`, `src/hooks/useFilterState.ts` | 小 | 低 |
| 0A.4.7 持久展示抽样状态（数据导入区、解析报告、数据概览、导出结果） | `src/App.tsx`, `src/components/GeneralDataOverview.tsx`, `src/utils/export.ts` | 小 | 低 |
| 0A.4.8 修正安全格式化测试（导入实际生产模块） | `scripts/testSafeFormat.ts` (重写), `package.json` | 小 | 低 |

### 0A.5 涉及模块

- `src/types.ts` - 新增 DataVolumeState 类型
- `src/hooks/useParsedTable.ts` - 数据量状态管理、禁用自动重解析
- `src/hooks/useFilterState.ts` - 统一生成 analysisRows
- `src/utils/tableParser/workbook.ts` - 保存原始总行数、生成截断警告
- `src/utils/tableParser/types.ts` - ParseSummary 新增字段
- `src/engine/context.ts` - DerivedDataContext 新增 analysisRows
- `src/engine/analysisEngine.ts` - 使用 analysisRows
- `src/engine/correlationAnalyzer.ts` - 使用 analysisRows，移除独立截断
- `src/engine/groupByDimension.ts` - 使用 analysisRows，移除独立截断
- `src/components/GeneralDataOverview.tsx` - 使用 analysisRows，移除独立截断
- `src/utils/sampling.ts` - 新增系统抽样实现
- `src/utils/export.ts` - 导出结果包含抽样信息
- `scripts/testSafeFormat.ts` - 重写测试

### 0A.6 前置条件

无。

### 0A.7 风险

- 禁用自动重解析可能影响粘贴数据的自动解析体验 → 保留手动解析按钮
- 系统抽样在数据存在周期性模式时可能导致偏差 → 文档中说明抽样方法
- 修改分析模块可能影响现有功能 → 分批次修改，每批次单独测试

### 0A.8 验收标准

- [ ] 20000行截断时生成明确警告，说明原始行数和截断行数
- [ ] 文件上传后，5000行警告不丢失
- [ ] Sheet切换后，5000行警告不丢失
- [ ] 所有分析模块使用同一批 analysisRows
- [ ] 超过5000行时，要求用户确认后才能分析
- [ ] 抽样结果可复现（相同输入产生相同输出）
- [ ] 数据导入区、解析报告、数据概览、导出结果显示抽样信息
- [ ] 安全格式化测试导入实际生产模块，修改生产函数后测试能够真实失败
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过
- [ ] 全部已有测试通过

### 0A.9 不在该阶段处理的内容

- 删除废弃引擎（analyticsEngine.ts）
- 清理中风险 .toFixed()
- 删除或移动测试Excel文件
- 字段分类通用化
- 指标方向改造
- UI风格重构
- 新增统计功能
- 提升全量处理上限

### 0A.10 工作量等级

**中** - 涉及多个模块协调修改，需要充分测试

### 0A.11 相关文档

- [DATA_VOLUME_PIPELINE_AUDIT.md](./DATA_VOLUME_PIPELINE_AUDIT.md) - 数据量管道审计报告
- [NEXT_SLICE_PROPOSAL.md](./NEXT_SLICE_PROPOSAL.md) - Stage 0A 实施提案

---

## Stage 1A：字段模式确认与修正层

### 1A.1 目标

建立用户可确认、可修正的字段推断系统，支持通用指标方向，使教育逻辑保留为可选模板而非通用核心默认规则。

### 1A.2 用户价值

- 用户可以看到系统对每个字段的推断结果（数据类型、分析角色、指标方向）
- 用户可以手动修正推断错误的字段
- 用户可以忽略不需要的字段
- 推断结果可以保存，下次自动应用
- 指标方向支持 higher_is_better / lower_is_better / neutral / unspecified
- neutral 或 unspecified 方向不生成评价性结论

### 1A.3 当前问题

1. **字段分类无用户确认**：系统自动分类，用户无法修正
2. **指标方向硬编码**：rank 字段默认 lower-is-better，其他默认 higher-is-better
3. **教育逻辑作为默认规则**：字段分类、维度识别、主键识别都偏向教育
4. **无 neutral/unspecified 方向**：无法处理"无方向性"的指标

### 1A.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 1A.4.1 建立字段推断结果数据结构 | `src/types.ts` | 小 | 低 |
| 1A.4.2 实现字段推断结果生成（数据类型、分析角色、指标方向、推断依据、置信度） | `src/engine/fieldInference.ts` (新增) | 中 | 低 |
| 1A.4.3 实现字段模式确认 UI（推断结果展示、手动修正、忽略字段、保存确认） | `src/components/FieldPatternConfirm.tsx` (新增) | 大 | 中 |
| 1A.4.4 扩展指标方向支持 neutral / unspecified | `src/engine/metricLayer.ts`, `src/engine/types.ts` | 小 | 低 |
| 1A.4.5 neutral/unspecified 方向不生成评价性结论 | `src/engine/analysisEngine.ts`, `src/utils/analysisExplainer.ts` | 小 | 低 |
| 1A.4.6 禁止自动分类覆盖用户设置 | `src/hooks/useParsedTable.ts` | 小 | 低 |
| 1A.4.7 保存用户确认结果（localStorage） | `src/hooks/useFieldPatternConfirm.ts` (新增) | 小 | 低 |
| 1A.4.8 教育逻辑保留为可选模板 | `src/utils/tableParser/fieldClassifier.ts` | 中 | 中 |

### 1A.5 涉及模块

- `src/types.ts` - 字段推断结果类型
- `src/engine/fieldInference.ts` - 字段推断引擎
- `src/engine/metricLayer.ts` - 指标方向扩展
- `src/engine/types.ts` - 指标方向类型扩展
- `src/engine/analysisEngine.ts` - neutral/unspecified 方向处理
- `src/components/FieldPatternConfirm.tsx` - 字段模式确认 UI
- `src/hooks/useFieldPatternConfirm.ts` - 确认结果保存
- `src/utils/tableParser/fieldClassifier.ts` - 教育模板化

### 1A.6 前置条件

- Stage 0A 完成（数据量状态统一后，字段推断才能基于正确的数据集）

### 1A.7 风险

- 字段推断 UI 设计需要用户测试
- 教育模板化可能影响现有教育数据分析
- 需要保持向后兼容

### 1A.8 验收标准

- [ ] 字段推断结果包含：数据类型、分析角色、指标方向、推断依据、置信度
- [ ] 用户可以手动修正字段的数据类型、分析角色、指标方向
- [ ] 用户可以忽略不需要的字段
- [ ] 用户确认结果可以保存，下次自动应用
- [ ] 自动分类不覆盖用户已确认的设置
- [ ] 指标方向支持 higher_is_better / lower_is_better / neutral / unspecified
- [ ] neutral 或 unspecified 方向不生成优势、弱势、好坏等评价性结论
- [ ] 教育逻辑保留为可选模板，不作为通用核心默认规则
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过

### 1A.9 不在该阶段处理的内容

- 字段分类器完全重构（Stage 1 处理）
- 数据清洗能力
- Excel 导出
- 高级统计功能

### 1A.10 工作量等级

**大** - 涉及新增 UI 组件、推断引擎、类型扩展

---

## Stage 0：可靠性基线

### 0.1 目标

修复所有会导致崩溃、错误结果、数据被静默截断或状态污染的问题，建立可靠的基线版本。

### 0.2 用户价值

- 用户不会遇到静默的数据截断
- 分析结果始终可信
- 异常数值不会导致界面崩溃

### 0.3 当前问题

1. **5000 行截断提示不够清晰**：用户可能误以为全部数据参与了分析
2. **中低风险 `.toFixed()` 调用**：17 处残留，部分可能在边界条件下崩溃
3. **废弃代码未清理**：`analyticsEngine.ts` 已标记 @deprecated 但未删除

### 0.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 0.4.1 优化 5000 行截断提示 | `src/hooks/useParsedTable.ts`, `src/engine/analysisEngine.ts` | 小 | 低 |
| 0.4.2 清理中风险 `.toFixed()` | `src/components/DebugPanel.tsx`, `OutlierPanel.tsx`, `RelationshipAnalysisPanel.tsx`, `ParseReportPanel.tsx`, `src/components/charts/GroupBarChart.tsx` | 小 | 低 |
| 0.4.3 删除废弃的 `analyticsEngine.ts` | `src/engine/analyticsEngine.ts` 及其引用 | 小 | 低 |
| 0.4.4 清理 src 目录下的测试 Excel 文件 | `src/*.xlsx` | 小 | 低 |

### 0.5 涉及模块

- `src/hooks/useParsedTable.ts`
- `src/engine/analysisEngine.ts`
- `src/components/` (多个组件)
- `src/engine/analyticsEngine.ts`

### 0.6 前置条件

无。

### 0.7 风险

- 0.4.3 删除废弃代码前需确认无其他模块引用
- 整体风险低

### 0.8 验收标准

- [ ] 5000 行截断时，用户在解析报告和数据概览中都能看到明确提示
- [ ] 所有用户可见的 `.toFixed()` 调用都已替换为安全函数
- [ ] `analyticsEngine.ts` 已删除，项目正常构建
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过
- [ ] 全部已有测试通过

### 0.9 不在该阶段处理的内容

- 低风险 `.toFixed()` 调用（工具函数和引擎内部）
- UI 风格调整
- 新功能开发

### 0.10 工作量等级

**小** - 预计 1-2 个开发会话

---

## Stage 1：真正通用化

### 1.1 目标

消除教育成绩业务对通用分析模式的污染，建立通用字段类型系统、指标方向配置、分析上下文和用户确认机制。

### 1.2 用户价值

- 销售、财务、实验、问卷、运营数据都能被正确识别和分类
- 用户不再看到与自身数据无关的教育术语
- 指标方向可以由用户自定义，不再硬编码

### 1.3 当前问题

1. **字段分类系统教育偏向**：`fieldClassifier.ts` 包含 90 个教育关键词，非教育数据被错误分类
2. **字段类型定义教育偏向**：`types.ts` 中 `FieldType` 包含 `score`、`bonus`、`penalty` 等教育专用类型
3. **分析角色教育偏向**：`AnalysisRole` 包含 `primaryTotal`、`courseScore`、`adjustment` 等教育专用角色
4. **指标方向硬编码**：`metricLayer.ts` 中 rank 字段默认 `lower-is-better`
5. **维度关键词教育偏向**：`metricLayer.ts` 维度关键词偏向教育
6. **主键识别教育偏向**：`metricLayer.ts` 主键识别偏向教育
7. **字段推荐教育偏向**：`useParsedTable.ts` 推荐字段偏向教育
8. **导出文本教育偏向**：`exportAnalysis.ts` 导出文本包含"越高越好/越低越好"

### 1.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 1.4.1 建立通用字段类型系统 | `src/utils/tableParser/types.ts`, `src/engine/types.ts` | 中 | 中 |
| 1.4.2 重构字段分类器为通用分类器 | `src/utils/tableParser/fieldClassifier.ts` | 大 | 中 |
| 1.4.3 重构内容分析器 | `src/utils/tableParser/contentAnalyzer.ts` | 中 | 中 |
| 1.4.4 重构语义层为通用语义层 | `src/engine/metricLayer.ts` | 中 | 中 |
| 1.4.5 添加指标方向用户配置 | `src/engine/metricLayer.ts`, `src/components/` | 中 | 低 |
| 1.4.6 重构字段推荐逻辑 | `src/hooks/useParsedTable.ts` | 中 | 中 |
| 1.4.7 清理导出文本中的教育术语 | `src/engine/exportAnalysis.ts` | 小 | 低 |
| 1.4.8 更新解析报告为通用报告 | `src/utils/tableParser/parseReportBuilder.ts`, `src/components/ParseReportPanel.tsx` | 中 | 中 |
| 1.4.9 更新示例数据推荐逻辑 | `src/data/sampleDatasets.ts`, `src/components/SampleDataSelector.tsx` | 小 | 低 |
| 1.4.10 全面审查界面文案 | 多个组件 | 小 | 低 |

### 1.5 涉及模块

- `src/utils/tableParser/` (字段分类、内容分析、类型定义、解析报告)
- `src/engine/` (语义层、导出)
- `src/hooks/` (解析表 hook)
- `src/components/` (解析报告面板、界面文案)
- `src/data/` (示例数据)

### 1.6 前置条件

- Stage 0 完成

### 1.7 风险

- 字段分类器重构影响整个解析链路，需要充分测试
- 类型定义变更可能导致多处类型错误
- 需要保持向后兼容，不能破坏现有教育数据的分析能力

### 1.8 验收标准

- [ ] 通用字段类型系统建立，支持 numeric、currency、percentage、date、category、identifier、text、boolean
- [ ] 字段分类器不再硬编码教育关键词，改为可配置的关键词规则
- [ ] 教育关键词作为"教育模板"保留，但不污染通用分类逻辑
- [ ] 指标方向可由用户自定义
- [ ] 维度识别支持通用维度（地区、产品线、客户类型等）
- [ ] 字段推荐基于通用规则（数值比例、唯一值数量、数据分布）
- [ ] 导出文本不包含教育专用术语
- [ ] 6 类场景（成绩、销售、问卷、实验、财务、运营）的示例数据都能被正确分类
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过
- [ ] 全部已有测试通过

### 1.9 不在该阶段处理的内容

- 数据清洗（缺失值、重复值处理）
- 日期分析能力
- Excel 导出
- 高级统计功能

### 1.10 工作量等级

**大** - 预计 5-8 个开发会话

---

## Stage 2：基础数据处理能力

### 2.1 目标

补齐类型修正、缺失值处理、重复值处理、日期分析、分类字段分析、派生字段和数据清洗预览等能力。

### 2.2 用户价值

- 用户可以修正自动识别错误的字段类型
- 用户可以查看和处理缺失值
- 用户可以检测和处理重复行
- 日期字段可以进行时间序列分析
- 分类字段可以进行频率统计和交叉分析
- 用户可以创建派生字段（如"利润率 = 利润 / 收入"）

### 2.3 当前问题

1. **无字段类型修正**：用户无法修正自动识别错误的字段类型
2. **缺失值处理不足**：仅自动过滤，无缺失值统计和处理策略
3. **重复值未处理**：表头去重，但数据行重复未检测
4. **日期分析缺失**：支持日期识别，但无时间序列分析
5. **分类字段分析不足**：缺少频率统计、交叉分析
6. **无派生字段**：用户无法创建计算字段

### 2.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 2.4.1 字段类型修正 UI | `src/components/FieldTypeEditor.tsx` (新增) | 中 | 低 |
| 2.4.2 缺失值统计和预览 | `src/components/MissingValuePanel.tsx` (新增) | 中 | 低 |
| 2.4.3 重复行检测和预览 | `src/components/DuplicateRowPanel.tsx` (新增) | 中 | 低 |
| 2.4.4 日期字段时间序列分析 | `src/engine/temporalAnalyzer.ts` (新增) | 大 | 中 |
| 2.4.5 分类字段频率统计 | `src/engine/categoryAnalyzer.ts` (新增) | 中 | 低 |
| 2.4.6 派生字段（计算字段） | `src/engine/derivedField.ts` (新增), `src/components/DerivedFieldEditor.tsx` (新增) | 大 | 中 |
| 2.4.7 数据清洗预览和确认 | `src/components/DataCleaningPreview.tsx` (新增) | 中 | 低 |

### 2.5 涉及模块

- 新增多个组件和引擎模块
- `src/hooks/` (新增数据处理 hooks)

### 2.6 前置条件

- Stage 1 完成（通用字段类型系统建立后，才能正确支持日期、分类等类型）

### 2.7 风险

- 派生字段涉及表达式解析，需要安全沙箱
- 时间序列分析算法复杂
- 整体风险中等

### 2.8 验收标准

- [ ] 用户可以手动修正字段类型
- [ ] 缺失值统计准确，用户可以选择处理策略（删除、填充、忽略）
- [ ] 重复行检测准确，用户可以选择去重策略
- [ ] 日期字段支持时间序列分析（趋势、季节性）
- [ ] 分类字段支持频率统计和交叉分析
- [ ] 用户可以创建派生字段
- [ ] 数据清洗操作前可以预览影响
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过

### 2.9 不在该阶段处理的内容

- Excel 导出
- 多文件合并
- 高级统计功能

### 2.10 工作量等级

**大** - 预计 8-12 个开发会话

---

## Stage 3：通用分析工作流

### 3.1 目标

完善单变量、分组、关系、筛选、异常值和结果解释之间的统一流程，提供一致的分析体验。

### 3.2 用户价值

- 分析流程更加连贯和直观
- 结果解释更加清晰和通用
- 筛选状态在整个分析流程中一致
- 用户清楚当前分析基于原始数据还是筛选后数据

### 3.3 当前问题

1. **分析流程碎片化**：单变量、分组、关系分析之间缺乏连贯性
2. **结果解释不足**：统计指标缺乏业务解释
3. **筛选状态不透明**：用户不清楚当前分析基于原始数据还是筛选后数据
4. **异常值处理与分析脱节**：异常值检测结果未充分融入分析流程

### 3.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 3.4.1 统一分析工作流 UI | `src/components/AnalysisWorkflow.tsx` (新增) | 大 | 中 |
| 3.4.2 增强结果解释 | `src/utils/analysisExplainer.ts` | 中 | 低 |
| 3.4.3 筛选状态可视化 | `src/components/FilterStatus.tsx` (新增) | 中 | 低 |
| 3.4.4 异常值处理融入分析流程 | `src/components/OutlierPanel.tsx` | 中 | 低 |
| 3.4.5 分析上下文提示 | `src/components/AnalysisContextHint.tsx` | 小 | 低 |

### 3.5 涉及模块

- `src/components/` (多个组件)
- `src/utils/analysisExplainer.ts`
- `src/hooks/` (分析编排器)

### 3.6 前置条件

- Stage 2 完成

### 3.7 风险

- 工作流 UI 设计需要用户测试
- 整体风险中等

### 3.8 验收标准

- [ ] 分析流程连贯，用户可以从单变量分析自然过渡到分组和关系分析
- [ ] 结果解释包含业务含义，不仅仅是统计数字
- [ ] 筛选状态在界面中清晰可见
- [ ] 异常值检测结果可以一键应用到筛选
- [ ] 用户清楚当前分析基于原始数据还是筛选后数据
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过

### 3.9 不在该阶段处理的内容

- Excel 导出
- 多文件合并
- 高级统计功能

### 3.10 工作量等级

**大** - 预计 6-10 个开发会话

---

## Stage 4：导出与复用

### 4.1 目标

实现 Excel 导出、分析配置保存、模板、报告或结果复用。

### 4.2 用户价值

- 用户可以导出带格式的 Excel 文件
- 用户可以保存和恢复分析配置
- 用户可以创建和使用分析模板
- 分析结果可以复用

### 4.3 当前问题

1. **仅支持 CSV 导出**：不支持 Excel 导出
2. **分析配置无法保存**：每次需要重新配置
3. **无模板功能**：无法复用分析配置
4. **分析结果无法导出**：只能导出原始数据

### 4.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 4.4.1 Excel 导出（使用现有 xlsx 库） | `src/engine/exportAnalysis.ts` | 中 | 低 |
| 4.4.2 分析配置保存和加载 | `src/hooks/useAnalysisConfig.ts` (新增) | 中 | 低 |
| 4.4.3 分析模板功能 | `src/components/AnalysisTemplate.tsx` (新增) | 中 | 低 |
| 4.4.4 分析结果导出（统计摘要、图表） | `src/engine/exportAnalysis.ts` | 中 | 低 |

### 4.5 涉及模块

- `src/engine/exportAnalysis.ts`
- `src/hooks/` (新增配置管理 hook)
- `src/components/` (新增模板组件)

### 4.6 前置条件

- Stage 2 完成（基础数据处理能力就绪后，导出才有意义）

### 4.7 风险

- Excel 导出需要处理格式、样式，工作量可能超出预期
- 整体风险低

### 4.8 验收标准

- [ ] 可以导出带格式的 Excel 文件（多工作表、表头加粗、数字格式）
- [ ] 分析配置可以保存和加载
- [ ] 可以创建和使用分析模板
- [ ] 分析结果（统计摘要、图表）可以导出
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过

### 4.9 不在该阶段处理的内容

- PDF 导出
- 多文件合并
- 高级统计功能

### 4.10 工作量等级

**中** - 预计 4-6 个开发会话

---

## Stage 5：高级能力

### 5.1 目标

实现多文件合并、透视分析、统计推断、大数据性能和其他高级功能。

### 5.2 用户价值

- 用户可以合并多个文件进行分析
- 用户可以进行透视表分析
- 用户可以进行统计推断（假设检验）
- 大数据量分析流畅

### 5.3 当前问题

1. **不支持多文件合并**
2. **不支持透视表**
3. **不支持假设检验**
4. **大数据量可能卡顿**

### 5.4 具体任务

| 任务 | 涉及文件 | 工作量 | 风险 |
|------|---------|--------|------|
| 5.4.1 多文件合并 | `src/utils/fileMerger.ts` (新增), `src/components/FileMerger.tsx` (新增) | 大 | 中 |
| 5.4.2 透视表分析 | `src/engine/pivotTable.ts` (新增), `src/components/PivotTable.tsx` (新增) | 大 | 中 |
| 5.4.3 假设检验框架 | `src/engine/hypothesisTest.ts` (新增), `src/components/HypothesisTestPanel.tsx` (新增) | 大 | 中 |
| 5.4.4 大数据性能优化 | `src/engine/`, `src/components/charts/` | 大 | 中 |

### 5.5 涉及模块

- 新增多个引擎和组件模块
- 现有引擎和图表模块优化

### 5.6 前置条件

- Stage 3 完成（通用分析工作流就绪）
- Stage 4 完成（导出和复用能力就绪）

### 5.7 风险

- 假设检验需要统计专家指导，用户误用风险高
- 大数据性能优化可能改变现有行为
- 整体风险中-高

### 5.8 验收标准

- [ ] 可以合并多个文件，支持字段映射和去重
- [ ] 透视表支持多维度、多聚合函数
- [ ] 假设检验包含前提条件检查和用户指导
- [ ] 10000 行数据流畅处理
- [ ] `tsc --noEmit` 通过
- [ ] `vite build` 通过

### 5.9 不在该阶段处理的内容

- 自然语言查询
- 协作功能
- 后端服务

### 5.10 工作量等级

**大** - 预计 15-20 个开发会话

---

## 路线图依赖关系

```
Stage 0 (可靠性基线)
    ↓
Stage 1 (真正通用化)
    ↓
Stage 2 (基础数据处理能力)
    ↓
    ├── Stage 3 (通用分析工作流)
    │       ↓
    │   Stage 5 (高级能力)
    │
    └── Stage 4 (导出与复用)
            ↓
        Stage 5 (高级能力)
```

**关键路径**: Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 5

---

## 风险矩阵

| Stage | 技术风险 | 业务风险 | 回滚难度 |
|-------|---------|---------|---------|
| Stage 0 | 低 | 低 | 低 |
| Stage 1 | 中 | 中 | 中 |
| Stage 2 | 中 | 低 | 低 |
| Stage 3 | 中 | 低 | 低 |
| Stage 4 | 低 | 低 | 低 |
| Stage 5 | 中-高 | 中 | 中 |

---

## 不在路线图中处理的内容

以下内容明确不在当前路线图中处理：

1. **PDF 导出** - 优先级低于基础数据分析能力，仅在用户明确需求时实现
2. **自然语言查询** - 涉及隐私、费用、网络依赖等问题，不列入近期开发范围
3. **协作功能** - 需要后端支持，不在当前纯前端架构范围内
4. **用户系统** - 无用户认证和权限管理需求
5. **后端服务** - 保持纯前端架构，所有数据处理在浏览器本地完成

---

**路线图制定完成时间**: 2026-07-20  
**路线图制定人员**: AI Assistant  
**路线图状态**: ✅ 完成，待产品负责人确认
