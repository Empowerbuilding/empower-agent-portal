'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const STAGES = [
  { key: 'new_lead',       label: 'New Lead',       color: '#6b7280' },
  { key: 'qualified',      label: 'Qualified',      color: '#4c8bf0' },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: '#8b5cf6' },
  { key: 'proposal_sent',  label: 'Proposal Sent',  color: '#f59e0b' },
  { key: 'negotiation',    label: 'Negotiation',    color: '#f97316' },
  { key: 'closed_won',     label: 'Closed Won',     color: '#22c55e' },
  { key: 'closed_lost',    label: 'Closed Lost',    color: '#ef4444' },
];

function StageBadge({ stage }: { stage: string }) {
  const s = STAGES.find(x => x.key === stage) ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

function NewDealModal({ companies, onClose, onCreated, crmUrl, crmKey }: {
  companies: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (d: any) => void;
  crmUrl: string;
  crmKey: string;
}) {
  const [form, setForm] = useState({ title: '', company_id: '', value: '', stage: 'new_lead', seats: '', training_type: '', training_date: '' });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const crm = createClient(crmUrl, crmKey);
    const { data } = await crm.from('deals').insert({
      title: form.title.trim(),
      company_id: form.company_id || null,
      value: form.value ? parseFloat(form.value) : null,
      stage: form.stage,
      seats: form.seats ? parseInt(form.seats) : null,
      training_type: form.training_type || null,
      training_date: form.training_date || null,
    }).select().single();
    setSaving(false);
    if (data) onCreated(data);
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '9px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>New Deal</div>

        <input placeholder="Deal title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} autoFocus />

        <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">No company</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Value ($)" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} style={{ ...inputStyle, flex: 1 }} type="number" />
          <input placeholder="Seats" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))} style={{ ...inputStyle, width: 80 }} type="number" />
        </div>

        <input placeholder="Training type (safety, leadership…)" value={form.training_type} onChange={e => setForm(f => ({ ...f, training_type: e.target.value }))} style={inputStyle} />
        <input type="date" value={form.training_date} onChange={e => setForm(f => ({ ...f, training_date: e.target.value }))} style={inputStyle} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={!form.title.trim() || saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: !form.title.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DealsClient({ deals: initial, companies, orgSlug, crmUrl, crmKey }: {
  deals: any[]; companies: { id: string; name: string }[];
  orgSlug: string; crmUrl: string; crmKey: string;
}) {
  const [deals, setDeals] = useState(initial);
  const [stageFilter, setStageFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);

  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));

  const filtered = stageFilter === 'all'
    ? deals
    : deals.filter(d => d.stage === stageFilter);

  const totalValue = filtered.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showNew && (
        <NewDealModal
          companies={companies}
          crmUrl={crmUrl}
          crmKey={crmKey}
          onClose={() => setShowNew(false)}
          onCreated={d => { setDeals(prev => [d, ...prev]); setShowNew(false); }}
        />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          style={{
            background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer',
          }}
        >
          <option value="all">All Stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} deals · ${totalValue.toLocaleString()} total
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          + New Deal
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 80px 80px 1fr',
          padding: '8px 14px', background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Deal</span>
          <span>Company</span>
          <span>Stage</span>
          <span>Value</span>
          <span>Seats</span>
          <span>Training</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No deals yet.</div>
        ) : (
          filtered.map((d, i) => (
            <div
              key={d.id}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 80px 80px 1fr',
                padding: '10px 14px', cursor: 'default',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{d.title}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{companyMap[d.company_id] ?? '—'}</span>
              <span><StageBadge stage={d.stage} /></span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{d.value ? `$${Number(d.value).toLocaleString()}` : '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{d.seats ?? '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                {d.training_type ?? ''}{d.training_date ? ` · ${new Date(d.training_date).toLocaleDateString()}` : ''}
                {!d.training_type && !d.training_date ? '—' : ''}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
