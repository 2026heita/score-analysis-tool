import OriginalFieldRadar from './OriginalFieldRadar';
import type { OriginalFieldRadarState } from '../../types';

interface RadarAnalysisProps {
  headers: string[];
  rows: Record<string, string>[];
  isNumericField: (header: string) => boolean;
  getFieldAnalysisRole?: (header: string) => string;
  getFieldMetricDirection?: (header: string) => string;
  originalFieldState?: OriginalFieldRadarState;
  onOriginalFieldChange?: (state: OriginalFieldRadarState) => void;
}

export default function RadarAnalysis({
  headers, rows, isNumericField, getFieldAnalysisRole, getFieldMetricDirection,
  originalFieldState,
  onOriginalFieldChange,
}: RadarAnalysisProps) {
  return (
    <div>
      <OriginalFieldRadar
        headers={headers}
        rows={rows}
        isNumericField={isNumericField}
        getFieldAnalysisRole={getFieldAnalysisRole}
        getFieldMetricDirection={getFieldMetricDirection}
        initialSelections={originalFieldState?.selections}
        initialViewMode={originalFieldState?.viewMode}
        onStateChange={onOriginalFieldChange}
      />
    </div>
  );
}