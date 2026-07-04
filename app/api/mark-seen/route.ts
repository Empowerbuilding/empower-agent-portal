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

    const { data: portalUser } = await supabase
      .from('portal_users')
      .select('id')
      .eq('supabase_auth_id', user.id)
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
