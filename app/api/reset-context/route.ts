import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAgentByChannel, agentResetContext } from '@/lib/agent-router';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });

    // Verify user has access to this channel
    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id, org_id, role')
      .eq('supabase_auth_id', user.id)
      .single();
    if (!portalUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { data: membership } = await supabase
      .from('portal_channel_members')
      .select('channel_id')
      .eq('channel_id', channelId)
      .eq('user_id', portalUser.id)
      .single();
    if (!membership) return NextResponse.json({ error: 'No access to channel' }, { status: 403 });

    // Look up the agent for this channel
    const agent = await getAgentByChannel(channelId);
    if (!agent) return NextResponse.json({ error: 'Agent not found for channel' }, { status: 404 });

    const success = await agentResetContext(agent.id, channelId);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Reset failed — agent may be unreachable' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('reset-context error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
