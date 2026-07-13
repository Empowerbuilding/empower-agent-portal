'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface Company {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  owner_id: string | null;
  created_at: string;
  open_deals: number;
  contact_count: number;
}

interface Props {
  companies: Company[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

function NewCompanyModal({ onClose, onCreated, crmUrl, crmKey }: {
  onClose: () => void;
  onCreated: (c: Company) => void;
  crmUrl: string;
  crmKey: string;
}) {
  const [form, setForm] = useState({ name: '', industry: '', city: '', state: '', phone: '', website: '' });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    const crm = createClient(crmUrl, crmKey);
    const { data, error } = await crm.from('companies').insert({
      name: form.name.trim(),
      industry: form.industry || null,
      city: form.city || null,
      state: form.state || null,
      phone: form.phone || null,
      website: form.website || null,
    }).select().single();
    setSaving(false);
    if (!error && data) onCreated({ ...data, open_deals: 0, contact_count: 0 });
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '9px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>New Company</div>

        <input placeholder="Company name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} autoFocus />
        <input placeholder="Industry" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
          <input placeholder="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={{ ...inputStyle, width: 70 }} />
        </div>
        <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
        <input placeholder="Website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} style={inputStyle} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: !form.name.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Create'}
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
  const [showNew, setShowNew] = useState(false);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showNew && (
        <NewCompanyModal
          crmUrl={crmUrl}
          crmKey={crmKey}
          onClose={() => setShowNew(false)}
          onCreated={c => { setCompanies(prev => [c, ...prev]); setShowNew(false); }}
        />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search companies…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
          }}
        />
        <button
          onClick={() => setShowNew(true)}
          style={{
            padding: '8px 14px', background: 'var(--accent)', border: 'none',
            borderRadius: 6, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
          }}
        >
          + New Company
        </button>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 60px 60px',
          padding: '8px 14px', background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Company</span>
          <span>Industry</span>
          <span>Location</span>
          <span style={{ textAlign: 'center' }}>Contacts</span>
          <span style={{ textAlign: 'center' }}>Deals</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {search ? 'No companies match your search.' : 'No companies yet. Add one to get started.'}
          </div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => router.push(`/${orgSlug}/crm/companies/${c.id}`)}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 60px 60px',
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{c.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{c.industry ?? '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                {[c.city, c.state].filter(Boolean).join(', ') || '—'}
              </span>
              <span style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{c.contact_count}</span>
              <span style={{ textAlign: 'center', fontSize: 13 }}>
                {c.open_deals > 0
                  ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{c.open_deals}</span>
                  : <span style={{ color: 'var(--muted)' }}>0</span>
                }
              </span>
            </div>
          ))
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{filtered.length} {filtered.length === 1 ? 'company' : 'companies'}</div>
    </div>
  );
}
