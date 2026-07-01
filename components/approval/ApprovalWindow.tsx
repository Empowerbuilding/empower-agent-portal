'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PortalChannel, PortalMessage } from '@/lib/types';
import Markdown from '@/components/ui/Markdown';
import { useMobileToolbar } from '@/context/MobileToolbar';
import { IconTrash } from '@/components/ui/Icons';

interface Props {
  channel: PortalChannel;
  initialMessages: PortalMessage[];
  currentUser: { id: string; name: string };
  orgId: string;
}

interface ThreadMessage {
  id: string;
  direction: 'in' | 'out';
  text: string;
  at: string;
}

interface PendingDraft {
  id: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
  sender_name: string | null;
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
  sort_at: string | null;
  pending_draft: PendingDraft | null;
  messages: ThreadMessage[];
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ReplyBox({ draft, currentUser, onSent }: {
  draft: PendingDraft;
  currentUser: { id: string; name: string };
  onSent: (id: string) => void;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  async function approve() {
    if (!reply.trim() || sending) return;
    setSending(true);
    await supabase.from('portal_messages')
      .update({ metadata: { ...draft.metadata, approval_state: 'approved', approved_reply: reply, approved_by: currentUser.name } })
      .eq('id', draft.id);
    setSending(false);
    onSent(draft.id);
  }

  return (
    <div className="approval-reply-area" style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Reply:</div>
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Type your reply..."
        rows={2}
        style={{ maxWidth: '100%', boxSizing: 'border-box' }}
      />
      <button className="approve-btn" onClick={approve} disabled={!reply.trim() || sending}>
        {sending ? 'Sending…' : 'Approve & Send'}
      </button>
    </div>
  );
}

function ThreadRow({ thread, expanded, onToggle, currentUser, onDraftHandled, deleteMode, selected, onSelect }: {
  thread: Thread;
  expanded: boolean;
  onToggle: () => void;
  currentUser: { id: string; name: string };
  onDraftHandled: (contactId: string, draftId: string) => void;
  deleteMode: boolean;
  selected: boolean;
  onSelect: (draftId: string, checked: boolean) => void;
}) {
  const hasPending = !!thread.pending_draft;

  return (
    <div className="sms-thread" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
      <div
        onClick={() => { if (deleteMode && hasPending) { onSelect(thread.pending_draft!.id, !selected); } else if (!deleteMode) { onToggle(); } }}
        className="sms-thread-header"
        style={{
          padding: '12px 14px', cursor: deleteMode && !hasPending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
          minHeight: '44px',
        }}
      >
        {deleteMode && (
          <input
            type="checkbox"
            checked={selected}
            disabled={!hasPending}
            onChange={e => onSelect(thread.pending_draft?.id ?? '', e.target.checked)}
            onClick={e => e.stopPropagation()}
            style={{ opacity: hasPending ? (selected ? 1 : 0.4) : 0.15, cursor: hasPending ? 'pointer' : 'not-allowed', accentColor: '#C49A0F', flexShrink: 0, width: 18, height: 18 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
              {thread.contact_name}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{thread.phone}</span>
            {hasPending && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(210,153,34,0.15)', color: '#d29922', fontWeight: 700, flexShrink: 0 }}>
                ⏸ Pending
              </span>
            )}
          </div>
          <div style={{
            fontSize: '12px', color: 'var(--muted)', marginTop: '3px', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
          }}>
            {hasPending
              ? `⏸ ${thread.pending_draft!.content.replace(/^📱[^\n]*\n/, '').replace(/```/g, '').trim().slice(0, 90)}`
              : `${thread.last_message_type === 'sms_sent' ? '→ ' : '← '}${thread.last_message}`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{timeAgo(thread.sort_at)}</div>
          {thread.message_count > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{thread.message_count} msgs</div>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
          {thread.messages.map(m => (
            <div key={m.id} style={{
              alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.direction === 'out' ? 'rgba(196,154,15,0.12)' : '#1c2230',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '8px 12px',
              wordBreak: 'break-word',
            }}>
              <div style={{ fontSize: '13px', color: 'var(--text)' }}>{m.text}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>{formatFull(m.at)}</div>
            </div>
          ))}

          {thread.pending_draft && (
            <div style={{ background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.3)', borderRadius: '10px', padding: '10px 12px', marginTop: thread.messages.length ? '4px' : 0 }}>
              <div style={{ fontSize: '11px', color: '#d29922', fontWeight: 700, marginBottom: '6px' }}>⏸ AWAITING APPROVAL</div>
              <div style={{ fontSize: '13px', color: 'var(--text)', wordBreak: 'break-word' }}>
                <Markdown content={thread.pending_draft.content} />
              </div>
              <ReplyBox
                draft={thread.pending_draft}
                currentUser={currentUser}
                onSent={(id) => onDraftHandled(thread.contact_id, id)}
              />
            </div>
          )}

          {!thread.pending_draft && thread.messages.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No message history.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApprovalWindow({ channel, initialMessages, currentUser }: Props) {
  // Fallback flat list — used only if the threaded SMS data source fails to load
  // (e.g. non-SMS approval channel added in future, or API error).
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const supabase = createClient();
  const { setToolbar } = useMobileToolbar();

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/sms-threads?channelId=${encodeURIComponent(channel.id)}`);
      const data = await res.json();
      if (data.error) { setThreadsError(data.error); return; }
      setThreads(data.threads);
      setThreadsError(null);
    } catch (e: unknown) {
      setThreadsError(e instanceof Error ? e.message : String(e));
    }
  }, [channel.id]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { if (!deleteMode) setSelected(new Set()); }, [deleteMode]);

  useEffect(() => {
    setToolbar(
      <button onClick={() => setDeleteMode(d => !d)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 6px', opacity: 0.7 }}><IconTrash size={16} /></button>
    );
    return () => setToolbar(null);
  }, [setToolbar]);

  // Realtime: any insert/update to this channel's messages refreshes the merged
  // thread view (cheap re-fetch — approval volume is low).
  useEffect(() => {
    const sub = supabase
      .channel(`approval:${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const msg = payload.new as PortalMessage;
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          loadThreads();
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'portal_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => {
          const updated = payload.new as PortalMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
          loadThreads();
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel.id, loadThreads, supabase]);

  function handleDraftHandled() {
    // Optimistically refresh — the underlying portal_messages UPDATE realtime
    // event above will also trigger a refresh, this just feels instant.
    loadThreads();
  }

  function handleSelect(id: string, checked: boolean) {
    setSelected(prev => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    setMessages(prev => prev.filter(m => !ids.includes(m.id)));
    setThreads(prev => prev ? prev.map(t => t.pending_draft && ids.includes(t.pending_draft.id) ? { ...t, pending_draft: null } : t) : prev);
    setSelected(new Set());
    setConfirming(false);
    setDeleteMode(false);
    for (const id of ids) await supabase.from('portal_messages').delete().eq('id', id);
    loadThreads();
  }

  const useThreadedView = threads !== null && !threadsError;
  // Selectable ids differ by view: threaded view can only delete pending drafts
  // (the underlying portal_messages rows); flat fallback can delete any message.
  const selectableIds = useThreadedView
    ? (threads ?? []).filter(t => t.pending_draft).map(t => t.pending_draft!.id)
    : messages.map(m => m.id);
  const allSelected = selected.size === selectableIds.length && selectableIds.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px', width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Delete {selected.size} message{selected.size > 1 ? 's' : ''}?</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This can&apos;t be undone.</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button onClick={deleteSelected} style={{ padding: '8px 16px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="channel-header" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        {deleteMode ? (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)' }}>
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectableIds))} style={{ accentColor: '#C49A0F', cursor: 'pointer' }} />
              {allSelected ? 'Deselect all' : 'Select all'}
            </label>
            <button onClick={() => setDeleteMode(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', padding: '4px 8px' }}>Cancel</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>{channel.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{channel.display_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Approval queue</div>
              </div>
            </div>
            <button onClick={() => setDeleteMode(true)} title="Delete messages" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px 8px', opacity: 0.6 }}><IconTrash size={16} /></button>
          </>
        )}
      </div>

      <div className="feed-list sms-thread-list">
        {useThreadedView ? (
          <>
            {threads!.length === 0 && (
              <div className="empty-state">
                <span className="icon">{channel.icon}</span>
                <span className="label">No conversations yet</span>
              </div>
            )}
            {threads!.map(thread => (
              <ThreadRow
                key={thread.contact_id}
                thread={thread}
                expanded={expanded === thread.contact_id}
                onToggle={() => setExpanded(expanded === thread.contact_id ? null : thread.contact_id)}
                currentUser={currentUser}
                onDraftHandled={handleDraftHandled}
                deleteMode={deleteMode}
                selected={!!thread.pending_draft && selected.has(thread.pending_draft.id)}
                onSelect={handleSelect}
              />
            ))}
          </>
        ) : (
          // Fallback: flat pending-approval list (only reached if the threaded
          // data source errors out) so approvals are never blocked.
          <>
            {threadsError && (
              <div style={{ fontSize: '12px', color: '#da3633', marginBottom: '8px' }}>
                Couldn&apos;t load threaded view ({threadsError}) — showing raw messages.
              </div>
            )}
            {messages.length === 0 && (
              <div className="empty-state">
                <span className="icon">{channel.icon}</span>
                <span className="label">No pending approvals</span>
              </div>
            )}
            {messages.map(msg => {
              const approvalState = (msg.metadata?.approval_state as string) ?? 'pending';
              return (
                <div key={msg.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(msg.id)}
                    onChange={e => handleSelect(msg.id, e.target.checked)}
                    style={{ opacity: selected.has(msg.id) ? 1 : 0.3, marginTop: '14px', cursor: 'pointer', accentColor: '#C49A0F', flexShrink: 0, display: deleteMode ? 'block' : 'none' }}
                  />
                  <div className="feed-card" style={{ flex: 1, minWidth: 0 }}>
                    <div className="feed-card-meta">
                      <span style={{ fontWeight: 600 }}>{msg.sender_name ?? 'System'}</span>
                      <span>{formatFull(msg.created_at)}</span>
                    </div>
                    <div className="feed-card-body"><Markdown content={msg.content} /></div>
                    {approvalState === 'pending' && (
                      <ReplyBox
                        draft={{ id: msg.id, content: msg.content, created_at: msg.created_at, metadata: msg.metadata, sender_name: msg.sender_name }}
                        currentUser={currentUser}
                        onSent={() => {}}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {deleteMode && (
        <div style={{ padding: '10px 16px', background: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSelected(new Set())} style={{ padding: '6px 12px', background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
            <button onClick={() => setConfirming(true)} style={{ padding: '6px 12px', background: '#da3633', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Delete {selected.size}</button>
          </div>
        </div>
      )}
    </div>
  );
}
