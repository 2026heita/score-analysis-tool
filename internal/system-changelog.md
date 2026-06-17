# 系统工程变更日志

> 记录架构、计算逻辑、引擎层面的内部变更。
> 与用户公告（updateLogs.ts）分离，仅面向工程回溯。

---

## 2026-06-17 - Analysis Engine Refactor (v1.1.3)

### Refactor
- unify analysis pipeline via `AnalysisContext`
- introduce single `computeMetric()` entry point via metric registry pattern
- decouple `chartAdapter` from analysis engine
- `correlationAnalyzer` now reads from `AnalysisContext` instead of parsing raw rows independently

### Behavior normalization
- normalize direction handling for rank-based metrics (`lower-is-better`)
- `computePosition()` now accepts `direction` parameter; rank fields use inverted ranking and percentile logic

### Migration
- mark legacy compute paths as deprecated (non-breaking):
  - `extractFieldValues()` — internal use only
  - `computeStats()` — internal use only
  - `computePosition()` — internal use only
  - `isRankField()` — deprecated, replaced by `MetricDefinition.direction`

### Notes
- no user-facing changes
- no UI changes
- no metric semantics changes intended, but internal execution path unified
- debug panel added for DEV-only verification (`DebugPanel.tsx`)

---

## 2026-06-16 - Semantic Layer V2 (v1.1.2)

### Refactor
- upgrade `semanticLayer.ts` to V2 with weighted edges and confidence scores
- add `computeGraphConfidence()` function

### Notes
- semantic layer not yet connected to UI
- serves as pre-built semantic skeleton for future BI integration

---

## 2026-06-15 - Metric Layer v0 (v1.1.1)

### Feature
- introduce `metricLayer.ts` for semantic classification
- map `FieldMeta` → `MetricDefinition` / `EntityDefinition` / `DimensionDefinition`
- support `higher-is-better` / `lower-is-better` direction

### Notes
- metric layer not yet connected to analysis engine at time of creation
- later unified via `AnalysisContext` (see 2026-06-17 entry)
