'use client';

import { useEffect, useRef, useState } from 'react';
import { IconMore, IconRefresh, IconTrash, IconSearch, IconGear } from '@/components/ui/Icons';

interface Props {
  contextPct: number | null;
  resetting: boolean;
  onResetContext: () => void;
  onDeleteMode: () => void;
  onSearch?: () => void;
  settingsHref?: string;
  size?: number;
}

export default function ChatOverflowMenu({ contextPct, resetting, onResetContext, onDeleteMode, onSearch, settingsHref, size = 16 }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const color = contextPct !== null ? (contextPct >= 50 ? '#da3633' : contextPct >= 30 ? '#8b949e' : 'var(--accent)') : null;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="More options"
        style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '4px 6px', opacity: 0.9 }}
      >
        <IconMore size={size} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '6px', minWidth: '190px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {color && (
            <div
              title="Agent context usage — how full this session's memory is before it needs a reset"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', fontSize: '12px', color: 'var(--muted)' }}
            >
              <span>Context usage</span>
              <span style={{ fontWeight: 600, color }}>{contextPct}%</span>
            </div>
          )}
          <button
            onClick={() => { setOpen(false); onResetContext(); }}
            disabled={resetting}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
              background: 'none', border: 'none', color: 'var(--text)', cursor: resetting ? 'wait' : 'pointer',
              padding: '8px 10px', fontSize: '13px', borderRadius: '4px', opacity: resetting ? 0.5 : 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconRefresh size={14} /> Reset context
          </button>
          {onSearch && (
            <button
              onClick={() => { setOpen(false); onSearch(); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '8px 10px', fontSize: '13px', borderRadius: '4px' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <IconSearch size={14} /> Search messages
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onDeleteMode(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
              background: 'none', border: 'none', color: '#da3633', cursor: 'pointer',
              padding: '8px 10px', fontSize: '13px', borderRadius: '4px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(218,54,51,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconTrash size={14} /> Delete messages
          </button>
          {settingsHref && (
            <a
              href={settingsHref}
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '8px 10px', fontSize: '13px', borderRadius: '4px', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <IconGear size={14} /> Agent settings
            </a>
          )}
        </div>
      )}
    </div>
  );
}
