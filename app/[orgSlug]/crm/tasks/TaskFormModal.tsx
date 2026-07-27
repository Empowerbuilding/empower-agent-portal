'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_TYPES = ['to_do', 'call', 'email', 'meeting', 'follow_up'];
const TASK_TYPE_LABELS: Record<string, string> = {
  to_do: 'To Do',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  follow_up: 'Follow Up',
};

export interface TaskFormModalProps {
  task?: any | null; // null/undefined = create mode
  contactId?: string | null; // pre-fill / lock contact
  dealId?: string | null; // pre-fill / lock deal
  contacts?: { id: string; first_name: string; last_name: string }[];
  deals?: { id: string; title: string }[];
  users: { id: string; name: string; email?: string }[];
  crmUrl: string;
  crmKey: string;
  onClose: () => void;
  onSaved: (task: any) => void;
  onDeleted?: (taskId: string) => void;
}

export default function TaskFormModal({
  task, contactId, dealId, contacts = [], deals = [], users, crmUrl, crmKey, onClose, onSaved, onDeleted,
}: TaskFormModalProps) {
  const crm = createClient(crmUrl, crmKey);
  const isEdit = !!task;

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'medium',
    task_type: task?.task_type ?? 'to_do',
    due_date: task?.due_date ?? '',
    due_time: task?.due_time ?? '',
    assigned_to: task?.assigned_to ?? '',
    contact_id: task?.contact_id ?? contactId ?? '',
    deal_id: task?.deal_id ?? dealId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError('');

    const title = form.title.trim();
    const description = form.description.trim() || null;
    let ai_summary: string | null = null;
    try {
      const res = await fetch('/api/generate-task-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      ai_summary = data.summary ?? null;
    } catch {
      // non-fatal — proceed without a summary
    }

    const payload: any = {
      title,
      description,
      priority: form.priority || null,
      task_type: form.task_type || null,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      assigned_to: form.assigned_to || null,
      contact_id: form.contact_id || null,
      deal_id: form.deal_id || null,
      ai_summary,
    };

    if (isEdit) {
      const { data, error: err } = await crm.from('tasks').update(payload).eq('id', task.id).select('*, contacts(first_name, last_name, email, phone), deals(title), companies(name)').single();
      setSaving(false);
      if (err) { setError(err.message); return; }
      if (data) onSaved(data);
    } else {
      const { data, error: err } = await crm.from('tasks').insert({
        ...payload,
        completed: false,
        status: 'open',
      }).select('*, contacts(first_name, last_name, email, phone), deals(title), companies(name)').single();
      setSaving(false);
      if (err) { setError(err.message); return; }
      if (data) onSaved(data);
    }
  }

  async function handleDelete() {
    if (!task || deleting) return;
    setDeleting(true);
    const { error: err } = await crm.from('tasks').delete().eq('id', task.id);
    setDeleting(false);
    if (err) { setError(err.message); return; }
    onDeleted?.(task.id);
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '9px 12px',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{isEdit ? 'Edit Task' : 'New Task'}</div>

        <div>
          <label style={labelStyle}>Title *</label>
          <input placeholder="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} autoFocus />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Type</label>
            <select value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_LABELS[t] ?? t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Due Date</label>
            <input type="date" value={form.due_date ?? ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Due Time</label>
            <input type="time" value={form.due_time ?? ''} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Assigned To</label>
          <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {!contactId && contacts.length > 0 && (
          <div>
            <label style={labelStyle}>Contact</label>
            <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No contact linked</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
        )}

        {!dealId && deals.length > 0 && (
          <div>
            <label style={labelStyle}>Deal</label>
            <select value={form.deal_id} onChange={e => setForm(f => ({ ...f, deal_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No deal linked</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            {isEdit && (
              confirmDelete ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Delete task?</span>
                  <button onClick={handleDelete} disabled={deleting}
                    style={{ padding: '6px 10px', background: '#ef4444', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                    {deleting ? 'Deleting…' : 'Yes'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ padding: '6px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  style={{ padding: '6px 12px', background: 'none', border: '1px solid #ef444455', borderRadius: 6, color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                  Delete
                </button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: !form.title.trim() || saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Task')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
