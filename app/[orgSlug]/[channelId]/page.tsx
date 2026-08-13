import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatWindow from '@/components/chat/ChatWindow';
import FeedWindow from '@/components/feed/FeedWindow';
import ApprovalWindow from '@/components/approval/ApprovalWindow';
import SmsWindow from '@/components/sms/SmsWindow';
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

  // Fetch agent separately using admin client (bypasses RLS, no FK join needed)
  const adminSupabase = createAdminClient();
  if (channel?.agent_id) {
    const { data: agent } = await adminSupabase
      .from('agents')
      .select('id, name, display_name')
      .eq('id', channel.agent_id)
      .single();
    if (agent) (channel as any).agents = agent;
  }
  if (!channel) redirect(`/${orgSlug}`);

  // Load last 100 messages (fetch newest-first, then reverse for chronological display)
  const { data: rawMessages } = await supabase
    .from('portal_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(100);
  const messages = (rawMessages ?? []).reverse();

  const ch = channel as PortalChannel;

  // Fetch member count server-side (admin client bypasses RLS)
  const { count: memberCount } = await adminSupabase
    .from('portal_channel_members')
    .select('*', { count: 'exact', head: true })
    .eq('channel_id', channelId);
  const initialMemberCount = memberCount ?? 0;

  if (ch.channel_type === 'sms') {
    return (
      <SmsWindow
        channel={ch}
        initialMessages={messages ?? []}
        currentUser={{ id: portalUser.id, name: portalUser.name, role: portalUser.role }}
        orgId={org.id}
        orgSlug={orgSlug}
      />
    );
  }

  if (ch.channel_type === 'feed') {
    return <FeedWindow key={ch.id} channel={ch} initialMessages={messages ?? []} orgId={org.id} initialMemberCount={initialMemberCount} />;
  }

  if (ch.channel_type === 'approval') {
    return (
      <ApprovalWindow
        key={ch.id}
        channel={ch}
        initialMessages={messages ?? []}
        currentUser={{ id: portalUser.id, name: portalUser.name }}
        orgId={org.id}
      />
    );
  }

  return (
    <ChatWindow
      key={ch.id}
      channel={ch}
      initialMessages={messages ?? []}
      currentUser={{ id: portalUser.id, name: portalUser.name, role: portalUser.role }}
      orgId={org.id}
      initialMemberCount={initialMemberCount}
    />
  );
}
