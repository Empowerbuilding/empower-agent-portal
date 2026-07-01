'use client';

import { useEffect, useState } from 'react';

interface ThreadMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  at: string;
}

interface Thread {
  contact_id: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  message_count: number;
  last_message: string;
  last_message_type: string | null;
  last_message_at: string | null;
  pending_draft: { id: string; content: string; created_at: string } | null;
  messages: ThreadMessage[];
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SmsThreadsPage() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/sms-threads');
        const data = await res.json();
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setThreads(data.threads);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>SMS Conversations</div>
      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '32px' }}>
        Unified view of every SMS thread Vanessa is running — sent + received, merged and time-ordered, plus any draft awaiting approval.
      </div>

      {error && <div style={{ color: '#da3633', fontSize: '13px' }}>Error: {error}</div>}
      {!error && threads === null && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>}
      {threads && threads.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '13px' }}>No SMS conversations found.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {threads?.map(thread => {
          const isOpen = expanded === thread.contact_id;
          return (
            <div key={thread.contact_id} style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isOpen ? null : thread.contact_id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{thread.contact_name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{thread.phone}</span>
                    {thread.pending_draft && (
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(210,153,34,0.15)', color: '#d29922', fontWeight: 700 }}>
                        ⏸ Draft pending
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {thread.last_message_type === 'sms_sent' ? '→ ' : '← '}{thread.last_message}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{timeAgo(thread.last_message_at)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{thread.message_count} msgs</div>
                </div>
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid #21262d', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {thread.pending_draft && (
                    <div style={{ background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.3)', borderRadius: '6px', padding: '10px 12px', marginBottom: '4px' }}>
                      <div style={{ fontSize: '11px', color: '#d29922', fontWeight: 700, marginBottom: '4px' }}>⏸ AWAITING APPROVAL</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)' }}>{thread.pending_draft.content}</div>
                    </div>
                  )}
                  {thread.messages.map(m => (
                    <div key={m.id} style={{
                      alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                      background: m.direction === 'out' ? 'rgba(196,154,15,0.12)' : '#161b22',
                      border: '1px solid #21262d',
                      borderRadius: '10px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ fontSize: '13px', color: 'var(--text)' }}>{m.text}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                        {new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
