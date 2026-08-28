import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Report whether the server has a push subscription for this device/user.
 * Auth: session cookie — only reports on the caller's own portal_users rows.
 * Body: { userId, endpoint } — endpoint optional (null = just count devices).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { endpoint } = await req.json();

    // All portal user ids belonging to the authenticated account
    const { data: portalUsers } = await admin
      .from('portal_users')
      .select('id')
      .eq('supabase_auth_id', user.id);
    if (!portalUsers || portalUsers.length === 0) {
      return NextResponse.json({ onServer: false, devices: 0 });
    }
    const ids = portalUsers.map((u: { id: string }) => u.id);

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint')
      .in('user_id', ids);

    const devices = subs?.length ?? 0;
    const onServer = endpoint
      ? !!subs?.some((s: { endpoint: string }) => s.endpoint === endpoint)
      : devices > 0;

    return NextResponse.json({ onServer, devices });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
