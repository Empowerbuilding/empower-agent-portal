import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent, agentDockerExec } from '@/lib/agent-router';

export const runtime = 'nodejs';

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

  // Build the schedule flag
  let scheduleFlag = '';
  if (scheduleType === 'every') scheduleFlag = `--every "${scheduleValue}"`;
  else if (scheduleType === 'cron') scheduleFlag = `--cron "${scheduleValue}"`;
  else if (scheduleType === 'at') scheduleFlag = `--at "${scheduleValue}"`;

  const targetFlag = sessionKey ? `--session-key "${sessionKey}"` : `--session isolated`;
  const cmd = `node /app/openclaw.mjs cron add --name "${name.replace(/"/g, '\\"')}" ${scheduleFlag} ${targetFlag} "${message.replace(/"/g, '\\"')}"`;

  try {
    const output = await agentDockerExec(agentId, cmd);
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

  try {
    await agentDockerExec(agentId, `node /app/openclaw.mjs cron ${action} ${cronId}`);
    // Update local DB cache
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

  try {
    await agentDockerExec(agentId, `node /app/openclaw.mjs cron rm ${cronId}`);
    await auth.supabase.from('agent_cron_jobs').delete().eq('id', cronId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
