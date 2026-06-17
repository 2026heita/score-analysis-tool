import OriginalFieldRadar from './OriginalFieldRadar';
import type { OriginalFieldRadarState } from '../../types';

interface RadarAnalysisProps {
  headers: string[];
  rows: Record<string, string>[];
  isNumericField: (header: string) => boolean;
  getFieldAnalysisRole?: (header: string) => string;
  originalFieldState?: OriginalFieldRadarState;
  onOriginalFieldChange?: (state: OriginalFieldRadarState) => void;
}

export default function RadarAnalysis({
  headers, rows, isNumericField, getFieldAnalysisRole,
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
        initialSelections={originalFieldState?.selections}
        initialViewMode={originalFieldState?.viewMode}
        onStateChange={onOriginalFieldChange}
      />
    </div>
  );
}