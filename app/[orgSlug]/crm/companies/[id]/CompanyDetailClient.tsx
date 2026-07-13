'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new_lead:       { label: 'New Lead',       color: '#6b7280' },
  qualified:      { label: 'Qualified',      color: 'var(--accent)' },
  demo_scheduled: { label: 'Demo Scheduled', color: '#8b5cf6' },
  proposal_sent:  { label: 'Proposal Sent',  color: '#f59e0b' },
  negotiation:    { label: 'Negotiation',    color: '#f97316' },
  closed_won:     { label: 'Closed Won',     color: '#22c55e' },
  closed_lost:    { label: 'Closed Lost',    color: '#ef4444' },
};

function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_LABELS[stage] ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CompanyDetailClient({
  company: initial, contacts, deals, activities, notes: initialNotes,
  orgSlug, crmUrl, crmKey,
}: {
  company: any; contacts: any[]; deals: any[]; activities: any[]; notes: any[];
  orgSlug: string; crmUrl: string; crmKey: string;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(initial);
  const [activeTab, setActiveTab] = useState<'contacts' | 'deals'>('contacts');
  const [notes, setNotes] = useState(initialNotes);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const crm = createClient(crmUrl, crmKey);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { data } = await crm.from('notes').insert({
      company_id: company.id,
      content: noteText.trim(),
    }).select().single();
    if (data) setNotes(prev => [data, ...prev]);
    setNoteText('');
    setSavingNote(false);
  }

  const infoStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text)', margin: 0 };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>

      {/* Left: Company info */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
        padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto',
      }}>
        <button
          onClick={() => router.push(`/${orgSlug}/crm`)}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Companies
        </button>

        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>{company.name}</div>
          {company.industry && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{company.industry}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {company.phone && (
            <div>
              <div style={labelStyle}>Phone</div>
              <div style={infoStyle}>{company.phone}</div>
            </div>
          )}
          {company.website && (
            <div>
              <div style={labelStyle}>Website</div>
              <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ ...infoStyle, color: 'var(--accent)' }}>{company.website.replace(/^https?:\/\//, '')}</a>
            </div>
          )}
          {(company.city || company.state) && (
            <div>
              <div style={labelStyle}>Location</div>
              <div style={infoStyle}>{[company.city, company.state].filter(Boolean).join(', ')}</div>
            </div>
          )}
          {company.employees_count && (
            <div>
              <div style={labelStyle}>Employees</div>
              <div style={infoStyle}>{company.employees_count.toLocaleString()}</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Quick Note</div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            style={{
              width: '100%', background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', padding: '8px', fontSize: 12,
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={addNote}
            disabled={!noteText.trim() || savingNote}
            style={{
              marginTop: 6, width: '100%', padding: '7px', background: 'var(--accent)',
              border: 'none', borderRadius: 6, color: '#fff', fontWeight: 600,
              cursor: 'pointer', fontSize: 12, opacity: !noteText.trim() || savingNote ? 0.5 : 1,
            }}
          >
            {savingNote ? 'Saving…' : 'Add Note'}
          </button>
        </div>

        {notes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={labelStyle}>Notes</div>
            {notes.slice(0, 5).map(n => (
              <div key={n.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px', fontSize: 12, color: 'var(--text)', border: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 4 }}>{n.content}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(n.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Middle: Contacts / Deals tabs */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['contacts', 'deals'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 16px', background: 'none', border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                textTransform: 'capitalize', marginBottom: -1,
              }}
            >
              {tab} ({tab === 'contacts' ? contacts.length : deals.length})
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {activeTab === 'contacts' && (
            contacts.length === 0
              ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No contacts yet.</div>
              : contacts.map(c => (
                <div key={c.id} style={{
                  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  marginBottom: 6, background: 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>
                    {c.first_name} {c.last_name}
                  </div>
                  {c.title && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.title}</div>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {c.email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.email}</span>}
                    {c.phone && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.phone}</span>}
                  </div>
                </div>
              ))
          )}

          {activeTab === 'deals' && (
            deals.length === 0
              ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No deals yet.</div>
              : deals.map(d => (
                <div key={d.id} style={{
                  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  marginBottom: 6, background: 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text)', fontSize: 13 }}>{d.title}</span>
                    <StageBadge stage={d.stage} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                    {d.value && <span>${Number(d.value).toLocaleString()}</span>}
                    {d.seats && <span>{d.seats} seats</span>}
                    {d.training_type && <span>{d.training_type}</span>}
                    {d.training_date && <span>Training: {new Date(d.training_date).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Right: Activity feed */}
      <div style={{
        width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Activity
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {activities.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>No activity yet.</div>
            : activities.map(a => (
              <div key={a.id} style={{ padding: '8px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{a.title}</div>
                {a.description && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{a.description}</div>}
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
                  <span style={{ textTransform: 'capitalize' }}>{a.activity_type?.replace(/_/g, ' ')}</span> · {timeAgo(a.created_at)}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
