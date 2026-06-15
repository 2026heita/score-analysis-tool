import { useState, useImperativeHandle, forwardRef } from 'react';
import { sampleDatasets, type SampleDataset } from '../data/sampleDatasets';

interface SampleDataSelectorProps {
  onSelect: (dataset: SampleDataset) => void;
  disabled?: boolean;
}

export interface SampleDataSelectorRef {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SampleDataSelector = forwardRef<SampleDataSelectorRef, SampleDataSelectorProps>(
  function SampleDataSelector({ onSelect, disabled }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('全部');

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen(prev => !prev),
    }));

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
);

export default SampleDataSelector;

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
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)',
    border: '1px dashed #a5b4fc',
    borderRadius: '12px',
    fontSize: '14px',
    color: '#6366f1',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(99, 102, 241, 0.05)',
  },
  triggerIcon: {
    fontSize: '16px',
  },
  arrow: {
    fontSize: '10px',
    marginLeft: 'auto',
    transition: 'transform 0.2s',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    right: 0,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(99, 102, 241, 0.15), 0 8px 16px rgba(0,0,0,0.08)',
    zIndex: 100,
    overflow: 'hidden',
    animation: 'fadeInUp 0.25s ease-out',
  },
  categoryFilter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '12px',
    borderBottom: '1px solid #f1f5f9',
    background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
  },
  categoryButton: {
    padding: '6px 14px',
    fontSize: '12px',
    color: '#64748b',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontWeight: 500,
  },
  categoryButtonActive: {
    color: '#fff',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    borderColor: 'transparent',
    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
  },
  datasetLists: {
    maxHeight: '320px',
    overflowY: 'auto',
    padding: '8px',
  },
  datasetItem: {
    padding: '14px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '6px',
    border: '1px solid #f1f5f9',
    background: '#fff',
  },
  datasetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  datasetName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  datasetCategory: {
    fontSize: '11px',
    color: '#6366f1',
    background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)',
    padding: '3px 10px',
    borderRadius: '12px',
    fontWeight: 500,
  },
  datasetDesc: {
    fontSize: '12px',
    color: '#64748b',
    lineHeight: 1.6,
    marginBottom: '6px',
  },
  datasetMeta: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 500,
  },
};
