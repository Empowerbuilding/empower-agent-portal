import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { agentGetContextStats } from '@/lib/agent-router';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: portalUsers } = await supabase
      .from('portal_users')
      .select('id, org_id')
      .eq('supabase_auth_id', user.id)
      .order('created_at', { ascending: true });
    const portalUser = portalUsers?.[0] ?? null;
    if (!portalUser) return NextResponse.json({});

    const { data: channels } = await supabase
      .from('portal_channels')
      .select('id, agent_id')
      .eq('org_id', portalUser.org_id)
      .eq('active', true);
    if (!channels?.length) return NextResponse.json({});

    const agentIds = [...new Set(channels.map(c => c.agent_id).filter(Boolean))];

    // Fetch context stats for all agents in parallel
    const allStats: Record<string, { tokens: number; ctx: number; pct: number }> = {};
    await Promise.all(
      agentIds.map(async (agentId) => {
        const stats = await agentGetContextStats(agentId);
        Object.assign(allStats, stats);
      })
    );

    // Also pull stats for local agents (Tony) from portal_context_stats table
    // (local gateway pushes stats here after each message since we can't SSH in)
    const channelIds = channels.map(c => c.id);
    const { data: localStats } = await supabase
      .from('portal_context_stats')
      .select('channel_id, tokens, ctx, pct')
      .in('channel_id', channelIds);
    for (const row of localStats ?? []) {
      if (!allStats[row.channel_id]) {
        allStats[row.channel_id] = { tokens: row.tokens, ctx: row.ctx, pct: row.pct };
      }
    }

    return NextResponse.json(allStats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
