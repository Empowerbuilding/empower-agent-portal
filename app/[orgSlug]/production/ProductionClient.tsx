'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

interface DosProject {
  id: string;
  client_name: string;
  current_phase: string | null;
  current_hand: string | null;
  upworker: string | null;
  updated_at: string | null;
}

interface ChecklistItem {
  id: string;
  design_os_project_id: string | null;
  project_name: string | null;
  item: string;
  category: string | null;
  status: string | null;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  source: string | null;
  created_at?: string | null;
  details: Record<string, unknown> | null;
}

interface ProjectSummary {
  actionable: number;
  done_n: number;
  meetings: number;
}

const CATEGORY_ORDER = ['layout', 'site', 'exterior', 'interior', 'structural', 'mep', 'finishes', 'roofing', 'manual'];
const PHASE_LABEL: Record<string, string> = {
  conceptual_design: 'Conceptual',
  draft_1: 'Draft 1',
  draft_2: 'Draft 2',
  draft_3: 'Draft 3',
  final_polish: 'Final Polish',
};
const PHASE_ORDER = ['draft_1', 'draft_2', 'draft_3', 'final_polish', 'conceptual_design'];

function fmtPhase(p: string | null) {
  if (!p) return '—';
  return PHASE_LABEL[p] ?? p.replace(/_/g, ' ');
}

function fmtCat(c: string | null) {
  if (!c) return 'Other';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function kindOf(it: ChecklistItem) {
  return ((it.details as { kind?: string } | null)?.kind ?? 'decision');
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

// Derive a meeting date from the source label. Sources look like:
//   "design-brain v2 — D1 Review 2026-10-09"            (auto-trigger, trailing ISO date)
//   "design-brain v2 — 2026-05-08_Notes-Brecher-..."    (history backfill, leading ISO date)
//   "Oct 9 D1 Review - Yvonne Kaatz"                    (legacy, month-day)
// Insert time (created_at) is only used as a tiebreak for same-day re-runs,
// never as the primary key — the history backfill inserts old meetings now.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
function meetingDateOf(source: string): number {
  const iso = source.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return Date.parse(iso[0]);
  const mo = source.match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\b/);
  if (mo && MONTHS.includes(mo[1])) return Date.parse(`${mo[1]} ${mo[2]} 2026`);
  return -1;
}

function meetingLabel(source: string): string {
  return source.replace(/^design-brain v2\s*[—–-]\s*/i, '').replace(/_/g, ' ');
}

export default function ProductionClient({
  orgSlug, role, userName, projects, summary,
}: {
  orgSlug: string;
  role: string;
  userName: string;
  projects: DosProject[];
  summary: Record<string, ProjectSummary>;
}) {
  const isContractor = role === 'contractor';
  const isAdmin = ['owner', 'admin'].includes(role);
  const isMobile = useIsMobile();

  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [scope, setScope] = useState<'latest' | 'all'>('latest');
  const [items, setItems] = useState<ChecklistItem[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [itemState, setItemState] = useState<Record<string, Partial<ChecklistItem>>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  // Fetch checklist items for the selected project only (no bulk load).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setItemState({});
    setError(null);
    fetch(`/api/production/items?org=${encodeURIComponent(orgSlug)}&projectId=${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok
        ? r.json()
        : r.json().then((j: { error?: string }) => Promise.reject(new Error(j.error ?? `HTTP ${r.status}`)))))
      .then((d: ChecklistItem[]) => { if (!cancelled) setItems(Array.isArray(d) ? d : []); })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message ?? String(e)); });
    return () => { cancelled = true; };
  }, [selectedId, orgSlug]);

  // effective items = server rows overridden by local optimistic state
  const effItems = useMemo(() => (items ?? []).map((it) => ({ ...it, ...(itemState[it.id] ?? {}) })), [items, itemState]);

  // meeting sources present in this project → pick the latest by meeting date
  const sources = useMemo(() => {
    const m = new Map<string, { date: number; created: string }>();
    for (const it of effItems) {
      const s = it.source ?? '';
      const created = it.created_at ?? '';
      const prev = m.get(s);
      if (!prev || created > prev.created) m.set(s, { date: meetingDateOf(s), created });
    }
    return m;
  }, [effItems]);

  const latestSource = useMemo(() => {
    let best: string | null = null;
    let bestDate = -2;
    let bestCreated = '';
    for (const [s, v] of sources) {
      if (v.date > bestDate || (v.date === bestDate && v.created > bestCreated)) {
        best = s; bestDate = v.date; bestCreated = v.created;
      }
    }
    return best;
  }, [sources]);

  // drafters default to the latest meeting's checklist; "all" shows full history
  const scoped = scope === 'latest' && latestSource ? effItems.filter((it) => it.source === latestSource) : effItems;

  const decisions = scoped.filter((it) => kindOf(it) === 'decision');
  const opens = scoped.filter((it) => kindOf(it) === 'open');
  const deliverables = scoped.filter((it) => kindOf(it) === 'deliverable');
  const actionable = [...decisions, ...deliverables];

  // group projects into phase sections (pipeline order), most-recent first inside each
  const phaseGroups = useMemo(() => {
    const g = new Map<string, DosProject[]>();
    for (const p of projects) {
      const k = p.current_phase ?? 'other';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(p);
    }
    const keys = [...g.keys()].sort((a, b) => {
      const ia = PHASE_ORDER.indexOf(a), ib = PHASE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map((k) => [k, g.get(k)!] as const);
  }, [projects]);

  const grouped = useMemo(() => {
    const g = new Map<string, ChecklistItem[]>();
    for (const it of decisions) {
      const k = it.category ?? 'manual';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(it);
    }
    const keys = [...g.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map((k) => [k, g.get(k)!] as const);
  }, [decisions]);

  async function patchItem(itemId: string, payload: { done?: boolean; status?: string }) {
    setBusy((s) => new Set(s).add(itemId));
    setError(null);
    // optimistic
    setItemState((s) => ({
      ...s,
      [itemId]: {
        ...s[itemId],
        ...(payload.done !== undefined
          ? { done: payload.done, done_by: payload.done ? userName : null, done_at: payload.done ? new Date().toISOString() : null }
          : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
    }));
    try {
      const res = await fetch('/api/production/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgSlug, itemId, ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // revert
        setItemState((s) => {
          const next = { ...s };
          delete next[itemId];
          return next;
        });
        setError(j.error ?? `Update failed (${res.status})`);
      }
    } catch {
      setItemState((s) => {
        const next = { ...s };
        delete next[itemId];
        return next;
      });
      setError('Network error — change reverted');
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(itemId);
        return next;
      });
    }
  }

  const doneCount = actionable.filter((i) => i.done).length;
  const pct = actionable.length ? Math.round((doneCount / actionable.length) * 100) : 0;

  const segBtn = (active: boolean): CSSProperties => ({
    fontSize: 11.5,
    padding: isMobile ? '5px 12px' : '3px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          Production {isContractor ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— your projects</span> : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— drafting board</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {isContractor
            ? 'Check items off as you draft them. Michael sees your progress live.'
            : 'Contractor progress on design checklists. Verify items as Michael reviews drafts.'}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Project list */}
        <div style={{ width: isMobile ? '100%' : 280, display: isMobile && mobileView === 'detail' ? 'none' : 'block', borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0, padding: '10px 10px 20px' }}>
          {projects.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>
              No projects assigned to you yet. Michael assigns them — you&apos;ll see a card here in this channel when one lands.
            </div>
          )}
          {phaseGroups.map(([phase, phaseProjects]) => (
            <div key={phase} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 4px 4px' }}>
                {fmtPhase(phase)} <span style={{ opacity: 0.7 }}>({phaseProjects.length})</span>
              </div>
              {phaseProjects.map((p) => {
                const s = summary[p.id];
                const d = s?.done_n ?? 0;
                const n = s?.actionable ?? 0;
                const pp = n ? Math.round((d / n) * 100) : 0;
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); if (isMobile) setMobileView('detail'); }}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: active ? 'var(--surface-hover)' : 'transparent',
                      border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                      borderRadius: 8, padding: '8px 12px', marginBottom: 4,
                      color: 'inherit', display: 'block',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.client_name}</span>
                      {isAdmin && p.upworker && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', opacity: 0.85, whiteSpace: 'nowrap' }}>◍ {p.upworker}</span>
                      )}
                    </div>
                    {n > 0 ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ height: isMobile ? 6 : 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ width: `${pp}%`, height: '100%', background: pp === 100 ? '#3fb950' : 'var(--accent)' }} />
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3 }}>
                          {d}/{n} done{(s?.meetings ?? 0) > 1 ? ` · ${s!.meetings} meetings` : ''}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5, opacity: 0.75 }}>no checklist yet</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Checklist */}
        <div style={{ flex: 1, minWidth: 0, display: isMobile && mobileView === 'list' ? 'none' : 'block', overflowY: 'auto', padding: isMobile ? '12px 16px 40px' : '16px 22px 40px' }}>
          {isMobile && (
            <button
              onClick={() => setMobileView('list')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13.5, fontWeight: 600, padding: '2px 0 10px', cursor: 'pointer' }}
            >
              ← All projects
            </button>
          )}
          {!selected && (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Select a project.</div>
          )}
          {selected && loadError && (
            <div style={{ color: '#f85149', fontSize: 13, padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              Couldn&apos;t load checklist: {loadError}
            </div>
          )}
          {selected && !loadError && items === null && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>Loading checklist…</div>
          )}
          {selected && items !== null && items.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
              No design checklist for this project yet. Checklists generate automatically ~2 hours after each design meeting.
            </div>
          )}
          {selected && items !== null && items.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{selected.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {fmtPhase(selected.current_phase)} · {selected.current_hand === 'upworker' ? 'in drafter hands' : `with ${selected.current_hand ?? '—'}`}
                </div>
              </div>

              {/* meeting scope toggle */}
              <div style={{ display: 'flex', gap: 6, margin: '10px 0 4px', flexWrap: 'wrap' }}>
                <button style={segBtn(scope === 'latest')} onClick={() => setScope('latest')}>Latest meeting</button>
                <button style={segBtn(scope === 'all')} onClick={() => setScope('all')}>All meetings ({sources.size})</button>
              </div>
              {scope === 'latest' && latestSource && (
                <div style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>Viewing: {meetingLabel(latestSource)}</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 6px' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#3fb950' : 'var(--accent)', transition: 'width .2s' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{doneCount}/{actionable.length} done · {pct}%</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 14px' }}>
                {decisions.length} decisions · {deliverables.length} deliverables · {opens.length} open questions
              </div>
              {error && (
                <div style={{ color: '#f85149', fontSize: 12, marginBottom: 10 }}>{error}</div>
              )}
              {grouped.map(([cat, catItems]) => {
                const cd = catItems.filter((i) => i.done).length;
                return (
                  <div key={cat} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{fmtCat(cat)}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{cd}/{catItems.length}</span>
                    </div>
                    {catItems.map((it) => (
                      <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: 6, background: it.done ? 'transparent' : 'var(--surface)', marginBottom: 3, opacity: busy.has(it.id) ? 0.55 : 1 }}>
                        <input
                          type="checkbox"
                          checked={!!it.done}
                          onChange={(e) => patchItem(it.id, { done: e.target.checked })}
                          style={{ marginTop: isMobile ? 4 : 2, accentColor: 'var(--accent)', width: isMobile ? 22 : 15, height: isMobile ? 22 : 15, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, lineHeight: 1.45, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--muted)' : 'inherit' }}>
                            {it.item}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                            {it.status === 'verified' && <span style={{ fontSize: 10, color: '#3fb950' }}>✓ verified</span>}
                            {it.status === 'flagged' && <span style={{ fontSize: 10, color: '#d29922' }}>⚠ needs verification</span>}
                            {it.done && it.done_by && <span style={{ fontSize: 10, color: 'var(--muted)' }}>by {it.done_by}</span>}
                            {isAdmin && it.status !== 'verified' && (
                              <button
                                onClick={() => patchItem(it.id, { status: 'verified' })}
                                style={{ fontSize: isMobile ? 12 : 10, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, padding: isMobile ? '4px 10px' : '0 6px', minHeight: isMobile ? 28 : 0, cursor: 'pointer' }}
                              >verify</button>
                            )}
                            {isAdmin && it.status === 'verified' && (
                              <button
                                onClick={() => patchItem(it.id, { status: 'open' })}
                                style={{ fontSize: isMobile ? 12 : 10, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, padding: isMobile ? '4px 10px' : '0 6px', minHeight: isMobile ? 28 : 0, cursor: 'pointer' }}
                              >un-verify</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {deliverables.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent)' }}>Deliverables</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{deliverables.filter((i) => i.done).length}/{deliverables.length}</span>
                  </div>
                  {deliverables.map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: 6, background: it.done ? 'transparent' : 'var(--surface)', marginBottom: 3, opacity: busy.has(it.id) ? 0.55 : 1 }}>
                      <input type="checkbox" checked={!!it.done} onChange={(e) => patchItem(it.id, { done: e.target.checked })} style={{ marginTop: isMobile ? 4 : 2, accentColor: 'var(--accent)', width: isMobile ? 22 : 15, height: isMobile ? 22 : 15, cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ fontSize: 13, lineHeight: 1.45, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--muted)' : 'inherit' }}>{it.item}</div>
                    </div>
                  ))}
                </div>
              )}

              {opens.length > 0 && (
                <div style={{ marginBottom: 18, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#d29922', marginBottom: 6 }}>
                    ❓ Open questions ({opens.length}) — undecided, confirm with Michael
                  </div>
                  {opens.map((it) => (
                    <div key={it.id} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)', padding: '3px 0' }}>• {it.item}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
