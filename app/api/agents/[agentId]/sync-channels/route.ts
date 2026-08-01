import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAgent, agentReadFile, agentWriteFile, agentRestart } from '@/lib/agent-router';

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

  return { agent, portalUser };
}

// POST — sync agent's channelIds in openclaw.json to match portal_channels, then restart
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const auth = await authCheck(agentId);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent } = auth;

  try {
    // 1. Get all active channel IDs for this agent from Supabase
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: channels, error: chErr } = await service
      .from('portal_channels')
      .select('id')
      .eq('agent_id', agentId)
      .eq('active', true)
      .order('position');

    if (chErr) throw new Error(`Failed to fetch channels: ${chErr.message}`);
    const channelIds = (channels ?? []).map((c: { id: string }) => c.id);

    if (channelIds.length === 0) {
      return NextResponse.json({ error: 'No active channels found for this agent' }, { status: 400 });
    }

    // 2. Read current openclaw.json — local agent (Tony) has no server_host
    if (!agent.server_host) {
      return NextResponse.json({ error: 'Local agents cannot be synced remotely' }, { status: 400 });
    }

    const raw = await agentReadFile(agentId, 'openclaw.json');
    let config: any;
    try {
      config = JSON.parse(raw);
    } catch {
      // openclaw.json uses relaxed JSON in some versions — use eval-safe parse
      // eslint-disable-next-line no-new-func
      config = new Function('return (' + raw + ')')();
    }

    // 3. Update channelIds
    if (!config.channels) config.channels = {};
    if (!config.channels.portal) config.channels.portal = {};
    const previous = config.channels.portal.channelIds ?? [];
    config.channels.portal.channelIds = channelIds;

    // 4. Write back
    await agentWriteFile(agentId, 'openclaw.json', JSON.stringify(config, null, 2));

    // 5. Restart
    await agentRestart(agentId);

    return NextResponse.json({
      ok: true,
      channelIds,
      previous,
      added: channelIds.filter((id: string) => !previous.includes(id)),
      removed: previous.filter((id: string) => !channelIds.includes(id)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
