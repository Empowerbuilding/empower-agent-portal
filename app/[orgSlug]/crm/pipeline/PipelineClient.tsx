'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// ── Stage definitions matching original CRM ──────────────────────────────────
const B2C_STAGES = [
  { key: 'qualified',   label: 'Qualified',   color: '#4c8bf0' },
  { key: 'design',            label: 'Design',           color: '#6366f1' },
  { key: 'engineering',      label: 'Engineering',      color: '#8b5cf6' },
  { key: 'builder_referral', label: 'Builder Referral', color: '#f97316' },
  { key: 'complete',         label: 'Complete',         color: '#22c55e' },
  { key: 'lost',        label: 'Lost',        color: '#ef4444' },
];

const B2B_STAGES = [
  { key: 'qualified', label: 'Qualified', color: '#4c8bf0' },
  { key: 'proposal',  label: 'Proposal',  color: '#f59e0b' },
  { key: 'active',    label: 'Active',    color: '#10b981' },
  { key: 'complete',  label: 'Complete',  color: '#22c55e' },
  { key: 'lost',      label: 'Lost',      color: '#ef4444' },
];

interface Deal {
  id: string;
  title: string;
  stage: string;
  sales_type: string | null;
  value: number | null;
  deal_type: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  owner_id: string | null;
  expected_close_date: string | null;
  created_at: string;
}

interface Props {
  deals: Deal[];
  users: { id: string; name: string }[];
  orgSlug: string;
  crmUrl: string;
  crmKey: string;
}

export default function PipelineClient({ deals: initialDeals, users, orgSlug, crmUrl, crmKey }: Props) {
  const router = useRouter();
  const crm = createClient(crmUrl, crmKey);
  const [deals, setDeals] = useState(initialDeals);
  const [salesType, setSalesType] = useState<'b2c' | 'b2b'>('b2c');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const stages = salesType === 'b2c' ? B2C_STAGES : B2B_STAGES;

  // Filter by sales_type AND owner
  const filtered = deals.filter(d => {
    const matchType = !d.sales_type ? salesType === 'b2c' : d.sales_type === salesType;
    const matchOwner = !ownerFilter || d.owner_id === ownerFilter;
    return matchType && matchOwner;
  });

  const byStage = (stageKey: string) => filtered.filter(d => d.stage === stageKey);

  async function moveDeal(dealId: string, newStage: string) {
    setMoving(dealId);
    await crm.from('deals').update({ stage: newStage }).eq('id', dealId);
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
    setMoving(null);
  }

  function fmtValue(v: number | null) {
    if (!v) return null;
    return v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;
  }

  const totalValue = filtered
    .filter(d => d.stage !== 'complete' && d.stage !== 'lost')
    .reduce((s, d) => s + (d.value ?? 0), 0);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#fff' : 'var(--muted)',
    background: active ? 'var(--accent)' : 'none',
    border: 'none', cursor: 'pointer',
    borderRadius: active ? 6 : 0,
  });

  const selectStyle: React.CSSProperties = {
    background: 'var(--sidebar-bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '6px 10px', fontSize: 13, cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg, #0f1117)', padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        {/* B2C / B2B toggle */}
        <div style={{ display: 'flex', background: 'var(--sidebar-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          <button style={tabStyle(salesType === 'b2c')} onClick={() => setSalesType('b2c')}>🏠 Consumer</button>
          <button style={tabStyle(salesType === 'b2b')} onClick={() => setSalesType('b2b')}>🏗 Builder</button>
        </div>

        {users.length > 0 && (
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={selectStyle}>
            <option value="">All reps</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
          </select>
        )}

        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {filtered.length} deals{totalValue > 0 ? ` · $${totalValue.toLocaleString()} pipeline` : ''}
        </span>
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', padding: '12px 12px 0' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 'max-content', paddingBottom: 16 }}>
          {stages.map(stage => {
            const stageDeals = byStage(stage.key);
            const stageValue = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0);
            const isDragTarget = dragOver === stage.key;

            return (
              <div
                key={stage.key}
                onDragOver={e => { e.preventDefault(); setDragOver(stage.key); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={async e => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('deal_id');
                  if (id) await moveDeal(id, stage.key);
                  setDragOver(null);
                  setDragging(null);
                }}
                style={{
                  width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column',
                  background: isDragTarget ? `${stage.color}12` : 'var(--surface)',
                  border: `1px solid ${isDragTarget ? stage.color : 'var(--border)'}`,
                  borderRadius: 10, overflow: 'hidden',
                  transition: 'background 0.15s, border-color 0.15s',
                  maxHeight: 'calc(100vh - 165px)',
                }}
              >
                {/* Column header */}
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${stage.color}33`, background: `${stage.color}14`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: stage.color }}>{stage.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: stage.color, background: `${stage.color}22`, padding: '2px 7px', borderRadius: 10 }}>
                      {stageDeals.length}
                    </span>
                  </div>
                  {stageValue > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{fmtValue(stageValue)}</div>
                  )}
                </div>

                {/* Cards */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '6px' }}>
                  {stageDeals.length === 0 && (
                    <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      {isDragTarget ? 'Drop here' : 'Empty'}
                    </div>
                  )}
                  {stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('deal_id', deal.id); setDragging(deal.id); }}
                      onDragEnd={() => { setDragging(null); setDragOver(null); }}
                      onClick={() => router.push(`/${orgSlug}/crm/deals/${deal.id}`)}
                      style={{
                        background: 'var(--bg, #0f1117)',
                        border: '1px solid var(--border)',
                        borderRadius: 8, padding: '10px 10px', marginBottom: 6,
                        cursor: 'grab', opacity: dragging === deal.id ? 0.5 : 1,
                        transition: 'opacity 0.1s, border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = stage.color)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deal.contact_name || deal.title || 'Unnamed'}
                      </div>
                      {deal.title && deal.contact_name && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.title}</div>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {deal.value && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{fmtValue(deal.value)}</span>
                        )}
                        {deal.deal_type && (
                          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--sidebar-bg)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>
                            {deal.deal_type.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      {deal.expected_close_date && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                          Close {new Date(deal.expected_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                      {moving === deal.id && (
                        <div style={{ fontSize: 11, color: stage.color, marginTop: 4 }}>Moving…</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
