'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CronJob {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  name: string | null;
  enabled: boolean | null;
  schedule_expr: string | null;
  schedule_tz: string | null;
  last_run_at_ms: number | null;
  last_run_status: string | null;
  consecutive_errors: number | null;
  source: string | null;
}

interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
}

// Map known script names to human-readable info
const JOB_REGISTRY: Record<string, { label: string; description: string }> = {
  'fb_inbox_monitor.py':   { label: 'Facebook Inbox Monitor',  description: 'Scans Facebook DMs for new lead messages' },
  'fb_reply_sender.py':    { label: 'Facebook Reply Sender',   description: 'Sends queued Facebook replies drafted by the agent' },
  'inbox_scan.py':         { label: 'Email Inbox Scan',        description: 'Scans Gmail for new emails from leads' },
  'lead_alerts.py':        { label: 'Lead Alerts',             description: 'Checks for new CRM leads and posts alerts' },
  'pipeline_report.py':    { label: 'Daily Pipeline Report',   description: 'Generates end-of-day pipeline summary' },
  'plaud_scan.py':         { label: 'Plaud Note Scanner',      description: 'Checks for new Plaud voice note transcripts' },
  'dedup_phone_check.py':  { label: 'Phone Dedup Check',       description: 'Flags duplicate phone numbers in the CRM' },
  'meet_dialer.py':        { label: 'Meeting Auto-Dialer',     description: 'Initiates scheduled calls via Telnyx' },
  'meet_hangup.py':        { label: 'Meeting Auto-Hangup',     description: 'Ends active calls that exceeded their duration' },
  'sms_portal_watcher.py': { label: 'SMS Portal Watcher',      description: 'Watches for new inbound SMS messages' },
  'morning-briefs':        { label: 'Morning Briefs',          description: 'Daily morning briefing with priority leads and tasks' },
  'sms-approval-watcher':  { label: 'SMS Approval Watcher',    description: 'Monitors SMS drafts and sends approved messages' },
};

function getJobInfo(name: string | null): { label: string; description: string; isJunk: boolean } {
  if (!name) return { label: '(unnamed)', description: '', isJunk: false };
  const filename = name.split('/').pop() ?? name;
  if (JOB_REGISTRY[filename]) return { ...JOB_REGISTRY[filename], isJunk: false };
  if (JOB_REGISTRY[name]) return { ...JOB_REGISTRY[name], isJunk: false };
  // Filter junk
  if (name.startsWith('docker exec') || name.startsWith('openclaw cron run ')) return { label: '', description: '', isJunk: true };
  // One-time tasks or named agent crons
  if (name.match(/^[A-Z]/) || name.match(/^at /)) return { label: name, description: 'One-time scheduled task', isJunk: false };
  return { label: name.replace(/_/g, ' ').replace(/-/g, ' '), description: '', isJunk: false };
}

function humanSchedule(expr: string | null): string {
  if (!expr) return '—';
  if (expr.startsWith('at ')) {
    const d = new Date(expr.slice(3));
    if (!isNaN(d.getTime())) return `Once — ${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CST`;
    return expr;
  }
  if (expr === 'manual') return 'Manual only';
  if (expr === 'every') return 'Continuous';
  if (expr.startsWith('every ')) return expr.charAt(0).toUpperCase() + expr.slice(1);
  const parts = expr.split(' ');
  if (parts.length !== 5) return expr;
  const [min, hour, dom] = parts;
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} min`;
  if (min === '*' && hour === '*') return 'Every minute';
  if (!min.includes('*') && !hour.includes('*') && !hour.includes(',') && dom === '*') {
    const d = new Date(); d.setUTCHours(parseInt(hour), parseInt(min), 0);
    return `Daily at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} CST`;
  }
  if (hour.includes('-') || hour.includes(',')) return 'Hourly (active hours)';
  return expr;
}

function formatLastRun(ms: number | null, source: string | null): string {
  if (source === 'host-crontab') return 'Externally managed';
  if (!ms) return 'Never run';
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function AddCronModal({ agents, orgId, onClose, onCreated, editJob }: {
  agents: AgentInfo[];
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
  editJob?: CronJob | null;
}) {
  const isEdit = !!editJob;
  const editAgent = editJob ? agents.find(a => a.name === editJob.agent_name) : null;
  const [agentId, setAgentId] = useState(editAgent?.id ?? agents[0]?.id ?? '');
  const [name, setName] = useState(editJob?.name ?? '');
  const [scheduleType, setScheduleType] = useState<'every' | 'cron' | 'at'>('every');
  const [scheduleValue, setScheduleValue] = useState(editJob?.schedule_expr ?? '');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // NL input
  const [nlText, setNlText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  async function parseNL() {
    if (!nlText.trim()) return;
    setParsing(true);
    setParseError('');
    try {
      const targetAgentId = agentId || agents[0]?.id;
      const res = await fetch(`/api/agents/${targetAgentId}/crons/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlText }),
      });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error || 'Parse failed'); return; }
      setName(data.name);
      setScheduleType(data.scheduleType);
      setScheduleValue(data.scheduleValue);
      setMessage(data.message);
    } catch (e: any) {
      setParseError(e.message || 'Parse failed');
    } finally {
      setParsing(false);
    }
  }

  const schedPlaceholders = {
    every: '30m  or  2h  or  1d',
    cron: '0 9 * * *  (daily at 9 AM)',
    at: '2026-08-01T09:00:00-05:00',
  };

  async function handleCreate() {
    if (!name || !scheduleValue || !message) { setError('Fill in all fields'); return; }
    setSaving(true); setError('');
    try {
      // Edit = delete old + create new
      if (isEdit && editJob) {
        const delAgent = agents.find(a => a.name === editJob.agent_name);
        if (delAgent) {
          await fetch(`/api/agents/${delAgent.id}/crons`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cronId: editJob.id }),
          });
        }
      }
      const res = await fetch(`/api/agents/${agentId}/crons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scheduleType, scheduleValue, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Failed'); setSaving(false); return; }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed');
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>{isEdit ? 'Edit Automation' : 'New Automation'}</div>

        {/* NL input — only on new */}
        {!isEdit && (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>✨ Describe it in plain English</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={nlText}
                onChange={e => setNlText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && parseNL()}
                placeholder={'e.g. "Email Larry every Tuesday at 10am with a follow-up reminder"'}
                style={{ flex: 1, padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none', minWidth: 0 }}
              />
              <button
                onClick={parseNL}
                disabled={!nlText.trim() || parsing}
                style={{ padding: '9px 14px', background: parsing ? 'var(--border)' : 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: parsing ? 'default' : 'pointer', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0, opacity: !nlText.trim() ? 0.4 : 1 }}
              >
                {parsing ? '…' : 'Parse →'}
              </button>
            </div>
            {parseError && <div style={{ fontSize: '11px', color: '#da3633', marginTop: '6px' }}>{parseError}</div>}
            <div style={{ fontSize: '11px', color: '#6e7681', marginTop: '6px' }}>Auto-fills the fields below. You can edit before saving.</div>
          </div>
        )}

        {agents.length > 1 && (
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '5px' }}>Agent</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px' }}>
              {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '5px' }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Summary" style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '5px' }}>Schedule</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {(['every', 'cron', 'at'] as const).map(t => (
              <button key={t} onClick={() => setScheduleType(t)} style={{ flex: 1, padding: '6px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: scheduleType === t ? '1px solid var(--accent)' : '1px solid var(--border)', background: scheduleType === t ? 'rgba(76,139,240,0.15)' : 'var(--bg)', color: scheduleType === t ? 'var(--accent)' : 'var(--muted)' }}>
                {t === 'every' ? 'Repeat' : t === 'cron' ? 'Custom' : 'One-time'}
              </button>
            ))}
          </div>
          <input value={scheduleValue} onChange={e => setScheduleValue(e.target.value)} placeholder={schedPlaceholders[scheduleType]} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            {scheduleType === 'every' && 'e.g. 30m = every 30 minutes · 2h = every 2 hours · 1d = daily'}
            {scheduleType === 'cron' && 'Standard cron expression (minute hour dom month dow)'}
            {scheduleType === 'at' && 'ISO 8601 datetime with timezone offset'}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '5px' }}>Message to agent</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="What should the agent do? e.g. Send the weekly pipeline summary to the team" style={{ width: '100%', padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        {error && <div style={{ fontSize: '12px', color: '#da3633', background: 'rgba(218,54,51,0.08)', borderRadius: '6px', padding: '8px 10px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: saving ? 0.6 : 1 }}>
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CronsPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const supabase = createClient();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [orgId, setOrgId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, [orgSlug]);

  async function loadAll() {
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).single();
    if (!org) return;
    setOrgId(org.id);
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: pu } = await supabase.from('portal_users').select('role').eq('supabase_auth_id', authData.user.id).eq('org_id', org.id).single();
      if (pu) setCurrentUserRole(pu.role);
    }
    const { data: cronJobs } = await supabase.from('agent_cron_jobs').select('*').eq('org_id', org.id).order('agent_name').order('name');
    setJobs((cronJobs as CronJob[] ?? []).filter(j => !getJobInfo(j.name).isJunk));
    // Load agents with portal channels
    const { data: channels } = await supabase.from('portal_channels').select('agent_id').eq('org_id', org.id).eq('active', true);
    const agentIds = [...new Set((channels ?? []).map((c: any) => c.agent_id))];
    if (agentIds.length) {
      const { data: agentList } = await supabase.from('agents').select('id, name, display_name').in('id', agentIds);
      setAgents(agentList ?? []);
    }
    setLoading(false);
  }

  async function toggleCron(job: CronJob, action: 'enable' | 'disable') {
    const agent = agents.find(a => a.name === job.agent_name);
    if (!agent) return;
    setToggling(job.id);
    const res = await fetch(`/api/agents/${agent.id}/crons`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronId: job.id, action }),
    });
    if (res.ok) setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: action === 'enable' } : j));
    setToggling(null);
  }

  async function deleteCron(job: CronJob) {
    if (!confirm(`Delete "${getJobInfo(job.name).label}"?`)) return;
    const agent = agents.find(a => a.name === job.agent_name);
    if (!agent) return;
    await fetch(`/api/agents/${agent.id}/crons`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronId: job.id }),
    });
    setJobs(prev => prev.filter(j => j.id !== job.id));
  }

  const grouped = jobs.reduce<Record<string, CronJob[]>>((acc, job) => {
    const key = job.agent_name ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    const dup = acc[key].some(j => j.name === job.name && j.schedule_expr === job.schedule_expr && j.source === job.source);
    if (!dup) acc[key].push(job);
    return acc;
  }, {});

  const canManage = ['owner', 'admin'].includes(currentUserRole);

  return (
    <div className="page-scroll">
      {(showAdd || editingJob) && (
        <AddCronModal
          agents={agents}
          orgId={orgId}
          onClose={() => { setShowAdd(false); setEditingJob(null); }}
          onCreated={loadAll}
          editJob={editingJob}
        />
      )}

      <div style={{ padding: '28px 24px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>Automations</div>
          {canManage && (
            <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
              + New
            </button>
          )}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '28px' }}>Scheduled jobs running for each agent. Updates every 5 minutes.</div>

        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>No automations found.</div>
        ) : (
          Object.keys(grouped).sort().map(agentName => (
            <section key={agentName} style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                {agentName.charAt(0).toUpperCase() + agentName.slice(1)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {grouped[agentName].map(job => {
                  const { label, description } = getJobInfo(job.name);
                  const isExternal = job.source === 'host-crontab';
                  const isOpenClaw = job.source === 'openclaw-cron';
                  const hasError = (job.consecutive_errors ?? 0) > 0;
                  const lastRunText = formatLastRun(job.last_run_at_ms, job.source);
                  const statusColor = hasError ? '#da3633' : job.last_run_at_ms ? '#22c55e' : 'var(--muted)';

                  return (
                    <div key={job.id} style={{
                      background: 'var(--sidebar-bg)',
                      border: `1px solid ${hasError ? 'rgba(218,54,51,0.3)' : !job.enabled ? 'var(--border)' : 'var(--border)'}`,
                      borderRadius: '8px', padding: '14px 16px',
                      opacity: job.enabled === false ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                            {!job.enabled && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600 }}>DISABLED</span>}
                            {isExternal && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'var(--border)', color: 'var(--muted)', fontWeight: 600 }}>EXTERNAL</span>}
                          </div>
                          {description && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>{description}</div>}
                          <div style={{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text)' }}>🕐 {humanSchedule(job.schedule_expr)}</span>
                            <span style={{ fontSize: '12px', color: statusColor }}>
                              {hasError ? '⚠️' : isExternal ? '🔧' : '✓'} {lastRunText}
                              {hasError ? ` · ${job.consecutive_errors} error${(job.consecutive_errors ?? 0) > 1 ? 's' : ''}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Controls — only for openclaw-cron jobs */}
                        {canManage && isOpenClaw && (
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <button
                              onClick={() => toggleCron(job, job.enabled ? 'disable' : 'enable')}
                              disabled={toggling === job.id}
                              style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                            >
                              {toggling === job.id ? '…' : job.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => setEditingJob(job)}
                              style={{ padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteCron(job)}
                              style={{ padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: '#da3633', cursor: 'pointer', fontSize: '13px' }}
                              title="Delete"
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
            </section>
          ))
        )}
      </div>
    </div>
  );
}
