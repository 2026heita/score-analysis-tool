import { useState } from 'react';
import OriginalFieldRadar from './OriginalFieldRadar';
import TraditionalSubjectRadar from './TraditionalSubjectRadar';
import type { OriginalFieldRadarState, TraditionalSubjectEntry } from '../../types';

type RadarTab = 'original' | 'traditional';

interface RadarAnalysisProps {
  headers: string[];
  rows: Record<string, string>[];
  isNumericField: (header: string) => boolean;
  getFieldAnalysisRole?: (header: string) => string;
  originalFieldState?: OriginalFieldRadarState;
  traditionalEntries?: TraditionalSubjectEntry[];
  onOriginalFieldChange?: (state: OriginalFieldRadarState) => void;
  onTraditionalChange?: (entries: TraditionalSubjectEntry[]) => void;
}

const TABS: { key: RadarTab; label: string }[] = [
  { key: 'original', label: '原表字段相对位置分析' },
  { key: 'traditional', label: '传统科目得分率雷达图' },
];

export default function RadarAnalysis({
  headers, rows, isNumericField, getFieldAnalysisRole,
  originalFieldState, traditionalEntries,
  onOriginalFieldChange, onTraditionalChange,
}: RadarAnalysisProps) {
  const [activeTab, setActiveTab] = useState<RadarTab>('original');

  return (
    <div>
      <div style={styles.tabContainer}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '16px' }}>
        {activeTab === 'original' && (
          <OriginalFieldRadar
            headers={headers}
            rows={rows}
            isNumericField={isNumericField}
            getFieldAnalysisRole={getFieldAnalysisRole}
            initialSelections={originalFieldState?.selections}
            initialViewMode={originalFieldState?.viewMode}
            onStateChange={onOriginalFieldChange}
          />
        )}
        {activeTab === 'traditional' && (
          <TraditionalSubjectRadar
            initialEntries={traditionalEntries}
            onStateChange={onTraditionalChange}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabContainer: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '8px',
  },
  tab: {
    padding: '6px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: '#fff',
    color: '#64748b',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#3b82f6',
    color: '#fff',
    border: '1px solid #3b82f6',
  },
};
