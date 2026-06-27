'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import MessageBubble from './MessageBubble';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string };
  orgId: string;
}

export default function ChatWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'portal_messages',
          filter: `channel_id=eq.${channel.id}`,
        },
        (payload) => {
          const msg = payload.new as PortalMessage;
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    await supabase.from('portal_messages').insert({
      channel_id: channel.id,
      org_id: orgId,
      sender_type: 'user',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content,
      processed: false,
    });

    setSending(false);
  }

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
          {channel.description && (
            <div className="text-xs" style={{ color: '#666' }}>{channel.description}</div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-center py-12" style={{ color: '#555' }}>
            <div className="text-3xl mb-2">{channel.icon}</div>
            <div className="text-sm">Start the conversation</div>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} currentUserId={currentUser.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="px-4 pb-4 shrink-0"
      >
        <div
          className="flex items-end gap-2 rounded-xl px-4 py-3"
          style={{ background: '#1e1e1e', border: '1px solid #2a2a2a' }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e as unknown as React.FormEvent);
              }
            }}
            placeholder={`Message ${channel.display_name}...`}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none"
            style={{ color: '#f0f0f0', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
            style={{
              background: '#B8860B',
              color: '#fff',
              opacity: !input.trim() || sending ? 0.4 : 1,
            }}
          >
            Send
          </button>
        </div>
        <div className="text-xs mt-1.5 text-center" style={{ color: '#444' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </form>
    </div>
  );
}
