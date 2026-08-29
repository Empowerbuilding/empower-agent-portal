import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// The userId in the body is a portal_users.id. Confirm it belongs to the
// logged-in auth user before writing/deleting a subscription for it — stops
// anon sub-hijack/DoS against arbitrary users.
async function ownsPortalUser(userId: string): Promise<boolean> {
  const server = await createServerClient();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('portal_users').select('id').eq('id', userId).eq('supabase_auth_id', user.id).maybeSingle();
  return !!data;
}

export async function POST(req: NextRequest) {
  const { subscription, userId } = await req.json();
  if (!subscription?.endpoint || !userId) {
    return NextResponse.json({ error: 'Missing subscription or userId' }, { status: 400 });
  }
  if (!(await ownsPortalUser(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }, { onConflict: 'user_id,endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint, userId } = await req.json();
  if (!endpoint || !userId) {
    return NextResponse.json({ error: 'Missing endpoint or userId' }, { status: 400 });
  }
  if (!(await ownsPortalUser(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
