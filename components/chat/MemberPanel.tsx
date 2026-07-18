'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Member {
  id: string;
  name: string;
  role: string;
  last_seen_at: string | null;
}

interface Props {
  channelId: string;
  agentName?: string;
  agentStatus?: string; // 'running' | 'stopped' | 'unhealthy'
}

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 10 * 60 * 1000; // 10 min
}

export default function MemberPanel({ channelId, agentName, agentStatus }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Get members of this channel
      const { data: memberships } = await supabase
        .from('portal_channel_members')
        .select('user_id, last_seen_at')
        .eq('channel_id', channelId);
      if (!memberships?.length) return;

      const userIds = memberships.map(m => m.user_id);
      const { data: users } = await supabase
        .from('portal_users')
        .select('id, name, role')
        .in('id', userIds);
      if (!users) return;

      const lastSeenMap: Record<string, string | null> = {};
      for (const m of memberships) lastSeenMap[m.user_id] = m.last_seen_at;

      setMembers(users.map(u => ({ ...u, last_seen_at: lastSeenMap[u.id] ?? null })));
    }
    load();
  }, [channelId]);

  const online = members.filter(m => isOnline(m.last_seen_at));
  const offline = members.filter(m => !isOnline(m.last_seen_at));
  const agentOnline = agentStatus === 'running';

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: 'var(--sidebar-bg)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      padding: '16px 0',
    }}>
      {/* Agent */}
      {agentName && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c0c4cc' }}>
            {agentOnline ? 'Online' : 'Offline'} — 1
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', borderRadius: 6, margin: '0 6px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>
                {agentName.charAt(0).toUpperCase()}
              </div>
              <span style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 10, height: 10, borderRadius: '50%',
                background: agentOnline ? '#22c55e' : '#6b7280',
                border: '2px solid var(--sidebar-bg)',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{agentName}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>APP</div>
            </div>
          </div>
        </div>
      )}

      {/* Online humans */}
      {online.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c0c4cc' }}>
            Online — {online.length}
          </div>
          {online.map(m => (
            <MemberRow key={m.id} member={m} online />
          ))}
        </div>
      )}

      {/* Offline humans */}
      {offline.length > 0 && (
        <div>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#c0c4cc' }}>
            Offline — {offline.length}
          </div>
          {offline.map(m => (
            <MemberRow key={m.id} member={m} online={false} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, online }: { member: Member; online: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '4px 12px', borderRadius: 6, margin: '0 6px',
      opacity: online ? 1 : 0.5,
      cursor: 'default',
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
