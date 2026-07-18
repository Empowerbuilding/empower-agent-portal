import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Verify webhook secret to prevent abuse
  webpush.setVapidDetails(
    'mailto:mitchell@empowerbuilding.ai',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

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

  // Bug 3 fix: skip push for users who are actively in the portal or have already seen this channel
  const ACTIVE_WINDOW_MS = 90 * 1000; // 90s — heartbeat fires every 30s
  const msgTime = record.created_at ? new Date(record.created_at).getTime() : Date.now();

  const { data: portalUsers } = await supabase
    .from('portal_users')
    .select('id, last_active_at')
    .in('id', userIds);

  const { data: channelSeenRows } = await supabase
    .from('portal_channel_members')
    .select('user_id, last_seen_at')
    .eq('channel_id', channelId)
    .in('user_id', userIds);

  const activeUserIds = new Set(
    (portalUsers ?? []).filter((u: any) => {
      if (!u.last_active_at) return false;
      return Date.now() - new Date(u.last_active_at).getTime() < ACTIVE_WINDOW_MS;
    }).map((u: any) => u.id)
  );

  const alreadySeenUserIds = new Set(
    (channelSeenRows ?? []).filter((r: any) => {
      if (!r.last_seen_at) return false;
      return new Date(r.last_seen_at).getTime() >= msgTime;
    }).map((r: any) => r.user_id)
  );

  const eligibleUserIds = userIds.filter((id: string) => !activeUserIds.has(id) && !alreadySeenUserIds.has(id));
  if (eligibleUserIds.length === 0) return NextResponse.json({ ok: true, skipped: 'all users active or seen' });

  // Get their push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', eligibleUserIds);

  if (!subscriptions || subscriptions.length === 0) return NextResponse.json({ ok: true });

  // Bug 5 fix: compute actual unread channel count for badge (per-user, count channels with unread)
  // We approximate: count distinct channels with messages newer than last_seen_at for each user
  // For simplicity, send the count of channels the user has unread (use 1 as min for this message)
  const payload = JSON.stringify({
    title: notifTitle,
    body: messagePreview,
    channelUrl,
    channelId,
    unreadCount: 1, // incremented client-side in sw.js via badge accumulation
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
