'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string };
  orgId: string;
}

function ApprovalCard({ message, currentUser, selected, onSelect, deleteMode }: {
  message: PortalMessage;
  currentUser: { id: string; name: string };
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  deleteMode: boolean;
}) {
  const [reply, setReply] = useState('');
  const approvalState = (message.metadata?.approval_state as string) ?? 'pending';
  const supabase = createClient();

  async function approve() {
    if (!reply.trim()) return;
    await supabase.from('portal_messages')
      .update({ metadata: { ...message.metadata, approval_state: 'approved', approved_reply: reply, approved_by: currentUser.name } })
      .eq('id', message.id);
  }

  const stateColor = approvalState === 'sent' ? '#2ea043' : approvalState === 'approved' ? '#56d364' : 'var(--muted)';
  const stateLabel = approvalState === 'sent' ? '✓ Sent' : approvalState === 'approved' ? '⏳ Queued' : '⏸ Pending';

  return (
    <div
      style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={e => onSelect(message.id, e.target.checked)}
        style={{ opacity: selected ? 1 : 0.3, marginTop: '14px', cursor: 'pointer', accentColor: '#C49A0F', flexShrink: 0, display: deleteMode ? 'block' : 'none' }}
      />
      <div className="feed-card" style={{ flex: 1, minWidth: 0 }}>
        <div className="feed-card-meta">
          <span style={{ fontWeight: 600 }}>{message.sender_name ?? 'System'}</span>
          <span>{new Date(message.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <span style={{ marginLeft: 'auto', color: stateColor, fontWeight: 600 }}>{stateLabel}</span>
        </div>
        <div className="feed-card-body"><Markdown content={message.content} /></div>

        {approvalState === 'pending' && (
          <div className="approval-reply-area">
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Reply:</div>
            <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Type your reply..." rows={2} />
            <button className="approve-btn" onClick={approve} disabled={!reply.trim()}>Approve &amp; Send</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalWindow({ channel, initialMessages, currentUser }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (!deleteMode) setSelected(new Set()); }, [deleteMode]);

  useEffect(() => {
    const sub = supabase
      .channel(`approval:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const msg = payload.new as PortalMessage;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const updated = payload.new as PortalMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  function handleSelect(id: string, checked: boolean) {
    setSelected(prev => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    setSelected(new Set());
    setConfirming(false);
    setDeleteMode(false);
    for (const id of ids) await supabase.from('portal_messages').delete().eq('id', id);
  }

  const allSelected = selected.size === messages.length && messages.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px', width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Delete {selected.size} message{selected.size > 1 ? 's' : ''}?</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This can't be undone.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={deleteSelected} style={{ padding: '8px 16px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="channel-header" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        {deleteMode ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)' }}>
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(messages.map(m => m.id)))} style={{ accentColor: '#C49A0F', cursor: 'pointer' }} />
              {allSelected ? 'Deselect all' : 'Select all'}
            </label>
            <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>{channel.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{channel.display_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Approval queue</div>
              </div>
            </div>
            <button onClick={() => setDeleteMode(true)} title="Delete messages" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', opacity: 0.6 }}>🗑</button>
          </>
        )}
      </div>

      <div className="feed-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">{channel.icon}</span>
            <span className="label">No pending approvals</span>
          </div>
        )}
        {messages.map(msg => (
          <ApprovalCard key={msg.id} message={msg} currentUser={currentUser} selected={selected.has(msg.id)} onSelect={handleSelect} deleteMode={deleteMode} />
        ))}
        <div ref={bottomRef} />
      </div>

      {deleteMode && (
        <div style={{ padding: '10px 16px', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSelected(new Set())} style={{ padding: '6px 12px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            <button onClick={() => setConfirming(true)} style={{ padding: '6px 12px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Delete {selected.size}</button>
          </div>
        </div>
      )}
    </div>
  );
}
