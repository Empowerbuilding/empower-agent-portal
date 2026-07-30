'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import TaskFormModal from '../../tasks/TaskFormModal';

const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'to_do', label: 'To Do' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow Up' },
];

const B2C_STAGES = [
  { key: 'qualified',        label: 'Qualified',        color: '#4c8bf0' },
  { key: 'proposal',         label: 'Proposal',         color: '#f59e0b' },
  { key: 'design',           label: 'Design',           color: '#8b5cf6' },
  { key: 'engineering',      label: 'Engineering',      color: '#ec4899' },
  { key: 'builder_referral', label: 'Builder Referral', color: '#f97316' },
  { key: 'active',           label: 'Active',           color: '#10b981' },
  { key: 'complete',         label: 'Complete',         color: '#22c55e' },
  { key: 'lost',             label: 'Lost',             color: '#ef4444' },
];

const LIFECYCLE_OPTIONS = [
  { key: 'subscriber',    label: 'Subscriber',    color: '#6b7280' },
  { key: 'lead',          label: 'Lead',          color: '#1d4ed8' },
  { key: 'mql',           label: 'MQL',           color: '#4338ca' },
  { key: 'sql',           label: 'SQL',           color: '#7c3aed' },
  { key: 'customer',      label: 'Customer',      color: '#15803d' },
  { key: 'former_client', label: 'Former Client', color: '#6b7280' },
  { key: 'dead',         label: 'Dead',         color: '#9ca3af' },
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
  completedTasks?: any[];
  deal: any | null;
  deals?: { id: string; title: string }[];
  allDeals?: any[];
  meetings: any[];
  users: User[];
  ownerMap: Record<string, string>;
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
  crmNotes?: any[];
}

export default function ContactDetailClient({
  contact, activities: initActivities, allActivities, tasks: initTasks, completedTasks: initCompletedTasks = [], deal: initDeal,
  deals = [], allDeals = [], meetings, users, ownerMap, orgSlug, crmUrl, crmKey, crmNotes = [],
}: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);

  const [deal, setDeal] = useState(initDeal);
  const [activities, setActivities] = useState(initActivities);
  const [tasks, setTasks] = useState(initTasks);
  const [completedTasks, setCompletedTasks] = useState(initCompletedTasks);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);

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
  const [newTask, setNewTask] = useState({
    title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '', deal_id: '',
  });
  const [addingTask, setAddingTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [confirmCompleteTaskId, setConfirmCompleteTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  // Deal stage
  const [movingStage, setMovingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [closeDate, setCloseDate] = useState('');

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
    // Intercept 'complete' — trigger requires actual_close_date + value
    if (newStage === 'complete') {
      setCloseDate(new Date().toISOString().split('T')[0]);
      setConfirmComplete(true);
      return;
    }
    setStageError(null);
    setMovingStage(true);
    const { data, error } = await crm.from('deals').update({ stage: newStage }).eq('id', deal.id).select().single();
    if (error) setStageError(error.message ?? 'Failed to update stage.');
    if (data) setDeal(data);
    setMovingStage(false);
  }

  async function confirmMoveComplete() {
    if (!deal || movingStage) return;
    setStageError(null);
    setMovingStage(true);
    const payload: any = {
      stage: 'complete',
      actual_close_date: closeDate || new Date().toISOString().split('T')[0],
    };
    // If deal has no value, we can't pass the trigger — surface a clear error
    if (!deal.value || deal.value <= 0) {
      setStageError('A revenue amount (value) is required to mark a deal as Won. Edit the deal to add one first.');
      setMovingStage(false);
      setConfirmComplete(false);
      return;
    }
    const { data, error } = await crm.from('deals').update(payload).eq('id', deal.id).select().single();
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('MISSING_CLOSE_DATE')) setStageError('A close date is required.');
      else if (msg.includes('MISSING_REVENUE')) setStageError('A revenue amount is required. Edit the deal to add one first.');
      else setStageError(msg || 'Failed to mark as complete.');
    } else if (data) {
      setDeal(data);
    }
    setMovingStage(false);
    setConfirmComplete(false);
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

  function requestCompleteTask(taskId: string) {
    setConfirmCompleteTaskId(taskId);
  }

  async function confirmCompleteTask(task: any) {
    setConfirmCompleteTaskId(null);
    const { data } = await crm.from('tasks').update({ completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id).select().single();
    setTasks(prev => prev.filter(t => t.id !== task.id));
    if (data) setCompletedTasks(prev => [data, ...prev]);
  }

  async function addTask() {
    if (!newTask.title.trim() || savingTask) return;
    setSavingTask(true);
    const title = newTask.title.trim();
    let ai_summary: string | null = null;
    try {
      const res = await fetch('/api/generate-task-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: null }),
      });
      const data = await res.json();
      ai_summary = data.summary ?? null;
    } catch {
      // non-fatal — proceed without a summary
    }
    const { data } = await crm.from('tasks').insert({
      contact_id: contactData.id,
      title,
      due_date: newTask.due_date || null,
      due_time: newTask.due_time || null,
      priority: newTask.priority || null,
      task_type: newTask.task_type || null,
      assigned_to: newTask.assigned_to || null,
      deal_id: newTask.deal_id || null,
      completed: false,
      status: 'open',
      ai_summary,
    }).select().single();
    setSavingTask(false);
    if (data) {
      setTasks(prev => [...prev, data]);
      setNewTask({ title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '', deal_id: '' });
      setAddingTask(false);
    }
  }

  function handleTaskSaved(task: any) {
    setTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      if (task.completed) {
        return prev.filter(t => t.id !== task.id);
      }
      return exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task];
    });
    setCompletedTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      if (!task.completed) return prev.filter(t => t.id !== task.id);
      return exists ? prev.map(t => t.id === task.id ? task : t) : [task, ...prev];
    });
    setEditingTask(null);
  }

  function handleTaskDeleted(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
    setEditingTask(null);
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

  // Ensures action buttons (+ Task, Edit, + Add Note, ← Back, etc.) meet the
  // 40px minimum touch-target height on mobile while keeping desktop compact.
  const actionBtnStyle = (base: React.CSSProperties): React.CSSProperties => ({
    ...base,
    minHeight: 40,
    padding: '8px 14px',
    display: 'inline-flex',
    alignItems: 'center',
  });

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
          <div className="contact-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
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
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                    style={actionBtnStyle({ background: '#166534', border: '1px solid #22c55e55', borderRadius: 6, color: '#4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 600 })}>
                    + Pipeline
                  </button>
                  <button onClick={() => setShowQuickTask(true)}
                    style={actionBtnStyle({ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 })}>
                    + Task
                  </button>
                  <button onClick={() => { setEditMode(true); setEditFields({ first_name: contactData.first_name ?? '', last_name: contactData.last_name ?? '', phone: contactData.phone ?? '', email: contactData.email ?? '' }); }}
                    style={actionBtnStyle({ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 })}>
                    ✏️ Edit
                  </button>
                  <button onClick={() => router.push(`/${orgSlug}/crm/contacts`)}
                    style={actionBtnStyle({ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 })}>
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

      {/* ── Deals ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Deals (${allDeals.length})`)}
        {allDeals.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--muted)', fontSize: 13 }}>No deals yet.</div>
        ) : allDeals.map((d: any, i: number) => {
          const isActive = d.stage !== 'complete' && d.stage !== 'lost';
          const isPrimary = deal && d.id === deal.id;
          const s = B2C_STAGES.find(x => x.key === d.stage) ?? { label: d.stage, color: '#6b7280' };
          const dStageIdx = B2C_STAGES.findIndex(x => x.key === d.stage);
          const dPrev = dStageIdx > 0 ? B2C_STAGES[dStageIdx - 1] : null;
          const dNext = dStageIdx >= 0 && dStageIdx < B2C_STAGES.length - 1 ? B2C_STAGES[dStageIdx + 1] : null;
          return (
            <div key={d.id} style={{ borderBottom: i < allDeals.length - 1 ? '1px solid var(--border)' : 'none', padding: '12px 14px', opacity: isActive ? 1 : 0.65 }}>
              {/* Title row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <a href={`/${orgSlug}/crm/deals/${d.id}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', flex: 1 }}>
                  {d.title || 'Untitled Deal'}
                </a>
                <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}44`, flexShrink: 0 }}>
                  {s.label}
                </span>
              </div>
              {/* Meta row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginBottom: isPrimary ? 10 : 0 }}>
                {d.value != null && <span style={{ fontWeight: 700, color: isActive ? '#22c55e' : 'var(--muted)' }}>${Number(d.value).toLocaleString()}</span>}
                {d.deal_type && <span>{d.deal_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>}
                {d.expected_close_date && !d.actual_close_date && <span>Close: {new Date(d.expected_close_date).toLocaleDateString()}</span>}
                {d.actual_close_date && <span>Closed: {new Date(d.actual_close_date).toLocaleDateString()}</span>}
              </div>
              {/* Stage move — primary active deal only */}
              {isPrimary && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>MOVE:</span>
                  {dPrev && (
                    <button onClick={() => moveStage(dPrev.key)} disabled={movingStage}
                      style={{ padding: '4px 10px', background: 'var(--sidebar-bg)', border: `1px solid ${dPrev.color}66`, borderRadius: 6, color: dPrev.color, cursor: 'pointer', fontSize: 11 }}>
                      ← {dPrev.label}
                    </button>
                  )}
                  {dNext && (
                    <button onClick={() => moveStage(dNext.key)} disabled={movingStage}
                      style={{ padding: '4px 10px', background: 'var(--sidebar-bg)', border: `1px solid ${dNext.color}66`, borderRadius: 6, color: dNext.color, cursor: 'pointer', fontSize: 11 }}>
                      {dNext.label} →
                    </button>
                  )}
                </div>
              )}
              {isPrimary && stageError && (
                <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, padding: '6px 10px', background: '#ef444415', border: '1px solid #ef444433', borderRadius: 5 }}>
                  ⚠️ {stageError}
                </div>
              )}
            </div>
          );
        })}
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

      {/* ── Tasks ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Open Tasks (${tasks.length})`,
          <button onClick={() => setAddingTask(v => !v)}
            style={actionBtnStyle({ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' })}>
            + Add Task
          </button>
        )}
        {addingTask && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={newTask.title} onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title *" style={inputStyle} autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={newTask.priority} onChange={e => setNewTask(f => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <select value={newTask.task_type} onChange={e => setNewTask(f => ({ ...f, task_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {TASK_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={newTask.due_date} onChange={e => setNewTask(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
              <input type="time" value={newTask.due_time} onChange={e => setNewTask(f => ({ ...f, due_time: e.target.value }))} style={inputStyle} />
            </div>
            <select value={newTask.assigned_to} onChange={e => setNewTask(f => ({ ...f, assigned_to: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {deals.length > 0 && (
              <select value={newTask.deal_id} onChange={e => setNewTask(f => ({ ...f, deal_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">No deal linked</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingTask(false); setNewTask({ title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '', deal_id: '' }); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
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
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none', position: 'relative' }}>
            <span style={{ position: 'relative', marginTop: 2, flexShrink: 0 }}>
              <input type="checkbox" checked={false} onChange={() => requestCompleteTask(t.id)}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
              {confirmCompleteTaskId === t.id && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: 10, display: 'flex', flexDirection: 'column', gap: 8, width: 160,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>Mark as complete?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => confirmCompleteTask(t)}
                      style={{ flex: 1, padding: '5px 8px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Yes
                    </button>
                    <button onClick={() => setConfirmCompleteTaskId(null)}
                      style={{ flex: 1, padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </span>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEditingTask(t)}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                {t.due_date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Due {new Date(t.due_date).toLocaleDateString()}{t.due_time ? ` ${t.due_time.slice(0,5)}` : ''}</span>}
                {t.priority && <span style={{ fontSize: 11, fontWeight: 600, color: t.priority === 'high' || t.priority === 'urgent' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#6b7280', textTransform: 'capitalize' }}>{t.priority}</span>}
                {t.assigned_to && ownerMap[t.assigned_to] && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ownerMap[t.assigned_to].split(' ')[0]}</span>}
              </div>
            </div>
          </div>
        ))}

        {/* Show completed toggle */}
        <button onClick={() => setShowCompletedTasks(v => !v)}
          style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', textAlign: 'left' } as React.CSSProperties}>
          {showCompletedTasks ? '▲ Hide' : '▼ Show'} {completedTasks.length} completed
        </button>
        {showCompletedTasks && completedTasks.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border)', opacity: 0.6, cursor: 'pointer' }}
            onClick={() => setEditingTask(t)}>
            <input type="checkbox" checked readOnly style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} onClick={e => e.stopPropagation()} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: 'line-through' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                {t.completed_at && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Completed {new Date(t.completed_at).toLocaleDateString()}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Notes ── */}
      <div style={sectionStyle}>
        {sectionHeader(`Notes (${notes.length})`,
          <button onClick={() => setAddingNote(v => !v)}
            style={actionBtnStyle({ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' })}>
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
              {[['qualified','Qualified'],['design','Design'],['engineering','Engineering'],['builder_referral','Builder Referral'],['complete','Complete']].map(([k,l]) => <option key={k} value={k}>{l}</option>)}
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

      {/* ── Quick Task from this contact (full form, pre-linked to contact) ── */}
      {showQuickTask && (
        <TaskFormModal
          contactId={contactData.id}
          deals={deals}
          users={users}
          crmUrl={crmUrl}
          crmKey={crmKey}
          onClose={() => setShowQuickTask(false)}
          onSaved={(task) => { handleTaskSaved(task); setShowQuickTask(false); }}
        />
      )}

      {/* ── Edit Task modal ── */}
      {editingTask && (
        <TaskFormModal
          task={editingTask}
          contactId={contactData.id}
          deals={deals}
          users={users}
          crmUrl={crmUrl}
          crmKey={crmKey}
          onClose={() => setEditingTask(null)}
          onSaved={handleTaskSaved}
          onDeleted={handleTaskDeleted}
        />
      )}

      {/* ── Mark Deal Complete confirmation ── */}
      {confirmComplete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmComplete(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 320, display: 'flex', flexDirection: 'column', gap: 14 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Mark Deal as Won 🎉</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Set the actual close date to complete the deal.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Close Date *</label>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' as const }}
              />
            </div>
            {stageError && (
              <div style={{ fontSize: 12, color: '#ef4444', padding: '6px 10px', background: '#ef444415', border: '1px solid #ef444433', borderRadius: 5 }}>
                ⚠️ {stageError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConfirmComplete(false); setStageError(null); }}
                style={{ padding: '8px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmMoveComplete} disabled={!closeDate || movingStage}
                style={{ padding: '8px 16px', background: '#22c55e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !closeDate || movingStage ? 0.5 : 1 }}>
                {movingStage ? 'Saving…' : 'Mark Won'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    </>
  );
}
