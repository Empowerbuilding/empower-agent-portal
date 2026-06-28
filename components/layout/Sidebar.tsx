'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Organization, PortalChannel, Agent, PortalUser } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface Props {
  org: Organization;
  channels: (PortalChannel & { agents: Agent })[];
  currentUser: PortalUser;
  orgSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#2ea043' : status === 'unhealthy' ? '#d29922' : '#da3633';
  return <span className="status-dot" style={{ background: color }} />;
}

function TypeBadge({ type }: { type: string }) {
  if (type === 'chat') return null;
  return (
    <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#484f58', background: '#21262d', padding: '1px 5px', borderRadius: '4px' }}>
      {type === 'approval' ? '⚡' : '📌'}
    </span>
  );
}

interface AddChannelModalProps {
  agentId: string;
  orgId: string;
  onClose: () => void;
  onCreated: (ch: PortalChannel & { agents: Agent }) => void;
  agent: Agent;
}

function AddChannelModal({ agentId, orgId, onClose, onCreated, agent }: AddChannelModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'chat' | 'feed' | 'approval'>('chat');
  const [icon, setIcon] = useState('💬');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const channelId = `${agent.name}-${id}`;
    const { data, error } = await supabase.from('portal_channels').insert({
      id: channelId,
      org_id: orgId,
      agent_id: agentId,
      name: id,
      display_name: name.trim(),
      channel_type: type,
      icon,
      position: 99,
      active: true,
    }).select().single();
    setSaving(false);
    if (!error && data) {
      onCreated({ ...data, agents: agent });
      onClose();
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
        padding: '24px', width: '320px', display: 'flex', flexDirection: 'column', gap: '16px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Add Channel</div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={icon}
            onChange={e => setIcon(e.target.value)}
            style={{
              width: '48px', textAlign: 'center', background: '#0d1117', border: '1px solid #30363d',
              borderRadius: '6px', color: 'var(--text)', padding: '8px', fontSize: '18px',
            }}
          />
          <input
            autoFocus
            placeholder="Channel name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{
              flex: 1, background: '#0d1117', border: '1px solid #30363d',
              borderRadius: '6px', color: 'var(--text)', padding: '8px 12px', fontSize: '14px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['chat', 'feed', 'approval'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1, padding: '6px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: type === t ? '1px solid var(--accent)' : '1px solid #30363d',
                background: type === t ? 'rgba(196,154,15,0.15)' : '#0d1117',
                color: type === t ? 'var(--accent)' : 'var(--muted)',
                fontWeight: type === t ? 600 : 400,
              }}
            >
              {t === 'chat' ? '💬 Chat' : t === 'feed' ? '📌 Feed' : '⚡ Approval'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: !name.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ org, channels: initialChannels, currentUser, orgSlug, isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [channels, setChannels] = useState(initialChannels);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
  const [addingForAgent, setAddingForAgent] = useState<{ agentId: string; agent: Agent } | null>(null);

  const grouped = channels.reduce<Record<string, { agent: Agent; channels: (PortalChannel & { agents: Agent })[] }>>(
    (acc, ch) => {
      const key = ch.agents?.display_name ?? 'Other';
      if (!acc[key]) acc[key] = { agent: ch.agents, channels: [] };
      acc[key].channels.push(ch);
      return acc;
    },
    {}
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function deleteChannel(chId: string) {
    if (!confirm('Delete this channel and all its messages?')) return;
    setChannels(prev => prev.filter(c => c.id !== chId));
    await supabase.from('portal_messages').delete().eq('channel_id', chId);
    await supabase.from('portal_channels').delete().eq('id', chId);
    // Navigate away if we're on the deleted channel
    if (pathname.includes(chId)) router.push(`/${orgSlug}`);
  }

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      {addingForAgent && (
        <AddChannelModal
          agentId={addingForAgent.agentId}
          orgId={org.id}
          agent={addingForAgent.agent}
          onClose={() => setAddingForAgent(null)}
          onCreated={(ch) => setChannels(prev => [...prev, ch])}
        />
      )}

      <nav className={`sidebar${isOpen ? ' open' : ''}`}>
        {/* Org header */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Image src="/logo.png" alt="Empower Building" width={28} height={28} style={{ objectFit: 'contain', borderRadius: '4px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', lineHeight: 1.2 }}>{org.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Agent Portal</div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '20px', padding: '4px', lineHeight: 1 }}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Channel list */}
        <div className="sidebar-nav">
          {Object.entries(grouped).map(([agentName, { agent, channels: agentChannels }]) => (
            <div key={agentName} className="agent-group">
              <div className="agent-group-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{agentName}</span>
                  <StatusDot status={agent?.container_status ?? 'stopped'} />
                </div>
                {currentUser.role === 'owner' && (
                  <button
                    onClick={() => setAddingForAgent({ agentId: agent.id, agent })}
                    title="Add channel"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', fontSize: '16px', padding: '0 4px', lineHeight: 1,
                      opacity: 0.6,
                    }}
                  >+</button>
                )}
              </div>
              {agentChannels.map(ch => {
                const href = `/${orgSlug}/${ch.id}`;
                const isActive = pathname === href;
                return (
                  <div
                    key={ch.id}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={() => setHoveredChannel(ch.id)}
                    onMouseLeave={() => setHoveredChannel(null)}
                  >
                    <Link
                      href={href}
                      className={`channel-link${isActive ? ' active' : ''}`}
                      onClick={onClose}
                      style={{ flex: 1, paddingRight: hoveredChannel === ch.id ? '28px' : undefined }}
                    >
                      <span>{ch.icon ?? '#'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.display_name}
                      </span>
                      <TypeBadge type={ch.channel_type} />
                    </Link>
                    {hoveredChannel === ch.id && currentUser.role === 'owner' && (
                      <button
                        onClick={() => deleteChannel(ch.id)}
                        title="Delete channel"
                        style={{
                          position: 'absolute', right: 4,
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#da3633', fontSize: '13px', padding: '2px 4px',
                          lineHeight: 1, zIndex: 1,
                        }}
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="sidebar-footer">
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, flexShrink: 0,
          }}>
            {currentUser.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{currentUser.role}</div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '4px', flexShrink: 0 }}
          >
            ↪
          </button>
        </div>
      </nav>
    </>
  );
}
