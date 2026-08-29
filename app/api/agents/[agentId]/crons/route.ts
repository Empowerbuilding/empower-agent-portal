import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent, agentDockerExec } from '@/lib/agent-router';
import { shellQuote } from '@/lib/ssh';

export const runtime = 'nodejs';

// A cron id is either a scheduler UUID or a host-cron mirror handle.
// Anything else is rejected before it can reach a shell.
function isValidCronId(id: unknown): id is string {
  return typeof id === 'string' && /^(host-cron::)?[A-Za-z0-9_.:-]{1,128}$/.test(id);
}

// Schedule values are validated by shape per type; then still shell-quoted.
function validateSchedule(type: string, value: string): string | null {
  if (type === 'every') {
    // e.g. "5m", "1h", "30s", "1d" or a plain number (seconds)
    return /^\d{1,6}\s*(s|m|h|d)?$/.test(value.trim()) ? null : 'Invalid interval (e.g. 5m, 1h, 30s)';
  }
  if (type === 'cron') {
    // 5- or 6-field crontab expression: digits, * , / - and spaces only
    return /^[\d*,\/\- ]{1,100}$/.test(value.trim()) && value.trim().split(/\s+/).length >= 5
      ? null : 'Invalid cron expression';
  }
  if (type === 'at') {
    // ISO-ish datetime / time — conservative charset
    return /^[\dT:\-+ .Zapm]{1,40}$/i.test(value.trim()) ? null : 'Invalid time';
  }
  return 'Invalid scheduleType';
}

// agentDockerExec appends `|| true`, so failures surface only in output text — detect them.
function execFailed(output: string): string | null {
  const t = (output || '').trim();
  if (/error|not found|failed|cannot |no such container|invalid/i.test(t)) return t.slice(0, 300);
  return null;
}

async function authCheck(agentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const agent = await getAgent(agentId);
  if (!agent) return null;
  const { data: portalUser } = await supabase
    .from('portal_users').select('id, role').eq('supabase_auth_id', user.id).eq('org_id', agent.org_id).single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) return null;
  return { agent, portalUser, supabase };
}

// POST — create a new cron job
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, scheduleType, scheduleValue, message, sessionKey } = await req.json();
  if (!name || !scheduleType || !scheduleValue || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['every', 'cron', 'at'].includes(scheduleType)) {
    return NextResponse.json({ error: 'Invalid scheduleType' }, { status: 400 });
  }
  const schedErr = validateSchedule(scheduleType, String(scheduleValue));
  if (schedErr) return NextResponse.json({ error: schedErr }, { status: 400 });
  if (sessionKey !== undefined && sessionKey !== null && sessionKey !== '' &&
      !/^[A-Za-z0-9_.:@\/-]{1,200}$/.test(String(sessionKey))) {
    return NextResponse.json({ error: 'Invalid sessionKey' }, { status: 400 });
  }

  // Every interpolated value is shell-quoted (see lib/ssh.shellQuote) so no
  // form field can break out of the argument and execute host commands.
  const flagName = scheduleType === 'every' ? '--every' : scheduleType === 'cron' ? '--cron' : '--at';
  const scheduleFlag = `${flagName} ${shellQuote(String(scheduleValue).trim())}`;
  const targetFlag = sessionKey ? `--session-key ${shellQuote(String(sessionKey))}` : `--session isolated`;
  // Message must be passed via --message (current CLI rejects a positional payload).
  const cmd = `node /app/openclaw.mjs cron add --name ${shellQuote(String(name))} ${scheduleFlag} ${targetFlag} --message ${shellQuote(String(message))}`;

  try {
    const output = await agentDockerExec(agentId, cmd);
    const fail = execFailed(output);
    if (fail) return NextResponse.json({ error: `Cron create failed on agent: ${fail}` }, { status: 500 });
    return NextResponse.json({ success: true, output: output.trim() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — enable or disable a cron job
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { cronId, action } = await req.json(); // action: 'enable' | 'disable'
  if (!cronId || !['enable', 'disable'].includes(action)) {
    return NextResponse.json({ error: 'Missing cronId or invalid action' }, { status: 400 });
  }
  if (!isValidCronId(cronId)) {
    return NextResponse.json({ error: 'Invalid cronId' }, { status: 400 });
  }

  try {
    const output = await agentDockerExec(agentId, `node /app/openclaw.mjs cron ${action} ${shellQuote(cronId)}`);
    const fail = execFailed(output);
    if (fail) return NextResponse.json({ error: `Cron ${action} failed on agent: ${fail}` }, { status: 500 });
    // Update local DB cache only after the agent-side change succeeded
    await auth.supabase.from('agent_cron_jobs').update({ enabled: action === 'enable' }).eq('id', cronId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove a cron job
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { cronId } = await req.json();
  if (!cronId) return NextResponse.json({ error: 'Missing cronId' }, { status: 400 });
  if (!isValidCronId(cronId)) return NextResponse.json({ error: 'Invalid cronId' }, { status: 400 });

  try {
    const output = await agentDockerExec(agentId, `node /app/openclaw.mjs cron rm ${shellQuote(cronId)}`);
    const fail = execFailed(output);
    // Host-crontab mirror rows aren't in the agent scheduler — still allow removing the row.
    if (fail && !String(cronId).startsWith('host-cron::')) {
      return NextResponse.json({ error: `Cron delete failed on agent: ${fail}` }, { status: 500 });
    }
    await auth.supabase.from('agent_cron_jobs').delete().eq('id', cronId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
