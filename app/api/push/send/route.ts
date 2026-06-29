import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  'mailto:mitchell@empowerbuilding.ai',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  // Verify webhook secret to prevent abuse
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const record = body.record;

  // Only notify on agent messages
  if (!record || record.sender_type !== 'agent') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const channelId = record.channel_id;
  const messagePreview = record.content?.slice(0, 120) || '';
  const senderName = record.sender_name || 'Vanessa';

  // Get channel info
  const { data: channel } = await supabase
    .from('portal_channels')
    .select('display_name, org_id')
    .eq('id', channelId)
    .single();

  if (!channel) return NextResponse.json({ ok: true, skipped: true });

  // Get org slug
  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', channel.org_id)
    .single();

  const channelUrl = org ? `/${org.slug}/${channelId}` : '/';
  const notifTitle = `${senderName} • #${channel.display_name}`;

  // Get all channel members
  const { data: members } = await supabase
    .from('portal_channel_members')
    .select('user_id')
    .eq('channel_id', channelId);

  if (!members || members.length === 0) return NextResponse.json({ ok: true });

  const userIds = members.map((m: any) => m.user_id);

  // Get their push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds);

  if (!subscriptions || subscriptions.length === 0) return NextResponse.json({ ok: true });

  const payload = JSON.stringify({
    title: notifTitle,
    body: messagePreview,
    channelUrl,
    channelId,
  });

  // Send to all subscribed devices, clean up expired ones
  const results = await Promise.allSettled(
    subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        // 410 Gone = subscription expired, remove it
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );

  return NextResponse.json({ ok: true, sent: results.length });
}
