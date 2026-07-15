'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Company {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  open_deals: number;
  contact_count: number;
  primary_contact: string | null;
  total_revenue: number;
}

interface Props {
  companies: Company[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

const CLIENT_TYPES = [
  { value: 'builder',       label: 'Builder' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'engineer',      label: 'Engineer' },
  { value: 'architect',     label: 'Architect' },
  { value: 'realtor',       label: 'Realtor' },
  { value: 'consumer',      label: 'Consumer' },
  { value: 'roofing',       label: 'Roofing' },
  { value: 'o&g',           label: 'O&G' },
];

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  builder:       { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
  subcontractor: { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c' },
  engineer:      { bg: 'rgba(168,85,247,0.15)',  color: '#c084fc' },
  architect:     { bg: 'rgba(236,72,153,0.15)',  color: '#f472b6' },
  realtor:       { bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf' },
  consumer:      { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  roofing:       { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  'o&g':         { bg: 'rgba(234,179,8,0.15)',   color: '#facc15' },
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
  const colors = TYPE_COLORS[type.toLowerCase()] ?? { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: colors.bg, color: colors.color, textTransform: 'capitalize',
    }}>
      {type}
    </span>
  );
}

function formatRevenue(val: number): string {
  if (!val) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function NewCompanyModal({ onClose, onCreated, crmUrl, crmKey, defaultType }: {
  onClose: () => void;
  onCreated: (c: Company) => void;
  crmUrl: string;
  crmKey: string;
  defaultType: string;
}) {
  const [form, setForm] = useState({ name: '', type: defaultType, city: '', state: '', phone: '', website: '' });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const crm = createClient(crmUrl, crmKey);
    const { data, error } = await crm.from('companies').insert({
      name: form.name.trim(),
      type: form.type || null,
      city: form.city || null,
      state: form.state || null,
      phone: form.phone || null,
      website: form.website || null,
    }).select().single();
    setSaving(false);
    if (!error && data) onCreated({ ...data, open_deals: 0, contact_count: 0, primary_contact: null, total_revenue: 0 });
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '9px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Add Company</div>
        <input style={inputStyle} placeholder="Company name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <select style={inputStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
          {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input style={inputStyle} placeholder="City" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
        <input style={inputStyle} placeholder="State" value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
        <input style={inputStyle} placeholder="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
        <input style={inputStyle} placeholder="Website" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CompaniesClient({ companies: initial, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initial);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filtered = companies.filter(c => {
    if (typeFilter && c.type !== typeFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.city ?? '').toLowerCase().includes(search.toLowerCase()) &&
        !(c.primary_contact ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selectStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0f1117)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, city, contact…"
          style={{ ...selectStyle, flex: 1 }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...selectStyle, minWidth: 130 }}>
          <option value="">All Types</option>
          {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Add
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 100px 140px 140px 70px 90px',
            padding: '8px 16px', background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Company</span>
            <span>Type</span>
            <span>Location</span>
            <span>Primary Contact</span>
            <span style={{ textAlign: 'center' }}>Deals</span>
            <span style={{ textAlign: 'right' }}>Revenue</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No companies match your filter.
            </div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                onClick={() => router.push(`/${orgSlug}/crm/companies/${c.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 100px 140px 140px 70px 90px',
                  padding: '12px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{c.phone}</div>}
                </div>
                <div><TypeBadge type={c.type} /></div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {c.primary_contact || <span style={{ color: 'var(--muted)' }}>—</span>}
                </div>
                <div style={{ textAlign: 'center', fontSize: 13, color: c.open_deals > 0 ? 'var(--text)' : 'var(--muted)' }}>
                  {c.open_deals || '—'}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: c.total_revenue > 0 ? 600 : 400, color: c.total_revenue > 0 ? 'var(--text)' : 'var(--muted)' }}>
                  {formatRevenue(c.total_revenue)}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} of {companies.length} companies
        </div>
      </div>

      {showModal && (
        <NewCompanyModal
          onClose={() => setShowModal(false)}
          onCreated={c => { setCompanies(prev => [c, ...prev].sort((a, b) => a.name.localeCompare(b.name))); setShowModal(false); }}
          crmUrl={crmUrl}
          crmKey={crmKey}
          defaultType="builder"
        />
      )}
    </div>
  );
}
