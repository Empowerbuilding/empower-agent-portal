'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#f59e0b',
  low:    '#6b7280',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  to_do:        'To Do',
  call:         'Call',
  email:        'Email',
  follow_up:    'Follow Up',
  meeting:      'Meeting',
  text:         'Text',
};

type StatusFilter = 'my' | 'all' | 'due_today' | 'overdue' | 'upcoming' | 'no_due_date' | 'completed';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'my',         label: 'My Tasks' },
  { value: 'all',        label: 'All Open' },
  { value: 'due_today',  label: 'Due Today' },
  { value: 'overdue',    label: 'Overdue' },
  { value: 'upcoming',   label: 'Upcoming' },
  { value: 'no_due_date',label: 'No Date' },
  { value: 'completed',  label: 'Completed' },
];

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isToday(ds: string) {
  const t = new Date(); 
  const d = parseLocalDate(ds);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isOverdue(ds: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  return parseLocalDate(ds) < t;
}
function isFuture(ds: string) {
  return !isToday(ds) && !isOverdue(ds);
}

function dueDateDisplay(task: any): { label: string; color: string } {
  if (!task.due_date) return { label: '—', color: 'var(--muted)' };
  if (task.completed || task.status === 'completed') {
    const d = parseLocalDate(task.due_date);
    return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), color: 'var(--muted)' };
  }
  if (isOverdue(task.due_date)) {
    const d = parseLocalDate(task.due_date);
    return { label: `⚠ ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, color: '#ef4444' };
  }
  if (isToday(task.due_date)) return { label: 'Today', color: '#f59e0b' };
  const d = parseLocalDate(task.due_date);
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), color: 'var(--muted)' };
}

function normContact(task: any): string | null {
  if (task.contacts) {
    const c = Array.isArray(task.contacts) ? task.contacts[0] : task.contacts;
    return c ? `${c.first_name} ${c.last_name}` : null;
  }
  return null;
}
function normDeal(task: any): string | null {
  if (task.deals) {
    const d = Array.isArray(task.deals) ? task.deals[0] : task.deals;
    return d?.title ?? null;
  }
  return null;
}

export default function TasksClient({ tasks: initial, contacts, users, orgSlug, crmUrl, crmKey, currentCrmUserId }: {
  tasks: any[];
  contacts: { id: string; first_name: string; last_name: string }[];
  users: { id: string; name: string; email: string }[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
  currentCrmUserId: string | null;
}) {
  const crm = createClient(crmUrl, crmKey);
  const [tasks, setTasks] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(currentCrmUserId ? 'my' : 'all');
  const [repFilter, setRepFilter] = useState<string>(''); // '' = all reps
  const [priorityFilter, setPriorityFilter] = useState('');

  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

  async function toggleComplete(task: any) {
    const done = task.status === 'completed';
    const newStatus = done ? 'open' : 'completed';
    await crm.from('tasks').update({ status: newStatus, completed: !done }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed: !done } : t));
  }

  // Apply filters
  const filtered = tasks.filter(t => {
    // Status filter
    const done = t.status === 'completed' || t.completed;
    if (statusFilter === 'my') {
      if (done) return false;
      if (currentCrmUserId && t.assigned_to !== currentCrmUserId) return false;
    } else if (statusFilter === 'all') {
      if (done) return false;
    } else if (statusFilter === 'completed') {
      if (!done) return false;
    } else if (statusFilter === 'overdue') {
      if (done || !t.due_date || !isOverdue(t.due_date)) return false;
    } else if (statusFilter === 'due_today') {
      if (done || !t.due_date || !isToday(t.due_date)) return false;
    } else if (statusFilter === 'upcoming') {
      if (done || !t.due_date || !isFuture(t.due_date)) return false;
    } else if (statusFilter === 'no_due_date') {
      if (done || t.due_date) return false;
    }

    // Rep filter (only shown if not in "my" mode)
    if (repFilter && t.assigned_to !== repFilter) return false;

    // Priority filter
    if (priorityFilter && t.priority !== priorityFilter) return false;

    return true;
  });

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'var(--sidebar-bg)',
    color: active ? '#fff' : 'var(--muted)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Status filter bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.filter(f => f.value !== 'my' || currentCrmUserId).map(f => (
          <button key={f.value} style={pillBtn(statusFilter === f.value)} onClick={() => setStatusFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Rep filter — only when not in "my tasks" mode */}
        {statusFilter !== 'my' && users.length > 0 && (
          <select
            value={repFilter}
            onChange={e => setRepFilter(e.target.value)}
            style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: repFilter ? 'var(--text)' : 'var(--muted)', padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            <option value="">All reps</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
          </select>
        )}

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 6, color: priorityFilter ? 'var(--text)' : 'var(--muted)', padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          <option value="">All priorities</option>
          {['urgent','high','medium','low'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
        </select>

        <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 160px 100px 80px 90px 110px',
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span></span>
          <span>Task</span>
          <span>Associated</span>
          <span>Due Date</span>
          <span>Priority</span>
          <span>Type</span>
          <span>Assigned To</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {statusFilter === 'my' ? 'No open tasks assigned to you.' : 'No tasks match this filter.'}
          </div>
        ) : (
          filtered.map((task, i) => {
            const done = task.status === 'completed' || task.completed;
            const due = dueDateDisplay(task);
            const contactName = normContact(task);
            const dealTitle = normDeal(task);

            return (
              <div
                key={task.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 160px 100px 80px 90px 110px',
                  padding: '10px 14px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: done ? 0.5 : 1,
                  alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Checkbox */}
                <span>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleComplete(task)}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                </span>

                {/* Task title + description */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </div>
                  {task.description && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.description}
                    </div>
                  )}
                </div>

                {/* Associated with */}
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contactName ?? dealTitle ?? '—'}
                </div>

                {/* Due date */}
                <div style={{ fontSize: 12, color: due.color, fontWeight: due.color === '#ef4444' ? 600 : 400 }}>
                  {due.label}
                </div>

                {/* Priority */}
                <div>
                  {task.priority ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      background: `${PRIORITY_COLORS[task.priority] ?? '#6b7280'}22`,
                      color: PRIORITY_COLORS[task.priority] ?? '#6b7280',
                    }}>
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </span>
                  ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                </div>

                {/* Type */}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {TASK_TYPE_LABELS[task.task_type] ?? task.task_type ?? '—'}
                </div>

                {/* Assigned to */}
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.assigned_to ? (userMap[task.assigned_to]?.split(' ')[0] ?? '—') : '—'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
