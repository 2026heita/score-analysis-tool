/**
 * HelpPopover - 模块标题旁的小问号按钮。
 *
 * 根据 helpContent 的 type 字段分流展示方式（展示逻辑升级，不改变调用方式 content={getHelp(key)}）：
 * - short  ：轻量 tooltip 气泡，跟随按钮定位，不打开右侧面板；
 * - detail ：分为两类
 *   - ai / field / filter ：打开右侧固定 HelpPanel（可关闭、fixed 定位、不影响主页面滚动）；
 *   - 其他 detail        ：保留原有内联弹层（HelpPanel 卡片）。
 *
 * inline 层通过 createPortal 渲染到 body，规避祖先 overflow 裁切；窗口滚动/缩放时重定位。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpItem } from '../../data/helpContent';
import HelpPanel from './HelpPanel';

interface HelpPopoverProps {
  content: HelpItem;
}

/** detail 类型统一使用右侧 HelpPanel；short 类型使用轻量 tooltip */
const PANEL_DETAIL_KEYS: ReadonlySet<string> = new Set([
  'ai',
  'field',
  'filter',
  'group',
  'position',
  'outlier',
  'relation',
  'timeseries',
  'record',
]);

/** 内联弹层固定宽度上限 */
const POPOVER_WIDTH = 320;
/** 弹层距按钮的间距 */
const GAP = 8;

export default function HelpPopover({ content }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isShort = content.type === 'short';
  const usePanel = content.type === 'detail' && PANEL_DETAIL_KEYS.has(content.key);

  const layerWidth = Math.min(POPOVER_WIDTH, window.innerWidth * 0.84);

  const reposition = useCallback(() => {
    const btn = wrapRef.current;
    const layer = layerRef.current;
    if (!btn || !layer) return;
    const rect = btn.getBoundingClientRect();
    const popH = layer.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const showTop = spaceBelow < popH && spaceAbove > spaceBelow;
    const top = showTop
      ? Math.max(GAP, rect.top - popH - GAP)
      : rect.bottom + GAP;
    const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - layerWidth - GAP));
    setPos({ top, left });
  }, [layerWidth]);

  useEffect(() => {
    if (!open) return;

    const isInline = !usePanel;
    const raf = isInline ? requestAnimationFrame(reposition) : undefined;

    const onMouseDown = (e: MouseEvent) => {
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target as Node);
      const inPanel = panelRef.current && panelRef.current.contains(e.target as Node);
      if (!inWrap && !inPanel) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    if (isInline) {
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
    }
    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      if (isInline) {
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
      }
    };
  }, [open, usePanel, reposition]);

  const close = () => setOpen(false);

  let layer: React.ReactNode = null;

  if (open && usePanel) {
    // 右侧固定 HelpPanel：可关闭、fixed 定位、不阻塞主页面滚动
    layer = createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`${content.title}说明`}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          bottom: '16px',
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1001,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: '1px solid #eef2f7',
            background: '#f8fafc',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{content.title}</span>
          <button
            type="button"
            aria-label="关闭说明"
            onClick={close}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              fontSize: '16px',
              lineHeight: 1,
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 14px 14px' }}>
          <HelpPanel content={content} />
        </div>
      </div>,
      document.body,
    );
  } else if (open && !usePanel) {
    // short → 轻量 tooltip；其余 detail → 内联 HelpPanel 卡片弹层
    const tooltip = isShort;
    layer = createPortal(
      <div
        ref={layerRef}
        style={{
          position: 'fixed',
          top: pos ? pos.top : -9999,
          left: pos ? pos.left : -9999,
          zIndex: 1000,
          width: '320px',
          maxWidth: 'min(320px, 84vw)',
          ...(tooltip
            ? {
                background: '#1e293b',
                color: '#e2e8f0',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                lineHeight: '1.5',
                boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
              }
            : {
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              }),
        }}
        onClick={e => e.stopPropagation()}
      >
        {tooltip ? (
          <>
            <div style={{ fontWeight: 600 }}>{content.title}</div>
            <div style={{ marginTop: '2px' }}>{content.purpose}</div>
          </>
        ) : (
          <HelpPanel content={content} />
        )}
      </div>,
      document.body,
    );
  }

  return (
    <span ref={wrapRef} style={styles.wrap}>
      <button
        type="button"
        aria-label={`查看${content.title}说明`}
        title={`${content.title}说明`}
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        style={styles.button}
      >
        ?
      </button>
      {layer}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
    flex: '0 0 auto',
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    padding: 0,
    marginLeft: '6px',
    border: '1px solid #94a3b8',
    borderRadius: '50%',
    background: 'transparent',
    color: '#64748b',
    fontSize: '11px',
    lineHeight: 1,
    cursor: 'pointer',
    verticalAlign: 'middle',
    flex: '0 0 auto',
  },
};