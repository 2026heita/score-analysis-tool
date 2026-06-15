import { useState } from 'react';
import { sampleDatasets, type SampleDataset } from '../data/sampleDatasets';

interface SampleDataSelectorProps {
  onSelect: (dataset: SampleDataset) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function SampleDataSelector({ onSelect, isOpen, onClose }: SampleDataSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  const categories = ['全部', ...new Set(sampleDatasets.map(ds => ds.category))];
  
  const filteredDatasets = selectedCategory === '全部' 
    ? sampleDatasets 
    : sampleDatasets.filter(ds => ds.category === selectedCategory);

  const handleSelect = (dataset: SampleDataset) => {
    onSelect(dataset);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>选择示例数据</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease-out',
  },
  container: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeInUp 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#334155',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    transition: 'all 0.15s',
  },
  categoryFilter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '16px 20px',
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
  datasetList: {
    overflowY: 'auto',
    padding: '16px 20px',
    flex: 1,
  },
  datasetItem: {
    padding: '14px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '10px',
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
