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

## 2026-06-17 - Education UI Legacy Isolation

### Refactor
- remove `TraditionalSubjectRadar` from main UI link:
  - delete duplicate `src/components/charts/TraditionalSubjectRadar.tsx`
  - retained only at `src/features/legacy/education/TraditionalSubjectRadar.tsx`
  - `RadarAnalysis.tsx` simplified: no tab switching, direct render of `OriginalFieldRadar`
- extract `FIXED_SUBJECT_ORDER` to `src/config/education.ts` (legacy config)
- remove `traditionalEntries` state from `App.tsx` — no longer persisted or rendered
- `TraditionalSubjectRadarState` and `TraditionalSubjectEntry` types retained in `types.ts` with `@deprecated` for legacy component compatibility
- `SavedState.traditionalSubjectRadar` made optional — backward-compatible reads, no new writes
- `storage.ts` default states no longer emit `traditionalSubjectRadar`

### Analysis Engine
- no changes to `computeMetric`, `metricRegistry`, `chartAdapter`, `MetricResult`, or `AnalysisContext`
- analysis engine is fully education-domain agnostic

### Parser Heuristics
- education-related keywords in `fieldClassifier.ts`, `headerDetection.ts`, `sheetDetection.ts`, `chartData.ts` retained intentionally
- these are infrastructure-level heuristics for detecting column/field types, not education-specific features

### Deprecated (still accessible)
- `TraditionalSubjectRadar` component at `src/features/legacy/education/`
- `FIXED_SUBJECT_ORDER` at `src/config/education.ts`
- `TraditionalSubjectEntry`, `TraditionalSubjectRadarState` types
- `DEFAULT_TRADITIONAL_ENTRIES`, `DEFAULT_SAMPLE_TEXT` in `storage.ts`

### Verification
- `tsc --noEmit` — clean
- `testComputeMetric.mjs` — 21/21 passed
- `testMetricRegistry.mjs` — 16/16 passed
- `vite build` — success

---

## 2026-06-17 - Metric Registry Introduction

### Refactor
- introduce `src/metrics/metricRegistry.ts` — metricId → compute function mapping
- `analysisEngine.computeMetric()` is now a pure dispatcher: delegates to `metric.compute()`
- compute logic extracted into `createGenericCompute()` factory, injected into registry
- `legacyComputeMetric` alias added as deprecated compatibility layer

### Architecture
- dependency direction: `metricRegistry` → `context` (types only), no circular deps
- `analysisEngine` → `metricRegistry` (imports `getOrCreateMetricDef`)
- `chartAdapter` already accepts only `MetricResult` — no changes needed

### Tests
- `scripts/testMetricRegistry.mjs` — 16/16 passed
- `scripts/testComputeMetric.mjs` — 21/21 still passing
- `tsc --noEmit` — clean

### Notes
- no behavior changes — same input produces same output
- registry uses dynamic creation pattern (any metricId auto-creates entry)
- future: pre-registered metrics (avg_score, pass_rate) can override generic compute

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
