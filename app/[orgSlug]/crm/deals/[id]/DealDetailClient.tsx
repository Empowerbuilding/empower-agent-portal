'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const STAGES = [
  { key: 'concept',     label: 'Concept',     color: '#6366f1' },
  { key: 'qualified',   label: 'Qualified',   color: '#4c8bf0' },
  { key: 'proposal',    label: 'Proposal',    color: '#f59e0b' },
  { key: 'design',      label: 'Design',      color: '#8b5cf6' },
  { key: 'engineering', label: 'Engineering', color: '#ec4899' },
  { key: 'active',      label: 'Active',      color: '#10b981' },
  { key: 'complete',    label: 'Complete',    color: '#22c55e' },
  { key: 'lost',        label: 'Lost',        color: '#ef4444' },
];

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', sms: '💬', sms_sent: '💬', email: '📧', note: '📝',
  stage_change: '🔄', meeting: '📅',
};

interface Props {
  deal: any;
  activities: any[];
  users: { id: string; name: string }[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

export default function DealDetailClient({ deal: initialDeal, activities: initActivities, users, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);
  const [deal, setDeal] = useState(initialDeal);
  const [activities, setActivities] = useState(initActivities);
  const [editValue, setEditValue] = useState<string>(String(deal.value ?? ''));
  const [editingValue, setEditingValue] = useState(false);
  const [savingValue, setSavingValue] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const stageIdx = STAGES.findIndex(s => s.key === deal.stage);
  const curStage = STAGES[stageIdx];
  const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;

  async function moveStage(newStage: string) {
    if (movingStage) return;
    setMovingStage(true);
    const { data } = await crm.from('deals').update({ stage: newStage }).eq('id', deal.id).select().single();
    if (data) setDeal((prev: any) => ({ ...prev, stage: newStage }));
    setMovingStage(false);
  }

  async function saveValue() {
    setSavingValue(true);
    const num = parseFloat(editValue.replace(/[^0-9.]/g, ''));
    const val = isNaN(num) ? null : num;
    const { data } = await crm.from('deals').update({ value: val }).eq('id', deal.id).select().single();
    if (data) setDeal((prev: any) => ({ ...prev, value: val }));
    setSavingValue(false);
    setEditingValue(false);
  }

  async function submitNote() {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    const { data } = await crm.from('activities').insert({
      deal_id: deal.id,
      contact_id: deal.contact?.id ?? null,
      activity_type: 'note',
      title: noteText.trim(),
      created_at: new Date().toISOString(),
    }).select().single();
    setSavingNote(false);
    if (data) { setActivities(prev => [data, ...prev]); setNoteText(''); setAddingNote(false); }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '8px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={sectionStyle}>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                {deal.title || deal.contact?.first_name + ' ' + deal.contact?.last_name || 'Deal'}
              </h1>
              {deal.company_name && <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2, opacity: 0.85 }}>{deal.company_name}</div>}
            </div>
            <button onClick={() => router.back()}
              style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
              ← Back
            </button>
          </div>

          {/* Contact link */}
          {deal.contact && (
            <div style={{ fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href={`/${orgSlug}/crm/contacts/${deal.contact.id}`}
                style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                👤 {deal.contact.first_name} {deal.contact.last_name}
              </a>
              {deal.contact.phone && <a href={`tel:${deal.contact.phone}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>📞 {deal.contact.phone}</a>}
            </div>
          )}

          {/* Stage */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {prevStage && (
              <button onClick={() => moveStage(prevStage.key)} disabled={movingStage}
                style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${prevStage.color}66`, borderRadius: 6, color: prevStage.color, cursor: 'pointer', fontSize: 12 }}>
                ← {prevStage.label}
              </button>
            )}
            {curStage && (
              <span style={{ padding: '5px 14px', background: `${curStage.color}18`, border: `1px solid ${curStage.color}44`, borderRadius: 6, color: curStage.color, fontSize: 13, fontWeight: 700 }}>
                ● {curStage.label}
              </span>
            )}
            {nextStage && (
              <button onClick={() => moveStage(nextStage.key)} disabled={movingStage}
                style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${nextStage.color}66`, borderRadius: 6, color: nextStage.color, cursor: 'pointer', fontSize: 12 }}>
                {nextStage.label} →
              </button>
            )}
          </div>

          {/* Value */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>VALUE:</span>
            {editingValue ? (
              <>
                <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="e.g. 350000"
                  style={{ ...inputStyle, width: 150 }} autoFocus onKeyDown={e => e.key === 'Enter' && saveValue()} />
                <button onClick={saveValue} disabled={savingValue}
                  style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: savingValue ? 0.6 : 1 }}>
                  {savingValue ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingValue(false)} style={{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                  {deal.value != null ? `$${Number(deal.value).toLocaleString()}` : '—'}
                </span>
                <button onClick={() => { setEditingValue(true); setEditValue(String(deal.value ?? '')); }}
                  style={{ padding: '3px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                  ✏️
                </button>
              </>
            )}
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
            {deal.deal_type && <span>Type: {deal.deal_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>}
            {deal.expected_close_date && <span>Close: {new Date(deal.expected_close_date).toLocaleDateString()}</span>}
            <span>Created: {new Date(deal.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div style={sectionStyle}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Activity ({activities.length})</span>
          <button onClick={() => setAddingNote(v => !v)}
            style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Add Note
          </button>
        </div>

        {addingNote && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Write a note…"
              rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingNote(false); setNoteText(''); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={submitNote} disabled={!noteText.trim() || savingNote}
                style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: !noteText.trim() || savingNote ? 0.5 : 1 }}>
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        )}

        {activities.length === 0 ? (
          <div style={{ padding: '14px', color: 'var(--muted)', fontSize: 13 }}>No activity yet.</div>
        ) : activities.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ACTIVITY_ICONS[a.activity_type] ?? '📋'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{a.title}</div>
              {a.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.description}</div>}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
