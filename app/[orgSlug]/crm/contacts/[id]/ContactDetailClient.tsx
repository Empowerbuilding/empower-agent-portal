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

const LIFECYCLE_OPTIONS = [
  { key: 'subscriber',    label: 'Subscriber',    color: '#6b7280' },
  { key: 'lead',          label: 'Lead',          color: '#1d4ed8' },
  { key: 'mql',           label: 'MQL',           color: '#4338ca' },
  { key: 'sql',           label: 'SQL',           color: '#7c3aed' },
  { key: 'customer',      label: 'Customer',      color: '#15803d' },
  { key: 'former_client', label: 'Former Client', color: '#6b7280' },
];

const LEAD_SCORE_STYLES: Record<string, { bg: string; color: string }> = {
  hot:    { bg: '#fee2e2', color: '#b91c1c' },
  medium: { bg: '#fef9c3', color: '#92400e' },
  cold:   { bg: '#dbeafe', color: '#1d4ed8' },
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', sms: '💬', sms_sent: '💬', sms_received: '📩',
  email: '📧', email_sent: '📧', note: '📝',
  stage_change: '🔄', meeting: '📅', contact_created: '✨',
  form_submit: '📋', voicemail: '📳',
};

function StageBadge({ stage }: { stage: string }) {
  const s = B2C_STAGES.find(x => x.key === stage) ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44` }}>
      {s.label}
    </span>
  );
}

interface User { id: string; name: string; role?: string; }

interface Props {
  contact: any;
  activities: any[];
  allActivities: any[];
  tasks: any[];
  deal: any | null;
  meetings: any[];
  users: User[];
  ownerMap: Record<string, string>;
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
  crmNotes?: any[];
}

export default function ContactDetailClient({
  contact, activities: initActivities, allActivities, tasks: initTasks, deal: initDeal,
  meetings, users, ownerMap, orgSlug, crmUrl, crmKey, crmNotes = [],
}: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);

  const [deal, setDeal] = useState(initDeal);
  const [activities, setActivities] = useState(initActivities);
  const [tasks, setTasks] = useState(initTasks);

  // Editable contact fields
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({
    first_name: contact.first_name ?? '',
    last_name: contact.last_name ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
  });
  const [savingContact, setSavingContact] = useState(false);
  const [contactData, setContactData] = useState(contact);

  // Owner editing
  const [savingOwner, setSavingOwner] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(contactData.owner_id ?? null);

  // Lifecycle editing
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [lifecycle, setLifecycle] = useState<string | null>(contactData.lifecycle_stage ?? null);

  // Notes
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Tasks
  const [newTask, setNewTask] = useState({ title: '', due_date: '' });
  const [addingTask, setAddingTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  // Deal stage
  const [movingStage, setMovingStage] = useState(false);

  // Add to Pipeline modal
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({ title: '', stage: 'qualified', value: '', deal_type: 'custom_design' });
  const [savingDeal, setSavingDeal] = useState(false);

  // Quick task from contact
  const [showQuickTask, setShowQuickTask] = useState(false);

  // Lead source editing
  const LEAD_SOURCES = ['facebook_lead_ad','referral','cost_calc','shopify_cost_calc','guide_download','empower_website','barnhaus_contact','barnhaus_store_contact','shopify_order','calendar_booking','shopify_calendar_booking','direct_phone_call','floor_plan_archive','design_concierge','trade_show','other'];
  const [editLeadSource, setEditLeadSource] = useState(false);
  const [leadSource, setLeadSource] = useState(contactData.lead_source ?? '');

  // Sections toggle
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [trestleOpen, setTrestleOpen] = useState(false);
  const [attomOpen, setAttomOpen] = useState(false);
  const [meetingsOpen, setMeetingsOpen] = useState(true);

  const fullName = `${contactData.first_name} ${contactData.last_name}`;
  const leadScore = contactData.lead_score?.toLowerCase();
  const leadStyle = leadScore ? (LEAD_SCORE_STYLES[leadScore] ?? null) : null;
  const lifecycleOpt = LIFECYCLE_OPTIONS.find(x => x.key === lifecycle);

  const currentStageIdx = deal ? B2C_STAGES.findIndex(s => s.key === deal.stage) : -1;
  const prevStage = currentStageIdx > 0 ? B2C_STAGES[currentStageIdx - 1] : null;
  const nextStage = currentStageIdx >= 0 && currentStageIdx < B2C_STAGES.length - 1 ? B2C_STAGES[currentStageIdx + 1] : null;

  // Attribution: first touch + last touch
  const firstActivity = allActivities[allActivities.length - 1] ?? null;
  const lastActivity = allActivities[0] ?? null;
  const daysSinceCreated = contactData.created_at
    ? Math.floor((Date.now() - new Date(contactData.created_at).getTime()) / 86400000)
    : null;

  async function moveStage(newStage: string) {
    if (!deal || movingStage) return;
    setMovingStage(true);
    const { data } = await crm.from('deals').update({ stage: newStage }).eq('id', deal.id).select().single();
    if (data) setDeal(data);
    setMovingStage(false);
  }

  async function saveLeadSource(src: string) {
    setLeadSource(src);
    setEditLeadSource(false);
    await crm.from('contacts').update({ lead_source: src || null }).eq('id', contactData.id);
    setContactData((prev: any) => ({ ...prev, lead_source: src || null }));
  }

  async function addToPipeline() {
    if (!newDeal.title.trim() || savingDeal) return;
    setSavingDeal(true);
    const val = parseFloat(newDeal.value) || null;
    const { data } = await crm.from('deals').insert({
      contact_id: contactData.id,
      title: newDeal.title.trim(),
      stage: newDeal.stage,
      value: val,
      deal_type: newDeal.deal_type || null,
      sales_type: 'b2c',
      created_at: new Date().toISOString(),
    }).select().single();
    setSavingDeal(false);
    if (data) { setDeal(data); setShowAddDeal(false); }
  }

  async function saveContactEdits() {
    if (savingContact) return;
    setSavingContact(true);
    const { data } = await crm.from('contacts').update({
      first_name: editFields.first_name.trim(),
      last_name: editFields.last_name.trim(),
      phone: editFields.phone.trim() || null,
      email: editFields.email.trim() || null,
    }).eq('id', contactData.id).select().single();
    setSavingContact(false);
    if (data) { setContactData((prev: any) => ({ ...prev, ...data })); setEditMode(false); }
  }

  async function changeOwner(newOwnerId: string) {
    setSavingOwner(true);
    setOwnerId(newOwnerId);
    await crm.from('contacts').update({ owner_id: newOwnerId || null }).eq('id', contactData.id);
    setSavingOwner(false);
  }

  async function changeLifecycle(newStage: string) {
    setSavingLifecycle(true);
    setLifecycle(newStage);
    await crm.from('contacts').update({ lifecycle_stage: newStage || null }).eq('id', contactData.id);
    setSavingLifecycle(false);
  }

  async function submitNote() {
    if (!noteText.trim() || savingNote) return;
    setSavingNote(true);
    const { data } = await crm.from('activities').insert({
      contact_id: contactData.id,
      activity_type: 'note',
      title: noteText.trim(),
      created_at: new Date().toISOString(),
    }).select().single();
    setSavingNote(false);
    if (data) { setActivities(prev => [data, ...prev]); setNoteText(''); setAddingNote(false); }
  }

  async function toggleTask(task: any) {
    await crm.from('tasks').update({ completed: true, status: 'completed' }).eq('id', task.id);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  }

  async function addTask() {
    if (!newTask.title.trim() || savingTask) return;
    setSavingTask(true);
    const { data } = await crm.from('tasks').insert({
      contact_id: contactData.id,
      title: newTask.title.trim(),
      due_date: newTask.due_date || null,
      completed: false,
      status: 'open',
    }).select().single();
    setSavingTask(false);
    if (data) { setTasks(prev => [...prev, data]); setNewTask({ title: '', due_date: '' }); setAddingTask(false); }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '8px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
  };

  const sectionHeader = (label: string, action?: React.ReactNode): React.ReactNode => (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{label}</span>
      {action}
    </div>
  );

  const selectStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '6px 10px',
    fontSize: 13, cursor: 'pointer',
  };

  // Separate notes from other activities
  // Merge activity-based notes + notes table — sort by created_at desc, dedupe by id
  const activityNotes = activities.filter(a => a.activity_type === 'note');
  const normalizedCrmNotes = crmNotes.map((n: any) => ({
    id: n.id,
    activity_type: 'note',
    title: n.content,
    description: null,
    user_id: n.created_by,
    created_at: n.created_at,
    _source: 'notes_table',
  }));
  const allNoteIds = new Set(activityNotes.map((n: any) => n.id));
  const mergedNotes = [
    ...activityNotes,
    ...normalizedCrmNotes.filter((n: any) => !allNoteIds.has(n.id)),
  ].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  const notes = mergedNotes;
  const otherActivities = activities.filter(a => a.activity_type !== 'note');

  return (
    <>
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' }}>

      {/* ── Header card ── */}
      <div style={sectionStyle}>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            {editMode ? (
              <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                <input value={editFields.first_name} onChange={e => setEditFields(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First name" style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 120 }} />
                <input value={editFields.last_name} onChange={e => setEditFields(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last name" style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 120 }} />
              </div>
            ) : (
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fullName}</h1>
                {contactData.companies?.name && (
                  <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2, opacity: 0.85 }}>{contactData.companies.name}</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {editMode ? (
                <>
                  <button onClick={() => setEditMode(false)} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                  <button onClick={saveContactEdits} disabled={savingContact} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: savingContact ? 0.6 : 1 }}>
                    {savingContact ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowAddDeal(true)}
                    style={{ padding: '6px 12px', background: '#166534', border: '1px solid #22c55e55', borderRadius: 6, color: '#4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    + Pipeline
                  </button>
                  <button onClick={() => setShowQuickTask(true)}
                    style={{ padding: '6px 12px', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                    + Task
                  </button>
                  <button onClick={() => { setEditMode(true); setEditFields({ first_name: contactData.first_name ?? '', last_name: contactData.last_name ?? '', phone: contactData.phone ?? '', email: contactData.email ?? '' }); }}
                    style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                    ✏️ Edit
                  </button>
                  <button onClick={() => router.push(`/${orgSlug}/crm/contacts`)}
                    style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                    ← Back
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Phone / email — editable or display */}
          {editMode ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={editFields.phone} onChange={e => setEditFields(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone" style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 160 }} />
              <input value={editFields.email} onChange={e => setEditFields(f => ({ ...f, email: e.target.value }))}
                placeholder="Email" style={{ ...inputStyle, width: 'auto', flex: 2, minWidth: 200 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              {contactData.phone && <a href={`tel:${contactData.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>📞 {contactData.phone}</a>}
              {contactData.email && <a href={`mailto:${contactData.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>✉️ {contactData.email}</a>}
            </div>
          )}

          {/* Badges + owner + lifecycle row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {leadStyle && (
              <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: leadStyle.bg, color: leadStyle.color }}>
                {contactData.lead_score}
              </span>
            )}
            {contactData.whale_tier && ['WHALE','SOLID','WARM'].includes(contactData.whale_tier) && (
              <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}>
                🐋 {contactData.whale_tier}{contactData.whale_score != null ? ` ${contactData.whale_score}` : ''}
              </span>
            )}
            {editLeadSource ? (
              <select value={leadSource} onChange={e => saveLeadSource(e.target.value)} autoFocus onBlur={() => setEditLeadSource(false)}
                style={{ fontSize: 12, background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', padding: '2px 6px', cursor: 'pointer' }}>
                <option value="">— None —</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
              </select>
            ) : (
              <span onClick={() => setEditLeadSource(true)}
                style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}
                title="Click to edit lead source">
                {leadSource ? leadSource.replace(/_/g, ' ') : '+ lead source'}
              </span>
            )}
          </div>

          {/* Owner + Lifecycle selects */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Owner:</span>
              <select
                value={ownerId ?? ''}
                onChange={e => changeOwner(e.target.value)}
                disabled={savingOwner}
                style={{ ...selectStyle, opacity: savingOwner ? 0.6 : 1 }}
              >
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Lifecycle:</span>
              <select
                value={lifecycle ?? ''}
                onChange={e => changeLifecycle(e.target.value)}
                disabled={savingLifecycle}
                style={{
                  ...selectStyle,
                  opacity: savingLifecycle ? 0.6 : 1,
                  color: lifecycleOpt?.color ?? 'var(--text)',
                  fontWeight: 600,
                }}
              >
                <option value="">— None —</option>
                {LIFECYCLE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Added {new Date(contactData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            {daysSinceCreated != null && ` · ${daysSinceCreated}d ago`}
          </div>
        </div>
      </div>

      {/* ── Enrichment ── */}
      <div style={sectionStyle}>
        <button onClick={() => setEnrichOpen(v => !v)}
          style={{ padding: '10px 14px', borderBottom: enrichOpen ? '1px solid var(--border)' : 'none', fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}>
          <span>Enrichment Data</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{enrichOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {enrichOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Trestle */}
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setTrestleOpen(v => !v)}
                style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' } as React.CSSProperties}>
                <span>📞 Trestle Phone Intelligence</span>
                <span>{trestleOpen ? '▲' : '▼'}</span>
              </button>
              {trestleOpen && (
                <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {[
                    ['Owner', contactData.trestle_owner_name],
                    ['Age Range', contactData.trestle_owner_age_range],
                    ['Line Type', contactData.trestle_line_type],
                    ['Carrier', contactData.trestle_carrier],
                    ['Prepaid', contactData.trestle_is_prepaid != null ? (contactData.trestle_is_prepaid ? '⚠️ Yes' : 'No') : null],
                    ['Address', [contactData.trestle_address, contactData.trestle_city, contactData.trestle_state, contactData.trestle_zip].filter(Boolean).join(', ') || null],
                    ['Emails', Array.isArray(contactData.trestle_emails) ? contactData.trestle_emails.join(', ') : contactData.trestle_emails],
                  ].map(([label, val]) => val ? (
                    <div key={String(label)}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 1 }}>{String(val)}</div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>

            {/* ATTOM */}
            <div>
              <button onClick={() => setAttomOpen(v => !v)}
                style={{ padding: '8px 14px', fontWeight: 600, fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' } as React.CSSProperties}>
                <span>🏡 ATTOM Property Data</span>
                <span>{attomOpen ? '▲' : '▼'}</span>
              </button>
              {attomOpen && (
                <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {[
                    ['AVM Value', contactData.attom_avm_value ? `$${Number(contactData.attom_avm_value).toLocaleString()}` : null],
                    ['AVM Range', (contactData.attom_avm_low && contactData.attom_avm_high) ? `$${Number(contactData.attom_avm_low).toLocaleString()} – $${Number(contactData.attom_avm_high).toLocaleString()}` : null],
                    ['AVM Score', contactData.attom_avm_score ? `${contactData.attom_avm_score}/100` : null],
                    ['Size', contactData.attom_sqft ? `${Number(contactData.attom_sqft).toLocaleString()} sqft` : null],
                    ['Beds / Baths', (contactData.attom_beds || contactData.attom_baths) ? `${contactData.attom_beds ?? '?'}bd / ${contactData.attom_baths ?? '?'}ba` : null],
                    ['Lot Acres', contactData.attom_lot_acres != null ? `${Number(contactData.attom_lot_acres).toFixed(2)} ac` : null],
                    ['Year Built', contactData.attom_year_built],
                    ['Last Sale', contactData.attom_last_sale_price ? `$${Number(contactData.attom_last_sale_price).toLocaleString()}` : null],
                  ].map(([label, val]) => val ? (
                    <div key={String(label)}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 1 }}>{String(val)}</div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Attribution ── */}
      {(firstActivity || lastActivity) && (
        <div style={sectionStyle}>
          {sectionHeader('Attribution')}
          <div style={{ padding: '10px 14px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            {firstActivity && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>FIRST TOUCH</div>
                <div style={{ color: 'var(--text)' }}>{firstActivity.activity_type?.replace(/_/g, ' ') ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(firstActivity.created_at).toLocaleDateString()}</div>
              </div>
            )}
            {lastActivity && lastActivity.id !== firstActivity?.id && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>LAST TOUCH</div>
                <div style={{ color: 'var(--text)' }}>{lastActivity.activity_type?.replace(/_/g, ' ') ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(lastActivity.created_at).toLocaleDateString()}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>TOTAL TOUCHES</div>
              <div style={{ color: 'var(--text)' }}>{allActivities.length}</div>
            </div>
            {contactData.last_contacted_at && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>LAST CONTACTED</div>
                <div style={{ color: 'var(--text)' }}>
                  {new Date(contactData.last_contacted_at).toLocaleDateString()}
                  {contactData.last_contact_type && <span style={{ color: 'var(--muted)', marginLeft: 4 }}>via {contactData.last_contact_type.replace(/_/g, ' ')}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Deal ── */}
      <div style={sectionStyle}>
        {sectionHeader('Active Deal')}
        <div style={{ padding: 14 }}>
          {deal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <StageBadge stage={deal.stage} />
                {deal.deal_type && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{deal.deal_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>}
                {deal.value && <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>${Number(deal.value).toLocaleString()}</span>}
                {deal.expected_close_date && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Close: {new Date(deal.expected_close_date).toLocaleDateString()}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>MOVE:</span>
                {prevStage && (
                  <button onClick={() => moveStage(prevStage.key)} disabled={movingStage}
                    style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${prevStage.color}66`, borderRadius: 6, color: prevStage.color, cursor: 'pointer', fontSize: 12 }}>
                    ← {prevStage.label}
                  </button>
                )}
                <span style={{ padding: '5px 12px', background: `${B2C_STAGES[currentStageIdx]?.color ?? '#6b7280'}18`, border: `1px solid ${B2C_STAGES[currentStageIdx]?.color ?? '#6b7280'}44`, borderRadius: 6, color: B2C_STAGES[currentStageIdx]?.color ?? '#6b7280', fontSize: 12, fontWeight: 600 }}>
                  ● {B2C_STAGES[currentStageIdx]?.label ?? deal.stage}
                </span>
                {nextStage && (
                  <button onClick={() => moveStage(nextStage.key)} disabled={movingStage}
                    style={{ padding: '5px 12px', background: 'var(--sidebar-bg)', border: `1px solid ${nextStage.color}66`, borderRadius: 6, color: nextStage.color, cursor: 'pointer', fontSize: 12 }}>
                    {nextStage.label} →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No active deal.</div>
          )}
        </div>
      </div>

      {/* ── Meetings ── */}
      {meetings.length > 0 && (
        <div style={sectionStyle}>
          <button onClick={() => setMeetingsOpen(v => !v)}
            style={{ padding: '10px 14px', borderBottom: meetingsOpen ? '1px solid var(--border)' : 'none', fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}>
            <span>Meetings ({meetings.length})</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{meetingsOpen ? '▲' : '▼'}</span>
          </button>
          {meetingsOpen && meetings.map((m: any, i: number) => (
            <div key={m.id} style={{ padding: '10px 14px', borderBottom: i < meetings.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.title ?? 'Meeting'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                  {m.status && <span style={{ marginLeft: 8, fontWeight: 600, color: m.status === 'completed' ? '#22c55e' : m.status === 'cancelled' ? '#ef4444' : '#f59e0b', textTransform: 'capitalize' }}>{m.status}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Notes ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Notes (${notes.length})`,
          <button onClick={() => setAddingNote(v => !v)}
            style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Add Note
          </button>
        )}
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
        {notes.length === 0 && !addingNote ? (
          <div style={{ padding: '14px', color: 'var(--muted)', fontSize: 13 }}>No notes yet.</div>
        ) : notes.map((a, i) => (
          <div key={a.id} style={{ padding: '12px 14px', borderBottom: i < notes.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.title}</div>
            {a.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', gap: 8 }}>
              <span>{new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              {a.user_id && ownerMap[a.user_id] && <span style={{ color: 'var(--accent)', opacity: 0.7 }}>— {ownerMap[a.user_id].split(' ')[0]}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity Feed ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Activity (${otherActivities.length})`)}
        {otherActivities.length === 0 ? (
          <div style={{ padding: '14px', color: 'var(--muted)', fontSize: 13 }}>No activity yet.</div>
        ) : otherActivities.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: i < otherActivities.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{ACTIVITY_ICONS[a.activity_type] ?? '📋'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{a.title}</div>
              {a.description && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.description}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                {new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tasks ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Open Tasks (${tasks.length})`,
          <button onClick={() => setAddingTask(v => !v)}
            style={{ padding: '4px 10px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Add Task
          </button>
        )}
        {addingTask && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={newTask.title} onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title *" style={inputStyle} autoFocus />
            <input type="date" value={newTask.due_date} onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingTask(false); setNewTask({ title: '', due_date: '' }); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={addTask} disabled={!newTask.title.trim() || savingTask}
                style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: !newTask.title.trim() || savingTask ? 0.5 : 1 }}>
                {savingTask ? 'Saving…' : 'Add Task'}
              </button>
            </div>
          </div>
        )}
        {tasks.length === 0 ? (
          <div style={{ padding: '14px', color: 'var(--muted)', fontSize: 13 }}>No open tasks.</div>
        ) : tasks.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <input type="checkbox" checked={false} onChange={() => toggleTask(t)}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                {t.due_date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Due {new Date(t.due_date).toLocaleDateString()}</span>}
                {t.priority && <span style={{ fontSize: 11, fontWeight: 600, color: t.priority === 'high' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#6b7280', textTransform: 'capitalize' }}>{t.priority}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>


    </div>
    <>
      {/* ── Add to Pipeline Modal ── */}
      {showAddDeal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAddDeal(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 380, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Add to Pipeline</div>
            <input placeholder="Deal title *" value={newDeal.title} onChange={e => setNewDeal(d => ({...d, title: e.target.value}))}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }} autoFocus />
            <select value={newDeal.stage} onChange={e => setNewDeal(d => ({...d, stage: e.target.value}))}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }}>
              {[['qualified','Qualified'],['concept','Concept'],['design','Design'],['engineering','Engineering']].map(([k,l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={newDeal.deal_type} onChange={e => setNewDeal(d => ({...d, deal_type: e.target.value}))}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }}>
              {[['custom_design','Custom Design'],['catalog_plan','Catalog Plan'],['modification','Modification'],['referral','Referral']].map(([k,l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input placeholder="Value ($)" value={newDeal.value} onChange={e => setNewDeal(d => ({...d, value: e.target.value}))} type="number"
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddDeal(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={addToPipeline} disabled={!newDeal.title.trim() || savingDeal}
                style={{ padding: '8px 16px', background: '#166534', border: '1px solid #22c55e55', borderRadius: 6, color: '#4ade80', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: !newDeal.title.trim() || savingDeal ? 0.5 : 1 }}>
                {savingDeal ? 'Creating…' : 'Add to Pipeline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Task from this contact (reuse addTask) ── */}
      {showQuickTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowQuickTask(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>New Task</div>
            <input placeholder="Task title *" value={newTask.title} onChange={e => setNewTask(f => ({...f, title: e.target.value}))}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }} autoFocus />
            <input type="date" value={newTask.due_date} onChange={e => setNewTask(f => ({...f, due_date: e.target.value}))}
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowQuickTask(false)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={async () => { await addTask(); setShowQuickTask(false); }} disabled={!newTask.title.trim() || savingTask}
                style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: !newTask.title.trim() || savingTask ? 0.5 : 1 }}>
                {savingTask ? 'Saving…' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    </>
  );
}
