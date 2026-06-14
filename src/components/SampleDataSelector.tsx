import { useState } from 'react';
import { sampleDatasets, type SampleDataset } from '../data/sampleDatasets';

interface SampleDataSelectorProps {
  onSelect: (dataset: SampleDataset) => void;
  disabled?: boolean;
}

export default function SampleDataSelector({ onSelect, disabled }: SampleDataSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  const categories = ['全部', ...new Set(sampleDatasets.map(ds => ds.category))];
  
  const filteredDatasets = selectedCategory === '全部' 
    ? sampleDatasets 
    : sampleDatasets.filter(ds => ds.category === selectedCategory);

  const handleSelect = (dataset: SampleDataset) => {
    onSelect(dataset);
    setIsOpen(false);
  };

  return (
    <div style={styles.container}>
      <button 
        style={styles.triggerButton}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span style={styles.triggerIcon}>📊</span>
        <span>没有数据？试试示例表格</span>
        <span style={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          {/* 分类筛选 */}
          <div style={styles.categoryFilter}>
            {categories.map(cat => (
              <button
                key={cat}
                style={{
                  ...styles.categoryButton,
                  ...(selectedCategory === cat ? styles.categoryButtonActive : {})
                }}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 数据集列表 */}
          <div style={styles.datasetList}>
            {filteredDatasets.map(dataset => (
              <div
                key={dataset.id}
                style={styles.datasetItem}
                onClick={() => handleSelect(dataset)}
              >
                <div style={styles.datasetHeader}>
                  <span style={styles.datasetName}>{dataset.name}</span>
                  <span style={styles.datasetCategory}>{dataset.category}</span>
                </div>
                <div style={styles.datasetDesc}>{dataset.description}</div>
                <div style={styles.datasetMeta}>
                  {dataset.headers.length} 个字段 · {dataset.rows.length} 行数据
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
  },
  triggerButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)',
    border: '1px dashed #93c5fd',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#3b82f6',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  triggerIcon: {
    fontSize: '16px',
  },
  arrow: {
    fontSize: '10px',
    marginLeft: 'auto',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    zIndex: 100,
    overflow: 'hidden',
  },
  categoryFilter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '12px',
    borderBottom: '1px solid #f1f5f9',
    background: '#f8fafc',
  },
  categoryButton: {
    padding: '4px 12px',
    fontSize: '12px',
    color: '#64748b',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  categoryButtonActive: {
    color: '#3b82f6',
    background: '#dbeafe',
    borderColor: '#93c5fd',
  },
  datasetLists: {
    maxHeight: '320px',
    overflowY: 'auto',
    padding: '8px',
  },
  datasetItem: {
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginBottom: '4px',
  },
  datasetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  datasetName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  datasetCategory: {
    fontSize: '11px',
    color: '#64748b',
    background: '#f1f5f9',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  datasetDesc: {
    fontSize: '12px',
    color: '#64748b',
    lineHeight: 1.5,
    marginBottom: '4px',
  },
  datasetMeta: {
    fontSize: '11px',
    color: '#94a3b8',
  },
};
