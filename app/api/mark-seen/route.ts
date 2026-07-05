import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });

    // Look up org from channel so we can filter portal_users correctly
    // (user may belong to multiple orgs — .single() would fail without org filter)
    const { data: channel } = await supabase
      .from('portal_channels')
      .select('org_id')
      .eq('id', channelId)
      .single();
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id')
      .eq('supabase_auth_id', user.id)
      .eq('org_id', channel.org_id)
      .single();
    if (!portalUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    await supabase
      .from('portal_channel_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', portalUser.id)
      .eq('channel_id', channelId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
