import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgent } from '@/lib/agent-router';
import { syncIntegrationToToolsMd, removeIntegrationFromToolsMd } from '@/lib/tools-md-writer';

export const runtime = 'nodejs';

async function authCheck(agentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const agent = await getAgent(agentId);
  if (!agent) return null;
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', agent.org_id)
    .single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) return null;
  return { agent, portalUser, supabase };
}

// GET — list all env vars for an agent (values masked for secrets)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vars } = await auth.supabase
    .from('agent_env_vars')
    .select('id, key, value, display_name, integration_id, is_secret, updated_at')
    .eq('agent_id', agentId)
    .order('integration_id');

  // Mask secret values — return last 4 chars only
  const masked = (vars ?? []).map((v: any) => ({
    ...v,
    value: v.is_secret && v.value ? `••••••••${v.value.slice(-4)}` : v.value,
  }));

  return NextResponse.json(masked);
}

// POST — save env vars for an integration
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { integrationId, vars } = await req.json();
  if (!integrationId || !vars || typeof vars !== 'object') {
    return NextResponse.json({ error: 'Missing integrationId or vars' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const upserts = Object.entries(vars as Record<string, string>)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([key, value]) => ({
      agent_id: agentId,
      key,
      value: value as string,
      display_name: key,
      integration_id: integrationId,
      is_secret: true,
      updated_at: now,
    }));

  if (upserts.length === 0) return NextResponse.json({ success: true, saved: 0 });

  const { error } = await auth.supabase
    .from('agent_env_vars')
    .upsert(upserts, { onConflict: 'agent_id,key' });

  if (error) {
    console.error('env-vars upsert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync to TOOLS.md in the agent's workspace (non-blocking — don't fail the request)
  try {
    await syncIntegrationToToolsMd(agentId, integrationId, vars as Record<string, string>);
  } catch (e) {
    console.warn('tools-md-writer sync failed (non-fatal):', e);
  }

  return NextResponse.json({ success: true, saved: upserts.length });
}

// DELETE — remove all vars for an integration
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { integrationId } = await req.json();
  if (!integrationId) return NextResponse.json({ error: 'Missing integrationId' }, { status: 400 });

  await auth.supabase
    .from('agent_env_vars')
    .delete()
    .eq('agent_id', agentId)
    .eq('integration_id', integrationId);

  // Remove section from TOOLS.md (non-blocking)
  try {
    await removeIntegrationFromToolsMd(agentId, integrationId);
  } catch (e) {
    console.warn('tools-md-writer remove failed (non-fatal):', e);
  }

  return NextResponse.json({ success: true });
}
