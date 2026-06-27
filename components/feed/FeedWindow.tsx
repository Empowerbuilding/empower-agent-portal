'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function FeedWindow({ channel, initialMessages }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const sub = supabase
      .channel(`feed:${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'portal_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        const msg = payload.new as PortalMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
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
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Read-only feed</div>
        </div>
      </div>

      <div className="feed-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">{channel.icon}</span>
            <span className="label">No updates yet</span>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="feed-card">
            <div className="feed-card-meta">
              <span style={{ fontWeight: 600 }}>{msg.sender_name ?? 'System'}</span>
              <span>{formatTime(msg.created_at)}</span>
            </div>
            <div className="feed-card-body">{msg.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
