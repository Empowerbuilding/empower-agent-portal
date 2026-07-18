'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Member {
  id: string;
  name: string;
  role: string;
  last_active_at: string | null; // updated by 30s heartbeat in portal_users
}

interface Props {
  orgId: string;
  onOnlineCountChange?: (count: number) => void;
}

function isOnline(lastActive: string | null): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000; // 5 min (heartbeat is every 30s)
}

export default function MemberPanel({ orgId, onOnlineCountChange }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Query all org members + their last_seen from portal_channel_members (most recent across any channel)
      // Use last_active_at from portal_users — updated every 30s by heartbeat (same source as PresenceButton)
      const { data: users } = await supabase
        .from('portal_users')
        .select('id, name, role, last_active_at')
        .eq('org_id', orgId);
      if (!users?.length) return;

      const result = users.map(u => ({ ...u }));
      setMembers(result);

      const onlineCount = result.filter(m => isOnline(m.last_active_at)).length;
      onOnlineCountChange?.(onlineCount);
    }
    load();
  }, [orgId]);

  const online = members.filter(m => isOnline(m.last_active_at));
  const offline = members.filter(m => !isOnline(m.last_active_at));

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: '#1a1b1e', /* slightly darker than sidebar for clear contrast */
      borderLeft: '2px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '16px 0',
      minHeight: '100%',
      flex: 1,
    }}>
      {online.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c0c4cc' }}>
            Online — {online.length}
          </div>
          {online.map(m => <MemberRow key={m.id} member={m} online />)}
        </div>
      )}

      {offline.length > 0 && (
        <div>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c0c4cc' }}>
            Offline — {offline.length}
          </div>
          {offline.map(m => <MemberRow key={m.id} member={m} online={false} />)}
        </div>
      )}

      {members.length === 0 && (
        <div style={{ padding: '0 16px', fontSize: 13, color: 'var(--muted)' }}>No members</div>
      )}
    </div>
  );
}

function MemberRow({ member, online }: { member: Member & { last_active_at: string | null }; online: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 12px', borderRadius: 6, margin: '0 6px',
      opacity: online ? 1 : 0.5,
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: online ? 'var(--surface-hover)' : 'var(--border)',
          color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700,
        }}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: '50%',
          background: online ? '#22c55e' : '#6b7280',
          border: '2px solid var(--sidebar-bg)',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{member.name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{member.role}</div>
      </div>
    </div>
  );
}
