'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Organization, PortalChannel, Agent, PortalUser, AgentGroup } from '@/lib/types';
import { IconGear, IconClock } from '@/components/ui/Icons';
import { createClient } from '@/lib/supabase/client';

interface Props {
  org: Organization;
  channels: (PortalChannel & { agents: Agent })[];
  groups: AgentGroup[];
  currentUser: PortalUser;
  orgSlug: string;
  isOpen: boolean;
  onClose: () => void;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#22c55e' : status === 'unhealthy' ? '#f59e0b' : '#ef4444';
  return <span className="status-dot" style={{ background: color, display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />;
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
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const channelId = `${agent.name}-${slug}`;
    const { data, error } = await supabase.from('portal_channels').insert({
      id: channelId,
      org_id: orgId,
      agent_id: agentId,
      name: slug,
      display_name: name.trim(),
      channel_type: type,
      icon: null,
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
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '24px', width: '300px', display: 'flex', flexDirection: 'column', gap: '16px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Add Channel</div>

        <input
          autoFocus
          placeholder="Channel name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          style={{
            background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text)', padding: '10px 12px', fontSize: '14px', width: '100%', boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          {(['chat', 'feed', 'approval'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: '6px 4px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
              border: type === t ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: type === t ? 'rgba(76,139,240,0.15)' : 'var(--sidebar-bg)',
              color: type === t ? 'var(--accent)' : 'var(--muted)',
              fontWeight: type === t ? 600 : 400,
            }}>
              {t === 'chat' ? 'Chat' : t === 'feed' ? 'Feed' : 'Approval'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || saving} style={{
            padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px',
            color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
            opacity: !name.trim() || saving ? 0.5 : 1,
          }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameChannelModal({ channel, onClose, onRenamed }: { channel: PortalChannel & { agents: Agent }; onClose: () => void; onRenamed: (newName: string) => void }) {
  const [name, setName] = useState(channel.display_name);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleRename() {
    if (!name.trim() || name.trim() === channel.display_name) { onClose(); return; }
    setSaving(true);
    await supabase.from('portal_channels').update({ display_name: name.trim() }).eq('id', channel.id);
    onRenamed(name.trim());
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '300px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>Rename Channel</div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRename()}
          style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '10px 12px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={handleRename} disabled={!name.trim() || saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: !name.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelGearMenu({ onRename, onDelete, onClose }: { onRename: () => void; onDelete: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const itemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', background: 'none',
    border: 'none', cursor: 'pointer', padding: '6px 10px', fontSize: '13px', borderRadius: '4px',
  };

  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: '100%', zIndex: 100,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
      padding: '4px', minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      <button onClick={() => { onRename(); onClose(); }} style={{ ...itemStyle, color: 'var(--text)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        Rename channel
      </button>
      <button onClick={() => { onDelete(); onClose(); }} style={{ ...itemStyle, color: '#da3633' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(218,54,51,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        Delete channel
      </button>
    </div>
  );
}

// Group icons — empty so all groups fall back to first-letter display
const GROUP_ICONS: Record<string, React.ReactNode> = {};

export default function Sidebar({ org, channels: initialChannels, groups, currentUser, orgSlug, isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [channels, setChannels] = useState(initialChannels);
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState<string | null>(null);
  const [addingForAgent, setAddingForAgent] = useState<{ agentId: string; agent: Agent } | null>(null);
  const [renamingChannel, setRenamingChannel] = useState<(PortalChannel & { agents: Agent }) | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  // Active group — default to first group, persist in localStorage
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('portal_active_group') ?? (groups[0]?.id ?? null);
    }
    return groups[0]?.id ?? null;
  });

  function selectGroup(id: string) {
    setActiveGroupId(id);
    if (typeof window !== 'undefined') localStorage.setItem('portal_active_group', id);
  }

  // Unread tracking via DB (portal_channel_members.last_seen_at)
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [latestMsg, setLatestMsg] = useState<Record<string, string>>({});

  // Load last_seen_at from DB on mount — works cross-device
  useEffect(() => {
    async function loadLastSeen() {
      const { data } = await supabase
        .from('portal_channel_members')
        .select('channel_id, last_seen_at')
        .eq('user_id', currentUser.id);
      if (!data) return;
      const seen: Record<string, string> = {};
      for (const row of data) {
        if (row.last_seen_at) seen[row.channel_id] = row.last_seen_at;
      }
      setLastSeen(seen);
    }
    loadLastSeen();
  }, [currentUser.id]);

  // Seed initial unread state from DB — catches messages that arrived before page load
  useEffect(() => {
    const activeChannelIds = initialChannels.map(c => c.id);
    if (activeChannelIds.length === 0) return;
    supabase
      .from('portal_messages')
      .select('channel_id, created_at')
      .in('channel_id', activeChannelIds)
      .neq('sender_type', 'user')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const latest: Record<string, string> = {};
        for (const row of data) {
          if (!latest[row.channel_id]) latest[row.channel_id] = row.created_at;
        }
        setLatestMsg(latest);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous channel so we can mark it as seen when leaving
  const prevChId = useRef<string | null>(null);

  // Mark channels as seen when pathname changes — write to DB for cross-device sync
  useEffect(() => {
    const parts = pathname.split('/');
    const chId = parts[parts.length - 1];
    const now = new Date().toISOString();

    const toMark: string[] = [];
    if (chId && chId !== orgSlug) toMark.push(chId);
    if (prevChId.current && prevChId.current !== chId) toMark.push(prevChId.current);

    if (toMark.length > 0) {
      // Optimistic local update so dot clears immediately
      setLastSeen(prev => {
        const updated = { ...prev };
        for (const id of toMark) updated[id] = now;
        return updated;
      });
      // Persist each to DB
      for (const id of toMark) {
        fetch('/api/mark-seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: id }),
        }).catch(() => {});
      }
    }

    prevChId.current = (chId && chId !== orgSlug) ? chId : null;
  }, [pathname, orgSlug]);

  // Subscribe to new messages to track unread
  useEffect(() => {
    const activeChannelIds = channels.map(c => c.id);
    if (activeChannelIds.length === 0) return;
    const sub = supabase
      .channel('sidebar_unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages' }, (payload) => {
        const msg = payload.new as { channel_id: string; created_at: string; sender_type: string };
        if (msg.sender_type === 'user') return; // don't flag own messages as unread
        if (!activeChannelIds.includes(msg.channel_id)) return;
        setLatestMsg(prev => ({ ...prev, [msg.channel_id]: msg.created_at }));
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channels]);

  function hasUnread(chId: string) {
    const latest = latestMsg[chId];
    if (!latest) return false;
    const seen = lastSeen[chId];
    if (!seen) return true;
    return latest > seen;
  }

  // Filter channels to active group
  const filteredChannels = channels.filter(ch => {
    if (!activeGroupId) return true;
    return ch.agents?.group_id === activeGroupId;
  });

  const grouped = filteredChannels.filter(ch => ch.agents?.active !== false && ch.active !== false).reduce<Record<string, { agent: Agent; channels: (PortalChannel & { agents: Agent })[] }>>(
    (acc, ch) => {
      const key = ch.agents?.display_name ?? 'Other';
      if (!acc[key]) acc[key] = { agent: ch.agents, channels: [] };
      acc[key].channels.push(ch);
      return acc;
    }, {}
  );

  const activeGroup = groups.find(g => g.id === activeGroupId);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function deleteChannel(chId: string) {
    if (!confirm('Delete this channel and all its messages?')) return;
    setChannels(prev => prev.filter(c => c.id !== chId));
    await supabase.from('portal_messages').delete().eq('channel_id', chId);
    await supabase.from('portal_channels').delete().eq('id', chId);
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

      {renamingChannel && (
        <RenameChannelModal
          channel={renamingChannel}
          onClose={() => setRenamingChannel(null)}
          onRenamed={(newName) => setChannels(prev => prev.map(c => c.id === renamingChannel.id ? { ...c, display_name: newName } : c))}
        />
      )}

      <nav
        className={`sidebar${isOpen ? ' open' : ''}`}
        style={{ flexDirection: 'row' }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          (e.currentTarget as any)._swipeStartX = touch.clientX;
          (e.currentTarget as any)._swipeStartY = touch.clientY;
        }}
        onTouchEnd={(e) => {
          const startX = (e.currentTarget as any)._swipeStartX;
          const startY = (e.currentTarget as any)._swipeStartY;
          if (startX == null) return;
          const dx = e.changedTouches[0].clientX - startX;
          const dy = Math.abs(e.changedTouches[0].clientY - startY);
          // Swipe left at least 60px, not mostly vertical
          if (dx < -60 && dy < Math.abs(dx) * 0.8) onClose();
        }}
      >
        {/* Group Rail — left icon strip */}
        {groups.length > 0 && (
          <div style={{
            width: 52,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 12,
            paddingBottom: 8,
            gap: 4,
            background: 'rgba(0,0,0,0.15)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}>
            {groups.map(g => {
              const isActive = g.id === activeGroupId;
              return (
                <button
                  key={g.id}
                  onClick={() => selectGroup(g.id)}
                  title={g.name}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: isActive ? '12px' : '50%',
                    background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    transition: 'border-radius 0.2s, background 0.15s',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {GROUP_ICONS[g.slug] ?? (
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{g.name.charAt(0)}</span>
                  )}
                  {/* Active indicator pill */}
                  {isActive && (
                    <span style={{
                      position: 'absolute',
                      left: -8,
                      width: 4,
                      height: 20,
                      background: 'var(--text)',
                      borderRadius: '0 4px 4px 0',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Right panel — header + nav + footer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Image src="/logo.png" alt="Empower Building" width={28} height={28} style={{ objectFit: 'contain', borderRadius: '4px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', lineHeight: 1.2 }}>
                  {activeGroup ? activeGroup.name : org.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Agent Portal</div>
              </div>
            </div>

          </div>
        </div>

        <div className="sidebar-nav">
          {Object.entries(grouped).map(([agentName, { agent, channels: agentChannels }]) => (
            <div key={agentName} className="agent-group">
              <div className="agent-group-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{agentName}</span>
                  <StatusDot status={agent?.container_status ?? 'stopped'} />
                </div>
                {currentUser.role === 'owner' && (
                  <button onClick={() => setAddingForAgent({ agentId: agent.id, agent })} title="Add channel" style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                    fontSize: '16px', padding: '0 4px', lineHeight: 1, opacity: 0.6,
                  }}>+</button>
                )}
              </div>

              {agentChannels.map(ch => {
                const href = `/${orgSlug}/${ch.id}`;
                const isActive = pathname === href;
                const unread = hasUnread(ch.id) && !isActive;
                return (
                  <div
                    key={ch.id}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center',
                      borderTop: dragOverId === ch.id ? '2px solid var(--accent)' : '2px solid transparent',
                      transition: 'border-color 0.1s',
                    }}
                    onMouseEnter={() => setHoveredChannel(ch.id)}
                    onMouseLeave={() => { setHoveredChannel(null); }}
                    draggable
                    onDragStart={() => { draggedIdRef.current = ch.id; }}
                    onDragOver={e => { e.preventDefault(); setDragOverId(ch.id); }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={async e => {
                      e.preventDefault();
                      setDragOverId(null);
                      const draggedId = draggedIdRef.current;
                      if (!draggedId || draggedId === ch.id) return;
                      draggedIdRef.current = null;

                      // Reorder: move dragged channel to just before drop target
                      setChannels(prev => {
                        const list = [...prev];
                        const fromIdx = list.findIndex(c => c.id === draggedId);
                        const toIdx = list.findIndex(c => c.id === ch.id);
                        if (fromIdx === -1 || toIdx === -1) return prev;
                        const [moved] = list.splice(fromIdx, 1);
                        list.splice(toIdx, 0, moved);
                        // Persist new positions
                        list.forEach((c, i) => {
                          supabase.from('portal_channels').update({ position: i }).eq('id', c.id).then(() => {});
                        });
                        return list;
                      });
                    }}
                    onDragEnd={() => { setDragOverId(null); draggedIdRef.current = null; }}
                  >
                    <Link
                      href={href}
                      className={`channel-link${isActive ? ' active' : ''}`}
                      onClick={onClose}
                      style={{ flex: 1 }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.display_name}
                      </span>
                      {unread && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                          flexShrink: 0, display: 'inline-block',
                        }} />
                      )}

                    </Link>

                    {/* Gear — visible on hover (desktop) or always (mobile), opens delete menu */}
                    {currentUser.role === 'owner' && (
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          className="channel-gear-btn"
                          onClick={e => { e.preventDefault(); setGearOpen(gearOpen === ch.id ? null : ch.id); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--muted)', fontSize: '13px', padding: '4px 6px',
                            lineHeight: 1,
                            transition: 'opacity 0.15s',
                            minWidth: '28px', textAlign: 'center',
                          }}
                          title="Channel settings"
                        >⚙</button>
                        {gearOpen === ch.id && (
                          <ChannelGearMenu
                            onRename={() => setRenamingChannel(ch)}
                            onDelete={() => deleteChannel(ch.id)}
                            onClose={() => setGearOpen(null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 700, flexShrink: 0,
          }}>
            {currentUser.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{currentUser.role}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Link href="/" onClick={onClose} title="Switch workspace" style={{ color: 'var(--muted)', padding: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </Link>
            <Link href={`/${orgSlug}/crons`} onClick={onClose} title="Cron Jobs" style={{ color: 'var(--muted)', padding: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}><IconClock size={15} /></Link>
            <Link href={`/${orgSlug}/settings`} onClick={onClose} title="Settings" style={{ color: 'var(--muted)', padding: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}><IconGear size={15} /></Link>
            <button onClick={handleSignOut} title="Sign out" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          </div>
        </div>{/* end sidebar-footer */}
        </div>{/* end right panel */}
      </nav>
    </>
  );
}
