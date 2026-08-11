import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Send a test push notification to the current user's own devices only.
 * Auth: Supabase session cookie — the target portal_users rows must belong
 * to the authenticated user, so this can't be used to push to anyone else.
 */
export async function POST() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // All portal user rows for this auth user (may span multiple orgs)
    const { data: portalUsers } = await admin
      .from('portal_users')
      .select('id')
      .eq('supabase_auth_id', user.id);
    if (!portalUsers || portalUsers.length === 0) {
      return NextResponse.json({ error: 'No portal user found' }, { status: 403 });
    }

    const userIds = portalUsers.map((u: { id: string }) => u.id);
    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ error: 'No push subscriptions found for your account. Toggle notifications off and on, then try again.' }, { status: 404 });
    }

    webpush.setVapidDetails(
      'mailto:mitchell@empowerbuilding.ai',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const payload = JSON.stringify({
      title: '🔔 Test notification',
      body: 'Push notifications are working on this device.',
      channelUrl: '/',
      unreadCount: 0,
    });

    let sent = 0;
    let expired = 0;
    await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          if (err.statusCode === 410) {
            expired++;
            await admin.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      })
    );

    return NextResponse.json({ ok: true, sent, expired, devices: subscriptions.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
