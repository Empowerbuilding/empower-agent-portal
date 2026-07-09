import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/members/channels?userId=xxx&orgId=xxx — get channel memberships for a user
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const orgId = searchParams.get('orgId');
  if (!userId || !orgId) return NextResponse.json({ error: 'Missing userId or orgId' }, { status: 400 });

  const { data: memberships } = await supabase
    .from('portal_channel_members')
    .select('channel_id')
    .eq('user_id', userId);

  return NextResponse.json(memberships?.map(m => m.channel_id) ?? []);
}

// POST /api/members/channels — toggle channel membership { userId, channelId, orgId, add: bool }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId, channelId, orgId, add } = await req.json();
  if (!userId || !channelId || !orgId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Verify requester is owner/admin of this org
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', orgId)
    .single();
  if (!portalUser || !['owner', 'admin'].includes(portalUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (add) {
    await supabase.from('portal_channel_members').upsert({ user_id: userId, channel_id: channelId }, { onConflict: 'user_id,channel_id', ignoreDuplicates: true });
  } else {
    await supabase.from('portal_channel_members').delete().eq('user_id', userId).eq('channel_id', channelId);
  }

  return NextResponse.json({ ok: true });
}
