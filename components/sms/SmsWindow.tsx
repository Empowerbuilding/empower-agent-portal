'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';
import { useMobileToolbar } from '@/context/MobileToolbar';
import { IconSend } from '@/components/ui/Icons';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string; role?: string };
  orgId: string;
}

interface SmsConversation {
  contact_phone: string;
  contact_name: string;
  messages: PortalMessage[];
  last_at: string;
  has_pending: boolean;
  has_unread: boolean;
}

function extractPhone(content: string): string | null {
  const m = content.match(/(\+1\d{10}|\+\d{11,})/);
  return m ? m[1] : null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function groupByContact(messages: PortalMessage[]): SmsConversation[] {
  const map = new Map<string, SmsConversation>();
  const seenLastAgent = new Map<string, string>();

  for (const msg of messages) {
    const meta = (msg.metadata || {}) as Record<string, any>;
    const phone = meta.contact_phone || extractPhone(msg.content) || null;
    if (!phone) continue;
    const name = meta.contact_name || phone;

    if (!map.has(phone)) {
      map.set(phone, { contact_phone: phone, contact_name: name, messages: [], last_at: msg.created_at, has_pending: false, has_unread: false });
    }
    const conv = map.get(phone)!;
    // prefer best known name
    if (meta.contact_name && conv.contact_name === phone) conv.contact_name = meta.contact_name;
    conv.messages.push(msg);
    if (msg.created_at > conv.last_at) conv.last_at = msg.created_at;
    if (meta.approval_state === 'pending') conv.has_pending = true;
    // track last agent/system message for unread detection
    if (msg.sender_type !== 'user') seenLastAgent.set(phone, msg.created_at);
  }

  return Array.from(map.values())
    .sort((a, b) => b.last_at.localeCompare(a.last_at));
}

function extractSmsBody(content: string): string {
  const m = content.match(/```\n([\s\S]*?)\n```/);
  if (m) return m[1].trim();
  return content;
}

export default function SmsWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { setToolbar } = useMobileToolbar();

  // Determine user flag from channel id
  const userFlag = channel.id.includes('larry') ? 'larry' : channel.id.includes('shannon') ? 'shannon' : null;

  const conversations = groupByContact(messages);
  const activeConv = selected ? conversations.find(c => c.contact_phone === selected) : conversations[0] || null;

  // Auto-select first conversation
  useEffect(() => {
    if (!selected && conversations.length > 0) setSelected(conversations[0].contact_phone);
  }, [conversations.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length]);

  // Real-time updates
  useEffect(() => {
    const sub = supabase
      .channel(`sms:${channel.id}`)
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

  useEffect(() => {
    setToolbar(null);
    return () => setToolbar(null);
  }, []);

  async function approveDraft(msg: PortalMessage) {
    setApproving(msg.id);
    try {
      const meta = (msg.metadata || {}) as Record<string, any>;
      const to = meta.contact_phone || meta.to;
      if (!to) return;

      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          body: extractSmsBody(msg.content),
          channelId: channel.id,
          contactName: meta.contact_name || null,
          contactId: meta.contact_id || null,
          userFlag,
          draftMessageId: msg.id,
        }),
      });
      const data = await res.json();
      if (!data.ok) console.error('[sms] approve failed:', data.error);
    } finally {
      setApproving(null);
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !activeConv || sending) return;
    setSending(true);
    const body = replyText.trim();
    setReplyText('');
    try {
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeConv.contact_phone,
          body,
          channelId: channel.id,
          contactName: activeConv.contact_name,
          userFlag,
        }),
      });
    } finally {
      setSending(false);
    }
  }

  const lastMsg = (conv: SmsConversation) => {
    const last = [...conv.messages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!last) return '';
    const meta = (last.metadata || {}) as Record<string, any>;
    const dir = meta.direction;
    const body = extractSmsBody(last.content);
    const prefix = dir === 'inbound' ? '← ' : dir === 'outbound' ? '→ ' : '';
    return prefix + body.slice(0, 45) + (body.length > 45 ? '…' : '');
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Contact list */}
      <div style={{
        width: '240px', flexShrink: 0, borderRight: '1px solid #30363d',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        background: '#0d1117',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #30363d', fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Conversations
        </div>
        {conversations.length === 0 && (
          <div style={{ padding: '24px 14px', fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>No messages yet</div>
        )}
        {conversations.map(conv => {
          const isActive = conv.contact_phone === (activeConv?.contact_phone);
          return (
            <button key={conv.contact_phone} onClick={() => setSelected(conv.contact_phone)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px',
                background: isActive ? '#161b22' : 'transparent',
                border: 'none', borderBottom: '1px solid #21262d',
                cursor: 'pointer', transition: 'background 0.1s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.contact_name === conv.contact_phone ? conv.contact_phone : conv.contact_name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginLeft: '6px' }}>
                  {formatTime(conv.last_at)}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {conv.has_pending && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, display: 'inline-block' }} title="Pending draft" />}
                {lastMsg(conv)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Conversation thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '14px' }}>
            Select a conversation
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '10px', background: '#0d1117', flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a3a6a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {activeConv.contact_name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{activeConv.contact_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{activeConv.contact_phone}</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...activeConv.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(msg => {
                const meta = (msg.metadata || {}) as Record<string, any>;
                const direction = meta.direction || (msg.sender_type === 'user' ? 'user' : 'outbound');
                const approvalState = meta.approval_state;
                const isPending = approvalState === 'pending';
                const isSent = approvalState === 'sent' || (direction === 'outbound' && !isPending);
                const isInbound = direction === 'inbound';
                const isApproving = approving === msg.id;
                const body = extractSmsBody(msg.content);

                if (isPending) {
                  return (
                    <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
                      <div style={{ background: '#161b22', border: '1px solid var(--accent)', borderRadius: '12px', padding: '10px 14px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginBottom: '6px' }}>⏸ Draft — tap to send</div>
                        <div style={{ fontSize: '13px', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</div>
                        <button onClick={() => approveDraft(msg)} disabled={isApproving}
                          style={{ marginTop: '10px', width: '100%', padding: '7px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#000', fontWeight: 700, cursor: isApproving ? 'wait' : 'pointer', fontSize: '13px', opacity: isApproving ? 0.6 : 1 }}>
                          {isApproving ? 'Sending…' : '📤 Send'}
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', textAlign: 'right' }}>{formatFull(msg.created_at)}</div>
                    </div>
                  );
                }

                if (isInbound) {
                  return (
                    <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: '75%' }}>
                      <div style={{ background: '#21262d', borderRadius: '12px 12px 12px 3px', padding: '10px 14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{formatFull(msg.created_at)}</div>
                    </div>
                  );
                }

                // Outbound sent
                return (
                  <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: '75%' }}>
                    <div style={{ background: '#1a3a6a', borderRadius: '12px 12px 3px 12px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '13px', color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', textAlign: 'right' }}>✓ {formatFull(msg.created_at)}</div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid #30363d', display: 'flex', gap: '8px', alignItems: 'flex-end', background: '#0d1117', flexShrink: 0 }}>
              <textarea
                value={replyText}
                onChange={e => {
                  setReplyText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder={`Reply to ${activeConv.contact_name}…`}
                rows={1}
                style={{ flex: 1, resize: 'none', overflow: 'hidden', minHeight: '38px' }}
              />
              <button onClick={sendReply} disabled={!replyText.trim() || sending}
                className="send-btn" style={{ flexShrink: 0 }}>
                {sending ? '…' : <IconSend size={15} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
