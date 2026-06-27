'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
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
        event: 'INSERT',
        schema: 'public',
        table: 'portal_messages',
        filter: `channel_id=eq.${channel.id}`,
      }, (payload) => {
        const msg = payload.new as PortalMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid #2a2a2a', background: '#151515' }}
      >
        <span className="text-lg">{channel.icon}</span>
        <div>
          <div className="font-semibold text-white text-sm">{channel.display_name}</div>
          <div className="text-xs" style={{ color: '#666' }}>Read-only feed</div>
        </div>
      </div>

      {/* Feed messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12" style={{ color: '#555' }}>
            <div className="text-3xl mb-2">{channel.icon}</div>
            <div className="text-sm">No updates yet</div>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className="rounded-xl p-4"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: '#888' }}>
                {msg.sender_name ?? 'System'}
              </span>
              <span className="text-xs" style={{ color: '#444' }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#d0d0d0' }}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
