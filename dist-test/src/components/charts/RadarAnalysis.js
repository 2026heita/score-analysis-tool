import { jsx as _jsx } from "react/jsx-runtime";
import OriginalFieldRadar from './OriginalFieldRadar';
export default function RadarAnalysis({ headers, rows, isNumericField, getFieldAnalysisRole, originalFieldState, onOriginalFieldChange, }) {
    return (_jsx("div", { children: _jsx(OriginalFieldRadar, { headers: headers, rows: rows, isNumericField: isNumericField, getFieldAnalysisRole: getFieldAnalysisRole, initialSelections: originalFieldState?.selections, initialViewMode: originalFieldState?.viewMode, onStateChange: onOriginalFieldChange }) }));
}
