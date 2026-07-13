'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
};

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function TasksClient({ tasks: initial, contacts, orgSlug, crmUrl, crmKey }: {
  tasks: any[]; contacts: { id: string; first_name: string; last_name: string }[];
  orgSlug: string; crmUrl: string; crmKey: string;
}) {
  const [tasks, setTasks] = useState(initial);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const crm = createClient(crmUrl, crmKey);
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, `${c.first_name} ${c.last_name}`]));

  async function toggleComplete(task: any) {
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    await crm.from('tasks').update({ status: newStatus, completed: newStatus === 'completed' }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed: newStatus === 'completed' } : t));
  }

  const filtered = filter === 'open'
    ? tasks.filter(t => t.status !== 'completed')
    : tasks;

  const overdue = filtered.filter(t => isOverdue(t.due_date) && t.status !== 'completed');
  const upcoming = filtered.filter(t => !isOverdue(t.due_date) || t.status === 'completed');

  function TaskRow({ task }: { task: any }) {
    const done = task.status === 'completed';
    const overdueFl = isOverdue(task.due_date) && !done;
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
        borderBottom: '1px solid var(--border)', opacity: done ? 0.5 : 1,
      }}>
        <input
          type="checkbox"
          checked={done}
          onChange={() => toggleComplete(task)}
          style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13, textDecoration: done ? 'line-through' : 'none' }}>{task.title}</div>
          {task.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{task.description}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            {task.contact_id && contactMap[task.contact_id] && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>👤 {contactMap[task.contact_id]}</span>
            )}
            {task.due_date && (
              <span style={{ fontSize: 11, color: overdueFl ? '#ef4444' : 'var(--muted)', fontWeight: overdueFl ? 600 : 400 }}>
                {overdueFl ? '⚠ ' : ''}Due {new Date(task.due_date).toLocaleDateString()}
              </span>
            )}
            {task.priority && (
              <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] ?? 'var(--muted)', fontWeight: 600, textTransform: 'capitalize' }}>
                {task.priority}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['open', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '7px 14px', background: filter === f ? 'var(--accent)' : 'var(--sidebar-bg)',
                border: 'none', color: filter === f ? '#fff' : 'var(--muted)',
                cursor: 'pointer', fontSize: 12, fontWeight: filter === f ? 600 : 400, textTransform: 'capitalize',
              }}
            >
              {f === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} tasks</div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {overdue.length > 0 && (
          <>
            <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Overdue ({overdue.length})
            </div>
            {overdue.map(t => <TaskRow key={t.id} task={t} />)}
          </>
        )}

        {upcoming.length > 0
          ? upcoming.map(t => <TaskRow key={t.id} task={t} />)
          : overdue.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              {filter === 'open' ? 'All caught up — no open tasks.' : 'No tasks yet.'}
            </div>
          )
        }
      </div>
    </div>
  );
}
