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

const STAGES = [
  { key: 'qualified',        label: 'Qualified',        color: '#4c8bf0' },
  { key: 'proposal',         label: 'Proposal',         color: '#f59e0b' },
  { key: 'design',           label: 'Design',           color: '#8b5cf6' },
  { key: 'engineering',      label: 'Engineering',      color: '#ec4899' },
  { key: 'builder_referral', label: 'Builder Referral', color: '#f97316' },
  { key: 'active',           label: 'Active',           color: '#10b981' },
  { key: 'complete',         label: 'Complete',         color: '#22c55e' },
  { key: 'lost',             label: 'Lost',             color: '#ef4444' },
];

const ACTIVITY_ICONS: Record<string, string> = {
  call: '📞', sms: '💬', sms_sent: '💬', email: '📧', note: '📝',
  stage_change: '🔄', meeting: '📅',
};

interface Props {
  deal: any;
  activities: any[];
  tasks?: any[];
  users: { id: string; name: string }[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

export default function DealDetailClient({ deal: initialDeal, activities: initActivities, tasks: initTasks = [], users, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);
  const [deal, setDeal] = useState(initialDeal);
  const [activities, setActivities] = useState(initActivities);
  const [tasks, setTasks] = useState(initTasks);
  const [editValue, setEditValue] = useState<string>(String(deal.value ?? ''));
  const [editingValue, setEditingValue] = useState(false);
  const [savingValue, setSavingValue] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Tasks
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '',
  });
  const [savingTask, setSavingTask] = useState(false);
  const [confirmCompleteTaskId, setConfirmCompleteTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<any | null>(null);

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
      deal_id: deal.id,
      contact_id: deal.contact?.id ?? null,
      title,
      due_date: newTask.due_date || null,
      due_time: newTask.due_time || null,
      priority: newTask.priority || null,
      task_type: newTask.task_type || null,
      assigned_to: newTask.assigned_to || null,
      completed: false,
      status: 'open',
      ai_summary,
    }).select().single();
    setSavingTask(false);
    if (data) {
      setTasks(prev => [...prev, data]);
      setNewTask({ title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '' });
      setAddingTask(false);
    }
  }

  function requestCompleteTask(taskId: string) {
    setConfirmCompleteTaskId(taskId);
  }

  async function confirmCompleteTask(task: any) {
    setConfirmCompleteTaskId(null);
    const { data } = await crm.from('tasks').update({ completed: true, status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id).select().single();
    if (data) setTasks(prev => prev.map(t => t.id === task.id ? data : t));
  }

  function handleTaskSaved(task: any) {
    setTasks(prev => {
      const exists = prev.some(t => t.id === task.id);
      return exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task];
    });
    setEditingTask(null);
  }

  function handleTaskDeleted(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setEditingTask(null);
  }

  const userMap: Record<string, string> = Object.fromEntries(users.map(u => [u.id, u.name]));

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '8px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
  };

  // Ensures action buttons (+ Task, + Add Note, ← Back, stage moves, etc.) meet
  // the 40px minimum touch-target height on mobile while staying compact on desktop.
  const actionBtnStyle = (base: React.CSSProperties): React.CSSProperties => ({
    ...base,
    minHeight: 40,
    padding: '8px 14px',
    display: 'inline-flex',
    alignItems: 'center',
  });

  return (
    <>
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
              style={actionBtnStyle({ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, flexShrink: 0 })}>
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
                style={actionBtnStyle({ background: 'var(--sidebar-bg)', border: `1px solid ${prevStage.color}66`, borderRadius: 6, color: prevStage.color, cursor: 'pointer', fontSize: 12 })}>
                ← {prevStage.label}
              </button>
            )}
            {curStage && (
              <span style={{ padding: '5px 14px', background: `${curStage.color}18`, border: `1px solid ${curStage.color}44`, borderRadius: 6, color: curStage.color, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', minHeight: 40 }}>
                ● {curStage.label}
              </span>
            )}
            {nextStage && (
              <button onClick={() => moveStage(nextStage.key)} disabled={movingStage}
                style={actionBtnStyle({ background: 'var(--sidebar-bg)', border: `1px solid ${nextStage.color}66`, borderRadius: 6, color: nextStage.color, cursor: 'pointer', fontSize: 12 })}>
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
                  style={{ ...inputStyle, width: 150, minHeight: 40 }} autoFocus onKeyDown={e => e.key === 'Enter' && saveValue()} />
                <button onClick={saveValue} disabled={savingValue}
                  style={actionBtnStyle({ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: savingValue ? 0.6 : 1 })}>
                  {savingValue ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingValue(false)} style={actionBtnStyle({ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' })}>✕</button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                  {deal.value != null ? `$${Number(deal.value).toLocaleString()}` : '—'}
                </span>
                <button onClick={() => { setEditingValue(true); setEditValue(String(deal.value ?? '')); }}
                  style={actionBtnStyle({ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', fontSize: 11, cursor: 'pointer' })}>
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
            style={actionBtnStyle({ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' })}>
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

      {/* Tasks */}
      <div style={sectionStyle}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Tasks ({tasks.filter(t => !t.completed).length})</span>
          <button onClick={() => setAddingTask(v => !v)}
            style={actionBtnStyle({ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' })}>
            + Add Task
          </button>
        </div>

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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddingTask(false); setNewTask({ title: '', due_date: '', due_time: '', priority: 'medium', task_type: 'to_do', assigned_to: '' }); }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={addTask} disabled={!newTask.title.trim() || savingTask}
                style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: !newTask.title.trim() || savingTask ? 0.5 : 1 }}>
                {savingTask ? 'Saving…' : 'Add Task'}
              </button>
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div style={{ padding: '14px', color: 'var(--muted)', fontSize: 13 }}>No tasks yet.</div>
        ) : tasks.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none', opacity: t.completed ? 0.5 : 1 }}>
            <span style={{ position: 'relative', marginTop: 2, flexShrink: 0 }}>
              <input type="checkbox" checked={!!t.completed}
                onChange={() => { if (!t.completed) requestCompleteTask(t.id); }}
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
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                {t.due_date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Due {new Date(t.due_date).toLocaleDateString()}{t.due_time ? ` ${t.due_time.slice(0,5)}` : ''}</span>}
                {t.priority && <span style={{ fontSize: 11, fontWeight: 600, color: t.priority === 'high' || t.priority === 'urgent' ? '#ef4444' : t.priority === 'medium' ? '#f59e0b' : '#6b7280', textTransform: 'capitalize' }}>{t.priority}</span>}
                {t.assigned_to && userMap[t.assigned_to] && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{userMap[t.assigned_to].split(' ')[0]}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>

    {/* Edit Task modal */}
    {editingTask && (
      <TaskFormModal
        task={editingTask}
        dealId={deal.id}
        users={users}
        crmUrl={crmUrl}
        crmKey={crmKey}
        onClose={() => setEditingTask(null)}
        onSaved={handleTaskSaved}
        onDeleted={handleTaskDeleted}
      />
    )}
    </>
  );
}
