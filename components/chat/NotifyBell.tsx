'use client';

import { useEffect, useRef, useState } from 'react';

type NotifyMode = 'all' | 'agents' | 'humans' | 'none';

const OPTIONS: { value: NotifyMode; label: string; desc: string }[] = [
  { value: 'all', label: 'All messages', desc: 'Agents + humans' },
  { value: 'agents', label: 'Agent replies', desc: 'Default' },
  { value: 'humans', label: 'Human messages', desc: 'Teammates only' },
  { value: 'none', label: 'Muted', desc: 'No notifications' },
];

function BellIcon({ size = 17, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {muted && <line x1="2" y1="2" x2="22" y2="22" />}
    </svg>
  );
}

interface Props {
  channelId: string;
  size?: number;
}

export default function NotifyBell({ channelId, size = 17 }: Props) {
  const [mode, setMode] = useState<NotifyMode>('agents');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notify-mode?channelId=${encodeURIComponent(channelId)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.mode) setMode(d.mode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [channelId]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function select(next: NotifyMode) {
    setOpen(false);
    if (next === mode) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    try {
      const res = await fetch('/api/notify-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, mode: next }),
      });
      if (!res.ok) setMode(prev);
    } catch {
      setMode(prev);
    } finally {
      setSaving(false);
    }
  }

  const isMuted = mode === 'none';
  const currentLabel = OPTIONS.find(o => o.value === mode)?.label ?? 'Agent replies';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Notifications: ${currentLabel}`}
        style={{
          background: open ? 'var(--surface-hover)' : 'none', border: 'none',
          color: isMuted ? 'var(--muted)' : 'var(--text)', cursor: 'pointer',
          padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center',
          opacity: saving ? 0.5 : 0.85,
        }}
      >
        <BellIcon size={size} muted={isMuted} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '6px', minWidth: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '4px 10px 6px', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Notify me about
          </div>
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => select(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                color: opt.value === mode ? 'var(--accent)' : 'var(--text)', cursor: 'pointer',
                padding: '8px 10px', fontSize: '13px', borderRadius: '4px',
                fontWeight: opt.value === mode ? 600 : 400,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span>
                {opt.label}
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>{opt.desc}</span>
              </span>
              {opt.value === mode && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
