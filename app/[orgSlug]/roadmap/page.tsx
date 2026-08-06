'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const CATEGORIES = [
  { value: 'ui', label: '🎨 UI / Design' },
  { value: 'agent-behavior', label: '🤖 Agent Behavior' },
  { value: 'crm', label: '📋 CRM' },
  { value: 'integrations', label: '🔌 Integrations' },
  { value: 'automation', label: '⚙️ Automation' },
  { value: 'other', label: '💬 Other' },
];

const STATUSES = [
  { value: 'pending', label: 'Pending', color: '#6e7681', bg: 'rgba(110,118,129,0.15)' },
  { value: 'planned', label: 'Planned', color: '#58a6ff', bg: 'rgba(88,166,255,0.12)' },
  { value: 'in-progress', label: 'In Progress', color: '#f0883e', bg: 'rgba(240,136,62,0.12)' },
  { value: 'shipped', label: 'Shipped ✓', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  { value: 'declined', label: 'Declined', color: '#da3633', bg: 'rgba(218,54,51,0.12)' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'shipped', label: 'Shipped' },
];

interface FeatureRequest {
  id: string;
  org_id: string;
  user_id: string | null;
  user_name: string;
  title: string;
  description: string;
  category: string;
  status: string;
  vote_count: number;
  voter_ids: string[];
  admin_note: string | null;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status) ?? STATUSES[0];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
      color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  );
}

function CategoryTag({ category }: { category: string }) {
  const c = CATEGORIES.find(x => x.value === category);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
      color: 'var(--muted)', background: 'var(--border)',
    }}>
      {c?.label ?? category}
    </span>
  );
}

function SubmitModal({
  onClose, onSubmitted, userId, userName,
}: {
  onClose: () => void;
  onSubmitted: (req: FeatureRequest) => void;
  userId: string;
  userName: string;
}) {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    if (!org) { setError('Could not find org'); setSaving(false); return; }
    const { data, error: err } = await supabase.from('feature_requests').insert({
      org_id: org.id,
      user_id: userId,
      user_name: userName,
      title: title.trim(),
      description: description.trim(),
      category,
      status: 'pending',
      vote_count: 1,
      voter_ids: [userId],
    }).select().single();
    setSaving(false);
    if (err || !data) { setError(err?.message ?? 'Failed to submit'); return; }
    onSubmitted(data as FeatureRequest);
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '28px', width: '100%', maxWidth: '480px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }} onClick={e => e.stopPropagation()}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text)' }}>💡 Submit a Feature Request</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Got an idea or something that feels broken? Drop it here.</div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Title *</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder='e.g. "Add keyboard shortcut to open new channel"'
            style={{
              width: '100%', padding: '10px 12px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="What problem does this solve? How should it work?"
            style={{
              width: '100%', padding: '10px 12px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)} style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: category === c.value ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: category === c.value ? 'rgba(76,139,240,0.15)' : 'var(--sidebar-bg)',
                color: category === c.value ? 'var(--accent)' : 'var(--muted)',
                fontWeight: category === c.value ? 600 : 400,
              }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#da3633', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', padding: '8px 10px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!title.trim() || saving} style={{
            padding: '9px 20px', background: 'var(--accent)', border: 'none', borderRadius: '8px',
            color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
            opacity: !title.trim() || saving ? 0.5 : 1,
          }}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminControls({
  request, onUpdated,
}: {
  request: FeatureRequest;
  onUpdated: (updated: FeatureRequest) => void;
}) {
  const supabase = createClient();
  const [status, setStatus] = useState(request.status);
  const [note, setNote] = useState(request.admin_note ?? '');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { data } = await supabase.from('feature_requests')
      .update({ status, admin_note: note.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', request.id)
      .select().single();
    setSaving(false);
    if (data) { onUpdated(data as FeatureRequest); setOpen(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        marginTop: '10px', padding: '4px 10px', background: 'none',
        border: '1px solid var(--border)', borderRadius: '6px',
        color: 'var(--muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
      }}>
        ✏️ Edit status / note
      </button>
    );
  }

  return (
    <div style={{ marginTop: '12px', padding: '14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Controls</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button key={s.value} onClick={() => setStatus(s.value)} style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            border: status === s.value ? `1px solid ${s.color}` : '1px solid var(--border)',
            background: status === s.value ? s.bg : 'none',
            color: status === s.value ? s.color : 'var(--muted)',
            fontWeight: status === s.value ? 700 : 400,
          }}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Add a note for context (optional)…"
        rows={2}
        style={{
          width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: '6px', color: 'var(--text)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={{ padding: '5px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '5px 14px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sort, setSort] = useState<'votes' | 'recent'>('votes');
  const [votingId, setVotingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, [orgSlug]);

  async function loadAll() {
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    if (!org) return;
    setOrgId(org.id);

    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user) {
      const { data: pu } = await supabase.from('portal_users').select('id, name, role').eq('supabase_auth_id', auth.user.id).eq('org_id', org.id).single();
      if (pu) setCurrentUser({ id: pu.id, name: pu.name, role: pu.role });
    }

    const { data: rows } = await supabase
      .from('feature_requests')
      .select('*')
      .eq('org_id', org.id)
      .order('vote_count', { ascending: false });
    setRequests((rows ?? []) as FeatureRequest[]);
    setLoading(false);
  }

  async function handleVote(req: FeatureRequest) {
    if (!currentUser) return;
    const hasVoted = req.voter_ids.includes(currentUser.id);
    setVotingId(req.id);

    const newVoterIds = hasVoted
      ? req.voter_ids.filter(id => id !== currentUser.id)
      : [...req.voter_ids, currentUser.id];
    const newCount = newVoterIds.length;

    // Optimistic update
    setRequests(prev => prev.map(r => r.id === req.id
      ? { ...r, vote_count: newCount, voter_ids: newVoterIds }
      : r
    ));

    await supabase.from('feature_requests').update({
      voter_ids: newVoterIds,
      vote_count: newCount,
      updated_at: new Date().toISOString(),
    }).eq('id', req.id);

    setVotingId(null);
  }

  function handleUpdated(updated: FeatureRequest) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  const isOwner = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const filtered = requests
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => catFilter === 'all' || r.category === catFilter)
    .sort((a, b) => sort === 'votes'
      ? b.vote_count - a.vote_count
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="page-scroll">
      {showSubmit && currentUser && (
        <SubmitModal
          onClose={() => setShowSubmit(false)}
          onSubmitted={(req) => setRequests(prev => [req, ...prev])}
          userId={currentUser.id}
          userName={currentUser.name}
        />
      )}

      <div style={{ padding: '28px 24px', maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>💡 Feature Requests</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              Ideas and improvements for the portal. Vote on what matters most.
              {pendingCount > 0 && <span style={{ marginLeft: '8px', color: 'var(--accent)', fontWeight: 600 }}>{pendingCount} pending</span>}
            </div>
          </div>
          {currentUser && (
            <button onClick={() => setShowSubmit(true)} style={{
              padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '8px',
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              + Submit Idea
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', marginTop: '20px', alignItems: 'center' }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--sidebar-bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            {STATUS_FILTERS.map(f => (
              <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: 'none',
                background: statusFilter === f.value ? 'var(--accent)' : 'none',
                color: statusFilter === f.value ? '#fff' : 'var(--muted)',
              }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{
              padding: '5px 10px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
              borderRadius: '8px', color: 'var(--text)', fontSize: '12px', cursor: 'pointer',
            }}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {/* Sort */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', background: 'var(--sidebar-bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            {(['votes', 'recent'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: 'none',
                background: sort === s ? 'rgba(255,255,255,0.08)' : 'none',
                color: sort === s ? 'var(--text)' : 'var(--muted)',
              }}>
                {s === 'votes' ? '🔥 Top' : '🕐 Recent'}
              </button>
            ))}
          </div>
        </div>

        {/* Request list */}
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            color: 'var(--muted)', fontSize: '14px',
          }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>💭</div>
            {requests.length === 0
              ? 'No requests yet — be the first to submit an idea!'
              : 'No requests match these filters.'
            }
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(req => {
              const hasVoted = currentUser ? req.voter_ids.includes(currentUser.id) : false;
              const isExpanded = expandedId === req.id;
              const timeAgo = (() => {
                const diff = Date.now() - new Date(req.created_at).getTime();
                const days = Math.floor(diff / 86400000);
                if (days === 0) return 'Today';
                if (days === 1) return 'Yesterday';
                if (days < 30) return `${days}d ago`;
                return new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })();

              return (
                <div key={req.id} style={{
                  background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '16px',
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    {/* Vote button */}
                    <button
                      onClick={() => handleVote(req)}
                      disabled={!currentUser || votingId === req.id}
                      title={hasVoted ? 'Remove vote' : 'Upvote'}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: '2px',
                        minWidth: '44px', padding: '6px 4px',
                        background: hasVoted ? 'rgba(76,139,240,0.15)' : 'var(--bg)',
                        border: `1px solid ${hasVoted ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '8px', cursor: currentUser ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: '14px', lineHeight: 1, color: hasVoted ? 'var(--accent)' : 'var(--muted)' }}>▲</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: hasVoted ? 'var(--accent)' : 'var(--text)', lineHeight: 1 }}>{req.vote_count}</span>
                    </button>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div
                          style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', cursor: req.description ? 'pointer' : 'default', flex: 1 }}
                          onClick={() => req.description && setExpandedId(isExpanded ? null : req.id)}
                        >
                          {req.title}
                          {req.description && (
                            <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                        </div>
                        <StatusBadge status={req.status} />
                      </div>

                      {/* Tags row */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <CategoryTag category={req.category} />
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{req.user_name} · {timeAgo}</span>
                      </div>

                      {/* Description (expanded) */}
                      {isExpanded && req.description && (
                        <div style={{
                          marginTop: '10px', padding: '10px 12px',
                          background: 'var(--bg)', borderRadius: '6px',
                          fontSize: '13px', color: 'var(--text)', lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {req.description}
                        </div>
                      )}

                      {/* Admin note */}
                      {req.admin_note && (
                        <div style={{
                          marginTop: '10px', padding: '8px 10px',
                          background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.2)',
                          borderRadius: '6px', fontSize: '12px', color: '#8bb4e8', lineHeight: 1.5,
                        }}>
                          <span style={{ fontWeight: 700 }}>📌 Note: </span>{req.admin_note}
                        </div>
                      )}

                      {/* Admin controls */}
                      {isOwner && (
                        <AdminControls request={req} onUpdated={handleUpdated} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
