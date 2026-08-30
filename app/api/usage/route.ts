import { NextRequest, NextResponse } from 'next/server';
import { requireOrgMemberBySlug } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

// S32 — per-org chat-turn usage rollup (DIRECTIONAL — not billing-grade).
// GET /api/usage?org=<slug>&days=7|30|90
//
// Data sources (all read-only):
//   - portal_messages  → agent messages ("chat turns") counted per day / agent / channel
//   - portal_context_stats → CURRENT context token snapshot per channel (not cumulative usage)
//
// No per-message token data exists in the portal DB, so we never estimate or
// fabricate cumulative token usage. Context tokens shown are point-in-time
// session snapshots only.

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const MAX_PAGES = 40; // hard cap: 40k rows per request window

interface DayCount { date: string; count: number }
interface AgentCount { agent: string; count: number }
interface ChannelCount {
  channelId: string;
  channelName: string;
  agent: string;
  count: number;
  ctxTokens: number | null;
  ctxPct: number | null;
  ctxUpdatedAt: string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get('org');
  const daysRaw = parseInt(searchParams.get('days') ?? '30', 10);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;

  const auth = await requireOrgMemberBySlug(orgSlug);
  if (!auth.ok) return auth.response;
  const orgId = auth.orgId!;

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Channel metadata for display names (org-scoped)
    const { data: channels } = await admin
      .from('portal_channels')
      .select('id, display_name')
      .eq('org_id', orgId);
    const channelNames = new Map<string, string>(
      (channels ?? []).map((c: { id: string; display_name: string | null }) => [c.id, c.display_name ?? c.id])
    );

    // Paginate agent messages (PostgREST aggregates are disabled on this project)
    type Row = { channel_id: string; sender_name: string | null; created_at: string };
    const rows: Row[] = [];
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await admin
        .from('portal_messages')
        .select('channel_id, sender_name, created_at')
        .eq('org_id', orgId)
        .eq('sender_type', 'agent')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    // Current context snapshot per channel (org-scoped via channel ids)
    const orgChannelIds = (channels ?? []).map((c: { id: string }) => c.id);
    const ctxByChannel = new Map<string, { tokens: number; pct: number | null; updated_at: string }>();
    if (orgChannelIds.length) {
      const { data: ctx } = await admin
        .from('portal_context_stats')
        .select('channel_id, tokens, pct, updated_at')
        .in('channel_id', orgChannelIds);
      for (const c of ctx ?? []) {
        ctxByChannel.set(c.channel_id, { tokens: c.tokens, pct: c.pct, updated_at: c.updated_at });
      }
    }

    // Aggregate in-process
    const byDayMap = new Map<string, number>();
    const byAgentMap = new Map<string, number>();
    const byChannelMap = new Map<string, { count: number; agent: string }>();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
      const agent = r.sender_name || 'Unknown';
      byAgentMap.set(agent, (byAgentMap.get(agent) ?? 0) + 1);
      const ch = byChannelMap.get(r.channel_id);
      if (ch) { ch.count++; }
      else byChannelMap.set(r.channel_id, { count: 1, agent });
    }

    const byDay: DayCount[] = [...byDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const byAgent: AgentCount[] = [...byAgentMap.entries()]
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count);
    const byChannel: ChannelCount[] = [...byChannelMap.entries()]
      .map(([channelId, v]) => {
        const ctx = ctxByChannel.get(channelId);
        return {
          channelId,
          channelName: channelNames.get(channelId) ?? channelId,
          agent: v.agent,
          count: v.count,
          ctxTokens: ctx?.tokens ?? null,
          ctxPct: ctx?.pct ?? null,
          ctxUpdatedAt: ctx?.updated_at ?? null,
        };
      })
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      directional: true,
      days,
      truncated,
      totalTurns: rows.length,
      activeChannels: byChannelMap.size,
      byDay,
      byAgent,
      byChannel,
      hasTokenData: ctxByChannel.size > 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
