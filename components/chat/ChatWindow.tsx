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

const SUPABASE_URL = 'https://xqvnpcxyyxxxydescfzw.supabase.co';

export default function ChatWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  // Clear typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!deleteMode) setSelected(new Set());
  }, [deleteMode]);

  // Refresh messages on mount to catch any that arrived while away (Next.js router cache issue)
  useEffect(() => {
    async function refresh() {
      const { data } = await supabase
        .from('portal_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data) {
        setMessages(data as PortalMessage[]);
        // If agent already replied, clear typing indicator
        const hasAgentReply = data.some((m: PortalMessage) => m.sender_type !== 'user');
        if (hasAgentReply) setAgentTyping(false);
      }
    }
    refresh();
  }, [channel.id]);

  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const msg = payload.new as PortalMessage;
          if (msg.sender_type !== 'user') setAgentTyping(false);
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  function handleSelect(id: string, checked: boolean) {
    setSelected(prev => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  }

  function selectAll() {
    if (selected.size === messages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(messages.map(m => m.id)));
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    setSelected(new Set());
    setConfirming(false);
    setDeleteMode(false);
    for (const id of ids) await supabase.from('portal_messages').delete().eq('id', id);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${orgId}/${channel.id}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from('portal-attachments').upload(path, file, { upsert: true });
    if (error) { setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('portal-attachments').getPublicUrl(path);
    await supabase.from('portal_messages').insert({
      channel_id: channel.id,
      org_id: orgId,
      sender_type: 'user',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: file.name,
      attachments: [{ url: publicUrl, name: file.name, type: file.type }],
      processed: false,
    });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  async function sendMessage() {
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
    setAgentTyping(true);
    // Clear typing indicator after 90s as fallback
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setAgentTyping(false), 90000);
  }

  const allSelected = selected.size === messages.length && messages.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Confirm modal */}
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px', width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Delete {selected.size} message{selected.size !== 1 ? 's' : ''}?</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This can't be undone.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={deleteSelected} style={{ padding: '8px 16px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Channel header */}
      <div className="channel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {deleteMode ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)' }}>
              <input type="checkbox" checked={allSelected} onChange={selectAll} style={{ accentColor: '#C49A0F', cursor: 'pointer' }} />
              {allSelected ? 'Deselect all' : 'Select all'}
            </label>
            <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>{channel.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{channel.display_name}</div>
                {channel.description && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{channel.description}</div>}
              </div>
            </div>
            <button onClick={() => setDeleteMode(true)} title="Delete messages" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', opacity: 0.6 }}>🗑</button>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="messages-list">
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="icon">{channel.icon}</span>
            <span className="label">Start the conversation</span>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} currentUserId={currentUser.id}
            deleteMode={deleteMode} selected={selected.has(msg.id)} onSelect={handleSelect} />
        ))}
        {agentTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
            <div className="msg-avatar" style={{ background: '#1a3a2a', color: '#fff', flexShrink: 0 }}>🤖</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#161b22', borderRadius: '12px', padding: '10px 14px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#56d364', display: 'inline-block', animation: 'typing-bounce 1s infinite' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#56d364', display: 'inline-block', animation: 'typing-bounce 1s infinite 0.2s' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#56d364', display: 'inline-block', animation: 'typing-bounce 1s infinite 0.4s' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Delete action bar */}
      {deleteMode && (
        <div style={{ padding: '10px 16px', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{selected.size} selected</span>
          <button
            onClick={() => selected.size > 0 && setConfirming(true)}
            disabled={selected.size === 0}
            style={{ padding: '8px 20px', background: selected.size > 0 ? '#da3633' : '#30363d', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', fontSize: '13px' }}
          >
            Delete{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {/* Input */}
      {!deleteMode && (
        <div className="input-area">
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFileChange} style={{ display: 'none' }} />
          <div className="input-row">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach file"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', padding: '0 4px', flexShrink: 0, opacity: uploading ? 0.4 : 0.7 }}>
              {uploading ? '⏳' : '📎'}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${channel.display_name}…`}
              rows={1}
            />
            <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || sending}>
              {sending ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
