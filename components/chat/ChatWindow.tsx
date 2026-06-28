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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel.id}`)
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

  function handleSelect(id: string, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    setSelected(new Set());
    setConfirming(false);
    for (const id of ids) {
      await supabase.from('portal_messages').delete().eq('id', id);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Confirm delete modal */}
      {confirming && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
            padding: '24px', width: '280px', display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Delete {selected.size} message{selected.size > 1 ? 's' : ''}?</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This can't be undone.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={deleteSelected} style={{ padding: '8px 16px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="channel-header">
        <span style={{ fontSize: '18px' }}>{channel.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{channel.display_name}</div>
          {channel.description && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{channel.description}</div>}
        </div>
      </div>

      <div className="messages-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">{channel.icon}</span>
            <span className="label">Start the conversation</span>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            currentUserId={currentUser.id}
            selected={selected.has(msg.id)}
            onSelect={handleSelect}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div style={{
          padding: '10px 16px', background: '#161b22', borderTop: '1px solid #30363d',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSelected(new Set())} style={{ padding: '6px 12px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            <button onClick={() => setConfirming(true)} style={{ padding: '6px 12px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Delete {selected.size}</button>
          </div>
        </div>
      )}

      <div className="input-area">
        <div className="input-row">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={`Message ${channel.display_name}…`}
            rows={1}
          />
          <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || sending}>
            {sending ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
