# 数据量管道审计报告

**审计日期**: 2026-07-21  
**审计范围**: 文件上传、文本粘贴、Sheet切换的完整数据流  
**审计目标**: 识别所有截断位置、警告生成/覆盖风险、状态管理问题

---

## 一、文件上传调用链

### 1.1 完整调用链

```
用户选择文件
  ↓
App.tsx: handleFileUpload() (第321行)
  ↓
setIsParsing(true)
  ↓
parseTableFile(file) [src/utils/fileImport.ts:11]
  ↓
FileReader.readAsArrayBuffer()
  ↓
parseWorkbook(arrayBuffer, fileName, targetSheetName) [src/utils/tableParser/workbook.ts:29]
  ↓
parseXlsxInWorker(arrayBuffer) [Worker线程解析]
  ↓
Worker返回 rawSheets (完整数据，无行数限制)
  ↓
workbook.ts: 限制列数 MAX_COLS=200 (第48行)
  ↓
detectMainWorksheet(sheetsData) [自动选择主Sheet]
  ↓
parseSheetData(sheetName, rawData, merges, candidates) (第82行)
  ↓
【截断点1】rawData.slice(0, MAX_ROWS) (第100行, MAX_ROWS=20000)
  ↓
detectHeaderRow(trimmedData, merges) [表头识别]
  ↓
dedupeHeaders(detection.headers, warnings) [表头清洗]
  ↓
构建 rawRows: Record<string, string>[] (第118-126行)
  ↓
classifyFields(headers, rawRows) [字段分类]
  ↓
classifyDataRows(rawRows, headers) [行分类]
  ↓
返回 ParsedTableResult
  ↓
fileImport.ts: 构建 ParsedFileResult (第39-48行)
  - 添加 reparseSheet 闭包
  ↓
App.tsx: setParsedData(result) (第340行)
  ↓
App.tsx: setParseWarnings(result.warnings || []) (第341行)
  ↓
【警告生成1】如果 result.rows.length > 5000 (第345行)
  - 追加5000行截断警告到 parseWarnings
  ↓
App.tsx: setParseSummary(result.summary) (第353行)
  ↓
App.tsx: setAvailableSheets(result.availableSheets) (第359行)
  ↓
【关键操作】App.tsx: setRawText(text) (第362行)
  - 将解析结果转为TSV文本
  - 触发 useParsedTable 的 useEffect([rawText])
  ↓
useParsedTable.ts: useEffect([rawText]) (第91-99行)
  ↓
【二次解析】parseTableText(rawText) (第94行)
  ↓
setParsedData(result) (第95行) - 覆盖文件上传结果
  ↓
setParseWarnings(result.warnings || []) (第96行) - 覆盖警告
```

### 1.2 问题分析

**问题1: 二次解析覆盖**
- 文件上传后，`setRawText(text)` 触发 `useEffect([rawText])`
- `useEffect` 调用 `parseTableText(rawText)` 重新解析
- 重新解析会覆盖 `parsedData` 和 `parseWarnings`
- **风险**: 文件上传时生成的5000行警告被覆盖丢失

**问题2: 20000行截断无警告**
- `workbook.ts` 第100行执行 `rawData.slice(0, MAX_ROWS)`
- 未保存原始总行数 `rawData.length`
- 未生成任何警告提示用户数据被截断
- **风险**: 用户不知道文件超过20000行时数据已丢失

**问题3: reparseSheet 闭包捕获**
- `fileImport.ts` 第45-47行创建 `reparseSheet` 闭包
- 闭包捕获原始 `file` 对象
- 二次解析后，`parsedData` 被覆盖为 `ParsedTable` 类型
- `reparseSheet` 方法可能丢失（类型不匹配）

---

## 二、粘贴数据调用链

### 2.1 完整调用链

```
用户粘贴文本到 textarea
  ↓
App.tsx: onChange → setRawText(e.target.value) (第444行)
  ↓
useParsedTable.ts: useEffect([rawText]) (第91-99行)
  ↓
parseTableText(rawText) [src/utils/parseTable.ts:11]
  ↓
detectDelimiter(lines[0]) [检测分隔符]
  ↓
splitLine(line, delimiter) [分割每行]
  ↓
parseRowsToTable(rows) [src/utils/tableParser/index.ts:97]
  ↓
parseRawRows(rawRows) [src/utils/tableParser/workbook.ts:188]
  ↓
【无20000行限制】parseRawRows 不执行行数截断
  ↓
detectHeaderRow(trimmed) [表头识别]
  ↓
dedupeHeaders(detection.headers, warnings) [表头清洗]
  ↓
构建 rawRows: Record<string, string>[] (第211-219行)
  ↓
classifyFields(headers, rawRowsObj) [字段分类]
  ↓
classifyDataRows(rawRowsObj, headers) [行分类]
  ↓
返回 ParsedTableResult
  ↓
parseRowsToTable 转换为 ParsedTable (第99-103行)
  ↓
useParsedTable.ts: setParsedData(result) (第95行)
  ↓
useParsedTable.ts: setParseWarnings(result.warnings || []) (第96行)
  ↓
【无5000行警告】粘贴数据不会触发5000行警告
```

### 2.2 问题分析

**问题1: 粘贴数据无行数限制**
- `parseRawRows` 不执行20000行截断
- 大量粘贴数据可能导致浏览器卡顿
- 但不会丢失数据（全量解析）

**问题2: 粘贴数据无5000行警告**
- 粘贴超过5000行时，不会生成警告
- 但后续分析模块会独立截断到5000行
- **风险**: 用户不知道分析结果只基于部分数据

---

## 三、Sheet切换调用链

### 3.1 完整调用链

```
用户点击Sheet按钮
  ↓
App.tsx: handleSheetChange(sheetName) (第375行)
  ↓
setSelectedSheet(sheetName) (第376行)
  ↓
检查 parsedData.reparseSheet 是否存在 (第379行)
  ↓
【如果存在】调用 reparseSheet(sheetName) (第380行)
  ↓
fileImport.ts: reparseSheet 闭包 (第45-47行)
  ↓
parseTableFile(file, sheetName) [重新解析整个文件]
  ↓
parseWorkbook(arrayBuffer, fileName, targetSheetName)
  ↓
【截断点2】rawData.slice(0, MAX_ROWS) [新Sheet也受20000行限制]
  ↓
返回新Sheet的 ParsedTableResult
  ↓
App.tsx: setParsedData(result) (第382行)
  ↓
App.tsx: setParseWarnings(result.warnings || []) (第383行)
  ↓
【警告生成2】如果 result.rows.length > 5000 (第345行逻辑缺失)
  - Sheet切换路径未检查5000行警告
  ↓
App.tsx: setParseSummary(result.summary) (第386行)
  ↓
App.tsx: setRawText(text) (第392行)
  ↓
useParsedTable.ts: useEffect([rawText]) (第91-99行)
  ↓
【二次解析】parseTableText(rawText) (第94行)
  ↓
setParsedData(result) (第95行) - 再次覆盖
  ↓
setParseWarnings(result.warnings || []) (第96行) - 再次覆盖
```

### 3.2 问题分析

**问题1: Sheet切换后5000行警告缺失**
- `handleSheetChange` 未检查 `result.rows.length > 5000`
- 切换到超过5000行的Sheet时，不会生成警告
- **风险**: 用户不知道分析结果只基于部分数据

**问题2: Sheet切换后二次解析**
- `setRawText(text)` 触发 `useEffect([rawText])`
- 二次解析覆盖 `parsedData` 和 `parseWarnings`
- **风险**: reparseSheet 返回的结果被覆盖

**问题3: reparseSheet 可能丢失**
- 二次解析后，`parsedData` 变为 `ParsedTable` 类型
- `ParsedTable` 不包含 `reparseSheet` 方法
- **风险**: 连续切换Sheet时，`reparseSheet` 可能不存在

---

## 四、所有截断位置

### 4.1 解析阶段截断（20000行）

| 位置 | 文件 | 行号 | 截断逻辑 | 是否生成警告 | 是否保存原始行数 |
|------|------|------|---------|------------|----------------|
| 1 | workbook.ts | 100 | `rawData.slice(0, MAX_ROWS)` | ❌ 否 | ❌ 否 |

**影响**:
- Excel文件超过20000行时，数据被静默截断
- 用户无法得知真实总行数
- 无法区分"原始20000行"和"实际20000行"

### 4.2 分析阶段截断（5000行）

| 位置 | 文件 | 行号 | 截断逻辑 | 是否生成警告 | 是否统一入口 |
|------|------|------|---------|------------|------------|
| 2 | analysisEngine.ts | 48 | `rows.slice(0, truncatedRows)` | ❌ 否 | ✅ 是（extractFieldValues） |
| 3 | correlationAnalyzer.ts | 194 | `rows.slice(0, MAX_ROWS)` | ❌ 否 | ❌ 否（独立截断） |
| 4 | groupByDimension.ts | 139 | `rows.slice(0, MAX_ROWS)` | ❌ 否 | ❌ 否（独立截断） |
| 5 | GeneralDataOverview.tsx | 35 | `rows.slice(0, MAX_ROWS)` | ✅ 是（组件内警告） | ❌ 否（独立截断） |

**影响**:
- 4个模块独立执行5000行截断
- 截断逻辑分散，难以统一控制
- 无法保证所有分析使用同一批数据

---

## 五、所有警告生成和覆盖位置

### 5.1 警告生成位置

| 位置 | 文件 | 行号 | 警告内容 | 触发条件 |
|------|------|------|---------|---------|
| 1 | App.tsx | 346-349 | "当前数据量较大（N行），为避免卡顿，所有分析结果仅基于前5000行数据计算" | `result.rows.length > 5000` |
| 2 | GeneralDataOverview.tsx | 98-100 | "数据量较大（N行），仅展示前5000行的分析结果" | `totalRows > MAX_ROWS` |

### 5.2 警告覆盖位置

| 位置 | 文件 | 行号 | 覆盖逻辑 | 覆盖原因 |
|------|------|------|---------|---------|
| 1 | useParsedTable.ts | 96 | `setParseWarnings(result.warnings \|\| [])` | `useEffect([rawText])` 自动重解析 |
| 2 | App.tsx | 341 | `setParseWarnings(result.warnings \|\| [])` | 文件上传完成后设置 |
| 3 | App.tsx | 383 | `setParseWarnings(result.warnings \|\| [])` | Sheet切换完成后设置 |

**覆盖链**:
```
文件上传 → setParseWarnings(包含5000行警告)
  ↓
setRawText(text)
  ↓
useEffect([rawText]) 触发
  ↓
parseTableText(rawText)
  ↓
setParseWarnings(result.warnings) - 覆盖！5000行警告丢失
```

---

## 六、parsedData 被写入的所有位置

| 位置 | 文件 | 行号 | 写入方式 | 触发条件 |
|------|------|------|---------|---------|
| 1 | useParsedTable.ts | 95 | `setParsedData(result)` | `useEffect([rawText])` 自动重解析 |
| 2 | useParsedTable.ts | 105 | `setParsedData(null)` | 手动解析失败 |
| 3 | useParsedTable.ts | 110 | `setParsedData(result)` | 手动解析成功 |
| 4 | useParsedTable.ts | 137 | `setParsedData(result)` | 文件上传成功 |
| 5 | useParsedTable.ts | 160 | `setParsedData(null)` | 文件上传失败 |
| 6 | useParsedTable.ts | 174 | `setParsedData(result)` | Sheet切换成功 |
| 7 | App.tsx | 224 | `setParsedData(null)` | 手动解析失败 |
| 8 | App.tsx | 229 | `setParsedData(result)` | 手动解析成功 |
| 9 | App.tsx | 267 | `setParsedData(result)` | 恢复默认设置 |
| 10 | App.tsx | 270 | `setParsedData(null)` | 恢复默认设置失败 |
| 11 | App.tsx | 280 | `setParsedData(null)` | 清空数据 |
| 12 | App.tsx | 314 | `setParsedData(result)` | 加载示例数据 |
| 13 | App.tsx | 340 | `setParsedData(result)` | 文件上传成功 |
| 14 | App.tsx | 367 | `setParsedData(null)` | 文件上传失败 |
| 15 | App.tsx | 382 | `setParsedData(result)` | Sheet切换成功 |

**问题**: 15处写入点，分散在两个文件，难以追踪数据流

---

## 七、parseWarnings 被写入的所有位置

| 位置 | 文件 | 行号 | 写入方式 | 触发条件 |
|------|------|------|---------|---------|
| 1 | useParsedTable.ts | 96 | `setParseWarnings(result.warnings \|\| [])` | `useEffect([rawText])` 自动重解析 |
| 2 | useParsedTable.ts | 131 | `setParseWarnings(['文件较大...'])` | 文件大于5MB时延迟显示 |
| 3 | useParsedTable.ts | 138 | `setParseWarnings(result.warnings \|\| [])` | 文件上传成功 |
| 4 | useParsedTable.ts | 143-146 | `setParseWarnings([...result.warnings, '5000行警告'])` | 文件上传且行数>5000 |
| 5 | useParsedTable.ts | 161 | `setParseWarnings([])` | 文件上传失败 |
| 6 | useParsedTable.ts | 175 | `setParseWarnings(result.warnings \|\| [])` | Sheet切换成功 |
| 7 | App.tsx | 230 | `setParseWarnings(result.warnings \|\| [])` | 手动解析成功 |
| 8 | App.tsx | 268 | `setParseWarnings(result.warnings \|\| [])` | 恢复默认设置 |
| 9 | App.tsx | 280 | `setParseWarnings([])` | 清空数据 |
| 10 | App.tsx | 315 | `setParseWarnings(result.warnings \|\| [])` | 加载示例数据 |
| 11 | App.tsx | 334 | `setParseWarnings(['文件较大...'])` | 文件大于5MB时延迟显示 |
| 12 | App.tsx | 341 | `setParseWarnings(result.warnings \|\| [])` | 文件上传成功 |
| 13 | App.tsx | 346-349 | `setParseWarnings([...result.warnings, '5000行警告'])` | 文件上传且行数>5000 |
| 14 | App.tsx | 368 | `setParseWarnings([])` | 文件上传失败 |
| 15 | App.tsx | 383 | `setParseWarnings(result.warnings \|\| [])` | Sheet切换成功 |

**问题**: 15处写入点，存在重复逻辑（App.tsx 和 useParsedTable.ts 都有文件上传处理）

---

## 八、rawText 自动解析触发链

### 8.1 触发链

```
rawText 变化
  ↓
useParsedTable.ts: useEffect([rawText]) (第91行)
  ↓
检查 rawText.trim() 是否非空 (第92行)
  ↓
parseTableText(rawText) (第94行)
  ↓
setParsedData(result) (第95行)
  ↓
setParseWarnings(result.warnings || []) (第96行)
  ↓
setParseError(null) (第97行)
```

### 8.2 触发场景

| 场景 | 触发位置 | 是否预期 | 风险 |
|------|---------|---------|------|
| 用户粘贴数据 | App.tsx:444 → setRawText | ✅ 预期 | 无 |
| 文件上传完成 | App.tsx:362 → setRawText | ❌ 非预期 | 二次解析覆盖警告 |
| Sheet切换完成 | App.tsx:392 → setRawText | ❌ 非预期 | 二次解析覆盖警告 |
| 加载示例数据 | App.tsx:311 → setRawText | ❌ 非预期 | 二次解析覆盖结果 |
| 恢复默认设置 | App.tsx:257 → setRawText | ❌ 非预期 | 二次解析覆盖结果 |

**问题**: `useEffect([rawText])` 在所有场景下都会触发，导致重复解析和状态覆盖

---

## 九、已确认问题

### 9.1 20000行解析截断问题

**问题描述**:
- `workbook.ts` 第100行执行 `rawData.slice(0, MAX_ROWS)`
- 未保存原始总行数 `rawData.length`
- 未生成任何警告提示用户数据被截断
- 用户无法区分"原始20000行"和"实际20000行"

**影响范围**:
- 所有Excel文件上传
- 所有Sheet切换操作

**修复优先级**: 🔴 高

### 9.2 5000行警告被覆盖问题

**问题描述**:
- 文件上传后，`setRawText(text)` 触发 `useEffect([rawText])`
- `useEffect` 调用 `parseTableText(rawText)` 重新解析
- 重新解析覆盖 `parseWarnings`，导致5000行警告丢失
- Sheet切换路径也存在同样问题

**影响范围**:
- 文件上传超过5000行时
- Sheet切换超过5000行时

**修复优先级**: 🔴 高

### 9.3 分析样本不一致问题

**问题描述**:
- 4个模块独立执行5000行截断:
  - analysisEngine.ts (extractFieldValues)
  - correlationAnalyzer.ts
  - groupByDimension.ts
  - GeneralDataOverview.tsx
- 无法保证所有分析使用同一批数据
- 可能导致统计结果不一致

**影响范围**:
- 所有超过5000行的数据分析

**修复优先级**: 🟡 中

### 9.4 reparseSheet 丢失风险

**问题描述**:
- 文件上传后，`parsedData` 包含 `reparseSheet` 方法
- `setRawText(text)` 触发二次解析
- 二次解析返回 `ParsedTable` 类型，不包含 `reparseSheet`
- 连续切换Sheet时，`reparseSheet` 可能不存在

**影响范围**:
- 多Sheet文件的Sheet切换操作

**修复优先级**: 🟡 中

### 9.5 职责重复问题

**问题描述**:
- App.tsx 和 useParsedTable.ts 都包含文件上传、Sheet切换逻辑
- 存在重复的 `setParseWarnings` 调用
- 代码难以维护

**影响范围**:
- 代码可维护性

**修复优先级**: 🟢 低

---

## 十、尚需动态验证的问题

### 10.1 二次解析后 reparseSheet 是否丢失

**验证方法**:
1. 上传多Sheet Excel文件
2. 在浏览器控制台执行: `console.log(parsedData.reparseSheet)`
3. 检查是否返回 `undefined`

**预期结果**:
- 如果返回 `undefined`，则确认 reparseSheet 丢失
- 如果返回函数，则说明未丢失

### 10.2 Sheet切换后5000行警告是否缺失

**验证方法**:
1. 上传多Sheet Excel文件（至少一个Sheet超过5000行）
2. 切换到超过5000行的Sheet
3. 检查是否显示5000行警告

**预期结果**:
- 如果不显示警告，则确认警告缺失

### 10.3 二次解析是否导致性能问题

**验证方法**:
1. 上传大文件（接近20000行）
2. 使用浏览器性能分析工具记录解析时间
3. 对比单次解析和二次解析的总时间

**预期结果**:
- 如果二次解析导致明显延迟，则需要优化

---

## 十一、涉及文件和函数名

### 11.1 核心文件

| 文件路径 | 关键函数 | 职责 |
|---------|---------|------|
| src/App.tsx | handleFileUpload | 文件上传处理 |
| src/App.tsx | handleSheetChange | Sheet切换处理 |
| src/hooks/useParsedTable.ts | useEffect([rawText]) | 自动重解析 |
| src/hooks/useParsedTable.ts | handleFileUpload | 文件上传处理（重复） |
| src/hooks/useParsedTable.ts | handleSheetChange | Sheet切换处理（重复） |
| src/utils/fileImport.ts | parseTableFile | 文件解析入口 |
| src/utils/tableParser/workbook.ts | parseWorkbook | 工作簿解析 |
| src/utils/tableParser/workbook.ts | parseSheetData | 工作表解析 |
| src/utils/tableParser/workbook.ts | parseRawRows | 原始行解析 |
| src/utils/parseTable.ts | parseTableText | 文本解析入口 |
| src/engine/analysisEngine.ts | extractFieldValues | 字段值提取（5000行截断） |
| src/engine/correlationAnalyzer.ts | extractColumnVectors | 列向量提取（5000行截断） |
| src/engine/groupByDimension.ts | groupByDimension | 分组分析（5000行截断） |
| src/components/GeneralDataOverview.tsx | computeOverview | 数据概览（5000行截断） |

### 11.2 关键常量

| 常量名 | 文件 | 值 | 用途 |
|-------|------|-----|------|
| MAX_ROWS | workbook.ts | 20000 | 解析阶段行数限制 |
| MAX_COLS | workbook.ts | 200 | 解析阶段列数限制 |
| MAX_ROWS | analysisEngine.ts | 5000 | 分析阶段行数限制 |
| MAX_ROWS | groupByDimension.ts | 5000 | 分组分析行数限制 |

### 11.3 关键类型

| 类型名 | 文件 | 用途 |
|-------|------|------|
| ParsedTable | src/types.ts | 基础解析结果 |
| ParsedTableResult | src/utils/tableParser/types.ts | 增强解析结果（含fieldMetas） |
| ParsedFileResult | src/utils/fileImport.ts | 文件解析结果（含reparseSheet） |
| ParseSummary | src/utils/tableParser/types.ts | 解析摘要 |

---

## 十二、审计结论

### 12.1 核心问题总结

1. **20000行解析截断无警告**: 用户无法得知数据被截断
2. **5000行警告被覆盖**: 文件上传和Sheet切换后警告丢失
3. **分析样本不一致**: 4个模块独立截断，无法保证数据一致性
4. **reparseSheet 丢失风险**: 二次解析后可能无法切换Sheet
5. **职责重复**: App.tsx 和 useParsedTable.ts 存在重复逻辑

### 12.2 修复建议

**Stage 0A 必须解决**:
1. 区分数据量概念（原始总行数、已读取行数、已分析行数）
2. 统一分析数据集（生成唯一的 analysisRows）
3. 超过5000行时停止自动分析，要求用户确认
4. 实现确定性抽样（固定种子的系统抽样或伪随机抽样）
5. 持久展示抽样状态（独立的 dataVolumeState）
6. 解决20000行解析截断问题（保存原始总行数、生成警告）

### 12.3 风险评估

| 问题 | 风险等级 | 影响范围 | 修复难度 |
|------|---------|---------|---------|
| 20000行截断无警告 | 🔴 高 | 所有Excel文件 | 🟡 中 |
| 5000行警告被覆盖 | 🔴 高 | 超过5000行的数据 | 🟡 中 |
| 分析样本不一致 | 🟡 中 | 超过5000行的数据 | 🟠 高 |
| reparseSheet 丢失 | 🟡 中 | 多Sheet文件 | 🟢 低 |
| 职责重复 | 🟢 低 | 代码维护性 | 🟡 中 |

---

**审计完成时间**: 2026-07-21  
**审计人员**: AI Assistant  
**审计方法**: 静态代码分析 + 调用链追踪
