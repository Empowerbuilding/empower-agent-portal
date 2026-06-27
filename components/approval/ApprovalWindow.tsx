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

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ApprovalCard({
  message,
  currentUser,
  orgId,
  channelId,
}: {
  message: PortalMessage;
  currentUser: { id: string; name: string };
  orgId: string;
  channelId: string;
}) {
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<'pending' | 'approved' | 'sent'>(
    (message.metadata?.approval_state as string) === 'approved' ? 'approved' :
    (message.metadata?.approval_state as string) === 'sent' ? 'sent' : 'pending'
  );
  const supabase = createClient();

  async function approve() {
    if (!reply.trim()) return;

    await supabase.from('portal_messages').update({
      metadata: { ...message.metadata, approval_state: 'approved', approved_reply: reply, approved_by: currentUser.name },
    }).eq('id', message.id);

    setStatus('approved');
  }

  return (
    <div className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
      {/* Incoming message */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold" style={{ color: '#888' }}>
            {message.sender_name ?? 'System'}
          </span>
          <span className="text-xs" style={{ color: '#444' }}>{formatTime(message.created_at)}</span>
          {status === 'sent' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: '#1a3a1a', color: '#4ade80' }}>
              ✓ Sent
            </span>
          )}
          {status === 'approved' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: '#1a2a1a', color: '#86efac' }}>
              ⏳ Queued
            </span>
          )}
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#d0d0d0' }}>
          {message.content}
        </div>
      </div>

      {/* Reply input — only show if pending */}
      {status === 'pending' && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #2a2a2a' }}>
          <div className="text-xs mb-2" style={{ color: '#666' }}>Reply:</div>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Type your reply..."
            rows={2}
            className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none"
            style={{ background: '#252525', border: '1px solid #333', color: '#f0f0f0' }}
          />
          <button
            onClick={approve}
            disabled={!reply.trim()}
            className="mt-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
            style={{ background: '#B8860B', color: '#fff', opacity: reply.trim() ? 1 : 0.4 }}
          >
            Approve & Send
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const sub = supabase
      .channel(`approval:${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'portal_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        const msg = payload.new as PortalMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'portal_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        const updated = payload.new as PortalMessage;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-5 py-3 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid #2a2a2a', background: '#151515' }}
      >
        <span className="text-lg">{channel.icon}</span>
        <div>
          <div className="font-semibold text-white text-sm">{channel.display_name}</div>
          <div className="text-xs" style={{ color: '#666' }}>Approval queue</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12" style={{ color: '#555' }}>
            <div className="text-3xl mb-2">{channel.icon}</div>
            <div className="text-sm">No pending approvals</div>
          </div>
        )}
        {messages.map(msg => (
          <ApprovalCard
            key={msg.id}
            message={msg}
            currentUser={currentUser}
            orgId={orgId}
            channelId={channel.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
