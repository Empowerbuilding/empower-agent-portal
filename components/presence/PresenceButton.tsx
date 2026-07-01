'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconUsers } from '@/components/ui/Icons';

interface PresenceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  last_active_at?: string | null;
}

type PresenceState = 'online' | 'away' | 'offline';

function presenceState(lastActiveAt?: string | null): PresenceState {
  if (!lastActiveAt) return 'offline';
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  if (diffMs < 60_000) return 'online';
  if (diffMs < 5 * 60_000) return 'away';
  return 'offline';
}

function presenceColor(state: PresenceState) {
  return state === 'online' ? 'var(--accent)' : state === 'away' ? '#8b949e' : '#6e7681';
}

function presenceLabel(state: PresenceState) {
  return state === 'online' ? 'Online' : state === 'away' ? 'Away' : 'Offline';
}

interface Props {
  orgId: string;
  size?: number;
  /** 'down' opens the panel below the button (use in top bars); default 'up' opens above (use in bottom bars). */
  openDirection?: 'up' | 'down';
  /** Which edge of the button the panel's edge aligns to, to avoid clipping off-screen. */
  align?: 'left' | 'right';
}

export default function PresenceButton({ orgId, size = 15, openDirection = 'up', align = 'right' }: Props) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [open, setOpen] = useState(false);
  const supabase = createClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // OrgShell renders this component twice (desktop ribbon + mobile inline, one
  // hidden via CSS media query but both mounted in the DOM). Supabase Realtime
  // dedupes channels by name, so two instances sharing "presence-btn:{orgId}"
  // collide: the 2nd instance's .on() call throws "cannot add postgres_changes
  // callbacks after subscribe()" because it got back the already-subscribed
  // channel object from the 1st instance. Unique suffix per mount avoids this.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  // Load org members
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('portal_users')
      .select('id, name, email, role, last_active_at')
      .eq('org_id', orgId)
      .order('role')
      .then(({ data }) => { if (data) setUsers(data); });
  }, [orgId]);

  // Live presence updates
  useEffect(() => {
    if (!orgId) return;
    const sub = supabase
      .channel(`presence-btn:${orgId}:${instanceIdRef.current}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_users', filter: `org_id=eq.${orgId}` }, (payload) => {
        const updated = payload.new as PresenceUser;
        setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, last_active_at: updated.last_active_at } : u));
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [orgId]);

  // Re-render every 20s so online -> away -> offline transitions reflect without new data
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 20000);
    return () => clearInterval(interval);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const onlineCount = users.filter(u => presenceState(u.last_active_at) === 'online').length;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Team presence"
        style={{
          position: 'relative', background: 'none', border: 'none', color: 'var(--muted)',
          cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
          minWidth: 24, minHeight: 24,
        }}
      >
        <IconUsers size={size} />
        {onlineCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -6, minWidth: 15, height: 15, borderRadius: '8px',
            background: 'var(--accent)', color: '#fff', fontSize: '10px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            border: '2px solid var(--sidebar-bg)', boxSizing: 'content-box', lineHeight: 1,
          }}>
            {onlineCount > 99 ? '99+' : onlineCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="presence-panel"
          style={{
            // Explicit 'auto' (not undefined) on the inactive axis — the .presence-panel
            // CSS class sets bottom: calc(100% + 8px) by default. An inline value of
            // undefined does NOT clear that class rule, so openDirection="down" was
            // leaving both top and bottom set simultaneously, squeezing the panel's
            // height down to a sliver instead of showing the full member list.
            top: openDirection === 'down' ? 'calc(100% + 8px)' : 'auto',
            bottom: openDirection === 'up' ? 'calc(100% + 8px)' : 'auto',
            right: align === 'right' ? 0 : 'auto',
            left: align === 'left' ? 0 : 'auto',
          }}
        >
          <div className="presence-panel-header">Team ({users.length})</div>
          <div className="presence-panel-list">
            {users.map(u => {
              const state = presenceState(u.last_active_at);
              return (
                <div key={u.id} className="presence-panel-row">
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 700,
                    }}>
                      {u.name.charAt(0)}
                    </div>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: presenceColor(state),
                      border: '2px solid #161b22', boxSizing: 'content-box',
                      position: 'absolute', bottom: -1, right: -1,
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  </div>
                  <span style={{ fontSize: '11px', color: presenceColor(state), fontWeight: 600, flexShrink: 0 }}>
                    {presenceLabel(state)}
                  </span>
                </div>
              );
            })}
            {users.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '10px 4px' }}>No team members yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
