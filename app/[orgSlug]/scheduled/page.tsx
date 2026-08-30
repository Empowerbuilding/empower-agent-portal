'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// A scheduled send = an agent_cron_jobs row whose payload is an agentTurn
// (a queued message to an agent) rather than an infra shell command.
interface CronRow {
  id: string;
  agent_name: string | null;
  name: string | null;
  enabled: boolean | null;
  schedule_expr: string | null;
  schedule_tz: string | null;
  last_run_at_ms: number | null;
  last_run_status: string | null;
  consecutive_errors: number | null;
  source: string | null;
  raw_payload: {
    payload?: { kind?: string; message?: string };
    state?: { nextRunAtMs?: number };
  } | null;
}

interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
}

const DOW_NAMES: Record<string, string> = { '0': 'Sundays', '1': 'Mondays', '2': 'Tuesdays', '3': 'Wednesdays', '4': 'Thursdays', '5': 'Fridays', '6': 'Saturdays', '7': 'Sundays' };

function dowPrefix(dow: string): string {
  if (dow === '*') return 'Daily';
  if (dow === '1-5') return 'Weekdays';
  if (DOW_NAMES[dow]) return DOW_NAMES[dow];
  return 'Daily';
}

function fmt12(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function tzLabel(tz: string | null | undefined): string {
  if (!tz || tz === 'UTC' || tz === 'America/Chicago') return 'CT';
  return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}

function isOneShot(expr: string | null): boolean {
  return !!expr && expr.startsWith('at ');
}

function humanSchedule(expr: string | null, tz?: string | null): string {
  if (!expr) return '—';
  if (expr.startsWith('at ')) {
    const d = new Date(expr.slice(3));
    if (!isNaN(d.getTime())) return `Once — ${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CT`;
    return expr;
  }
  if (expr === 'manual') return 'Manual only';
  if (expr === 'every') return 'Continuous';
  if (expr.startsWith('every ')) return expr.charAt(0).toUpperCase() + expr.slice(1);
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} min`;
  if (min === '*' && hour === '*') return 'Every minute';
  if (!min.includes('*') && !hour.includes('*') && !hour.includes(',') && dom === '*') {
    const h = parseInt(hour), m = parseInt(min);
    if (!tz || tz === 'UTC') {
      const d = new Date(); d.setUTCHours(h, m, 0, 0);
      return `${dowPrefix(dow)} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CT`;
    }
    return `${dowPrefix(dow)} at ${fmt12(h, m)} ${tzLabel(tz)}`;
  }
  if (hour.includes('-') || hour.includes(',')) return `At ${expr.split(' ')[1].replace(/,/g, ', ')}h ${tzLabel(tz)}`;
  return expr;
}

function formatNextRun(ms: number | null | undefined, enabled: boolean | null): string {
  if (enabled === false) return 'Paused';
  if (!ms) return '—';
  const diff = ms - Date.now();
  if (diff <= 0) return 'Due now';
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `in ${hr}h ${min % 60}m`;
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT';
}

function formatLastRun(ms: number | null, status: string | null): string {
  if (!ms) return 'Not run yet';
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  const suffix = status === 'error' ? ' (failed)' : '';
  if (diffMin < 2) return `Just now${suffix}`;
  if (diffMin < 60) return `${diffMin}m ago${suffix}`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago${suffix}`;
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + suffix;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'oneshot', label: '📤 One-time' },
  { key: 'recurring', label: '🔁 Recurring' },
];

export default function ScheduledSendsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = useMemo(() => createClient(), []);

  const [jobs, setJobs] = useState<CronRow[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [featureAllowed, setFeatureAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgSlug]);

  async function loadAll() {
    const { data: org } = await supabase.from('organizations').select('id, features').eq('slug', orgSlug).single();
    if (!org) { setLoading(false); return; }
    const allowed = Array.isArray(org.features) && org.features.includes('scheduled_sends');
    setFeatureAllowed(allowed);
    if (!allowed) { setLoading(false); return; }

    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: pu } = await supabase.from('portal_users').select('role').eq('supabase_auth_id', authData.user.id).eq('org_id', org.id).single();
      if (pu) setCurrentUserRole(pu.role);
    }

    const { data: cronJobs } = await supabase
      .from('agent_cron_jobs')
      .select('id, agent_name, name, enabled, schedule_expr, schedule_tz, last_run_at_ms, last_run_status, consecutive_errors, source, raw_payload')
      .eq('org_id', org.id);

    // Scheduled sends = agentTurn payloads (queued messages), not shell-command infra jobs.
    const sends = ((cronJobs as CronRow[]) ?? []).filter(j =>
      j.source === 'openclaw-cron' && j.raw_payload?.payload?.kind === 'agentTurn'
    );
    // Soonest next run first; jobs without a next run at the bottom.
    sends.sort((a, b) => (a.raw_payload?.state?.nextRunAtMs ?? Infinity) - (b.raw_payload?.state?.nextRunAtMs ?? Infinity));
    setJobs(sends);

    const { data: channels } = await supabase.from('portal_channels').select('agent_id').eq('org_id', org.id).eq('active', true);
    const agentIds = [...new Set((channels ?? []).map((c: { agent_id: string }) => c.agent_id))];
    if (agentIds.length) {
      const { data: agentList } = await supabase.from('agents').select('id, name, display_name').in('id', agentIds);
      setAgents(agentList ?? []);
    }
    setLoading(false);
  }

  function agentFor(job: CronRow): AgentInfo | undefined {
    return agents.find(a => a.name === job.agent_name);
  }

  // Cancel = disable via existing crons PATCH route (job stays visible, paused).
  async function cancelSend(job: CronRow) {
    const agent = agentFor(job);
    if (!agent) { setError('No portal agent found for this job — cannot cancel from here.'); return; }
    setBusy(job.id); setError('');
    try {
      const res = await fetch(`/api/agents/${agent.id}/crons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronId: job.id, action: job.enabled ? 'disable' : 'enable' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Cancel failed'); return; }
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: !job.enabled } : j));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(null);
    }
  }

  // Delete = permanent removal via existing crons DELETE route.
  async function deleteSend(job: CronRow) {
    if (!confirm(`Permanently delete "${job.name ?? 'this scheduled send'}"?`)) return;
    const agent = agentFor(job);
    if (!agent) { setError('No portal agent found for this job — cannot delete from here.'); return; }
    setBusy(job.id); setError('');
    try {
      const res = await fetch(`/api/agents/${agent.id}/crons`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronId: job.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Delete failed'); return; }
      setJobs(prev => prev.filter(j => j.id !== job.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  const visible = jobs.filter(j => {
    if (filter === 'oneshot' && !isOneShot(j.schedule_expr)) return false;
    if (filter === 'recurring' && isOneShot(j.schedule_expr)) return false;
    return true;
  });

  const canManage = ['owner', 'admin'].includes(currentUserRole);

  if (!loading && featureAllowed === false) {
    return (
      <div className="page-scroll">
        <div style={{ padding: '48px 24px', maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Scheduled Sends isn&apos;t enabled</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>This feature isn&apos;t turned on for your organization. Contact your administrator.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div style={{ padding: '28px 24px', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Scheduled Sends</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px' }}>
          Queued and recurring messages your agents will send. Cancel pauses a send; Delete removes it permanently.
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: filter === f.key ? 'var(--accent)' : 'transparent',
                color: filter === f.key ? '#fff' : 'var(--muted)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#da3633', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', padding: '8px 10px', marginBottom: '14px' }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>
            {jobs.length === 0 ? 'No scheduled sends. Ask an agent to schedule a message, or create one from the Automations page.' : 'Nothing matches that filter.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visible.map(job => {
              const message = job.raw_payload?.payload?.message ?? '';
              const nextRunMs = job.raw_payload?.state?.nextRunAtMs ?? null;
              const hasError = (job.consecutive_errors ?? 0) > 0;
              const oneShot = isOneShot(job.schedule_expr);
              const agentLabel = agentFor(job)?.display_name
                ?? (job.agent_name ? job.agent_name.charAt(0).toUpperCase() + job.agent_name.slice(1) : 'Unknown agent');

              return (
                <div key={job.id} style={{
                  background: 'var(--sidebar-bg)',
                  border: `1px solid ${hasError ? 'rgba(218,54,51,0.3)' : 'var(--border)'}`,
                  borderRadius: '8px', padding: '14px 16px',
                  opacity: job.enabled === false ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{job.name ?? '(unnamed)'}</span>
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600 }}>
                          {oneShot ? 'ONE-TIME' : 'RECURRING'}
                        </span>
                        {job.enabled === false && (
                          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(234,179,8,0.15)', color: '#eab308', fontWeight: 600 }}>CANCELLED</span>
                        )}
                      </div>
                      {message && (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {message}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text)' }}>🤖 {agentLabel}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text)' }}>🕐 {humanSchedule(job.schedule_expr, job.schedule_tz)}</span>
                        <span style={{ fontSize: '12px', color: job.enabled === false ? '#eab308' : 'var(--accent)' }}>
                          ⏭ Next: {formatNextRun(nextRunMs, job.enabled)}
                        </span>
                        <span style={{ fontSize: '12px', color: hasError ? '#da3633' : 'var(--muted)' }}>
                          {hasError ? '⚠️' : '✓'} Last: {formatLastRun(job.last_run_at_ms, job.last_run_status)}
                        </span>
                      </div>
                    </div>

                    {canManage && (
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={() => cancelSend(job)}
                          disabled={busy === job.id}
                          style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          {busy === job.id ? '…' : job.enabled === false ? 'Resume' : 'Cancel'}
                        </button>
                        <button
                          onClick={() => deleteSend(job)}
                          disabled={busy === job.id}
                          style={{ padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: '#da3633', cursor: 'pointer', fontSize: '13px' }}
                          title="Delete permanently"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
