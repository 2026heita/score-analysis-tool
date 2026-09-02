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
          <div style={styles.headerContent}>
            <div style={styles.headerIcon}>📊</div>
            <div>
              <div style={styles.title}>选择示例数据</div>
              <div style={styles.subtitle}>快速体验数据分析平台</div>
            </div>
          </div>
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

        {/* 数据集网格 */}
        <div style={styles.datasetGrid}>
          {filteredDatasets.map(dataset => (
            <div
              key={dataset.id}
              style={styles.datasetCard}
              onClick={() => handleSelect(dataset)}
            >
              <div style={styles.cardHeader}>
                <div style={styles.nameWrap}>
                  {dataset.featured && <span style={styles.featuredBadge}>✨ 推荐</span>}
                  <div style={styles.datasetName}>{dataset.name}</div>
                </div>
                <div style={styles.datasetCategory}>{dataset.category}</div>
              </div>
              <div style={styles.datasetDesc}>{dataset.description}</div>
              {dataset.tags && dataset.tags.length > 0 && (
                <div style={styles.tagRow}>
                  {dataset.tags.map(tag => (
                    <span key={tag} style={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
              <div style={styles.datasetMeta}>
                <span style={styles.metaItem}>
                  <span style={styles.metaIcon}>📋</span>
                  {dataset.headers.length} 个字段
                </span>
                <span style={styles.metaItem}>
                  <span style={styles.metaIcon}>📝</span>
                  {dataset.rows.length} 行数据
                </span>
              </div>
              <div style={styles.cardAction}>选择此示例 →</div>
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
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 0.2s ease-out',
    padding: '20px',
  },
  container: {
    background: '#fff',
    borderRadius: '20px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.1)',
    maxWidth: '900px',
    width: '100%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeInUp 0.25s ease-out',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    fontSize: '32px',
    lineHeight: 1,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '2px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: 400,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    transition: 'all 0.15s',
    lineHeight: 1,
  },
  categoryFilter: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '16px 24px',
    borderBottom: '1px solid #f1f5f9',
    background: '#fff',
  },
  categoryButton: {
    padding: '8px 16px',
    fontSize: '13px',
    color: '#64748b',
    background: '#f8fafc',
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
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
  },
  datasetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1,
  },
  datasetCard: {
    padding: '16px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: '2px solid #e2e8f0',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '10px',
    gap: '8px',
  },
  nameWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  featuredBadge: {
    fontSize: '11px',
    color: '#b45309',
    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: 600,
    alignSelf: 'flex-start',
  },
  datasetName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
    lineHeight: 1.3,
  },
  datasetCategory: {
    fontSize: '11px',
    color: '#6366f1',
    background: 'linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)',
    padding: '4px 10px',
    borderRadius: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  datasetDesc: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: 1.6,
    marginBottom: '12px',
    flex: 1,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '12px',
  },
  tag: {
    fontSize: '11px',
    color: '#475569',
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  datasetMeta: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #f1f5f9',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 500,
  },
  metaIcon: {
    fontSize: '14px',
  },
  cardAction: {
    fontSize: '13px',
    color: '#6366f1',
    fontWeight: 500,
    textAlign: 'center',
    padding: '8px',
    background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
};
