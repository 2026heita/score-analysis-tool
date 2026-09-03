/**
 * HelpPanel - 结构化帮助说明卡片。
 *
 * 用于承载一段较长的功能说明，按「作用 / 什么时候用 / 示例 / 注意」分栏展示。
 * 仅供展示，不参与任何分析逻辑。
 */
import type { HelpItem } from '../../data/helpContent';

interface HelpPanelProps {
  content: HelpItem;
}

interface HelpRow {
  label: string;
  text: string;
  tone?: 'normal' | 'note';
}

export default function HelpPanel({ content }: HelpPanelProps) {
  const rows: HelpRow[] = [];
  if (content.purpose) rows.push({ label: '作用', text: content.purpose });
  if (content.whenUse) rows.push({ label: '什么时候用', text: content.whenUse });
  if (content.example) rows.push({ label: '示例', text: content.example });
  if (content.note) rows.push({ label: '注意', text: content.note, tone: 'note' });

  return (
    <div style={styles.card}>
      <div style={styles.title}>{content.title}</div>
      {rows.map(row => (
        <div key={row.label} style={styles.row}>
          <span style={row.tone === 'note' ? styles.labelNote : styles.label}>{row.label}</span>
          <span style={styles.text}>{row.text}</span>
        </div>
      ))}
    </div>
  );
}

const baseLabel: React.CSSProperties = {
  flex: '0 0 auto',
  fontWeight: 600,
  marginRight: '8px',
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#ffffff',
    borderRadius: '8px',
    padding: '12px 14px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    fontSize: '13px',
    lineHeight: '1.6',
    marginBottom: '6px',
  },
  label: {
    ...baseLabel,
    color: '#334155',
  },
  labelNote: {
    ...baseLabel,
    color: '#b45309',
  },
  text: {
    color: '#475569',
  },
};