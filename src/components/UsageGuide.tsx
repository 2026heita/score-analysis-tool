import { useState } from 'react';

export default function UsageGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={styles.wrapper}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.toggleButton}
      >
        {expanded ? '▼' : '▶'} 使用说明
      </button>

      {expanded && (
        <div style={styles.content}>
          <ol style={styles.list}>
            <li>选择一种数据来源：粘贴表格、上传 CSV / Excel 文件、填入示例数据，或使用可选的外部数据源。</li>
            <li>使用粘贴文本或 CSV 时，请确保第一行是字段名，后续每一行是数据。</li>
            <li>数据加载或解析完成后，确认字段识别和数据概览结果。</li>
            <li>选择一个数值字段进行分析；需要比较相对位置时，可输入参考数值。</li>
            <li>查看统计指标、数据分布、相对位置和图表分析。</li>
            <li>数据中存在可识别时间字段时，可查看"时间趋势"折线图。</li>
            <li>本地文件和粘贴数据默认在浏览器中处理；使用外部数据源时，页面会请求你配置的服务地址。</li>
          </ol>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginBottom: '12px',
  },
  toggleButton: {
    padding: '6px 12px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#475569',
    cursor: 'pointer',
    fontWeight: 500,
  },
  content: {
    marginTop: '8px',
    padding: '12px 16px',
    background: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  list: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#475569',
    lineHeight: 1.8,
  },
};
