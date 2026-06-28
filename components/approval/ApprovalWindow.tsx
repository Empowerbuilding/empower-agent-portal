'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string };
  orgId: string;
}

function ApprovalCard({ message, currentUser, onDelete }: { message: PortalMessage; currentUser: { id: string; name: string }; onDelete: (id: string) => void }) {
  const [reply, setReply] = useState('');
  const [hovered, setHovered] = useState(false);
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
    <div className="feed-card" style={{ position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && (
        <button onClick={() => onDelete(message.id)} title="Delete" style={{
          position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
          cursor: 'pointer', color: '#da3633', fontSize: '14px', padding: '2px 4px', opacity: 0.8,
        }}>🗑</button>
      )}
      <div className="feed-card-meta">
        <span style={{ fontWeight: 600 }}>{message.sender_name ?? 'System'}</span>
        <span>{new Date(message.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <span style={{ marginLeft: 'auto', color: stateColor, fontWeight: 600 }}>{stateLabel}</span>
      </div>
      <div className="feed-card-body">{message.content}</div>

      {approvalState === 'pending' && (
        <div className="approval-reply-area">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Reply:</div>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Type your reply..."
            rows={2}
          />
          <button className="approve-btn" onClick={approve} disabled={!reply.trim()}>
            Approve &amp; Send
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalWindow({ channel, initialMessages, currentUser }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);

  async function deleteMessage(id: string) {
    setMessages(prev => prev.filter(m => m.id !== id));
    await supabase.from('portal_messages').delete().eq('id', id);
  }
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="channel-header">
        <span style={{ fontSize: '18px' }}>{channel.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{channel.display_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Approval queue</div>
        </div>
      </div>

      <div className="feed-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">{channel.icon}</span>
            <span className="label">No pending approvals</span>
          </div>
        )}
        {messages.map(msg => (
          <ApprovalCard key={msg.id} message={msg} currentUser={currentUser} onDelete={deleteMessage} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
