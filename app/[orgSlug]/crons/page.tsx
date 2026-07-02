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

// Map raw script paths / internal names → human-readable label + description
const JOB_REGISTRY: Record<string, { label: string; description: string }> = {
  'fb_inbox_monitor.py':     { label: 'Facebook Inbox Monitor',    description: 'Scans Facebook DMs for new lead messages and logs them to the CRM' },
  'fb_reply_sender.py':      { label: 'Facebook Reply Sender',     description: 'Sends queued Facebook replies drafted by the agent' },
  'inbox_scan.py':           { label: 'Email Inbox Scan',          description: 'Scans Gmail for new emails from leads and updates CRM activity' },
  'lead_alerts.py':          { label: 'Lead Alerts',               description: 'Checks for new CRM leads and posts alerts to the portal' },
  'pipeline_report.py':      { label: 'Daily Pipeline Report',     description: 'Generates end-of-day pipeline summary for the sales team' },
  'plaud_scan.py':           { label: 'Plaud Note Scanner',        description: 'Checks for new Plaud voice note transcripts and posts briefs to Atlas' },
  'dedup_phone_check.py':    { label: 'Phone Dedup Check',         description: 'Flags duplicate phone numbers in the CRM and alerts the team' },
  'meet_dialer.py':          { label: 'Meeting Auto-Dialer',       description: 'Initiates scheduled calls via Telnyx when a meeting is due' },
  'meet_hangup.py':          { label: 'Meeting Auto-Hangup',       description: 'Ends active calls that have exceeded their scheduled duration' },
  'sms_portal_watcher.py':   { label: 'SMS Portal Watcher',        description: 'Watches for new inbound SMS messages and routes them to the portal' },
  'morning-briefs':          { label: 'Morning Briefs',            description: 'Sends daily morning briefing to sales team with priority leads and tasks' },
  'sms-approval-watcher':    { label: 'SMS Approval Watcher',      description: 'Monitors SMS draft approvals and sends approved messages via Telnyx' },
};

function getJobInfo(name: string | null): { label: string; description: string } {
  if (!name) return { label: '(unnamed)', description: '' };
  // Extract script filename from full path
  const filename = name.split('/').pop() ?? name;
  if (JOB_REGISTRY[filename]) return JOB_REGISTRY[filename];
  if (JOB_REGISTRY[name]) return JOB_REGISTRY[name];
  // One-time tasks: use name directly as label
  if (name.startsWith('at ') || name.match(/^[A-Z]/)) return { label: name, description: 'One-time scheduled task' };
  // Docker/shell commands: shorten
  if (name.startsWith('docker exec') || name.startsWith('/home')) {
    return { label: filename.replace('.py', '').replace(/-/g, ' ').replace(/_/g, ' '), description: 'Automation script' };
  }
  return { label: name, description: '' };
}

function humanSchedule(expr: string | null, tz: string | null): string {
  if (!expr) return '—';

  // One-time
  if (expr.startsWith('at ')) {
    const iso = expr.slice(3);
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return `Once — ${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CST`;
    }
    return expr;
  }
  if (expr === 'manual') return 'Manual trigger only';
  if (expr === 'every') return 'Continuous (every message)';

  // Parse cron: min hour dom month dow
  const parts = expr.split(' ');
  if (parts.length !== 5) return tz ? `${expr} (${tz})` : expr;
  const [min, hour, dom, , dow] = parts;

  // Every N minutes
  if (min.startsWith('*/') && hour === '*') {
    const n = min.slice(2);
    return `Every ${n} minute${n === '1' ? '' : 's'}`;
  }
  // Every minute
  if (min === '*' && hour === '*') return 'Every minute';

  // Daily at specific time
  if (!min.includes('*') && !min.includes('/') && !hour.includes('*') && !hour.includes('/') && !hour.includes(',') && dom === '*') {
    const h = parseInt(hour), m = parseInt(min);
    const d = new Date(); d.setHours(h, m, 0);
    const label = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return `Daily at ${label} UTC${tz ? ` (${tz})` : ''}`;
  }

  // Hourly range (e.g. business hours)
  if (!min.includes('*') && hour.includes('-') || hour.includes(',')) {
    return `Hourly during active hours`;
  }

  // Fallback — still readable
  return tz ? `${expr} (${tz})` : expr;
}

function formatLastRun(ms: number | null) {
  if (!ms) return 'Never run';
  const d = new Date(ms);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    .order('agent_name')
    .order('name');

  const grouped = (jobs as CronJob[] ?? []).reduce<Record<string, CronJob[]>>((acc, job) => {
    const key = job.agent_name ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    // Deduplicate by name+schedule
    const exists = acc[key].some(j => j.name === job.name && j.schedule_expr === job.schedule_expr);
    if (!exists) acc[key].push(job);
    return acc;
  }, {});

  const agentNames = Object.keys(grouped).sort();

  return (
    <div className="page-scroll">
      <div style={{ padding: '28px 24px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Automations</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '28px' }}>Scheduled jobs running for each agent. Updates every 5 minutes.</div>

        {agentNames.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>No cron jobs synced yet.</div>
        )}

        {agentNames.map(agentName => (
          <section key={agentName} style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              {agentName.charAt(0).toUpperCase() + agentName.slice(1)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {grouped[agentName].map(job => {
                const { label, description } = getJobInfo(job.name);
                const schedule = humanSchedule(job.schedule_expr, job.schedule_tz);
                const lastRun = formatLastRun(job.last_run_at_ms);
                const hasError = (job.consecutive_errors ?? 0) > 0;
                const statusColor = job.last_run_status === 'ok' || job.last_run_status === 'success' ? '#22c55e'
                  : hasError ? '#da3633' : 'var(--muted)';

                return (
                  <div key={job.id} style={{
                    background: '#0d1117',
                    border: `1px solid ${hasError ? 'rgba(218,54,51,0.3)' : '#21262d'}`,
                    borderRadius: '8px', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: job.enabled ? 'var(--text)' : 'var(--muted)' }}>
                            {label}
                          </span>
                          {!job.enabled && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#21262d', color: 'var(--muted)', fontWeight: 600 }}>DISABLED</span>
                          )}
                        </div>
                        {description && (
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', lineHeight: 1.4 }}>{description}</div>
                        )}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            🕐 {schedule}
                          </span>
                          <span style={{ fontSize: '12px', color: statusColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {hasError ? '⚠️' : '✓'} Last ran {lastRun}
                            {hasError ? ` · ${job.consecutive_errors} error${(job.consecutive_errors ?? 0) > 1 ? 's' : ''}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
