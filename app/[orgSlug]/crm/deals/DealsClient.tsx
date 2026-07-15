'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ITS Training (B2B) stages
const B2B_STAGES = [
  { key: 'new_lead',       label: 'New Lead',       color: '#6b7280' },
  { key: 'qualified',      label: 'Qualified',      color: '#4c8bf0' },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: '#8b5cf6' },
  { key: 'proposal_sent',  label: 'Proposal Sent',  color: '#f59e0b' },
  { key: 'negotiation',    label: 'Negotiation',    color: '#f97316' },
  { key: 'closed_won',     label: 'Closed Won',     color: '#22c55e' },
  { key: 'closed_lost',    label: 'Closed Lost',    color: '#ef4444' },
];

// Barnhaus (B2C) stages
const B2C_STAGES = [
  { key: 'concept',     label: 'Concept',     color: '#6366f1' },
  { key: 'qualified',   label: 'Qualified',   color: '#4c8bf0' },
  { key: 'proposal',    label: 'Proposal',    color: '#f59e0b' },
  { key: 'design',      label: 'Design',      color: '#8b5cf6' },
  { key: 'engineering', label: 'Engineering', color: '#ec4899' },
  { key: 'active',      label: 'Active',      color: '#10b981' },
  { key: 'complete',    label: 'Complete',    color: '#22c55e' },
  { key: 'lost',        label: 'Lost',        color: '#ef4444' },
];

// B2C consumer deal types (homeowners)
const CONSUMER_DEAL_TYPES = ['custom_design', 'concept', 'engineering', 'budget_builder'];
// B2C builder/partner deal types
const BUILDER_DEAL_TYPES = ['referral', 'marketing', 'software_fees'];

const DEAL_TYPE_LABELS: Record<string, string> = {
  custom_design:  'Custom Design',
  concept:        'Concept',
  engineering:    'Engineering',
  software_fees:  'Software Fees',
  referral:       'Referral',
  budget_builder: 'Budget Builder',
  marketing:      'Marketing',
};

function StageBadge({ stage, crmMode }: { stage: string; crmMode: string }) {
  const stages = crmMode === 'b2c' ? B2C_STAGES : B2B_STAGES;
  const s = stages.find(x => x.key === stage) ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

function NewDealModal({ companies, contacts, onClose, onCreated, crmUrl, crmKey, crmMode, salesTab }: {
  companies: { id: string; name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
  onClose: () => void;
  onCreated: (d: any) => void;
  crmUrl: string;
  crmKey: string;
  crmMode: string;
  salesTab?: string;
}) {
  const stages = crmMode === 'b2c' ? B2C_STAGES : B2B_STAGES;
  const defaultDealType = salesTab === 'builder' ? 'referral' : (crmMode === 'b2c' ? 'custom_design' : '');

  const [form, setForm] = useState({
    title: '',
    company_id: '',
    contact_id: '',
    value: '',
    stage: stages[0].key,
    deal_type: defaultDealType,
    expected_close_date: '',
    // B2B fields
    seats: '',
    training_type: '',
    training_date: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const crm = createClient(crmUrl, crmKey);

    const payload: any = {
      title: form.title.trim(),
      value: form.value ? parseFloat(form.value) : null,
      stage: form.stage,
    };

    if (crmMode === 'b2c') {
      payload.contact_id = form.contact_id || null;
      payload.deal_type = form.deal_type || null;
      payload.expected_close_date = form.expected_close_date || null;
    } else {
      payload.company_id = form.company_id || null;
      payload.seats = form.seats ? parseInt(form.seats) : null;
      payload.training_type = form.training_type || null;
      payload.training_date = form.training_date || null;
    }

    const { data } = await crm.from('deals').insert(payload).select().single();
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

        {crmMode === 'b2c' ? (
          <>
            <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No contact linked</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
            <select value={form.deal_type} onChange={e => setForm(f => ({ ...f, deal_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Deal type…</option>
              {Object.entries(DEAL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="date" placeholder="Expected close date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} style={inputStyle} />
          </>
        ) : (
          <>
            <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No company</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="Seats" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))} style={{ ...inputStyle, width: 80 }} type="number" />
            </div>
            <input placeholder="Training type" value={form.training_type} onChange={e => setForm(f => ({ ...f, training_type: e.target.value }))} style={inputStyle} />
            <input type="date" value={form.training_date} onChange={e => setForm(f => ({ ...f, training_date: e.target.value }))} style={inputStyle} />
          </>
        )}

        <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <input placeholder="Value ($)" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} style={inputStyle} type="number" />

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

export default function DealsClient({ deals: initial, companies, contacts, orgSlug, crmUrl, crmKey, crmMode }: {
  deals: any[];
  companies: { id: string; name: string }[];
  contacts: { id: string; first_name: string; last_name: string }[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
  crmMode: string;
}) {
  const [deals, setDeals] = useState(initial);
  const [stageFilter, setStageFilter] = useState('all');
  const [salesTab, setSalesTab] = useState<'consumer' | 'builder'>('consumer'); // B2C only
  const [showNew, setShowNew] = useState(false);

  const stages = crmMode === 'b2c' ? B2C_STAGES : B2B_STAGES;
  const companyMap = Object.fromEntries(companies.map(c => [c.id, c.name]));
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, `${c.first_name} ${c.last_name}`]));

  // For b2c: split by deal type category
  const tabFiltered = crmMode === 'b2c'
    ? deals.filter(d => {
        const dt = d.deal_type ?? '';
        return salesTab === 'consumer'
          ? CONSUMER_DEAL_TYPES.includes(dt) || (!BUILDER_DEAL_TYPES.includes(dt) && !CONSUMER_DEAL_TYPES.includes(dt)) // include untyped in consumer
          : BUILDER_DEAL_TYPES.includes(dt);
      })
    : deals;

  const filtered = stageFilter === 'all'
    ? tabFiltered
    : tabFiltered.filter(d => d.stage === stageFilter);

  const totalValue = filtered.reduce((sum, d) => sum + (d.value ?? 0), 0);

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'var(--sidebar-bg)',
    color: active ? '#fff' : 'var(--muted)',
    border: 'none', cursor: 'pointer',
  });

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showNew && (
        <NewDealModal
          companies={companies}
          contacts={contacts}
          crmUrl={crmUrl}
          crmKey={crmKey}
          crmMode={crmMode}
          salesTab={salesTab}
          onClose={() => setShowNew(false)}
          onCreated={d => { setDeals(prev => [d, ...prev]); setShowNew(false); }}
        />
      )}

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0f1117)', paddingBottom: 8, marginBottom: -4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* B2C: Consumer / Builder toggle */}
      {crmMode === 'b2c' && (
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', alignSelf: 'flex-start' }}>
          <button style={tabBtn(salesTab === 'consumer')} onClick={() => { setSalesTab('consumer'); setStageFilter('all'); }}>
            🏠 Consumer
          </button>
          <button style={{ ...tabBtn(salesTab === 'builder'), borderLeft: '1px solid var(--border)' }} onClick={() => { setSalesTab('builder'); setStageFilter('all'); }}>
            🏗 Builder
          </button>
        </div>
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
          {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} deals{totalValue > 0 ? ` · $${totalValue.toLocaleString()}` : ''}
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
        >
          + New Deal
        </button>
      </div>

      </div>{/* end sticky */}

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Headers */}
        {crmMode === 'b2c' ? (
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 80px',
            padding: '8px 14px', background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Deal</span>
            <span>Contact</span>
            <span>Stage</span>
            <span>Type</span>
            <span>Value</span>
          </div>
        ) : (
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
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No {crmMode === 'b2c' && salesTab === 'builder' ? 'builder' : ''} deals yet.
          </div>
        ) : (
          filtered.map((d, i) => crmMode === 'b2c' ? (
            <div
              key={d.id}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 80px',
                padding: '10px 14px', cursor: 'default',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{d.title}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{contactMap[d.contact_id] ?? '—'}</span>
              <span><StageBadge stage={d.stage} crmMode={crmMode} /></span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{DEAL_TYPE_LABELS[d.deal_type] ?? d.deal_type ?? '—'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{d.value ? `$${Number(d.value).toLocaleString()}` : '—'}</span>
            </div>
          ) : (
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
              <span><StageBadge stage={d.stage} crmMode={crmMode} /></span>
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
