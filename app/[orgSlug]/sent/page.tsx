'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Delivery {
  id: string;
  from_addr: string | null;
  to_addrs: string[] | null;
  subject: string | null;
  last_event: string;
  bounce_message: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  bounced_at: string | null;
  first_event_at: string;
  last_event_at: string;
}

const STATUS_META: Record<string, { icon: string; label: string; color: string }> = {
  sent:             { icon: '📤', label: 'Sent',        color: 'var(--muted)' },
  delivered:        { icon: '✅', label: 'Delivered',   color: '#22c55e' },
  opened:           { icon: '👀', label: 'Opened',      color: '#3b82f6' },
  clicked:          { icon: '🔗', label: 'Clicked',     color: '#3b82f6' },
  bounced:          { icon: '⛔', label: 'Bounced',     color: '#ef4444' },
  complained:       { icon: '🚫', label: 'Spam report', color: '#ef4444' },
  delivery_delayed: { icon: '⏳', label: 'Delayed',     color: '#eab308' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'delivered', label: '✅ Delivered' },
  { key: 'opened', label: '👀 Opened' },
  { key: 'problem', label: '⛔ Bounced / Spam' },
];

function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SentPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
      if (!org) { setLoading(false); return; }
      const { data } = await supabase
        .from('email_deliveries')
        .select('id, from_addr, to_addrs, subject, last_event, bounce_message, delivered_at, opened_at, bounced_at, first_event_at, last_event_at')
        .eq('org_id', org.id)
        .order('last_event_at', { ascending: false })
        .limit(300);
      setRows((data as Delivery[]) ?? []);
      setLoading(false);
    })();
  }, [orgSlug, supabase]);

  const visible = rows.filter((r) => {
    if (filter === 'delivered' && !['delivered', 'opened', 'clicked'].includes(r.last_event)) return false;
    if (filter === 'opened' && !['opened', 'clicked'].includes(r.last_event)) return false;
    if (filter === 'problem' && !['bounced', 'complained'].includes(r.last_event)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.subject ?? ''} ${(r.to_addrs ?? []).join(' ')} ${r.from_addr ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    total: rows.length,
    problem: rows.filter((r) => ['bounced', 'complained'].includes(r.last_event)).length,
  };

  return (
    <div className="page-scroll">
    <div style={{ padding: '24px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>📬 Email Log</h1>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          Delivery status for outbound email{counts.problem > 0 ? ` · ${counts.problem} need attention` : ''}
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Live from the email provider — sent, delivered, opened, bounced.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filter === f.key ? 'var(--accent)' : 'transparent',
              color: filter === f.key ? '#fff' : 'var(--muted)',
            }}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipient or subject…"
          style={{
            flex: 1, minWidth: 200, padding: '5px 12px', borderRadius: 16, fontSize: 13,
            border: '1px solid var(--border)', background: 'transparent', color: 'inherit',
          }}
        />
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {rows.length === 0
            ? 'No delivery events yet — they appear here as emails are sent.'
            : 'Nothing matches that filter.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((r) => {
            const meta = STATUS_META[r.last_event] ?? { icon: '✉️', label: r.last_event, color: 'var(--muted)' };
            return (
              <div
                key={r.id}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
                  display: 'flex', gap: 12, alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 18 }} title={meta.label}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.subject || '(no subject)'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    to {(r.to_addrs ?? []).join(', ') || '—'} · from {r.from_addr || '—'}
                  </div>
                  {r.bounce_message && (
                    <div style={{ fontSize: 12.5, color: '#ef4444', marginTop: 2 }}>⛔ {r.bounce_message}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: meta.color, fontWeight: 600 }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }} title={r.last_event_at}>{relTime(r.last_event_at)}</div>
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
