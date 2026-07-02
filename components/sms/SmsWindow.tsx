'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import { useMobileToolbar } from '@/context/MobileToolbar';
import { IconSend, IconMic, IconMicOff } from '@/components/ui/Icons';

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
}

function extractPhone(content: string): string | null {
  const m = content.match(/(\+1\d{10}|\+\d{11,})/);
  return m ? m[1] : null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function groupByContact(messages: PortalMessage[]): SmsConversation[] {
  const map = new Map<string, SmsConversation>();
  for (const msg of messages) {
    const meta = (msg.metadata || {}) as Record<string, any>;
    const phone = meta.contact_phone || extractPhone(msg.content) || null;
    if (!phone) continue;
    const name = meta.contact_name || phone;
    if (!map.has(phone)) {
      map.set(phone, { contact_phone: phone, contact_name: name, messages: [], last_at: msg.created_at, has_pending: false });
    }
    const conv = map.get(phone)!;
    if (meta.contact_name && conv.contact_name === phone) conv.contact_name = meta.contact_name;
    conv.messages.push(msg);
    if (msg.created_at > conv.last_at) conv.last_at = msg.created_at;
    if (meta.approval_state === 'pending') conv.has_pending = true;
  }
  return Array.from(map.values()).sort((a, b) => b.last_at.localeCompare(a.last_at));
}

function extractSmsBody(content: string): string {
  const m = content.match(/```\n([\s\S]*?)\n```/);
  return m ? m[1].trim() : content;
}

export default function SmsWindow({ channel, initialMessages, currentUser, orgId }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  // mobile view: 'list' shows contact list, 'thread' shows conversation
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [askingVanessa, setAskingVanessa] = useState<string | null>(null);
  // phone number Vanessa is currently drafting for (shows indicator in thread)
  const [vanessaDrafting, setVanessaDrafting] = useState<string | null>(null);
  const vanessaDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const supabase = createClient();
  const { setToolbar } = useMobileToolbar();

  const userFlag = channel.id.includes('larry') ? 'larry' : channel.id.includes('shannon') ? 'shannon' : null;
  const conversations = groupByContact(messages);
  const activeConv = selectedPhone ? conversations.find(c => c.contact_phone === selectedPhone) : null;

  // Auto-select first on desktop (no auto-select on mobile — show list first)
  useEffect(() => {
    if (!selectedPhone && conversations.length > 0) {
      const isMobile = window.innerWidth <= 767;
      if (!isMobile) setSelectedPhone(conversations[0].contact_phone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length === 0]);

  // Scroll to bottom when thread changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages.length, selectedPhone]);

  // Mobile toolbar: back button when viewing a thread
  useEffect(() => {
    if (mobileView === 'thread' && activeConv) {
      setToolbar(
        <button
          onClick={() => { setMobileView('list'); }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          ← Back
        </button>
      );
    } else {
      setToolbar(null);
    }
    return () => setToolbar(null);
  }, [mobileView, activeConv?.contact_name]);

  // Real-time subscription
  useEffect(() => {
    const sub = supabase
      .channel(`sms:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const msg = payload.new as PortalMessage;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          // Clear drafting indicator when Vanessa's draft arrives
          const meta = (msg.metadata || {}) as Record<string, any>;
          if (meta.approval_state === 'pending' && meta.contact_phone) {
            setVanessaDrafting(prev => prev === meta.contact_phone ? null : prev);
            if (vanessaDraftTimerRef.current) clearTimeout(vanessaDraftTimerRef.current);
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const updated = payload.new as PortalMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id]);

  function selectContact(phone: string) {
    setSelectedPhone(phone);
    setMobileView('thread');
    setListening(false);
    recognitionRef.current?.stop();
  }

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported in this browser.'); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
    recognitionRef.current = rec;
    let base = replyText;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      const sep = base && !base.endsWith(' ') ? ' ' : '';
      setReplyText(base + sep + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start(); setListening(true);
  }

  async function askVanessa(msg: PortalMessage) {
    if (!activeConv) return;
    setAskingVanessa(msg.id);
    try {
      const body = extractSmsBody(msg.content);
      // Route to background channel — Vanessa monitors it, Larry/Shannon never see it
      const phone = activeConv.contact_phone;
      const senderUser = channel.id.includes('larry') ? 'larry' : 'shannon';
      const prompt = `SMS action from ${currentUser.name}: Draft a reply to this inbound text from ${activeConv.contact_name} (${phone}): "${body}". Run send_sms.py --draft --to "${phone}" --user ${senderUser} and post it to the SMS inbox. No reply needed here.`;
      await supabase.from('portal_messages').insert({
        channel_id: 'barnhaus-vanessa-sms-actions',
        org_id: orgId,
        sender_type: 'user',
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        content: prompt,
        processed: false,
      });
      // Show drafting indicator in the thread
      setVanessaDrafting(phone);
      if (vanessaDraftTimerRef.current) clearTimeout(vanessaDraftTimerRef.current);
      // Auto-clear after 45s if draft never arrives
      vanessaDraftTimerRef.current = setTimeout(() => setVanessaDrafting(null), 45000);
    } finally {
      setTimeout(() => setAskingVanessa(null), 2000);
    }
  }

  async function approveDraft(msg: PortalMessage) {
    setApproving(msg.id);
    try {
      const meta = (msg.metadata || {}) as Record<string, any>;
      const to = meta.contact_phone || meta.to;
      if (!to) return;
      await fetch('/api/sms/send', {
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
    } finally {
      setApproving(null);
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !activeConv || sending) return;
    setSending(true);
    const body = replyText.trim();
    setReplyText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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

  function lastSnippet(conv: SmsConversation) {
    const last = [...conv.messages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!last) return '';
    const meta = (last.metadata || {}) as Record<string, any>;
    const prefix = meta.direction === 'inbound' ? '← ' : '→ ';
    const body = extractSmsBody(last.content);
    return prefix + body.slice(0, 42) + (body.length > 42 ? '…' : '');
  }

  // ── Contact list ──────────────────────────────────────────────────────────
  const ContactList = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      background: '#0d1117',
    }}>
      {/* Desktop-only header inside list panel */}
      <div className="desktop-only" style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        Conversations
      </div>

      {conversations.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '13px', color: 'var(--muted)' }}>
          No messages yet
        </div>
      )}

      {conversations.map(conv => {
        const isActive = conv.contact_phone === selectedPhone;
        return (
          <button key={conv.contact_phone}
            onClick={() => selectContact(conv.contact_phone)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '14px 16px',
              background: isActive ? '#161b22' : 'transparent',
              border: 'none', borderBottom: '1px solid #21262d',
              cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#1a3a6a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {conv.contact_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.contact_name === conv.contact_phone ? conv.contact_phone : conv.contact_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {conv.has_pending && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, display: 'inline-block' }} />}
                    {lastSnippet(conv)}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginLeft: '8px' }}>
                {formatTime(conv.last_at)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );

  // ── Thread view ───────────────────────────────────────────────────────────
  const ThreadView = activeConv ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Thread header — desktop only (mobile uses mobile-header + back button) */}
      <div className="desktop-only channel-header" style={{ alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a3a6a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {activeConv.contact_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{activeConv.contact_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{activeConv.contact_phone}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[...activeConv.messages]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map(msg => {
            const meta = (msg.metadata || {}) as Record<string, any>;
            const direction = meta.direction || 'outbound';
            const isPending = meta.approval_state === 'pending';
            const isInbound = direction === 'inbound';
            const body = extractSmsBody(msg.content);
            const isApproving = approving === msg.id;

            if (isPending) {
              return (
                <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', width: '100%' }}>
                  <div style={{ background: '#0d1117', border: '1px solid var(--accent)', borderRadius: '12px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⏸ Draft — pending approval
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{body}</div>
                    <button
                      onClick={() => approveDraft(msg)}
                      disabled={isApproving}
                      style={{
                        marginTop: '12px', width: '100%', padding: '10px',
                        background: isApproving ? '#30363d' : 'var(--accent)',
                        border: 'none', borderRadius: '8px',
                        color: isApproving ? 'var(--muted)' : '#000',
                        fontWeight: 700, cursor: isApproving ? 'wait' : 'pointer',
                        fontSize: '14px', minHeight: '44px',
                      }}
                    >
                      {isApproving ? 'Sending…' : '📤 Send'}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', textAlign: 'right' }}>{formatFull(msg.created_at)}</div>
                </div>
              );
            }

            if (isInbound) {
              return (
                <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
                  <div style={{ background: '#21262d', borderRadius: '18px 18px 18px 4px', padding: '10px 14px' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{body}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatFull(msg.created_at)}</span>
                    <button
                      onClick={() => askVanessa(msg)}
                      disabled={askingVanessa === msg.id}
                      title="Ask Vanessa to draft a reply"
                      style={{ background: 'none', border: '1px solid #30363d', borderRadius: '4px', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px', padding: '2px 7px', opacity: askingVanessa === msg.id ? 0.5 : 0.8 }}
                    >
                      {askingVanessa === msg.id ? '✓ Sent to Vanessa' : '🤖 Ask Vanessa'}
                    </button>
                  </div>
                </div>
              );
            }

            // Outbound sent
            return (
              <div key={msg.id} style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
                <div style={{ background: '#1a3a6a', borderRadius: '18px 18px 4px 18px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '14px', color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{body}</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', textAlign: 'right' }}>✓ {formatFull(msg.created_at)}</div>
              </div>
            );
          })}
        {/* Vanessa drafting indicator */}
        {vanessaDrafting === activeConv.contact_phone && (
          <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px' }}>🤖</span>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginBottom: '3px' }}>Vanessa is drafting…</div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="input-area">
        {replyText.length > 0 && (
          <div style={{ fontSize: '11px', color: replyText.length > 160 ? '#da3633' : replyText.length > 140 ? '#d29922' : 'var(--muted)', textAlign: 'right', paddingBottom: '4px', paddingRight: '4px' }}>
            {replyText.length}/160{replyText.length > 160 ? ` (+${Math.ceil((replyText.length - 160) / 153 + 1) - 1} seg)` : ''}
          </div>
        )}
        <div className="input-row">
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={e => {
              setReplyText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
            placeholder={`Reply to ${activeConv.contact_name}…`}
            rows={1}
          />
          <button onClick={toggleVoice} title={listening ? 'Stop recording' : 'Voice input'}
            style={{ background: listening ? 'rgba(76,139,240,0.15)' : 'none', border: listening ? '1px solid var(--accent)' : 'none', borderRadius: '6px', cursor: 'pointer', color: listening ? 'var(--accent)' : 'var(--muted)', padding: '0 6px', flexShrink: 0, opacity: listening ? 1 : 0.7, transition: 'all 0.15s', display: 'flex', alignItems: 'center' }}>
            {listening ? <IconMicOff size={17} /> : <IconMic size={17} />}
          </button>
          <button
            className="send-btn"
            onClick={sendReply}
            disabled={!replyText.trim() || sending}
            title={`Send to ${activeConv.contact_name}`}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
          >
            {sending ? '…' : <><IconSend size={14} /><span style={{ fontSize: '12px' }}>{activeConv.contact_name.split(' ')[0]}</span></>}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '14px' }}>
      Select a conversation
    </div>
  );

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="sms-desktop-layout">
        <div className="sms-contact-list">
          {ContactList}
        </div>
        <div className="sms-thread-panel">
          {ThreadView}
        </div>
      </div>

      {/* Mobile: stacked, one panel at a time */}
      <div className="sms-mobile-layout">
        {mobileView === 'list' ? ContactList : ThreadView}
      </div>
    </>
  );
}
