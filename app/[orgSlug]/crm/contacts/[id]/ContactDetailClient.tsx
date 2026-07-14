'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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

const LEAD_SCORE_STYLES: Record<string, { bg: string; color: string }> = {
  hot:    { bg: '#fee2e2', color: '#b91c1c' },
  medium: { bg: '#fef9c3', color: '#92400e' },
  cold:   { bg: '#dbeafe', color: '#1d4ed8' },
};

const LIFECYCLE_STYLES: Record<string, { bg: string; color: string }> = {
  subscriber:    { bg: '#f3f4f6', color: '#6b7280' },
  lead:          { bg: '#dbeafe', color: '#1d4ed8' },
  mql:           { bg: '#e0e7ff', color: '#4338ca' },
  sql:           { bg: '#ede9fe', color: '#7c3aed' },
  customer:      { bg: '#dcfce7', color: '#15803d' },
  former_client: { bg: '#f3f4f6', color: '#6b7280' },
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', email: '📧', sms: '💬', note: '📝',
  stage_change: '🔄', meeting: '📅',
};

function StageBadge({ stage }: { stage: string }) {
  const s = B2C_STAGES.find(x => x.key === stage) ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44` }}>
      {s.label}
    </span>
  );
}

interface Props {
  contact: any;
  activities: any[];
  tasks: any[];
  deal: any | null;
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

export default function ContactDetailClient({ contact, activities: initActivities, tasks: initTasks, deal: initDeal, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);

  const [deal, setDeal] = useState(initDeal);
  const [activities, setActivities] = useState(initActivities);
  const [tasks, setTasks] = useState(initTasks);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', due_date: '' });
  const [addingTask, setAddingTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(true);

  const fullName = `${contact.first_name} ${contact.last_name}`;
  const leadScore = contact.lead_score?.toLowerCase();
  const leadStyle = leadScore ? (LEAD_SCORE_STYLES[leadScore] ?? { bg: '#f3f4f6', color: '#6b7280' }) : null;
  const lifecycleStyle = contact.lifecycle_stage ? (LIFECYCLE_STYLES[contact.lifecycle_stage] ?? { bg: '#f3f4f6', color: '#6b7280' }) : null;

  const currentStageIdx = deal ? B2C_STAGES.findIndex(s => s.key === deal.stage) : -1;
  const prevStage = currentStageIdx > 0 ? B2C_STAGES[currentStageIdx - 1] : null;
  const nextStage = currentStageIdx >= 0 && currentStageIdx < B2C_STAGES.length - 1 ? B2C_STAGES[currentStageIdx + 1] : null;

  async function moveStage(newStage: string) {
    if (!deal || movingStage) return;
    setMovingStage(true);
    const { data } = await crm.from('deals').update({ stage: newStage }).eq('id', deal.id).select().single();
    if (data) setDeal(data);
    setMovingStage(false);
  }

  async function submitNote() {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    const { data } = await crm.from('activities').insert({
      contact_id: contact.id,
      activity_type: 'note',
      title: noteText.trim(),
      created_at: new Date().toISOString(),
    }).select().single();
    setSavingNote(false);
    if (data) {
      setActivities(prev => [data, ...prev]);
      setNoteText('');
      setAddingNote(false);
    }
  }

  async function toggleTask(task: any) {
    await crm.from('tasks').update({ completed: true, status: 'completed' }).eq('id', task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  }

  async function addTask() {
    if (!newTask.title.trim() || savingTask) return;
    setSavingTask(true);
    const { data } = await crm.from('tasks').insert({
      contact_id: contact.id,
      title: newTask.title.trim(),
      due_date: newTask.due_date || null,
      completed: false,
      status: 'open',
    }).select().single();
    setSavingTask(false);
    if (data) {
      setTasks(prev => [...prev, data]);
      setNewTask({ title: '', due_date: '' });
      setAddingTask(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '8px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
    background: 'var(--surface)',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
    fontWeight: 600, fontSize: 13, color: 'var(--text)',
    background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={sectionStyle}>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fullName}</h1>
              {contact.companies?.name && (
                <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2, opacity: 0.85 }}>{contact.companies.name}</div>
              )}
            </div>
            <button
              onClick={() => router.push(`/${orgSlug}/crm/contacts`)}
              style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
            >
              ← Back
            </button>
          </div>

          {/* Contact info */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>📞 {contact.phone}</a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>✉️ {contact.email}</a>
            )}
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {leadStyle && (
              <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: leadStyle.bg, color: leadStyle.color }}>
                {contact.lead_score}
              </span>
            )}
            {contact.whale_tier && (contact.whale_tier === 'WHALE' || contact.whale_tier === 'SOLID' || contact.whale_tier === 'WARM') && (
              <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>
                🐋 {contact.whale_tier}
              </span>
            )}
            {lifecycleStyle && (
              <span style={{ padding: '3px 9px', borderRadius: 10, fontSize: 12, fontWeight: 500, background: lifecycleStyle.bg, color: lifecycleStyle.color }}>
                {(contact.lifecycle_stage ?? '').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </span>
            )}
            {contact.lead_source && (
              <span style={{ fontSize: 12, color: 'var(--muted)', padding: '3px 0' }}>via {contact.lead_source}</span>
            )}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Added {new Date(contact.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Deal section */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span>Active Deal</span>
        </div>
        <div style={{ padding: 14 }}>
          {deal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <StageBadge stage={deal.stage} />
                {deal.deal_type && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{deal.deal_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>}
                {deal.value && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>${Number(deal.value).toLocaleString()}</span>}
                {deal.expected_close_date && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Close: {new Date(deal.expected_close_date).toLocaleDateString()}</span>}
              </div>

              {/* Stage mover */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>MOVE:</span>
                {prevStage && (
                  <button
                    onClick={() => moveStage(prevStage.key)}
                    disabled={movingStage}
                    style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${prevStage.color}66`, borderRadius: 6, color: prevStage.color, cursor: 'pointer', fontSize: 12 }}
                  >
                    ← {prevStage.label}
                  </button>
                )}
                <span style={{ padding: '5px 12px', background: `${B2C_STAGES[currentStageIdx]?.color ?? '#6b7280'}18`, border: `1px solid ${B2C_STAGES[currentStageIdx]?.color ?? '#6b7280'}44`, borderRadius: 6, color: B2C_STAGES[currentStageIdx]?.color ?? '#6b7280', fontSize: 12, fontWeight: 600 }}>
                  ● {B2C_STAGES[currentStageIdx]?.label ?? deal.stage}
                </span>
                {nextStage && (
                  <button
                    onClick={() => moveStage(nextStage.key)}
                    disabled={movingStage}
                    style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${nextStage.color}66`, borderRadius: 6, color: nextStage.color, cursor: 'pointer', fontSize: 12 }}
                  >
                    {nextStage.label} →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No active deal for this contact.</div>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span>Recent Activity ({activities.length})</span>
          <button
            onClick={() => setAddingNote(v => !v)}
            style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Note
          </button>
        </div>

        {addingNote && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Write a note…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingNote(false); setNoteText(''); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={submitNote} disabled={!noteText.trim() || savingNote} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: !noteText.trim() || savingNote ? 0.5 : 1 }}>
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        )}

        <div>
          {activities.length === 0 ? (
            <div style={{ padding: '16px 14px', color: 'var(--muted)', fontSize: 13 }}>No activity yet.</div>
          ) : (
            activities.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{ACTIVITY_ICONS[a.activity_type] ?? '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{a.title}</div>
                  {a.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{a.description}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tasks */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <span>Open Tasks ({tasks.length})</span>
          <button
            onClick={() => setAddingTask(v => !v)}
            style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Task
          </button>
        </div>

        {addingTask && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={newTask.title}
              onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title *"
              style={inputStyle}
              autoFocus
            />
            <input
              type="date"
              value={newTask.due_date}
              onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingTask(false); setNewTask({ title: '', due_date: '' }); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={addTask} disabled={!newTask.title.trim() || savingTask} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: !newTask.title.trim() || savingTask ? 0.5 : 1 }}>
                {savingTask ? 'Saving…' : 'Add Task'}
              </button>
            </div>
          </div>
        )}

        <div>
          {tasks.length === 0 ? (
            <div style={{ padding: '16px 14px', color: 'var(--muted)', fontSize: 13 }}>No open tasks.</div>
          ) : (
            tasks.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleTask(t)}
                  style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {t.due_date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Due {new Date(t.due_date).toLocaleDateString()}</span>}
                    {t.priority && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: t.priority === 'high' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#6b7280', textTransform: 'capitalize' }}>{t.priority}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Enrichment (collapsible) */}
      <div style={sectionStyle}>
        <button
          onClick={() => setEnrichOpen(v => !v)}
          style={{ ...sectionHeaderStyle, width: '100%', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}
        >
          <span>Enrichment Data</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{enrichOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {enrichOpen && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Whale */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Whale Score</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                {contact.whale_score != null ? `${contact.whale_score}` : '—'} {contact.whale_tier ? `· ${contact.whale_tier}` : ''}
              </div>
            </div>

            {/* ATTOM */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>ATTOM Property</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
                <span>Value: {contact.attom_avm_value ? `$${Number(contact.attom_avm_value).toLocaleString()}` : '—'}</span>
                <span>Beds: {contact.attom_beds ?? '—'}</span>
                <span>Baths: {contact.attom_baths ?? '—'}</span>
                <span>Year Built: {contact.attom_year_built ?? '—'}</span>
                <span>Acres: {contact.attom_lot_acres != null ? Number(contact.attom_lot_acres).toFixed(2) : '—'}</span>
              </div>
            </div>

            {/* Trestle */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Trestle</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
                <span>Line: {contact.trestle_line_type ?? '—'}</span>
                <span>Carrier: {contact.trestle_carrier ?? '—'}</span>
                <span>Owner: {contact.trestle_owner_name ?? '—'}</span>
              </div>
            </div>

            {/* PDL */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>PDL</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
                <span>Title: {contact.job_title ?? '—'}</span>
                <span>Employer: {contact.employer ?? '—'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
