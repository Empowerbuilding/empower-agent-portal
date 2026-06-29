import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { subscription, userId } = await req.json();
  if (!subscription?.endpoint || !userId) {
    return NextResponse.json({ error: 'Missing subscription or userId' }, { status: 400 });
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
  await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
