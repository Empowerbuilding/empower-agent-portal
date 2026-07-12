'use client';

import { useState, useEffect, useRef } from 'react';
import { useMobileToolbar } from '@/context/MobileToolbar';
import { IconMic, IconMicOff, IconPaperclip, IconSend, IconSearch } from '@/components/ui/Icons';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import MessageBubble from './MessageBubble';
import SearchModal from './SearchModal';
import ChatOverflowMenu from './ChatOverflowMenu';
import PresenceButton from '@/components/presence/PresenceButton';
import { playSend, playReceive, unlockAudio } from '@/lib/sounds';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string; role?: string };
  orgId: string;
}

const SUPABASE_URL = 'https://xqvnpcxyyxxxydescfzw.supabase.co';

export default function ChatWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const draftKey = `portal-draft-${channel.id}`;
  const [input, setInput] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(draftKey) ?? '';
    return '';
  });
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
  const [stagedFiles, setStagedFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    fetch(`${SUPABASE_URL}/rest/v1/portal_channel_members?channel_id=eq.${channel.id}&select=user_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).then(r => r.json()).then((rows: unknown[]) => {
      if (Array.isArray(rows)) setMemberCount(rows.length);
    }).catch(() => {});
  }, [channel.id]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) {
      // Defer initial snap scroll by one animation frame so the browser has
      // applied CSS layout (incl. mobile header padding-top) before we calculate
      // scroll position. Without this, PWA cold-opens can render the first
      // message behind the fixed header.
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
      isInitialLoad.current = false;
    } else {
      // Smooth scroll only for new incoming messages
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!deleteMode) setSelected(new Set());
  }, [deleteMode]);

  // Shared refresh — fetches latest messages + restores typing indicator state
  const refresh = async () => {
    const { data: rawData } = await supabase
      .from('portal_messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(100);
    const data = rawData ? [...rawData].reverse() : null;
    if (data) {
      setMessages(data as PortalMessage[]);
      const lastMsg = data[data.length - 1];
      const isRecentUserMsg = lastMsg && lastMsg.sender_type === 'user' &&
        (Date.now() - new Date(lastMsg.created_at).getTime()) < 5 * 60 * 1000;
      if (isRecentUserMsg) {
        setAgentTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setAgentTyping(false), 90000);
      } else {
        setAgentTyping(false);
      }
      setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 50);
    }
  };

  // Refresh on mount (catch messages missed while away)
  useEffect(() => {
    refresh();
  }, [channel.id]);

  // Restore draft when switching channels
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem(`portal-draft-${channel.id}`) ?? '') : '';
    setInput(saved);
  }, [channel.id]);

  // Refresh when app comes back to foreground (realtime socket drops in background on mobile)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [channel.id]);

  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const msg = payload.new as PortalMessage;
          const msgIsRecent = (Date.now() - new Date(msg.created_at).getTime()) < 5 * 60 * 1000;
          if (msg.sender_type === 'user' && msgIsRecent) {
            setAgentTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setAgentTyping(false), 90000);
          } else {
            setAgentTyping(false);
            // Play receive sound for agent/system messages
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              playReceive();
              return [...prev, msg];
            });
            return;
          }
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

  async function handleJumpTo(messageId: string) {
    // Try the fast path — message already in DOM
    const tryScroll = (id: string) => {
      const el = messageRefs.current[id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.background = 'var(--accent)22';
        setTimeout(() => { if (el) el.style.background = ''; }, 2000);
        return true;
      }
      return false;
    };

    if (tryScroll(messageId)) return;

    // Message not in DOM — fetch messages around that timestamp and re-render
    const { data: targetMsg } = await supabase
      .from('portal_messages')
      .select('created_at')
      .eq('id', messageId)
      .single();

    if (!targetMsg) return;

    // Fetch 50 messages before and 50 after the target
    const [{ data: before }, { data: after }] = await Promise.all([
      supabase
        .from('portal_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .lte('created_at', targetMsg.created_at)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('portal_messages')
        .select('*')
        .eq('channel_id', channel.id)
        .gt('created_at', targetMsg.created_at)
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    const merged = [
      ...([...(before ?? [])].reverse()),
      ...((after ?? [])),
    ] as PortalMessage[];

    setMessages(merged);

    // Wait for React to render the new messages, then scroll
    setTimeout(() => tryScroll(messageId), 150);
  }

  // Inject action buttons into OrgShell mobile header
  useEffect(() => {
    if (deleteMode) {
      setToolbar(
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)' }}>
            <input type="checkbox" checked={allSelected} onChange={selectAll} style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: 15, height: 15 }} />
            {allSelected ? 'Deselect all' : 'Select all'}
          </label>
          <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}>Cancel</button>
        </>
      );
    } else {
      setToolbar(
        <>
          <button onClick={() => setSearchOpen(true)} title="Search" style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: 0.9 }}><IconSearch size={17} /></button>
          <ChatOverflowMenu
            contextPct={contextPct}
            resetting={resetting}
            onResetContext={async () => { if (!window.confirm('Clear agent context? Past messages stay visible but the agent starts fresh.')) return; await handleResetContext(); }}
            onDeleteMode={() => setDeleteMode(true)}
            size={17}
          />
        </>
      );
    }
    return () => setToolbar(null);
  }, [contextPct, resetting, deleteMode, allSelected, orgId]);

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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStagedFiles(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    setStagedFiles(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.items)
      .filter(item => item.kind === 'file' && (item.type.startsWith('image/') || item.type === 'application/pdf'))
      .map(item => item.getAsFile()).filter(Boolean) as File[];
    if (!files.length) return;
    e.preventDefault();
    setStagedFiles(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removeStagedFile(index: number) {
    setStagedFiles(prev => { URL.revokeObjectURL(prev[index].previewUrl); return prev.filter((_, i) => i !== index); });
  }

  function clearStagedFiles() {
    setStagedFiles(prev => { prev.forEach(f => URL.revokeObjectURL(f.previewUrl)); return []; });
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
    rec.continuous = true;
    recognitionRef.current = rec;

    let baseText = input;
    rec.onresult = (e: any) => {
      // Collect finalized segments + one interim segment at the end
      let finals = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      const spoken = finals + interim;
      const sep = baseText && !baseText.endsWith(' ') ? ' ' : '';
      const newVal = baseText + sep + spoken;
      localStorage.setItem(draftKey, newVal);
      setInput(newVal);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    localStorage.setItem(draftKey, e.target.value);
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content && !stagedFiles.length || sending) return;
    setSending(true);
    localStorage.removeItem(draftKey);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let attachments: { url: string; name: string; type: string }[] = [];
    if (stagedFiles.length) {
      setUploading(true);
      for (const staged of stagedFiles) {
        const path = `${orgId}/${channel.id}/${Date.now()}-${staged.file.name}`;
        const { error } = await supabase.storage.from('portal-attachments').upload(path, staged.file, { upsert: true });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from('portal-attachments').getPublicUrl(path);
          attachments.push({ url: publicUrl, name: staged.file.name, type: staged.file.type });
        }
      }
      clearStagedFiles();
      setUploading(false);
    }

    unlockAudio();
    playSend();
    await supabase.from('portal_messages').insert({
      channel_id: channel.id,
      org_id: orgId,
      sender_type: 'user',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: content || attachments.map(a => a.name).join(', ') || '',
      ...(attachments.length ? { attachments } : {}),
      processed: false,
    });
    setSending(false);
    setAgentTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setAgentTyping(false), 90000);
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(59,130,246,0.08)',
          border: '2px dashed var(--accent, #3b82f6)',
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--accent, #3b82f6)', fontSize: '16px', fontWeight: 600 }}>Drop file to attach</span>
        </div>
      )}
      {/* Confirm modal */}
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Delete {selected.size} message{selected.size !== 1 ? 's' : ''}?</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This can't be undone.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
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
              <input type="checkbox" checked={allSelected} onChange={selectAll} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
              {allSelected ? 'Deselect all' : 'Select all'}
            </label>
            <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}># {channel.display_name}</span>
              {memberCount !== null && (
                <span style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1 }}>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <PresenceButton orgId={orgId} openDirection="down" align="right" size={15} />
              <button onClick={() => setSearchOpen(true)} title="Search" style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: 0.85 }}><IconSearch size={17} /></button>
              <ChatOverflowMenu
                contextPct={contextPct}
                resetting={resetting}
                onResetContext={async () => { if (!window.confirm('Clear agent context? Past messages stay visible but the agent starts fresh.')) return; await handleResetContext(); }}
                onDeleteMode={() => setDeleteMode(true)}
                size={16}
              />
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="messages-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <span className="label" style={{ color: 'var(--muted)', fontSize: '13px' }}>No messages yet — start the conversation</span>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const sameSender = prev && prev.sender_type === msg.sender_type && prev.sender_id === msg.sender_id;
          const withinWindow = prev && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60 * 1000;
          const grouped = Boolean(sameSender && withinWindow && msg.sender_type !== 'system');
          return (
            <div key={msg.id} ref={el => { messageRefs.current[msg.id] = el; }} style={{ transition: 'background 0.5s' }}>
              <MessageBubble message={msg} currentUserId={currentUser.id}
                deleteMode={deleteMode} selected={selected.has(msg.id)} onSelect={handleSelect}
                showHeader={!grouped} grouped={grouped} />
            </div>
          );
        })}
        {agentTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
            <div className="msg-avatar" style={{ background: 'var(--surface)', flexShrink: 0 }}><img src="/logo.png" alt="Agent" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', padding: '3px' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface)', borderRadius: '12px', padding: '10px 14px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'typing-bounce 1s infinite' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'typing-bounce 1s infinite 0.2s' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'typing-bounce 1s infinite 0.4s' }} />
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
        <div style={{ padding: '10px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{selected.size} selected</span>
          <button
            onClick={() => selected.size > 0 && setConfirming(true)}
            disabled={selected.size === 0}
            style={{ padding: '8px 20px', background: selected.size > 0 ? '#da3633' : 'var(--border)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', fontSize: '13px' }}
          >
            Delete{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {/* Input */}
      {!deleteMode && (
        <div className="input-area">
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" multiple onChange={handleFileChange} style={{ display: 'none' }} />
          <div className="input-row">
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach file"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '20px', padding: '0 4px', flexShrink: 0, opacity: uploading ? 0.4 : 0.7 }}>
              <IconPaperclip size={18} />
            </button>
            {stagedFiles.map((sf, i) => (
              <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                {sf.file.type.startsWith('image/') ? (
                  <img src={sf.previewUrl} alt={sf.file.name}
                    style={{ height: '48px', width: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                ) : (
                  <div style={{ height: '48px', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--border)', borderRadius: '6px', padding: '0 8px', fontSize: '12px', color: 'var(--muted)', maxWidth: '120px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    📎 {sf.file.name}
                  </div>
                )}
                <button onClick={() => removeStagedFile(i)}
                  style={{ position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--border)', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            ))}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              onPaste={handlePaste}
              placeholder={`Message ${channel.display_name}…`}
              rows={1}
            />
            <button onClick={toggleVoice} title={listening ? 'Stop recording' : 'Voice input'}
              style={{ background: listening ? 'rgba(76,139,240,0.15)' : 'none', border: listening ? '1px solid var(--accent)' : 'none', borderRadius: '6px', cursor: 'pointer', color: listening ? 'var(--accent)' : 'var(--muted)', fontSize: '18px', padding: '0 6px', flexShrink: 0, opacity: listening ? 1 : 0.7, transition: 'all 0.15s' }}>
              {listening ? <IconMicOff size={17} /> : <IconMic size={17} />}
            </button>
            <button className="send-btn" onClick={sendMessage} disabled={(!input.trim() && !stagedFiles.length) || sending}>
              {sending ? '…' : <IconSend size={15} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

