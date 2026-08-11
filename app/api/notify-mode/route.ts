import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const VALID_MODES = ['all', 'agents', 'humans', 'none'];

// GET /api/notify-mode?channelId=xxx — current user's notify mode for a channel
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const channelId = req.nextUrl.searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });

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

    const admin = createAdminClient();
    const { data: member } = await admin
      .from('portal_channel_members')
      .select('notify_mode')
      .eq('user_id', portalUser.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    // Missing row or null → legacy default 'agents'
    return NextResponse.json({ mode: member?.notify_mode || 'agents' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/notify-mode { channelId, mode } — set current user's notify mode for a channel
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId, mode } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'Missing channelId' }, { status: 400 });
    if (!VALID_MODES.includes(mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

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

    // Upsert — creates the member row if the user somehow lacks one for this channel
    const admin = createAdminClient();
    const { error } = await admin
      .from('portal_channel_members')
      .upsert(
        { user_id: portalUser.id, channel_id: channelId, notify_mode: mode },
        { onConflict: 'user_id,channel_id' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, mode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
