'use client';

import { useState, useEffect, useRef } from 'react';
import { useMobileToolbar } from '@/context/MobileToolbar';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import MessageBubble from './MessageBubble';
import SearchModal from './SearchModal';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string; role?: string };
  orgId: string;
}

const SUPABASE_URL = 'https://xqvnpcxyyxxxydescfzw.supabase.co';

export default function ChatWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [contextPct, setContextPct] = useState<number | null>(null);
  const { setToolbar } = useMobileToolbar();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = selected.size === messages.length && messages.length > 0;
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFile, setStagedFile] = useState<{ file: File; previewUrl: string } | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
        .limit(100);
      if (data) {
        setMessages(data as PortalMessage[]);
        // If agent already replied, clear typing indicator
        const hasAgentReply = data.some((m: PortalMessage) => m.sender_type !== 'user');
        if (hasAgentReply) setAgentTyping(false);
        // Scroll to bottom after fresh fetch so response is visible
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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

  useEffect(() => {
    async function fetchPct() {
      try {
        const res = await fetch('/api/context-stats');
        if (res.ok) {
          const data = await res.json();
          // session key uses channel.id (e.g. barnhaus-vanessa-larry)
          if (data[channel.id] !== undefined) setContextPct(data[channel.id].pct);
        }
      } catch {}
    }
    fetchPct();
    const interval = setInterval(fetchPct, 60000);
    return () => clearInterval(interval);
  }, [channel.name]);

  async function handleResetContext() {
    setResetting(true);
    try {
      const res = await fetch('/api/reset-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId: channel.id }),
      });
      const data = await res.json();
      console.log('[reset-context] response:', res.status, data);
      if (data.success) {
        // Insert a local system message so user sees confirmation
        setMessages(prev => [...prev, {
          id: `reset-${Date.now()}`,
          channel_id: channel.id,
          org_id: orgId,
          sender_type: 'system',
          sender_id: null,
          sender_name: 'System',
          content: '🔄 Agent context cleared. Fresh session started.',
          attachments: [],
          metadata: {},
          processed: true,
          created_at: new Date().toISOString(),
        } as any]);
      }
    } catch (e) {
      console.error('reset failed', e);
    }
    setContextPct(null);
    setResetting(false);
  }

  function handleJumpTo(messageId: string) {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = '#C49A0F22';
      setTimeout(() => { if (el) el.style.background = ''; }, 2000);
    }
  }

  // Inject action buttons into OrgShell mobile header
  useEffect(() => {
    if (deleteMode) {
      setToolbar(
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)' }}>
            <input type="checkbox" checked={allSelected} onChange={selectAll} style={{ accentColor: '#C49A0F', cursor: 'pointer', width: 15, height: 15 }} />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}>Cancel</button>
        </>
      );
    } else {
      const color = contextPct !== null ? (contextPct >= 50 ? '#da3633' : contextPct >= 30 ? '#d29922' : '#2ea043') : null;
      setToolbar(
        <>
          <button onClick={() => setSearchOpen(true)} title="Search" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '15px', padding: '4px 6px', opacity: 0.7 }}>🔍</button>
          {color && <span style={{ fontSize: '11px', fontWeight: 600, color, background: `${color}22`, borderRadius: '4px', padding: '2px 5px' }}>{contextPct}%</span>}
          <button onClick={async () => { if (!window.confirm('Clear agent context? Past messages stay visible but the agent starts fresh.')) return; await handleResetContext(); }} disabled={resetting} title="Reset context" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: resetting ? 'wait' : 'pointer', fontSize: '15px', padding: '4px 6px', opacity: resetting ? 0.3 : 0.7 }}>{resetting ? '⏳' : '🔄'}</button>
          <button onClick={() => setDeleteMode(true)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '4px 6px', opacity: 0.7 }}>🗑</button>
        </>
      );
    }
    return () => setToolbar(null);
  }, [contextPct, resetting, deleteMode, allSelected]);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setStagedFile({ file, previewUrl });
    if (fileRef.current) fileRef.current.value = '';
  }

  function clearStagedFile() {
    if (stagedFile) URL.revokeObjectURL(stagedFile.previewUrl);
    setStagedFile(null);
  }

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input is not supported in this browser.'); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec;

    let baseText = input;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      const sep = baseText && !baseText.endsWith(' ') ? ' ' : '';
      setInput(baseText + sep + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content && !stagedFile || sending) return;
    setSending(true);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let attachments: { url: string; name: string; type: string }[] = [];
    if (stagedFile) {
      setUploading(true);
      const path = `${orgId}/${channel.id}/${Date.now()}-${stagedFile.file.name}`;
      const { error } = await supabase.storage.from('portal-attachments').upload(path, stagedFile.file, { upsert: true });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('portal-attachments').getPublicUrl(path);
        attachments = [{ url: publicUrl, name: stagedFile.file.name, type: stagedFile.file.type }];
      }
      clearStagedFile();
      setUploading(false);
    }

    await supabase.from('portal_messages').insert({
      channel_id: channel.id,
      org_id: orgId,
      sender_type: 'user',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: content || (attachments[0]?.name ?? ''),
      ...(attachments.length ? { attachments } : {}),
      processed: false,
    });
    setSending(false);
    setAgentTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setAgentTyping(false), 90000);
  }

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
      <div className="channel-header" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
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
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setSearchOpen(true)} title="Search messages" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '4px 8px', opacity: 0.6 }}>🔍</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {contextPct !== null && (() => {
                    const color = contextPct >= 50 ? '#da3633' : contextPct >= 30 ? '#d29922' : '#2ea043';
                    return <span style={{ fontSize: '11px', fontWeight: 600, color, background: `${color}22`, borderRadius: '4px', padding: '2px 6px' }}>{contextPct}%</span>;
                  })()}
                  <button onClick={async () => { if (!window.confirm('Clear agent context? Past messages stay visible but the agent starts fresh.')) return; await handleResetContext(); }} disabled={resetting} title="Clear agent context" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: resetting ? 'wait' : 'pointer', fontSize: '16px', padding: '4px 4px', opacity: resetting ? 0.3 : 0.6 }}>{resetting ? '⏳' : '🔄'}</button>
                </div>
              <button onClick={() => setDeleteMode(true)} title="Delete messages" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '4px 8px', opacity: 0.6 }}>🗑</button>
            </div>
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
          <div key={msg.id} ref={el => { messageRefs.current[msg.id] = el; }} style={{ transition: 'background 0.5s' }}>
            <MessageBubble message={msg} currentUserId={currentUser.id}
              deleteMode={deleteMode} selected={selected.has(msg.id)} onSelect={handleSelect} />
          </div>
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

      {searchOpen && (
        <SearchModal
          channelId={channel.id}
          channelName={channel.display_name}
          onClose={() => setSearchOpen(false)}
          onJumpTo={handleJumpTo}
        />
      )}

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
            {stagedFile && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {stagedFile.file.type.startsWith('image/') ? (
                  <img src={stagedFile.previewUrl} alt={stagedFile.file.name}
                    style={{ height: '48px', width: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #30363d' }} />
                ) : (
                  <div style={{ height: '48px', display: 'flex', alignItems: 'center', gap: '4px', background: '#21262d', borderRadius: '6px', padding: '0 8px', fontSize: '12px', color: 'var(--muted)', maxWidth: '120px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    📎 {stagedFile.file.name}
                  </div>
                )}
                <button onClick={clearStagedFile}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px', borderRadius: '50%', background: '#30363d', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${channel.display_name}…`}
              rows={1}
            />
            <button onClick={toggleVoice} title={listening ? 'Stop recording' : 'Voice input'}
              style={{ background: listening ? 'rgba(196,154,15,0.15)' : 'none', border: listening ? '1px solid var(--accent)' : 'none', borderRadius: '6px', cursor: 'pointer', color: listening ? 'var(--accent)' : 'var(--muted)', fontSize: '18px', padding: '0 6px', flexShrink: 0, opacity: listening ? 1 : 0.7, transition: 'all 0.15s' }}>
              {listening ? '🔴' : '🎤'}
            </button>
            <button className="send-btn" onClick={sendMessage} disabled={(!input.trim() && !stagedFile) || sending}>
              {sending ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
