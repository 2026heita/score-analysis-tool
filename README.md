# 成绩分析工具 (Score Analyzer)

一个基于浏览器的在线成绩分析工具，支持多种数据格式导入，提供全面的统计分析和可视化功能。

## 核心特性

- **多格式数据导入**: 支持 Excel 文件、CSV 文件、文本粘贴等多种数据输入方式
- **智能字段识别**: 自动识别字段类型（数值、分类、时间、标识符等）
- **全面统计分析**: 提供均值、中位数、分位数、标准差等描述性统计
- **可视化图表**: 直方图、箱线图、CDF 曲线、四分位饼图等多种图表
- **分组分析**: 支持按维度分组统计和对比分析
- **相关性分析**: 自动计算字段间相关系数
- **数据筛选**: 灵活的条件筛选功能
- **导出功能**: 支持 CSV 格式导出分析结果

## 隐私保护

### 数据本地处理

**所有数据仅在浏览器本地处理，不会上传到任何服务器。**

- 数据解析和计算完全在浏览器端完成
- 不收集、不存储、不传输任何用户数据
- 无需网络连接即可使用（首次加载后）
- 支持离线使用

### 示例数据说明

**本项目所有示例数据完全为合成数据，不包含任何真实个人信息。**

- `test-data/` 目录下的所有文件均为随机生成的合成数据
- 学生姓名、学号、学校等信息均为虚构
- 成绩数据为随机生成，不对应任何真实考试成绩
- 销售数据为模拟数据，不反映真实业务情况

### 本地数据清理

**用户可通过以下操作删除浏览器本地数据：**

1. **清空当前分析数据**:
   - 点击界面中的"清空数据"按钮
   - 或刷新页面重新加载

2. **清除浏览器存储**:
   - 打开浏览器开发者工具 (F12)
   - 进入 "Application" (应用) 或 "Storage" (存储) 标签
   - 清除 "Local Storage" (本地存储) 和 "Session Storage" (会话存储)
   - 清除 "IndexedDB" (如果存在)

3. **完全重置**:
   - 清除浏览器缓存和站点数据
   - 或使用隐私/无痕模式进行分析

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **图表库**: ECharts
- **数据处理**: 自研解析引擎
- **测试框架**: Node.js 原生测试脚本

## 项目结构

```
src/
├── engine/              # 分析引擎核心
│   ├── metricLayer.ts          # 语义层定义
│   ├── analysisEngine.ts       # 统一分析引擎
│   ├── correlationAnalyzer.ts  # 相关性分析器
│   └── exportAnalysis.ts       # 导出功能
├── components/          # React 组件
│   ├── AnalysisSection.tsx     # 分析界面
│   └── DebugPanel.tsx          # 调试面板
├── hooks/               # 自定义 Hooks
│   ├── useAnalysisOrchestrator.ts  # 分析调度器
│   └── useParsedTable.ts       # 解析状态管理
├── field-schema/        # 字段模式解析
│   └── resolveFieldSchema.ts
└── utils/               # 工具函数
    └── parseVersionControl.ts  # 异步版本控制

tests/                   # 集成测试
scripts/                 # 测试脚本
test-data/               # 合成测试数据
```

## 开发指南

### 安装依赖

```bash
npm ci
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
# TypeScript 类型检查
npx tsc --noEmit

# 集成测试
.\tests\run-integration-tests.ps1

# 分析引擎测试
npm run test:analysis-engine

# 其他测试脚本
node scripts/testSafeFormat.mjs
node scripts/testStage0A1.mjs
node scripts/testStage0A2.mjs
node scripts/testUseParsedTable.mjs
```

## 核心功能说明

### 字段类型系统

系统支持以下字段类型：

- **number**: 数值类型（可进一步分为 metric 和 dimension）
- **category**: 分类类型
- **datetime**: 日期时间类型
- **boolean**: 布尔类型
- **text**: 文本类型
- **identifier**: 标识符类型（不参与分析）
- **description**: 描述类型（不参与分析）
- **ignored**: 忽略类型（不参与分析）

### 指标方向 (Metric Direction)

- **higher-is-better**: 越高越好（如成绩、销售额）
- **lower-is-better**: 越低越好（如排名、成本）
- **neutral**: 中性指标（无优劣方向，仅展示统计分布）
- **unspecified**: 未指定方向（行为同 neutral）

**注意**: neutral 和 unspecified 方向的指标不会生成排名定位、百分位评价和优劣分析，仅提供描述性统计。

### 数据量限制

- **5000 行以下**: 直接分析
- **5001-20000 行**: 提示确认是否使用抽样分析
- **20001 行以上**: 阻止分析，提示数据量过大

## 测试覆盖

项目包含完整的测试体系：

- **10 个测试套件**，覆盖核心功能
- **226+ 个测试断言**，验证关键逻辑
- **真实源码测试**，确保测试调用实际代码而非模拟实现

主要测试文件：
- `fieldConsumer.test.ts`: 真实消费链路测试（101 断言）
- `fieldWiring.test.ts`: 字段接线测试（33 断言）
- `asyncRace.test.ts`: 异步竞争测试（31 断言）
- `acceptanceRound3.test.ts`: 验收测试（37 断言）

## 当前状态

### 已完成 (Stage 1A-1)

- ✅ 字段类型推断系统（ResolvedFieldSchema）
- ✅ 语义层适配（metricLayer 支持 ResolvedFieldSchema）
- ✅ 分析链路接线（useAnalysisOrchestrator 优先使用 fields）
- ✅ 相关性分析修复（移除 isRecommended 过滤）
- ✅ 方向语义修复（unspecified/neutral 保持原始语义）
- ✅ neutral/unspecified 用户提示和导出修复
- ✅ 类型安全修复（MetricDirection 扩展）
- ✅ 测试覆盖（101 断言验证核心逻辑）
- ✅ Git 历史清理（移除敏感文件）

### 待开发 (Stage 1A-2)

- ⏸️ 字段确认 UI（用户手动调整字段类型）
- ⏸️ 字段方向 UI（用户手动调整指标方向）
- ⏸️ 分析模式切换 UI（generic/education 模式选择）

## 许可证

本项目仅供学习和研究使用。

## 联系方式

如有问题或建议，请通过 GitHub Issues 反馈。
