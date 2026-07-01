'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalMessage } from '@/lib/types';

interface Props {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onJumpTo: (messageId: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#4c8bf044', color: 'var(--text)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
      : part
  );
}

export default function SearchModal({ channelId, channelName, onClose, onJumpTo }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('portal_messages')
        .select('*')
        .eq('channel_id', channelId)
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      setResults((data ?? []) as PortalMessage[]);
      setSearched(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, channelId]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '80px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', width: '100%', maxWidth: '600px', margin: '0 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 120px)' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid #30363d' }}>
          <span style={{ fontSize: '18px', opacity: 0.5 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search in ${channelName}…`}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '15px' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' }}>✕</button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}>Esc</button>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>Searching…</div>
          )}
          {!loading && searched && results.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
              No messages found for <strong style={{ color: 'var(--text)' }}>"{query}"</strong>
            </div>
          )}
          {!loading && !searched && !query && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Type to search messages in this channel
            </div>
          )}
          {!loading && results.map(msg => (
            <div
              key={msg.id}
              onClick={() => { onJumpTo(msg.id); onClose(); }}
              style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#21262d')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                  background: msg.sender_type === 'user' ? '#2a5aa0' : '#30363d',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', color: '#fff', fontWeight: 700,
                }}>
                  {msg.sender_type === 'user' ? (msg.sender_name?.charAt(0) ?? 'U') : '🤖'}
                </div>
                <span style={{ fontWeight: 600, fontSize: '13px', color: msg.sender_type === 'user' ? '#79c0ff' : '#8fb8f5' }}>
                  {msg.sender_name ?? (msg.sender_type === 'user' ? 'User' : 'Agent')}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>{formatDate(msg.created_at)}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, paddingLeft: '32px', wordBreak: 'break-word' }}>
                {highlight(msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content, query)}
              </div>
              {msg.attachments?.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', paddingLeft: '32px', marginTop: '4px' }}>📎 {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}</div>
              )}
            </div>
          ))}
          {!loading && results.length > 0 && (
            <div style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} — click to jump
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
