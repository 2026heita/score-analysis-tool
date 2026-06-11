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
            <li>从 Excel 中复制整块表格。</li>
            <li>粘贴到下方文本框。</li>
            <li>第一行必须是字段名，后面每一行是数据。</li>
            <li>点击"解析数据"。</li>
            <li>选择分析字段，并输入你的数值。</li>
            <li>查看统计指标、排名定位和图表分析。</li>
            <li>本工具默认在浏览器本地运行，数据不上传服务器。</li>
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
