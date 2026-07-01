import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';

interface CronJob {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  name: string | null;
  enabled: boolean | null;
  schedule_expr: string | null;
  schedule_tz: string | null;
  wake_mode: string | null;
  last_run_at_ms: number | null;
  last_run_status: string | null;
  last_delivered: boolean | null;
  consecutive_errors: number | null;
  synced_at: string;
  source: string | null;
}

function formatSchedule(expr: string | null, tz: string | null) {
  if (!expr) return '—';
  if (expr.startsWith('at ')) {
    const iso = expr.slice(3);
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return `once at ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    }
    return expr;
  }
  if (expr === 'manual') return 'manual trigger only';
  return tz ? `${expr} (${tz})` : expr;
}

function formatLastRun(ms: number | null) {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? '').toLowerCase();
  let color = '#7d8590';
  let bg = '#21262d';
  let label = status ?? '—';
  if (s === 'ok' || s === 'success') { color = '#4c8bf0'; bg = 'rgba(76,139,240,0.15)'; label = 'OK'; }
  else if (s === 'error') { color = '#da3633'; bg = 'rgba(218,54,51,0.15)'; label = 'Error'; }
  else if (s === 'idle') { color = '#7d8590'; bg = '#21262d'; label = 'Idle'; }
  return (
    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: bg, color, fontWeight: 700 }}>
      {label}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean | null }) {
  return enabled ? (
    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(76,139,240,0.15)', color: '#4c8bf0', fontWeight: 700 }}>● Enabled</span>
  ) : (
    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: '#21262d', color: 'var(--muted)', fontWeight: 700 }}>○ Disabled</span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const isHost = source === 'host-crontab';
  return (
    <span
      title={isHost ? 'Runs from the host crontab, outside OpenClaw\'s own scheduler' : 'Registered in the agent\'s OpenClaw cron scheduler'}
      style={{
        fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
        background: isHost ? 'rgba(76,139,240,0.12)' : '#21262d',
        color: isHost ? 'var(--accent)' : 'var(--muted)',
        fontWeight: 600, letterSpacing: '0.02em',
      }}
    >
      {isHost ? 'HOST CRONTAB' : 'OPENCLAW'}
    </span>
  );
}

export default async function CronsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
  if (!org) redirect('/login');

  const { data: portalUser } = await supabase
    .from('portal_users').select('id').eq('supabase_auth_id', user.id).eq('org_id', org.id).single();
  if (!portalUser) redirect('/login');

  const { data: jobs } = await supabase
    .from('agent_cron_jobs')
    .select('*')
    .eq('org_id', org.id)
    .in('agent_name', ['vanessa', 'atlas'])
    .order('agent_name')
    .order('name');

  const grouped = (jobs as CronJob[] ?? []).reduce<Record<string, CronJob[]>>((acc, job) => {
    const key = job.agent_name ?? 'Unknown agent';
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});

  const agentNames = Object.keys(grouped).sort();

  return (
    <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Active Cron Jobs</div>
      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '32px' }}>
        Read-only snapshot for Vanessa + Atlas, synced every 5 minutes. Includes jobs registered in each
        agent's own OpenClaw scheduler, plus host-crontab jobs that run directly against these containers
        outside OpenClaw's scheduler (labeled below). To change a job, edit it at the source.
      </div>

      {agentNames.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '14px' }}>No cron jobs synced yet.</div>
      )}

      {agentNames.map(agentName => (
        <section key={agentName} style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
            {agentName}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {grouped[agentName].map(job => (
              <div key={job.id} style={{
                background: '#0d1117', border: '1px solid #21262d', borderRadius: '8px', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{job.name ?? '(unnamed)'}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    <SourceBadge source={job.source} />
                    <EnabledBadge enabled={job.enabled} />
                    <StatusBadge status={job.last_run_status} />
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
                  Schedule: {formatSchedule(job.schedule_expr, job.schedule_tz)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  Last run: {formatLastRun(job.last_run_at_ms)}
                  {job.consecutive_errors ? ` · ${job.consecutive_errors} consecutive error${job.consecutive_errors > 1 ? 's' : ''}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
