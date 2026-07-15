'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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
  lead_source: string | null;
  client_type: string | null;
  owner_id: string | null;
  created_at: string;
  companies?: { name: string } | null;
}

interface Props {
  contacts: Contact[];
  totalCount: number;
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
  ownerMap?: Record<string, string>;
  users?: { id: string; name: string }[];
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
  if (!score) return null;
  const s = LEAD_SCORE_STYLES[score.toLowerCase()] ?? { bg: '#f3f4f6', color: '#6b7280', label: score };
  return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function WhaleBadge({ tier, score }: { tier: string | null; score: number | null }) {
  if (!tier || (tier !== 'WHALE' && tier !== 'SOLID' && tier !== 'WARM')) return null;
  const styles: Record<string, { bg: string; color: string }> = {
    WHALE: { bg: '#dbeafe', color: '#1d4ed8' },
    SOLID: { bg: '#e0e7ff', color: '#4338ca' },
    WARM:  { bg: '#f3f4f6', color: '#6b7280' },
  };
  const s = styles[tier];
  return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}>
      🐋 {tier}{score != null ? ` ${score}` : ''}
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

const PAGE_SIZE = 50;

function OwnerBadge({ ownerId, ownerMap }: { ownerId: string | null; ownerMap: Record<string, string> }) {
  if (!ownerId) return null;
  const name = ownerMap[ownerId];
  if (!name) return null;
  const first = name.split(' ')[0];
  return (
    <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: 'var(--sidebar-bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
      👤 {first}
    </span>
  );
}

export default function ContactsClient({ contacts: initialContacts, totalCount, orgSlug, crmUrl, crmKey, ownerMap = {}, users = [] }: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);

  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<'first_name' | 'created_at' | 'lead_score' | 'whale_score' | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', phone: '', email: '' });

  // Server results state — null = use initialContacts
  const [serverResults, setServerResults] = useState<Contact[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load more — fetches next batch from server when paginating past initial load
  const [allContacts, setAllContacts] = useState<Contact[]>(initialContacts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(initialContacts.length >= totalCount);

  // Server-side query — fires when search OR lifecycleFilter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim() && !lifecycleFilter) {
      setServerResults(null);
      setPage(0);
      return;
    }


    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      let query = crm
        .from('contacts')
        .select('id, first_name, last_name, email, phone, lead_score, lead_score_reason, whale_score, whale_tier, lifecycle_stage, lead_source, client_type, owner_id, created_at, companies(name)')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (search.trim()) {
        const q = search.trim();
        query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
      }

      if (lifecycleFilter) {
        query = query.eq('lifecycle_stage', lifecycleFilter);
      }

      const { data } = await query;
      const normalized = (data ?? []).map((c: any) => ({
        ...c,
        companies: Array.isArray(c.companies) ? (c.companies[0] ?? null) : c.companies,
      }));
      setServerResults(normalized as Contact[]);
      setSearching(false);
      setPage(0);
    }, 300);
  }, [search, lifecycleFilter]);

  // Load more handler
  const loadMore = async () => {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);
    const { data } = await crm
      .from('contacts')
      .select('id, first_name, last_name, email, phone, lead_score, lead_score_reason, whale_score, whale_tier, lifecycle_stage, lead_source, client_type, owner_id, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .range(allContacts.length, allContacts.length + 499);
    const normalized = (data ?? []).map((c: any) => ({
      ...c,
      companies: Array.isArray(c.companies) ? (c.companies[0] ?? null) : c.companies,
    }));
    const next = [...allContacts, ...normalized];
    setAllContacts(next as Contact[]);
    if (next.length >= totalCount) setAllLoaded(true);
    setLoadingMore(false);
  };

  const crm2 = createClient(crmUrl, crmKey);

  async function createContact() {
    if (!newContact.first_name.trim() || creating) return;
    setCreating(true);
    const { data } = await crm2.from('contacts').insert({
      first_name: newContact.first_name.trim(),
      last_name: newContact.last_name.trim() || null,
      phone: newContact.phone.trim() || null,
      email: newContact.email.trim() || null,
      created_at: new Date().toISOString(),
    }).select().single();
    setCreating(false);
    if (data) {
      setAllContacts(prev => [data, ...prev]);
      setShowCreate(false);
      setNewContact({ first_name: '', last_name: '', phone: '', email: '' });
    }
  }

  const SCORE_ORDER: Record<string, number> = { hot: 0, medium: 1, cold: 2 };
  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }
  const sIcon = (f: string) => sortField === f ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const base = serverResults ?? allContacts;

  // Client-side filters
  const filtered = base.filter(c => {
    if (scoreFilter && c.lead_score?.toLowerCase() !== scoreFilter) return false;
    if (ownerFilter && c.owner_id !== ownerFilter) return false;
    return true;
  });

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'first_name') cmp = (`${a.first_name} ${a.last_name}`).localeCompare(`${b.first_name} ${b.last_name}`);
        if (sortField === 'created_at') cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
        if (sortField === 'lead_score') cmp = (SCORE_ORDER[a.lead_score?.toLowerCase() ?? ''] ?? 9) - (SCORE_ORDER[b.lead_score?.toLowerCase() ?? ''] ?? 9);
        if (sortField === 'whale_score') cmp = (b.whale_score ?? -1) - (a.whale_score ?? -1);
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filtered;

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'var(--sidebar-bg)',
    color: active ? '#fff' : 'var(--muted)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sticky header: search + filters */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0f1117)', paddingBottom: 8, marginBottom: -4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Search */}
      <div style={{ position: 'relative' }}>
        <input
          placeholder="Search name, phone, email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}
        />
        {searching && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)' }}>
            searching…
          </span>
        )}
      </div>

      {/* Filter pills — Lifecycle */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage:</span>
        <button style={pillBtn(!lifecycleFilter)} onClick={() => { setLifecycleFilter(''); setPage(0); }}>All</button>
        {['subscriber','lead','mql','sql','customer','former_client'].map(s => (
          <button key={s} style={pillBtn(lifecycleFilter === s)} onClick={() => { setLifecycleFilter(lifecycleFilter === s ? '' : s); setPage(0); }}>
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

      {/* Owner filter + Sort + Create */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {users.length > 0 && (
          <select value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(0); }}
            style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: ownerFilter ? 'var(--text)' : 'var(--muted)', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
            <option value="">All reps</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
          </select>
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>SORT:</span>
        {([['first_name','Name'],['created_at','Date'],['lead_score','Score'],['whale_score','Whale']] as [typeof sortField, string][]).map(([f,l]) => (
          <button key={f} onClick={() => { toggleSort(f); setPage(0); }}
            style={{ padding: '4px 10px', fontSize: 11, fontWeight: sortField === f ? 600 : 400, background: sortField === f ? 'var(--accent)' : 'var(--sidebar-bg)', color: sortField === f ? '#fff' : 'var(--muted)', border: `1px solid ${sortField === f ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer' }}>
            {l}{sIcon(String(f))}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + New Contact
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        {search
          ? `${sorted.length} result${sorted.length !== 1 ? 's' : ''} for "${search}"`
          : `Showing ${allContacts.length.toLocaleString()} of ${totalCount.toLocaleString()} contacts`}
      </div>
      </div>{/* end sticky header */}

      {/* Create Contact Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCreate(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>New Contact</div>
            {(['first_name','last_name','phone','email'] as const).map(f => (
              <input key={f} placeholder={f.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
                value={newContact[f]} onChange={e => setNewContact(p => ({...p,[f]:e.target.value}))}
                style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const }} />
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={createContact} disabled={!newContact.first_name.trim() || creating}
                style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: !newContact.first_name.trim() || creating ? 0.5 : 1 }}>
                {creating ? 'Creating…' : 'Create Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {paginated.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
          {searching ? 'Searching…' : 'No contacts found.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paginated.map(c => (
            <div
              key={c.id}
              onClick={() => router.push(`/${orgSlug}/crm/contacts/${c.id}`)}
              style={{
                display: 'flex', flexDirection: 'column',
                padding: '12px 14px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: 'pointer', gap: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
            >
              {/* Top row: name + lifecycle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    {c.first_name} {c.last_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span>{c.email}</span>}
                    {c.companies?.name && <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{c.companies.name}</span>}
                    {c.lead_source && (
                      <span style={{ color: '#60a5fa', fontSize: 11, fontWeight: 600, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.02em' }}>
                        {c.lead_source.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
                <LifecyclePill stage={c.lifecycle_stage} />
              </div>
              {/* Badge row: spreads horizontally */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <LeadScoreBadge score={c.lead_score} />
                <WhaleBadge tier={c.whale_tier} score={c.whale_score} />
                <OwnerBadge ownerId={c.owner_id} ownerMap={ownerMap} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{page + 1} / {totalPages}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '6px 14px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: page === 0 ? 'var(--muted)' : 'var(--text)', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}
            >
              ← Prev
            </button>
            <button
              onClick={() => {
                if (page >= totalPages - 1 && !allLoaded) {
                  loadMore().then(() => setPage(p => p + 1));
                } else {
                  setPage(p => Math.min(totalPages - 1, p + 1));
                }
              }}
              disabled={page >= totalPages - 1 && allLoaded}
              style={{ padding: '6px 14px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: (page >= totalPages - 1 && allLoaded) ? 'var(--muted)' : 'var(--text)', cursor: (page >= totalPages - 1 && allLoaded) ? 'default' : 'pointer', fontSize: 13 }}
            >
              {loadingMore ? 'Loading…' : 'Next →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
