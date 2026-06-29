import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import ChatWindow from '@/components/chat/ChatWindow';
import FeedWindow from '@/components/feed/FeedWindow';
import ApprovalWindow from '@/components/approval/ApprovalWindow';
import { PortalChannel } from '@/lib/types';

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; channelId: string }>;
}) {
  const { orgSlug, channelId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify access
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single();
  if (!org) redirect('/login');

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, name, role')
    .eq('supabase_auth_id', user.id)
    .eq('org_id', org.id)
    .single();
  if (!portalUser) redirect('/login');

  // Check channel membership
  const { data: membership } = await supabase
    .from('portal_channel_members')
    .select('channel_id')
    .eq('channel_id', channelId)
    .eq('user_id', portalUser.id)
    .single();
  if (!membership) redirect(`/${orgSlug}`);

  // Get channel details
  const { data: channel } = await supabase
    .from('portal_channels')
    .select('*')
    .eq('id', channelId)
    .single();
  if (!channel) redirect(`/${orgSlug}`);

  // Load last 100 messages
  const { data: messages } = await supabase
    .from('portal_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(100);

  const ch = channel as PortalChannel;

  if (ch.channel_type === 'feed') {
    return <FeedWindow channel={ch} initialMessages={messages ?? []} />;
  }

  if (ch.channel_type === 'approval') {
    return (
      <ApprovalWindow
        channel={ch}
        initialMessages={messages ?? []}
        currentUser={{ id: portalUser.id, name: portalUser.name }}
        orgId={org.id}
      />
    );
  }

  return (
    <ChatWindow
      channel={ch}
      initialMessages={messages ?? []}
      currentUser={{ id: portalUser.id, name: portalUser.name, role: portalUser.role }}
      orgId={org.id}
    />
  );
}
