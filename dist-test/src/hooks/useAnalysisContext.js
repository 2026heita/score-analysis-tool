/**
 * useDerivedData - 派生数据 Hook（v1.4 Phase 4）
 *
 * 职责：仅产出 DerivedDataContext（filteredRows + fieldScores + outliers）
 * 这是 engine 层的唯一输出，不包含任何 View 层计算。
 *
 * 分层规则：
 * - 输入：analysisDataset（统一分析数据集）
 * - 输出：DerivedDataContext（引擎计算结果）
 * - 不计算：metricResult、correlationResult、groupStats（属于 View 层）
 */
import { useMemo } from 'react';
import { buildDerivedDataContext } from '../engine/context';
import { calculateFieldAnalyticScore } from '../utils/tableParser/fieldClassifier';
export function useDerivedData(analysisDataset, parseSummary) {
    return useMemo(() => {
        if (!analysisDataset || !parseSummary?.fieldTypes)
            return null;
        // 只有 ready_full 或 ready_sampled 状态才计算
        if (analysisDataset.status !== 'ready_full' && analysisDataset.status !== 'ready_sampled') {
            return null;
        }
        // 计算所有字段的可分析性评分（engine 层职责）
        const fieldScores = {};
        for (const meta of parseSummary.fieldTypes) {
            fieldScores[meta.header] = calculateFieldAnalyticScore(meta);
        }
        // v1.4 Phase 4：DerivedDataContext 只包含引擎计算结果
        return buildDerivedDataContext(analysisDataset.rows, fieldScores);
    }, [analysisDataset, parseSummary]);
}
