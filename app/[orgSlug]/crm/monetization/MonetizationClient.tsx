'use client';

import { useState, useMemo, useEffect } from 'react';

interface Funnel {
  totalConsumer: number
  sinceLaunch: number
  routingAnswered: number
  consented: { kit: number; lender: number; realtor: number; builder: number; sms: number }
  anyConsent: number
  delivered: number
  closed: number
  revenue: number
}

interface EligibleLead {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  lead_source: string | null
  project_type: string | null
  budget_range: string | null
  land_status: string | null
  financing_status: string | null
  timeline: string | null
  trestle_city: string | null
  trestle_state: string | null
  consent_kit: boolean | null
  consent_lender: boolean | null
  consent_realtor: boolean | null
  consent_builder: boolean | null
  consent_sms: boolean | null
  created_at: string
}

interface Partner {
  id: string
  vertical: string
  company_name: string
  location: string | null
  service_area: string | null
  contact_info: string | null
  notes: string | null
  cluster: string | null
  status: string
  agreement_type: string | null
  fee_terms: string | null
  referral_code: string | null
  signed_at: string | null
}

interface LedgerRow {
  id: string
  contact_name?: string | null
  buyer_name: string
  buyer_type: string
  sale_type: string
  price: number | null
  status: string
  sold_at: string | null
}

const VERTICALS: { key: string; label: string; defaultRate: number; defaultFee: number }[] = [
  { key: 'kit', label: 'Kit Suppliers', defaultRate: 25, defaultFee: 2500 },
  { key: 'lender', label: 'Lenders', defaultRate: 20, defaultFee: 1000 },
  { key: 'realtor', label: 'Land Realtors', defaultRate: 30, defaultFee: 1500 },
  { key: 'builder', label: 'Builders (GC)', defaultRate: 20, defaultFee: 2000 },
]

const PENDING_VERTICALS: { key: string; label: string; note: string }[] = [
  { key: 'well', label: 'Wells', note: 'capture pending — followup texts' },
  { key: 'septic', label: 'Septic', note: 'rides with sitework capture' },
  { key: 'sitework', label: 'Sitework', note: 'capture pending — followup texts' },
]

const BUDGET_LABELS: Record<string, string> = {
  under_150k: '<$150k',
  '150_300k': '$150-300k',
  '300_600k': '$300-600k',
  '600k_1m': '$600k-1m',
  '1m_plus': '$1m+',
  '1_3m': '$1-3m',
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  candidate: { bg: '#3a3d44', fg: '#949ba4' },
  pitched: { bg: '#4a3b1e', fg: '#e5b567' },
  signed: { bg: '#1e3a2b', fg: '#57c99b' },
  active: { bg: '#1e3a2b', fg: '#57c99b' },
  paused: { bg: '#1e2b4a', fg: '#7ba4f5' },
  passed: { bg: '#4a1e1e', fg: '#e57b7b' },
  pending: { bg: '#4a3b1e', fg: '#e5b567' },
  delivered: { bg: '#1e2b4a', fg: '#7ba4f5' },
  closed: { bg: '#1e3a2b', fg: '#57c99b' },
  paid: { bg: '#256d4a', fg: '#a7f3d0' },
  replaced: { bg: '#3a3d44', fg: '#949ba4' },
  refunded: { bg: '#4a1e1e', fg: '#e57b7b' },
}

function Chip({ label, status }: { label: string; status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.candidate
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>{label}</span>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
}

export default function MonetizationClient({
  funnel,
  eligibleUnsold,
  partners,
  ledger,
}: {
  funnel: Funnel
  eligibleUnsold: EligibleLead[]
  partners: Partner[]
  ledger: LedgerRow[]
}) {
  const [assumptions, setAssumptions] = useState<Record<string, { rate: number; fee: number }>>({})
  const [openVertical, setOpenVertical] = useState<string | null>('kit')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    try {
      const s = localStorage.getItem('monetization_assumptions')
      if (s) setAssumptions(JSON.parse(s))
    } catch {}
  }, [])
  useEffect(() => {
    if (Object.keys(assumptions).length > 0) {
      localStorage.setItem('monetization_assumptions', JSON.stringify(assumptions))
    }
  }, [assumptions])

  const daysSinceLaunch = useMemo(
    () => Math.max(1, Math.round((Date.now() - new Date('2026-10-08T00:00:00Z').getTime()) / 86400000)),
    []
  )

  const partnersByVertical = useMemo(() => {
    const map: Record<string, Partner[]> = {}
    for (const p of partners) (map[p.vertical] = map[p.vertical] ?? []).push(p)
    return map
  }, [partners])

  const eligible = eligibleUnsold
  const eligibleShown = showAll ? eligible : eligible.slice(0, 25)
  const inputStyle: React.CSSProperties = {
    width: 64, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', padding: '3px 6px', fontSize: 12, textAlign: 'right',
  }
  const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
  const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' }

  const funnelStats = [
    { label: 'Consumer Leads', value: funnel.totalConsumer.toLocaleString(), sub: `${funnel.sinceLaunch} since 10/8` },
    { label: 'Routing Answered', value: funnel.routingAnswered.toLocaleString(), sub: `${funnel.sinceLaunch ? Math.round((funnel.routingAnswered / funnel.sinceLaunch) * 100) : 0}% of new` },
    { label: 'Consented', value: funnel.anyConsent.toLocaleString(), sub: 'at least one vertical opt-in' },
    { label: 'Eligible Unsold', value: eligible.length.toLocaleString(), sub: 'awaiting partners' },
    { label: 'Delivered', value: funnel.delivered.toLocaleString(), sub: '' },
    { label: 'Closed', value: funnel.closed.toLocaleString(), sub: '' },
    { label: 'Revenue', value: `$${funnel.revenue.toLocaleString()}`, sub: '', accent: true },
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>Monetization</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>Owner-builder referral engine — capture → consent → match → deliver</p>

      {/* Funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 22 }}>
        {funnelStats.map((s) => (
          <div key={s.label} style={{ ...cardStyle, ...(s.accent ? { background: 'var(--accent-dim)', borderColor: 'var(--accent)' } : {}) }}>
            <div style={{ fontSize: 11, color: s.accent ? '#cfe0ff' : 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.accent ? '#fff' : 'var(--text)', marginTop: 2 }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 11, color: s.accent ? '#cfe0ff' : 'var(--muted)', marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Verticals & projections */}
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '0 0 8px' }}>VERTICALS & PROJECTIONS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 10 }}>
        {VERTICALS.map((v) => {
          const consented = funnel.consented[v.key as keyof typeof funnel.consented] ?? 0
          const a = assumptions[v.key] ?? { rate: v.defaultRate, fee: v.defaultFee }
          const pace = (consented / daysSinceLaunch) * 30
          const projMo = pace * (a.rate / 100) * a.fee
          const setA = (patch: Partial<{ rate: number; fee: number }>) =>
            setAssumptions((prev) => ({ ...prev, [v.key]: { ...a, ...patch } }))
          return (
            <div key={v.key} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v.label}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{consented}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>consented · ~{pace.toFixed(1)}/mo pace</div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  <span>Close rate %</span>
                  <input type="number" min={0} max={100} value={a.rate} onChange={(e) => setA({ rate: Number(e.target.value) })} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  <span>Avg fee $</span>
                  <input type="number" min={0} value={a.fee} onChange={(e) => setA({ fee: Number(e.target.value) })} style={inputStyle} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#57c99b' }}>≈ ${Math.round(projMo).toLocaleString()}/mo</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
        {PENDING_VERTICALS.map((v) => {
          const count = (partnersByVertical[v.key] ?? []).length
          return (
            <span key={v.key} style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 999 }}>
              {v.label}: {count} partners · {v.note}
            </span>
          )
        })}
      </div>

      {/* Partner coverage */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>PARTNER COVERAGE — delivery gated on status = signed</h2>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{partners.length} researched</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
        {[...VERTICALS, ...PENDING_VERTICALS].map((v) => {
          const list = partnersByVertical[v.key] ?? []
          if (list.length === 0) return null
          const counts = list.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {} as Record<string, number>)
          const open = openVertical === v.key
          return (
            <div key={v.key} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenVertical(open ? null : v.key)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v.label}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {Object.entries(counts).map(([s, n]) => <Chip key={s} label={`${n} ${s}`} status={s} />)}
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
                </span>
              </button>
              {open && (
                <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Company</th>
                        <th style={thStyle}>Serves</th>
                        <th style={thStyle}>Contact</th>
                        <th style={thStyle}>Cluster</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((p) => (
                        <tr key={p.id}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{p.company_name}</div>
                            {p.notes && <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.notes}>{p.notes}</div>}
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.service_area ?? ''}>{p.location}</td>
                          <td style={{ ...tdStyle, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.contact_info ?? ''}>{p.contact_info}</td>
                          <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)' }}>{p.cluster}</td>
                          <td style={tdStyle}><Chip label={p.status} status={p.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Eligible & unsold */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>ELIGIBLE & UNSOLD — consented leads waiting for partners</h2>
        {eligible.length > 25 && (
          <button onClick={() => setShowAll(!showAll)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}>
            {showAll ? 'Show 25' : `Show all ${eligible.length}`}
          </button>
        )}
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Lead</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Project</th>
                <th style={thStyle}>Budget</th>
                <th style={thStyle}>Land</th>
                <th style={thStyle}>Consents</th>
                <th style={thStyle}>Added</th>
              </tr>
            </thead>
            <tbody>
              {eligibleShown.map((l) => {
                const chips = [
                  l.consent_kit && 'KIT', l.consent_lender && 'LEND', l.consent_realtor && 'RLTR',
                  l.consent_builder && 'BLDR',
                ].filter(Boolean) as string[]
                return (
                  <tr key={l.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{[l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unknown'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.phone ?? l.email ?? ''}</div>
                    </td>
                    <td style={tdStyle}>{[l.trestle_city, l.trestle_state].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)' }}>{l.lead_source}</td>
                    <td style={tdStyle}>{l.project_type ?? '—'}</td>
                    <td style={tdStyle}>{l.budget_range ? (BUDGET_LABELS[l.budget_range] ?? l.budget_range) : '—'}</td>
                    <td style={tdStyle}>{l.land_status ?? '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {chips.map((c) => (
                          <span key={c} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: '#1e3a2b', color: '#57c99b' }}>{c}</span>
                        ))}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                  </tr>
                )
              })}
              {eligible.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No consented leads yet — capture surfaces are live, consents accumulate as leads answer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger */}
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '0 0 8px' }}>LEAD SALES LEDGER</h2>
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {ledger.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            No leads delivered yet. Delivery is hard-gated on a signed partner agreement (referral_partners.status = signed) — Tier 1 agreement or Tier 2 one-pager, both in plans/lead-monetization/REFERRAL_AGREEMENT.md.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Lead</th>
                <th style={thStyle}>Buyer</th>
                <th style={thStyle}>Vertical</th>
                <th style={thStyle}>Price</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Sold</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.contact_name ?? '—'}</td>
                  <td style={tdStyle}>{row.buyer_name}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)' }}>{row.buyer_type}</td>
                  <td style={tdStyle}>{row.price != null ? `$${Number(row.price).toLocaleString()}` : '—'}</td>
                  <td style={tdStyle}><Chip label={row.status} status={row.status} /></td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--muted)' }}>{row.sold_at ? new Date(row.sold_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
        Funnel counts consumer capture sources only. Consent = explicit opt-in captured on any surface. Nothing routes without consent + a signed partner.
      </p>
    </div>
  )
}
