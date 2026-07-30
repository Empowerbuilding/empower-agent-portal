'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const STAGES = [
  { key: 'qualified',        label: 'Qualified' },
  { key: 'proposal',         label: 'Proposal' },
  { key: 'design',           label: 'Design' },
  { key: 'engineering',      label: 'Engineering' },
  { key: 'builder_referral', label: 'Builder Referral' },
  { key: 'active',           label: 'Active' },
  { key: 'complete',         label: 'Complete' },
  { key: 'lost',             label: 'Lost' },
];

const DEAL_TYPE_LABELS: Record<string, string> = {
  custom_design:    'Custom Design',
  builder_referral: 'Builder Referral',
  engineering:      'Engineering',
  budget_builder:   'Budget Builder',
  referral:         'Referral',
  marketing:        'Marketing',
  software_fees:    'Software Fees',
};

interface EditDealSlideOverProps {
  open: boolean;
  onClose: () => void;
  deal: any;
  contacts: { id: string; first_name: string; last_name: string }[];
  crmUrl: string;
  crmKey: string;
  onSaved: (updated: any) => void;
  onDeleted: () => void;
}

export default function EditDealSlideOver({
  open, onClose, deal, contacts, crmUrl, crmKey, onSaved, onDeleted,
}: EditDealSlideOverProps) {
  const crm = createClient(crmUrl, crmKey);

  const [form, setForm] = useState({
    title: '',
    contact_id: '',
    deal_type: '',
    stage: 'qualified',
    value: '',
    expected_close_date: '',
    actual_close_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deal && open) {
      setForm({
        title: deal.title ?? '',
        contact_id: deal.contact_id ?? deal.contact?.id ?? '',
        deal_type: deal.deal_type ?? '',
        stage: deal.stage ?? 'qualified',
        value: deal.value != null ? String(deal.value) : '',
        expected_close_date: deal.expected_close_date ?? '',
        actual_close_date: deal.actual_close_date ?? '',
      });
      setError(null);
    }
  }, [deal, open]);

  if (!open) return null;

  const showActualClose = form.stage === 'complete';

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    setError(null);

    const payload: any = {
      title: form.title.trim(),
      contact_id: form.contact_id || null,
      deal_type: form.deal_type || null,
      stage: form.stage,
      value: form.value ? parseFloat(form.value) : null,
      expected_close_date: form.expected_close_date || null,
      actual_close_date: form.actual_close_date || null,
    };

    // Auto-fill actual_close_date when marking complete
    if (form.stage === 'complete' && !payload.actual_close_date) {
      payload.actual_close_date = new Date().toISOString().split('T')[0];
    }

    const { data, error: updateError } = await crm
      .from('deals')
      .update(payload)
      .eq('id', deal.id)
      .select('*, contacts(id, first_name, last_name, phone, email), companies(name)')
      .single();

    setSaving(false);

    if (updateError) {
      setError(updateError.message || 'Failed to save deal.');
      return;
    }

    if (data) {
      const normalized = {
        ...data,
        contact: Array.isArray(data.contacts) ? (data.contacts[0] ?? null) : data.contacts,
        company_name: Array.isArray(data.companies) ? data.companies[0]?.name : data.companies?.name,
      };
      onSaved(normalized);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this deal? This cannot be undone.')) return;
    setDeleting(true);
    const { error: deleteError } = await crm.from('deals').delete().eq('id', deal.id);
    setDeleting(false);
    if (deleteError) { setError(deleteError.message || 'Failed to delete.'); return; }
    onDeleted();
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '9px 12px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 200,
        }}
      />

      {/* Slide-over panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: 420,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Edit Deal</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{
              padding: '10px 12px', background: '#ef444420', border: '1px solid #ef444444',
              borderRadius: 6, fontSize: 13, color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Contact */}
          <div>
            <label style={labelStyle}>Contact</label>
            <select
              value={form.contact_id}
              onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">No contact</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>

          {/* Deal Type */}
          <div>
            <label style={labelStyle}>Deal Type</label>
            <select
              value={form.deal_type}
              onChange={e => setForm(f => ({ ...f, deal_type: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Select type…</option>
              {Object.entries(DEAL_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label style={labelStyle}>Stage</label>
            <select
              value={form.stage}
              onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Value */}
          <div>
            <label style={labelStyle}>Value ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 12500"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Expected Close Date */}
          <div>
            <label style={labelStyle}>Expected Close Date</label>
            <input
              type="date"
              value={form.expected_close_date}
              onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Actual Close Date — only shown when stage = complete */}
          {showActualClose && (
            <div>
              <label style={labelStyle}>Actual Close Date</label>
              <input
                type="date"
                value={form.actual_close_date}
                onChange={e => setForm(f => ({ ...f, actual_close_date: e.target.value }))}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Required to mark as Complete. Auto-filled to today if blank.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
        }}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '8px 14px', background: 'none', border: '1px solid #ef444455',
              borderRadius: 6, color: '#ef4444', fontSize: 13, cursor: 'pointer',
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px', background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.title.trim() || saving}
              style={{
                padding: '8px 16px', background: 'var(--accent)', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', opacity: !form.title.trim() || saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
