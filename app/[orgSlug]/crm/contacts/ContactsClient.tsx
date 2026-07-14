'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  lead_score: string | null;
  lead_score_reason: string | null;
  whale_score: number | null;
  whale_tier: string | null;
  lifecycle_stage: string | null;
  client_type: string | null;
  owner_id: string | null;
  created_at: string;
  companies?: { name: string } | null;
}

interface Props {
  contacts: Contact[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

const LEAD_SCORE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  hot:    { bg: '#fee2e2', color: '#b91c1c', label: 'Hot' },
  medium: { bg: '#fef9c3', color: '#92400e', label: 'Medium' },
  cold:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Cold' },
};

const LIFECYCLE_STYLES: Record<string, { bg: string; color: string }> = {
  subscriber:    { bg: '#f3f4f6', color: '#6b7280' },
  lead:          { bg: '#dbeafe', color: '#1d4ed8' },
  mql:           { bg: '#e0e7ff', color: '#4338ca' },
  sql:           { bg: '#ede9fe', color: '#7c3aed' },
  customer:      { bg: '#dcfce7', color: '#15803d' },
  former_client: { bg: '#f3f4f6', color: '#6b7280' },
};

function LeadScoreBadge({ score }: { score: string | null }) {
  if (!score) return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#9ca3af' }}>—</span>
  );
  const s = LEAD_SCORE_STYLES[score.toLowerCase()] ?? { bg: '#f3f4f6', color: '#6b7280', label: score };
  return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function WhaleBadge({ tier }: { tier: string | null }) {
  if (!tier || (tier !== 'WHALE' && tier !== 'SOLID' && tier !== 'WARM')) return null;
  const styles: Record<string, { color: string; weight: string }> = {
    WHALE: { color: '#2563eb', weight: '700' },
    SOLID: { color: '#60a5fa', weight: '600' },
    WARM:  { color: '#9ca3af', weight: '500' },
  };
  const s = styles[tier];
  return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: s.weight, background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}33` }}>
      {tier}
    </span>
  );
}

function LifecyclePill({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const s = LIFECYCLE_STYLES[stage] ?? { bg: '#f3f4f6', color: '#6b7280' };
  const label = stage.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color }}>
      {label}
    </span>
  );
}

export default function ContactsClient({ contacts: initial, orgSlug }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = initial.filter(c => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) || (c.email ?? '').toLowerCase().includes(search.toLowerCase());
    const matchLifecycle = !lifecycleFilter || c.lifecycle_stage === lifecycleFilter;
    const matchScore = !scoreFilter || (c.lead_score ?? '').toLowerCase() === scoreFilter;
    return matchSearch && matchLifecycle && matchScore;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'var(--sidebar-bg)',
    color: active ? '#fff' : 'var(--muted)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search name, phone, email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}
        />
      </div>

      {/* Filter pills — Lifecycle */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage:</span>
        <button style={pillBtn(!lifecycleFilter)} onClick={() => { setLifecycleFilter(''); setPage(0); }}>All</button>
        {['subscriber','lead','mql','sql','customer','former_client'].map(s => (
          <button key={s} style={pillBtn(lifecycleFilter === s)} onClick={() => { setLifecycleFilter(s); setPage(0); }}>
            {s.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Filter pills — Lead Score */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score:</span>
        <button style={pillBtn(!scoreFilter)} onClick={() => { setScoreFilter(''); setPage(0); }}>All</button>
        {['hot','medium','cold'].map(s => (
          <button key={s} style={pillBtn(scoreFilter === s)} onClick={() => { setScoreFilter(s); setPage(0); }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {paginated.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
          No contacts found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paginated.map(c => (
            <div
              key={c.id}
              onClick={() => router.push(`/${orgSlug}/crm/contacts/${c.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', gap: 12,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
            >
              {/* Left */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                  {c.first_name} {c.last_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {c.phone && <span>{c.phone}</span>}
                  {c.email && <span>{c.email}</span>}
                  {c.companies?.name && <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{c.companies.name}</span>}
                </div>
              </div>
              {/* Right */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <LeadScoreBadge score={c.lead_score} />
                  <WhaleBadge tier={c.whale_tier} />
                </div>
                <LifecyclePill stage={c.lifecycle_stage} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} contacts</span>
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '6px 14px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: page === 0 ? 'var(--muted)' : 'var(--text)', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: page >= totalPages - 1 ? 'var(--muted)' : 'var(--text)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
