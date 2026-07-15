'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type StatusVal = 'none' | 'pending' | 'possible' | 'in_progress' | 'signed' | 'not_interested';

const STATUS_OPTIONS: { value: StatusVal; label: string; bg: string; color: string }[] = [
  { value: 'none',           label: 'None',           bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  { value: 'pending',        label: 'Pending',        bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
  { value: 'possible',       label: 'Possible',       bg: 'rgba(234,179,8,0.15)',   color: '#facc15' },
  { value: 'in_progress',    label: 'In Progress',    bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  { value: 'signed',         label: 'Signed ✓',       bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  { value: 'not_interested', label: 'Not Interested', bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
];

function statusStyle(val: string) {
  return STATUS_OPTIONS.find(s => s.value === val) ?? STATUS_OPTIONS[0];
}

interface Row {
  contact_id: string;
  contact_name: string;
  owner_id: string | null;
  cross_sell_id: string | null;
  engineering_status: string;
  engineering_notes: string;
  builder_referral_status: string;
  builder_id: string | null;
  builder_ids: string[];
  builder_referral_name: string;
  sub_referral_status: string;
  sub_referral_notes: string;
  assigned_to: string | null;
  notes: string;
  next_action_date: string | null;
}

interface Builder {
  id: string;
  company_name: string;
}

interface Props {
  rows: Row[];
  builders: Builder[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

function StatusBadge({ value }: { value: string }) {
  const s = statusStyle(value);
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
        background: statusStyle(value).bg, color: statusStyle(value).color,
        border: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
      }}
    >
      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function BuilderMultiSelect({ selectedIds, builders, onChange }: {
  selectedIds: string[];
  builders: Builder[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOut);
    return () => document.removeEventListener('mousedown', handleOut);
  }, []);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    onChange(next);
  };

  const label = selectedIds.length === 0
    ? '— none —'
    : selectedIds.length === 1
      ? builders.find(b => b.id === selectedIds[0])?.company_name ?? '1 selected'
      : `${selectedIds.length} builders`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 12, color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4,
          padding: '3px 8px', background: 'var(--sidebar-bg)', cursor: 'pointer',
          maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <span style={{ color: 'var(--muted)', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: 2,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 200, maxHeight: 220, overflowY: 'auto',
        }}>
          {builders.map(b => (
            <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(b.id)}
                onChange={() => toggle(b.id)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{b.company_name}</span>
            </label>
          ))}
          {builders.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)' }}>No builders</div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_SORT: Record<string, number> = {
  signed: 0, in_progress: 1, possible: 2, pending: 3, none: 4, not_interested: 5,
};

type SortKey = 'contact_name' | 'engineering_status' | 'builder_referral_status' | 'sub_referral_status' | 'assigned_to';

export default function CrossSellClient({ rows: initial, builders, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('contact_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const crm = createClient(crmUrl, crmKey);

  const update = async (contactId: string, field: string, value: string | null | string[]) => {
    setSaving(contactId);
    const row = rows.find(r => r.contact_id === contactId)!;
    const updated = { ...row, [field]: value };
    setRows(prev => prev.map(r => r.contact_id === contactId ? updated : r));

    if (updated.cross_sell_id) {
      await crm.from('cross_sell_opportunities').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', updated.cross_sell_id);
    } else {
      const { data } = await crm.from('cross_sell_opportunities').insert({
        contact_id: contactId,
        contact_name: updated.contact_name,
        [field]: value,
      }).select('id').single();
      if (data?.id) setRows(prev => prev.map(r => r.contact_id === contactId ? { ...r, cross_sell_id: data.id } : r));
    }
    setSaving(null);
  };

  const updateBuilders = async (contactId: string, ids: string[]) => {
    const names = ids.map(id => builders.find(b => b.id === id)?.company_name ?? '').filter(Boolean);
    const row = rows.find(r => r.contact_id === contactId)!;
    const updated = { ...row, builder_ids: ids, builder_id: ids[0] ?? null, builder_referral_name: names.join(', ') };
    setSaving(contactId);
    setRows(prev => prev.map(r => r.contact_id === contactId ? updated : r));
    if (updated.cross_sell_id) {
      await crm.from('cross_sell_opportunities').update({
        builder_ids: ids, builder_id: ids[0] ?? null, builder_referral_name: names.join(', '), updated_at: new Date().toISOString(),
      }).eq('id', updated.cross_sell_id);
    } else {
      const { data } = await crm.from('cross_sell_opportunities').insert({
        contact_id: contactId, contact_name: updated.contact_name,
        builder_ids: ids, builder_id: ids[0] ?? null, builder_referral_name: names.join(', '),
      }).select('id').single();
      if (data?.id) setRows(prev => prev.map(r => r.contact_id === contactId ? { ...r, cross_sell_id: data.id } : r));
    }
    setSaving(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = rows.filter(r =>
    !search || r.contact_name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'contact_name' || sortKey === 'assigned_to') {
      const aVal = (a[sortKey] ?? '').toLowerCase();
      const bVal = (b[sortKey] ?? '').toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aOrd = STATUS_SORT[a[sortKey]] ?? 99;
    const bOrd = STATUS_SORT[b[sortKey]] ?? 99;
    return sortDir === 'asc' ? aOrd - bOrd : bOrd - aOrd;
  });

  const engSigned = rows.filter(r => r.engineering_status === 'signed').length;
  const bldSigned = rows.filter(r => r.builder_referral_status === 'signed').length;
  const subSigned = rows.filter(r => r.sub_referral_status === 'signed').length;

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
    borderBottom: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.03)',
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0f1117)' }}>
        {[
          { label: 'Engineering Signed',       value: engSigned, color: '#c084fc' },
          { label: 'Builder Referrals Signed', value: bldSigned, color: '#60a5fa' },
          { label: 'Sub Referrals Signed',     value: subSigned, color: '#4ade80' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
              {s.value}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>/ {rows.length}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 20px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients…"
          style={{
            background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text)', padding: '7px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0 20px 20px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', minWidth: 700 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('contact_name')}>Client{sortIcon('contact_name')}</th>
                <th style={thStyle} onClick={() => handleSort('engineering_status')}>Engineering{sortIcon('engineering_status')}</th>
                <th style={thStyle} onClick={() => handleSort('builder_referral_status')}>Builder Referral{sortIcon('builder_referral_status')}</th>
                <th style={thStyle}>Builder</th>
                <th style={thStyle} onClick={() => handleSort('sub_referral_status')}>Sub Referral{sortIcon('sub_referral_status')}</th>
                <th style={thStyle} onClick={() => handleSort('assigned_to')}>Assigned{sortIcon('assigned_to')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No customers yet.</td></tr>
              ) : sorted.map((row, i) => (
                <tr
                  key={row.contact_id}
                  style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => router.push(`/${orgSlug}/crm/contacts/${row.contact_id}`)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, textAlign: 'left' }}
                    >
                      {saving === row.contact_id && <span style={{ fontSize: 10, color: 'var(--muted)', marginRight: 6 }}>saving…</span>}
                      {row.contact_name}
                    </button>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusSelect value={row.engineering_status} onChange={v => update(row.contact_id, 'engineering_status', v)} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusSelect value={row.builder_referral_status} onChange={v => update(row.contact_id, 'builder_referral_status', v)} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <BuilderMultiSelect
                      selectedIds={row.builder_ids ?? []}
                      builders={builders}
                      onChange={ids => updateBuilders(row.contact_id, ids)}
                    />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusSelect value={row.sub_referral_status} onChange={v => update(row.contact_id, 'sub_referral_status', v)} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={row.assigned_to ?? ''}
                      onChange={e => update(row.contact_id, 'assigned_to', e.target.value || null)}
                      style={{
                        fontSize: 12, color: 'var(--text)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '3px 8px', background: 'var(--sidebar-bg)',
                      }}
                    >
                      <option value="">—</option>
                      <option value="larry">Larry</option>
                      <option value="shannon">Shannon</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{sorted.length} clients</div>
      </div>
    </div>
  );
}
